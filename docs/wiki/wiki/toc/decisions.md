# decisions

| Page | Type | Tags | Summary | Updated |
|------|------|------|---------|---------|
| [No gate, a pointer not a digest, and watching while Amp runs](../decisions/decision-no-gate-and-pointer.md) | decision | decision gate wake-payload amp-plugin quarantine email | amp-email-listener turns the agent for every message — no relevance gate, no batching, no suppression rules — and the wake carries the sender, the subject and a file path rather than the body. The plugin starts watching when it loads with a configured mailbox; Email: Start Watching Mail binds delivery to a thread, Email: Stop Watching Mail stops polling, and Email: Choose Delivery Target selects this thread or a new thread per email. Email: Configure Mailboxes activates, deactivates or removes saved mailboxes. A message with a link or attachment turns the agent with shell, edit and write blocked until the turn ends. | 2026-11-17 |
