---
name: seed-framework
description: Writing employee · Universal teaching framework (Show → Extend → Expose → Direct) for explaining any concept in visuals, text, slides, video, or docs. Three modes — CREATE, DIAGNOSE, REWRITE. USE WHEN user says 'explain this concept', 'explain this so a beginner gets it', 'explain it simply', 'teach this', 'break this down', 'make this clear', 'SEED this', 'apply SEED', 'how do I explain X', 'this needs to be clearer', 'check if this makes sense', 'diagnose this content', 'find the gaps', 'would a reader understand this', 'SEED diagnose', 'SEED check', or when any concept needs to be taught to an audience who doesn't already understand it.
user-invocable: false
---

# seed-framework — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="seed-framework", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
