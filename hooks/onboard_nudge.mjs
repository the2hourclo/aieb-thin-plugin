#!/usr/bin/env node
/**
 * SessionStart hook (Node port of onboard_nudge.py — Node is guaranteed on
 * buyer machines because the connector runs on it; Python is not on stock
 * Windows): offer onboarding when the workspace looks fresh.
 *
 * "Fresh" = onboarding has never run here AND no skills have been authored:
 *   - no `.claude-state/onboarding-progress.json`, AND
 *   - no `.claude/skills/` folder.
 *
 * Politeness rules (identical to the Python original):
 *   - At most MAX_NUDGES reminders per workspace, then silent forever. Count
 *     stored user-global (~/.claude/.clo-os-state/), keyed by a hash of the
 *     workspace path — NEVER writes into the buyer's project folder.
 *   - Skipped on `source == "compact"`.
 *   - additionalContext only; never blocks the buyer's first request.
 *
 * All failure modes exit 0 silently.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stateFilePath } from "./lib/state.mjs";

const PLUGIN_NAME = "ai-employee-builder";
const MAX_NUDGES = 3;

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
      hook: "onboard_nudge",
      stage,
      plugin: PLUGIN_NAME,
      ...fields
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // never block on logging
  }
}

function isFreshWorkspace(cwd) {
  try {
    // Unified state file (progress-state.yaml) present → onboarding at least started.
    if (fs.existsSync(stateFilePath(cwd))) return false;
    if (fs.existsSync(path.join(cwd, ".claude-state", "onboarding-progress.json"))) return false;
    const skillsPath = path.join(cwd, ".claude", "skills");
    if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) return false;
  } catch {
    return false;
  }
  return true;
}

function counterPath(cwd) {
  let key;
  try {
    key = fs.realpathSync(cwd);
  } catch {
    key = String(cwd);
  }
  const safe = crypto.createHash("sha1").update(String(key), "utf8").digest("hex").slice(0, 16);
  return path.join(claudeRoot(), ".clo-os-state", `aeb-onboard-nudge-${safe}.json`);
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

// Onboarding is a PAID skill: nudging "say onboard me" before the license is
// connected dead-ends the buyer's very first action on the license wall
// (observed in the 2026-07-10 journey audit). So the nudge checks activation
// state and, when unconnected, leads with /setup-aieb instead.
function isActivated() {
  // Any non-trivial state file in ~/.aieb-mcp counts (legacy config.json /
  // activation.json, or the device-flow token store) — robust to the exact
  // filename the proxy uses across versions.
  try {
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
    const dir = path.join(home, ".aieb-mcp");
    if (!fs.existsSync(dir)) return false;
    return fs
      .readdirSync(dir)
      .some((f) => f.endsWith(".json") && !f.startsWith("pending") && fs.statSync(path.join(dir, f)).size > 2);
  } catch {
    // unreadable state = treat as not activated; the setup path is always safe
  }
  return false;
}

const NUDGE_ACTIVATED =
  `[${PLUGIN_NAME} hook] This looks like a fresh workspace for the ai-employee-builder ` +
  "plugin — onboarding hasn't run here and no skills have been authored yet. When " +
  "there's a natural opening (after acknowledging the user's actual first request, " +
  'not instead of it), offer ONCE, casually: "Looks like ai-employee-builder is ' +
  "freshly installed here. Want me to set up the authoring folders and walk you " +
  "through building your first custom skill? About 10 minutes — just say 'onboard " +
  "me'. Or we can dive straight into what you came to do.\" Many buyers install this " +
  "into an existing project, so don't push a folder scaffold on them — if the user " +
  "says no, accept it gracefully and stay silent. If their first message is already " +
  "about onboarding, just run it — don't double-offer.";

const NUDGE_NOT_ACTIVATED =
  `[${PLUGIN_NAME} hook] The ai-employee-builder plugin is installed but no license is ` +
  "connected on this machine yet, so paid skills (including onboarding) would hit the " +
  "license wall. When there's a natural opening (after acknowledging the user's actual " +
  'first request, not instead of it), offer ONCE, casually: "I see AI Employee Builder ' +
  "is installed but not connected yet — run /setup-aieb to link your license (about 2 " +
  "minutes; members get the key with their purchase). After that, say 'onboard me' and " +
  "I'll set up your workspace and first skill. And if you came for the free AI Employee " +
  "Map, that works right now with no key — just say 'map my business'.\" If the user " +
  "says no, accept it gracefully and stay silent.";

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

  if (!isFreshWorkspace(cwd)) {
    logEvent("not-fresh");
    return;
  }

  const counterFile = counterPath(cwd);
  const count = getCount(counterFile);
  if (count >= MAX_NUDGES) {
    logEvent("nudge-capped", { count });
    return;
  }

  bumpCount(counterFile, cwd, count + 1);
  const activated = isActivated();
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: activated ? NUDGE_ACTIVATED : NUDGE_NOT_ACTIVATED
      }
    })
  );
  logEvent("nudge-emitted", { count: count + 1, activated });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
