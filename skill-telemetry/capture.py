#!/usr/bin/env python3
"""
capture.py - background, model-free capture for the skill-telemetry loop (client side).

Ships in the plugin. Wired as a Stop hook (fires each turn) + a SessionEnd backstop,
both async, so it never blocks the user. It records ONE fact: that a skill-using
session happened (plus its transcript path), into a local inbox. It makes NO judgment
and calls NO model. The telemetry-reviewer agent later reads the transcript (only on
the user's consent) and sends distilled notes.

Reads the hook payload (JSON) from stdin: session_id, transcript_path.
Appends one entry to <here>/.state/inbox.json, deduped by session id. Self-managed.

Fail-safe: every error is swallowed; always exits 0; never blocks a session.
Kill-switch: env CLO_TELEMETRY_OFF, or config.json {"enabled": false}.
"""
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# State must live in a WRITABLE location - the plugin folder is read-only on a
# buyer's machine. Home dir is writable and shared across plugins (one inbox/
# install id per machine). config.json is read-only and ships in the plugin.
STATE_DIR = os.path.join(os.path.expanduser("~"), ".clo-skill-telemetry")
INBOX = os.path.join(STATE_DIR, "inbox.json")
CONFIG = os.path.join(HERE, "config.json")

# Skills that are part of the loop itself - never capture (circular noise).
IGNORE = {"note-win", "note-friction", "review-feedback", "review-retro",
          "telemetry-reviewer"}
SKILL_RE = re.compile(
    r'"name"\s*:\s*"Skill"\s*,\s*"input"\s*:\s*\{\s*"skill"\s*:\s*"([^"]+)"')


def _truthy(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _disabled():
    if _truthy(os.environ.get("CLO_TELEMETRY_OFF", "")):
        return True
    try:
        with open(CONFIG, encoding="utf-8") as f:
            if not json.load(f).get("enabled", True):
                return True
    except Exception:
        pass
    return False


def _load_inbox():
    try:
        with open(INBOX, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def main():
    try:
        if _disabled():
            return 0

        raw = "" if sys.stdin.isatty() else sys.stdin.read()
        if not raw:
            return 0
        # Hook payload is a JSON object. Some shells/pipes prepend a BOM or stray
        # bytes; slice from the first "{" to the last "}" so json.loads is robust.
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            return 0
        payload = json.loads(raw[start:end + 1])

        session_id = payload.get("session_id")
        tpath = payload.get("transcript_path")
        if not tpath or not os.path.exists(tpath):
            return 0
        if not session_id:
            session_id = os.path.splitext(os.path.basename(tpath))[0]
        short = session_id[:8]

        inbox = _load_inbox()
        if any(e.get("session") == short for e in inbox):
            return 0  # idempotent: already captured this session

        with open(tpath, encoding="utf-8", errors="replace") as f:
            text = f.read()
        skills = sorted(set(SKILL_RE.findall(text)))
        meaningful = [s for s in skills if s not in IGNORE]
        if not meaningful:
            return 0  # no skill ran -> nothing to review -> stay silent

        os.makedirs(STATE_DIR, exist_ok=True)
        inbox.append({
            "session": short,
            "transcript": tpath,
            "skills": meaningful,
            "date": datetime.date.today().isoformat(),
            "status": "unreviewed",
        })
        tmp = INBOX + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(inbox, f, indent=2)
        os.replace(tmp, INBOX)  # atomic
    except Exception:
        pass  # never bother the user
    return 0


if __name__ == "__main__":
    sys.exit(main())
