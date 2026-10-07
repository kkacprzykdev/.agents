#!/usr/bin/env python3
"""Login SlackCLI from a pasted browser cURL. Prints LOGIN_OK or LOGIN_FAILED. Never prints tokens."""

import os
import re
import shutil
import subprocess
import sys
import urllib.parse

SKIP_HOSTS = {
    "app.slack.com",
    "files.slack.com",
    "slack.com",
    "api.slack.com",
    "edgeapi.slack.com",
    "slack-edge.com",
}

XOXC_RE = re.compile(r"xoxc-[A-Za-z0-9-]+")
XOXD_RE = re.compile(r"xoxd-[A-Za-z0-9%+/=_-]+")
HOST_RE = re.compile(r"https://([A-Za-z0-9.-]+\.slack\.com)")
TOKEN_FIELD_RE = re.compile(
    r"""name=["']token["'](?:\\r\\n|\\n|\r\n|\n)+[ \t]*(xoxc-[A-Za-z0-9-]+)""",
    re.IGNORECASE,
)
TOKEN_KV_RE = re.compile(
    r"""(?:["']token["']\s*[:=]\s*["']?|token=)(xoxc-[A-Za-z0-9-]+)"""
)
COOKIE_D_RE = re.compile(r"(?:^|[;\s])d=(xoxd-[^;\s'\"]+)", re.IGNORECASE)


def fail(reason, detail=""):
    extra = f" detail={detail}" if detail else ""
    print(f"LOGIN_FAILED reason={reason}{extra}")
    sys.exit(1)


def extract_xoxc(text):
    for rx in (TOKEN_FIELD_RE, TOKEN_KV_RE):
        m = rx.search(text)
        if m:
            return m.group(1)
    m = XOXC_RE.search(text)
    return m.group(0) if m else None


def extract_xoxd(text):
    m = COOKIE_D_RE.search(text)
    raw = m.group(1) if m else None
    if not raw:
        m = XOXD_RE.search(text)
        raw = m.group(0) if m else None
    if not raw:
        return None
    return urllib.parse.unquote(raw)


def extract_workspace_url(text):
    for m in HOST_RE.finditer(text):
        host = m.group(1).lower()
        if host in SKIP_HOSTS or "slack-edge" in host:
            continue
        return f"https://{host}"
    return None


def extract(text):
    return extract_xoxc(text), extract_xoxd(text), extract_workspace_url(text)


def redact(s, xoxc, xoxd):
    if xoxc:
        s = s.replace(xoxc, "[xoxc]")
    if xoxd:
        s = s.replace(xoxd, "[xoxd]")
        s = s.replace(urllib.parse.quote(xoxd, safe=""), "[xoxd]")
    return s


def slackcli_bin():
    found = shutil.which("slackcli")
    if found:
        return found
    home = os.path.expanduser("~/.local/bin/slackcli")
    return home if os.path.isfile(home) else None


def login(xoxc, xoxd, workspace_url):
    bin_path = slackcli_bin()
    if not bin_path:
        fail("slackcli_missing")
    env = os.environ.copy()
    local_bin = os.path.expanduser("~/.local/bin")
    env["PATH"] = f"{local_bin}:{env.get('PATH', '')}"
    cmd = [
        bin_path,
        "auth",
        "login-browser",
        f"--xoxd={xoxd}",
        f"--xoxc={xoxc}",
        f"--workspace-url={workspace_url}",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    out = redact((r.stdout or "") + (r.stderr or ""), xoxc, xoxd)
    if r.returncode != 0:
        fail("login_browser_failed", out.strip().splitlines()[-1] if out.strip() else "exit_%s" % r.returncode)
    print(f"LOGIN_OK workspace_url={workspace_url}")


def self_test():
    sample = r"""curl --url 'https://acme.enterprise.slack.com/api/conversations.view' \
  -H 'origin: https://app.slack.com' \
  -b 'foo=1; d=xoxd-abc%2Fdef%3D%3D; bar=2' \
  --data-raw $'------B\r\nContent-Disposition: form-data; name="token"\r\n\r\nxoxc-1-2-3-deadbeef\r\n------B--\r\n'
"""
    xoxc, xoxd, workspace_url = extract(sample)
    assert xoxc == "xoxc-1-2-3-deadbeef", xoxc
    assert xoxd == "xoxd-abc/def==", xoxd
    assert workspace_url == "https://acme.enterprise.slack.com", workspace_url
    header = """curl 'https://team.slack.com/api/auth.test' -H 'cookie: d=xoxd-plainToken; tz=120' --data 'token=xoxc-aaa-bbb'"""
    xoxc, xoxd, workspace_url = extract(header)
    assert xoxc == "xoxc-aaa-bbb", xoxc
    assert xoxd == "xoxd-plainToken", xoxd
    assert workspace_url == "https://team.slack.com", workspace_url
    print("SELF_TEST_OK")


def main(argv):
    if "--self-test" in argv:
        self_test()
        return
    if len(argv) > 1 and not argv[1].startswith("-"):
        with open(argv[1], encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    if not text.strip():
        fail("empty_curl")
    xoxc, xoxd, workspace_url = extract(text)
    if not xoxc:
        fail("missing_xoxc")
    if not xoxd:
        fail("missing_xoxd")
    if not xoxd.startswith("xoxd-"):
        fail("malformed_xoxd")
    if not workspace_url:
        fail("missing_workspace_url")
    if "--dry-run" in argv:
        print(f"EXTRACT_OK workspace_url={workspace_url}")
        return
    login(xoxc, xoxd, workspace_url)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except AssertionError as e:
        fail("self_test_failed", str(e))
    except OSError as e:
        fail("io_error", type(e).__name__)
