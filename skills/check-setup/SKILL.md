---
name: check-setup
description: Setup employee · Verify and repair this AI Employee Builder setup — connector, license plan, surface-appropriate workspace folders, onboarding state, and the managed workspace-instructions block — then offer consent-gated fixes. USE WHEN user says 'check my setup', 'verify my setup', 'is my setup ok', 'is everything connected', 'something seems broken', 'my skills stopped working', 'fix my setup', 'setup health check', 'am I connected', 'why isn't this working', or another skill or message told them to run a setup check. Safe to run any time — it changes nothing without an explicit yes.
---

# Check Setup — Verify and Repair

You are checking this person's AI Employee Builder setup and fixing only what they approve. They are a business owner, not a developer — report every finding in plain words (say "your workspace map file" before its technical filename), and never show raw errors without translating them. Say "your AI Employee Builder connection" and "your membership", never "AIEB", "connector", "MCP", "entitlement", "managed block" or a version number; use the app's own labels (like **Customize → Connectors → aieb**) only when telling them where to click.

**Hard rule: never create, edit, or delete ANY file without an explicit yes.** Steps 1–3 only look and report. Step 4 fixes — one approved item at a time.

## Workflow Routing

| Entry condition | Route |
|---|---|
| User asks for a full setup check or says the product is broken | Run Steps 1–4 in order: prove the connector and plan, inspect only the current surface's files, diagnose, then offer consent-gated repairs. |
| User reports only a connector or license problem | Run Step 1 first. Continue to file checks only if the user also reports a workspace problem. |
| Client cannot read the working folder | Run the live connector and plan probes, then report the workspace as not attached, read-only, or unverified. Do not call workspace checks inapplicable. |
| User asks about automated sequences or Kit, or Email OS is already configured | Include the optional Email OS row and hand its own checks to `email-os`; otherwise record `➖ optional — not configured`. |

### Surface contract — choose once before checking files

Identify the current client, then use one vocabulary consistently:

