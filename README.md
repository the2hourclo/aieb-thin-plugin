# AIEB Thin Plugin

This plugin intentionally contains no paid AIEB instruction bodies.

It provides routing stubs for the 11 AI Employee Builder skills and connects the client to the hosted `aieb` MCP server. The server validates the buyer's LemonSqueezy license and returns skill instructions at runtime through `get_skill`.

The hosted production MCP is:

```text
https://aieb-gated-mcp.vercel.app/mcp
```

The activation endpoint is:

```text
https://aieb-gated-mcp.vercel.app/activate
```

## Configure

Edit `.mcp.json` after installation:

```json
{
  "AIEB_MCP_URL": "https://aieb-gated-mcp.vercel.app/mcp",
  "AIEB_ACTIVATE_URL": "https://aieb-gated-mcp.vercel.app/activate",
  "AIEB_LICENSE_KEY": "buyer-license-key"
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

Each skill stub tells the agent to call:

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

The plugin should be published as a free/public shell. Buyers install the shell, paste their LemonSqueezy key into the MCP config, and the proxy activates the key on first use.

Skill updates are published by updating the MCP server content and redeploying Vercel. Buyers do not reinstall the plugin unless the local shell changes.

Claude Code install commands:

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin install ai-employee-builder-mcp@aieb-thin-plugin
/reload-plugins
```
