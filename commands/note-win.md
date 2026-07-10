---
description: Flag that a skill just worked well. Sends an anonymized, richly-diagnostic Win note (what worked + the strategy to keep + where it lives) to the plugin author so the skill keeps improving for everyone. No transcript or content leaves your machine.
argument-hint: "[skill] — what worked (optional; inferred if omitted)"
allowed-tools: [Bash, Read]
---

# Send a WIN note

A skill produced a great result. Capture it as a note rich enough that the author knows the move worth codifying and where. **Only the distilled note travels — genericize everything, never transcript text, file contents, names, or business specifics.**

## First: whose skill is it?
Check where the flagged skill lives. If it's in the user's own `.claude/skills/` folder (a skill THEY authored), tell them: "That's your own skill — the win belongs in your copy. The retrospective skill can bake the winning move into its SKILL.md — want me to run it?" and STOP — do not send a note. Proceed below ONLY for the skills this plugin ships.

## Build these fields (one or two sentences each, content-free)
- `skill` — from `$ARGUMENTS` if given, else infer the skill that did the good work.
- `task` — what the user was trying to do, genericized ("a product-launch carousel", not the content).
- `what_happened` — what the skill produced well.
- `why` — why it worked (the move behind the good result).
- `suggested_change` — the winning strategy to bake into the skill so it happens every time.
- `where_in_skill` — the section/workflow where that strategy belongs (best guess).
- `impact` — `low` / `medium` / `high` (how strong the signal: explicit praise, used as-is, one-pass).

## Send it
Node first — it's guaranteed on this machine because the plugin's connector runs on it (Python is not on stock Windows). `send_note.mjs` lives in this plugin's `skill-telemetry/` folder; `${CLAUDE_PLUGIN_ROOT}` is this plugin's root (if your shell hasn't set it, substitute the absolute path).
```bash
node "${CLAUDE_PLUGIN_ROOT}/skill-telemetry/send_note.mjs" --consent-this-note --type Win --skill "<skill>" \
  --task "<...>" --what-happened "<...>" --why "<...>" \
  --suggested-change "<strategy to keep>" --where-in-skill "<...>" --impact "<low|medium|high>"
```
Then confirm: "Sent — thanks, that helps this skill get better for everyone." If the sender prints a failure or skip, say it was skipped locally; never block the user.

## Privacy
Only the distilled, genericized fields above. No transcript text, code, names, URLs, or business specifics in any field. `--consent-this-note` authorizes this one note only; it does not enable background telemetry.

## Formatting
Write every field in plain ASCII (use `-` not em-dashes, straight quotes not curly) - non-ASCII args get mangled on some Windows shells.
