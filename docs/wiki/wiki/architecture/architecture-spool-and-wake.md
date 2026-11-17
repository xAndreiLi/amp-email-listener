---
title: "A spool between the mailbox and the Amp thread"
type: architecture/layer
topic: architecture
summary: "amp-email-listener is a single-file Amp plugin that polls configured mailboxes while Amp runs, writes raw .eml files plus an append-only index under the Amp config directory, and appends a pointer to each new message to a thread, which wakes the agent. There is no separate service: the provider cursor in the spool is what catches up mail that arrived while Amp was off. Providers plug in through two calls, and the sync cursor belongs to the provider."
tags: [architecture, spool, amp-plugin, wake, oauth, fetcher, providers]
updated: 2026-11-17
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-055057.md]
files:
  [
    C:/Coding/pi-email-listener/index.ts,
    C:/Coding/pi-email-listener/src/spool.ts,
    C:/Coding/pi-email-listener/src/source.ts,
    C:/Coding/pi-email-listener/src/config.ts,
    C:/Coding/pi-email-listener/src/fetcher.ts,
    C:/Coding/pi-email-listener/src/graph.ts,
    C:/Coding/pi-email-listener/src/microsoft-auth.ts,
    C:/Coding/pi-email-listener/src/wake.ts,
    C:/Coding/pi-email-listener/src/setup.ts,
    C:/Coding/pi-email-listener/dist/amp-email-listener.js,
    C:/Coding/pi-email-listener/README.md,
  ]
