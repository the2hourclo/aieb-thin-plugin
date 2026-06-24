---
name: roadmap
description: "The build-roadmap AND triage front door for ai-employee-builder. TWO entry modes. (1) Ladder mode — picks up AFTER onboarding and walks you up from your first skill to a reliable, connected, automated set of AI Employees, tracking where you are and showing the single next move. (2) Triage mode — you describe a problem in plain words and it figures out the right thing to build (skill / system / harness / MCP / hook / command), tells you why, and routes you to the builder. It hands each step to the builder that already exists. USE WHEN user says 'what's next', 'what should I build next', 'what now', 'where am I', 'roadmap', 'continue building', 'next step', 'what should I build now', OR describes a pain and wants direction: 'I want to automate X', 'what should I build to fix [problem]', 'I keep doing X by hand', 'I waste so much time on Y', 'can AI handle Z for me', 'help me figure out what to build', 'where do I even start with this'. Do NOT use for first-run workspace setup (that's onboard) or when the user already knows the exact thing to build (go straight to that meta-create-* skill)."
---

# roadmap — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `roadmap`
- `path`: `SKILL.md`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read `references/foo.md`"*, *"load `workflows/bar.md`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with `get_skill` using that exact path instead:

- *"read `references/foo.md`"* → `get_skill(skill_id="roadmap", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="roadmap", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their AI Employee Builder license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
