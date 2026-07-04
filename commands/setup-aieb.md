---
description: Connect AI Employee Builder with the buyer's Lemon Squeezy license key. Validates the key against the server, saves it once user-globally (works in every folder), cleans up old per-folder config, and verifies with a real skill fetch.
argument-hint: "[license key optional]"
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

You are connecting this machine to the AI Employee Builder server. The paid skill instructions live on that server and load at runtime after the license is checked — nothing of value is stored locally.

Since v0.7.0 the connector is defined at the plugin level, so it exists in **every folder** the user opens. The license key is saved **once**, user-globally, in `~/.aieb-mcp/config.json`. There is no per-folder setup anymore.

## Steps

### 1. Get the license key

- If `$ARGUMENTS` contains a key, use it.
- Otherwise ask: "Paste your AI Employee Builder license key — it's in your Lemon Squeezy receipt email (the one you got when you bought)."
- **If they say they don't have a key / haven't bought / came for the free map:** stop the setup — no key is needed for the free tier. Tell them: "You're already set — the **AI Employee Map** runs free on this connector, no key needed. Just say **'map my business'**. The full AI Employee Builder (create skills, agents, hooks, your build roadmap) comes with a plan: https://chiefleverageofficers.com/ai-employee-builders-invitation" and end there.
- **Never repeat the full key back in chat.** If you need to refer to it, use only the last 4 characters.
- Don't fuss about formatting — pasted quotes or spaces around the key are fine; the setup script cleans them off.

### 2. Validate, save, and verify (one script does all of it)

Run the setup script, passing the key through an environment variable (never on the command line, never echoed):

```bash
AIEB_SETUP_KEY="<PASTE_KEY_HERE>" node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-license.mjs"
```

If `${CLAUDE_PLUGIN_ROOT}` is unavailable, find the installed plugin folder and use the absolute path to `scripts/setup-license.mjs`.

**On Claude Desktop / Cowork, skip the script entirely — the direct path IS the primary path there.** Cowork's shell runs in a sandboxed VM with its own filesystem: the script would write the config inside the sandbox, not on the real machine where the connector reads it. Instead, do the same job with your file tools: sanitize the pasted key yourself (strip quotes/spaces), write the user's real home config — `C:\Users\<user>\.aieb-mcp\config.json` on Windows, `~/.aieb-mcp/config.json` on Mac — with `{ "license_key": "<key>" }`, then verify by calling the `get_skill` tool (skill_id `meta-create-skill`, path `SKILL.md`). A successful fetch is the same proof the script gives. Tool-name note: on Cowork the tool loads lazily and its full name looks like `mcp__plugin_ai-employee-builder_aieb__get_skill` — search for any `get_skill` tool rather than checking the visible list. If no `get_skill` tool exists anywhere after searching, the connector isn't installed: point the user at the AI Employee Builder extension (.mcpb) and its settings form instead.

The script prints one JSON line. It:

1. cleans the key (strips stray quotes and spaces),
2. validates it immediately against the server's `/activate` endpoint (`https://aieb-gated-mcp.vercel.app/activate`),
3. saves it to `~/.aieb-mcp/config.json` so the connector finds it in every folder,
4. verifies end to end by fetching a real skill (`get_skill` → `meta-create-skill` / `SKILL.md`) through the licensed server.

Re-running setup is safe — it reuses this machine's existing activation instead of consuming a new one.

### 3. Report the result conversationally

Read the JSON and speak like a human, not a terminal:

- **`"ok": true, "verified": true`** — the happy path. Continue to step 4.
- **`"kind": "rejected"`** — the server looked at the key and said no. Tell the user warmly what the server said (the `reason` field), then: "Double-check the key in your Lemon Squeezy receipt email — it's easy to grab the wrong line. If your subscription lapsed, you can renew here:" and give them the `renew_url` from the output. Offer to try again with a fresh paste.
- **`"kind": "network"`** — nothing wrong with the key; the machine couldn't reach the server. Say so plainly: "I couldn't reach the AI Employee Builder server — check your internet or VPN and we'll try again."
- **`"ok": true, "verified": false`** — the key was accepted and saved, but the final test fetch didn't get through (see `verify_note`). Tell them setup is done and the connector will work as soon as the connection settles; no need to redo anything.
- **`"kind": "no_key"` / anything else** — ask for the key again, gently.

### 4. Clean up the old per-folder config (migration)

Older versions of this plugin wrote an `aieb` server entry (with the key inside it) into the **workspace** `.mcp.json`. That's no longer needed and can shadow the new global key with a stale one.

- Read `.mcp.json` in the current workspace root (if it exists).
- If it has an `mcpServers.aieb` entry: remove **only** that entry, keep every other server untouched, and write the file back. If `aieb` was the only thing in the file, delete the file.
- Tell the user why in one line: "I removed the old per-folder AIEB entry from this workspace's `.mcp.json` — the connector is part of the plugin now, so it works in every folder and your key lives in one safe place."
- If there's no such entry, say nothing about migration.

### 5. Confirm

- If the `aieb` tools are already available in this session, you can additionally call `get_skill` with `skill_id: meta-create-skill`, `path: SKILL.md` as a live in-session check.
- Finish with: "**You're set up in every folder now.** Run `/reload-plugins` (or restart Claude Code) so the connector comes alive in this session, then just ask for what you need — 'business x-ray', 'create a skill', 'onboard me'."

## Important Rules

- Never bypass the license check.
- Never print or store the license key anywhere except `~/.aieb-mcp/config.json` (the script handles that) — and never echo it back in chat.
- Never claim the paid skills are installed locally. They load from the server at runtime.
- If the license is invalid, expired, cancelled, or for another product, relay the server's reason and the renewal link, then stop. Don't retry the same key.
