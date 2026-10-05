---
name: setup-aieb
description: Securely connect, reconnect, update, or resume AI Employee Builder through its remote connector, and configure its private local improvement ledger. USE WHEN the user says "set up AI Employee Builder", "connect AI Employee Builder", "set up AIEB", "connect AIEB", "reconnect AIEB", "activate AI Employee Builder", "finish AIEB setup", "update AIEB", "enable my local improvement ledger", "disable my local improvement ledger", or has just installed the plugin.
---

# Set up AI Employee Builder

Use the AIEB MCP tools available in this session. Tool prefixes vary by host, so match tools by final name instead of assuming one exact prefix.

## Non-negotiable setup contract

- Never request or accept a Lemon Squeezy key in chat. The secure browser page is the only place a fallback key may be entered.
- The remote connector owns authentication. Do not recreate the retired local `connect_aieb` / `finish_aieb_connection` device flow or ask the user to edit `~/.aieb-mcp/config.json`.
- Never claim paid access works because the free `ai-employee-map` loads. Verify one paid skill.
- Never bypass cancellation, expiration, product, store, tier, connector-grant, or rate-limit checks.
- Preserve the user's workspace, progress, and active task.
- **Plain words to the member.** Say "your AI Employee Builder connection", "your membership" and "your workspace". Never say "AIEB", "connector", "MCP", "entitlement", "tier", a plan id, a skill id you fetched to check access, a version number, or the name of a progress file. When a check passes, one sentence is enough: **"You're connected, and your AI Employee Builders membership is active."** Use the app's own labels (like **Customize → Connectors → aieb**) only when telling the member where to click.
- **Nothing outside the workspace until the member asks.** Don't run `gh`, check a GitHub login, or reach other accounts or folders during setup; onboarding asks before any backup.

> **Migration rule — origin 2026-08-31:** Cowork failed to launch the old local Node proxy on a customer Mac. Plugin v0.30.0 moved AIEB to remote HTTP OAuth. Existing device tokens remain valid only for older plugin versions during migration; do not tell a working legacy user to delete them manually.

> **Plain-words rule — origin 2026-10-05:** a new-member test heard "AIEB is connected… plan 'full', confirmed by fetching `meta-create-skill`", "managed block (v=5)" and "plugin version unknown", and setup ran `gh auth status` before asking about a backup. **Carve-out:** exact tool names and click paths stay exact, because the member needs them to find the right button.

**Ledger-only request:** If the user asked only to enable or disable the local improvement ledger, do not rerun connector or member onboarding. Verify the current workspace root is durable and writable, then go directly to Step 6 and record the requested preference. On Claude in a Project or folder, the Project-folder boundary in Step 4 still applies because scratch space cannot hold a durable ledger.

## 0. Confirm the current shell is loaded

Search lazy-loaded tools for one ending in `get_skill`. If it does not exist after a real tool search, the connector did not load.

- **Claude in a Project or folder (the Claude desktop app):** confirm AI Employee Builder v0.31.4+ is installed. Update the marketplace through **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then open **Customize → Plugins → AI Employee Builder → Update** if that button appears. Start a new session. To launch setup, type `/ai-employee-builder:setup-aieb`, choose the namespaced plugin skill, then press Enter or start the task. After selection, Claude may display the shorter `/setup-aieb` chip; that is expected. The natural-language route **set up AI Employee Builder** also works. When authorization is needed, open **Customize → Connectors → aieb** and reconnect. Disconnect first only if the host falsely leaves an expired authorization marked **Connected**.

> **Invocation rule — origin 2026-09-01:** A real Cowork test treated a bare typed `/setup-aieb` as an unknown skill, while the namespaced plugin skill launched correctly and then displayed the short chip. This namespace requirement applies to selecting the plugin skill in the Claude app; Claude Code's installed slash command and the natural-language route remain valid.

> **Update and reconnect rule — origin 2026-09-01:** Live UI verification showed that marketplace refresh, installed-plugin update, and connector authorization live on three different screens. Follow the named routes above. Do not disconnect a healthy connector merely to refresh the plugin; disconnect-first is reserved for the false-Connected expired state.
- **Claude Code:** refresh/install `ai-employee-builder@aieb-thin-plugin`, run `/reload-plugins`, then inspect `/mcp` and connect AIEB.
- **Codex:** run the commands below, then start a fresh task:

  ```text
  codex plugin marketplace upgrade aieb-thin-plugin
  codex plugin add ai-employee-builder@aieb-thin-plugin
  Start a fresh Codex task and say: set up AI Employee Builder
  ```

If Codex presents a hook review for this non-managed plugin, the user may review and trust the hooks; hook support is optional and does not authorize paid access. Do not improvise a key-bearing connector.

