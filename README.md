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
