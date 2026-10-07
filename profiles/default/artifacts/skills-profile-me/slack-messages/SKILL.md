---
name: slack-messages
description: Retrieves Slack messages, thread replies, and image attachments via the Direct Slack API. SlackCLI is only for login (from a pasted browser cURL) and channel discovery — never for reading messages. A live auth.test probe must return AUTH_OK before any Slack fetch; if auth is missing or expired, stop and ask the user to paste a Slack API cURL into the chat. Use when the user asks to read Slack messages, fetch conversation history, view thread replies, analyze images shared in Slack, or references a Slack channel ID like C1234567890.
---

# Slack Messages - Reading Channels, Threads & Attachments

> **AUTH GATE:** Before any Slack read, list, send, or download, run `scripts/check-auth.py`. Proceed only on `AUTH_OK`. On `AUTH_BLOCKED`, follow **STOP procedure** below. Do not fetch Slack another way while you wait.

> **CRITICAL:** When retrieving messages that contain image attachments (file_share subtype), automatically download and display ALL images. Do NOT ask the user if they want to see them. This does not override the auth gate — no images until `AUTH_OK`.

> **CRITICAL:** SlackCLI `--json` strips the `files` array. Fetch messages only with the Direct Slack API. There is no SlackCLI read fallback.

> **CRITICAL:** When processing Slack links found in Jira tickets, you MUST fetch the linked messages/threads and download/analyze ALL Slack image attachments from those messages before responding — after the auth gate passes. If the gate blocks, stop Slack work and wait; do not skip those links silently.

> **CRITICAL:** If Jira comments are also available for the same issue, you MUST produce one merged chronological history timeline (Jira comments + Slack messages) instead of two separate histories.

> **CRITICAL:** You MUST map each analyzed image to its parent Slack message/reply or Jira comment whenever possible, and place that image under the corresponding timeline event. If an image cannot be mapped to a Slack message/reply or Jira comment, list it separately in an `Unmapped images` section after the timeline.

## Auth Gate (mandatory, first)

Run this at the start of **every** Slack request in a chat, even if a probe succeeded earlier. Browser tokens expire.

1. Ensure SlackCLI is installed (you may install it; that is not auth).
2. Run the live probe with full permissions (`required_permissions: ["all"]`):

```bash
python3 "$HOME/.agents/profiles/default/artifacts/skills-profile-me/slack-messages/scripts/check-auth.py"
```

3. Read the first line of output:
   - `AUTH_OK ...` → continue with Direct API fetches.
   - `AUTH_BLOCKED reason=...` → **STOP procedure**. Do not continue.

`slackcli auth list` showing a workspace is **not** proof of auth. Expired tokens still list a workspace. Only `AUTH_OK` from this probe counts.

### STOP procedure

On `AUTH_BLOCKED`, or on `invalid_auth` / `not_authed` / `token_revoked` / `token_expired` from any later Slack call:

1. **Stop Slack work immediately.** End the Slack portion of this turn after the user-facing setup message.
2. **Do not** call `conversations.history`, `conversations.replies`, `conversations.list`, `conversations.read`, file download URLs, or SlackCLI message send/react.
3. **Do not** work around the gate. Forbidden:
   - `slackcli conversations read` (or any SlackCLI read of channel/thread history)
   - WebFetch / browser scrape of `slack.com/archives/...` URLs
   - Treating error JSON, empty `messages`, or URL path segments as the thread contents
   - Reusing Slack dumps from an earlier chat as this fetch
   - Skipping Slack sources and presenting the rest as complete Slack context
4. Tell the user auth is blocked (include the `reason=`). Give the setup steps below. Ask them to paste the cURL **into this chat**.
5. **Wait for the paste.** Do not ask them to run `slackcli` in a terminal. Do not treat "slack auth is ready" without a cURL as login.
6. After they paste a cURL (or tokens), follow **Login from a pasted cURL**, then run `check-auth.py` again. Still blocked → STOP again. Never skip the probe.

**Same-chat callers** (this skill used directly, or Jira cross-ref in the user chat): wait. Independent non-Slack work (for example a Jira ticket body) may continue only if you clearly mark Slack as **not collected**.

