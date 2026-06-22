---
name: business-os
description: Design a business operating system using AI Employee Builder. Routes to the licensed AIEB MCP runtime.
---

# Business OS Stub

When this skill is invoked, call the `aieb` MCP tool `get_skill` with:

```json
{
  "skill_id": "business-os",
  "path": "SKILL.md",
  "task_context": "Summarize the user's current request."
}
```

Follow the returned instructions as the authoritative skill body. If the MCP response says the license is missing, inactive, expired, or not entitled, tell the user the AIEB runtime is not available and include the renewal/help link from the response.
