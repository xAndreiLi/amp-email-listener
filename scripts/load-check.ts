/**
 * Layer 1: drive the Amp plugin against a stub host, a fixture mailbox and a real spool. No model,
 * no network, no Amp session.
 *
 *   npm run load-check
 *
 * It proves that the first pass after the plugin loads fetches the backlog, that mail wakes the
 * thread the user chose, and what the quarantine blocks. It cannot prove that Amp accepts the wake.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "amp-email-listener-load-"));
const maildir = join(root, "fixtures");
mkdirSync(maildir);
process.env.AMP_EMAIL_LISTENER_MAIL_DIR = join(root, "mail");
process.env.AMP_EMAIL_LISTENER_CONFIG = join(root, "amp-email-listener.json");
process.env.AMP_EMAIL_LISTENER_POLL_MS = "20";
writeFileSync(
	process.env.AMP_EMAIL_LISTENER_CONFIG,
	JSON.stringify({ accounts: [{ name: "test", provider: "fixture", dir: maildir }], pollSeconds: 5 }),
);

interface FakeThread {
	id: string;
	messages: string[];
	appendUserMessage(message: { content: string }): Promise<void>;
}

const commands = new Map<string, { options: any; handler: (ctx: any) => Promise<void> }>();
const handlers = new Map<string, any[]>();
const threads = new Map<string, FakeThread>();
const notices: string[] = [];
const logs: string[] = [];
let active: { id: string } | null = null;
let created = 0;
let expectCareDuringAppend = false;
let blockedDuringAppend: boolean | undefined;
let holdStart = false;
let heldMessage: string | undefined;

function makeThread(id: string): FakeThread {
	const thread: FakeThread = {
		id,
		messages: [],
		appendUserMessage: async (message: { content: string }) => {
			thread.messages.push(message.content);
			if (holdStart) {
				// Simulate a message queued behind a turn that is still running: the host will fire its
				// agent.start later, after the earlier turn's agent.end.
				heldMessage = message.content;
				holdStart = false;
				expectCareDuringAppend = false;
				return;
			}
			for (const handler of handlers.get("agent.start") ?? []) {
				await handler({ thread: { id }, message: message.content, id: "m" }, ctx);
			}
			if (expectCareDuringAppend) {
				// The agent's first tool call can arrive as soon as the append starts the turn. The
				// gate must already be armed by then, not after appendUserMessage resolves.
				const verdict = (handlers.get("tool.call") ?? [])[0]?.(
					{ thread: { id }, tool: "shell_command", input: {} },
					ctx,
				);
				blockedDuringAppend = verdict?.action === "reject-and-continue";
				expectCareDuringAppend = false;
			}
		},
	};
	threads.set(id, thread);
	return thread;
}

const amp = {
	logger: { log: (message: string) => logs.push(message) },
	registerCommand: (id: string, options: any, handler: (ctx: any) => Promise<void>) => {
		commands.set(id, { options, handler });
		return { unsubscribe() {}, setAvailability() {} };
	},
	on: (event: string, handler: any) => {
		handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		return { unsubscribe() {} };
	},
	onDispose: () => ({ unsubscribe() {} }),
	activeThread: {
		get current() {
			return active;
		},
	},
	threads: {
		get: (id: string) => {
			const thread = threads.get(id);
			if (!thread) throw new Error(`no thread ${id}`);
			return thread;
		},
	},
	getBuiltinAgent: () => ({
		createThread: async () => {
			created++;
			const thread = makeThread(`T-${created}`);
			active = { id: thread.id };
			return thread;
		},
	}),
};

const ui = {
	notify: async (message: string) => {
		notices.push(message);
	},
	input: async () => undefined,
	confirm: async () => false,
	select: async () => undefined,
};
const ctx: any = { ui, thread: undefined };

const account = { name: "test", provider: "fixture", dir: maildir };
function write(name: string, headers: string[], body: string) {
	writeFileSync(join(maildir, name), `${headers.join("\r\n")}\r\n\r\n${body}\r\n`);
}

// Mail that arrived while Amp was off, before the plugin loads.
write(
	"a.eml",
	[
		"From: Dana Whitfield <dana@example.com>",
		"To: andrei@example.com",
		"Subject: Q3 rollout",
		"Date: Fri, 09 Oct 2026 14:32:07 +0200",
		"Message-ID: <a@example.com>",
	],
	"A short body with no links in it.",
);
write(
	"b.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: yesterday",
		"Date: Fri, 09 Oct 2026 15:00:00 +0200",
		"Message-ID: <b@example.com>",
	],
	"Another short body.",
);

const plugin = (await import("../index.ts")).default;
plugin(amp as any);

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
async function fire(event: string, payload: any) {
	for (const handler of handlers.get(event) ?? []) await handler(payload, ctx);
}
const toolCall = (threadId: string, tool: string) =>
	(handlers.get("tool.call") ?? [])[0]?.({ thread: { id: threadId }, tool, input: {} }, ctx);

// ---------------------------------------------------------------- the backlog on load

await settle(400);
check("the plugin auto-starts when a mailbox is configured", logs.some((line) => line.includes("Watching mail")));
check("the first pass fetches the backlog", created === 1 && threads.get("T-1")?.messages.length === 2);
const first = threads.get("T-1")!;
check(
	"the pointers name the sender and the subject",
	first.messages[0].includes("Dana Whitfield <dana@example.com>") &&
		first.messages[0].includes("Q3 rollout") &&
		first.messages[1].includes("yesterday"),
);
check("the pointers do not carry the body", !first.messages[0].includes("A short body"));
check("the pointer says which file to read", first.messages[0].includes("a-example.com.eml"));
await settle();
check("a later pass does not fetch the same mail again", first.messages.length === 2 && created === 1);

await commands.get("email.setup")!.handler(ctx);
check("setup cancels cleanly when the user dismisses it", notices.some((line) => line.includes("Setup cancelled")));

// ---------------------------------------------------------------- stopping and catching up

await commands.get("email.watch")!.handler(ctx);
check("the command stops watching", notices.some((line) => line.includes("Stopped watching")));
write(
	"c.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: after hours",
		"Date: Fri, 09 Oct 2026 16:00:00 +0200",
		"Message-ID: <c@example.com>",
	],
	"Nobody is watching now.",
);
await settle();
check("nothing is fetched while watching is off", first.messages.length === 2);

const watch = makeThread("T-watch");
ctx.thread = watch;
await commands.get("email.watch")!.handler(ctx);
await settle(300);
check("restarting fetches the mail that arrived while it was off", watch.messages.length === 1);
check("and the old backlog is not delivered again", first.messages.length === 2);
check("mail goes to the thread /email.watch ran in", watch.messages[0].includes("after hours"));

// ---------------------------------------------------------------- quarantine

expectCareDuringAppend = true;
write(
	"d.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: Fwd: invoice",
		"Date: Fri, 09 Oct 2026 17:00:00 +0200",
		"Message-ID: <d@example.com>",
	],
	"Please review https://example.com/invoice before Friday.",
);
await settle(300);
check("the link message is delivered", watch.messages.length === 2);
check("the gate is armed before the turn starts", blockedDuringAppend === true);
check("a message with a link blocks the shell", (await toolCall("T-watch", "shell_command"))?.action === "reject-and-continue");
check("it blocks editing too", (await toolCall("T-watch", "edit_file"))?.action === "reject-and-continue");
check("reading is still allowed", (await toolCall("T-watch", "read_file"))?.action === "allow");
check(
	"the refusal explains itself",
	String((await toolCall("T-watch", "shell_command"))?.message).includes("let the user decide"),
);

await fire("agent.end", { thread: { id: "T-watch" }, status: "done" });
check("the tools come back when the turn ends", (await toolCall("T-watch", "shell_command"))?.action === "allow");

// ---------------------------------------------------------------- queued behind a turn

await commands.get("email.watch")!.handler(ctx);
holdStart = true;
expectCareDuringAppend = true;
write(
	"e.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: another invoice",
		"Date: Fri, 09 Oct 2026 18:00:00 +0200",
		"Message-ID: <e@example.com>",
	],
	"Also review https://example.com/another before Monday.",
);
await commands.get("email.watch")!.handler(ctx);
await settle(300);
check("the queued message is delivered", watch.messages.length === 3 && heldMessage !== undefined);
// The turn before it ends first; that must not clear the queued message's gate.
await fire("agent.end", { thread: { id: "T-watch" }, status: "done" });
await fire("agent.start", { thread: { id: "T-watch" }, message: heldMessage, id: "m" });
check(
	"a queued link stays gated after an earlier turn ends",
	(await toolCall("T-watch", "shell_command"))?.action === "reject-and-continue",
);
await fire("agent.end", { thread: { id: "T-watch" }, status: "done" });
check("and comes back when its own turn ends", (await toolCall("T-watch", "shell_command"))?.action === "allow");

await commands.get("email.watch")!.handler(ctx);
check("watching stops again", notices.filter((line) => line.includes("Stopped watching")).length === 3);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
