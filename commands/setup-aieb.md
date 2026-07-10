---
description: Securely connect AI Employee Builder through one activation link. The Lemon Squeezy key is entered on the AIEB page, never in chat, and setup takes effect without a restart.
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

Connect this machine with the shortest secure path. The paid instructions stay on the AIEB server; customer business data stays local.

## Step 1 — Start the secure connection

Find and call the AIEB connector tool ending in `connect_aieb`. Tool names vary by surface and may load lazily, so search rather than relying on the visible list.

It returns one clickable AIEB course-page URL and a short code. Give the user the link and say:

> Open this page, enter the Lemon Squeezy key there, and press **Connect**. Never paste the key in this chat. When the page says connected, come back and say **done**.

Then stop and wait. Do not ask for the key, edit config files, or invent a second setup path.

If the user only wants the free AI Employee Map, tell them no connection is required: they can simply say **map my business**.

## Step 2 — Finish when the user returns

When the user says `done`, `connected`, or equivalent, call the AIEB connector tool ending in `finish_aieb_connection`.

- **Approved:** the connector saves an AIEB-scoped device token and starts using it immediately. No restart or reload.
- **Still pending:** show the same activation link once and ask them to finish the page.
- **Expired:** call `connect_aieb` once for a fresh link.
- **Cancelled/expired subscription:** relay the server's plain-language renewal or resumption guidance. Never bypass it.

## Step 3 — Verify and continue

Call `get_skill` with `skill_id: meta-create-skill`, `path: SKILL.md`. If it succeeds, continue the user's original task immediately.

## Migration behavior

Existing users with a legacy saved Lemon Squeezy key continue working during migration. Once secure browser activation succeeds, the proxy deletes the saved key and keeps only the revocable AIEB device token.

## Non-negotiable rules

- Never request or accept a Lemon Squeezy key in chat.
- Never place a key in a command, environment variable, URL, workspace file, or model-visible tool argument.
- Never hand-write `~/.aieb-mcp/config.json`.
- Never claim paid skills are installed locally.
- Never bypass cancellation, expiration, product, store, tier, device, or rate-limit checks.
