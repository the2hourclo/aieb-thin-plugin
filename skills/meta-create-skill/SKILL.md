---
name: meta-create-skill
description: Create durable Codex skills through the licensed AIEB MCP runtime.
---

# Create Skill Stub

When this skill is invoked, call the `aieb` MCP tool `get_skill` with:

```json
{
  "skill_id": "meta-create-skill",
  "path": "SKILL.md",
  "task_context": "Summarize the skill the user wants to create or update."
}
```

Follow the returned instructions as the authoritative skill body. Fetch any referenced workflows, references, templates, eval harnesses, or scripts through `get_skill` using the requested relative path.
