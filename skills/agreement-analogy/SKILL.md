---
name: agreement-analogy
description: "Writing employee · Explain an objection, belief, or unfamiliar idea through a fair parallel that helps the reader reach their own conclusion without trapping them. USE WHEN user says 'write an agreement analogy', 'write one fair analogy', 'fair analogy', 'price objection', 'find an analogy for this objection', 'explain this belief with an analogy', 'analogy for my FAQ', 'bridge this objection', or 'use a parallel example'. Runs in fresh context to test fairness. Do NOT use for full campaign or offer copy -> copywriter; offer diagnosis -> offer-clarity; general teaching metaphors unrelated to selling -> the relevant writing skill."
context: fork
agent: general-purpose
effort: high
user-invocable: false
---

# agreement-analogy — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="agreement-analogy", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
