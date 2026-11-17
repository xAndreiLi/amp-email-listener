/**
 * The mail half: one pass per account into the spool. The plugin calls it while Amp runs, and the
 * cursor is what makes the next start catch up on mail that arrived while Amp was off.
 */

import { createHash } from "node:crypto";
import type { AccountConfig } from "./config.ts";
import { graphSource } from "./graph.ts";
import { imapSource } from "./imap.ts";
import { accessTokenFor } from "./microsoft-auth.ts";
import { type MailSource, fixtureSource } from "./source.ts";
import { accountDir, readCursor, readIndex, storeMessage, writeCursor } from "./spool.ts";

const defaultLog = (line: string) => process.stdout.write(`${new Date().toISOString()} ${line}\n`);

export function sourceFor(account: AccountConfig): MailSource {
	switch (account.provider) {
		case "fixture":
			if (!account.dir) throw new Error(`account "${account.name}" is a fixture and needs a "dir"`);
			return fixtureSource(account.dir);
		case "graph":
			if (!account.clientId) {
				throw new Error(`account "${account.name}" needs a "clientId" from an Entra app registration to use provider graph`);
			}
			return graphSource(account.name, {
				mailbox: account.mailbox,
				folder: account.folder,
				since: account.since,
				accessToken: () => accessTokenFor(account.name),
			});
		case "imap": {
			if (!account.host || !account.user) {
				throw new Error(`account "${account.name}" needs a "host" and a "user" to use provider imap`);
			}
			const password = account.password ?? (account.passwordEnv ? process.env[account.passwordEnv] : undefined);
			if (!password) {
				throw new Error(
					`account "${account.name}" has no password — set "password", or "passwordEnv" naming an environment variable that holds it`,
				);
			}
			return imapSource(account.name, {
				host: account.host,
				port: account.port,
				user: account.user,
				password,
				mailbox: account.folder,
				since: account.since,
			});
		}
		default:
			throw new Error(
				`account "${account.name}" asks for provider "${account.provider}", which does not exist yet — available: fixture, graph, imap`,
			);
	}
}

/** One pass over an account: everything the cursor has not seen becomes a spool file. */
export async function syncAccount(
	account: AccountConfig,
	source = sourceFor(account),
	log = defaultLog,
): Promise<number> {
	accountDir(account.name);
	const known = new Set(readIndex(account.name).map((message) => message.id));
	const { envelopes, cursor } = await source.listNew(readCursor(account.name));
	let stored = 0;
	for (const envelope of envelopes) {
		if (known.has(envelope.id)) continue;
		const raw = await source.fetch(envelope.id);
		const message = storeMessage(
			account.name,
			{ ...envelope, account: account.name, file: safeName(envelope.id), bytes: Buffer.byteLength(raw) },
			raw,
		);
		known.add(envelope.id);
		stored++;
		log(
			`[${account.name}] stored ${message.receivedAt} · ${message.from.address} · ${message.subject || "(no subject)"} → ${message.file}`,
		);
	}
	// The cursor is the adapter's, so it is stored whatever shape it is in — including a cursor
	// that only moved because a page was consumed.
	if (Object.keys(cursor).length > 0) writeCursor(account.name, cursor);
	return stored;
}

/** The id is a provider's, so it has to become a file name without colliding or carrying a path. */
function safeName(id: string): string {
	const cleaned = id.replace(/[^A-Za-z0-9._-]/g, "-").replace(/\.eml$/i, "");
	if (cleaned.length <= 64) return `${cleaned || "message"}.eml`;
	// Message ids from one mailbox share a long prefix, so a sliced id would make every file in the
	// spool differ only by its collision suffix. The tail carries the identity instead.
	return `${cleaned.slice(0, 48)}-${createHash("sha1").update(id).digest("hex").slice(0, 8)}.eml`;
}

