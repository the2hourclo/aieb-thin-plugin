---
name: writing-humanize
description: "Writing employee · Make AI-generated text sound human. Scrub AI tells (em-dashes, staccato, filler-deficit, announcer scaffolding, And/So/Now/Because openers, billboard proclamations), enforce active voice, and check deliverable integrity. Works standalone on any text. USE WHEN user says 'humanize this', 'clean up AI-isms', 'make this sound human', 'voice cleanup', 'remove AI patterns', 'sound more natural', 'check for AI tells', 'fix the voice', or when any writing needs voice cleanup after drafting. Do NOT use to install the creator's personal voice - 'make it sound like me', 'install my voice' route to writing-voice (humanize scrubs AI tells; voice install is a separate pass)."
context: fork
agent: general-purpose
user-invocable: false
---

# writing-humanize — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="writing-humanize", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