**Subagents**: return immediately with `AUTH_BLOCKED` and the reason. Do not fetch Slack another way. The parent must then STOP Slack-dependent work and ask the user to paste a Slack API cURL into the chat. Do not omit Slack from the bundle as if it had no messages.

### Setup steps to give the user

Browser session tokens. No Slack app is required. **Always ask them to paste the cURL into this chat.** Do not send them to a terminal.

1. Open the Slack workspace in a **web browser** (not the desktop app).
2. Developer Tools (F12 or Cmd+Option+I) → **Network**.
3. Refresh or send a message.
4. Find a Slack API request (for example `api/conversations.view` or `api/auth.test`).
5. Right-click → Copy → Copy as cURL.
6. Paste that cURL into this chat.

### Login from a pasted cURL (agent)

When the user pastes a cURL or `xoxc`/`xoxd` tokens: log them in here. Do not echo the cURL or tokens. Do not write them to the repo.

1. Save the paste to `/tmp/slack-curl.txt`.
2. Run with full permissions, then delete the temp file:

```bash
python3 "$HOME/.agents/profiles/default/artifacts/skills-profile-me/slack-messages/scripts/login-from-curl.py" /tmp/slack-curl.txt
rm -f /tmp/slack-curl.txt
```

3. Read the first line:
   - `LOGIN_OK ...` → run `check-auth.py`. Continue only on `AUTH_OK`.
   - `LOGIN_FAILED reason=...` → tell the user that reason (no secrets). Ask for a fresh Copy as cURL of `api/conversations.view`. STOP.

**Do not** use these (they fail):

- `slackcli auth parse-curl --login` in a terminal (interactive; user and agent shells both fail)
- `slackcli auth parse-curl --login < /tmp/slack-curl.txt` (prints `No cURL command provided`)
- `--from-clipboard` (the agent clipboard is not the browser copy)

The script URL-decodes the `d=` cookie (`xoxd`), finds `xoxc` in the body, takes the workspace host from the request URL (including `*.enterprise.slack.com`, never `app.slack.com`), and runs `slackcli auth login-browser`. `LOGIN_OK` is not enough — `check-auth.py` must still print `AUTH_OK`.

## Method Priority

| Task | Method | Why |
|---|---|---|
| Auth proof | `scripts/check-auth.py` (`auth.test`) | Only live probe; `auth list` can lie |
| Auth setup | User pastes a browser cURL into chat; agent runs `scripts/login-from-curl.py` then `check-auth.py` | Terminal `parse-curl` and stdin redirect both fail |
| Channel discovery | SlackCLI `conversations list` | **After** `AUTH_OK` only |
| Fetching messages & threads | **Direct Slack API (Python/urllib)** | Only method that returns `files` |
| Downloading images | **Direct Slack API (Python/urllib)** | Needs Bearer token and URL-encoded cookie |
| Sending messages & reactions | SlackCLI `messages send/react` | **After** `AUTH_OK` only |

There is **no** fallback for reading messages.

## Install SlackCLI

Before the probe, verify the CLI (needed for later login and channel list):

```bash
which slackcli 2>/dev/null && slackcli --version || echo "NOT_INSTALLED"
```

If `NOT_INSTALLED`, detect with `uname -ms` and install:

- `Darwin arm64` → `slackcli-macos-arm64`
- `Darwin x86_64` → `slackcli-macos`
- `Linux x86_64` → `slackcli-linux`

```bash
curl -L https://github.com/shaharia-lab/slackcli/releases/latest/download/slackcli-macos-arm64 -o /tmp/slackcli && \
chmod +x /tmp/slackcli && mkdir -p ~/.local/bin && mv /tmp/slackcli ~/.local/bin/slackcli
```

Swap the filename for Intel or Linux. Then `export PATH="$HOME/.local/bin:$PATH"`. Tell the user to add that line to `~/.zshrc` or `~/.bashrc`.

Install failure does not replace the probe. Still run `check-auth.py` (tokens may already exist). If the probe blocks, STOP.

