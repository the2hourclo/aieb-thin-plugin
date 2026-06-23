#!/usr/bin/env python3
"""SessionStart hook: offer onboarding when the workspace looks fresh.

A buyer who installs ai-employee-builder has no deterministic way to discover
the `onboard` skill — the only entry point is knowing to say "onboard me"
(which lives in the README, inside the read-only cache they never open). This
hook closes that gap: when it detects a fresh workspace, it injects a small
additionalContext nudge so Claude offers onboarding once, at a natural opening.

"Fresh" = onboarding has never run here AND no skills have been authored:
  - no `.claude-state/onboarding-progress.json` (written once Phase 1 runs), AND
  - no `.claude/skills/` folder (Phase 1 creates it; its presence means the
    buyer is already authoring, so don't nag them to "set up").

This plugin ships NO digital-assets folder (it's an authoring toolkit, not a
content-business OS), so — unlike the content bundle — we key freshness off the
.claude/skills folder, not digital-assets.

Politeness rules:
  - At most MAX_NUDGES reminders per workspace, then silent forever. The count
    is stored user-global (~/.claude/.clo-os-state/), keyed by a hash of the
    workspace path, so this hook NEVER writes into the buyer's project folder.
  - Skipped on `source == "compact"` (mid-conversation) so it can't interrupt
    ongoing work.
  - The nudge is only additionalContext — Claude decides whether/how to surface
    it. It never blocks the buyer's actual first request.

All failure modes exit 0 silently — the nudge is a nice-to-have, never a blocker.
"""

from __future__ import annotations  # PEP 604 (X | None) annotations work on Python 3.7+

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PLUGIN_NAME = "ai-employee-builder"
MAX_NUDGES = 3


def claude_root() -> Path:
    home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "~")
    return home.expanduser() / ".claude"


def log_event(stage: str, **fields) -> None:
    """Append a structured JSON line to the plugin's shared hook log."""
    path = claude_root() / ".clo-os-state" / f"{PLUGIN_NAME}-hooks.log"
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hook": "onboard_nudge",
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


def is_fresh_workspace(cwd: Path) -> bool:
    """Fresh = onboarding has never run here and no skills authored yet."""
    try:
        if (cwd / ".claude-state" / "onboarding-progress.json").exists():
            return False
        if (cwd / ".claude" / "skills").is_dir():
            return False
    except OSError:
        return False
    return True


def counter_path(cwd: Path) -> Path:
    """User-global counter file keyed by workspace path hash. Never writes into
    the buyer's project directory."""
    try:
        key = str(cwd.resolve())
    except OSError:
        key = str(cwd)
    safe = hashlib.sha1(key.encode("utf-8", "ignore")).hexdigest()[:16]
    return claude_root() / ".clo-os-state" / f"aeb-onboard-nudge-{safe}.json"


def get_count(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        return int(json.loads(path.read_text(encoding="utf-8")).get("count", 0))
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return 0


def bump_count(path: Path, cwd: Path, new_count: int) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({
                "count": new_count,
                "cwd": str(cwd),
                "last": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }),
            encoding="utf-8",
        )
    except OSError:
        pass


NUDGE = (
    "[{plugin} hook] This looks like a fresh workspace for the ai-employee-builder "
    "plugin — onboarding hasn't run here and no skills have been authored yet. When "
    "there's a natural opening (after acknowledging the user's actual first request, "
    "not instead of it), offer ONCE, casually: \"Looks like ai-employee-builder is "
    "freshly installed here. Want me to set up the authoring folders and walk you "
    "through building your first custom skill? About 10 minutes — just say 'onboard "
    "me'. Or we can dive straight into what you came to do.\" Many buyers install this "
    "into an existing project, so don't push a folder scaffold on them — if the user "
    "says no, accept it gracefully and stay silent. If their first message is already "
    "about onboarding, just run it — don't double-offer."
).format(plugin=PLUGIN_NAME)


def main() -> int:
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    if not raw:
        return 0
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        return 0

    if event.get("source") == "compact":
        return 0

    cwd = Path(event.get("cwd") or os.getcwd())

    if not is_fresh_workspace(cwd):
        log_event("not-fresh")
        return 0

    cp = counter_path(cwd)
    count = get_count(cp)
    if count >= MAX_NUDGES:
        log_event("nudge-capped", count=count)
        return 0

    bump_count(cp, cwd, count + 1)
    sys.stdout.write(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": NUDGE,
        }
    }))
    log_event("nudge-emitted", count=count + 1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
