/**
 * Offline check for the IMAP source: a stubbed server, the real spool, the real fetcher.
 *
 *   npm run imap-check
 *
 * The stub is not imapflow — it is the old mailbox itself, answering the three things this source
 * asks of a server (search a UID range, fetch sources, hand over uidValidity). That keeps the check
 * offline while still exercising the parts that are ours: the cursor, the first pass, the reset when
 * uidValidity moves, and the promise that reading mail never changes it.
 */

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "amp-email-listener-imap-"));
mkdirSync(join(root, "mail"), { recursive: true });
process.env.AMP_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");

const { imapSource } = await import("../src/imap.ts");
const { syncAccount } = await import("../src/fetcher.ts");
const { readCursor, readIndex, writeCursor } = await import("../src/spool.ts");
const { originalSender } = await import("../src/source.ts");
const { pointer } = await import("../src/wake.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

const raw = (subject: string, from = "Dana Whitfield <dana@example.com>", extra: string[] = []) =>
	[
		`From: ${from}`,
		"To: agent@example.com",
		`Subject: ${subject}`,
		"Date: Fri, 09 Oct 2026 14:32:07 +0200",
		`Message-ID: <${subject.replace(/\W/g, "-")}@example.com>`,
		...extra,
		"",
		"Body of the message.",
	].join("\r\n");

/** The mailbox the source will read, with every call recorded so the check can assert on them. */
function stubServer(messages: { uid: number; source: string }[], uidValidity = 7n) {
	const calls: string[] = [];
	let loggedOut = false;
	const errorListeners: ((error: Error) => void)[] = [];
	const hidden = new Set<number>();
	let blind = false;
	const client = {
		failNext: 0,
		mailbox: { uidValidity, exists: messages.length },
		async connect() {
			calls.push("connect");
		},
		on(event: string, listener: (error: Error) => void) {
			calls.push(`on:${event}`);
			if (event === "error") errorListeners.push(listener);
		},
		async getMailboxLock(path: string) {
			calls.push(`lock:${path}`);
			return { release: () => calls.push("unlock") };
		},
		async search(query: Record<string, unknown>, _options: { uid: true }) {
			const range = String(query.uid ?? "");
			calls.push(`search:${range}`);
			if (blind) return [];
			const from = Number(range.split(":")[0]);
			// IMAP semantics: `n:*` always returns the highest message, even when it is below n.
			const found = messages.map((one) => one.uid).filter((uid) => uid >= from);
			return found.length ? found : [messages.at(-1)?.uid ?? 0];
		},
		async noop() {
			calls.push("noop");
		},
		async fetchAll(range: string, _query: unknown) {
			calls.push(`fetchAll:${range}`);
			if (client.failNext > 0) {
				client.failNext--;
				throw new Error("connection lost");
			}
			const from = Number(range.split(":")[0]);
			return messages.filter((one) => one.uid >= from).map((one) => ({ uid: one.uid, source: Buffer.from(one.source) }));
		},
		async fetchOne(seq: string, _query: unknown, _options: unknown) {
			calls.push(`fetchOne:${seq}`);
			if (hidden.has(Number(seq))) return false;
			const found = messages.find((one) => String(one.uid) === String(seq));
			return found ? { uid: found.uid, source: Buffer.from(found.source) } : false;
		},
		async logout() {
			loggedOut = true;
			calls.push("logout");
		},
		// Present so a call would be visible rather than a TypeError: reading must not mark anything.
		async messageFlagsAdd() {
			calls.push("MESSAGE_FLAGS_ADD");
			throw new Error("the source must never change a message's flags");
		},
		async messageDelete() {
			calls.push("MESSAGE_DELETE");
			throw new Error("the source must never delete a message");
		},
	};
	return {
		client,
		calls,
		loggedOut: () => loggedOut,
		emitError: (error: Error) => errorListeners.forEach((listener) => listener(error)),
		hide: (uid: number) => hidden.add(uid),
		unhide: (uid: number) => hidden.delete(uid),
		blind: () => {
			blind = true;
		},
	};
}

const account = { name: "agent", provider: "imap", host: "imap.example.com", user: "agent@example.com" };

// ---------------------------------------------------------------- first pass

const first = stubServer([
	{ uid: 1, source: raw("old news") },
	{ uid: 2, source: raw("Q3 rollout") },
]);
const source = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => first.client as never,
});