## 1. Connect through the browser when needed

Call `get_skill` with `skill_id: meta-create-skill` and `path: SKILL.md`.

- **Paid skill loads:** the remote connector and paid entitlement are working. Tell the member in one sentence ("You're connected, and your AI Employee Builders membership is active.") and continue to Step 2.
- **The host opens or requests authentication:** tell the user to click **Connect**. The first-party browser page tries, in order: purchase from this browser, existing course account, verified Google email, then Lemon Squeezy key as a fallback. Existing members already linked in Neon should need only one click.
- **The response says AIEB is securely connected but member setup is still needed:** OAuth succeeded. Do not reconnect and do not send the user to a checkout form. Continue to Step 2 and complete the four answers in this conversation.
- **Authentication is missing, expired, or revoked:** use the host's native AIEB connector control to connect again, then retry the paid fetch once. In the Claude app, open **Customize → Connectors → aieb** and reconnect; disconnect first only when the host falsely leaves the expired authorization marked **Connected**. OAuth refresh normally happens silently; do not force reconnection for a transient tool error.
- **The user explicitly wants another account:** disconnect AIEB in the host's connector settings, reconnect, and choose the other account. Do not disconnect a working account merely to refresh it.
- **Entitlement is cancelled, expired, wrong-product, or wrong-tier:** stop and relay the server's renewal or plan guidance. Reconnecting cannot override billing state.

Never ask the user to paste a credential into chat. If they only want the free AI Employee Map, no paid connection is required; they can say **map my business**.

## 2. Complete missing member context after OAuth

If the paid fetch says member setup is still needed, ask these four questions conversationally. Reuse answers already present in the current conversation; never make the user repeat information you already have.

1. What does the business sell, and to whom?
2. Which recurring job should the first AI Employee take over?
3. How often does that job happen, and how much time does it currently take?
4. What does a good finished result look like?

Only when the AIEB connector's tool list actually includes `complete_aieb_onboarding`: once all four answers are clear, call it with `business_offer`, `recurring_job`, `frequency_and_time`, and `good_result`. Never invent an answer. After success, retry `get_skill(skill_id: "meta-create-skill", path: "SKILL.md")` once to prove paid access is open.

- The current AIEB connector lists only `get_skill`, `find_skill`, `report_build_outcome`, `report_product_outcome`, `report_checkpoint`, and `show_business_xray`. If `complete_aieb_onboarding` is absent after a real tool search, do not call it, do not ask the four questions, and do not tell the user to update the plugin. Retry the paid fetch once, and if it is still refused, relay the server's message as written.
- If the user already completed the Get Access form, the paid fetch should load immediately and these questions must not run again.
- Missing intake is a setup state, not an authentication or billing failure. Do not ask for a key or send the user back through OAuth.

## 3. Verify the shell version

After the paid fetch succeeds, handle any shell-version notice it returns: tell the member in plain words that an update is available and where to click, and that their skills, workspace and account link stay intact across it. If there is no notice, say nothing about versions. Paid skill bodies update server-side and do not require a reinstall.

## 4. Verify the Project and folder boundary (Claude in a Project or folder)

Run this preflight on **Claude in a Project or folder** after authentication and entitlement succeed but **before** reading either state file or fetching `onboard`. Connection, membership, and workspace readiness are separate facts. Report them separately and never say **all set** while the workspace row is unresolved.

Determine from the current session whether this chat is inside a Claude Project with one persistent working folder attached. Identify the folder by its displayed name or resolved root, and verify that the session can read and write it. Use host/project context and file metadata; do not create a probe file just to test access.

- **No Project folder is attached, or no persistent root is exposed:** report `Connection ✅`, `Membership ✅`, and `Workspace ❌ no folder attached`. Tell the user exactly: **Open New chat → Project → Add folder, attach the folder you want AI Employee Builder to use, then say "set up AI Employee Builder" again.** Stop. Do not inspect `.claude-state`, fetch `onboard`, scaffold, or write anything in temporary scratch space.
- **The root is readable but read-only:** report `Workspace ⚠️ read-only`, name the root, and stop before onboarding. Ask them to attach that folder with write access. If it is an existing AI Employee Builder workspace, tell them to open its existing Project and attach the same folder; never rebuild it in a new folder.
- **The user says their AI Employee Builder workspace already exists in another Project or folder:** keep connection and membership marked healthy, direct them to open that existing Project with its original folder attached, and stop. Do not create replacement state or re-onboard here.
- **A readable, writable root is attached and non-empty:** name the root and ask: **Is `<root>` the folder you want AI Employee Builder to use?** Stop until they explicitly confirm. Do not read state, fetch onboarding, or modify files before that confirmation.
- **A readable, writable root is attached and verified empty:** continue without an extra confirmation; attaching an empty folder to this Project is sufficient intent for first-run setup.

