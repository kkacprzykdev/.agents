---
name: analyse-har
description: Parses HTTP Archive (.har) files with a local script and reports slow, failed, and domain-related requests without loading the HAR into the model. Use when the user gives a .har path, asks to analyse a HAR / Chrome network export, or debug slow or failed browser requests from a capture.
---

# Analyse HAR

Large HAR files (tens or hundreds of MB) must **not** go into the model, chat attachments, or a subagent prompt. Parse them with the script in this skill. Chat jsonl transcripts are **not** the reusable artifact — this workflow is.

## Hard rules

1. Need a **filesystem path**. If the user wants to upload, tell them to put the file on disk first. Chat upload often fails past a few MB, and HARs contain cookies and tokens.
2. **Never** `Read` the HAR. **Never** attach it. **Never** `cat` / `head` the JSON into the parent context.
3. **Never** print Cookie, Authorization, Set-Cookie, CSRF, JWTs, emails, or raw query strings that contain tokens. The script redacts these; do not undo that in the write-up.
4. **Never** commit a HAR. Write reports only under `/tmp` (or another path the user names outside git).
5. Run the parse in a **subagent**. The parent only reads the **text report**.

## Script

Canonical path: `~/.agents/profiles/default/artifacts/skills-profile-me/analyse-har/scripts/analyze_har.py` (stdlib only).

```bash
python3 ~/.agents/profiles/default/artifacts/skills-profile-me/analyse-har/scripts/analyze_har.py "$HAR" \
  --out /tmp/har-report.txt \
  --focus api --focus example.com \
  --since 2026-08-25T14:52:00+00:00 \
  --until 2026-08-26T06:05:00+00:00
```

- `--focus` is repeatable. Pass host or path needles for the bug (`api`, a hostname, an issue key). With no `--focus`, the related section is empty; slow/fail/websocket still run.
- `--since` / `--until` are the **claimed incident window**, not the capture window. Omit them if the user did not give one.
- Confirm the file exists and is valid HAR (`log.entries`) via the script output (`UNREADABLE` / `INVALID`).

If `json.load` runs out of memory, say so and stop. Do not stream raw entries into the model as a workaround.

## Profile references

Resolve the Active profile first (`profile-references.mdc`). If that profile has `references/analyse-har.md`, apply those classifiers. If the reference is missing, stay generic: do not assume product URL shapes, webhook directions, or websocket path names.

## What the agent must still check

The script lists timings. The agent interprets:

- **Capture window vs incident window.** Zero overlap → this HAR cannot explain that incident.
- **Browser HAR limits.** It records what the browser did. It does **not** show server-to-server traffic (webhooks into another service, worker jobs, inbound sync). Absence of those in a browser HAR is expected, not a finding.
- **Wrong issue key / wrong hour** vs the ticket still matters even when all related calls are 2xx.

Optional second pass in the same subagent (still script-only, still redacted): inspect sanitized bodies of related POST/PUT/GET, and `_webSocketMessages` for `--focus` needles. Do not paste bodies into the parent.

## Report back

Structured, short:

- Capture window, span, overlap with the incident window
- Related flow found vs not found (the user-named flow)
- Suspicious items, or “nothing clearly suspicious **for this capture**”
- Slowest ~15 (host+path, status, ms) — skip static/asset noise unless it is the question
- Related failures
- Verdict: can this HAR explain the claimed problem? yes / no / partial, and why
- Next evidence if this file is the wrong window or the wrong direction (e.g. server logs for traffic the browser never saw)

## Do not

- Tell the user to rename `.har` → `.txt` so they can attach it here.
- Treat the first HAR on a ticket as covering a later, different flow.
- Re-open agent-transcript jsonl files as if they were HAR parsers.