check("the first pass stores what is in the mailbox", (await syncAccount(account, source)) === 2);
check("and it opened the inbox", first.calls.some((call) => call === "lock:INBOX"));
check("the cursor keeps the uidValidity and the highest uid", readCursor("agent")?.uidValidity === "7" && readCursor("agent")?.lastUid === 2);
check("the mailbox was left alone", first.calls.every((call) => call !== "MESSAGE_FLAGS_ADD" && call !== "MESSAGE_DELETE"));

// ---------------------------------------------------------------- second pass, then a new arrival

check("a second pass stores nothing", (await syncAccount(account, source)) === 0);
check("and it asked from the uid after the last one", first.calls.filter((call) => call.startsWith("search:")).at(-1) === "search:3:*");
check(
	"the message the server re-offers for an empty range is not stored twice",
	readIndex("agent").length === 2,
);

first.client.mailbox = { uidValidity: 7n, exists: 3 };
first.calls.length = 0;
const second = stubServer([{ uid: 3, source: raw("Fresh arrival") }]);
const freshSource = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => second.client as never,
});
check("a message that arrives later is fetched by uid", (await syncAccount(account, freshSource)) === 1);
check("by asking for the source of that uid", second.calls.includes("fetchOne:3"));
check("and the cursor moves on", readCursor("agent")?.lastUid === 3);

// ---------------------------------------------------------------- uidValidity moved

const moved = stubServer([{ uid: 3, source: raw("After a rebuild") }], 9n);
const movedSource = imapSource("agent", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => moved.client as never,
});
await syncAccount(account, movedSource);
check("a changed uidValidity starts again rather than trusting stale uids", moved.calls.some((call) => call.startsWith("fetchAll:") || call.startsWith("search:1:*")));
check("and the new uidValidity is kept", readCursor("agent")?.uidValidity === "9");

// ---------------------------------------------------------------- a uid whose body is not ready yet

// A server can list a UID a moment before it will hand over the message. The cursor must not move
// past it, or the message is lost until the mailbox is reset.
const gap = stubServer([
	{ uid: 1, source: raw("Already read") },
	{ uid: 2, source: raw("Body not ready yet") },
]);
const gapSource = imapSource("gap", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => gap.client as never,
});
writeCursor("gap", { uidValidity: "7", lastUid: 1 });
gap.hide(2);
check("a uid the server will not hand over stores nothing", (await syncAccount({ ...account, name: "gap" }, gapSource)) === 0);
check("and the cursor stays before it", readCursor("gap")?.lastUid === 1);
gap.unhide(2);
check("the next pass retries it", (await syncAccount({ ...account, name: "gap" }, gapSource)) === 1);
check("and only then moves the cursor", readCursor("gap")?.lastUid === 2);

// ---------------------------------------------------------------- a fetch that comes back empty

// A connection can list a UID and then fail to hand it over. One retry on a fresh connection
// stores the message instead of leaving it for a later pass.
const emptyFirst = stubServer([
	{ uid: 1, source: raw("Already read") },
	{ uid: 2, source: raw("Second try") },
]);
const emptySecond = stubServer([
	{ uid: 1, source: raw("Already read") },
	{ uid: 2, source: raw("Second try") },
]);
emptyFirst.hide(2);
let connects = 0;
const retrySource = imapSource("retry", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => (connects++ === 0 ? emptyFirst.client : emptySecond.client) as never,
});
writeCursor("retry", { uidValidity: "7", lastUid: 1 });
check("a UID that is listed but not handed over is retried on a fresh connection", (await syncAccount({ ...account, name: "retry" }, retrySource)) === 1);
check("which took two connections", connects === 2);
check("and the dead connection was logged out", emptyFirst.loggedOut());
check("the cursor moves once the message is stored", readCursor("retry")?.lastUid === 2);

