---
description: Connect or verify AI Employee Builder through the remote OAuth connector. Existing verified members are recognized from their account; the Lemon Squeezy key remains a secure-page fallback and never belongs in chat.
allowed-tools: [Read, Write, Edit, Bash(mkdir *), Bash(git status *), Bash(git diff *), Bash(git init *), Bash(git branch *), Bash(git add *), Bash(git commit *)]
---

# Set Up AI Employee Builder

Load and follow the local `setup-aieb` skill. Do not recreate the retired local device-code flow.

From your very first line, talk to the member in plain words: say "your AI Employee Builder connection" and "your membership"; never "connector", "AIEB", "MCP" or "entitlement". (Origin: 2026-10-05 setup test — the first line, written before the skill loaded, said "checking that your connector gives paid access".)

This command pre-approves only reading and saving files plus the exact `mkdir` and git commands setup uses, and only for this turn. Every other command asks the member first. Don't run `gh` or reach anything outside the workspace during setup. (Origin: 2026-10-05 new-member test — a bare `Bash` grant let `gh auth status` run silently before the member was asked about a backup.)

The shortest buyer path is:

1. Confirm AI Employee Builder plugin v0.31.4 or later is installed. In the Claude desktop app, update the marketplace through **Browse plugins → Personal → aieb-thin-plugin → ⋯ → Check for updates**, then open **Customize → Plugins → AI Employee Builder → Update** if that button appears. Start a fresh session, type `/ai-employee-builder:setup-aieb`, choose the namespaced plugin skill, then press Enter or start the task. The selected chip may shorten to `/setup-aieb`; that is expected. The user can also say **set up AI Employee Builder** instead.
2. When the host asks to authorize the AI Employee Builder connection, the member clicks **Connect**. In the Claude app, an expired authorization is repaired under **Customize → Connectors → aieb**. Reconnect there; disconnect first only if the host falsely leaves the expired connector marked **Connected**.
3. On the first-party page, use the purchase already in this browser, an existing course account, or verified Google email. Use the Lemon Squeezy key only when none of those identifies the purchase.
4. Return here and prove paid access with `get_skill(skill_id: "meta-create-skill", path: "SKILL.md")`.
5. If the server says the connector is secure but member setup is incomplete and the connector lists a `complete_aieb_onboarding` tool, ask the four business-context questions, call it, and retry the paid fetch once. If the tool is not listed, do not call or invent it; retry the paid fetch once and relay the server's message. Do not reconnect or send the buyer back to checkout.
6. After that paid fetch proves entitlement, verify on Claude in a Project or folder that the current chat is inside a Project with the intended persistent readable/writable folder attached **before** reading state or fetching onboarding. If no folder is attached, tell the member their connection and membership are fine, give **New chat → Project → Add folder**, and stop. If the attached root is non-empty, name it and wait for confirmation before any onboarding action.
7. Resume or begin workspace onboarding from `.claude-state/progress-state.yaml` in that verified root.

Never request a key in chat, place one in a command, or ask the buyer to edit a connector configuration file.