| Surface | Workspace instructions | Authored skills | Other builder folders |
|---|---|---|---|
| Claude Code / Claude in a Project or folder | `CLAUDE.md` | `.claude/skills/` | `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, created with the first agent, command or hook (a missing one is normal) |
| Codex | `AGENTS.md` | `.agents/skills/` | None — agents and automation are plugin capabilities; never create or flag missing Claude-only folders |

`.claude-state/` keeps its historical name on every surface. It is shared AIEB product state, so Codex must read it unchanged. This portability rule was added after the 2026-08-31 served-catalog audit found that a healthy Codex workspace could be reported broken for lacking Claude-only folders. Carve-out: if a client cannot read the working folder, report the workspace as unverified instead of guessing its surface from filenames.

## Step 1 — Connector and plan (prove it with live calls — never assume)

This skill may have loaded from the local plugin, so reading it proves nothing about the connection. Establish two facts with real calls:

1. **Does the connector work?** Find a tool ending in `get_skill` (the full name varies by surface — Claude Code: `mcp__aieb__get_skill`; Claude in a Project or folder: `mcp__plugin_ai-employee-builder_aieb__get_skill`; in the Claude app (desktop or claude.ai) run a tool search for "get_skill" first, tools load lazily). Call it with `skill_id: ai-employee-map`, `path: SKILL.md` — the free skill, it serves even without a license.
   - Content comes back → the connector is healthy. Say so plainly: "Your connection to the AI Employee Builder server works."
   - **Other AIEB tools are present (for example "Show my Business X-Ray"), but `get_skill` or `find_skill` is missing or refused as blocked or disabled** → the connector is connected but those tools are switched off in its permissions. This happens in the Claude app (desktop or claude.ai), and an update will not fix it. Tell them: open **Customize → Connectors → aieb → Tool permissions** and set **Get AI Employee skill instructions** and **Find the right AI Employee skill** to **Always allow** (both only read skill files), or to **Needs approval** if they prefer to confirm each call. Then start a fresh chat.
   - No `get_skill` tool and no other AIEB tool exists after searching → the connector is missing in this session. Install or update AI Employee Builder, then start a fresh session/task. **Codex:** update `ai-employee-builder@aieb-thin-plugin` and start a fresh task. **Claude Code:** refresh the plugin, `/reload-plugins`, then inspect `/mcp`. **Claude in a Project or folder:** run **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then **Customize → Plugins → AI Employee Builder → Update** if shown. Start a fresh session; when authorization is needed, use **Customize → Connectors → aieb**. No local Node runtime or device link is required.
   - The call itself errors → note the exact error for Step 3; a license/entitlement message means the connector is fine but the license needs attention (Step 4's key row).
2. **Which plan are they on?** Call the `find_skill` tool with query "write a newsletter" and look at how the `write` skill comes back:
   - `write` is marked 🔒 locked → they're on a plan below the full membership, most often the **\$1 trial week** of AI Employee Builders (the builder skills; the writing and YouTube employees unlock with the first \$130 charge). A Business X-Ray or Masterclass pass also locks it.
   - `write` is unlocked → they're on the full **AI Employee Builders** membership (every skill: the builders, the writing employees, and the YouTube employee).
   - Even builder skills come back locked → the connector reaches the server but no active license is attached on this device (Step 4's key row).

Report both in one or two sentences before moving on. If the probes pass here but the user says "nothing works", the broken thing is usually a different chat or device — ask which machine had the problem.

## Step 2 — Workspace boundary, then file checks (use the surface contract)

Report **connection**, **membership**, and **workspace** as three independent rows. A healthy connector or plan never proves that the current chat has the member's persistent workspace. Before inspecting AIEB files, identify the current working root and determine whether it is readable and writable. Name the root in the report whenever one is exposed.

On Claude in a Project or folder:

- No persistent Project folder is exposed → `Workspace ❌ no folder attached`. Give the exact route **New chat → Project → Add folder** and stop local checks; do not say file checks do not apply.
- The folder is readable but read-only → `Workspace ⚠️ read-only`. Name it and ask the member to attach it with write access; do not offer onboarding or local repairs there.
- The member says their AIEB workspace is in another Project/folder → `Workspace ⚠️ wrong Project`. Tell them to open that existing Project with the original folder attached. Do not offer to rebuild its state here.
- Read/write cannot be established → `Workspace ⚠️ unverified`. Explain which access is missing and stop local checks.
- A persistent readable/writable Project folder is attached → `Workspace ✅ <root>` and continue below. Reading for diagnosis is safe; any repair still requires the Step 4 confirmation.

> **Workspace-status rule — origin 2026-09-01:** a live setup reported paid access as complete even though the session exposed only temporary scratch space. Workspace access is now a first-class diagnostic instead of a skipped/platform-inapplicable check. **Carve-out:** a connector-only question may end after Step 1, but the status card must label workspace `➖ not checked`, never imply it is ready.

### In Claude Code or Codex

Check these, in order, and keep a simple found/missing list:

1. **Authored-skill home:** Claude checks `.claude/skills/`; Codex checks `.agents/skills/`. `.claude/agents/`, `.claude/commands/` and `.claude/hooks/` appear with the first agent, command or hook, so a missing one is never a finding (on Codex they don't apply at all). Origin: 2026-10-05 — setup stopped creating empty builder folders and placeholder files, because each one cost the member an Allow prompt.
2. **Onboarding state:** `.claude-state/onboarding-progress.json` — exists means onboarding ran; missing means it never ran here (that's the usual cause of "nothing is set up").
3. **Workspace map:** the surface's workspace-instructions file exists (`CLAUDE.md` on Claude; `AGENTS.md` on Codex) AND contains managed blocks whose start markers look like `<!-- managed-by-ai-employee-builder:…:start v=N -->`.
4. **Template version:** compare that `v=N` number against the version named in the header that arrived with this very skill text (the "Workspace check" line names the current number). Same → up to date. Missing or lower → the workspace map is stale.
5. **Content-employee assets (only if Step 1 found the full membership):** the `<!-- AIEB-CONTENT-EMPLOYEES:start -->` block in the chosen workspace-instructions file, `digital-assets/voice/voice-profile.md`, at least one approved sample named by that profile, and the brand doc the block names (usually `marketing/brand-positioning.md`).
6. **Email OS (optional):** check it only when the user asks about automated sequences/Kit, or when an `email-os` skill/configuration is already present in the surface's authored-skill home. Otherwise record `➖ optional — not configured` and continue. When it is present or requested, hand its connector, Notion, and Kit checks to `email-os`; do not make general AIEB setup depend on it.

### In Claude in a Project or folder

After the Project-folder boundary above passes, run the same checks on the attached workspace's `CLAUDE.md` and `.claude-state/`. If the client exposes neither a persistent root nor readable files, retain the explicit `not attached` or `unverified` workspace finding and stop local checks. Do not guess at files and do not downgrade the finding to "not applicable."

**Routing check (Claude in a Project or folder only):** ask whether skill suggestions have felt off — Claude answering generically instead of using the AI Employees. If so, the plugin is likely missing: walk them through **Customize → Personal plugins → + → Add marketplace →** `the2hourclo/aieb-thin-plugin` **→ Sync → install AI Employee Builder**. Reassure them about the red "trust this plugin" notice (standard for every non-Anthropic plugin). If Personal plugins isn't in their Customize screen, tell them to update the Claude desktop app first — it ships in current versions.

## Step 3 — Diagnose in plain words

Translate what you found into one short problem list, worst first. Examples of the register to use:

- "Onboarding never ran in this folder — that's why no skills are wired up here."
- "Your workspace instructions are from an older setup. An update refreshes just the part AI Employee Builder looks after — everything you wrote yourself stays." (Compare the `v=` numbers yourself; never show them.)
- "Your voice samples folder is empty, so the writing employees can't sound like you yet."

## Step 4 — Offer repairs (consent-gated, one at a time)

Offer ONLY the fixes that match findings, as a short menu. For each: say exactly what you would create or change, wait for a yes, then do it, then confirm.

| Finding | Offer |
|---|---|
| Managed block missing or `v=` stale | Refresh ONLY the text between the `:start` and `:end` markers in the surface's workspace-instructions file with the current template (re-fetch `onboard` and use its `scaffold-workspace` workflow for the canonical block text). On Codex, apply its platform mapping and update `AGENTS.md`, never `CLAUDE.md`. Blocks that exist in the workspace but NOT in the current template (e.g. the retired v=4 `skill-routing`, `quick-start`, `claude-folders`, `claude-state`, `update-check` blocks) are DELETED marker-to-marker, not refreshed. Never touch anything outside the markers; show what changes first. |
| Skill home missing (`.claude/skills/`, or `.agents/skills/` on Codex) | Create only that folder, with one `mkdir -p` command. Never flag or create `.claude/agents/`, `.claude/commands/`, or `.claude/hooks/` because they're absent: they appear with the first agent, command or hook. |
| Onboarding never ran | Suggest running the `onboard` skill start to finish rather than patching pieces. On Claude in a Project or folder, offer this only inside the attached readable/writable Project folder. If that root is non-empty, name it and get explicit confirmation that it is the intended AIEB workspace before fetching `onboard`; an empty attached root may proceed directly. |
| Voice profile, approved sample, or brand asset missing (full membership) | Suggest running `setup-content-employees`. A sample folder without `voice-profile.md` is not a calibrated setup. |
| Email OS requested or already configured | Hand off to `email-os` for its own preflight. If it is not installed/configured, show `➖ optional — not configured`; offer setup only when the user asked for automated sequences or Kit. |
| Connector connected, but `get_skill` or `find_skill` is blocked or missing while other AI Employee Builder tools show (the Claude app, desktop or claude.ai) | Do not update or reinstall. Walk them to **Customize → Connectors → aieb → Tool permissions** and set **Get AI Employee skill instructions** and **Find the right AI Employee skill** to **Always allow** or **Needs approval**. Leave the report tools as they are. Then retry one `get_skill` call in a fresh chat. |
| Account or connection problems on ANY device/chat | Update the plugin, then reconnect through the host's native AIEB connector control. In the Claude app, use **Customize → Connectors → aieb**; disconnect first only if an expired authorization is falsely marked **Connected**. The first-party page checks the purchase browser, existing course account, and verified Google email before offering the Lemon Squeezy key fallback. Existing Neon-linked members should reconnect without typing a key or consuming another activation. **The key never goes into chat.** A working legacy v0.29.x device connection may stay in place during migration; do not delete it manually. |
| Server says AIEB is connected but member setup is incomplete | Do not reconnect. If the connector lists a `complete_aieb_onboarding` tool, ask the four business-context questions, call it, then retry one paid `get_skill` call. If that tool is not listed, do not call it or ask the questions: retry one paid `get_skill` call and relay the server's message as written. |
| "A skill keeps doing X and I want it to stop/change" — and it's a skill THEY built (a real folder exists in the surface's authored-skill home) | If `retrospective` is available on this plan, route there: it shows a before/after edit and changes nothing until they say yes. If it is locked or unavailable, leave the file unchanged and explain that the guided skill-improvement workflow requires Builder access; do not improvise the repair inside a setup check. Do NOT draft an overrides file for a skill they own — nothing ever reads it. |
| "A skill keeps doing X and I want it to stop/change" — and it's a served skill (no local folder; it comes from the AI Employee Builder server, like write or copywriter) | That's a customization, not a breakage: their standing adjustments belong in `digital-assets/overrides/<skill-id>.md` — it survives every content update. Offer to draft one. |

**Quick guide — which fix goes with which skill** (when `retrospective` is available, the full guided flow lives there; this fallback remains usable without it. Origin: 2026-07-04 buyer-journey audit — four fix mechanisms contradicted each other at "my skill keeps doing X wrong"):

- Skill they built (folder in `.claude/skills/<name>/` on Claude or `.agents/skills/<name>/` on Codex) → if `retrospective` is available, use its before/after, approval-gated edit; otherwise leave the file unchanged and explain that Builder access is required — never invent an inline repair or an overrides file.
- Served skill (no local folder — fetched from the AI Employee Builder server) → `digital-assets/overrides/<skill-id>.md`; also offer to send one anonymized friction note to the author (the plugin's `skill-telemetry/note-friction-procedure.md`; only after an explicit yes).
- Third-party plugin skill (read-only cache from another author) → a feedback note to that plugin's author — never edit the cache, never an overrides file.

If they say no to a fix, leave it on the report and move on. Never re-ask in the same session.

## Step 5 — Close with a one-screen status card

End with a compact card — one line per check, ✅ / ⚠️ / ❌ / ➖ (not applicable):

```
AI Employee Builder — Setup Check
──────────────────────────────────
Connection             ✅ AI Employee Builder works in this chat
Membership             ✅ AI Employee Builders (full)
Workspace              ✅ <folder name> (can read and save)
Your skills folder     ✅ present
Setup                  ✅ finished
Workspace instructions ⚠️ older version — update offered, declined
Voice profile          ❌ missing — say "set up my content employees"
Approved samples       ✅ 2 files named by your voice profile
Brand doc              ✅ marketing/brand-positioning.md
Email sequences        ➖ optional — not set up
Fixes applied          1 of 2 offered
```

Then one closing sentence: what (if anything) they should do next, in plain words. If something is still broken after the repairs, offer to send Rashid a problem report (the `report-a-problem` skill, or the connector's `report_problem` tool), and send nothing without their yes.

---

**Version:** 2.5 — plain words and the new surface name (2026-10-05): the status card and findings say "connection", "membership" and "workspace instructions" instead of connector, entitlement, managed block and version numbers; "Cowork" is now "Claude in a Project or folder"; and missing `.claude/agents|commands|hooks` folders are no longer findings, because setup now creates them only when something is first built in them. Origin: 2026-10-05 new-member test (engineer-speak at setup, Allow prompts for empty folders). Carve-out: tool names and the app's own click labels stay exact. Previous v2.4 — a problem that survives the repairs now ends in an offer to report it (2026-10-04). Origin: Rashid wanted members' bugs reported from inside Claude instead of lost; this check is where an unfixable setup problem shows up first. Previous v2.3 — a connector whose skill tools are set to Blocked is now diagnosed as a permissions fix, not an update (2026-09-26). Origin: in a claude.ai chat test, `get_skill` and `find_skill` were Blocked under the aieb connector's Tool permissions. Chat saw only the X-Ray viewer, and this skill told the member to update the plugin, which could not help. Previous v2.2 made setup checks distinguish connector, entitlement, and durable Cowork Project-folder readiness (2026-09-01).
