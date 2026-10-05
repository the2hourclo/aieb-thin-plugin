---
name: meta-create-skill
description: "Builder employee · Creates, validates, tests, updates, and hardens agent skills for Claude or Codex; chains them into Skill Systems (AI Employees); chooses the artifact an outcome needs; and applies domain-invariant contracts to stateful or side-effecting employees. Use when someone describes an OUTCOME ('review emails weekly', 'I do this manually'); asks to build ('create a skill', 'build an AI employee', 'automate this operation', 'make it decide like me'); asks to change an existing skill ('update skill X', 'add a rule'—always load this first); asks to protect business state ('add ontology', 'enforce invariants', 'stop duplicate actions'); reports symptoms ('it ignores its rule', 'said it did it but did not', 'make it production-grade'); or wants to schedule, validate, test, or audit skills. A skill that MISFIRED and needs a patch routes to retrospective. Do NOT use for workspace structure, BUSINESS-MAP.md, AGENTS.md, or shared Claude/Codex adapters; use business-os."
---

# meta-create-skill — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="meta-create-skill", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
