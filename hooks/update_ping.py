#!/usr/bin/env python3
"""SessionStart hook: tell the buyer when the LOCAL plugin shell needs updating.

This is the Track-D replacement for the old SkillStack `auto_update.py`. In the
new model there is NO SkillStack: buyers install a public thin plugin and the
paid skill CONTENT updates automatically server-side (every `get_skill` call
already returns the latest). The only thing that ever needs a manual buyer
action is an update to the local SHELL itself — new stubs, new hooks, a changed
proxy. This hook surfaces exactly that, and nothing else.

How it works:
  1. Read the installed shell version from this plugin's own plugin.json
     (via ${CLAUDE_PLUGIN_ROOT}).
  2. GET the hosted MCP's /version endpoint, which reports {latest, min}.
  3. If installed < min  -> a firm "must update" nudge (the shell may misbehave).
     If installed < latest -> a gentle "update available" nudge.
     If current -> silent.
  4. Throttle to once per 24h, user-global (never writes into the project).

The nudge is only additionalContext — Claude decides whether/how to surface it,
and it never blocks the buyer's first request. Every failure mode exits 0
silently: an update reminder is a nice-to-have, never a blocker.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

PLUGIN_NAME = "ai-employee-builder"
MARKETPLACE = "aieb-thin-plugin"
THROTTLE_HOURS = 24
VERSION_URL = os.environ.get(
    "AIEB_VERSION_URL", "https://aieb-gated-mcp.vercel.app/version"
)
TIMEOUT = 6  # seconds — short, so a slow network never stalls session start


def claude_root() -> Path:
    home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "~")
    return home.expanduser() / ".claude"


def log_event(stage: str, **fields) -> None:
    path = claude_root() / ".clo-os-state" / f"{PLUGIN_NAME}-hooks.log"
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hook": "update_ping",
        "stage": stage,
        "plugin": PLUGIN_NAME,
        **fields,
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except OSError:
        pass


def version_tuple(v: str) -> tuple:
    """Parse a semver-ish string into a comparable tuple. Malformed -> (0,) so a
    bad value never claims to be newer."""
    try:
        return tuple(int(x) for x in str(v).split(".") if x.isdigit())
    except Exception:
        return (0,)


def installed_version() -> str | None:
    """Read this plugin's own version from its plugin.json via CLAUDE_PLUGIN_ROOT."""
    root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if not root:
        return None
    path = Path(root) / ".claude-plugin" / "plugin.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("version")
    except (OSError, json.JSONDecodeError, AttributeError):
        return None


def fetch_remote_versions() -> dict | None:
    try:
        req = urllib.request.Request(
            VERSION_URL,
            headers={"User-Agent": "aieb-thin-plugin-update-ping/1.0"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def throttle_path() -> Path:
    return claude_root() / ".clo-os-state" / f"{PLUGIN_NAME}-update-ping.json"


def is_throttled() -> bool:
    path = throttle_path()
    if not path.exists():
        return False
    try:
        last = datetime.fromisoformat(
            json.loads(path.read_text(encoding="utf-8"))["last_check"]
        )
    except (OSError, json.JSONDecodeError, KeyError, ValueError):
        return False
    return datetime.now(timezone.utc) - last < timedelta(hours=THROTTLE_HOURS)


def record_check() -> None:
    path = throttle_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"last_check": datetime.now(timezone.utc).isoformat()}),
            encoding="utf-8",
        )
    except OSError:
        pass


UPDATE_CMDS = (
    f"/plugin install {PLUGIN_NAME}@{MARKETPLACE}  →  /reload-plugins  →  /setup-aieb"
)

FIRM = (
    "[{plugin} hook] The AI Employee Builder plugin shell installed here is v{have}, "
    "below the minimum supported v{min}. It may misbehave until updated. At a natural "
    "opening, tell the user plainly and give the exact steps: {cmds}. (Paid skill "
    "content already updates automatically — this is only the local shell.)"
)

GENTLE = (
    "[{plugin} hook] A newer AI Employee Builder plugin shell is available (v{latest}; "
    "this workspace has v{have}). Purely optional. When there's a natural opening, "
    "mention it ONCE, casually, with the steps: {cmds}. Don't push or interrupt a task. "
    "(Skill content updates automatically — this only refreshes the local shell.)"
)


def emit(context: str) -> None:
    sys.stdout.write(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "SessionStart",
                    "additionalContext": context,
                }
            }
        )
    )


def main() -> int:
    # Drain stdin so the harness pipe closes cleanly.
    try:
        if not sys.stdin.isatty():
            sys.stdin.read()
    except Exception:
        pass

    if is_throttled():
        log_event("skipped-throttle")
        return 0
    record_check()

    have = installed_version()
    if not have:
        log_event("no-installed-version")
        return 0

    remote = fetch_remote_versions()
    if not remote:
        log_event("no-remote-version")
        return 0

    latest = remote.get("latest")
    minimum = remote.get("min") or remote.get("minimum")

    if minimum and version_tuple(have) < version_tuple(minimum):
        emit(FIRM.format(plugin=PLUGIN_NAME, have=have, min=minimum, cmds=UPDATE_CMDS))
        log_event("nudge-firm", have=have, min=minimum, latest=latest)
        return 0

    if latest and version_tuple(have) < version_tuple(latest):
        emit(GENTLE.format(plugin=PLUGIN_NAME, have=have, latest=latest, cmds=UPDATE_CMDS))
        log_event("nudge-gentle", have=have, latest=latest)
        return 0

    log_event("already-current", have=have, latest=latest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
