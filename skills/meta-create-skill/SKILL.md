---
name: meta-create-skill
description: "Builder employee · Create, validate, test, upgrade, and improve Claude skills — and chain them into Skill Systems (AI Employees). Use this when someone says 'create a skill', 'build a skill for X', 'add a skill', 'turn this into a skill', 'build a skill system', 'build an AI employee', 'automate this whole operation', 'turn this process into a system', 'validate skill', 'test skill', 'improve this skill', 'update this skill', 'update skill X', 'add this to the skill', 'add a rule/principle to a skill', 'include this in our skills', 'the skill should also', 'remember this in the skill', 'change how this skill works', 'fix the routing', 'upgrade my skills', 'audit my skill library', 'harden this', 'make this reliable', 'make this production-grade', 'enforce these rules', 'it keeps ignoring its own rule', 'schedule this skill', 'run it automatically every morning', 'make it recurring', 'automate this so I don't have to ask', or ANY time they want to change an existing skill or extend Claude's capabilities. ALWAYS load this skill before editing any `.claude/skills/**` file — a direct hand-edit skips the evidence-driven discipline (origin + carve-out + mechanical→gate + version bump) this skill enforces. This is the primary skill-authoring toolkit in ai-employee-builder — use it liberally; skill-creation, skill-updates, system-building, and skill-cleanup requests are exactly what it's for. A skill that MISFIRED and needs a patch from that observed failure routes to retrospective instead."
---

# meta-create-skill — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `meta-create-skill`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

**Before concluding the connector is missing, search properly.** The tool's full name varies by surface (Claude Code: `mcp__aieb__get_skill`; Cowork/Desktop: `mcp__plugin_ai-employee-builder_aieb__get_skill`) — match ANY tool ending in `get_skill`, never an exact name. On Cowork, MCP tools load lazily: they may not appear in the visible tool list until searched for — run a tool search for "get_skill" before deciding it's absent.

**If a `get_skill` tool truly does NOT exist on any server after searching**, the connector is missing on this machine. Stop and tell the user the fix for THEIR surface, then wait:

> **Claude Code:** The AI Employee Builder connector isn't set up yet — run /setup-aieb, open the secure link it gives you, then /reload-plugins. Never paste a license key into chat.
>
> **Claude Desktop / Cowork:** Make sure the AI Employee Builder plugin is installed (Customize → Personal plugins — if it's missing, add the marketplace `the2hourclo/aieb-thin-plugin` and install it), then run /setup-aieb here in chat. It gives you a secure page where you enter the key; the plugin saves only an opaque device token. Never paste the key into chat. Still nothing after that? Say "check my setup" and I'll walk you through it.

Do not guess at or reconstruct the skill's content in the meantime.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="meta-create-skill", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="meta-create-skill", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing device connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