// ---------------------------------------------------------------- a connection that stops seeing new mail

// A long-lived connection can keep answering while its view goes stale. The mailbox count is
// ahead of the cursor, so the pass reconnects and retries instead of reporting no mail.
const blindFirst = stubServer([
	{ uid: 1, source: raw("Already read") },
	{ uid: 2, source: raw("Hidden by a stale view") },
]);
const blindSecond = stubServer([
	{ uid: 1, source: raw("Already read") },
	{ uid: 2, source: raw("Hidden by a stale view") },
]);
blindFirst.blind();
let blindConnects = 0;
const blindSource = imapSource("blind", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => (blindConnects++ === 0 ? blindFirst.client : blindSecond.client) as never,
});
writeCursor("blind", { uidValidity: "7", lastUid: 1 });
check("a search that sees nothing while the mailbox reports more is retried", (await syncAccount({ ...account, name: "blind" }, blindSource)) === 1);
check("which took two connections", blindConnects === 2);
check("and the cursor moves once the message is stored", readCursor("blind")?.lastUid === 2);

// ---------------------------------------------------------------- reading a forwarded message

const forwarded = [
	raw("Fwd: Invoice 2201", "Andrei Li <andrei@example.com>"),
	"",
	"---------- Forwarded message ----------",
	"From: Billing <billing@vendor.example>",
	"Date: Thu, 08 Oct 2026 09:00:00 +0200",
	"Subject: Invoice 2201",
	"",
	"Please pay.",
].join("\r\n");
const envelope = { ...readIndex("agent")[0], from: { name: "Andrei Li", address: "andrei@example.com" }, subject: "Fwd: Invoice 2201" };
const original = originalSender(forwarded, envelope as never);
check("a forwarded message gives up its real author", original?.address === "billing@vendor.example");
check("and the pointer says so", pointer("agent", envelope as never, forwarded).includes("originally from"));
check("a plain message claims no forwarding", originalSender(raw("Plain"), { ...envelope, subject: "Plain" } as never) === undefined);

// ---------------------------------------------------------------- the connection is ours to close

// A dead connection must not be kept: the next pass has to reconnect rather than fail forever.
const flaky = stubServer([{ uid: 1, source: raw("After a reconnect") }]);
const flakySource = imapSource("flaky", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => flaky.client as never,
});
flaky.client.failNext = 1;
let surfaced = false;
try {
	await syncAccount({ ...account, name: "flaky" }, flakySource);
} catch {
	surfaced = true;
}
check("a dropped connection surfaces as an error rather than silence", surfaced);
check("the dead client is dropped", flaky.calls.filter((call) => call === "connect").length === 1);
check("and the next pass connects again", (await syncAccount({ ...account, name: "flaky" }, flakySource)) === 1);
check("which is the second connect", flaky.calls.filter((call) => call === "connect").length === 2);

// ---------------------------------------------------------------- a connection that dies between passes

// A socket can fail while no command is in flight, and that arrives as an event. It must not crash
// the process, and the dead client must not be handed to the next pass.
const died = stubServer([{ uid: 1, source: raw("After an idle drop") }]);
const diedSource = imapSource("died", {
	host: "imap.example.com",
	user: "agent@example.com",
	password: "app-password",
	connect: () => died.client as never,
});
check("a first pass stores the message", (await syncAccount({ ...account, name: "died" }, diedSource)) === 1);
check("and listens for a connection that dies while idle", died.calls.includes("on:error"));
died.emitError(new Error("socket closed"));
check("the next pass stores nothing new", (await syncAccount({ ...account, name: "died" }, diedSource)) === 0);
check("and it reconnects instead of reusing the dead socket", died.calls.filter((call) => call === "connect").length === 2);

await source.close();
check("closing the source logs out", first.loggedOut());

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
