#!/usr/bin/env python3
"""SessionStart hook: scan the previous session's transcript for skill friction.

If the user corrected a ai-employee-builder skill's output last session, inject a
small nudge into this session's first turn directing Claude to mention
`/ai-employee-builder:retrospective` casually when there's a natural opening.

Why SessionStart instead of the older Stop + UserPromptSubmit pair: retros
look backward at completed work, so triggering at the start of the NEXT
session is conceptually cleaner AND avoids any Stop-class hook (any bug in a
Stop hook can spam, because every model turn re-fires Stop). One event, one
script, no recursion vectors.

Behavior:
  1. Locate the previous transcript file: list all .jsonl files in the same
     directory as this session's transcript, exclude the current one, pick
     the most-recently-modified.
  2. If we've already nudged about that transcript (state-file marker keyed
     by transcript filename), exit silent.
  3. Scan it for friction phrases. If none match, exit silent.
  4. Emit additionalContext with a casual nudge for Claude.
  5. Mark this transcript as nudged so we don't repeat across resumes.

All failure modes exit 0 silently — the nudge is a nice-to-have, never a
blocker.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PLUGIN_NAME = "ai-employee-builder"


def claude_root() -> Path:
    home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "~")
    return home.expanduser() / ".claude"


def log_event(stage: str, **fields) -> None:
    """Append a structured JSON line to the plugin's hook log. Mirrors the
    auto_update helper so a single log file captures every SessionStart
    decision for this plugin."""
    path = claude_root() / ".clo-os-state" / f"{PLUGIN_NAME}-hooks.log"
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "hook": "retro_nudge",
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

FRICTION_PATTERNS = [
    r"\bthat skill (got it wrong|messed up|missed it|didn't work)",
    r"\bfix (this|that) skill\b",
    r"\bthe \w+(-\w+)? skill (got it wrong|messed up|didn't work|misfired)",
    r"\bskill (didn't|did not) (activate|trigger|fire|run)",
    r"\b(redo|try again).{0,40}(skill|wrong|missed)",
    r"\bthe (output|result) (was|is) (wrong|off|bad)\b",
    r"\bthat'?s not (what i wanted|right|how)",
    r"\bskill (output|result) (was|is) wrong\b",
]

NUDGE_TEMPLATE = (
    "[{plugin} hook] The previous session for this project showed friction "
    "with a {plugin} skill — the user corrected its output, redid it, or "
    "said it missed. When there's a natural opening (NOT before answering "
    "their current question), mention it casually ONCE and offer the "
    "one-step flag: \"By the way, a skill seemed to miss last session. Want "
    "me to flag it to the author so it gets fixed for everyone? It sends a "
    "short anonymized note — no transcript or content leaves your machine.\" "
    "On yes, run /{plugin}:note-friction with the skill + what went wrong (it "
    "sends one distilled note, opt-in gated — nothing leaves if they haven't "
    "opted in). If they'd also like to patch their own copy now, "
    "/{plugin}:retrospective walks through the SKILL.md edit. Don't push, "
    "don't interrupt mid-task, mention it once."
)


def find_previous_transcript(current: Path) -> Path | None:
    """Find the most recent .jsonl in the same directory, excluding current."""
    try:
        parent = current.parent
        if not parent.exists():
            return None
        candidates = [
            p for p in parent.glob("*.jsonl")
            if p.resolve() != current.resolve()
        ]
    except OSError:
        return None
    if not candidates:
        return None
    try:
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return None
    return candidates[0]


def has_friction(transcript: Path) -> bool:
    try:
        body = transcript.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return any(re.search(p, body, re.IGNORECASE) for p in FRICTION_PATTERNS)


def already_nudged_marker(cwd: Path, transcript: Path) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", transcript.name)
    return cwd / ".claude-state" / f"retro-nudged-{PLUGIN_NAME}-{safe}"


def main() -> int:
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    if not raw:
        return 0
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        return 0

    cwd = Path(event.get("cwd") or os.getcwd())
    transcript_path = event.get("transcript_path")
    if not transcript_path:
        log_event("no-transcript-path")
        return 0

    prior = find_previous_transcript(Path(transcript_path))
    if prior is None:
        log_event("no-prior-transcript")
        return 0

    marker = already_nudged_marker(cwd, prior)
    if marker.exists():
        log_event("already-nudged", prior=prior.name)
        return 0

    if not has_friction(prior):
        log_event("no-friction", prior=prior.name)
        return 0

    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch()
    except OSError:
        pass

    sys.stdout.write(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": NUDGE_TEMPLATE.format(plugin=PLUGIN_NAME),
        }
    }))
    log_event("nudge-emitted", prior=prior.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
