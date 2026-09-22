---
name: meta-create-mcp
description: Builder employee · Add, configure, build, secure, migrate, or distribute MCP servers across Claude Code, Cowork, desktop, web, and other MCP hosts. USE WHEN user says 'add an MCP', 'connect to', 'add integration', 'setup MCP', 'connect MCP server', 'configure MCP', 'build an MCP', 'create MCP server', 'remote connector', or 'MCP OAuth'.
---

# meta-create-mcp — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="meta-create-mcp", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
