---
title: "No gate, a pointer not a digest, and watching while Amp runs"
type: decision
topic: decisions
summary: "amp-email-listener turns the agent for every message — no relevance gate, no batching, no suppression rules — and the wake carries the sender, the subject and a file path rather than the body. The plugin starts watching when it loads with a configured mailbox; Email: Start Watching Mail binds delivery to a thread, Email: Stop Watching Mail stops polling, and Email: Choose Delivery Target selects this thread or a new thread per email. A message with a link or attachment turns the agent with shell, edit and write blocked until the turn ends."
tags: [decision, gate, wake-payload, amp-plugin, quarantine, email]
updated: 2026-11-17
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-055057.md, home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files: [C:/Coding/pi-email-listener/index.ts, C:/Coding/pi-email-listener/src/wake.ts, C:/Coding/pi-email-listener/README.md]
claims:
  - id: c1
    text: "There is no relevance gate: every message that arrives turns the agent. The job-listener split (terminal events always wake, ambiguous ones judged by a model) was considered and rejected, along with priority-sender rules, bulk and no-reply suppression, and batching. The judgement behind it: a missed client message costs more than a wasted turn."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-10-09 — 'The agent should always turn for every email, we dont need a gate.'", "file: docs/PLAN.md — §4 records the rejection and its consequences: volume is the user's choice, and messages arriving mid-turn queue rather than interrupt"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c2
    text: "The wake is a pointer, not a digest: sender, subject, received time, account and the path of the spool file to read. The body is deliberately absent — it is one `read` away, and anything in the transcript is permanent. Andrei set the content as 'the subject line and sender', leaving the rest to the implementation."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'The wake payload should just be the subject line and sender maybe. You can choose.'", "file: src/wake.ts — pointer() composes exactly two lines: `[email] <name <address>> · <subject>` and `<receivedAt> · <account> · <absolute path>`", "command: npm run load-check → 'the pointer names the sender and the subject', 'the pointer does not carry the body'"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c3
    text: "Watching is automatic while Amp runs: the plugin starts polling as soon as it loads with a configured mailbox, and the first pass reads the cursor to catch up on mail that arrived while Amp was off. Email: Start Watching Mail (`email.watch.start`) binds delivery to the thread it is run in; Email: Stop Watching Mail (`email.watch.stop`) is the explicit off switch. This replaces the earlier pi design, which was opt-in per session through /email-watch."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-11-17 — 'The command Email: Watch mail (toggle) should either change its name depending on state, or more simply just be separated into two commands: Start Watching Mail, Stop Watching Mail.'", "user: Andrei Li, 2026-11-17 — 'It need not be always on without amp being on, but it should be able to fetch the backlog of missed emails while it was off.'", "file: index.ts — the auto-start at the bottom and the two command handlers", "command: npm run load-check → 'the watch commands are separate and named for their actions', 'the stop command stops watching'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c4
    text: "The initial test target was Andrei's personal Gmail mailbox, connected by him, and its contents were not to be read, explored or ingested: it was a test target. Development and verification run against fixtures, so nobody has to read his mail. The first live account became AgentMail (c15); the privacy rule still holds."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-10-09 — 'The first target can be my personal email, but there is some personal stuff in there so dont actually go through it, we can just use it for testing.'", "user: Andrei Li, 2026-10-09 — 'My personal mailbox is gmail' (the address is deliberately not recorded here)", "file: docs/wiki/wiki/architecture/agentmail-agent-inbox.md — the AgentMail route that became the first live account"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c5
    text: "Mail from a stranger arriving in a context that has shell access is treated as untrusted: a message carrying a link or an attachment turns the agent with shell, edit and write refused until that turn ends, and v1 has no send path at all. The safety recommendation was accepted as proposed."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'Yes i like the recommendation for safety here.' (the recommendation: quarantine messages with links, attachments or instructions by blocking shell/edit/write until the human has seen them; frame as untrusted but leave tools available otherwise)", "file: docs/PLAN.md — §6"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c6
    text: "Tracking and waking are both automatic while Amp runs: every message the plugin fetches is appended to a thread and turns the agent; there is no relevance gate. The earlier pi design kept the fetcher always on and made waking opt-in; the Amp plugin removed the separate fetcher and made the no-gate behavior the default, with Stop Watching Mail as the only off switch."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-11-17 — 'Clean them up. The package should be a single file plugin. It need not be always on without amp being on, but it should be able to fetch the backlog of missed emails while it was off.'", "file: index.ts — tick() delivers every undelivered message", "file: README.md — the plugin fetches while Amp runs; there is no always-on service"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c7
    text: "The first provider built was Microsoft Graph for Outlook, because a person Andrei works with needs it; IMAP followed and is now the front door for AgentMail, Gmail and any other mailbox. Graph remains the direct route for a Microsoft mailbox and still needs an Entra app registration; no tenant has been available for a live test."
    status: user-stated
    support: 0.85
    evidence: ["user: Andrei Li, 2026-10-09 — 'Lets design for outlook in mind, as i have a person who needs it. So lets just get everything we'd need for that immediately.'", "file: src/imap.ts — the IMAP source, now used by AgentMail and the other front-door routes", "file: src/graph.ts — the Graph source; no live tenant test yet"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c8
    text: "The project is a single-file Amp plugin, not an npm package installed into pi: `index.ts` builds to `dist/amp-email-listener.js`, which is dropped into `.amp/plugins` or the personal plugin repo. `package.json` is private, and there is no npm publish path."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-11-17 — 'It no longer needs to be an npm package now that its just a single file right?'", "file: package.json — private: true; no publish workflow", "file: README.md — install by dropping the file into .amp/plugins", "command: npm run install-check → 'the single file loads with no node_modules'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c9
    text: "The front door is an email address the agent owns: the user ccs the agent on a thread or forwards it a message, and the plugin reads that mailbox over IMAP. Chosen after the alternatives were measured — Graph needs an app registration in a tenant a personal account cannot create, a client's local store only holds what that client synced on that machine, and Outlook's COM automation is unsupported in new Outlook and ceases with classic. The decisive property is that the sender's provider stops mattering: one adapter covers Outlook, Gmail, Fastmail, Proton Bridge and corporate Exchange, and nobody has to approve anything."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'Yes lets make the agent email the front door.'", "user: Andrei Li, 2026-10-09 — 'What if instead, we made an easy way for users to forward emails to an agent email that has none of these restrictions?'", "file: src/imap.ts — the IMAP source, which never marks a message read, never deletes and never moves; the mailbox looks untouched", "file: docs/wiki/wiki/gotchas/gotcha-microsoft-mailbox-access.md — the four routes and why three were rejected"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c10
    text: "The original plan was a new Gmail account per agent, because Gmail app passwords still work for IMAP, requiring only 2-Step Verification on that account. Gmail app passwords proved unreliable in practice (the passkey-only account refused one), so AgentMail became the default; Gmail/IMAP remains an option when the provider allows an app password."
    status: user-stated
    support: 0.85
    evidence: ["user: Andrei Li, 2026-10-09 — 'New gmail per user/agent.'", "file: docs/wiki/wiki/gotchas/gotcha-gmail-app-password.md — the passkey-only Gmail that refused an app password", "file: docs/wiki/wiki/architecture/agentmail-agent-inbox.md — the route that became the default"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c11
    text: "No gate still holds, and it holds for cc'd threads too: the volume consequence was put to Andrei directly — a thread that ccs the agent produces a turn per reply, so a twenty-message thread is twenty turns — and he confirmed every message may turn the agent. Batching and suppression remain rejected."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'The agent can turn for every email, thats totally fine.' (asked after being told that a cc'd thread produces one turn per reply)"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c12
    text: "There is no detached fetcher: the plugin polls only while Amp runs. When Amp starts, the first pass reads each mailbox's saved cursor, so missed mail is fetched and wakes the agent then. The earlier pi service (src/service.ts, src/daemon.mjs) was removed; the plugin is the only runtime."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-11-17 — 'It need not be always on without amp being on, but it should be able to fetch the backlog of missed emails while it was off.'", "file: index.ts — start()/tick() and auto-start", "file: README.md — no always-on service", "command: npm run load-check → 'the first pass fetches the backlog'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c13
    text: "The agent never sends mail, and that is a boundary rather than a backlog item: replies stay a human act, sent by the human from their own address. It is what keeps an agent's mistakes recoverable, and it is why a turn triggered by a stranger's message has shell, edit and write refused until it ends."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-10-09 — 'The agent for now should not be able to send, this should always be done by the user through the users email.'", "file: docs/PLAN.md — §7 Tools records it as a boundary, not a backlog item"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c14
    text: "Setup is `Email: Set up a mailbox` (`email.setup`), a guided command: it asks what kind of mailbox, opens the pages, takes the address and app password, verifies before writing, and writes the account. After setup the plugin starts watching; the separate watch commands are `email.watch.start` and `email.watch.stop`. There is no `/email-service` command."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-11-17 — 'The command Email: Watch mail (toggle) should ... be separated into two commands: Start Watching Mail, Stop Watching Mail.'", "file: src/setup.ts — the questions and the order, with the dialogs injected", "file: index.ts — the command registrations", "command: npm run setup-check → 29 checks including 'it verifies the login before writing anything', 'a failed login writes no config at all', 'cancelling at the address writes nothing'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
  - id: c15
    text: "Andrei called AgentMail's agent sign-up 'a great solution' to the intake problem, and asked for an AgentMail inbox to be set up for his machine under the name SuRuiling, with tests run against it. The route itself, and what was proven live, is on the AgentMail page."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'Agentmail sounds like a great solution to this, though im curious what the limitations are for sending emails. You can run tests and set up an agentmail for my machine. try to use the name SuRuiling.'", "file: docs/wiki/wiki/architecture/agentmail-agent-inbox.md — c3 and c5 record the live sign-up of suruiling@agentmail.to"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c16
    text: "docs/INTAKE.md stays as written, as an artifact. Findings made after it go into the wiki, and the document is not updated with them."
    status: user-stated
    support: 0.9
    evidence: ["user: Andrei Li, 2026-10-09 — 'The document can stay as a artifact, just record your findings in the wiki.'"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c17
    text: "Andrei chose to commit everything as is: the option that keeps the agent's address (suruiling@agentmail.to) in the wiki of this public repository, rather than redacting it first. He took the recommendations for the rest: AgentMail wired into the setup command with receive-only and Spam-watched defaults, the outlook account removed, and the system readied for testing without the testing being started."
    status: user-stated
    support: 0.85
    evidence: ["user: Andrei Li, 2026-10-09 — 'You can commit everything as is, and lets go with the recommendations for everything else. Lets get this setup wired into email-setup, remove outlook from the picture, and just get the system ready for testing. You dont need to start testing yet.'", "context: the choice he answered offered (a) redact the address from the wiki before committing, recommended, or (b) commit and push everything as it is"]
    reviewed: 2026-10-09
    last_checked: 2026-11-17
  - id: c18
    text: "Delivery target is a user setting: new mail can wake an existing thread or start a new thread for each email. The setting is persisted as delivery.mode and delivery.threadId; Start Watching Mail records the current thread, and Choose Delivery Target writes the mode. An account lock serializes sync and delivery across plugin instances, so one message wakes one thread even when several Amp threads loaded the plugin."
    status: user-stated
    support: 0.95
    evidence: ["user: Andrei Li, 2026-11-17 — 'Users should also be able to configure whether to bind to an existing thread or start a new thread when an email comes in.'", "file: index.ts — deliveryMode, email.delivery, saveDelivery", "file: src/spool.ts — withAccountLock() serializes a whole account pass", "command: npm run load-check → 'the delivery target is persisted', 'new mode creates a new thread for the email', 'the old thread does not receive it'", "command: npm run self-check → 'only one account pass holds the lock'"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
---

## Why no gate, when the sibling package has one

`pi-job-listener` gates because its ambiguous question — is a running process's *middle output* worth
an interruption — is genuinely hard, and because a missed terminal event strands an agent on a job
that is already over. Mail is different in the direction that matters: the failure that hurts is
failing to surface a message. Rather than judge arrivals, this package turns the agent and lets it
judge, which is the same reasoning that made the pointer cheaper than a digest.

The cost is volume, and it is accepted rather than hidden: a mailbox receiving 200 messages a day
turns the agent 200 times. If that turns out to hurt, it is a decision for the user to make, not a
filter the package applies on their behalf.

## See also

- [A spool between the mailbox and the Amp thread](../architecture/architecture-spool-and-wake.md)
- [A mail turn meets wiki capture](../gotchas/gotcha-mail-turn-meets-capture.md)
- [AgentMail's agent sign-up](../architecture/agentmail-agent-inbox.md) — the intake route Andrei called "a great solution" (c15)
- home wiki: `decisions/decision-secret-hygiene-in-capture.md` — capture snapshots the transcript
- home wiki: `decisions/decision-long-process-gate.md` — the sibling package's opposite answer
