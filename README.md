# pi-email-listener

Give your pi agent an email address of its own. When mail arrives, the agent wakes in your pi
session and gets a pointer to the message — sender, subject, time, and the file to read.

## Install

Requires [pi](https://pi.dev) and Node 22 or newer.

```bash
pi install git:github.com/xAndreiLi/pi-email-listener
```

## Use

1. Start pi and run:

   ```
   /email-setup
   ```

   Pick **Give the agent its own address** to get `<name>@agentmail.to` in a minute — free, no
   sign-up, and receive-only. Or connect a new Gmail or any IMAP mailbox you already have.

2. Ask someone to cc the agent, or forward it a message.

3. In the session that should be woken, run:

   ```
   /email-watch
   ```

   Every new message wakes the agent. Run `/email-watch` again to stop.

## Commands

| Command | What it does |
|---|---|
| `/email-setup` | Connect a mailbox |
| `/email-watch` | Start or stop watching mail in this session |
| `/email-service` | Show whether the background fetcher is running |
| `/email-service start` / `stop` / `restart` | Control the background fetcher |

The background fetcher checks for new mail even when no session is open, so messages are waiting for
the next `/email-watch`. `/email-setup` offers to keep it running automatically.

The agent never sends mail. There is no send path.

## Configuration

`/email-setup` writes everything to `~/.pi/agent/pi-email-listener.json` (or
`$PI_CODING_AGENT_DIR/pi-email-listener.json`). Edit that file by hand to add accounts or change
settings; mail is never marked read, moved, or deleted.

## Remove

```bash
pi remove git:github.com/xAndreiLi/pi-email-listener
```

## Licence

MIT