## Shell Permissions

**All SlackCLI commands, `check-auth.py`, `login-from-curl.py`, Direct API calls, and image downloads MUST run with `required_permissions: ["all"]`.**

They need network access and `~/.config/slackcli/`. The default sandbox blocks both.

## Extracting Tokens from workspaces.json

Use this **only after** `AUTH_OK`. SlackCLI stores browser tokens in `~/.config/slackcli/workspaces.json`. The `workspaces` field is a **dict keyed by workspace ID**, not a list:

```python
import json, os, urllib.parse

with open(os.path.expanduser('~/.config/slackcli/workspaces.json')) as f:
    data = json.load(f)

ws_id = data.get('default_workspace') or next(iter(data['workspaces']))
ws = data['workspaces'][ws_id]

xoxc = ws['xoxc_token'].strip()
xoxd = ws['xoxd_token'].strip()
workspace_url = ws['workspace_url']

# CRITICAL: xoxd cookie value MUST be URL-encoded for API calls
encoded_xoxd = urllib.parse.quote(xoxd, safe='')
```

## Channel discovery (after AUTH_OK)

```bash
slackcli conversations list
slackcli conversations list | grep -i "channel-name"
```

Do not use SlackCLI to read message history.

## Fetching Messages with File Attachments (Direct Slack API)

Preferred method. SlackCLI strips `files`. No SlackCLI fallback if this fails.

Auth errors from these calls (`invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive`) → **STOP procedure**. Other API errors (`channel_not_found`, `thread_not_found`) → report the error and stop that source; still no SlackCLI read.

### Fetch Channel History

```python
python3 << 'PYEOF'
import json, os, urllib.request, urllib.parse, sys

AUTH_FAIL = {'invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive'}

with open(os.path.expanduser('~/.config/slackcli/workspaces.json')) as f:
    data = json.load(f)

ws_id = data.get('default_workspace') or next(iter(data['workspaces']))
ws = data['workspaces'][ws_id]
xoxc = ws['xoxc_token'].strip()
xoxd = ws['xoxd_token'].strip()
encoded_xoxd = urllib.parse.quote(xoxd, safe='')
workspace_url = ws['workspace_url']

url = f'{workspace_url}/api/conversations.history'
params = urllib.parse.urlencode({
    'token': xoxc,
    'channel': '<CHANNEL_ID>',
    'limit': '50'
}).encode()

req = urllib.request.Request(url, data=params)
req.add_header('Content-Type', 'application/x-www-form-urlencoded')
req.add_header('Cookie', f'd={encoded_xoxd};')

resp = urllib.request.urlopen(req)
result = json.loads(resp.read().decode())

with open('/tmp/slack-messages.json', 'w') as f:
    f.write(json.dumps(result, indent=2))

if not result.get('ok'):
    err = result.get('error', 'unknown')
    if err in AUTH_FAIL:
        print(f'AUTH_BLOCKED reason={err}')
    else:
        print(f'API_ERROR error={err}')
    sys.exit(1)

for m in result.get('messages', []):
    files = m.get('files', [])
    print(f"ts={m['ts']} files={len(files)} text={m.get('text','')[:80]}")
PYEOF
```

### Fetch Thread Replies

