---
name: setup-aieb
description: Securely connect, reconnect, update, or resume AI Employee Builder on this device. USE WHEN the user says "set up AIEB", "connect AIEB", "reconnect AIEB", "activate AI Employee Builder", "finish AIEB setup", "update AIEB", or has just installed the plugin.
---

# Set up AI Employee Builder

Use the AIEB MCP tools in this session. Tool prefixes vary by host, so match tools by their final name rather than requiring an exact prefix.

## Non-negotiable setup contract

- Never request or accept a Lemon Squeezy key in chat. Never place one in a command, environment variable, URL, workspace file, config file, or model-visible tool argument.
- Use only the secure browser activation returned by `connect_aieb`. The browser may recognise the purchase automatically; the key is a fallback entered on that page, never the default instruction.
- Never claim paid access works because the free `ai-employee-map` loads. Verify a paid entitlement as described below.
- Never bypass cancellation, expiration, product, store, tier, device, or rate-limit checks.
- Setup must preserve the user's workspace, progress, and active task.

## 0. Confirm the shell is loaded

Find the tools ending in `connect_aieb`, `finish_aieb_connection`, and `get_skill`. Search for lazy-loaded tools before declaring them missing.

If they are missing on Codex, give these steps and stop; a fresh thread is required for the refreshed plugin to initialise. Run the first line only when the marketplace is not already registered:

```text
codex plugin marketplace add the2hourclo/aieb-thin-plugin
codex plugin marketplace upgrade aieb-thin-plugin
codex plugin add ai-employee-builder@aieb-thin-plugin
Start a fresh Codex thread and say: set up AIEB
```

If Codex presents a hook review for this non-managed plugin, the user must review and trust the current hook definition before hook-based guards or nudges can run. On Claude Code or Cowork, use that host's native marketplace refresh, plugin install, and session reload flow. Do not improvise a key-based connector.

## 1. Connect or reconnect

First call `get_skill` with `skill_id: meta-create-skill` and `path: SKILL.md`.

- **Paid skill loads:** the device is already connected. Say so in one line and continue to the update and workspace checks. Mention the escape hatch once: the user can say **reconnect** to use a different account or subscription.
- **Authentication is missing or revoked:** call `connect_aieb` with no arguments.
- **The user explicitly asks to reconnect, use another account, or says the connection belongs to someone else:** call `connect_aieb` with `reconnect: true`. Never set `reconnect: true` merely to refresh a working connection.
- **Entitlement is cancelled, expired, wrong-product, or wrong-tier:** stop and relay the server's renewal or plan guidance. Do not reconnect to evade an entitlement result.

Give the user the single activation URL returned by `connect_aieb`, then wait. Explain that the page may recognise the purchase automatically; otherwise they enter the key on that page. Never ask them to paste it here or hand-edit `~/.aieb-mcp/config.json`.

When they return or continue, call `finish_aieb_connection`:

- **Approved:** continue immediately; the connector stores only the scoped device token.
- **Pending:** show the same URL once and ask them to finish the page.
- **Expired:** call `connect_aieb` once for a fresh URL.
- **Cancelled or expired subscription:** relay the result and stop.

## 2. Verify paid access and check updates

Call `get_skill` with `skill_id: meta-create-skill` and `path: SKILL.md`. This paid fetch is the setup gate. The free `ai-employee-map` can verify transport only, not the buyer's paid plan.

- If the paid skill loads, setup is connected.
- If it returns a locked, renewal, product, or tier response, setup is not complete; relay the exact next step and stop.
- If the response includes a shell-version notice, tell the user their skills, connection, and progress stay intact, then give the host's update steps. On Codex use:

  ```text
  codex plugin marketplace upgrade aieb-thin-plugin
  codex plugin add ai-employee-builder@aieb-thin-plugin
  Start a fresh Codex thread and say: set up AIEB
  ```

- If there is no update notice, confirm the shell is current without adding ceremony. Paid skill bodies are served fresh at fetch time and do not require a shell update.

## 3. Continue the workspace instead of restarting it

After the first successful paid verification, read `.claude-state/progress-state.yaml` first. Despite its historical name, `.claude-state/` is shared AIEB product state across supported clients. Treat `.claude-state/onboarding-progress.json` only as a fallback hint when the YAML does not exist.

- **Neither state file exists:** transition directly into onboarding. Fetch `get_skill(skill_id: "onboard", path: "SKILL.md")` and follow it end to end.
- **`onboarding.completed_at` is set in the YAML:** do not re-onboard. Continue the user's task; if the managed workspace block is missing or stale, offer `check-setup`.
- **The YAML exists and the current journey is in progress:** fetch `onboard` and resume from the recorded `current_step`, never from the beginning.
- **Only the legacy JSON exists:** re-orient to the current `onboard` workflow instead of blindly resuming its old `current_step`, especially when it names retired digital-assets, voice-sample, or asset-folder work. Inspect workspace evidence, credit completed scaffolding or X-Ray work, and enter at the first unfinished checkpoint.

If setup was invoked while the user was already doing another task, continue that task now and begin or resume onboarding at the next natural pause. Connection is a doorway, not permission to hijack active work.

## Codex platform contract

When running in Codex:

- Treat `AGENTS.md` as the workspace instruction file wherever a fetched legacy instruction says `CLAUDE.md`.
- Treat `.agents/skills/` as the authored-skill directory wherever it says `.claude/skills/`.
- Do not create Claude-only `.claude/agents`, `.claude/commands`, or `.claude/hooks` folders. Use Codex-native subagents, automations, and hooks.
- Keep `.claude-state/` unchanged so the same workspace can resume across supported clients.
- Use Codex plans and user-input controls when available; otherwise ask one clear question at a time.
- Verify only the explicitly marked AIEB-managed section in `AGENTS.md`. Never replace the user's existing file or unrelated instructions.

Apply this contract to every fetched onboarding file and cross-skill call.
