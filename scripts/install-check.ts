/**
 * Publish-shape check: pack the tarball, install it into a throwaway project that has no pi peer,
 * and run the installed fetcher over a fixture mailbox.
 *
 * A checkout test cannot see this shape. Only an installed copy sits under node_modules, where
 * Node refuses to strip TypeScript and pi's packages are not resolvable — the two things that once
 * stopped an npm-installed fetcher from starting. Run it before a tag publishes:
 *
 *   npm run install-check
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = mkdtempSync(join(tmpdir(), "pi-email-listener-install-"));
const packageName = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { name: string }).name;

let failures = 0;
function check(what: string, ok: boolean): void {
	console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
	if (!ok) failures++;
}

/** npm is npm.cmd on Windows, which Node only spawns through a shell. */
function npm(args: string[], cwd: string): string {
	return execFileSync(NPM, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...(process.platform === "win32" ? { shell: true } : {}),
	});
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

try {
	// Pack from a directory of its own, so the tarball's name is the only thing npm prints.
	const packDir = join(root, "pack");
	mkdirSync(packDir);
	const tarball = npm(["pack", repo, "--silent"], packDir).trim().split(/\r?\n/).at(-1) ?? "";
	check("npm pack writes a tarball", tarball.endsWith(".tgz") && existsSync(join(packDir, tarball)));

	// A throwaway project with no pi installed: peers stay unresolved, exactly as for a user who
	// installed the package into pi but did not clone it.
	const project = join(root, "project");
	mkdirSync(project);
	writeFileSync(join(project, "package.json"), `${JSON.stringify({ name: "install-check", private: true }, null, "\t")}\n`);
	copyFileSync(join(packDir, tarball), join(project, "package.tgz"));
	npm(["install", "--legacy-peer-deps", "--no-audit", "--no-fund", "--silent", "./package.tgz"], project);

	const installed = join(project, "node_modules", packageName);
	check("the tarball installs without pi's packages present", existsSync(join(installed, "src", "daemon.mjs")));
	check("and without pi resolvable from it", !existsSync(join(project, "node_modules", "@earendil-works")));

	const maildir = join(root, "fixtures");
	mkdirSync(maildir);
	writeFileSync(join(maildir, "install-check.eml"), fixture);

	const config = join(root, "pi-email-listener.json");
	writeFileSync(
		config,
		`${JSON.stringify(
			{ accounts: [{ name: "agent", provider: "fixture", dir: maildir }], pollSeconds: 30 },
			null,
			"\t",
		)}\n`,
	);
	const mail = join(root, "mail");
	const env = { ...process.env, PI_EMAIL_LISTENER_CONFIG: config, PI_EMAIL_LISTENER_MAIL_DIR: mail };
	const run = () =>
		execFileSync(process.execPath, [join("node_modules", packageName, "src", "daemon.mjs"), "--once"], {
			cwd: project,
			env,
			encoding: "utf8",
		});
	run();

	const index = join(mail, "agent", "index.jsonl");
	const lines = () => (existsSync(index) ? readFileSync(index, "utf8").split("\n").filter(Boolean) : []);
	const stored = lines().map((line) => JSON.parse(line) as { file: string; subject: string });
	check("the installed fetcher runs from under node_modules", stored.length === 1);
	check("and stores the fixture message", stored[0]?.subject === "Install check");
	check(
		"with the raw message kept whole",
		stored[0] !== undefined && readFileSync(join(mail, "agent", stored[0].file), "utf8") === fixture,
	);

	run();
	check("a second pass stores nothing", lines().length === 1);
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
