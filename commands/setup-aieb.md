---
description: Securely connect AI Employee Builder through one activation link. The Lemon Squeezy key is entered on the AIEB page, never in chat, and setup takes effect without a restart. Not to be confused with Anthropic's /setup-cowork, which configures the Cowork app itself — this command is the one that connects your AI Employee Builder purchase.
allowed-tools: [Read, Write, Edit, Bash]
---

# Set Up AI Employee Builder

Connect this machine with the shortest secure path. The paid instructions stay on the AIEB server; customer business data stays local.

**What this actually asks of the user:** a browser, and about a minute. In most cases nothing to type at all — if they open the link in the browser they bought in, the page recognises the purchase and connects itself. The license key is the fallback, not the default. Say it that way; "have your license key ready" makes an easy step sound like work.

## Step 0 — Before the link: the plugin has to be current

The secure setup tools (`connect_aieb`, `finish_aieb_connection`) landed in plugin **v0.17.0**. On anything older this command has nothing to call, and telling the user to "run connect_aieb" sends them looking for a tool that isn't there.

So if a `connect_aieb` tool cannot be found after a real tool search, do not improvise a workaround — the plugin is out of date. Give these three steps in order and stop:

```
/plugin install ai-employee-builder@aieb-thin-plugin
/reload-plugins
/setup-aieb
```

That sequence updates the shell and reopens this flow. Their paid skills are unaffected — skill content is served fresh from the server and never needed an update.

## Step 1 — Start the secure connection

Find and call the AIEB connector tool ending in `connect_aieb`. Tool names vary by surface and may load lazily, so search rather than relying on the visible list.

It returns one clickable AIEB course-page URL and a short code. Give the user the link and say:

> Open this page — if this is the browser you bought in, it connects by itself in a few seconds, nothing to enter. Otherwise enter the Lemon Squeezy key from your receipt on that page, never in this chat. A few seconds after the page says connected, the connection finishes by itself — just come back and keep going.

Then stop and wait. Do not ask for the key, edit config files, or invent a second setup path.

If the user only wants the free AI Employee Map, tell them no connection is required: they can simply say **map my business**.

## Step 1b — When they need the key and can't find it

Only reaches this point if the page did not recognise the purchase automatically. Help them find the key; never handle it yourself.

**Where the key is**, in the order worth trying:

1. **The Lemon Squeezy receipt email** from the original purchase. The key is a long dash-separated code shown in the email body. Searching their inbox for "Lemon Squeezy" or the product name finds it faster than scrolling.
2. **The order page** linked from that receipt — same key, and it survives a deleted email.
3. **Their card statement descriptor** if they can't recall which address they bought with; the receipt went to that address.

**What each failure on the page means** — translate it, don't paste it:

| The page says | What is actually true | What they do next |
|---|---|---|
| Key not accepted / not found | The code was mistyped, or it belongs to a different store | Re-copy the whole code from the receipt with no leading or trailing spaces |
| Subscription cancelled or expired | The key is real; the plan lapsed | Resume or renew in Lemon Squeezy, then re-run `/setup-aieb` — the same connection comes back, nothing to reinstall |
| Not part of this plan | They bought a different product | Say which plan the skill belongs to and point at the plan page; do not try to force the connection |
| Activation limit reached | The key is already used on its allowed machines | Tell them to say so — the limit is lifted from our side, this is not something they can fix alone |

**Never accept the key in chat, in any form.** If they paste it anyway, do not repeat it back, do not write it to a file, and do not put it in a command. Tell them plainly that it only works on the activation page, and give them the link again. A key pasted in chat should be treated as exposed — mention that rotating it later is wise, then move on without lecturing.

If they cannot find the key at all, that is a support moment, not a dead end: tell them to reply to their purchase receipt or reach out, and their access can be restored from our side without the key.

## Step 2 — Confirm when the user returns

The connector completes the connection automatically in the background once the page approves. When the user returns and says anything (`done`, `connected`, or simply continues), call the AIEB connector tool ending in `finish_aieb_connection` to confirm — it reports success instantly when the auto-complete already ran.

- **Approved:** the connector saves an AIEB-scoped device token and starts using it immediately. No restart or reload.
- **Still pending:** show the same activation link once and ask them to finish the page.
- **Expired:** call `connect_aieb` once for a fresh link.
- **Cancelled/expired subscription:** relay the server's plain-language renewal or resumption guidance. Never bypass it.

## Step 3 — Verify and continue

