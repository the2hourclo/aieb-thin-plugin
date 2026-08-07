---
name: setup-aieb
description: Connect this device to AI Employee Builder and start first-run workspace setup. USE WHEN the user says "set up AIEB", "connect AIEB", "activate AI Employee Builder", "finish AIEB setup", or has just installed the plugin.
---

# Set up AI Employee Builder

Use the AIEB MCP tools available in this session. Tool prefixes vary by host, so match tools by their final name rather than requiring an exact prefix.

## Connect this device

1. Find and call the tool ending in `connect_aieb`.
2. Give the user the single secure activation URL it returns. Never ask them to paste a license key into chat.
3. Explain that the activation page first offers Google sign-in using the address they purchased with. The license key on that page is only a fallback.
4. When the user says the page is complete, call the tool ending in `finish_aieb_connection`.
5. Verify the connection by calling the tool ending in `get_skill` with `skill_id: ai-employee-map` and `path: SKILL.md`.

If the connection tools are missing, the plugin has not loaded correctly. On Codex, have the user install or update `ai-employee-builder@aieb-thin-plugin`, then start a fresh Codex thread so the plugin and MCP server initialize. On Claude Code or Cowork, follow that host's native plugin refresh flow.

## Start onboarding

After verification, fetch `get_skill(skill_id: "onboard", path: "SKILL.md")` and follow it. Apply the platform contract below to every fetched onboarding file and cross-skill call.

### Codex platform contract

When running in Codex:

- Treat `AGENTS.md` as the workspace instruction file wherever legacy AIEB instructions say `CLAUDE.md`.
- Treat `.agents/skills/` as the authored-skill directory wherever they say `.claude/skills/`.
- Do not create Claude-only `.claude/agents`, `.claude/commands`, or `.claude/hooks` folders. Codex subagents and automation are plugin capabilities, not workspace folders with the same schema.
- Keep `.claude-state/` unchanged. Despite its historical name, it is AIEB's shared product-state directory and lets the same workspace resume across supported clients.
- Use Codex plans and user-input controls when available; otherwise ask one clear question at a time.
- When onboarding or setup checks verify a managed workspace block, verify the AIEB-managed block in `AGENTS.md`.

Do not rewrite a user's existing `AGENTS.md`. Only create or update the explicitly marked AIEB-managed section, after following the consent rules in the fetched workflow.