claims:
  - id: c1
    text: "The plugin is one file at install time. `index.ts` registers the commands, owns the poll timer, and appends pointers; it imports the provider, spool, config, setup, and wake modules. `bun build` bundles it to `dist/amp-email-listener.js`, which is the file users drop into `.amp/plugins` or the personal plugin repo. There is no npm package and no second process."
    status: verified
    support: 0.95
    evidence: ["file: index.ts — the plugin entry, commands, timer, deliver(), and auto-start", "file: package.json — private: true, and the build script runs bun build", "command: npm run install-check → 'the single file loads with no node_modules'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c2
    text: "The plugin runs inside Amp and wakes a thread with `thread.appendUserMessage(...)`; there is no pi extension, RPC-hosted session, or separate daemon. The first pass after the plugin loads reads each account's provider cursor, so mail that arrived while Amp was off is fetched then."
    status: verified
    support: 0.9
    evidence: ["file: index.ts — amp.registerCommand, setInterval, tick(), and deliver()", "file: src/fetcher.ts — syncAccount reads the saved cursor and writes the next one", "command: npm run load-check → 'the first pass fetches the backlog' and 'restarting fetches the mail that arrived while it was off'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c3
    text: "Delivery to the agent is tracked as an index line count per account (`delivered.json`), not as a list of ids: a restart neither repeats nor skips, and it costs one small file. A torn or unreadable cursor falls back to 0 and re-delivers, because a repeated turn is cheap and a skipped message is not."
    status: verified
    support: 0.9
    evidence: ["file: src/wake.ts — undelivered() filters index lines greater than the delivered count; readDelivered() returns 0 when the file is missing or unparsable", "command: npm run load-check → 'a later pass does not fetch the same mail again' and 'the queued message is delivered'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c4
    text: "The plugin starts polling as soon as it loads with a configured mailbox. `Email: Start Watching Mail` (`email.watch.start`) persists this thread as the delivery target, or reports that it is already watching; `Email: Stop Watching Mail` (`email.watch.stop`) stops polling. `Email: Choose Delivery Target` (`email.delivery`) sets the persisted target to this thread or to a new thread per email; `new` creates a fresh thread for each message. An account lock serializes sync and delivery across every plugin instance, so one message wakes one thread."
    status: verified
    support: 0.9
    evidence: ["file: index.ts — deliveryMode, the auto-start, and the Start/Stop/Choose command handlers", "file: src/spool.ts — withAccountLock() opens account.lock with wx and releases it in finally", "command: npm run load-check → 'the delivery target is persisted', 'new mode creates a new thread for the email', 'the old thread does not receive it'", "command: npm run self-check → 'only one account pass holds the lock'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c5
    text: "A turn started by a message carrying a link or an attachment is quarantined: the `tool.call` handler rejects `shell_command`, `bash`, `edit_file`, `create_file` and `apply_patch` while quarantined, reading stays available, and `agent.end` clears it. Detection is header-based plus a URL search in the body, so a link hidden inside an encoded part is not caught."
    status: verified
    support: 0.85
    evidence: ["file: index.ts — GATED_TOOLS, the tool.call handler, and the agent.start/agent.end handlers", "file: src/wake.ts — needsCare() tests attachment headers and http(s) in the body", "command: npm run load-check → 'a message with a link blocks the shell', 'it blocks editing too', 'reading is still allowed', 'the tools come back when the turn ends'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c6
    text: "The sync cursor belongs to the provider: `listNew(cursor)` returns `{ envelopes, cursor }` and the fetcher stores whatever comes back without interpreting it. A fixture returns the newest date it saw, Graph returns the deltaLink or the page it stopped on, and IMAP returns uidValidity plus the highest UID. The cursor is persisted even when a pass stored nothing, because a page that was consumed still moved the position."
    status: verified
    support: 0.9
    evidence: ["file: src/source.ts — the MailSource interface returns { envelopes, cursor }", "file: src/fetcher.ts — syncAccount writes the returned cursor when it has any keys", "command: npm run graph-check → 'the delta link is the stored cursor' and 'a second pass stores nothing new'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c7
    text: "The pieces are verified against a stub host and a real Amp plugin load: the stub proves the pointer append starts a turn and the quarantine blocks tools, and the real loader lists the three commands."
    status: verified
    support: 0.85
    evidence: ["command: npm run load-check → all checks pass, including the pointer, the wake and the quarantine", "command: amp plugins list in a fresh project → 'Email: Start Watching Mail', 'Email: Stop Watching Mail', 'Email: Set up a mailbox'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c8
    text: "The IMAP source does not keep a dead connection. Any failure inside a mailbox operation drops the client and logs it out best-effort, so the next pass reconnects rather than failing forever on a socket the server has already closed — and the error still reaches the caller. The interval between passes is still fixed; there is no backoff yet."
    status: verified
    support: 0.85
    evidence: ["file: src/imap.ts — withMailbox() sets the cached client to undefined and logs it out in the catch, then rethrows", "command: npm run imap-check → 'a dropped connection surfaces as an error rather than silence', 'the dead client is dropped', 'and the next pass connects again'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c9
    text: "A live message wake in a real Amp session has not been observed yet; the mailbox configured on Andrei's machine was empty during the first passes. The stub host and the real loader verify the append and command registration, not the end-to-end provider-to-turn path."
    status: open
    support: 0.6
    evidence: ["observation: the configured mailbox's first sync found no messages", "file: README.md — the live wake is the remaining check"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c10
    text: "Mailboxes are grouped by provider, host and address for configuration. Email: Configure Mailboxes lists saved mailboxes with their status (active, partially active or deactivated) and offers only the applicable toggle: Deactivate for an active or partially active mailbox, Activate for a deactivated one, plus Remove. Deactivation sets active:false on every account in the group, keeps the config and spool, and the watcher skips the account; removal deletes the config entries and leaves stored messages on disk."
    status: verified
    support: 0.9
    evidence: ["file: index.ts — email.mailboxes groups accounts, shows status, offers one toggle and removes them", "file: src/config.ts — AccountConfig.active and removeAccounts()", "command: npm run load-check → 'Configure Mailboxes deactivates the saved mailbox', 'only Deactivate is offered for an active mailbox', 'a deactivated mailbox does not wake', 'Configure Mailboxes activates the saved mailbox', 'only Activate is offered for a deactivated mailbox', 'activating fetches the mail that arrived while it was off', 'Configure Mailboxes removes the saved mailbox'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
---

## Shape

```
mailbox ──▶ plugin poll (while Amp runs) ──▶ spool of files ──▶ thread.appendUserMessage ──▶ turn
             OAuth, reconnect, catch-up      .eml + index      pointer, never the body
```

The plugin's timer calls `syncAccount` for each account. New messages become raw `.eml` files plus an
append-only `index.jsonl` line; undelivered lines become a pointer appended to a thread. The first
pass after Amp starts reads the provider cursor, so the backlog is fetched then. There is no
always-on process.

## Modules

| File | Owns |
|---|---|
| `index.ts` | The Amp plugin entry: the five commands, the poll timer, the persisted delivery mode, `deliver()`, auto-start, and the `tool.call` quarantine. |
| `src/source.ts` | A provider adapter as two calls: `listNew(cursor) → { envelopes, cursor }` and `fetch(id) → raw message`, plus an optional `close()` for a source that holds a connection. `fixtureSource` reads a directory of `.eml` files. |
| `src/imap.ts` | The front door: a mailbox the agent owns, read over IMAP with app passwords. Cursor is `uidValidity` plus the highest UID, resets when the server rebuilds, first pass takes the newest 50, and nothing is ever marked read, moved or deleted. |
| `src/graph.ts` | Microsoft Graph: delta on one folder bounded by `receivedDateTime ge`, paging, MIME through `$value`. See [the Graph page](microsoft-graph-source.md). |
| `src/microsoft-auth.ts` | The device code sign-in and the token store, refreshed when close to expiring. |
| `src/spool.ts` | The layout: raw message, `index.jsonl`, `cursor.json`, `delivered.json` per account. Store never overwrites an existing file. `withAccountLock()` serializes a whole account pass across plugin instances. |
| `src/config.ts` | Accounts from `~/.config/amp/amp-email-listener.json`, movable with `AMP_EMAIL_LISTENER_CONFIG`; mail lives under `~/.config/amp/mail`, movable with `AMP_EMAIL_LISTENER_MAIL_DIR`. `active: false` keeps an account saved but skipped; `removeAccounts()` deletes entries. Provider-specific fields: `dir` for fixture, `clientId`/`tenant`/`mailbox`/`folder`/`since` for graph. |
| `src/fetcher.ts` | One pass per account, ids in the index skipped, the provider's cursor stored, one broken account not stopping the others. Long message ids get a hashed file name. |
| `src/wake.ts` | What is undelivered, the pointer text, and whether a message needs care. No plugin host imports: this is the half the stub test drives directly. |
| `src/setup.ts` | The wizard as logic with the dialogs injected: what is asked, in what order, and what is verified before anything is written. |
| `dist/amp-email-listener.js` | The built single file users install. It carries its dependencies and needs no `node_modules`. |

## Commands

| Command | What it does |
|---|---|
| `Email: Set up a mailbox` (`email.setup`) | The whole of onboarding. First choice: give the agent an AgentMail address on the spot, written before it is verified because its key cannot be fetched again ([AgentMail page](agentmail-agent-inbox.md)). Otherwise ask, open the pages, verify, write the account. |
| `Email: Start Watching Mail` (`email.watch.start`) | Start polling and persist this thread as the delivery target. If polling is already on, it rebinds to this thread rather than stopping. |
| `Email: Stop Watching Mail` (`email.watch.stop`) | Stop polling and clear the in-memory binding. |
| `Email: Choose Delivery Target` (`email.delivery`) | Persist either this thread or a new thread per email as the delivery target. |
| `Email: Configure Mailboxes` (`email.mailboxes`) | List saved mailboxes; activate, deactivate or remove one. Deactivation keeps it saved and stops it waking; removal deletes the config entries and leaves stored messages. |

The plugin auto-starts when the config has at least one account, so the first pass after Amp starts
fetches the backlog. `Email: Stop Watching Mail` is the explicit off switch.

## Invariants

- The plugin is the only runtime. There is no npm package, no detached fetcher, and no second
  process; the old `src/service.ts` and `src/daemon.mjs` are gone.
- The plugin polls only while Amp runs. The provider cursor is the backlog: the first pass after
  Amp starts fetches everything that arrived since the last pass.
- `Email: Start Watching Mail` persists delivery to the thread it is run in; `Email: Choose Delivery
  Target` persists either that thread or a new thread per email. Without a persisted target the
  plugin follows the active thread and creates a mail thread when there is none.
- Only one account pass runs at a time across plugin instances. A second instance that finds
  `account.lock` skips the pass instead of delivering the same index line to a second thread.
- Deactivated accounts stay in the config with `active: false`; the watcher skips them and closes
  their provider connections. Removing the last account stops the watcher.
- A message is stored once. The file name derives from the provider id — hashed at the tail when the
  id is too long for a name — collisions get a suffix, and the index is append-only.
- The wake carries a pointer, never a body
  (§ [no gate and the pointer](../decisions/decision-no-gate-and-pointer.md)).
- A message with a link or attachment quarantines the turn: shell, edit and write are refused until
  the turn ends, while reading stays available.
- Credentials stay out of the repository: the refresh token is written beside the spool.

## Alternatives considered, and kept open

The earlier pi design used two processes: a detached fetcher and an in-session extension joined by
the spool. The Amp plugin replaced both halves with one file on 2026-11-17, because the plugin can
poll and append to a thread from the same process. The spool seam is still real: a future
out-of-process fetcher could write the same files, but no such service is shipped.

## Not built yet

- A live message wake in a real session (c9). The stub host and the real loader prove the pieces,
  not the end-to-end provider-to-turn path.
- Backoff between passes around a mailbox that keeps failing, and catch-up reporting when a start
  covers a large backlog.
- The `Fwd:` heuristic is deliberately shallow — it recovers the usual top-quoted `From:` line and
  nothing more.
- Sending is not on this list and will not be: the agent has no send path by decision.