If the host cannot establish read/write access, mark the workspace **unverified**, not ready. Do not describe workspace checks as inapplicable on Claude in a Project or folder.

> **Workspace-boundary rule — origin 2026-09-01:** a real paid Cowork setup continued inside temporary scratch space and told the member only to “pick a folder,” so the connector worked while no durable workspace was created. The preflight now blocks onboarding until the Claude app exposes the intended persistent Project folder. **Carve-out:** Claude Code and Codex already start with an explicit working root; use their normal workspace safeguards rather than sending them through the **New chat → Project → Add folder** UI.

## 5. Continue the workspace instead of restarting it

Read `.claude-state/progress-state.yaml` first. Despite its historical name, `.claude-state/` is shared AIEB product state across supported clients. Treat `.claude-state/onboarding-progress.json` only as a fallback when the YAML is absent.

- **Neither state file exists:** fetch `get_skill(skill_id: "onboard", path: "SKILL.md")` and follow it end to end. On Claude in a Project or folder, reach this branch only after Step 4 verified an attached empty readable/writable root, or after the user explicitly confirmed the named non-empty root. Pass that boundary decision into the handoff so onboarding cannot treat scratch space or an unconfirmed repository as its workspace.
- **`onboarding.completed_at` exists:** do not re-onboard. Continue the user's task; offer `check-setup` only for a missing or stale managed workspace block.
- **The current journey is in progress:** fetch `onboard` and resume from the recorded `current_step`.
- **Only the legacy JSON exists:** inspect workspace evidence, credit completed work, and enter the current onboarding workflow at the first unfinished checkpoint.

If setup interrupted another task, return to that task and resume onboarding at the next natural pause. Connection is a doorway, not permission to hijack the work.

## 6. Offer the private Continuous Improvement Ledger

After the workspace is verified and normal setup is complete, check `.aieb/retrospective/preferences.json`.

- **A prior decision exists:** preserve it. Do not ask again during routine setup.
- **No decision exists:** ask once: **Would you like AI Employee Builder to keep a private record, in this folder, of when a skill worked well or went wrong, so it can spot patterns over time? It keeps short pointers, not your conversations, and uploads nothing.**
- **If yes:** create `.aieb/retrospective/preferences.json` with:

  ```json
  {
    "schema_version": 1,
    "enabled": true,
    "capture_mode": "pointer-only",
    "product_feedback": "separate-consent",
    "decided_at": "<current ISO timestamp>"
  }
  ```

- **If no:** write the same file with `enabled: false` so future setup runs respect the decision. The user can change it later by saying **enable my local improvement ledger** or **disable my local improvement ledger**.

The plugin hook creates the runtime-local inbox only after opt-in: `.claude/.state/retrospective/inbox.jsonl` on Claude Code and Claude in a Project or folder, `.codex/.state/retrospective/inbox.jsonl` on Codex, and `.agents/.state/retrospective/inbox.jsonl` on another Agent Plugins-compatible host. All supported runtimes ingest into `.aieb/retrospective/ledger.jsonl` in the verified workspace.

Before the first capture, the hook appends those four private-state directories to the workspace `.gitignore` without replacing existing rules. Tell the user this protection is part of enabling the ledger.

Never store transcript text in these files, never treat local capture as consent to send product feedback, and never treat a ledger item as approval to edit a skill. **Origin 2026-09-02:** cross-runtime AIEB clients needed durable improvement history without merging Claude/Codex private transcript stores. **Carve-out:** immediate manual retrospectives work without enabling the ledger.

## Codex platform contract

When running in Codex:

- Treat `AGENTS.md` as the workspace instruction file wherever a fetched legacy instruction says `CLAUDE.md`.
- Treat `.agents/skills/` as the authored-skill directory wherever it says `.claude/skills/`.
- Do not create Claude-only `.claude/agents`, `.claude/commands`, or `.claude/hooks` folders. Use Codex-native subagents, automations, and hooks.
- Keep `.claude-state/` unchanged so the same workspace resumes across supported clients.
- Verify only the explicitly marked AIEB-managed section in `AGENTS.md`; never replace unrelated instructions.

---

**Version:** 2.7 — plain words to the member, nothing outside the workspace before the member asks, and "Cowork" is now "Claude in a Project or folder" (2026-10-05). Previous v2.6 — setup offers an opt-in, pointer-only Continuous Improvement Ledger after durable workspace verification (2026-09-02); v2.5 separated connector, entitlement, and Cowork workspace readiness.
