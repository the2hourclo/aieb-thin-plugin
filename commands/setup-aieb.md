---
description: Connect or verify AI Employee Builder through the remote OAuth connector. Existing verified members are recognized from their AIEB account; the Lemon Squeezy key remains a secure-page fallback and never belongs in chat.
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

Load and follow the local `setup-aieb` skill. Do not recreate the retired local device-code flow.

The shortest buyer path is:

1. Confirm AI Employee Builder plugin v0.31.4 or later is installed. In Cowork/Desktop, update the marketplace through **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then open **Customize → Plugins → AI Employee Builder → Update** if that button appears. Start a fresh session, type `/ai-employee-builder:setup-aieb`, choose the namespaced plugin skill, then press Enter or start the task. The selected chip may shorten to `/setup-aieb`; that is expected. The user can also say **set up AIEB** instead.
2. Find the AIEB remote connector and click **Connect** when the host requests authorization. In Cowork/Desktop, an expired authorization is repaired under **Customize → Connectors → aieb**. Reconnect there; disconnect first only if the host falsely leaves the expired connector marked **Connected**.
3. On the first-party page, use the purchase already in this browser, an existing course account, or verified Google email. Use the Lemon Squeezy key only when none of those identifies the purchase.
4. Return here and prove paid access with `get_skill(skill_id: "meta-create-skill", path: "SKILL.md")`.
5. If the server says the connector is secure but member setup is incomplete, ask the four business-context questions, call `complete_aieb_onboarding`, and retry the paid fetch once. Do not reconnect or send the buyer back to checkout.
6. After that paid fetch proves entitlement, verify on Cowork that the current chat is inside a Project with the intended persistent readable/writable folder attached **before** reading state or fetching onboarding. If no folder is attached, report the connector and entitlement as healthy, give **New chat → Project → Add folder**, and stop. If the attached root is non-empty, name it and wait for confirmation before any onboarding action.
7. Resume or begin workspace onboarding from `.claude-state/progress-state.yaml` in that verified root.

Never request a key in chat, place one in a command, or ask the buyer to edit a connector configuration file.
