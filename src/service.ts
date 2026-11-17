/**
 * The service: the fetcher as a detached process, so mail keeps arriving whether or not an Amp
 * session is open. This is what "always on" means here.
 *
 * It is deliberately not a Windows service or a systemd unit. Those are the right answer for a
 * machine that reboots, and they need installing with privileges; this is a process that outlives
 * the session that started it, recorded in one file so any later session can find, report on and
 * stop it. Run from the CLI you keep a terminal open; run as the service you do not.
 *
 * State lives in `<mail dir>/service.json`, output in `<mail dir>/service.log`.
 */

import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mailRoot } from "./spool.ts";

export interface ServiceState {
	pid?: number;
	startedAt?: string;
	alive: boolean;
	logPath: string;
	lastLine?: string;
}

const stateFile = () => join(mailRoot(), "service.json");
const logPath = () => join(mailRoot(), "service.log");

function alive(pid: number): boolean {
	try {
		// Signal 0 asks the operating system whether the process exists without touching it.
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function serviceState(): ServiceState {
	const file = stateFile();
	if (!existsSync(file)) return { alive: false, logPath: logPath() };
	let pid: number | undefined;
	let startedAt: string | undefined;
	try {
		({ pid, startedAt } = JSON.parse(readFileSync(file, "utf8")) as { pid?: number; startedAt?: string });
	} catch {
		return { alive: false, logPath: logPath() };
	}
	const running = typeof pid === "number" && alive(pid);
	return { pid, startedAt, alive: running, logPath: logPath(), ...(running ? {} : {}) };
}

/** The last thing the service said, which is usually enough to tell why it is unhappy. */
export function lastServiceLine(): string | undefined {
	const file = logPath();
	if (!existsSync(file)) return undefined;
	const lines = readFileSync(file, "utf8").trimEnd().split("\n");
	return lines.at(-1)?.trim();
}

/**
 * The Node binary that runs the detached fetcher. Inside Amp the plugin host is Bun, so
 * `process.execPath` would start the wrong runtime; `node` is required for the fetcher either way.
 * AMP_EMAIL_LISTENER_NODE can point at a specific install.
 */
function nodeBinary(): string {
	const configured = process.env.AMP_EMAIL_LISTENER_NODE;
	if (configured) return configured;
	const bun = (process.versions as { bun?: string }).bun;
	return bun ? "node" : process.execPath;
}

/** Start it, or report the one already running. Never two. */
export function startService(): ServiceState {
	const current = serviceState();
	if (current.alive) return current;

	// Plain Node and a plain-JavaScript entry, no shell: an installed copy lives under node_modules,
	// where Node will not strip types, so the entry loads the fetcher through jiti instead.
	const entry = fileURLToPath(new URL("./daemon.mjs", import.meta.url));
	const out = openSync(logPath(), "a");
	const child = spawn(nodeBinary(), [entry], {
		detached: true,
		windowsHide: true,
		stdio: ["ignore", out, out],
		env: process.env,
	});
	child.unref();
	writeFileSync(stateFile(), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString() }, null, "\t"));
	return { pid: child.pid, startedAt: new Date().toISOString(), alive: child.pid !== undefined, logPath: logPath() };
}

export function stopService(): ServiceState {
	const current = serviceState();
	if (current.pid && current.alive) {
		try {
			process.kill(current.pid);
		} catch {
			// It died between the check and the signal, which is the outcome we wanted.
		}
	}
	if (existsSync(stateFile())) rmSync(stateFile());
	return { ...current, alive: false };
}

export function serviceStatusText(): string {
	const state = serviceState();
	if (!state.alive) {
		// A state file with no live process means it died, so say what it last said.
		return state.pid
			? `The mail service is not running (it was pid ${state.pid}). Log: ${state.logPath}\nLast line: ${lastServiceLine() ?? "(nothing)"}`
			: `The mail service is not running. \`npm run fetch\` in a terminal, or /email.setup to set it up.`;
	}
	return `The mail service is running as pid ${state.pid} since ${state.startedAt}. Log: ${state.logPath}\nLast line: ${lastServiceLine() ?? "(nothing yet)"}`;
}
