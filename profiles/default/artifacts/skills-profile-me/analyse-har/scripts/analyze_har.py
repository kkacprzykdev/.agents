#!/usr/bin/env python3
"""One-pass HAR summary. Never prints cookies, tokens, or emails."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit

SECRET_QUERY_KEYS = {
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "auth",
    "authorization",
    "code",
    "client_secret",
    "secret",
    "csrf",
    "xsrf",
    "jwt",
    "session",
    "sessionid",
    "sid",
    "password",
    "passwd",
    "api_key",
    "apikey",
    "key",
    "oauth_token",
    "oauth_verifier",
    "state",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
LONG_HEX_RE = re.compile(r"\b[0-9a-fA-F]{32,}\b")
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")

lines: list[str] = []


def out(s: str = "") -> None:
    lines.append(s)


def parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def redact_text(s: str, limit: int = 400) -> str:
    if not s:
        return ""
    s = EMAIL_RE.sub("[EMAIL]", s)
    s = JWT_RE.sub("[JWT]", s)
    s = UUID_RE.sub("[UUID]", s)
    s = LONG_HEX_RE.sub("[HEX]", s)
    s = re.sub(
        r"(?i)(cookie|authorization|set-cookie|csrf|xsrf|token|password)\s*[:=]\s*[^,\s\"']+",
        r"\1=[REDACTED]",
        s,
    )
    s = s.replace("\n", " ").replace("\r", " ")
    if len(s) > limit:
        s = s[:limit] + "…"
    return s


def safe_host_path(url: str) -> tuple[str, str, str]:
    try:
        parts = urlsplit(url)
    except Exception:
        return ("<unparseable>", "/", "<unparseable>")
    host = parts.hostname or parts.netloc or "<nohost>"
    path = parts.path or "/"
    q: list[tuple[str, str]] = []
    has_secret_q = False
    try:
        for k, v in parse_qsl(parts.query, keep_blank_values=True):
            lk = k.lower()
            if (
                lk in SECRET_QUERY_KEYS
                or "token" in lk
                or "secret" in lk
                or "csrf" in lk
                or "auth" in lk
            ):
                q.append((k, "[REDACTED]"))
                has_secret_q = True
            else:
                vv = EMAIL_RE.sub("[EMAIL]", v)
                if len(vv) > 80:
                    vv = vv[:20] + "…"
                q.append((k, vv))
    except Exception:
        has_secret_q = True
    query = urlencode(q) if q else ""
    if has_secret_q:
        display = f"{host}{path}?[REDACTED_QUERY]"
    elif query:
        display = f"{host}{path}?{query}" if len(query) < 120 else f"{host}{path}?[truncated]"
    else:
        display = f"{host}{path}"
    return host, path, display


def normalize_path(path: str) -> str:
    p = path
    p = re.sub(r"/[0-9]{5,}", "/{id}", p)
    p = UUID_RE.sub("{uuid}", p)
    return p


def looks_focus(url: str, host: str, path: str, needles: list[str]) -> bool:
    if not needles:
        return False
    blob = f"{url}\n{host}\n{path}".lower()
    return any(n.lower() in blob for n in needles)


def status_of(entry: dict) -> int:
    try:
        return int(entry.get("response", {}).get("status", 0) or 0)
    except Exception:
        return 0


def time_of(entry: dict) -> float:
    try:
        return float(entry.get("time") or 0)
    except Exception:
        return 0.0


def method_of(entry: dict) -> str:
    return (entry.get("request") or {}).get("method") or "?"


def url_of(entry: dict) -> str:
    return (entry.get("request") or {}).get("url") or ""


def mime_of(entry: dict) -> str:
    return ((entry.get("response") or {}).get("content") or {}).get("mimeType") or ""


def body_size(entry: dict, which: str) -> int:
    try:
        if which == "req":
            return int((entry.get("request") or {}).get("bodySize") or 0)
        return int((entry.get("response") or {}).get("bodySize") or 0)
    except Exception:
        return 0


def content_size(entry: dict) -> int:
    c = (entry.get("response") or {}).get("content") or {}
    try:
        sz = int(c.get("size") or 0)
    except Exception:
        sz = 0
    text = c.get("text")
    if isinstance(text, str) and not sz:
        sz = len(text)
    return sz


def extract_error_snippet(entry: dict) -> str | None:
    c = (entry.get("response") or {}).get("content") or {}
    text = c.get("text")
    if not isinstance(text, str) or not text:
        return None
    text = text[:8000]
    try:
        obj = json.loads(text)
    except Exception:
        low = text.lower()
        if any(
            w in low
            for w in (
                "error",
                "fail",
                "timeout",
                "denied",
                "unauthorized",
                "forbidden",
                "ratelimit",
                "rate limit",
            )
        ):
            return redact_text(text, 240)
        return None
    msgs: list[str] = []

    def walk(o, depth=0):
        if depth > 6 or len(msgs) > 6:
            return
        if isinstance(o, dict):
            for k, v in o.items():
                lk = str(k).lower()
                if lk in ("cookie", "authorization", "token", "password", "email", "csrf"):
                    continue
                if lk in (
                    "error",
                    "message",
                    "errormessage",
                    "reason",
                    "detail",
                    "details",
                    "code",
                    "status",
                    "errorcode",
                    "error_code",
                    "title",
                    "type",
                ):
                    if isinstance(v, (str, int)):
                        msgs.append(f"{k}={redact_text(str(v), 160)}")
                    else:
                        walk(v, depth + 1)
                elif lk in ("errors", "errormessages"):
                    walk(v, depth + 1)
                else:
                    walk(v, depth + 1)
        elif isinstance(o, list):
            for x in o[:8]:
                walk(x, depth + 1)
        elif isinstance(o, str) and any(w in o.lower() for w in ("error", "fail", "timeout")):
            msgs.append(redact_text(o, 160))

    walk(obj)
    if msgs:
        return "; ".join(msgs)[:400]
    return None


def blocked_reason(entry: dict) -> str | None:
    for k in ("_blocked_reason", "_error", "comment"):
        v = entry.get(k)
        if isinstance(v, str) and v:
            return redact_text(v, 120)
    t = entry.get("timings") or {}
    try:
        if float(t.get("blocked") or 0) > 0 and status_of(entry) == 0:
            return f"timings.blocked={t.get('blocked')}"
    except Exception:
        pass
    return None


def ws_hint(entry: dict) -> str | None:
    url = url_of(entry).lower()
    mime = mime_of(entry).lower()
    if "websocket" in mime or url.startswith("ws:") or url.startswith("wss:"):
        return "websocket"
    path = urlsplit(url).path.lower()
    if "/cometd" in url or "/socket.io" in url or path.endswith("/ws") or "/mux" in path:
        return "possible-ws"
    return None


def ws_messages(entry: dict) -> list:
    msgs = entry.get("_webSocketMessages") or entry.get("webSocketMessages")
    return msgs if isinstance(msgs, list) else []


def rec_of(i: int, e: dict, host: str, path: str, display: str, np: str) -> dict:
    dt = parse_dt(e.get("startedDateTime"))
    rtype = e.get("_resourceType") or ""
    return {
        "i": i,
        "dt": dt.isoformat() if dt else None,
        "method": method_of(e),
        "host": host,
        "path": path,
        "npath": np,
        "display": display,
        "status": status_of(e),
        "time": round(time_of(e), 1),
        "req_size": body_size(e, "req"),
        "resp_size": max(body_size(e, "resp"), content_size(e)),
        "mime": mime_of(e)[:80],
        "rtype": str(rtype)[:40],
        "blocked": blocked_reason(e),
        "ws": ws_hint(e),
        "dt_obj": dt,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Summarize a HAR without printing secrets.")
    p.add_argument("har", help="Path to .har file")
    p.add_argument("--out", default="/tmp/har-report.txt", help="Report path")
    p.add_argument(
        "--focus",
        action="append",
        default=[],
        help="Substring to treat as related (repeatable). Example: --focus jira --focus atlassian",
    )
    p.add_argument("--since", help="Incident window start (ISO-8601)")
    p.add_argument("--until", help="Incident window end (ISO-8601)")
    p.add_argument("--max-related", type=int, default=300, help="Cap related-entry detail lines")
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    needles = args.focus
    win_start = parse_dt(args.since) if args.since else None
    win_end = parse_dt(args.until) if args.until else None

    try:
        with open(args.har, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        out(f"UNREADABLE: {type(e).__name__}: {e}")
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print("\n".join(lines))
        return 1

    if not isinstance(data, dict) or "log" not in data:
        out("INVALID: top-level is not HAR (missing log)")
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print("\n".join(lines))
        return 1

    log = data["log"]
    entries = log.get("entries")
    if not isinstance(entries, list):
        out("INVALID: log.entries missing or not a list")
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print("\n".join(lines))
        return 1

    creator = log.get("creator") or {}
    browser = log.get("browser") or {}
    pages = log.get("pages") or []

    methods = Counter()
    status_bucket = Counter()
    hosts = Counter()
    resource_types = Counter()
    path_counts = Counter()
    related_path_counts = Counter()
    slow_1k: list[dict] = []
    slow_by_path: dict[tuple, list[float]] = defaultdict(list)
    failures: list[dict] = []
    related: list[dict] = []
    ws_entries: list[dict] = []
    huge_payloads: list[dict] = []
    preflight_fail: list[dict] = []
    focus_ws_frames = 0
    ws_with_frames = 0
    window_hits = 0
    min_dt = None
    max_dt = None

    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            continue
        url = url_of(e)
        host, path, display = safe_host_path(url)
        method = method_of(e)
        st = status_of(e)
        tms = time_of(e)
        dt = parse_dt(e.get("startedDateTime"))
        np = normalize_path(path)
        rtype = e.get("_resourceType") or ""
        rec = rec_of(i, e, host, path, display, np)

        methods[method] += 1
        hosts[host] += 1
        if rtype:
            resource_types[str(rtype)] += 1
        if st == 0:
            status_bucket["0"] += 1
        elif 200 <= st < 300:
            status_bucket["2xx"] += 1
        elif 300 <= st < 400:
            status_bucket["3xx"] += 1
        elif 400 <= st < 500:
            status_bucket["4xx"] += 1
        elif 500 <= st < 600:
            status_bucket["5xx"] += 1
        else:
            status_bucket[str(st)] += 1

        path_counts[(method, host, np)] += 1

        if dt:
            if min_dt is None or dt < min_dt:
                min_dt = dt
            if max_dt is None or dt > max_dt:
                max_dt = dt
            if win_start and win_end and win_start <= dt <= win_end:
                window_hits += 1

        is_rel = looks_focus(url, host, path, needles)
        if rec["ws"]:
            ws_entries.append(rec)
        msgs = ws_messages(e)
        if msgs:
            ws_with_frames += 1
            for msg in msgs:
                data_s = msg.get("data")
                if isinstance(data_s, str) and looks_focus(data_s, "", "", needles):
                    focus_ws_frames += 1

        if tms >= 1000:
            slow_1k.append(rec)
            slow_by_path[(method, host, np)].append(tms)

        failish = st == 0 or st >= 400
        if rec["blocked"] and any(
            x in rec["blocked"].lower() for x in ("block", "timeout", "net::")
        ):
            failish = True
        if failish:
            rec_f = dict(rec)
            rec_f["error_snip"] = extract_error_snippet(e) if is_rel else None
            failures.append(rec_f)

        if method == "OPTIONS" and (st == 0 or st >= 400):
            preflight_fail.append(rec)

        if rec["resp_size"] >= 2_000_000 or rec["req_size"] >= 500_000:
            huge_payloads.append(rec)

        if is_rel:
            related.append(rec)
            related_path_counts[(method, host, np)] += 1
            if tms >= 1000 or st == 0 or st >= 400:
                rec["error_snip"] = extract_error_snippet(e)

    out("=== HAR VALID ===")
    out(f"path: {args.har}")
    out(f"HAR version: {log.get('version')}")
    out(
        "creator: "
        + redact_text(str(creator.get("name", "")))
        + " "
        + redact_text(str(creator.get("version", "")))
    )
    if browser:
        out(
            "browser: "
            + redact_text(str(browser.get("name", "")))
            + " "
            + redact_text(str(browser.get("version", "")))
        )
    out(f"pages: {len(pages)}")
    for p in pages[:8]:
        title = redact_text(str(p.get("title") or ""), 80)
        out(f"  page id={p.get('id')} started={p.get('startedDateTime')} title={title}")
    out(f"entry_count: {len(entries)}")
    out(f"focus_needles: {needles or '(none — related section empty)'}")
    out()

    out("=== CAPTURE WINDOW ===")
    if min_dt and max_dt:
        span = (max_dt - min_dt).total_seconds()
        out(f"startedDateTime min: {min_dt.isoformat()}")
        out(f"startedDateTime max: {max_dt.isoformat()}")
        out(f"capture_span_seconds: {span:.1f}")
        out(f"capture_span_human: {span/3600:.2f} hours ({span/60:.1f} min)")
        if win_start and win_end:
            out(f"incident_window: {win_start.isoformat()} .. {win_end.isoformat()}")
            overlaps = not (max_dt < win_start or min_dt > win_end)
            out(f"overlaps_incident_window: {overlaps}")
            out(f"entries_inside_incident_window: {window_hits}")
        else:
            out("incident_window: (not provided)")
        try:
            from zoneinfo import ZoneInfo

            local = ZoneInfo("Europe/Warsaw")
            out(f"min_local_Europe/Warsaw: {min_dt.astimezone(local).isoformat()}")
            out(f"max_local_Europe/Warsaw: {max_dt.astimezone(local).isoformat()}")
        except Exception:
            pass
    else:
        out("NO startedDateTime found on entries")
    out()

    out("=== STATUS / METHOD OVERVIEW ===")
    out(f"methods: {dict(methods)}")
    out(f"status_buckets: {dict(status_bucket)}")
    out(f"resource_types: {dict(resource_types.most_common(20))}")
    out(f"unique_hosts: {len(hosts)}")
    out("top_hosts:")
    for h, c in hosts.most_common(25):
        out(f"  {c:5d}  {h}")
    out()

    out("=== RELATED ENTRIES ===")
    out(f"related_count: {len(related)}")
    out("related_path_groups:")
    for (m, h, pth), c in related_path_counts.most_common(80):
        out(f"  {c:4d}  {m:7s}  {h}{pth}")
    out("related_entries_detail:")
    show = related[: args.max_related]
    if len(related) > args.max_related:
        out(f"  (showing first {args.max_related} of {len(related)})")
    for r in show:
        extra = f"  err={r['error_snip']}" if r.get("error_snip") else ""
        out(
            f"  {r['dt']}  {r['method']:7s}  {r['status']:3d}  {r['time']:8.1f}ms  {r['display']}{extra}"
        )
    out()

    out("=== SLOW REQUESTS (>=1000ms) ===")
    out(f"count_ge_1000ms: {len(slow_1k)}")
    ge5 = [r for r in slow_1k if r["time"] >= 5000]
    ge30 = [r for r in slow_1k if r["time"] >= 30000]
    out(f"count_ge_5000ms: {len(ge5)}")
    out(f"count_ge_30000ms: {len(ge30)}")
    grouped = []
    for key, vals in slow_by_path.items():
        vals = sorted(vals)
        grouped.append((len(vals), max(vals), vals[len(vals) // 2], key))
    grouped.sort(reverse=True)
    out("slow_grouped_by_path (count, max_ms, med_ms, path):")
    for cnt, mx, med, (m, h, pth) in grouped[:60]:
        out(f"  n={cnt:4d} max={mx:9.0f} med={med:8.0f}  {m:7s} {h}{pth}")
    out("slowest_15:")
    for r in sorted(slow_1k, key=lambda x: x["time"], reverse=True)[:15]:
        out(f"  {r['time']:9.1f}ms  st={r['status']:3d}  {r['method']:7s} {r['display']}  at={r['dt']}")
    if ge5:
        out("all >=5000ms:")
        for r in sorted(ge5, key=lambda x: x["time"], reverse=True):
            out(f"  {r['time']:9.1f}ms  st={r['status']:3d}  {r['method']:7s} {r['display']}  at={r['dt']}")
    out()

    out("=== FAILURES (status 0 / 4xx / 5xx / blocked) ===")
    out(f"failure_count: {len(failures)}")
    by_st = Counter(r["status"] for r in failures)
    out(f"failure_by_status: {dict(sorted(by_st.items()))}")
    related_fails = [
        r for r in failures if looks_focus("https://" + r["host"] + r["path"], r["host"], r["path"], needles)
    ]
    out(f"related_failures: {len(related_fails)}")
    for r in related_fails:
        extra = f" err={r.get('error_snip')}" if r.get("error_snip") else ""
        blk = f" blocked={r.get('blocked')}" if r.get("blocked") else ""
        out(f"  {r['dt']} {r['method']} st={r['status']} {r['time']}ms {r['display']}{blk}{extra}")
    out("non-related failure path groups (top 40):")
    g2 = Counter((r["method"], r["host"], r["npath"], r["status"]) for r in failures)
    rf_keys = {(r["method"], r["host"], r["npath"], r["status"]) for r in related_fails}
    shown = 0
    for (m, h, pth, stt), c in g2.most_common(80):
        if (m, h, pth, stt) in rf_keys:
            continue
        out(f"  {c:4d}  st={stt:3d} {m:7s} {h}{pth}")
        shown += 1
        if shown >= 40:
            break
    out()

    out("=== RETRIES / POLLING / WEBSOCKET ===")
    out("most_repeated_paths (count>=5):")
    for (m, h, pth), c in path_counts.most_common(40):
        if c >= 5:
            out(f"  {c:4d}  {m:7s} {h}{pth}")
    out(f"websocket_hint_count: {len(ws_entries)}")
    out(f"websocket_entries_with_frames: {ws_with_frames}")
    out(f"focus_matching_ws_frames: {focus_ws_frames}")
    for r in ws_entries[:30]:
        out(f"  {r['dt']} {r['method']} st={r['status']} {r['time']:.0f}ms {r['ws']} {r['display']}")
    out(f"preflight OPTIONS failures: {len(preflight_fail)}")
    for r in preflight_fail[:30]:
        out(f"  {r['dt']} st={r['status']} {r['display']}")
    out()

    out("=== HUGE PAYLOADS ===")
    out(f"count req>=500kB or resp>=2MB: {len(huge_payloads)}")
    for r in sorted(huge_payloads, key=lambda x: max(x["req_size"], x["resp_size"]), reverse=True)[:25]:
        out(
            f"  req={r['req_size']} resp={r['resp_size']} st={r['status']} {r['time']}ms {r['method']} {r['display']}"
        )
    out()

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"WROTE {args.out} lines={len(lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
