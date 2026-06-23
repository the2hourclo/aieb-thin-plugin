# AI Employee Builder Public Shell

This plugin intentionally contains no paid AIEB instruction bodies.

It gives buyers a public AI Employee Builder plugin they can install in Claude Code, then helps them connect to the hosted `aieb` MCP server. The server validates the buyer's LemonSqueezy license and returns paid skill instructions at runtime through `get_skill`.

The hosted production MCP is:

```text
https://aieb-gated-mcp.vercel.app/mcp
```

The activation endpoint is:

```text
https://aieb-gated-mcp.vercel.app/activate
```

## What's in this shell

Deliberately thin — no paid instruction bodies live here. What it ships:

- **`skills/` — auto-routing stubs.** One tiny `SKILL.md` per AIEB skill: real frontmatter (so Claude auto-routes on the user's phrasing exactly like the full skill) wrapped around a loader that fetches the real instructions, workflows, and references from the `aieb` MCP via `get_skill` at runtime. Regenerate with `node scripts/gen-stubs.mjs`.
- **`hooks/` — the proactive layer.** `onboard_nudge.py` offers onboarding on a fresh workspace; `retro_nudge.py` suggests flagging a skill that misfired; `update_ping.py` tells the buyer when this *shell* (not the content) needs updating, by checking the MCP's `/version`.
- **`skill-telemetry/` — opt-in feedback.** Captures which skills ran and lets buyers send a distilled, anonymized friction/win note to the author (consent-gated; nothing leaves without opt-in).
- **`commands/`** — `/setup-aieb`, `/note-friction`, `/note-win`.
- **`scripts/aieb-mcp-proxy.mjs`** — the licensed MCP proxy.

## Install

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
```

Then run the setup command:

```text
/setup-aieb
```

The command prompts for the buyer's Lemon Squeezy license key and writes the local MCP config.

## MCP Config Shape

The setup command writes this MCP server entry:

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
        "AIEB_LICENSE_KEY": "buyer-license-key"
      }
    }
  }
}
```

If the MCP client supports HTTP headers directly, you can skip the stdio proxy and configure a remote HTTP server with:

```json
{
  "type": "http",
  "url": "https://aieb-gated-mcp.vercel.app/mcp",
  "headers": {
    "Authorization": "Bearer buyer-license-key",
    "X-AIEB-Instance-ID": "license-instance-id-from-activation"
  }
}
```

## Runtime Contract

Once the MCP is connected, the client calls:

```json
{
  "tool": "get_skill",
  "arguments": {
    "skill_id": "meta-create-skill",
    "path": "SKILL.md",
    "task_context": "short user task summary"
  }
}
```

The returned instruction text is the paid body. If the license is inactive, the server returns a renewal/help response instead.

The included stdio proxy activates the buyer's license once through `/activate`, stores the LemonSqueezy instance ID in `~/.aieb-mcp/activation.json`, and sends that instance ID with every MCP request. This prevents a copied license key from working on unlimited machines.

## Buyer Install Shape

The plugin is a free/public shell. Buyers install the shell, run `/setup-aieb`, paste their LemonSqueezy key, and the proxy activates the key on first use.

Skill updates are published by updating the MCP server content and redeploying Vercel. Buyers do not reinstall the plugin unless the local shell changes.

When the shell itself changes, bump the plugin version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and set `AIEB_PLUGIN_LATEST_VERSION` (and `AIEB_PLUGIN_MIN_VERSION` for a hard floor) on the MCP. The `update_ping` hook reads the MCP's `/version` endpoint and nudges buyers to reinstall only when their local shell is behind.