```python
python3 << 'PYEOF'
import json, os, urllib.request, urllib.parse, sys

AUTH_FAIL = {'invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive'}

with open(os.path.expanduser('~/.config/slackcli/workspaces.json')) as f:
    data = json.load(f)

ws_id = data.get('default_workspace') or next(iter(data['workspaces']))
ws = data['workspaces'][ws_id]
xoxc = ws['xoxc_token'].strip()
xoxd = ws['xoxd_token'].strip()
encoded_xoxd = urllib.parse.quote(xoxd, safe='')
workspace_url = ws['workspace_url']

url = f'{workspace_url}/api/conversations.replies'
params = urllib.parse.urlencode({
    'token': xoxc,
    'channel': '<CHANNEL_ID>',
    'ts': '<THREAD_TS>',
    'limit': '100'
}).encode()

req = urllib.request.Request(url, data=params)
req.add_header('Content-Type', 'application/x-www-form-urlencoded')
req.add_header('Cookie', f'd={encoded_xoxd};')

resp = urllib.request.urlopen(req)
result = json.loads(resp.read().decode())

with open('/tmp/slack-thread.json', 'w') as f:
    f.write(json.dumps(result, indent=2))

if not result.get('ok'):
    err = result.get('error', 'unknown')
    if err in AUTH_FAIL:
        print(f'AUTH_BLOCKED reason={err}')
    else:
        print(f'API_ERROR error={err}')
    sys.exit(1)

for m in result.get('messages', []):
    files = m.get('files', [])
    print(f"ts={m['ts']} files={len(files)} text={m.get('text','')[:80]}")
    for fi in files:
        print(f"  FILE: {fi.get('name')} mimetype={fi.get('mimetype')} url={fi.get('url_private','')[:100]}")
PYEOF
```

### Parsing Slack URLs

URL like `https://workspace.slack.com/archives/C1234567890/p1234567890123456`:

- **Channel ID:** after `/archives/` → `C1234567890`
- **Message timestamp:** drop `p`, insert a dot before the last 6 digits → `1234567890.123456`

Use `conversations.replies` for the thread, or `conversations.history` with `oldest`/`latest`. Parsing the URL is not a fetch. Do not invent message text from the URL.

## JSON Output Structure (Direct API)

```json
{
  "ok": true,
  "messages": [
    {
      "ts": "1234567890.123456",
      "thread_ts": "1234567890.123456",
      "text": "Message text here",
      "user": "U1234567",
      "reply_count": 3,
      "files": [
        {
          "id": "F08XXXXXXXX",
          "name": "screenshot.png",
          "mimetype": "image/png",
          "url_private": "https://files.slack.com/files-pri/...",
          "url_private_download": "https://files.slack.com/files-tmb/..."
        }
      ]
    }
  ]
}
```

Key fields: `ts`, `thread_ts`, `reply_count`, `files` (Direct API only), `user`.

## Downloading and Viewing Image Attachments

When messages contain image mimetypes (`image/png`, `image/jpeg`, `image/gif`, `image/webp`), download and analyze them. Both the Bearer token and the URL-encoded cookie are required.

```python
python3 << 'PYEOF'
import json, os, urllib.request, urllib.parse

with open(os.path.expanduser('~/.config/slackcli/workspaces.json')) as f:
    data = json.load(f)

ws_id = data.get('default_workspace') or next(iter(data['workspaces']))
ws = data['workspaces'][ws_id]
xoxc = ws['xoxc_token'].strip()
xoxd = ws['xoxd_token'].strip()
encoded_xoxd = urllib.parse.quote(xoxd, safe='')

with open('/tmp/slack-thread.json') as f:
    result = json.load(f)

img_num = 0
for m in result.get('messages', []):
    for fi in m.get('files', []):
        mimetype = fi.get('mimetype', '')
        if not mimetype.startswith('image/'):
            continue
        img_num += 1
        url_private = fi.get('url_private', '')
        name = fi.get('name', f'image_{img_num}.png')

        req = urllib.request.Request(url_private)
        req.add_header('Authorization', f'Bearer {xoxc}')
        req.add_header('Cookie', f'd={encoded_xoxd};')

        resp = urllib.request.urlopen(req)
        img_data = resp.read()

        outpath = f'/tmp/slack-image-{img_num}.png'
        with open(outpath, 'wb') as f_out:
            f_out.write(img_data)
        print(f'Saved {name} ({len(img_data)} bytes) -> {outpath}')

print(f'Total images: {img_num}')
PYEOF
```

Verify:

```bash
file /tmp/slack-image-*.png
```

- `PNG image data` or `JPEG image data` → success
- `HTML document` or a very small file → treat as `AUTH_BLOCKED` and follow **STOP procedure**. Do not describe the HTML as a screenshot.

Read each image with the Read tool (`/tmp/slack-image-1.png`, and so on).

## Complete Workflow

When the user asks to read Slack messages:

