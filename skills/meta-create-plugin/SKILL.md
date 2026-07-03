---
name: meta-create-plugin
description: Builder employee · Package skills into a Claude Code plugin for distribution. Creates plugin folder structure, plugin.json manifest, and prepares for publishing. USE WHEN user says 'create a plugin', 'package these skills', 'bundle skills into a plugin', 'make a plugin from', 'publish plugin', 'plugin from skills'.
---

# meta-create-plugin — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `meta-create-plugin`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

**Before concluding the connector is missing, search properly.** The tool's full name varies by surface (Claude Code: `mcp__aieb__get_skill`; Cowork/Desktop: `mcp__plugin_ai-employee-builder_aieb__get_skill`) — match ANY tool ending in `get_skill`, never an exact name. On Cowork, MCP tools load lazily: they may not appear in the visible tool list until searched for — run a tool search for "get_skill" before deciding it's absent.

**If a `get_skill` tool truly does NOT exist on any server after searching**, the connector is missing on this machine. Stop and tell the user the fix for THEIR surface, then wait:

> **Claude Code:** The AI Employee Builder connector isn't set up yet — run /setup-aieb (your license key is in your Lemon Squeezy receipt email), then /reload-plugins.
>
> **Claude Desktop / Cowork:** Make sure the AI Employee Builder plugin is installed (Customize → Personal plugins — if it's missing, add the marketplace `the2hourclo/aieb-thin-plugin` and install it), then run /setup-aieb here in chat — it saves your license key so the connector works everywhere. Your key is in your Lemon Squeezy receipt email. Still nothing after that? Your machine may need the fallback extension (.mcpb) from the get-access page — say "check my setup" and I'll walk you through it.

Do not guess at or reconstruct the skill's content in the meantime.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="meta-create-plugin", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="meta-create-plugin", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The same license key unlocks it instantly after they upgrade — nothing to reinstall. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
