---
name: retrospective
description: "Builder employee · Capture learnings from skill usage and propose SKILL.md improvements - the door for patching an OBSERVED misfire. USE WHEN user says 'retrospective', 'this skill messed up', 'fix this skill', 'heal this skill', 'the skill got it wrong', 'that run was wrong', 'capture what went wrong', 'skill-level post-mortem', or when a skill just produced wrong output and the user wants its instructions patched. Do NOT use for a deliberate change with no observed failure - 'update skill X', 'add a rule to X', 'improve this skill' route to meta-create-skill. Making a skill reliable going forward (gates, enforcement, hardening) is also meta-create-skill's job, not a retrospective."
---

# retrospective — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="retrospective", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
