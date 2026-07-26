---
name: write
description: "Writing employee · Newsletter, long-form article, and general email writing. Plan argument structure, draft phase-by-phase, humanize the prose, install your teaching voice, then format for Substack. USE WHEN user says 'write newsletter', 'newsletter about', 'plan newsletter', 'write article', 'long-form post', 'write email', 'write an email', 'draft an email', 'email about', 'daily email', 'broadcast email'. For general one-off / broadcast / daily emails only — welcome, onboarding, sequence, and campaign emails route to the copywriter skill instead. Do NOT use when the user wants ONLY the argument structure planned before any prose is written (route to writing-logic), ONLY platform formatting of already-written text like 'format this for Substack' (route to writing-format), or to set up or calibrate their voice sample files (route to setup-content-employees)."
hooks:
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: prompt
          prompt: |
            Read the content just written out loud in your head, sentence by sentence.

            (This check fires only on Write — the new file you just created — not on Edit, so the fixes you make below can't re-trigger it.)

            If the file is code, YAML, JSON, or a list of file paths — skip this check entirely.

            For each sentence of prose, ask: would a real person say this in conversation?

            Flag any sentence that:
            - Stumbles or is awkward to read aloud
            - Sounds like a document or report, not a person talking
            - Uses language no one would actually say in a real conversation
            - Has staccato rhythm (too many short punchy sentences in a row)
            - Is vague when it could name the specific thing ("a tool that wasn't built for them" vs "a tool for coders and highly technical people")

            Also check transitions between ideas. Humans connect thoughts with natural words like "However", "But", "If you think about it", "This is why", "And that's". If a transition is stiff or missing entirely, add a natural one.

            If you find any issues: use Edit to rewrite only those specific sentences in place. Do not explain what you changed — just fix it.

            After every fix, check the domino effect: does the sentence that comes after still connect naturally? If the rewrite changed what the next sentence is responding to, update the next sentence too. Keep tracing forward until the flow is seamless again.
---

# write — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `write`
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

- *"read `references/foo.md`"* → `get_skill(skill_id="write", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="write", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing device connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
