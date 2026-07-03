#!/usr/bin/env node
/**
 * SessionStart hook (Node port of roadmap_nudge.py — Node is guaranteed on
 * buyer machines because the connector runs on it; Python is not on stock
 * Windows): offer to CONTINUE BUILDING once onboarding is done.
 *
 * Fires only in the post-onboarding window:
 *   - `.claude-state/onboarding-progress.json` exists AND `completed_at` is
 *     set, AND
 *   - the roadmap isn't finished — `.claude-state/roadmap-progress.json` is
 *     missing OR still has a stage that's pending/in-progress.
 *
 * Mutually exclusive with onboard_nudge (fresh vs. onboarded are different
 * states). Same politeness rules, counters, and log as the Python original.
 * All failure modes exit 0 silently.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_NAME = "ai-employee-builder";
const MAX_NUDGES = 3;
const ROADMAP_STAGES = ["3-harness", "4-system", "5-agent", "6-command", "7-autopilot"];

function claudeRoot() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, ".claude");
}

function logEvent(stage, fields = {}) {
  try {
    const logPath = path.join(claudeRoot(), ".clo-os-state", `${PLUGIN_NAME}-hooks.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const record = {
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
      hook: "roadmap_nudge",
      stage,
      plugin: PLUGIN_NAME,
      ...fields
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // never block on logging
  }
}

// True only if onboarding ran here AND finished (completed_at is set).
function onboardingComplete(cwd) {
  try {
    const progressPath = path.join(cwd, ".claude-state", "onboarding-progress.json");
    if (!fs.existsSync(progressPath)) return false;
    const data = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    return Boolean(data.completed_at);
  } catch {
    return false;
  }
}

// True if the build ladder still has somewhere to go. Missing state file →
// never started → true. Every tracked stage completed/skipped → false. Any
// parse error → false (don't nag on malformed state).
function roadmapUnfinished(cwd) {
  try {
    const progressPath = path.join(cwd, ".claude-state", "roadmap-progress.json");
    if (!fs.existsSync(progressPath)) return true;
    const stages = JSON.parse(fs.readFileSync(progressPath, "utf8")).stages;
    if (!stages || typeof stages !== "object" || Array.isArray(stages)) return false;
    for (const name of ROADMAP_STAGES) {
      const status = name in stages ? stages[name] : "pending";
      if (status !== "completed" && status !== "skipped") return true;
    }
    return false;
  } catch {
    return false;
  }
}

function counterPath(cwd) {
  let key;
  try {
    key = fs.realpathSync(cwd);
  } catch {
    key = String(cwd);
  }
  const safe = crypto.createHash("sha1").update(String(key), "utf8").digest("hex").slice(0, 16);
  return path.join(claudeRoot(), ".clo-os-state", `aeb-roadmap-nudge-${safe}.json`);
}

function getCount(counterFile) {
  try {
    const count = JSON.parse(fs.readFileSync(counterFile, "utf8")).count;
    return Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : 0;
  } catch {
    return 0;
  }
}

function bumpCount(counterFile, cwd, newCount) {
  try {
    fs.mkdirSync(path.dirname(counterFile), { recursive: true });
    fs.writeFileSync(
      counterFile,
      JSON.stringify({
        count: newCount,
        cwd: String(cwd),
        last: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00")
      }),
      "utf8"
    );
  } catch {
    // best-effort
  }
}

const NUDGE =
  `[${PLUGIN_NAME} hook] This workspace has finished onboarding and still has a build ` +
  "roadmap to work through. When there's a natural opening (after acknowledging the " +
  'user\'s actual first request, not instead of it), offer ONCE, casually: "Want to ' +
  "pick up where you left off and keep building? Say 'what's next' and I'll show your " +
  'roadmap and the next move." Don\'t push — if the user is clearly here to do ' +
  "something specific, let them get to it; if they decline, accept it and stay " +
  "silent. If their first message is already about the roadmap or what to build next, " +
  "just invoke the `roadmap` skill — don't double-offer.";

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
  if (!raw) return;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  if (event.source === "compact") return;

  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();

  if (!onboardingComplete(cwd)) {
    logEvent("not-onboarded");
    return;
  }
  if (!roadmapUnfinished(cwd)) {
    logEvent("ladder-complete");
    return;
  }

  const counterFile = counterPath(cwd);
  const count = getCount(counterFile);
  if (count >= MAX_NUDGES) {
    logEvent("nudge-capped", { count });
    return;
  }

  bumpCount(counterFile, cwd, count + 1);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: NUDGE
      }
    })
  );
  logEvent("nudge-emitted", { count: count + 1 });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
