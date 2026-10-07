#!/usr/bin/env python3
"""Live Slack auth probe. Prints AUTH_OK or AUTH_BLOCKED. Exit 0 or 1."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

WORKSPACES_PATH = os.path.expanduser("~/.config/slackcli/workspaces.json")
AUTH_ERRORS = {
    "invalid_auth",
    "not_authed",
    "token_revoked",
    "token_expired",
    "account_inactive",
}


def blocked(reason, detail=""):
    extra = f" detail={detail}" if detail else ""
    print(f"AUTH_BLOCKED reason={reason}{extra}")
    sys.exit(1)


def main():
    if not os.path.isfile(WORKSPACES_PATH):
        blocked("no_workspaces_file")

    try:
        with open(WORKSPACES_PATH) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        blocked("workspaces_unreadable", str(e))

    workspaces = data.get("workspaces") or {}
    if not workspaces:
        blocked("no_workspaces_configured")

    ws_id = data.get("default_workspace") or next(iter(workspaces))
    ws = workspaces.get(ws_id)
    if not isinstance(ws, dict):
        blocked("workspace_missing", str(ws_id))

    xoxc = (ws.get("xoxc_token") or "").strip()
    xoxd = (ws.get("xoxd_token") or "").strip()
    workspace_url = (ws.get("workspace_url") or "").rstrip("/")

    if not xoxc or not xoxd:
        blocked("missing_tokens")
    if not xoxc.startswith("xoxc-") or not xoxd.startswith("xoxd-"):
        blocked("malformed_tokens")
    if not workspace_url:
        blocked("missing_workspace_url")

    encoded_xoxd = urllib.parse.quote(xoxd, safe="")
    url = f"{workspace_url}/api/auth.test"
    params = urllib.parse.urlencode({"token": xoxc}).encode()
    req = urllib.request.Request(url, data=params)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Cookie", f"d={encoded_xoxd};")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        blocked("http_error", str(e.code))
    except urllib.error.URLError as e:
        blocked("network_error", str(getattr(e, "reason", e)))
    except Exception as e:
        blocked("probe_failed", type(e).__name__)

    if result.get("ok"):
        user = result.get("user") or ""
        team = result.get("team") or ""
        print(f"AUTH_OK user={user} team={team} workspace_url={workspace_url}")
        sys.exit(0)

    err = result.get("error") or "unknown"
    if err in AUTH_ERRORS:
        blocked(err)
    blocked("auth_test_failed", err)


if __name__ == "__main__":
    main()
