---
description: Audit your skill library — find overlap, orphan workflows, trigger collisions, and missing delegation across your .claude/skills.
---

# Audit your skill library

1. Fetch the audit workflow: call the `aieb` MCP `get_skill` tool (match ANY tool ending in `get_skill` — names vary by surface; on Cowork run a tool search for "get_skill" first) with `skill_id: meta-create-skill`, `path: workflows/audit-library.md`. Follow exactly what it returns, run against the user's OWN skills in this project's `.claude/skills/` (plus `~/.claude/skills/` if present).
2. Any other path the workflow references (references/, templates/) → fetch it the same way with that exact path. The user's own skills are local files — read those from disk normally. Never propose editing this plugin's stubs or reconstructing served content locally.
3. If no `get_skill` tool exists after searching, the connector is missing — run the `check-setup` skill and stop.
4. A 🔒 or license message from `get_skill` is a normal answer, not an error: relay it warmly with the link it contains, then stop. Never reconstruct the workflow yourself.
5. Deliver the library-wide diagnostic the workflow specifies. Propose remediations; apply only what the user approves, one change at a time.
