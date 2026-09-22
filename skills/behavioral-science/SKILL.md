---
name: behavioral-science
description: Writing employee · Apply behavioral science principles from Chase Hughes' Behavior Ops Manual to any content. Diagnose missed persuasion triggers, enhance drafts with specific techniques, or look up principles by category. 290 principles across 10 categories. USE WHEN user says 'behavioral science', 'behavior ops', 'apply behavioral lens', 'check persuasion', 'enhance with psychology', 'what behavioral principle', 'why isn't this landing', or when any content needs a behavioral science audit.
user-invocable: false
---

# behavioral-science — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="behavioral-science", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
