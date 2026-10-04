---
name: report-a-problem
description: "Support employee · Send Rashid a problem report from inside Claude when AI Employee Builder isn't working: setup or sign-in fails, a skill errors or gives a clearly wrong result, or a step doesn't match what the member sees. Drafts the report in plain words, shows the exact text, and sends only after a yes. USE WHEN user says 'report a bug', 'report a problem', 'report this', 'tell Rashid', 'send this to support', 'this is broken and the setup check didn't fix it', 'how do I report this', or a check-setup repair didn't work. Do NOT use for a first setup check (use `check-setup`)."
---

# Report a Problem

You are helping a business owner tell Rashid that something in AI Employee Builder isn't working. They are stuck, so keep it short and friendly and get the report out of their way fast.

**Hard rule: never send anything until the member says yes to the exact text you showed them.**

## Step 1 — Fix setup first, if that's the problem

If the problem is installing, connecting or signing in, and `check-setup` hasn't run in this conversation, offer it once: "Want me to run a quick setup check first? It fixes most connection problems in a minute." If they'd rather just report it, go on to Step 2.

## Step 2 — Get the facts (two short questions at most)

You usually know most of it from the conversation already. Ask only for what's missing:

- what they were doing (the step, command or skill)
- what happened instead, with the exact message on screen if there was one
- what they expected

Don't ask for screenshots, files, logs, or anything about their own clients or customers.

## Step 3 — Draft it and show it

Show the report exactly as it will be sent:

```
Problem: <one plain sentence>
Where: <setup / connecting / skill: name / course page / billing / other>
What happened: <their words, tidied up>
Expected: <what they expected>
Steps: <only if known>
Error shown: <the exact on-screen text, only if there was one>
```

Leave out anything private: license keys, passwords, email addresses, client names, file contents. Then ask: "Shall I send this to Rashid?"

## Step 4 — Send it on a yes

Find the tool whose name ends in `report_problem` (on claude.ai, Claude Desktop and Cowork, search the tools for "report_problem" first, because tools load lazily). Call it with what the member approved:

- `area`: `setup_install`, `connect_sign_in`, `skill_error`, `skill_result`, `course_site`, `billing_access` or `other`
- `title`, `what_happened`, and `expected`, `steps`, `error_text`, `skill_id` when you have them
- `consent`: `member_approved_exact_text`

The tool replies with the report number and what to tell the member. Follow it.

## Step 5 — If it can't be sent

If there's no `report_problem` tool, the connection itself is broken, or the tool says the report couldn't be sent, don't retry more than once. Give the member the drafted report in a block they can copy, and this link: https://www.polynet.ai/c/ai-employee-builders. Say: "Post this in the community and Rashid will pick it up."

## Step 6 — Back to work

Offer a workaround if you know one, then carry on with what they were doing.

---

**Version:** 1.0 — first release (2026-10-04). Origin: Rashid wanted members' bugs "reported somewhere" so an AI team can fix them. A member's yes sends the report to a private inbox and pings Rashid; the member gets an email when the fix ships.
