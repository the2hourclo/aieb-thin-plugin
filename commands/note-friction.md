---
description: Flag that a skill just underperformed. Sends an anonymized, richly-diagnostic Friction note (what went wrong + why + the fix + where) to the plugin author so the skill gets fixed for everyone. No transcript or content leaves your machine.
argument-hint: "[skill] — what went wrong (optional; inferred if omitted)"
allowed-tools: [Bash, Read]
---

# Send a FRICTION note

A skill underperformed. Capture it as a note rich enough that the author knows the exact edit to make and where. **Only the distilled note travels — genericize everything, never transcript text, file contents, names, or business specifics.**

## First: whose skill is it?
Check where the flagged skill lives. If it's in the user's own `.claude/skills/` folder (a skill THEY authored), tell them: "That's your own skill — the plugin author can't fix a skill that exists only on your machine. The retrospective skill patches its SKILL.md directly — want me to run it?" and STOP — do not send a note. Proceed below ONLY for the skills this plugin ships.

## Build these fields (one or two sentences each, content-free)
- `skill` — from `$ARGUMENTS` if given, else infer the skill that struggled.
- `task` — what the user was trying to do, genericized.
- `what_happened` — the skill's observable misbehavior / wrong output.
- `why` — the root cause: WHY it went wrong (the diagnosis — the most useful field).
- `suggested_change` — the concrete fix to the skill.
- `where_in_skill` — the section/workflow/rule to change (best guess).
- `impact` — `low` / `medium` / `high` (+ rework, e.g. "3 rewrites").

## Send it
Node first — it's guaranteed on this machine because the plugin's connector runs on it (Python is not on stock Windows). `send_note.mjs` lives in this plugin's `skill-telemetry/` folder; `${CLAUDE_PLUGIN_ROOT}` is this plugin's root (if your shell hasn't set it, substitute the absolute path).
```bash
node "${CLAUDE_PLUGIN_ROOT}/skill-telemetry/send_note.mjs" --type Friction --skill "<skill>" \
  --task "<...>" --what-happened "<...>" --why "<root cause>" \
  --suggested-change "<the fix>" --where-in-skill "<...>" --impact "<low|medium|high>"
```
If `node` is somehow unavailable, run the same flags through `python3` (or `python`) with `${CLAUDE_PLUGIN_ROOT}/skill-telemetry/send_note.py` instead.

Then confirm: "Logged — thanks, that helps this skill get fixed for everyone." If the sender prints a failure or skip, say it was skipped locally; never block the user.

## Privacy
Only the distilled, genericized fields above. No transcript text, code, names, URLs, or business specifics in any field.

## Formatting
Write every field in plain ASCII (use `-` not em-dashes, straight quotes not curly) - non-ASCII args get mangled on some Windows shells.
