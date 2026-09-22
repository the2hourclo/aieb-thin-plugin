---
name: meta-create-hook
description: Builder employee · Create hooks for Claude Code automation. Covers ALL 14 hook events, ALL 6 hook locations (settings.json, frontmatter, plugins), ALL 3 hook types (prompt, command, agent), async hooks, input modification, and decision control. USE WHEN user says 'create a hook', 'add a hook', 'meta create hook', 'automate when', 'trigger when', 'run automatically', 'after writing', 'before commit', 'validate output', 'add automation to skill'.
---

# meta-create-hook — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="meta-create-hook", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
