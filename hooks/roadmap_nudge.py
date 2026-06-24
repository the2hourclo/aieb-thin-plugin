#!/usr/bin/env python3
"""SessionStart hook: offer to CONTINUE BUILDING once onboarding is done.

The sibling of `onboard_nudge.py`. Where that one offers onboarding on a FRESH
workspace, this one picks up after: once a buyer has finished onboarding (built
their first skill), they have no deterministic reminder that there's a next
move. This hook closes that gap — at session start it injects a small
additionalContext nudge so Claude offers, once, to walk them up the roadmap
(say "what's next").

It fires only in the post-onboarding window:
  - `.claude-state/onboarding-progress.json` exists AND `completed_at` is set
    (onboarding finished — onboard_nudge will already have gone silent), AND
  - the roadmap isn't finished yet — `.claude-state/roadmap-progress.json` is
    missing (never started) or still has a stage that's pending/in-progress.
    Once stages 3-7 are all completed/skipped, this stays silent (they know the
    drill; the "build the next one" loop is theirs to start).

These two nudges are mutually exclusive: fresh vs. onboarded are different
states, so a session never gets both. Mid-onboarding (state exists,
completed_at null) BOTH stay silent — onboard resumes via its own logic.

Politeness rules (same as onboard_nudge):
  - At most MAX_NUDGES per workspace, then silent forever. Count stored
    user-global (~/.claude/.clo-os-state/), keyed by a hash of the workspace
    path — NEVER writes into the buyer's project folder.
  - Skipped on `source == "compact"` so it can't interrupt ongoing work.
  - additionalContext only — Claude decides whether/how to surface it; it never
    blocks the buyer's actual request.

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
ROADMAP_STAGES = ("3-harness", "4-system", "5-agent", "6-command", "7-autopilot")


def claude_root() -> Path:
    home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "~")
    return home.expanduser() / ".claude"


def log_event(stage: str, **fields) -> None:
    """Append a structured JSON line to the plugin's shared hook log."""
    path = claude_root() / ".clo-os-state" / f"{PLUGIN_NAME}-hooks.log"
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hook": "roadmap_nudge",
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


def onboarding_complete(cwd: Path) -> bool:
    """True only if onboarding ran here AND finished (completed_at is set)."""
    try:
        p = cwd / ".claude-state" / "onboarding-progress.json"
        if not p.exists():
            return False
        data = json.loads(p.read_text(encoding="utf-8"))
        return bool(data.get("completed_at"))
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return False


def roadmap_unfinished(cwd: Path) -> bool:
    """True if the build ladder still has somewhere to go.

    Missing state file → never started → True (offer). If present and every
    tracked stage is completed/skipped → False (stay silent). On any parse
    error → False (don't nag on malformed state)."""
    try:
        p = cwd / ".claude-state" / "roadmap-progress.json"
        if not p.exists():
            return True
        stages = json.loads(p.read_text(encoding="utf-8")).get("stages", {})
        if not isinstance(stages, dict):
            return False
        for name in ROADMAP_STAGES:
            if stages.get(name, "pending") not in ("completed", "skipped"):
                return True
        return False
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return False


def counter_path(cwd: Path) -> Path:
    """User-global counter keyed by workspace path hash. Never writes into the
    buyer's project directory."""
    try:
        key = str(cwd.resolve())
    except OSError:
        key = str(cwd)
    safe = hashlib.sha1(key.encode("utf-8", "ignore")).hexdigest()[:16]
    return claude_root() / ".clo-os-state" / f"aeb-roadmap-nudge-{safe}.json"


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
    "[{plugin} hook] This workspace has finished onboarding and still has a build "
    "roadmap to work through. When there's a natural opening (after acknowledging the "
    "user's actual first request, not instead of it), offer ONCE, casually: \"Want to "
    "pick up where you left off and keep building? Say 'what's next' and I'll show your "
    "roadmap and the next move.\" Don't push — if the user is clearly here to do "
    "something specific, let them get to it; if they decline, accept it and stay "
    "silent. If their first message is already about the roadmap or what to build next, "
    "just invoke the `roadmap` skill — don't double-offer."
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

    if not onboarding_complete(cwd):
        log_event("not-onboarded")
        return 0
    if not roadmap_unfinished(cwd):
        log_event("ladder-complete")
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
