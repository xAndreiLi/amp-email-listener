# amp-email-listener

A single-file Amp plugin that gives your agent an email address of its own. When mail arrives, it
appends a pointer to the message to a thread, which wakes the agent.

## Install

Requires an Amp CLI with plugin support (`amp update` if `amp plugins` is unknown).

The plugin is one file. Put it where Amp looks for project plugins:

```bash
mkdir -p .amp/plugins && curl -fsSL https://raw.githubusercontent.com/xAndreiLi/amp-email-listener/main/dist/amp-email-listener.js -o .amp/plugins/amp-email-listener.ts
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .amp\plugins | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/xAndreiLi/amp-email-listener/main/dist/amp-email-listener.js -OutFile .amp\plugins\amp-email-listener.ts
```

For every project on the machine, use `~/.config/amp/plugins/` instead (on Windows,
`$HOME\.config\amp\plugins\`). No `npm install` and no background process are needed.

`amp plugins add` only accepts plugins from Amp's gallery (`https://ampcode.com/@amp/plugins/*.ts`),
not an arbitrary GitHub URL. To make the plugin available everywhere and share it, add the same file
to your personal plugin repository:

```bash
amp plugins repositories
amp clone user-plugins
# copy amp-email-listener.js to user-plugins/amp-email-listener.ts, then commit and push
```

## Use

1. Run `/email.setup`, or pick **Email: Set up a mailbox** from the command palette. Choose **Give
   the agent its own address** to get `<name>@agentmail.to` in a minute — free, no sign-up, and
   receive-only. After it is created, the wizard offers to open AgentMail's claim page; claiming makes
   the key recoverable and enables sending, which the plugin never uses. Or connect a new Gmail or any
   IMAP mailbox you already have.

2. Ask someone to cc the agent, or forward it a message.

3. The plugin starts fetching as soon as a mailbox is configured. **Email: Start Watching Mail**
   binds delivery to this thread; **Email: Stop Watching Mail** stops polling. **Email: Choose
   Delivery Target** switches between this thread and a new thread for each email. Mail that arrived
   while Amp was off is fetched on the next start.

## Commands

| Command | What it does |
|---|---|
| `Email: Set up a mailbox` (`/email.setup`) | Connect a mailbox |
| `Email: Start Watching Mail` (`/email.watch.start`) | Start watching mail and deliver it to this thread |
| `Email: Stop Watching Mail` (`/email.watch.stop`) | Stop watching mail |
| `Email: Choose Delivery Target` (`/email.delivery`) | Deliver to this thread, or start a new thread for each email |

The plugin fetches mail while Amp is running. There is no always-on service: when Amp starts, the
first pass reads each mailbox from its saved cursor, so missed mail is fetched and wakes the agent
then. The agent never sends mail.

## Configuration

`/email.setup` writes everything to `~/.config/amp/amp-email-listener.json`, or
`$XDG_CONFIG_HOME/amp/amp-email-listener.json` when that variable is set. Edit the file by hand to
add accounts or change settings; mail is never marked read, moved, or deleted.
`AMP_EMAIL_LISTENER_CONFIG` and `AMP_EMAIL_LISTENER_MAIL_DIR` override the two paths.

`delivery` controls where new mail goes. `{ "mode": "thread", "threadId": "T-..." }` sends it to
that thread; `{ "mode": "new" }` starts a fresh thread for every email. **Email: Choose Delivery
Target** writes the setting, and **Email: Start Watching Mail** records the current thread.

## Remove

```bash
rm .amp/plugins/amp-email-listener.ts
```

Use `~/.config/amp/plugins/amp-email-listener.ts` for a machine-wide install, or remove the file
from your personal plugin repository.

## Licence

MIT
