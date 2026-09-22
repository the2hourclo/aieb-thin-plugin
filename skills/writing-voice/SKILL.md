---
name: writing-voice
description: "Writing employee · Install your teaching voice. PRIMARY TEST — every sentence must sound like someone speaking and pointing at things, not a billboard or press release. Then point at named things, run What → Why → Takeaway on every teaching moment, and replace every abstract noun with a specific named thing. The Spoken-and-Pointing test runs FIRST on every sentence — only after that does the Circle Test, Verb Test, and Teaching Triad apply. USE WHEN user says 'voice check', 'install voice', 'install teaching voice', 'make it sound like me', 'scan for vagueness', 'point at things', 'name the gap', 'pointing voice', 'less announcy', 'sounds like a billboard', 'too staccato', when writing prose from a writing-logic scaffold, or to install the teaching-on-a-board stance on existing prose. Also USE WHEN user says 'this reads vague', 'too vague - point at things'."
context: fork
agent: general-purpose
user-invocable: false
---

# writing-voice — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="writing-voice", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
