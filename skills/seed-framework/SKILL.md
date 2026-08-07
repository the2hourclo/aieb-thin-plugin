---
name: seed-framework
description: Writing employee · Universal teaching framework (Show → Extend → Expose → Direct) for explaining any concept in visuals, text, slides, video, or docs. Three modes — CREATE, DIAGNOSE, REWRITE. USE WHEN user says 'explain this concept', 'explain this so a beginner gets it', 'explain it simply', 'teach this', 'break this down', 'make this clear', 'SEED this', 'apply SEED', 'how do I explain X', 'this needs to be clearer', 'check if this makes sense', 'diagnose this content', 'find the gaps', 'would a reader understand this', 'SEED diagnose', 'SEED check', or when any concept needs to be taught to an audience who doesn't already understand it.
user-invocable: false
---

# seed-framework — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `seed-framework`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

**Before concluding the connector is missing, search properly.** The tool's full name varies by surface (Claude Code: `mcp__aieb__get_skill`; Cowork/Desktop: `mcp__plugin_ai-employee-builder_aieb__get_skill`; Codex may expose another prefix) — match ANY tool ending in `get_skill`, never an exact name. On hosts with lazy MCP loading, run a tool search for "get_skill" before deciding it's absent.

**If a `get_skill` tool truly does NOT exist on any server after searching**, the connector is missing on this machine. Stop and tell the user the fix for THEIR surface, then wait:

> **Claude Code:** The AI Employee Builder connector isn't set up yet — run /setup-aieb, open the secure link it gives you, then /reload-plugins. Never paste a license key into chat.
>
> **Claude Desktop / Cowork:** Make sure the AI Employee Builder plugin is installed (Customize → Personal plugins — if it's missing, add the marketplace `the2hourclo/aieb-thin-plugin` and install it), then run /setup-aieb here in chat. It gives you a secure page where you enter the key; the plugin saves only an opaque device token. Never paste the key into chat. Still nothing after that? Say "check my setup" and I'll walk you through it.
>
> **Codex:** Install or update `ai-employee-builder@aieb-thin-plugin`, start a fresh Codex thread, then say "set up AIEB". The setup skill opens the same secure activation page and stores only an opaque device token. Never paste a license key into chat.

Do not guess at or reconstruct the skill's content in the meantime.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="seed-framework", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="seed-framework", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing device connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
