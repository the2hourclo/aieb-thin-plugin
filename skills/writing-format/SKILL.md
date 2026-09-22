---
name: writing-format
description: "Writing employee · Format an already-written draft for a publishing platform. ALWAYS USE when the user says 'format this for Substack', 'format for Substack', 'format this newsletter', 'apply formatting', 'make this publishable', 'format carousel', 'carousel formatting', 'Substack formatting', or asks only for platform-specific headers, bold, italics, blockquotes, spacing, or visual rhythm. This skill formats existing prose; it does not create the draft."
context: fork
agent: general-purpose
---

# writing-format — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="writing-format", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
