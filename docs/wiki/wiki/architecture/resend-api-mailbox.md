---
title: "Resend: a mailbox the fetcher can poll, and the domain a reply would cost"
type: architecture/layer
topic: architecture
summary: "Resend now sells both halves of this package's loop. Inbound mail arrives at a Resend-managed `<id>.resend.app` subdomain that needs no domain of the user's own and is included on the free plan, and received mail is readable by polling `GET /emails/receiving` — so a local fetcher can pull it with no webhook endpoint and no public URL, and each message brings a signed URL for the original raw file plus server-computed SPF/DKIM/DMARC verdicts that no other source in this package provides. Sending is the expensive half: it requires a domain verified in the user's account, because the built-in `resend.dev` sender reaches only the account owner's own address. Resend's own agent-inbox product answers the send question with drafts — `draft_reply` is an allowed action and sending is not — and its guidance puts a strict sender allowlist first, a gate this package deliberately lacks. Inboxes (private beta) would host threads, labels and drafts at an address on a domain the user verifies. Nothing on this page is decided or built: it is the assessment a decision would stand on."
tags: [architecture, resend, intake, sending, domain, authentication, polling, agent-inbox]
updated: 2026-10-10
sources:
  [
    "https://resend.com/docs/dashboard/receiving/introduction.md",
    "https://resend.com/docs/api-reference/emails/list-received-emails.md",
    "https://resend.com/docs/api-reference/emails/retrieve-received-email.md",
    "https://resend.com/docs/api-reference/emails/send-email",
    "https://resend.com/docs/dashboard/receiving/reply-to-emails.md",
    "https://resend.com/docs/dashboard/emails/idempotency-keys.md",
    "https://resend.com/docs/knowledge-base/403-error-resend-dev-domain.md",
    "https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend.md",
    "https://resend.com/docs/api-reference/rate-limit.md",
    "https://resend.com/pricing",
    "https://resend.com/docs/api-reference/inboxes/get-agent.md",
    "https://resend.com/docs/api-reference/inboxes/create-inbox.md",
    "https://resend.com/docs/openclaw-guide.md",
    "https://resend.com/docs/mcp-server.md",
    "raw/sessions/2026-10-10-session-2026-10-10-003512.md",
    "raw/sessions/2026-10-10-session-2026-10-10-003521.md",
    "raw/sessions/2026-10-10-session-2026-10-10-003540.md",
  ]
