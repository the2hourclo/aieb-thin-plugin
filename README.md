# AI Employee Builder plugin

The AI Employee Builder plugin puts the AI Employee Builders skills inside Claude Code, Claude Desktop and Codex. You install it once. The free skills work straight away, and any skill you buy unlocks after you sign in.

This repository is the plugin itself: skill loaders, setup commands and optional hooks. The paid skill instructions are not stored here. When you run a skill you own, the AI Employee Builders server sends its instructions to your Claude, so you always get the latest version.

Website: [aiemployeebuilders.com](https://aiemployeebuilders.com)

## Install

**Claude Code.** Type these one at a time:

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
/setup-aieb
```

**Claude Desktop.**

1. Open **Customize → Plugins → Browse plugins → Personal**, add `https://github.com/the2hourclo/aieb-thin-plugin`, and install **AI Employee Builder**.
2. Start a new chat inside a Project with a folder attached (**New chat → Project → Add folder**).
3. Type `/ai-employee-builder:setup-aieb` and select it (the chip may show `/setup-aieb`), or say **set up AI Employee Builder**.

## Unlock the skills you bought

1. Buy a skill or the membership at [aiemployeebuilders.com](https://aiemployeebuilders.com).
2. Install the plugin and ask Claude for the skill, for example **"Run my Business X-Ray"**.
3. A secure browser page opens. Sign in with Google using the email you paid with, and the skill unlocks.
4. If your Google account uses a different email, open **Use a license key instead** on that page and paste the license key from your purchase receipt email.

You connect each app once. If a purchase is refunded or a membership ends, paid skills stop on the next request. Renewing turns them back on without reinstalling anything.

## For developers

The plugin is intentionally thin: routing skills, commands and optional host hooks, with no paid instruction bodies. The hosted AI Employee Builders MCP server delivers licensed instructions at runtime.

- MCP and OAuth resource: `https://api.chiefleverageofficers.com/mcp` (the server's existing address; the plugin and every installed client point at it)

### Connection model (v0.30.0+; conversational setup in v0.31.0+; Project-folder preflight in v0.31.4)

The plugin declares AIEB as a remote HTTP MCP with OAuth resource metadata. Claude (in a Project or folder), Claude Code, and Codex can use their native connector authentication instead of launching a local Node proxy.

1. A paid `get_skill` request reaches the hosted MCP.
2. If the host has no valid AIEB token, the MCP returns a standards-based OAuth challenge.
3. The host opens the secure AIEB authorization page in the buyer's browser.
4. A returning buyer continues with an existing course session or the Google address attached to the purchase. The server first resolves the member and entitlement already stored in Neon, so it does not consume another store activation.
5. If that member has only a legacy local-device activation, the server atomically converts that existing slot into the first remote connector grant. A genuinely additional connector may activate another permitted instance server-side.
6. The host receives a short-lived access token plus a rotating refresh token. Only token hashes are stored.
7. If a server ever pauses paid delivery until the four member-intake answers are complete (only when it lists a `complete_aieb_onboarding` tool; the current server does not), the connector remains authenticated. In the Claude app, the buyer types `/ai-employee-builder:setup-aieb`, selects that namespaced skill, then presses Enter or starts the task. The selected chip may display `/setup-aieb`. The setup skill asks the questions and calls that tool; it never sends the buyer through OAuth a second time. Saying **set up AI Employee Builder** is the natural-language alternative.
8. Before local onboarding on Claude in a Project or folder, setup separately verifies that the chat belongs to a Project with the intended persistent readable/writable folder. Without one, setup keeps the connector and entitlement marked healthy, gives **New chat → Project → Add folder**, and stops before writing to scratch space.

The license key from the purchase receipt remains a secure-page fallback. It is never requested in chat, placed in an MCP config file, or returned to the plugin.

The legacy `scripts/aieb-mcp-proxy.mjs` remains in this release only for rollback and already-installed pre-0.30.0 clients. It is no longer declared by `.mcp.json` and must not be used by new installations.

### What ships

- `skills/`: generated routing loaders. Each loader fetches its real instructions through `get_skill`; generated loaders are not hand-edited.
- `skills/setup-aieb/`: connection and migration guidance for the remote OAuth connector.
- `skills/report-a-problem/`: helps a member send Rashid a problem report. Claude drafts it in plain words, shows the exact text, and sends it through the connector's `report_problem` tool only after the member says yes. If the connection itself is broken, the member gets the drafted report to post in the community instead.
- `commands/`: buyer-facing setup and workflow shortcuts.
- `hooks/`: optional onboarding, roadmap, update, and retrospective nudges on hosts that support plugin hooks, plus the opt-in local Continuous Improvement Ledger collector.
- `skill-telemetry/`: explicit structured feedback only; no automatic transcript capture.

No transcript, prompt, uploaded file, memory, license key, or customer business data is sent as product analytics. Business content stays in the buyer's workspace. Server events are limited to pseudonymous member/connector references, skill IDs, fixed outcome categories, versions, latency, and estimated token counts.

#### Optional local Continuous Improvement Ledger (v0.32.0+)

After the buyer explicitly opts in during setup, the retrospective hook records pointer-only `win` and `friction` events in that runtime's workspace inbox and ingests them into `.aieb/retrospective/ledger.jsonl`. Claude Code and Claude in a Project or folder use `.claude/.state/retrospective/inbox.jsonl`; Codex uses `.codex/.state/retrospective/inbox.jsonl`; another Agent Plugins-compatible host uses `.agents/.state/retrospective/inbox.jsonl`.

The collector does not copy transcript text, make network requests, edit skills, or authorize product feedback. Full transcript locations remain in the originating runtime inbox and never enter the shared ledger. Before first capture, the four private-state directories are added to the workspace `.gitignore` without replacing existing rules. Missing, declined, malformed, or unsafe preferences keep capture off; manual retrospective remains available. The workspace can opt out at any time by setting `.aieb/retrospective/preferences.json` to `enabled: false`.

The bundled `scripts/retrospective-ledger.mjs` helper performs deterministic ingestion and moves only reviewed, dismissed, or applied events into `.aieb/retrospective/archive.jsonl`; archived event IDs remain part of deduplication so old runtime pointers cannot recreate resolved work.

### Update an existing install

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin marketplace update aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
/setup-aieb
```

In the Claude desktop app, update the marketplace through **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then open **Customize → Plugins → AI Employee Builder → Update** if that button appears. Start a fresh session, type `/ai-employee-builder:setup-aieb`, choose the namespaced plugin skill, then press Enter or start the task. Claude may shorten the selected chip to `/setup-aieb`; that is expected. The buyer can instead say **set up AI Employee Builder**. For an expired authorization, open **Customize → Connectors → aieb** and reconnect. Disconnect first only when the host falsely leaves the expired connector marked **Connected**. The browser handles authentication; no local-runtime toggle or local Node installation is required.

### Connector declaration

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

### Access and revocation

- Every paid request resolves the OAuth connector grant back to the canonical Neon member and entitlement.
- Cancellation, expiration, nonpayment, refund, or administrative disablement blocks paid content on the next request.
- Resuming or renewing restores access without reinstalling the plugin.
- Access tokens expire quickly. Refresh tokens rotate on every use; replay revokes the token family.
- Raw OAuth tokens and license keys are never stored in the database.
- Free tools such as the AI Employee Map remain available without authentication.

### Repair flow

| Symptom | Buyer-safe fix |
|---|---|
| Connector missing from the session | In the Claude app, run **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then **Customize → Plugins → AI Employee Builder → Update** if shown. Start a fresh session and select `/ai-employee-builder:setup-aieb`; a bare typed `/setup-aieb` may not resolve before selection. |
| Host asks to authenticate | Click **Connect**, finish the secure browser flow, and retry the paid action. |
| Authorization expired, but Claude still shows Connected | Open **Customize → Connectors → aieb**, disconnect the falsely connected entry, then reconnect. If it is not falsely marked Connected, reconnect without the disconnect step. |
| Connected, but member setup is incomplete | Stay in the same session. In the Claude app, select `/ai-employee-builder:setup-aieb` (the selected chip may shorten to `/setup-aieb`) or say **set up AI Employee Builder**. It asks four short questions and completes onboarding through the authenticated connector. Do not reconnect. |
| Connected and paid, but no Project folder is attached | Authentication is complete; workspace setup is not. Open **New chat → Project → Add folder**, attach the persistent folder AI Employee Builder should use, then run setup again. Do not onboard in temporary scratch space. |
| Claude opened a read-only or wrong Project folder | Open the existing Project that owns the AI Employee Builder workspace and attach its original folder with write access. Do not rebuild or replace its state in a new folder. |
| Returning buyer is not recognized | Sign in with the Google address attached to the purchase. If that is not possible, use the license key from the purchase receipt, only on the secure browser page. |
| Subscription cancelled or lapsed | Resume or renew, then retry. Reinstallation is unnecessary. |
| Network/VPN problem | Restore connectivity and retry; a transport error must not be described as a license rejection. |
| Pre-0.30.0 install still works | Leave it intact until the remote rollout is confirmed, then update. Never tell a working buyer to delete `~/.aieb-mcp` manually. |

### Publishing

Paid skill updates ship through the hosted MCP and do not require a shell update. A connector release requires the OAuth database migration, hosted server deployment, course onboarding update, plugin version bump, contract and OAuth tests, a private canary, and then marketplace publication. Keep the legacy device-token path active for the announced migration window.
