---
description: Connect AI Employee Builder to the hosted licensed MCP server. Prompts for the buyer's Lemon Squeezy key, writes the local MCP config, and tests the connection without exposing paid skill bodies.
argument-hint: "[license key optional]"
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder MCP

You are configuring the public AI Employee Builder plugin shell. This plugin does not contain AIEB skill bodies. The paid instructions are served by the hosted MCP server after license validation.

## What To Do

1. Confirm Node.js is installed:

```bash
node --version
```

If Node.js is missing or older than v18, help the user install the current LTS for their OS, then continue.

2. Get the buyer's Lemon Squeezy license key.

- If `$ARGUMENTS` contains a key, use it.
- Otherwise ask the user to paste the key.
- Do not print the raw key back to the user.

3. Locate the local MCP proxy:

```text
${CLAUDE_PLUGIN_ROOT}/scripts/aieb-mcp-proxy.mjs
```

If `${CLAUDE_PLUGIN_ROOT}` is unavailable, find the installed plugin folder and use the absolute path to `scripts/aieb-mcp-proxy.mjs`.

4. Create or update the current workspace `.mcp.json`.

Preserve any existing MCP servers. Add or replace only the `aieb` entry:

```json
{
  "mcpServers": {
    "aieb": {
      "type": "stdio",
      "command": "node",
      "args": [
        "ABSOLUTE_PATH_TO_PLUGIN/scripts/aieb-mcp-proxy.mjs"
      ],
      "env": {
        "AIEB_MCP_URL": "https://aieb-gated-mcp.vercel.app/mcp",
        "AIEB_ACTIVATE_URL": "https://aieb-gated-mcp.vercel.app/activate",
        "AIEB_LICENSE_KEY": "BUYER_LICENSE_KEY"
      }
    }
  }
}
```

5. Make sure `.mcp.json` is not committed.

If the workspace has a `.gitignore`, ensure it includes:

```text
.mcp.json
```

6. Tell the user to reload Claude Code.

After reload, test the connection by asking the `aieb` MCP server for:

```json
{
  "skill_id": "meta-create-skill",
  "path": "SKILL.md",
  "task_context": "Connection smoke test"
}
```

## Important Rules

- Never bypass the license gate.
- Never store the license key anywhere except the local MCP config or the user's chosen secret store.
- Never claim the paid skills are installed locally. They are fetched from the MCP server at runtime.
- If the license is invalid, expired, cancelled, or belongs to another product, show the renewal/help response and stop.
