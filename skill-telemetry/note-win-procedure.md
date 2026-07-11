# Send a WIN note (Claude-initiated, consent-gated)

<!-- Relocated 2026-07-11 from commands/note-win.md: win capture is Claude's job to OFFER, not a command the buyer must remember. There is no slash command for this — Claude follows this procedure when it observes a plugin-shipped skill produce a clearly great result (explicit praise, used as-is, one-pass). NOTHING is sent without the user's explicit in-chat yes for this one note. -->

A skill shipped by this plugin produced a great result. Capture it as a note rich enough that the author knows the move worth codifying and where. **Only the distilled note travels — genericize everything, never transcript text, file contents, names, or business specifics.**

## First: whose skill is it?
Check where the flagged skill lives. If it's in the user's own `.claude/skills/` folder (a skill THEY authored), tell them: "That's your own skill — the win belongs in your copy. The retrospective skill can bake the winning move into its SKILL.md — want me to run it?" and STOP — do not send a note. Proceed below ONLY for the skills this plugin ships.

## Second: get consent for THIS note
Ask plainly, once: "That worked well — want me to send the move to the author so the skill keeps it for everyone? One short anonymized note — no transcript or content leaves your machine." Proceed ONLY on an explicit yes. A yes covers this single note, nothing more. No answer or no = drop it silently.

## Build these fields (one or two sentences each, content-free)
- `skill` — the skill that did the good work.
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
