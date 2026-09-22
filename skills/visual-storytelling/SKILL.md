---
name: visual-storytelling
description: "YouTube employee · Plan visual explanations before rendering. Chooses each frame's shape from the relationship in the content, orders frames so each earns the next, maps proof and continuity, and produces a single Visual Brief or a sequence-level Visual Coverage Map. USE WHEN the user asks to plan visual coverage, says 'plan the visuals', 'how should I show this', 'lay out this slide', 'sequence this deck', 'the deck flows wrong', 'map visual coverage', or 'add proof'. If the user asks to turn an approved YouTube package into a narrated whiteboard deck, choose `youtube-strategy`; this Skill plans coverage but does not build that complete YouTube deliverable. Do NOT use to generate images or render finished artifacts; delegate those to the chosen renderer."
user-invocable: false
---

# visual-storytelling — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="visual-storytelling", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
