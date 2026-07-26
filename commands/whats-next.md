---
description: "Pick up where you left off — reads your saved build progress and runs the next move on your AI-employee roadmap. Works on every surface with no restart. Say 'what's next', 'resume', or 'I'm back' any time."
allowed-tools: [Read, Glob]
---

# What's Next — resume the build

The buyer's whole journey is persisted in `.claude-state/progress-state.yaml` at the workspace root. On native Claude Code a SessionStart hook surfaces this automatically; on Cowork that hook does not fire, so this command is the reliable way to resume. Read the state, tell them exactly where they left off in one or two lines, then offer to run the single next move. Do not restart anything they've already finished.

## Step 1 — Read the state

Read `.claude-state/progress-state.yaml` from the workspace root (glob for it first if the working directory is a session sandbox rather than the workspace folder). Fail open: if the file is missing or unreadable, fall to the "not set up yet" branch below rather than erroring.

Interpret these keys:
- `onboarding.completed_at` — set once workspace setup + Business OS install finished.
- `ladder` — the post-map build checkpoints: `3-first-skill`, `4-system`, `5-autonomy`. A stage counts as done if its value is `done`, `completed`, or `skipped`; anything else (or missing) is still pending.
- `next.say` — the precomputed warm one-sentence offer naming the exact next build (written by the roadmap step). Prefer this verbatim when present.
- `next.blocker` — the single thing missing before the next build can run unattended, or null.
- `roadmap` — ordered items each with a `status` and a `build` name; the first item whose status is not `done`/`skipped` is the pending move.

## Step 2 — Branch on where they are

**No state file (fresh workspace).** They haven't onboarded on this machine. Don't invent progress. If AI Employee Builder is connected, say one line and offer to set up: *"Nothing saved here yet — want me to set up your workspace and install your Business OS? About 10 minutes."* then run `/setup-aieb` (or fetch the `onboard` skill if already connected). If they only want the free map, tell them to say **map my business**.

**Onboarding not complete** (`onboarding.completed_at` absent, file present). Resume onboarding from its `current_step` — do not restart it from the top.

**No `progress-state.yaml`, but `.claude-state/onboarding-progress.json` exists.** This is a workspace set up under an older release, before the journey state existed. Do NOT resume its `current_step`: that file predates the current path, so its saved step may name work the product no longer does — a real workspace on 2026-07-26 resumed "filling digital assets, starting with voice" weeks after that stopped being the flow, which reads as the update having changed nothing.

Instead, work out where they actually are from what is on disk, and continue on the CURRENT journey:
- `.claude/skills|agents|commands|hooks` present → the workspace scaffold is done.
- A Business X-Ray output or `.claude-state/xray-pages/` → the map is done.
- Neither → treat as the start of the journey.

Say one line naming what is already finished so their earlier work still counts, then offer the first checkpoint they have not completed. Never re-run a step whose output is already sitting there.

**Onboarding complete, work remaining** (a pending `roadmap` item or any ladder stage still pending). This is the main case:
1. One line of orientation — what's already done (name the finished ladder stages / roadmap builds), so they feel the progress.
2. The next move — read out `next.say` verbatim if present; otherwise name the pending `roadmap` item's `build` and offer to build it.
3. If `next.blocker` is set, name it plainly: *"One thing's blocking it: {blocker} — sort that and I can build it for you."* Offer to help clear the blocker first.
4. Offer to run it now. On yes, fetch the skill that owns that move (onboarding → `onboard`; map the business → `business-x-ray`; build a skill → `meta-create-skill`; wire a system → `meta-create-skill` system flow) and continue straight into it.

**Everything complete** (ladder finished, no pending roadmap item). Nothing to resume — say so and celebrate it. Offer the real next options: build another AI employee, or make the existing ones run themselves (the autonomy stage). Don't manufacture busywork.

## Step 3 — Always end with the one next phrase

Close by telling them the single thing to type next (the breadcrumb), so they never have to guess and the same phrase works on any surface — e.g. *"When you're ready, just say **what's next** again and I'll pick up from here."*

## Rules
- Read only; never edit `progress-state.yaml` from this command (the roadmap/build skills own the writes).
- Never claim a build is done that the state file doesn't mark done.
- If the state file and the managed `CLAUDE.md` resume block disagree, trust `progress-state.yaml` — it's the source of truth.
