# amp-email-listener

Give your Amp agent an email address of its own. When mail arrives, the plugin appends a pointer to
the message to a thread, which wakes the agent.

## Install

Requires [Amp](https://ampcode.com) and Node 22 or newer.

Amp loads directory plugins from `.amp/plugins/` in a project, or from
`~/.config/amp/plugins/` for every project (on Windows, `%USERPROFILE%\.config\amp\plugins\`). Clone
this repository into one of those:

```bash
mkdir -p ~/.config/amp/plugins
git clone https://github.com/xAndreiLi/amp-email-listener.git ~/.config/amp/plugins/amp-email-listener
cd ~/.config/amp/plugins/amp-email-listener
npm install
```

Then reload plugins in Amp: run `plugins: reload` from the command palette.

For a single project, `mkdir -p .amp/plugins` and clone it there instead.

## Use

1. Run `/email.setup`, or pick **Email: Set up a mailbox** from the command palette. Choose **Give
   the agent its own address** to get `<name>@agentmail.to` in a minute — free, no sign-up, and
   receive-only. Or connect a new Gmail or any IMAP mailbox you already have.

2. Ask someone to cc the agent, or forward it a message.

3. Run `/email.watch` (or pick **Email: Watch mail (toggle)** from the command palette) in the
   thread that should be woken. Every new message wakes the agent; run it again to stop. Mail that
   arrived while watching was off is delivered when you start watching.

## Commands

| Command | What it does |
|---|---|
| `/email.setup` | Connect a mailbox |
| `/email.watch` | Start or stop watching mail |
| `/email.service` | Show the background fetcher and its last line |
| `/email.service.start` | Start the background fetcher |
| `/email.service.stop` | Stop the background fetcher |
| `/email.service.restart` | Restart the background fetcher |

The background fetcher is a detached Node process, so mail keeps arriving when Amp is closed.
`/email.setup` offers to keep it running automatically. The plugin wakes a thread only while Amp is
running and watching; mail that arrives otherwise is waiting when you start watching.

The agent never sends mail. There is no send path.

## Configuration

`/email.setup` writes everything to `~/.config/amp/amp-email-listener.json`, or
`$XDG_CONFIG_HOME/amp/amp-email-listener.json` when that variable is set. Edit the file by hand to
add accounts or change settings; mail is never marked read, moved, or deleted.
`AMP_EMAIL_LISTENER_CONFIG` and `AMP_EMAIL_LISTENER_MAIL_DIR` override the two paths.

## Remove

```bash
rm -rf ~/.config/amp/plugins/amp-email-listener
```

## Licence

MIT
