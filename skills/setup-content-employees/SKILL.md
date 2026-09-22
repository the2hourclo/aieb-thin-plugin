---
name: setup-content-employees
description: "Setup employee · First-run onboarding for the Community content employees. Offers a voice-first quick start for Write using approved samples plus a short interview, with brand positioning and visual identity as optional follow-ons; full setup also creates output folders and the workspace asset map. USE WHEN user says 'set up my content employees', 'onboard my writing employees', 'set up my voice', 'calibrate my voice', 'my voice files', 'set my brand colors', 'customize how my diagrams look', 'my visual style', 'get started with the writing skills', 'the write skill says my voice files are missing', or right after installing/upgrading to the Community plan. Safe to re-run — it changes only approved files and never overwrites work."
---

# setup-content-employees — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="setup-content-employees", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
