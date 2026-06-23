---
name: business-os
description: Install and maintain the operating system your business runs on — the file structure AI agents navigate. Scaffolds department folders (marketing, sales, product, finance, operations, strategy) with per-department CLAUDE.md indexes, builds a BUSINESS-MAP.md world model that maps the money pipeline to folders/skills/metrics, installs a dated content-naming convention, migrates existing messy files in safely, runs recurring tidy-up passes, and verifies routing with a stress test. USE WHEN user says "set up my business OS", "scaffold my workspace", "organize my files for AI", "create departments", "clean up my workspace", "tidy my files", "refactor my folders", "my AI can't find anything", "make my business readable", "world model", or when an AI repeatedly searches the whole workspace to answer basic business questions. Do NOT use to DIAGNOSE the business or draw process diagrams (bowtie funnels, swimlanes, opportunity maps) — that's the business-x-ray skill; business-os organizes the FILES the business runs on.
---

# business-os — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `business-os`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="business-os", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="business-os", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their AI Employee Builder license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
