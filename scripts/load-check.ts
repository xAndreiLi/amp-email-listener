/**
 * Layer 1: drive the Amp plugin against a stub host, a fixture mailbox and a real spool. No model,
 * no network, no Amp session.
 *
 *   npm run load-check
 *
 * This proves what the plugin would append to a thread and what it would block. It cannot prove
 * that Amp accepts the wake — that is what a real Amp session is for.
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
			const thread: FakeThread = {
				id: `T-${created}`,
				messages: [],
				appendUserMessage: async (message: { content: string }) => {
					thread.messages.push(message.content);
				},
			} as FakeThread;
			threads.set(thread.id, thread);
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
const watch = {
	id: "T-watch",
	messages: [] as string[],
	appendUserMessage: async (message: { content: string }) => {
		watch.messages.push(message.content);
		if (holdStart) {
			// Simulate a message queued behind a turn that is still running: the host will fire its
			// agent.start later, after the earlier turn's agent.end.
			heldMessage = message.content;
			holdStart = false;
			expectCareDuringAppend = false;
			return;
		}
		for (const handler of handlers.get("agent.start") ?? []) {
			await handler({ thread: { id: watch.id }, message: message.content, id: "m" }, ctx);
		}
		if (expectCareDuringAppend) {
			// The agent's first tool call can arrive as soon as the append starts the turn. The gate
			// must already be armed by then, not after appendUserMessage resolves.
			const verdict = (handlers.get("tool.call") ?? [])[0]?.(
				{ thread: { id: watch.id }, tool: "shell_command", input: {} },
				ctx,
			);
			blockedDuringAppend = verdict?.action === "reject-and-continue";
			expectCareDuringAppend = false;
		}
	},
} as FakeThread;
threads.set(watch.id, watch);
const ctx: any = { ui, thread: watch };

const plugin = (await import("../index.ts")).default;
plugin(amp as any);
const { syncAccount } = await import("../src/fetcher.ts");
const { readIndex } = await import("../src/spool.ts");

let failures = 0;
function check(what: string, ok: boolean) {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}
const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
async function fire(event: string, payload: any) {
	for (const handler of handlers.get(event) ?? []) await handler(payload, ctx);
}
const toolCall = (threadId: string, tool: string) =>
	(handlers.get("tool.call") ?? [])[0]?.({ thread: { id: threadId }, tool, input: {} }, ctx);

const account = { name: "test", provider: "fixture", dir: maildir };
function write(name: string, headers: string[], body: string) {
	writeFileSync(join(maildir, name), `${headers.join("\r\n")}\r\n\r\n${body}\r\n`);
}

// ---------------------------------------------------------------- opt-in

check("the plugin registers /email.watch", commands.has("email.watch"));
check("and /email.setup", commands.has("email.setup"));
check("and /email.service", commands.has("email.service"));
check("and the service controls", commands.has("email.service.start") && commands.has("email.service.stop"));

await commands.get("email.setup")!.handler(ctx);
check("setup cancels cleanly when the user dismisses it", notices.some((line) => line.includes("Setup cancelled")));

await commands.get("email.service")!.handler(ctx);
check("service status is reportable", notices.some((line) => line.includes("mail service") || line.includes("Mail service")));

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
check("the fetcher stores mail while nothing watches", (await syncAccount(account)) === 1);
await settle();
check("nothing is woken before the user asks for it", created === 0);

// ---------------------------------------------------------------- the wake

await commands.get("email.watch")!.handler(ctx);
check("the command reports that it started", notices.some((line) => line.includes("Watching mail")));
await settle();

check("the backlog wakes the agent once", watch.messages.length === 1 && created === 0);
check("the wake is one user message", watch.messages.length === 1);
check(
	"the pointer names the sender and the subject",
	watch.messages[0].includes("Dana Whitfield <dana@example.com>") && watch.messages[0].includes("Q3 rollout"),
);
check("the pointer does not carry the body", !watch.messages[0].includes("A short body"));
check("the pointer says which file to read", watch.messages[0].includes("a-example.com.eml"));
check("nothing is delivered twice", created === 0 && watch.messages.length === 1);
check("the spool still holds the message once", readIndex("test").length === 1);

write(
	"b.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: Fwd: invoice",
		"Date: Fri, 09 Oct 2026 15:00:00 +0200",
		"Message-ID: <b@example.com>",
	],
	"Please review https://example.com/invoice before Friday.",
);
expectCareDuringAppend = true;
check("the second message is stored", (await syncAccount(account)) === 1);
await settle();
check("every message wakes the agent, gate or no gate", watch.messages.length === 2);
check("mail stays in the thread /email.watch ran in", created === 0);
check("the gate is armed before the turn starts", blockedDuringAppend === true);

// ---------------------------------------------------------------- quarantine

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

holdStart = true;
expectCareDuringAppend = true;
write(
	"d.eml",
	[
		"From: Sam <sam@example.com>",
		"To: andrei@example.com",
		"Subject: another invoice",
		"Date: Fri, 09 Oct 2026 15:30:00 +0200",
		"Message-ID: <d@example.com>",
	],
	"Also review https://example.com/another before Monday.",
);
check("a third message is stored", (await syncAccount(account)) === 1);
await settle();
check("it is queued in the same thread", watch.messages.length === 3 && heldMessage !== undefined);
// The turn before it ends first; that must not clear the queued message's gate.
await fire("agent.end", { thread: { id: "T-watch" }, status: "done" });
await fire("agent.start", { thread: { id: "T-watch" }, message: heldMessage, id: "m" });
check(
	"a queued link stays gated after an earlier turn ends",
	(await toolCall("T-watch", "shell_command"))?.action === "reject-and-continue",
);
await fire("agent.end", { thread: { id: "T-watch" }, status: "done" });
check("and comes back when its own turn ends", (await toolCall("T-watch", "shell_command"))?.action === "allow");

// ---------------------------------------------------------------- stopping

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
check("the fetcher keeps storing while nothing watches", (await syncAccount(account)) === 1);
await settle();
check("no turn starts while watching is off", watch.messages.length === 3);

// ---------------------------------------------------------------- no chosen thread

ctx.thread = undefined;
await commands.get("email.watch")!.handler(ctx);
await settle();
check("with no thread chosen, mail starts one", created === 1);
const mailThread = threads.get("T-1")!;
check("and appends the waiting message there", mailThread.messages.length === 1);
const stopsBefore = notices.filter((line) => line.includes("Stopped watching")).length;
await commands.get("email.watch")!.handler(ctx);
check("watching stops again", notices.filter((line) => line.includes("Stopped watching")).length === stopsBefore + 1);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
