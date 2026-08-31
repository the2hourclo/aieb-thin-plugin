# AI Employee Builder Public Shell

This plugin is intentionally thin. It contains routing skills, commands, and optional host hooks, but no paid AIEB instruction bodies. Licensed instructions are delivered at runtime by the hosted AIEB MCP.

- MCP and OAuth resource: `https://api.chiefleverageofficers.com/mcp`
- Customer onboarding: `https://course.chiefleverageofficers.com/clo-course/get-access-aieb.html`

## Connection model (v0.30.0+; conversational setup in v0.31.0+; cross-surface update guidance in v0.31.3)

The plugin declares AIEB as a remote HTTP MCP with OAuth resource metadata. Cowork, Claude Code, and Codex can use their native connector authentication instead of launching a local Node proxy.

1. A paid `get_skill` request reaches the hosted MCP.
2. If the host has no valid AIEB token, the MCP returns a standards-based OAuth challenge.
3. The host opens the secure AIEB authorization page in the buyer's browser.
4. A returning buyer continues with an existing course session or the Google address attached to the purchase. The server first resolves the member and entitlement already stored in Neon, so it does not consume another Lemon Squeezy activation.
5. If that member has only a legacy local-device activation, the server atomically converts that existing slot into the first remote connector grant. A genuinely additional connector may activate another permitted instance server-side.
6. The host receives a short-lived access token plus a rotating refresh token. Only token hashes are stored.
7. If the buyer has not completed the four member-intake answers, the connector remains authenticated while paid skill delivery pauses. In Cowork, the buyer types `/ai-employee-builder:setup-aieb`, selects that namespaced skill, then presses Enter or starts the task. The selected chip may display `/setup-aieb`. The setup skill asks the questions and calls `complete_aieb_onboarding`; it never sends the buyer through OAuth a second time. Saying **set up AIEB** is the natural-language alternative.

A Lemon Squeezy license key remains a secure-page fallback. It is never requested in chat, placed in an MCP config file, or returned to the plugin.

The legacy `scripts/aieb-mcp-proxy.mjs` remains in this release only for rollback and already-installed pre-0.30.0 clients. It is no longer declared by `.mcp.json` and must not be used by new installations.

## What ships

- `skills/`: generated routing loaders. Each loader fetches its real instructions through `get_skill`; generated loaders are not hand-edited.
- `skills/setup-aieb/`: connection and migration guidance for the remote OAuth connector.
- `commands/`: buyer-facing setup and workflow shortcuts.
- `hooks/`: optional onboarding, roadmap, update, and retrospective nudges on hosts that support plugin hooks.
- `skill-telemetry/`: explicit structured feedback only; no automatic transcript capture.

No transcript, prompt, uploaded file, memory, license key, or customer business data is sent as product analytics. Business content stays in the buyer's workspace. Server events are limited to pseudonymous member/connector references, skill IDs, fixed outcome categories, versions, latency, and estimated token counts.

## Install or update

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin marketplace update aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
/setup-aieb
```

In Cowork/Desktop, update the marketplace through **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then open **Customize → Plugins → AI Employee Builder → Update** if that button appears. Start a fresh session, type `/ai-employee-builder:setup-aieb`, choose the namespaced plugin skill, then press Enter or start the task. Cowork may shorten the selected chip to `/setup-aieb`; that is expected. The buyer can instead say **set up AIEB**. For an expired authorization, open **Customize → Connectors → aieb** and reconnect. Disconnect first only when the host falsely leaves the expired connector marked **Connected**. The browser handles authentication; no local-runtime toggle or local Node installation is required.

## Connector declaration

Both `.mcp.json` and `mcp.json` declare the remote resource:

```json
{
  "mcpServers": {
    "aieb": {
      "type": "http",
      "url": "https://api.chiefleverageofficers.com/mcp"
    }
  }
}
```

## Access and revocation

- Every paid request resolves the OAuth connector grant back to the canonical Neon member and entitlement.
- Cancellation, expiration, nonpayment, refund, or administrative disablement blocks paid content on the next request.
- Resuming or renewing restores access without reinstalling the plugin.
- Access tokens expire quickly. Refresh tokens rotate on every use; replay revokes the token family.
- Raw OAuth tokens and license keys are never stored in the database.
- Free tools such as the AI Employee Map remain available without authentication.

## Repair flow

| Symptom | Buyer-safe fix |
|---|---|
| Connector missing from the session | In Cowork, run **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then **Customize → Plugins → AI Employee Builder → Update** if shown. Start a fresh session and select `/ai-employee-builder:setup-aieb`; a bare typed `/setup-aieb` may not resolve before selection. |
| Host asks to authenticate | Click **Connect**, finish the secure browser flow, and retry the paid action. |
| Authorization expired, but Cowork still shows Connected | Open **Customize → Connectors → aieb**, disconnect the falsely connected entry, then reconnect. If it is not falsely marked Connected, reconnect without the disconnect step. |
| Connected, but member setup is incomplete | Stay in the same session. In Cowork, select `/ai-employee-builder:setup-aieb` (the selected chip may shorten to `/setup-aieb`) or say **set up AIEB**. It asks four short questions and completes onboarding through the authenticated connector. Do not reconnect. |
| Returning buyer is not recognized | Use the Google address attached to the purchase; use a Lemon Squeezy key only on the secure browser page if needed. |
| Subscription cancelled or lapsed | Resume or renew, then retry. Reinstallation is unnecessary. |
| Network/VPN problem | Restore connectivity and retry; a transport error must not be described as a license rejection. |
| Pre-0.30.0 install still works | Leave it intact until the remote rollout is confirmed, then update. Never tell a working buyer to delete `~/.aieb-mcp` manually. |

## Publishing

Paid skill updates ship through the hosted MCP and do not require a shell update. A connector release requires the OAuth database migration, hosted server deployment, course onboarding update, plugin version bump, contract and OAuth tests, a private canary, and then marketplace publication. Keep the legacy device-token path active for the announced migration window.