files: [C:/Coding/pi-email-listener/src/source.ts, C:/Coding/pi-email-listener/src/config.ts]
claims:
  - id: c1
    text: "Resend accepts inbound mail at a Resend-managed `<id>.resend.app` subdomain, an alternative to a domain of the user's own, and inbound email is included on every plan including Free. Received mail is then read with an ordinary paginated endpoint — `GET /emails/receiving`, up to 100 per page, paged with `after`/`before` — which is what would let this package read it the way it reads everything else: a background pass that pulls and spools, with no webhook endpoint, no tunnel and no public URL. Resend's own agent guide instead assumes a webhook server behind a tunnel."
    status: verified
    support: 0.85
    evidence: ["source: resend.com/docs/dashboard/receiving/introduction — 'Resend provides all the tools you need to receive emails (commonly called inbound) at a verified domain, or at your account's Resend-managed `<id>.resend.app` subdomain.'", "source: resend.com/pricing — '| Inbound emails | Receive emails using webhooks. Parse content and attachments. Reply to your users. | Yes | Yes | Yes | Yes |'", "source: resend.com/docs/api-reference/emails/list-received-emails — 'Retrieve a list of received emails for the authenticated user. … curl -X GET 'https://api.resend.com/emails/receiving''", "source: resend.com/docs/openclaw-guide — 'Set up a tunnel … We recommend Tailscale Funnel'"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c2
    text: "A received email fetched from Resend comes with two things the IMAP and Graph sources of this package do not provide: a signed download URL for the original raw message file, so the spool can keep a real `.eml` without converting anything, and SPF/DKIM/DMARC verdicts computed by Resend's receiving server rather than read from message headers, so the sender cannot forge them. The second is a trust signal the package has never had, and it is the kind of thing a quarantine decision could weigh."
    status: verified
    support: 0.85
    evidence: ["source: resend.com/docs/api-reference/emails/retrieve-received-email — 'Raw email content download information. Contains a signed URL to download the original email file including all attachments.'", "source: resend.com/docs/api-reference/emails/retrieve-received-email — 'The SPF, DKIM, and DMARC results computed when the email was received. These come from the receiving mail server, not from the message headers, so the sender cannot forge them.'", "file: src/imap.ts and src/graph.ts — neither reads an authentication result; the IMAP source builds its envelope from headers and the Graph source fetches MIME body only"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c3
    text: "Outbound mail to arbitrary recipients through Resend requires a domain verified in the user's account. The built-in `resend.dev` sender can only reach the email address associated with the Resend account, and any address at a verified domain may be used without creating it first. So a reply capability through Resend starts where the Cloudflare route starts — the user owns a domain — and not where AgentMail starts."
    status: verified
    support: 0.8
    evidence: ["source: resend.com/docs/knowledge-base/403-error-resend-dev-domain — 'The `resend.dev` domain is only available for testing purposes and can only send emails to the email address associated with your Resend account.'", "source: resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend — 'Once a domain is verified in your Resend account, you can send from any email address at that domain.'"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c4
    text: "Resend's free plan covers 3 domains, 3,000 emails a month and 100 a day, and both sent and received mail count against the same quota; the free plan's stated data retention is 30 days. A reply path on the free tier is therefore cheap in volume for one agent's correspondence, but the retention figure bounds how long a fetcher may stay offline and still catch up."
    status: verified
    support: 0.8
    evidence: ["source: resend.com/pricing — 'Free: 100 emails a day, 3 domains, Ticket support, 10,000 automation runs, 30-day data retention.'", "source: resend.com/pricing — 'Free | $0/mo | 3,000'", "source: resend.com/docs/api-reference/rate-limit — 'Both sent and received emails count towards these quotas.'"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c5
    text: "Resend's own agent-inbox product models agent replies as drafts: an inbox's `enabled_actions` may contain `draft_reply`, `forward_thread`, `add_labels`, `assign_thread`, `mark_as_spam`, `archive_thread` and `delete_thread`, and the list contains no send action. The same documentation's agent guidance ranks a strict sender allowlist first among five security levels. Both are references rather than rules: the first agrees with this package's no-send boundary, and the second contradicts its no-gate decision, so adopting it would reverse a decision instead of extending it."
    status: verified
    support: 0.85
    evidence: ["source: resend.com/docs/api-reference/inboxes/get-agent — 'Actions the agent is allowed to take. Each entry is one of `draft_reply`, `forward_thread`, `add_labels`, `assign_thread`, `mark_as_spam`, `archive_thread`, or `delete_thread`.'", "source: resend.com/docs/openclaw-guide — '1. **Strict Allowlist**: Only allow emails from specific senders. **Recommended for most use cases**.'", "file: docs/wiki/wiki/decisions/decision-no-gate-and-pointer.md — c1 records the no-gate decision: every message turns the agent, no priority-sender rules"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c6
    text: "Threading a reply through Resend is header work, not an API feature: `In-Reply-To` carries the received message's `message_id`, prior ids are appended to `References`, and the subject is prefixed `Re:`. This package already stores the raw message whose `Message-ID` that would be, so a reply needs no new state. A send can carry an `Idempotency-Key` — unique per request, expiring after 24 hours — which is what stops a retry after a crash from sending twice."
    status: verified
    support: 0.9
    evidence: ["source: resend.com/docs/dashboard/receiving/reply-to-emails — 'If you want to reply to an email, add the `In-Reply-To` header set to the `message_id` of the received email. To signal the threading, set the subject to start with `Re:`'", "source: resend.com/docs/dashboard/receiving/reply-to-emails — 'If you're replying multiple times within the same thread, make sure to also append the previous `message_id`s to the `References` header, separated by spaces.'", "source: resend.com/docs/api-reference/emails/send-email — 'Add an idempotency key to prevent duplicated emails. … Should be **unique per API request** … Idempotency keys expire after **24 hours**'"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
  - id: c7
    text: "Resend Inboxes is a private-beta hosted alternative to this package's spool plus session: it offers threads, labels, folders, drafts and reply/forward/send-draft operations at an address on a domain the user has verified, and can receive without an MX record through `forwarding: true`. The same address can therefore carry both halves of the loop, at the cost of owning a domain and depending on a beta whose response shape may change before general availability."
    status: verified
    support: 0.75
    evidence: ["source: resend.com/docs/api-reference/inboxes/create-inbox — 'Inboxes are currently in private beta and only available to a limited number of users. The response shape might change before GA.'", "source: resend.com/docs/api-reference/inboxes/create-inbox — 'An inbox sends and receives email at an address on one of your domains, such as `support@example.com`.'", "source: resend.com/docs/api-reference/inboxes/create-inbox — 'When `true`, Resend provisions a receiving address so you can receive mail without adding an MX record.'", "source: resend.com/docs/mcp-server — 'Search their threads, and manage threads, thread emails (get, reply, forward), labels, and drafts (create, update, send).'"]
    reviewed: 2026-10-10
    last_checked: 2026-10-10
---

## What changed

Resend used to be only the sending half of a mail system: an API that posts a message and, until a
domain is verified, will not post it to anyone but the account owner ([c3](#c3)). It now also receives
mail and, in beta, hosts an inbox with threads and drafts. That makes it the first third-party product
looked at here that covers both ends of this package's loop, which is why it is worth a page rather
than a line in the route table of `docs/INTAKE.md`.

## The half that fits today: intake by polling

The spool wants files and the fetcher wants a cursor. Resend's receiving API gives both without
asking for anything new: `GET /emails/receiving` lists what arrived, paged, and one retrieve call per
message returns the original raw file as a signed download URL ([c1](#c1), [c2](#c2)), so a `resend`
source would implement the same two calls as `imap` and `graph` (`listNew`/`fetch` in
`src/source.ts`) — no webhook server, no tunnel, no public URL, which is the shape this package
chose *because* it runs on a laptop that is sometimes off. Resend's own guide for giving an agent an
inbox assumes the opposite: a webhook endpoint exposed through Tailscale Funnel, driven by the
provider's push.

Two things come with that pull that nothing else in the package delivers:

- **The raw message itself**, not a MIME body via a token dance — the spool's contract stays exactly
  what it is.
- **Authentication verdicts.** SPF, DKIM and DMARC results computed by the receiving server, which a
  sender cannot forge ([c2](#c2)). IMAP and Graph give the package no such signal; today's quarantine
  decides from a header scan and a URL search inside the body.

The costs compared with AgentMail, the route `/email-setup` offers first: a Resend account is a human
sign-up with an API key rather than an unauthenticated agent sign-up, inbound counts against the same
monthly quota as outbound ([c4](#c4)), and the stated retention on the free plan is 30 days, so a
fetcher that stays off longer than that cannot catch up on what it missed.

## The half that costs a domain: sending

Everything about replying is cheap except the first step. Once a domain is verified, the send call
takes a `text` body, `In-Reply-To` and `References` lifted from the `Message-ID` of a message already
in the spool, and an `Idempotency-Key` so a crash-and-retry cannot duplicate a reply ([c6](#c6)).
Free-tier volume is far beyond one agent's correspondence, and received mail counts there too
([c4](#c4)). But without a verified domain there is no path at all to a recipient other than the
account owner ([c3](#c3)) — so the decision is not "add Resend", it is "own a domain", the same entry
price as [Owning the drop](owning-the-drop.md), and the thing [An inbox the package can create
itself](agentmail-agent-inbox.md) was built to avoid.

A domain bought for sending also unlocks the receiving side at the same address: MX pointed at
Resend, and one address carries both directions. That is the configuration Resend's own agent guide
sets up for sending and receiving, with a subdomain in front of the root.

## What their own agent product says about the boundary

Resend's agent-inbox model offers an agent `draft_reply` and not a send action ([c5](#c5)), and its
guidance recommends starting with a strict sender allowlist and relaxing from there
([c5](#c5)). The first is independent agreement with this package's no-send boundary — a bigger
vendor, selling a sending API, still stops the agent at a draft. The second is the opposite of the
no-gate decision: an allowlist is a relevance gate by another name, and taking it would reverse
`decision-no-gate-and-pointer.md` c1 rather than extend it. That contradiction is not resolved here;
it is the kind of thing a decision has to name out loud if this route is taken up.

## See also

- [An inbox the package can create itself](agentmail-agent-inbox.md) — the current front door, and the
  route this one would compete with on setup friction
- [Owning the drop](owning-the-drop.md) — the route that also begins with a domain the user owns
- [No gate, a pointer not a digest, and watching only when asked](../decisions/decision-no-gate-and-pointer.md)
  — c1 (no gate) and c5 (no send path) are the two decisions this route puts pressure on
- `docs/INTAKE.md` in the repository — the route-by-route briefing this page adds a candidate to
