/**
 * IMAP against a mailbox the agent owns — the front door.
 *
 * The user's provider stops mattering here: whatever they cc or forward from arrives as mail in this
 * one mailbox, so a single adapter covers Outlook, Google, Fastmail, Proton Bridge and every other
 * host, and nobody has to register an application or ask an administrator for anything.
 *
 * Three rules this file keeps:
 *   - it never marks a message read (no `\Seen` is ever set, so the mailbox looks untouched)
 *   - it never deletes anything
 *   - it never moves a message
 *
 * The cursor is the mailbox's `uidValidity` plus the highest UID delivered. If `uidValidity` changes,
 * every UID the cursor holds is meaningless and the source starts again — which is why the value is
 * kept rather than just the number.
 */

import { ImapFlow } from "imapflow";
import { type Cursor, type Envelope, type MailSource, envelopeOf } from "./source.ts";

/** The subset of ImapFlow this source uses, so a test can supply its own. */
export interface ImapClient {
	connect(): Promise<void>;
	getMailboxLock(path: string): Promise<{ release(): void }>;
	mailbox?: { uidValidity: bigint; exists: number } | undefined;
	search(query: Record<string, unknown>, options: { uid: true }): Promise<number[] | false | undefined>;
	fetchAll(range: string, query: { uid: true; source: true }): Promise<{ uid: number; source?: Buffer }[]>;
	fetchOne(seq: string, query: { uid: true; source: true }, options: { uid: true }): Promise<{ uid: number; source?: Buffer } | false | undefined>;
	logout(): Promise<void>;
	/** Drop the socket without waiting for a server goodbye. */
	close?(): void;
	/** A connection that dies between commands reports it here, not through a pending call. */
	on?(event: "error", listener: (error: Error) => void): void;
}

export interface ImapOptions {
	host: string;
	port?: number;
	user: string;
	password: string;
	mailbox?: string;
	/** Where a first sync starts. Without it, the first pass takes the newest messages only. */
	since?: string;
	/** Injected by the check; the real thing is ImapFlow. */
	connect?: (options: ImapOptions) => ImapClient;
}

/** A mailbox belongs to a person, not to us: on a first run, take the newest, never the lot. */
const FIRST_PASS_MESSAGES = 50;

/** A UID the server listed but would not hand over; worth one retry on a fresh connection. */
class RetryOnFreshConnection extends Error {}

interface CursorShape {
	uidValidity?: string;
	lastUid?: number;
}

/**
 * Does this login actually work? Used by the setup wizard, which should fail in front of the person
 * typing rather than the first time the plugin polls.
 */
export async function verifyImap(options: ImapOptions): Promise<{ messages: number }> {
	const source = imapSource("verify", options);
	try {
		return await source.count();
	} finally {
		await source.close();
	}
}

