---
name: copywriter
description: Writing employee · Complete copywriting system for marketing campaigns, offers, sales pages, emails, welcome sequences, bullet points, persuasive analogies, offer diagnostics, and positioning documents. Five-step campaign workflow (Blueprint → Promotion Package → Offer Document → Emails → Notion deploy) PLUS seven standalone copywriting workflows folded in (Welcome Email creator, Product Bullet Points generator, Agreement Analogy persuasion framework, Offer Clarity diagnostic, Game Worth Playing positioning document, a VSL orchestrator that turns an offer into a sales video, and a Workshop/Paid-Webinar Landing Page assembler built on the Dan Henry $27-workshop gold standard). USE WHEN user says 'campaign', 'offer document', 'sales page', 'landing page copy', 'email sequence', 'deploy campaign', 'promotion package', 'video CTA', 'welcome email', 'onboarding email', 'new subscriber email', 'bullet points', 'product benefits', 'sales bullets', 'lead magnet benefits', 'agreement analogy', 'persuade without selling', 'handle objection', 'create analogy', 'make them sell themselves', 'copywriting', 'roast my offer', 'clarify my offer', 'fix my offer', 'why isn't my offer working', 'offer roast', 'business roast', 'reposition this', 'simplify my messaging', 'game worth playing', 'annual big message', 'positioning doc', 'north star document', 'the plan to', 'discovery story', 'my methodology', 'leadership content', 'plan VSL', 'write VSL', 'video sales letter', 'sales video', 'product demo video', 'turn my offer into a video', 'workshop landing page', 'webinar landing page', 'paid workshop page', 'masterclass page', 'workshop funnel page', 'low-ticket event page'.
---

# copywriter — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the `get_skill` tool on the `aieb` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the `aieb` MCP `get_skill` tool with:

- `skill_id`: `copywriter`
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

- *"read `references/foo.md`"* → `get_skill(skill_id="copywriter", path="references/foo.md")`
- *"load `workflows/bar.md`"* → `get_skill(skill_id="copywriter", path="workflows/bar.md")`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with `get_skill` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If `get_skill` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing device connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If `get_skill` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
