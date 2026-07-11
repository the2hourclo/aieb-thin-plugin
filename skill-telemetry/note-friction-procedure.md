# Send a FRICTION note (Claude-initiated, consent-gated)

<!-- Relocated 2026-07-11 from commands/note-friction.md: friction capture is Claude's job to OFFER, not a command the buyer must remember. There is no slash command for this — Claude follows this procedure when it observes a plugin-shipped skill underperform (or the retro nudge / retrospective skill routes here). NOTHING is sent without the user's explicit in-chat yes for this one note. -->

A skill shipped by this plugin underperformed. Capture it as a note rich enough that the author knows the exact edit to make and where. **Only the distilled note travels — genericize everything, never transcript text, file contents, names, or business specifics.**

## First: whose skill is it?
Check where the flagged skill lives. If it's in the user's own `.claude/skills/` folder (a skill THEY authored), tell them: "That's your own skill — the plugin author can't fix a skill that exists only on your machine. The retrospective skill patches its SKILL.md directly — want me to run it?" and STOP — do not send a note. Proceed below ONLY for the skills this plugin ships.

## Second: get consent for THIS note
Ask plainly, once: "Want me to flag this to the author so it gets fixed for everyone? It sends one short anonymized note — no transcript or content leaves your machine." Proceed ONLY on an explicit yes. A yes covers this single note, nothing more. No answer or no = drop it silently.

## Build these fields (one or two sentences each, content-free)
- `skill` — the skill that struggled.
- `task` — what the user was trying to do, genericized.
- `what_happened` — the skill's observable misbehavior / wrong output.
- `why` — the root cause: WHY it went wrong (the diagnosis — the most useful field).
- `suggested_change` — the concrete fix to the skill.
- `where_in_skill` — the section/workflow/rule to change (best guess).
- `impact` — `low` / `medium` / `high` (+ rework, e.g. "3 rewrites").

## Send it
Node first — it's guaranteed on this machine because the plugin's connector runs on it (Python is not on stock Windows). `send_note.mjs` lives in this plugin's `skill-telemetry/` folder; `${CLAUDE_PLUGIN_ROOT}` is this plugin's root (if your shell hasn't set it, substitute the absolute path).
```bash
node "${CLAUDE_PLUGIN_ROOT}/skill-telemetry/send_note.mjs" --consent-this-note --type Friction --skill "<skill>" \
  --task "<...>" --what-happened "<...>" --why "<root cause>" \
  --suggested-change "<the fix>" --where-in-skill "<...>" --impact "<low|medium|high>"
```
Then confirm: "Logged — thanks, that helps this skill get fixed for everyone." If the sender prints a failure or skip, say it was skipped locally; never block the user.

## Privacy
Only the distilled, genericized fields above. No transcript text, code, names, URLs, or business specifics in any field. `--consent-this-note` authorizes this one note only; it does not enable background telemetry.

## Formatting
Write every field in plain ASCII (use `-` not em-dashes, straight quotes not curly) - non-ASCII args get mangled on some Windows shells.
