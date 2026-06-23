---
name: meta-create-skill
description: "Create, validate, test, upgrade, and improve Claude skills — and chain them into Skill Systems (AI Employees). Use this when someone says 'create a skill', 'build a skill for X', 'add a skill', 'turn this into a skill', 'build a skill system', 'build an AI employee', 'automate this whole operation', 'turn this process into a system', 'validate skill', 'test skill', 'improve this skill', 'update this skill', 'update skill X', 'add this to the skill', 'add a rule/principle to a skill', 'include this in our skills', 'the skill should also', 'remember this in the skill', 'change how this skill works', 'fix the routing', 'upgrade my skills', 'audit my skill library', or ANY time they want to change an existing skill or extend Claude's capabilities. ALWAYS load this skill before editing any `.claude/skills/**` file — a direct hand-edit skips the evidence-driven discipline (origin + carve-out + mechanical→gate + version bump) this skill enforces. This is the primary skill-authoring toolkit in ai-employee-builder — use it liberally; skill-creation, skill-updates, system-building, and skill-cleanup requests are exactly what it's for."
---

# meta-create-skill — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `meta-create-skill`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="meta-create-skill", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="meta-create-skill", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their AI Employee Builder license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
