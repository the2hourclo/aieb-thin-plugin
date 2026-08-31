---
name: setup-aieb
description: Securely connect, reconnect, update, or resume AI Employee Builder through its remote connector. USE WHEN the user says "set up AIEB", "connect AIEB", "reconnect AIEB", "activate AI Employee Builder", "finish AIEB setup", "update AIEB", or has just installed the plugin.
---

# Set up AI Employee Builder

Use the AIEB MCP tools available in this session. Tool prefixes vary by host, so match tools by final name instead of assuming one exact prefix.

## Non-negotiable setup contract

- Never request or accept a Lemon Squeezy key in chat. The secure browser page is the only place a fallback key may be entered.
- The remote connector owns authentication. Do not recreate the retired local `connect_aieb` / `finish_aieb_connection` device flow or ask the user to edit `~/.aieb-mcp/config.json`.
- Never claim paid access works because the free `ai-employee-map` loads. Verify one paid skill.
- Never bypass cancellation, expiration, product, store, tier, connector-grant, or rate-limit checks.
- Preserve the user's workspace, progress, and active task.

> **Migration rule — origin 2026-08-31:** Cowork failed to launch the old local Node proxy on a customer Mac. Plugin v0.30.0 moved AIEB to remote HTTP OAuth. Existing device tokens remain valid only for older plugin versions during migration; do not tell a working legacy user to delete them manually.

## 0. Confirm the current shell is loaded

Search lazy-loaded tools for one ending in `get_skill`. If it does not exist after a real tool search, the connector did not load.

- **Cowork / Claude Desktop:** confirm AI Employee Builder v0.30.0+ is installed under Customize → Personal plugins. Refresh the `the2hourclo/aieb-thin-plugin` marketplace, update the plugin, start a new session, then open the AIEB connector control and choose **Connect**.
- **Claude Code:** refresh/install `ai-employee-builder@aieb-thin-plugin`, run `/reload-plugins`, then inspect `/mcp` and connect AIEB.
- **Codex:** run the commands below, then start a fresh task:

  ```text
  codex plugin marketplace upgrade aieb-thin-plugin
  codex plugin add ai-employee-builder@aieb-thin-plugin
  Start a fresh Codex task and say: set up AIEB
  ```

If Codex presents a hook review for this non-managed plugin, the user may review and trust the hooks; hook support is optional and does not authorize paid access. Do not improvise a key-bearing connector.

## 1. Prove the remote connection and authorize when needed

Call `get_skill` with `skill_id: meta-create-skill` and `path: SKILL.md`.

- **Paid skill loads:** the remote connector and paid entitlement are working. Continue to Step 2.
- **The host opens or requests authentication:** tell the user to click **Connect**. The first-party browser page tries, in order: purchase from this browser, existing course account, verified Google email, then Lemon Squeezy key as a fallback. Existing members already linked in Neon should need only one click.
- **Authentication is missing, expired, or revoked:** use the host's native AIEB connector control to connect again, then retry the paid fetch once. OAuth refresh normally happens silently; do not force reconnection for a transient tool error.
- **The user explicitly wants another account:** disconnect AIEB in the host's connector settings, reconnect, and choose the other account. Do not disconnect a working account merely to refresh it.
- **Entitlement is cancelled, expired, wrong-product, or wrong-tier:** stop and relay the server's renewal or plan guidance. Reconnecting cannot override billing state.

Never ask the user to paste a credential into chat. If they only want the free AI Employee Map, no paid connection is required; they can say **map my business**.

## 2. Verify the shell version

After the paid fetch succeeds, handle any shell-version notice it returns. Explain that skills, workspace state, and the existing account link stay intact across a plugin update. If there is no notice, keep the confirmation to one sentence. Paid skill bodies update server-side and do not require a reinstall.

## 3. Continue the workspace instead of restarting it

Read `.claude-state/progress-state.yaml` first. Despite its historical name, `.claude-state/` is shared AIEB product state across supported clients. Treat `.claude-state/onboarding-progress.json` only as a fallback when the YAML is absent.

- **Neither state file exists:** fetch `get_skill(skill_id: "onboard", path: "SKILL.md")` and follow it end to end.
- **`onboarding.completed_at` exists:** do not re-onboard. Continue the user's task; offer `check-setup` only for a missing or stale managed workspace block.
- **The current journey is in progress:** fetch `onboard` and resume from the recorded `current_step`.
- **Only the legacy JSON exists:** inspect workspace evidence, credit completed work, and enter the current onboarding workflow at the first unfinished checkpoint.

If setup interrupted another task, return to that task and resume onboarding at the next natural pause. Connection is a doorway, not permission to hijack the work.

## Codex platform contract

When running in Codex:

- Treat `AGENTS.md` as the workspace instruction file wherever a fetched legacy instruction says `CLAUDE.md`.
- Treat `.agents/skills/` as the authored-skill directory wherever it says `.claude/skills/`.
- Do not create Claude-only `.claude/agents`, `.claude/commands`, or `.claude/hooks` folders. Use Codex-native subagents, automations, and hooks.
- Keep `.claude-state/` unchanged so the same workspace resumes across supported clients.
- Verify only the explicitly marked AIEB-managed section in `AGENTS.md`; never replace unrelated instructions.

---

**Version:** 2.0 — remote OAuth connector, returning-member Neon fast path, and legacy-device migration (2026-08-31). Previous v1 used the local device proxy.
