---
name: onboard
description: Setup employee · First-run setup for the ai-employee-builder plugin. Scaffolds the authoring folders (.claude/skills|agents|commands|hooks), writes a workspace CLAUDE.md with skill routing, and maps the business into department folders + BUSINESS-MAP.md using the full Business OS when available or a lean built-in fallback when locked. Then it hands off to the tracked journey, whose first checkpoint is the Business X-Ray. USE WHEN user says "onboard me", "set me up", "get me started", "start my workspace", "bootstrap my workspace", "first time setup", "build my workspace", OR when you detect a fresh workspace (no .claude-state/onboarding-progress.json) and the user has just installed the ai-employee-builder plugin.
---

# onboard — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="onboard", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
