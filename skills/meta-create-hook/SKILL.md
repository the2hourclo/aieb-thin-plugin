---
name: meta-create-hook
description: Create hooks for Claude Code automation. Covers ALL 14 hook events, ALL 6 hook locations (settings.json, frontmatter, plugins), ALL 3 hook types (prompt, command, agent), async hooks, input modification, and decision control. USE WHEN user says 'create a hook', 'add a hook', 'meta create hook', 'automate when', 'trigger when', 'run automatically', 'after writing', 'before commit', 'validate output', 'add automation to skill'.
---

# meta-create-hook — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `meta-create-hook`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="meta-create-hook", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="meta-create-hook", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their AI Employee Builder license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
