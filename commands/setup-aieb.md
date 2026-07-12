---
description: Securely connect AI Employee Builder through one activation link. The Lemon Squeezy key is entered on the AIEB page, never in chat, and setup takes effect without a restart.
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

Connect this machine with the shortest secure path. The paid instructions stay on the AIEB server; customer business data stays local.

## Step 1 — Start the secure connection

Find and call the AIEB connector tool ending in `connect_aieb`. Tool names vary by surface and may load lazily, so search rather than relying on the visible list.

It returns one clickable AIEB course-page URL and a short code. Give the user the link and say:

> Open this page, enter the Lemon Squeezy key there, and press **Connect**. Never paste the key in this chat. A few seconds after the page says connected, the connection finishes by itself — just come back and keep going.

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

## Step 4 — Offer the workspace map (once, right after first successful connection)

The first time verification succeeds on this machine, offer once, casually:

> Want me to set up this workspace so I always know where your assets live and which employee handles what? Takes a minute — I add one small managed section to this project's CLAUDE.md (the file stays yours; my edits stay inside the marked block), and it makes every future request route better.

If yes: fetch `get_skill` with `skill_id: onboard`, `path: workflows/scaffold-workspace.md` and apply ONLY the managed CLAUDE.md block from it (they can run full onboarding later by saying "onboard me"). If no: accept gracefully — `check-setup` can add it any time.

## Migration behavior

Existing users with a legacy saved Lemon Squeezy key continue working during migration. Once secure browser activation succeeds, the proxy deletes the saved key and keeps only the revocable AIEB device token.

## Non-negotiable rules

- Never request or accept a Lemon Squeezy key in chat.
- Never place a key in a command, environment variable, URL, workspace file, or model-visible tool argument.
- Never hand-write `~/.aieb-mcp/config.json`.
- Never claim paid skills are installed locally.
- Never bypass cancellation, expiration, product, store, tier, device, or rate-limit checks.
