---
description: Connect AI Employee Builder with the buyer's Lemon Squeezy license key. One tool call validates the key, saves it machine-globally, and activates it instantly — no restart, works on Claude Code, Desktop, and Cowork.
argument-hint: "[license key optional]"
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

You are connecting this machine to the AI Employee Builder server. The paid skill instructions live on that server and load at runtime after the license is checked — nothing of value is stored locally.

Since v0.12.0 the connector itself handles setup: it exposes an **`activate_license` tool** that validates the key with the server, saves it user-globally (`~/.aieb-mcp/config.json`), and starts using it immediately. The connector process runs on the buyer's real machine, so this works identically on Claude Code, Claude Desktop, and Cowork — including sandboxed surfaces where your file tools can't reach the home directory. **No file editing. No restart.**

## Steps

### 1. Get the license key

- If `$ARGUMENTS` contains a key, use it.
- Otherwise ask: "Paste your AI Employee Builder license key — it's in your Lemon Squeezy receipt email (the one you got when you bought)."
- **If they say they don't have a key / haven't bought / came for the free map:** stop the setup — no key is needed for the free tier. Tell them: "You're already set — the **AI Employee Map** runs free on this connector, no key needed. Just say **'map my business'**. The full AI Employee Builder (create skills, agents, hooks, your build roadmap) comes with a plan: https://chiefleverageofficers.com/ai-employee-builders-invitation" and end there.
- **Never repeat the full key back in chat.** If you need to refer to it, use only the last 4 characters.
- Don't fuss about formatting — pasted quotes or spaces around the key are fine; the tool cleans them off.

### 2. Activate — one tool call

Call the **`activate_license`** tool on the AIEB connector with the pasted key. Tool-name note: the full name varies by surface (`mcp__aieb__activate_license`, `mcp__plugin_ai-employee-builder_aieb__activate_license`, …) and it may load lazily — search for any `activate_license` tool rather than checking the visible list.

Read the tool result and speak like a human, not a terminal:

- **Success** — the key is validated, saved for every folder on this machine, and live right now. Continue to step 3.
- **"license wasn't accepted"** — the server looked at the key and said no. Relay the reason warmly, then: "Double-check the key in your Lemon Squeezy receipt email — it's easy to grab the wrong line. If your subscription lapsed, you can renew here:" and give the renewal link from the message. Offer to try again with a fresh paste. Don't retry the same key.
- **"Can't reach the server"** — nothing wrong with the key; the machine couldn't reach the server. Say so plainly: "I couldn't reach the AI Employee Builder server — check your internet or VPN and we'll try again."

**Fallback — only if no `activate_license` tool exists anywhere after searching** (the connector is missing or predates v0.12.0):

- On **Claude Code**: run the setup script, passing the key through an environment variable (never on the command line, never echoed):

  ```bash
  AIEB_SETUP_KEY="<PASTE_KEY_HERE>" node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-license.mjs"
  ```

  It prints one JSON line: cleans + validates the key against `/activate`, saves `~/.aieb-mcp/config.json`, and verifies with a real skill fetch. Report `ok`/`kind` conversationally (`rejected` → relay `reason` + `renew_url`; `network` → connection problem, key is fine).
- On **Claude Desktop / Cowork**: the connector isn't installed — send the user back through the AI Employee Builder install instructions from their purchase (the get-access page in their receipt). Once the plugin is installed, they just paste the key in chat and you call `activate_license`.

### 3. Verify with a real fetch

Call `get_skill` with `skill_id: meta-create-skill`, `path: SKILL.md`. A successful fetch is end-to-end proof (license → activation → licensed content). If it fails with a license message right after a successful activation, relay the message and stop — don't loop.

### 4. Clean up the old per-folder config (migration, Claude Code only)

Older versions of this plugin wrote an `aieb` server entry (with the key inside it) into the **workspace** `.mcp.json`. That's no longer needed and can shadow the new global key with a stale one.

- Read `.mcp.json` in the current workspace root (if it exists).
- If it has an `mcpServers.aieb` entry: remove **only** that entry, keep every other server untouched, and write the file back. If `aieb` was the only thing in the file, delete the file.
- Tell the user why in one line: "I removed the old per-folder AIEB entry from this workspace's `.mcp.json` — the connector is part of the plugin now, so it works in every folder and your key lives in one safe place."
- If there's no such entry, say nothing about migration.

### 5. Confirm

Finish with: "**You're set up on this whole machine now** — every folder, every session. Just ask for what you need — 'business x-ray', 'create a skill', 'onboard me'."

## Important Rules

- Never bypass the license check.
- Never print or store the license key anywhere except through the `activate_license` tool (or the fallback script) — and never echo it back in chat.
- Never claim the paid skills are installed locally. They load from the server at runtime.
- If the license is invalid, expired, cancelled, or for another product, relay the server's reason and the renewal link, then stop. Don't retry the same key.
- Never hand-write `~/.aieb-mcp/config.json` or drive GUI apps (Notepad, screen control) to edit it — the `activate_license` tool is the only sanctioned writer, and unlike a file edit it validates the key first and takes effect without a restart.
