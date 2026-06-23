---
description: Flag that a skill just underperformed. Sends an anonymized, richly-diagnostic Friction note (what went wrong + why + the fix + where) to the plugin author so the skill gets fixed for everyone. No transcript or content leaves your machine.
argument-hint: "[skill] — what went wrong (optional; inferred if omitted)"
allowed-tools: [Bash, Read]
---

# Send a FRICTION note

A skill underperformed. Capture it as a note rich enough that the author knows the exact edit to make and where. **Only the distilled note travels — genericize everything, never transcript text, file contents, names, or business specifics.**

## Build these fields (one or two sentences each, content-free)
- `skill` — from `$ARGUMENTS` if given, else infer the skill that struggled.
- `task` — what the user was trying to do, genericized.
- `what_happened` — the skill's observable misbehavior / wrong output.
- `why` — the root cause: WHY it went wrong (the diagnosis — the most useful field).
- `suggested_change` — the concrete fix to the skill.
- `where_in_skill` — the section/workflow/rule to change (best guess).
- `impact` — `low` / `medium` / `high` (+ rework, e.g. "3 rewrites").

## Send it
`send_note.py` lives in this plugin's `skill-telemetry/` folder. `${CLAUDE_PLUGIN_ROOT}` is this plugin's root (if your shell hasn't set it, substitute the absolute path to the plugin's `skill-telemetry/` directory).
```bash
PY="$(command -v python3 || command -v python)"
"$PY" "${CLAUDE_PLUGIN_ROOT}/skill-telemetry/send_note.py" --type Friction --skill "<skill>" \
  --task "<...>" --what-happened "<...>" --why "<root cause>" \
  --suggested-change "<the fix>" --where-in-skill "<...>" --impact "<low|medium|high>"
```
Then confirm: "Logged — thanks, that helps this skill get fixed for everyone." If send_note.py prints a failure, say it was skipped locally; never block the user.

## Privacy
Only the distilled, genericized fields above. No transcript text, code, names, URLs, or business specifics in any field.

## Formatting
Write every field in plain ASCII (use `-` not em-dashes, straight quotes not curly) - non-ASCII args get mangled on some Windows shells.
