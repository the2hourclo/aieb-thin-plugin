# AI Employee Builder Public Shell

This plugin intentionally contains no paid AIEB instruction bodies.

It gives buyers a public AI Employee Builder plugin they can install in Claude Code. The plugin ships the connector to the hosted `aieb` MCP server; the server validates the buyer's LemonSqueezy license and returns paid skill instructions at runtime through `get_skill`.

The hosted production MCP is:

```text
https://aieb-gated-mcp.vercel.app/mcp
```

The activation endpoint is:

```text
https://aieb-gated-mcp.vercel.app/activate
```

## The global key model (v0.7.0)

The connector is defined at the **plugin level** (`.mcp.json` at the plugin root, pointing at `scripts/aieb-mcp-proxy.mjs` via `${CLAUDE_PLUGIN_ROOT}`), so it exists in **every folder** the buyer opens — no per-workspace setup.

The license key lives **user-globally**, never per-folder. The connector resolves it in this order:

1. `AIEB_LICENSE_KEY` environment variable (if set for the process),
2. `~/.aieb-mcp/config.json` → `{ "license_key": "…" }` (written once by `/setup-aieb`).

That config file may also carry an `AIEB_MCP_URL` override (useful for testing against a local server). Quotes and stray whitespace around any pasted value are stripped wherever it's read, and leftover `PASTE_…` placeholders are ignored. Activation state (the LemonSqueezy instance id per key) lives next to it in `~/.aieb-mcp/activation.json`.

Older shell versions wrote an `aieb` entry with the key inline into each workspace's `.mcp.json`. `/setup-aieb` now removes that entry when it finds one — the plugin-level connector covers every folder, and a stale per-folder key would shadow the global one.

## What's in this shell

Deliberately thin — no paid instruction bodies live here. What it ships:

- **`skills/` — auto-routing stubs.** One tiny `SKILL.md` per AIEB skill: real frontmatter (so Claude auto-routes on the user's phrasing exactly like the full skill) wrapped around a loader that fetches the real instructions, workflows, and references from the `aieb` MCP via `get_skill` at runtime. If the connector is missing on the machine, the loader tells the user the repair line — run `/setup-aieb`, then `/reload-plugins` — instead of failing silently. Regenerate with `node scripts/gen-stubs.mjs`.
- **`hooks/` — the proactive layer.** `onboard_nudge` offers onboarding on a fresh workspace; `roadmap_nudge` offers the next build step once onboarding is done; `update_ping` tells the buyer when this *shell* (not the content) needs updating, by checking the MCP's `/version` — and also when the workspace's managed CLAUDE.md block is behind the current template (`claude_md_template` in `/version` vs the `v=N` stamp in the managed block; the nudge is "say 'check my setup'"); `retro_nudge.py` suggests flagging a skill that misfired.
- **`skill-telemetry/` — opt-in feedback.** Captures which skills ran and lets buyers send a distilled, anonymized friction/win note to the author (consent-gated; nothing leaves without opt-in).
- **`commands/`** — `/setup-aieb`, `/note-friction`, `/note-win`.
- **`scripts/aieb-mcp-proxy.mjs`** — the licensed connector (stdio → hosted MCP).
- **`scripts/setup-license.mjs`** — the one-shot setup used by `/setup-aieb`: sanitizes the pasted key, validates it against `/activate`, writes `~/.aieb-mcp/config.json`, and verifies end to end with a real `get_skill` fetch. Prints only the last 4 characters of the key, never the full key.

### Hook runtime: Node first, Python fallback

The three nudge hooks are **Node scripts** (`.mjs`) because Node is guaranteed on every buyer machine — the connector itself runs on it — while Python is missing on stock Windows. `hooks/hooks.json` chains each one as:

```text
node hooks/<name>.mjs || python3 hooks/<name>.py || python hooks/<name>.py || true
```

The legacy `.py` files stay in place purely as a belt-and-suspenders fallback for machines where `node` somehow isn't on PATH; they are frozen at the pre-0.7.0 behavior (no workspace-stamp nudge). `retro_nudge.py` and the telemetry hooks remain Python-only for now. Every hook is fail-silent: any error exits 0 and never blocks a session.

## Install

```text
/plugin marketplace add https://github.com/the2hourclo/aieb-thin-plugin
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
```

Then run the setup command once:

```text
/setup-aieb
```

The command asks for the buyer's Lemon Squeezy license key (it's in the purchase receipt email), validates it immediately against `/activate`, saves it user-globally, migrates away any old per-folder config, and finishes with a verification fetch (`get_skill` → `meta-create-skill` / `SKILL.md`). One run, every folder.

## Connector Config Shape

The plugin root `.mcp.json` (ships with the plugin — buyers never edit it):

```json
{
  "mcpServers": {
    "aieb": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${CLAUDE_PLUGIN_ROOT}/scripts/aieb-mcp-proxy.mjs"
      ]
    }
  }
}
```

No key in the config — the connector finds it globally (see the key model above). `~/.aieb-mcp/config.json` written by `/setup-aieb`:

```json
{
  "license_key": "buyer-license-key",
  "saved_at": "2026-07-03T00:00:00.000Z"
}
```

If the MCP client supports HTTP headers directly, the stdio connector can be skipped in favor of a remote HTTP server with:

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

The connector activates the buyer's license once through `/activate`, stores the LemonSqueezy instance ID in `~/.aieb-mcp/activation.json`, and sends that instance ID with every MCP request. This prevents a copied license key from working on unlimited machines. Hardening in v0.7.0:

- **OS certificate trust** — the connector loads the system CA store in code, so TLS-inspecting antivirus/VPN/corporate proxies don't break HTTPS.
- **Failure caching** — a key the server *rejects* is remembered for 5 minutes (and concurrent messages share one in-flight activation), so a broken key can't hammer `/activate` on every message. Network blips are never cached.
- **Honest errors** — an activation rejection relays the server's `reason` and its `renew_url`; a transport failure says "can't reach the server — check internet/VPN". The two are never conflated.

## Repair flow (buyer-facing)

| Symptom | What the buyer sees | Fix |
|---|---|---|
| Connector missing on this machine | Any skill stub says: "The AI Employee Builder connector isn't set up on this machine yet — run /setup-aieb (your license key is in your Lemon Squeezy receipt email), then /reload-plugins." | `/setup-aieb` → `/reload-plugins` |
| Key rejected (expired/cancelled/wrong product) | The server's reason + the renewal link, and a pointer to the receipt email | Re-paste the right key via `/setup-aieb`, or renew |
| No internet / VPN blocking | "Can't reach the AI Employee Builder server — check your internet, VPN, or firewall" | Fix the connection; nothing to reconfigure |
| Workspace map outdated | "Your AI Employee workspace map is a version behind — say 'check my setup' to refresh it." | Say "check my setup" |

## Buyer Install Shape

The plugin is a free/public shell. Buyers install the shell, run `/setup-aieb` once, paste their LemonSqueezy key, and the connector works in every folder from then on.

Skill updates are published by updating the MCP server content and redeploying Vercel. Buyers do not reinstall the plugin unless the local shell changes.

When the shell itself changes, bump the plugin version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and set `AIEB_PLUGIN_LATEST_VERSION` (and `AIEB_PLUGIN_MIN_VERSION` for a hard floor) on the MCP. The `update_ping` hook reads the MCP's `/version` endpoint and nudges buyers to reinstall only when their local shell is behind. When the server also reports `claude_md_template`, the same hook compares it against the workspace's managed-block stamp and nudges a gentle "check my setup" refresh when the workspace map is behind.
