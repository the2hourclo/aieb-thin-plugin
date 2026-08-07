#!/usr/bin/env node
/**
 * SessionStart hook (Node port of onboard_nudge.py — Node is guaranteed on
 * buyer machines because the connector runs on it; Python is not on stock
 * Windows): offer onboarding when the workspace looks fresh, and RESUME
 * onboarding when it started but never finished.
 *
 * Three workspace states, three behaviors (mutually exclusive with
 * roadmap_nudge, which owns the post-onboarding ladder):
 *   - FRESH (no state, no skills)      → offer onboarding (max 3 nudges)
 *   - MID-ONBOARDING (state, not done) → inject the resume context EVERY
 *     session, with the current phase/step, so a buyer who says "hi" gets
 *     picked up exactly where they left off (e.g. scaffold done, Business
 *     X-Ray in progress → resume the X-Ray). No cap: this is situational
 *     awareness, not a nag — the text tells the model to follow the user's
 *     lead. (Origin: 2026-07-19 — mid-onboarding was a dead zone: onboard_nudge
 *     saw "not fresh", roadmap_nudge saw "not onboarded", nobody spoke.)
 *   - ONBOARDED → silent; roadmap_nudge takes over.
 *
 * "Fresh" = onboarding has never run here AND no skills have been authored:
 *   - no `.claude-state/progress-state.yaml`, AND
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
import { stateFilePath, readState, onboardingComplete } from "./lib/state.mjs";

const PLUGIN_NAME = "ai-employee-builder";
const MAX_NUDGES = 3;
const IS_CODEX = Boolean(process.env.PLUGIN_ROOT);
const AUTHORING_SKILLS = IS_CODEX ? path.join(".agents", "skills") : path.join(".claude", "skills");

function claudeRoot() {
  if (process.env.PLUGIN_DATA) return process.env.PLUGIN_DATA;
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
    const skillsPath = path.join(cwd, AUTHORING_SKILLS);
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
  // A REAL credential, not the presence of a file.
  //
  // This used to count any non-trivial .json in ~/.aieb-mcp, on the theory that
  // it was robust to whichever filename the proxy used. It was robust to the
  // wrong thing: the proxy writes config.json on its FIRST run, before anyone
  // has connected anything, so a buyer who never activated was told "you're all
  // set, just say onboard me" — and then hit the licence wall on their very
  // first action. On 2026-07-26, eight of ten paying members had never
  // connected a device, and this hook was reassuring every one of them.
  //
  // The only thing that means connected is a device token, which is exactly
  // what resolveConfig() in the proxy reads (cfg.device_token, `aieb_v1_`).
  // Anything else — a legacy licence key, a half-written config, an empty
  // scaffold — is NOT connected, and the setup path is always the safe answer.
  try {
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
    const configFile = path.join(home, ".aieb-mcp", "config.json");
    if (!fs.existsSync(configFile)) return false;
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
    return typeof cfg?.device_token === "string" && cfg.device_token.startsWith("aieb_v1_");
  } catch {
    // unreadable or malformed state = treat as not activated
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

// Legacy per-phase progress file written by the onboard skill. Returns the
// parsed object or null; a file with completed_at set is NOT mid-flight.
function readOnboardingProgress(cwd) {
  try {
    const p = path.join(cwd, ".claude-state", "onboarding-progress.json");
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// Compact human-readable summary of where onboarding stands, e.g.
// "scaffold: completed · business-os: completed · first-skill: in-progress".
function summarizePhases(phases) {
  if (!phases || typeof phases !== "object" || Array.isArray(phases)) return "";
  return Object.entries(phases)
    .map(([name, status]) => `${name}: ${status}`)
    .join(" · ");
}

function buildResumeNudge(detail) {
  return (
    `[${PLUGIN_NAME} hook] This workspace is MID-ONBOARDING — setup started here but never finished.` +
    (detail ? ` Where it stands: ${detail}.` : "") +
    " If the user's first message is a greeting or open-ended ('hi', 'what's next', 'where were we'), " +
    "pick the thread up: say in ONE line where you both left off, then continue from the current step — " +
    "fetch `get_skill` with `skill_id: onboard`, `path: SKILL.md` and let it resume (it skips completed " +
    "phases; if the in-progress step is the Business X-Ray, it hands off to `business-x-ray`, which " +
    "resumes its own map rather than restarting). NEVER restart onboarding from scratch. If the user " +
    "came to do something specific, do their thing first and offer the resume once, at a natural pause."
  );
}

const SETUP_ACTION = IS_CODEX ? 'say "set up AIEB" in this Codex thread' : "run /setup-aieb";

const NUDGE_NOT_ACTIVATED =
  `[${PLUGIN_NAME} hook] The ai-employee-builder plugin is installed but no license is ` +
  "connected on this machine yet, so paid skills (including onboarding) would hit the " +
  "license wall. When there's a natural opening (after acknowledging the user's actual " +
  'first request, not instead of it), offer ONCE, casually: "I see AI Employee Builder ' +
  `is installed but not connected yet — ${SETUP_ACTION}. It gives you one secure link; ` +
  "on that page you click Continue with Google with the address you bought with, and " +
  "that's it, nothing to type. Takes about a minute. After that, say 'onboard me' and " +
  "I'll set up your workspace and first skill. And if you came for the free AI Employee " +
  "Map, that works right now with no account at all — just say 'map my business'.\" If " +
  "the user says no, accept it gracefully and stay silent.";

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

  // MID-ONBOARDING: started but not finished → inject resume context every
  // session (uncapped — situational awareness, not a nag) and stop here.
  // Prefer the unified progress-state.yaml; fall back to the legacy JSON.
  const unified = readState(cwd);
  const legacy = readOnboardingProgress(cwd);
  if (unified && !onboardingComplete(unified)) {
    const ob = unified.onboarding && typeof unified.onboarding === "object" ? unified.onboarding : {};
    const nx = unified.next && typeof unified.next === "object" ? unified.next : {};
    const bits = [
      summarizePhases(ob.phases),
      typeof ob.current_step === "string" ? `current step: "${ob.current_step}"` : "",
      typeof nx.say === "string" && nx.say.trim() ? `the recorded next move: "${nx.say.trim()}"` : ""
    ]
      .filter(Boolean)
      .join("; ");
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: buildResumeNudge(bits) }
      })
    );
    logEvent("resume-context-emitted", { src: "yaml" });
    return;
  }
  if (!unified && legacy && !legacy.completed_at) {
    const bits = [summarizePhases(legacy.phases), typeof legacy.current_step === "string" ? `current step: "${legacy.current_step}"` : ""]
      .filter(Boolean)
      .join("; ");
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: buildResumeNudge(bits) }
      })
    );
    logEvent("resume-context-emitted", { src: "legacy" });
    return;
  }

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
