---
title: "A mail turn meets wiki capture"
type: gotcha
topic: gotchas
summary: "A message delivered by a wake is read by the agent, so its text is in the transcript — and wiki capture snapshots the transcript. A session watching mail therefore feeds third-party mail into whichever wiki captures that session, including this one, unless capture is off for it. The Amp plugin does not warn when watching starts; check capture before Start Watching Mail."
tags: [gotcha, wiki, capture, email, privacy, unattended, amp-plugin]
updated: 2026-11-17
sources: [home: raw/sessions/2026-10-09-session-2026-10-09-061532.md]
files: [C:/Coding/pi-email-listener/index.ts, C:/Coding/pi-email-listener/README.md]
claims:
  - id: c1
    text: "Wiki capture copies the session transcript into the wiki, and a mail-triggered turn puts a stranger's message into that transcript the moment the agent reads it — so a session watching mail can write external correspondence into this project's wiki with nobody in the loop. The Amp plugin has no built-in warning; the old pi extension did. The mitigation is a check before Email: Start Watching Mail: the person starting the watch decides whether capture is off for that session."
    status: verified
    support: 0.8
    evidence: ["file: index.ts — the Amp plugin registers Email: Start Watching Mail and appends pointers; it does not send a capture warning", "file: README.md — the plugin starts fetching as soon as a mailbox is configured, with no capture prompt", "home wiki: decisions/decision-secret-hygiene-in-capture.md — c1 verifies that capture snapshots the transcript into raw/sessions/ and c2 records that automatic mail wakes make that unattended"]
    reviewed: 2026-11-17
    last_checked: 2026-11-17
---

## Why a check and not a guard

Blocking watching outright when capture is on would refuse the feature because of a setting about a
different feature. The check puts the decision where the knowledge is: the person starting the watch
knows whether the session captures, and the transcript they are about to open is their own. The old
pi extension warned at watch start; the Amp plugin leaves the check to the user.

## What to check before Email: Start Watching Mail

- Whether that session's wiki captures on settle or on a cadence, and whether it writes here.
- Whether the messages being watched are the kind that may live in a wiki at all. A client mailbox
  and a personal mailbox fail that test for different reasons.

Related: the first live account is Andrei's personal mailbox, used for testing only, and its contents
are not to be read or ingested — see [the decisions page](../decisions/decision-no-gate-and-pointer.md).
