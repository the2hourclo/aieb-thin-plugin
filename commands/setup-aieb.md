---
description: Securely connect AI Employee Builder through one activation link. The Lemon Squeezy key is entered on the AIEB page, never in chat, and setup takes effect without a restart. Not to be confused with Anthropic's /setup-cowork, which configures the Cowork app itself — this command is the one that connects your AI Employee Builder purchase.
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

Connect this machine with the shortest secure path. The paid instructions stay on the AIEB server; customer business data stays local.

## Step 1 — Start the secure connection

Find and call the AIEB connector tool ending in `connect_aieb`. Tool names vary by surface and may load lazily, so search rather than relying on the visible list.

It returns one clickable AIEB course-page URL and a short code. Give the user the link and say:

> Open this page — if this is the browser you bought in, it connects by itself in a few seconds, nothing to enter. Otherwise enter the Lemon Squeezy key from your receipt on that page, never in this chat. A few seconds after the page says connected, the connection finishes by itself — just come back and keep going.

Then stop and wait. Do not ask for the key, edit config files, or invent a second setup path.

If the user only wants the free AI Employee Map, tell them no connection is required: they can simply say **map my business**.

## Step 2 — Confirm when the user returns

The connector completes the connection automatically in the background once the page approves. When the user returns and says anything (`done`, `connected`, or simply continues), call the AIEB connector tool ending in `finish_aieb_connection` to confirm — it reports success instantly when the auto-complete already ran.

- **Approved:** the connector saves an AIEB-scoped device token and starts using it immediately. No restart or reload.
- **Still pending:** show the same activation link once and ask them to finish the page.
- **Expired:** call `connect_aieb` once for a fresh link.
- **Cancelled/expired subscription:** relay the server's plain-language renewal or resumption guidance. Never bypass it.

## Step 3 — Verify and continue

Call `get_skill` with `skill_id: meta-create-skill`, `path: SKILL.md`. If it succeeds, continue the user's original task immediately.

## Step 4 — Continue straight into onboarding (the connection is the doorway, not the destination)

Right after the first successful verification on this machine, check the workspace for `.claude-state/onboarding-progress.json`:

- **No state file (fresh workspace):** do NOT stop at "connected." Say one transition line — "Connected. Next I'll set up your workspace and walk you through hiring your first AI Employee — takes about 10 minutes." — then fetch `get_skill` with `skill_id: onboard`, `path: SKILL.md` and follow it end to end (it scaffolds the workspace, installs the Business OS, and hires the first AI [Role] Employee). Its own flow asks every question that matters, so don't add a separate are-you-sure gate in front of it.
- **State file with `completed_at` set** (a reconnect, or a second machine on an already-onboarded workspace): never re-onboard. Confirm the connection and move on; if the managed CLAUDE.md block is missing or behind the server's template version, offer a refresh via `check-setup`.
- **State file in progress:** resume onboarding from its `current_step` instead of restarting.

Carve-out — do not hijack work in progress: if the user ran /setup-aieb mid-task (the connection dropped while they were building something), Step 3 already says to continue THEIR task; start onboarding at the next natural pause instead of on top of their work.

## Migration behavior

Existing users with a legacy saved Lemon Squeezy key continue working during migration. Once secure browser activation succeeds, the proxy deletes the saved key and keeps only the revocable AIEB device token.

## Non-negotiable rules

- Never request or accept a Lemon Squeezy key in chat.
- Never place a key in a command, environment variable, URL, workspace file, or model-visible tool argument.
- Never hand-write `~/.aieb-mcp/config.json`.
- Never claim paid skills are installed locally.
- Never bypass cancellation, expiration, product, store, tier, device, or rate-limit checks.
