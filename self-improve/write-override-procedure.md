# Add a local OVERRIDE (self-fix — stays on this machine)

<!-- Added 2026-07-16. A plugin-shipped skill produced output the user corrected. Skills served by the AIEB MCP are read-only, so you CANNOT edit their SKILL.md. Instead write a small personal override the server already prepends to that skill on every future fetch — the user's rule wins over the default. This fixes the behavior for THIS user immediately, on THIS machine, with nothing sent anywhere. There is no slash command; Claude follows this procedure after an explicit in-chat yes. -->

A skill this plugin ships got it wrong and the user corrected it. You can make that correction stick — locally and instantly — by writing an override. The server injects a notice on every `get_skill` fetch telling you to read `digital-assets/overrides/<skill_id>.md` and let it win on conflict, so a rule you write here is honored the very next time that skill runs. Nothing leaves the machine; this is not telemetry.

## First: whose skill is it?
Check where the flagged skill lives. If it's in the user's own `.claude/skills/` folder (a skill THEY authored), do NOT write an override — the `retrospective` skill patches their SKILL.md directly; route there instead. Proceed below ONLY for the skills this plugin ships (the ones fetched through `get_skill`).

## Second: get consent for THIS fix
Ask plainly, once: "Want me to add a personal rule so `<skill>` does it your way from now on? It writes a short override to `digital-assets/overrides/<skill>.md`, stays on your machine, and your rule wins over the default." Proceed ONLY on an explicit yes. No answer or no = drop it silently.

## Step 1 — confirm the skill_id
Use the served skill's id — the same id you pass to `get_skill` (e.g. `write`, `copywriter`, `business-x-ray`). Lowercase, hyphenated. That id is the override filename.

## Step 2 — distill the correction into a RULE, not a rewrite
Look at what the user actually changed or asked for. Turn it into one or two **specific, additive** instructions to the skill. The override is PREPENDED and wins on conflict, so phrase each rule as what TO do, concrete enough to test.
- Good: "When writing subject lines, never use a colon." / "Default email length is 150-200 words unless I ask for long."
- Bad: restating the whole skill, or a vague "be better / sound more like me."

One friction = one or two tight rules. Do not dump a manifesto. If the user wants broad, standing customization (voice, brand, audience), point them at `setup-content-employees` / `define-brand` instead — that's the right home for that, not an override.

## Step 3 — write the file (in the user's WORKSPACE, not the plugin)
Path convention: `digital-assets/overrides/<skill_id>.md` at the project root. If the user's managed `CLAUDE.md` asset map names a different overrides location, follow the map.
- If the folder/file does not exist, create it (make `digital-assets/overrides/` first).
- If the file already exists, **APPEND** the new rule under the existing content — never overwrite prior overrides.
- Give a new file a `# Overrides for <skill_id>` heading, then the rule(s) as bullets or one-line imperatives.
- Add a short trailing HTML comment for auditability, e.g. `<!-- added 2026-07-16 after a subject line used a colon -->`, only if it doesn't clutter.

## Step 4 — confirm to the user
Plainly: "Added a personal rule for `<skill_id>`: '<the rule>'. It lives in `digital-assets/overrides/<skill_id>.md`, stays on your machine, and the plugin honors it over the default every time `<skill_id>` runs from now on. Edit or delete that file anytime to change it."

## Optional: also flag it upstream
The override helps THIS user now; it does nothing for the next release. If the friction is worth fixing for everyone, you may ALSO offer: "Want me to flag it to the author so it's fixed for everyone? One short anonymized note, nothing else leaves your machine." On yes, follow `skill-telemetry/note-friction-procedure.md`. The two are independent, not either/or — the override is the local fix, the note is the global one.

## Notes
- Local only — nothing is sent, so there is no privacy gate on the write itself (the consent above is just courtesy before editing their workspace). The consent gate on the note path is separate and still applies.
- Never put secrets or credentials in an override.
- This is a targeted patch, not a customization system. Keep it minimal and auditable so the user can always see why a rule is there.
