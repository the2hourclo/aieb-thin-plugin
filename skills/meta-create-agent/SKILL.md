---
name: meta-create-agent
description: Builder employee · Create subagents for Claude Code. USE WHEN user says 'create an agent', 'make an agent', 'add an agent', 'new agent for', 'build an agent', 'meta create agent', 'I need a specialist for', 'delegate this to', 'autonomous worker for'.
---

# meta-create-agent — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="meta-create-agent", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
