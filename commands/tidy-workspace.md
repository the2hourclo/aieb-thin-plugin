---
description: Clean up your workspace, repair canonical department/client/system records, and regenerate Claude plus Codex adapters. Shows the full plan first; nothing moves without approval.
---

# Tidy your workspace

1. Fetch the tidy workflow: call the `aieb` MCP `get_skill` tool (match ANY tool ending in `get_skill` — names vary by surface; on Cowork run a tool search for "get_skill" first) with `skill_id: business-os`, `path: workflows/tidy-v2.md`. Follow exactly what it returns.
2. Any other path the workflow references (`workflows/`, `references/`) → fetch it the same way with that exact path. The user's own workspace files are local — read those from disk normally. Never propose editing this plugin's stubs or reconstructing served content locally.
3. If no `get_skill` tool exists after searching, the connector is missing — run the `check-setup` skill and stop.
4. A 🔒 or license message from `get_skill` is a normal answer, not an error: relay it warmly with the link it contains, then stop. Never reconstruct the workflow yourself.
5. Run the workflow as written: scan for violations → present the gated tidy plan → execute ONLY what the user approves → repair canonical maps, department/client/system records, and relationships → regenerate both CLAUDE.md and AGENTS.md adapters → report what moved.
