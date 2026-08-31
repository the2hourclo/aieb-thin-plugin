---
name: check-setup
description: Setup employee · Verify and repair this AI Employee Builder setup — connector, license plan, workspace folders, onboarding state, and the managed CLAUDE.md block — then offer consent-gated fixes. USE WHEN user says 'check my setup', 'verify my setup', 'is my setup ok', 'is everything connected', 'something seems broken', 'my skills stopped working', 'fix my setup', 'setup health check', 'am I connected', 'why isn't this working', or another skill or message told them to run a setup check. Safe to run any time — it changes nothing without an explicit yes.
---

# Check Setup — Verify and Repair

You are checking this person's AI Employee Builder setup and fixing only what they approve. They are a business owner, not a developer — report every finding in plain words (say "your workspace map file" before you say "CLAUDE.md"), and never show raw errors without translating them.

**Hard rule: never create, edit, or delete ANY file without an explicit yes.** Steps 1–3 only look and report. Step 4 fixes — one approved item at a time.

## Step 1 — Connector and plan (prove it with live calls — never assume)

This skill may have loaded from the local plugin, so reading it proves nothing about the connection. Establish two facts with real calls:

1. **Does the connector work?** Find a tool ending in `get_skill` (the full name varies by surface — Claude Code: `mcp__aieb__get_skill`; Cowork/Desktop: `mcp__plugin_ai-employee-builder_aieb__get_skill`; on Cowork run a tool search for "get_skill" first, tools load lazily). Call it with `skill_id: ai-employee-map`, `path: SKILL.md` — the free skill, it serves even without a license.
   - Content comes back → the connector is healthy. Say so plainly: "Your connection to the AI Employee Builder server works."
   - No `get_skill` tool exists after searching → the connector is missing on this machine. **Claude Code:** run `/setup-aieb`, open the secure link it gives, then `/reload-plugins`. **Cowork/Desktop:** install the plugin (Customize → Personal plugins → marketplace `the2hourclo/aieb-thin-plugin`), then run `/setup-aieb` in chat.
   - The call itself errors → note the exact error for Step 3; a license/entitlement message means the connector is fine but the license needs attention (Step 4's key row).
2. **Which plan are they on?** Call the `find_skill` tool with query "write a newsletter" and look at how the `write` skill comes back:
   - `write` is marked 🔒 locked → they're on the **AI Employee Builder** plan (the builder skills).
   - `write` is unlocked → they're on the **Chief Leverage Officers** plan (builders + the content-writing fleet).
   - Even builder skills come back locked → the connector reaches the server but no active license is attached on this device (Step 4's key row).

Report both in one or two sentences before moving on. If the probes pass here but the user says "nothing works", the broken thing is usually a different chat or device — ask which machine had the problem.

## Step 2 — Workspace checks (pick the branch that matches where you're running)

### In Claude Code (or any client that can read the working folder)

Check these, in order, and keep a simple found/missing list:

1. **Builder folders:** `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, `.claude/hooks/` — created by onboarding.
2. **Onboarding state:** `.claude-state/onboarding-progress.json` — exists means onboarding ran; missing means it never ran here (that's the usual cause of "nothing is set up").
3. **Workspace map (CLAUDE.md):** the file exists AND contains managed blocks whose start markers look like `<!-- managed-by-ai-employee-builder:…:start v=N -->`.
4. **Template version:** compare that `v=N` number against the version named in the header that arrived with this very skill text (the "Workspace check" line names the current number). Same → up to date. Missing or lower → the workspace map is stale.
5. **Content-employee assets (only if Step 1 said Chief Leverage Officers):** the `<!-- AIEB-CONTENT-EMPLOYEES:start -->` block in CLAUDE.md, voice samples in `digital-assets/voice/` (or wherever that block's table points), and the brand doc it names (usually `marketing/brand-positioning.md`).

### In Cowork / Claude Desktop

If the platform lets you read the workspace's files, run the same checks on the workspace map file. If it doesn't expose folders or files, skip the file checks gracefully — say "file checks don't apply on this platform" — and report only Step 1's connector + plan facts. Do not guess at files you cannot see.

**Routing check (Cowork only):** ask whether skill suggestions have felt off — Claude answering generically instead of using the AI Employees. If so, the plugin is likely missing: walk them through **Customize → Personal plugins → + → Add marketplace →** `the2hourclo/aieb-thin-plugin` **→ Sync → install AI Employee Builder**. Reassure them about the red "trust this plugin" notice (standard for every non-Anthropic plugin). If Personal plugins isn't in their Customize screen, tell them to update the Claude desktop app first — it ships in current versions.

## Step 3 — Diagnose in plain words

Translate what you found into one short problem list, worst first. Examples of the register to use:

- "Onboarding never ran in this folder — that's why no skills are wired up here."
- "Your workspace map is from an older setup (v=1; current is the number in this skill's header). A refresh will update just the managed sections — everything you wrote yourself stays."
- "Your voice samples folder is empty, so the writing employees can't sound like you yet."

## Step 4 — Offer repairs (consent-gated, one at a time)

Offer ONLY the fixes that match findings, as a short menu. For each: say exactly what you would create or change, wait for a yes, then do it, then confirm.

| Finding | Offer |
|---|---|
| Managed block missing or `v=` stale | Refresh ONLY the text between the `:start` and `:end` markers with the current template (call `get_skill` with skill_id `onboard` and path `workflows/scaffold-workspace.md` for the canonical block text). Blocks that exist in the workspace but NOT in the current template (e.g. the retired v=4 `skill-routing`, `quick-start`, `claude-folders`, `claude-state`, `update-check` blocks) are DELETED marker-to-marker, not refreshed. Never touch anything outside the markers; show what changes first. |
| Builder folders missing | Create the missing empty folders. |
| Onboarding never ran | Suggest running the `onboard` skill start to finish rather than patching pieces. |
| Voice/brand assets missing (Chief Leverage Officers) | Suggest running `setup-content-employees`. |
| Key or connection problems on ANY device/chat | The fix is the same everywhere: run `/setup-aieb` (or say "set up my AI Employee Builder connection") — it gives a secure one-time link. On that page they click **Continue with Google** and pick the address they bought with, which connects them with nothing to type. Only if Google finds no purchase on that address do they need the license key, from their Lemon Squeezy receipt email, entered on the activation PAGE. **The key never goes into chat.** (A connector older than v0.13 lacks the secure link flow — update the plugin first.) |
| "A skill keeps doing X and I want it to stop/change" — and it's a skill THEY built (a real folder exists in `.claude/skills/<name>/`) | That file is theirs — route to the `retrospective` skill. It shows a before/after edit to their own skill file and changes nothing until they say yes. Do NOT draft an overrides file for a skill they own — nothing ever reads it. |
| "A skill keeps doing X and I want it to stop/change" — and it's a served skill (no local folder; it comes from the AI Employee Builder server, like write or copywriter) | That's a customization, not a breakage: their standing adjustments belong in `digital-assets/overrides/<skill-id>.md` — it survives every content update. Offer to draft one. |

**Quick guide — which fix goes with which skill** (full flow lives in the `retrospective` skill; origin: 2026-07-04 buyer-journey audit — four fix mechanisms contradicted each other at "my skill keeps doing X wrong"):

- Skill they built (folder in `.claude/skills/<name>/`) → edit their file via `retrospective`, before/after shown, applied only on yes — never an overrides file.
- Served skill (no local folder — fetched from the AI Employee Builder server) → `digital-assets/overrides/<skill-id>.md`; also offer to send one anonymized friction note to the author (the plugin's `skill-telemetry/note-friction-procedure.md`; only after an explicit yes).
- Third-party plugin skill (read-only cache from another author) → a feedback note to that plugin's author — never edit the cache, never an overrides file.

If they say no to a fix, leave it on the report and move on. Never re-ask in the same session.

## Step 5 — Close with a one-screen status card

End with a compact card — one line per check, ✅ / ⚠️ / ❌ / ➖ (not applicable):

```
AI Employee Builder — Setup Check
──────────────────────────────────
Connector + license   ✅ working (this session)
Plan                  ✅ Chief Leverage Officers
Builder folders       ✅ all present
Onboarding state      ✅ completed
Workspace map         ⚠️ v=1 (current v=2) — refresh offered, declined
Voice samples         ❌ digital-assets/voice/ is empty — run setup-content-employees
Brand doc             ✅ marketing/brand-positioning.md
Repairs applied       1 of 2 offered
```

Then one closing sentence: what (if anything) they should do next, in plain words.