1. **Install SlackCLI** if missing.
2. **Auth gate** — run `check-auth.py`. `AUTH_BLOCKED` → STOP procedure. Do not go to step 3.
3. **Find the channel** — if the user gave a name, `slackcli conversations list` (only after `AUTH_OK`).
4. **Parse the Slack URL** if provided.
5. **Fetch with the Direct Slack API** (`conversations.history` or `conversations.replies`). Auth error → STOP procedure. Other API error → report it; no SlackCLI read.
6. **Read the saved JSON** with the Read tool.
7. **If `reply_count > 0`**, fetch the thread with `conversations.replies`.
8. **Download image files**, verify with `file`, Read each image. HTML downloads → STOP procedure.
9. **Build the timeline** with images nested under their parent events.
10. **`Unmapped images`** only for images that cannot be tied to a Slack message/reply or Jira comment.
11. Present message text, author, timestamp, replies, and image descriptions in readable plain text. Never mention temp files.

**CRITICAL:** In Jira cross-reference scenarios, steps 8–10 are required even when images are only in replies. Do not summarize Slack text without downloading its images. Mapped images stay under their parent events. None of this runs until the auth gate passes.

## Cross-Referencing Jira Tickets

When parsing Slack message text, look for **Jira ticket keys** `[A-Z]+-\d+` (for example `PROJ-1234`), Slack-formatted Jira links, or browse URLs.

**When a Jira ticket reference is found:**

1. Trigger **atlassian-cli-tickets** (`~/.agents/profiles/default/artifacts/skills-profile-me/atlassian-cli-tickets/SKILL.md`).
2. Fetch with `acli jira workitem view <KEY> --fields "*all" --json`.
3. Download and display ticket image attachments.
4. Include summary, status, description, and attachment descriptions with the Slack content.
5. If both Jira comments and Slack messages exist, one chronological timeline labeled by source.

Do **not** ask whether to fetch the Jira ticket. Asking the user to set up **Slack** auth is required when the gate blocks.

### Combined Jira + Slack Timeline (when both exist)

- One unified timeline, oldest first
- Source labels (`[Jira comment]`, `[Slack message]`)
- Thread replies at their timestamps
- Attachments under the event that contains them
- De-duplicate mirrored bot/system messages when possible

`Unmapped images` only for images that cannot be tied to a Slack message/reply or Jira comment.

## Sending Messages (after AUTH_OK)

```bash
slackcli messages send --recipient-id=<CHANNEL_ID> --message="Hello!"
slackcli messages send --recipient-id=<CHANNEL_ID> --thread-ts=<TS> --message="Reply text"
```

## Adding Reactions (after AUTH_OK)

```bash
slackcli messages react --channel-id=<CHANNEL_ID> --timestamp=<TS> --emoji=thumbsup
```

## Troubleshooting

### AUTH_BLOCKED / no workspaces / expired tokens

Follow **STOP procedure**. Ask the user to paste a Slack API cURL into this chat. Do not treat `slackcli auth list` as success. Do not read messages with SlackCLI even if it still "works" after Direct API `invalid_auth`.

### parse-curl / terminal login

Do not send the user to `slackcli auth parse-curl --login`. Redirected stdin is ignored (`No cURL command provided`). Always paste-into-chat, then `login-from-curl.py`.

### Cookie Must Be URL-Encoded

The `xoxd` token contains characters like `/`. Always `urllib.parse.quote(xoxd, safe='')` in the `Cookie` header. Skipping encoding yields `invalid_auth` with valid tokens.

### SlackCLI Strips File Attachments

`--json` does not include `files`. Never use SlackCLI to detect or download attachments.

### Command Not Found

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Suggest adding that to `~/.zshrc` or `~/.bashrc`.

### File Download Returns HTML

Expired or incomplete auth. STOP procedure. Both `Authorization: Bearer <xoxc>` and `Cookie: d=<url-encoded-xoxd>` are required.

### Network / Sandbox Errors

Use `required_permissions: ["all"]`. A sandbox failure is not permission to skip the probe or use a read fallback.
