/**
 * Single-file install check: copy the built plugin into a directory with no node_modules, load it
 * with Bun, and drive a fixture mailbox through a stub Amp host.
 *
 * A checkout test cannot see this shape. The installed artifact is one file, so a missing import or
 * a dependency left external only shows up when that file runs alone. Run it before a tag publishes:
 *
 *   npm run build
 *   npm run install-check
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUN = process.platform === "win32" ? "bun.exe" : "bun";
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(repo, "dist", "amp-email-listener.js");
const root = mkdtempSync(join(tmpdir(), "amp-email-listener-install-"));

let failures = 0;
function check(what: string, ok: boolean): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

const fixture = [
	"From: Dana Whitfield <dana@example.com>",
	"To: agent@example.com",
	"Subject: Install check",
	"Date: Fri, 09 Oct 2026 14:32:07 +0200",
	"Message-ID: <install-check@example.com>",
	"",
	"Body of the message.",
	"",
].join("\r\n");

const driver = `
const commands = [];
const threads = new Map();
const messages = [];
let active = null;
let created = 0;
function makeThread(id) {
	const thread = {
		id,
		appendUserMessage: async (message) => { messages.push(message.content); },
	};
	threads.set(id, thread);
	return thread;
}
const amp = {
	logger: { log: () => {} },
	registerCommand: (id) => { commands.push(id); return { unsubscribe() {}, setAvailability() {} }; },
	on: () => ({ unsubscribe() {} }),
	onDispose: () => ({ unsubscribe() {} }),
	activeThread: { get current() { return active; } },
	threads: {
		get: (id) => {
			const thread = threads.get(id);
			if (!thread) throw new Error("no thread " + id);
			return thread;
		},
	},
	getBuiltinAgent: () => ({
		createThread: async () => {
			created++;
			const thread = makeThread("T-" + created);
			active = { id: thread.id };
			return thread;
		},
	}),
};
const plugin = (await import(new URL("./amp-email-listener.js", import.meta.url).href)).default;
plugin(amp);
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(JSON.stringify({ commands: commands.length, created, messages }));
process.exit(0);
`;

try {
	if (!existsSync(bundle)) {
		console.error("FAIL dist/amp-email-listener.js is missing — run `npm run build` first");
		process.exit(1);
	}

	// The installed shape: the plugin file alone, no node_modules, no package.json.
	const isolated = join(root, "plugin");
	mkdirSync(isolated);
	copyFileSync(bundle, join(isolated, "amp-email-listener.js"));
	writeFileSync(join(isolated, "driver.mjs"), driver);

	const fixtures = join(root, "fixtures");
	mkdirSync(fixtures);
	writeFileSync(join(fixtures, "install-check.eml"), fixture);

	const config = join(root, "amp-email-listener.json");
	writeFileSync(
		config,
		`${JSON.stringify({ accounts: [{ name: "agent", provider: "fixture", dir: fixtures }], pollSeconds: 5 }, null, "\t")}\n`,
	);
	const output = execFileSync(BUN, ["driver.mjs"], {
		cwd: isolated,
		encoding: "utf8",
		env: {
			...process.env,
			AMP_EMAIL_LISTENER_CONFIG: config,
			AMP_EMAIL_LISTENER_MAIL_DIR: join(root, "mail"),
			AMP_EMAIL_LISTENER_POLL_MS: "20",
		},
	});
	const result = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? "{}") as {
		commands?: number;
		created?: number;
		messages?: string[];
	};
	const messages = result.messages ?? [];
	check("the single file loads with no node_modules", (result.commands ?? 0) >= 2);
	check("the first pass fetches the fixture", result.created === 1);
	check("and appends the pointer", messages.length === 1 && messages[0].includes("Install check"));
	check("the pointer does not carry the body", !messages[0]?.includes("Body of the message"));
} catch (error) {
	failures++;
	const failure = error as { message?: string; stdout?: string; stderr?: string };
	console.error(`FAIL ${failure.message ?? error}`);
	if (failure.stdout) console.error(failure.stdout);
	if (failure.stderr) console.error(failure.stderr);
} finally {
	rmSync(root, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log("\nall checks passed");
