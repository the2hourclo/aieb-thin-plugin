---
description: Quarterly check-in — re-score your 24 business assets against your last Business X-Ray and see how far you've come.
argument-hint: "(no arguments — finds your last scores and walks the update)"
---

# Re-score your business assets

1. Fetch the re-score workflow: call the `aieb` MCP `get_skill` tool (match ANY tool ending in `get_skill` — names vary by surface; on Cowork run a tool search for "get_skill" first) with `skill_id: business-x-ray`, `path: workflows/rescore-assets.md`. Follow exactly what it returns — it locates the previous scores, updates only what changed, and tracks progress over time.
2. If no previous assessment exists in this workspace, say so and offer the full assessment instead (same skill, `path: workflows/digital-assets-assessment.md`).
3. Any other path the workflow references → fetch it the same way with that exact path (`skill_id: business-x-ray`). The user's own files (previous scores, diagrams) are local — read those from disk normally.
4. If no `get_skill` tool exists after searching, the connector is missing — run the `check-setup` skill and stop.
5. A 🔒 or license message from `get_skill` is a normal answer, not an error: relay it warmly with the link it contains, then stop. Never reconstruct the workflow yourself.
