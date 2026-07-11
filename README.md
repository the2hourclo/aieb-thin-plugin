# AI Employee Builder Public Shell

This plugin is intentionally thin: it contains no paid AIEB instruction bodies. It gives Claude a local connector and routing stubs; licensed skill instructions are fetched from the hosted AIEB MCP at runtime.

- MCP: `https://aieb-gated-mcp.vercel.app/mcp`
- Secure activation API: `https://aieb-gated-mcp.vercel.app/device/*`
- Customer activation page: `https://the2hourclo.github.io/clo-courses/clo-course/get-access-aieb.html`

## Secure connection model (v0.14.0)

The connector is defined at plugin level, so it exists in every folder the buyer opens. Setup is a device flow:

1. `/setup-aieb` calls `connect_aieb` with no secrets.
2. The connector creates a short-lived, one-time activation code and returns the course-page URL.
3. The buyer enters the Lemon Squeezy key on that HTTPS page, never in Claude or chat history.
4. After the buyer says `done`, Claude calls `finish_aieb_connection`.
5. The connector exchanges its private verifier for an opaque `aieb_v1_…` device token and stores that token in `~/.aieb-mcp/config.json` with user-only file permissions where supported.

The license key is used once by the activation service and is not stored by the plugin or written to product analytics. The server stores a hash of the device token, not the bearer token itself. Activation links expire and can be consumed only once.

Old `AIEB_LICENSE_KEY`, `config.json` license-key, and `activation.json` installations remain readable only for migration. A successful secure connection removes `license_key` from the user config. The advertised `activate_license` tool is a retired compatibility shim that redirects Claude to `connect_aieb` and accepts no key.

## What ships

- `skills/`: generated auto-routing loaders. Each loader fetches the real `SKILL.md` and referenced files with `get_skill`. Regenerate with `node scripts/gen-stubs.mjs`.
- `scripts/aieb-mcp-proxy.mjs`: local stdio connector, secure device-flow tools, and remote MCP forwarding.
- `commands/setup-aieb.md`: the two-action buyer setup flow.
- `hooks/`: onboarding, roadmap, update, and retrospective nudges.
- `skill-telemetry/`: explicit one-note feedback only; no automatic transcript capture or consent prompt.

No transcript, prompt, uploaded file, memory, or customer business data is stored in this shell or sent as analytics. Business content stays in the buyer's local workspace. Server events are limited to pseudonymous member/device references, skill IDs, result classes, versions, latency, and estimated token counts.

## Install

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
/setup-aieb
```

The buyer follows the secure link, clicks **Connect this device**, returns to Claude, and says `done`. No restart is required after the connection completes.

## Connector config

The plugin root `.mcp.json` ships with:

```json
{
  "mcpServers": {
    "aieb": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/aieb-mcp-proxy.mjs"]
    }
  }
}
```

After secure setup, `~/.aieb-mcp/config.json` resembles:

```json
{
  "installation_id": "local-random-uuid",
  "device_token": "aieb_v1_opaque-token",
  "device_ref": "pseudonymous-device-reference",
  "connected_at": "2026-07-10T00:00:00.000Z"
}
```

Buyers never hand-edit this file. `AIEB_MCP_URL`, `AIEB_DEVICE_START_URL`, and `AIEB_DEVICE_STATUS_URL` remain available as developer/testing overrides.

## Runtime and revocation

Normal skill requests use the device token as the MCP bearer credential. The server resolves it to a stored entitlement before returning paid instructions.

- A Lemon Squeezy cancellation webhook sets the entitlement to `cancelled` immediately, even if Lemon Squeezy would otherwise leave the subscription usable until its billing-period end.
- Cancelled, expired, unpaid, refunded, or disabled entitlements receive no paid content.
- Resume/renew webhooks restore the entitlement without reinstalling the plugin.
- Rate limits are independent for IP, device/license identity, activation code, and unauthenticated traffic.
- The connector uses the operating system certificate store and bounded network timeouts.

## Repair flow

| Symptom | Buyer-safe fix |
|---|---|
| Connector missing | Install/update the plugin, reload, then run `/setup-aieb`. |
| Unauthorized or device token revoked | Run `/setup-aieb` and use the secure page. Never paste a key into chat. |
| Subscription cancelled/lapsed | Resume or renew in Lemon Squeezy, then reconnect if needed. |
| Activation link expired | Run `/setup-aieb` again for a fresh link. |
| Network/VPN problem | Fix connectivity and retry; a network error is never presented as a rejected subscription. |

## Publishing

Paid skill content updates ship through the MCP server and require no shell reinstall. When the shell changes, bump both Claude manifests and the Codex manifest, update `AIEB_PLUGIN_LATEST_VERSION` on the server, test the secure activation flow, then publish the plugin.