export function imapSource(account: string, options: ImapOptions): MailSource & { count(): Promise<{ messages: number }> } {
	let client: ImapClient | undefined;
	/** Sources fetched during a pass and not yet asked for by id. */
	const held = new Map<string, string>();
	const doConnect =
		options.connect ??
		(({ host, port, user, password }: ImapOptions) =>
			new ImapFlow({
				host,
				port: port ?? 993,
				secure: true,
				auth: { user, pass: password },
				logger: false,
				// A poller cannot wait out the defaults: a dead socket takes five minutes to notice,
				// and until it does the account's pass lock is held and every other poll skips the
				// mailbox. One minute is twice the poll interval and long enough for a real fetch.
				socketTimeout: 60_000,
				connectionTimeout: 30_000,
				greetingTimeout: 15_000,
			}) as unknown as ImapClient);

	async function connected(): Promise<ImapClient> {
		if (client) return client;
		const fresh = doConnect(options);
		await fresh.connect();
		client = fresh;
		// A connection can die while no command is in flight, and that surfaces as an event. Without
		// a listener the process would take the error as uncaught; without dropping the client the
		// next pass would reuse a dead socket and stall again.
		fresh.on?.("error", () => {
			if (client === fresh) client = undefined;
			try {
				fresh.close?.();
			} catch {
				// Already closed by the failure.
			}
		});
		return fresh;
	}

	async function withMailbox<T>(work: (imap: ImapClient, retried: boolean) => Promise<T>, retried = false): Promise<T> {
		const imap = await connected();
		const lock = await imap.getMailboxLock(options.mailbox ?? "INBOX");
		let failure: unknown;
		try {
			return await work(imap, retried);
		} catch (error) {
			failure = error;
			// A dropped connection looks like any other failure from here, and keeping the dead client
			// would fail every later pass until the process restarted. Drop it so the next pass
			// reconnects, and let the caller see what happened.
			if (client === imap) client = undefined;
			try {
				// A broken socket cannot wait for a server goodbye; drop it now.
				if (imap.close) imap.close();
				else void imap.logout().catch(() => {});
			} catch {
				// The connection is already gone.
			}
		} finally {
			try {
				lock.release();
			} catch {
				// The connection is gone; there is nothing left to release.
			}
		}
		// A connection can answer a search and then fail to hand over the message it just listed.
		// Retry once on a fresh connection before leaving the UID for the next pass.
		if (failure instanceof RetryOnFreshConnection && !retried) {
			return withMailbox(work, true);
		}
		throw failure;
	}

	return {
		async listNew(cursor: Cursor | undefined) {
			return withMailbox(async (imap, retried) => {
				const uidValidity = String(imap.mailbox?.uidValidity ?? "");
				const highest = Number(imap.mailbox?.exists ?? 0);
				const previous = cursor as CursorShape | undefined;
				const resuming = previous?.uidValidity === uidValidity && typeof previous.lastUid === "number";

				let uids: number[];
				if (resuming) {
					const found = (await imap.search({ uid: `${(previous.lastUid as number) + 1}:*` }, { uid: true })) || [];
					// `n:*` includes the highest message even when it is below n, so it comes back out.
					uids = found.filter((uid) => uid > (previous.lastUid as number));
				} else if (options.since) {
					const found = (await imap.search({ since: new Date(options.since), uid: "1:*" }, { uid: true })) || [];
					uids = found.filter((uid) => uid > 0);
				} else {
					const from = Math.max(1, highest - FIRST_PASS_MESSAGES + 1);
					const recent = await imap.fetchAll(`${from}:*`, { uid: true, source: true });
					uids = recent.map((message) => message.uid);
					for (const message of recent) {
						if (message.source) held.set(String(message.uid), message.source.toString("utf8"));
					}
				}

				const envelopes: Envelope[] = [];
				// Only a contiguous run of readable messages may move the cursor. A UID the server
				// lists but will not hand over yet is left for the next pass instead of being
				// skipped forever.
				let cursorUid = previous?.lastUid ?? 0;
				let gap = false;
				for (const uid of uids) {
					const cached = held.get(String(uid));
					if (cached) {
						envelopes.push({ ...envelopeOf(cached), id: String(uid) });
						if (!gap) cursorUid = uid;
						continue;
					}
					const message = await imap.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
					if (!message?.source) {
						if (!retried) throw new RetryOnFreshConnection(`uid ${uid} was listed but not handed over`);
						gap = true;
						continue;
					}
					const raw = message.source.toString("utf8");
					held.set(String(uid), raw);
					envelopes.push({ ...envelopeOf(raw), id: String(uid) });
					if (!gap) cursorUid = uid;
				}

				return {
					envelopes,
					cursor: {
						uidValidity,
						lastUid: cursorUid,
						account,
						mailbox: options.mailbox ?? "INBOX",
					} satisfies Cursor,
				};
			});
		},

		async fetch(id: string) {
			const cached = held.get(id);
			if (cached) {
				held.delete(id);
				return cached;
			}
			const message = await withMailbox((imap) => imap.fetchOne(id, { uid: true, source: true }, { uid: true }));
			if (!message?.source) throw new Error(`no IMAP message with uid ${id} in ${options.mailbox ?? "INBOX"}`);
			return message.source.toString("utf8");
		},

		async close() {
			const open = client;
			client = undefined;
			held.clear();
			if (open) await open.logout().catch(() => {});
		},

		/** One look at the mailbox, for setup: proves the host, the user and the password together. */
		async count() {
			return withMailbox(async (imap) => ({ messages: Number(imap.mailbox?.exists ?? 0) }));
		},
	};
}
