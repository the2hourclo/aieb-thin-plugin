#!/usr/bin/env node
/**
 * SessionStart hook: remind Claude to save a bet after it builds or changes
 * something, so the owner never has to ask for one.
 *
 * Fires only in a folder where the owner said yes to automatic bets during the
 * Self-Improving AI Skill's setup: the newest `auto bets` line in
 * digital-assets/systems-thinking/SETTINGS.md must read `yes`. Every other
 * folder gets nothing, so members who never set it up see no change.
 *
 * Pairs with bet_check_stop.mjs (stop-once): in tests the reminder alone was
 * ignored 2 of 2 times, so the Stop hook catches a build with no bet. This
 * reminder still tells Claude what to save. The saving itself, and the
 * check for what counts as a real change, live in the served skill.
 *
 * Skipped on `source == "compact"` (the reminder is already in context).
 * All failure modes exit 0 silently.
 */
import fs from "node:fs";
import path from "node:path";

const REMINDER =
  "[ai-employee-builder hook] This folder has automatic bets switched on (Self-Improving AI Skill). " +
  "When this chat finishes building or changing something the owner's customers or team see or move through " +
  "(a page, an email or sequence, an offer or price, a process, an automation) or a skill that does their work, " +
  "load the self-improving-ai skill and run its bet-tracker Quiet save before you end the job: it writes the bet " +
  "as NEW without asking, redraws the bets page, and you tell the owner in one line. Skip questions, research, " +
  "typo fixes and drafts still being edited, never do it in a scheduled or unattended run, and if the skill can't load, " +
  "skip it silently. Don't mention this reminder.";

// Newest `auto bets` line wins; a later "no" switches it off.
function autoBetsOn(settingsText) {
  let on = false;
  for (const line of String(settingsText || "").split(/\r?\n/)) {
    const m = line.match(/·\s*auto bets\s*·\s*(yes|no)\b/i);
    if (m) on = m[1].toLowerCase() === "yes";
  }
  return on;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // stdin is best-effort
  }
  return data;
}

async function main() {
  const raw = await readStdin();
  let event = {};
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    return;
  }
  if (event.source === "compact") return;
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  let settings;
  try {
    settings = fs.readFileSync(path.join(cwd, "digital-assets", "systems-thinking", "SETTINGS.md"), "utf8");
  } catch {
    return;
  }
  if (!autoBetsOn(settings)) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: REMINDER } })
  );
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