Call `get_skill` with `skill_id: meta-create-skill`, `path: SKILL.md`. If it succeeds, continue the user's original task immediately.

**Already connected?** Say so in one line and move on — re-activating a working connection is pure friction. But add the escape hatch in the same breath, because it is otherwise invisible: *"Already connected. If you ever need to connect this machine to a different subscription or account, just say reconnect."*

**If the user asks to reconnect** — "reconnect", "set it up again", "connect a different account", "use my other subscription", or they say the connection belongs to the wrong person — call `connect_aieb` with `reconnect: true` and run Step 1 normally. Without that argument the tool refuses on an already-connected machine, and the only alternative is hand-deleting a file in their home folder, which is never an instruction to give a business owner.

Do NOT pass `reconnect: true` on your own initiative to "refresh" a connection that is working.

## Step 4 — Continue straight into onboarding (the connection is the doorway, not the destination)

Right after the first successful verification on this machine, work out where they are.

**`.claude-state/progress-state.yaml` is the source of truth.** Read it FIRST. `onboarding-progress.json` is this skill's own older phase tracker, and the two can disagree — a real workspace on 2026-07-26 had the JSON saying `completed_at: null` with a retired voice step while the YAML said onboarding finished that morning. Believe the YAML; treat the JSON as a hint only, and only when no YAML exists.

Then check `.claude-state/onboarding-progress.json`:

- **No state file (fresh workspace):** do NOT stop at "connected." Say one transition line — "Connected. Next I'll set up your workspace and install your Business OS — about 10 minutes." — then fetch `get_skill` with `skill_id: onboard`, `path: SKILL.md` and follow it end to end (it scaffolds the workspace and installs the Business OS, then points at the first build checkpoint — mapping the business with the X-Ray — which runs in its own fresh window, not this one). Its own flow asks every question that matters, so don't add a separate are-you-sure gate in front of it.
- **State file with `completed_at` set** (a reconnect, or a second machine on an already-onboarded workspace): never re-onboard. Confirm the connection and move on; if the managed CLAUDE.md block is missing or behind the server's template version, offer a refresh via `check-setup`.
- **State file in progress AND on the current journey:** resume onboarding from its `current_step` instead of restarting.
- **State file in progress but PRE-JOURNEY (a workspace set up under an older release):** re-orient onto the current journey instead of resuming. Detect it by either signal — there is no `.claude-state/progress-state.yaml` alongside it, or its `current_step` names something the current onboarding flow no longer has (anything about digital assets, voice samples, or filling asset folders is the retired pre-journey plan).

  **Why this branch exists:** resuming a `current_step` that no longer exists walks the owner back down a path the product has moved on from, and it looks like the update did nothing. Verified on a real workspace 2026-07-26 — it resumed "filling digital assets, starting with voice" weeks after that stopped being the flow.

  **What to do instead:** never re-run scaffolding over finished work. Say one honest line — *"Your workspace was set up under an earlier version, so I'll pick up on the current path rather than the old one."* — then fetch `get_skill` with `skill_id: onboard`, `path: SKILL.md` and enter at the first checkpoint they have NOT completed. Read the evidence on disk to decide which that is: `.claude/skills|agents|commands|hooks` present means the scaffold is done, a Business X-Ray output or `.claude-state/xray-pages/` means the map is done. Skip what is already there, confirm it out loud so the work they did still counts, and continue from the first genuinely unfinished checkpoint.

Carve-out — do not hijack work in progress: if the user ran /setup-aieb mid-task (the connection dropped while they were building something), Step 3 already says to continue THEIR task; start onboarding at the next natural pause instead of on top of their work.

## Migration behavior

Existing users with a legacy saved Lemon Squeezy key continue working during migration. Once secure browser activation succeeds, the proxy deletes the saved key and keeps only the revocable AIEB device token.

**Running this on a setup that already works is normal, not a mistake.** Most existing members are still on the older key-on-disk setup; it validates fine until the day a client forgets to send its activation, and then it fails in a way that looks like a billing problem and isn't. Someone arriving here from a "connection upgrade available" nudge should be reassured on both counts: nothing is broken, and the upgrade takes under a minute. Their skills, workspace, and progress all carry over untouched — only where the credential lives changes.

## Non-negotiable rules

- Never request or accept a Lemon Squeezy key in chat.
- Never place a key in a command, environment variable, URL, workspace file, or model-visible tool argument.
- Never hand-write `~/.aieb-mcp/config.json`.
- Never claim paid skills are installed locally.
- Never bypass cancellation, expiration, product, store, tier, device, or rate-limit checks.
