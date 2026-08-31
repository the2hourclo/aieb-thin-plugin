---
name: behavioral-science
description: Writing employee · Apply behavioral science principles from Chase Hughes' Behavior Ops Manual to any content. Diagnose missed persuasion triggers, enhance drafts with specific techniques, or look up principles by category. 290 principles across 10 categories. USE WHEN user says 'behavioral science', 'behavior ops', 'apply behavioral lens', 'check persuasion', 'enhance with psychology', 'what behavioral principle', 'why isn't this landing', or when any content needs a behavioral science audit.
user-invocable: false
---

# behavioral-science — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `behavioral-science`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

**Before concluding the connector is missing, search properly.** The tool's full name varies by surface (Claude Code: `mcp__aieb__get_skill`; Cowork/Desktop: `mcp__plugin_ai-employee-builder_aieb__get_skill`; Codex may expose another prefix) — match ANY tool ending in `get_skill`, never an exact name. On hosts with lazy MCP loading, run a tool search for "get_skill" before deciding it's absent.

**If a `get_skill` tool truly does NOT exist on any server after searching**, the connector is missing on this machine. Stop and tell the user the fix for THEIR surface, then wait:

> **Claude Code:** Update AI Employee Builder to v0.30.0+, run /reload-plugins, inspect /mcp, and connect AIEB through the secure browser OAuth page. Never paste a license key into chat.
>
> **Claude Desktop / Cowork:** Update the AI Employee Builder Personal plugin to v0.30.0+, open its AIEB connector control, and click Connect. Existing verified members are recognized from their AIEB account; a Lemon Squeezy key is only a secure-page fallback. No local Node runtime is required. Still nothing? Say "check my setup".
>
> **Codex:** Install or update `ai-employee-builder@aieb-thin-plugin` to v0.30.0+, start a fresh Codex task, then say "set up AIEB". Connect through the remote OAuth page; never paste a license key into chat.

Do not guess at or reconstruct the skill's content in the meantime.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="behavioral-science", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="behavioral-science", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing account connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
