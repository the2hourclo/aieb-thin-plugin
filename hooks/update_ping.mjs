#!/usr/bin/env node
/**
 * SessionStart hook (Node port of update_ping.py — Node is guaranteed on buyer
 * machines because the connector runs on it; Python is not on stock Windows).
 *
 * Two nudge tiers, one throttle:
 *   1. SHELL: read this plugin's installed version, compare against the hosted
 *      MCP's /version {latest, min} → firm nudge below min, gentle below latest.
 *   2. WORKSPACE MAP: read <cwd>/CLAUDE.md, find the managed-block stamp
 *      `managed-by-ai-employee-builder:intro:start v=N`, compare against the
 *      /version response's `claude_md_template` field. If the server doesn't
 *      send that field yet → no nudge. A managed block WITHOUT a v= stamp
 *      counts as v0 (scaffolded before stamps existed). No managed block at
 *      all → this isn't an AIEB-scaffolded workspace → silent.
 *
 * Same state files, same 24h throttle, same log as the Python original.
 * Every failure mode exits 0 silently — a nudge is a nice-to-have, never a
 * blocker.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_NAME = "ai-employee-builder";
const MARKETPLACE = "aieb-thin-plugin";
const THROTTLE_HOURS = 24;
const VERSION_URL = process.env.AIEB_VERSION_URL || "https://aieb-gated-mcp.vercel.app/version";
const TIMEOUT_MS = 3000; // short, so a slow network never stalls session start

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
      hook: "update_ping",
      stage,
      plugin: PLUGIN_NAME,
      ...fields
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // never block on logging
  }
}

// Parse a semver-ish string into a comparable array. Malformed -> [0] so a bad
// value never claims to be newer.
function versionTuple(v) {
  try {
    const parts = String(v)
      .split(".")
      .filter((x) => /^\d+$/.test(x))
      .map(Number);
    return parts.length ? parts : [0];
  } catch {
    return [0];
  }
}

function versionLess(a, b) {
  const ta = versionTuple(a);
  const tb = versionTuple(b);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = i < ta.length ? ta[i] : -1; // shorter tuple sorts first on equal prefix
    const y = i < tb.length ? tb[i] : -1;
    if (x !== y) return x < y;
  }
  return false;
}

function installedVersion() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return null;
  try {
    const raw = fs.readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8");
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

async function fetchRemoteVersions() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(VERSION_URL, {
      headers: { "User-Agent": "aieb-thin-plugin-update-ping/2.0" },
      signal: controller.signal
    });
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function throttlePath() {
  return path.join(claudeRoot(), ".clo-os-state", `${PLUGIN_NAME}-update-ping.json`);
}

function isThrottled() {
  try {
    const raw = fs.readFileSync(throttlePath(), "utf8");
    const last = new Date(JSON.parse(raw).last_check);
    if (Number.isNaN(last.getTime())) return false;
    return Date.now() - last.getTime() < THROTTLE_HOURS * 3600 * 1000;
  } catch {
    return false;
  }
}

function recordCheck() {
  try {
    fs.mkdirSync(path.dirname(throttlePath()), { recursive: true });
    fs.writeFileSync(
      throttlePath(),
      JSON.stringify({ last_check: new Date().toISOString() }),
      "utf8"
    );
  } catch {
    // best-effort
  }
}

// Workspace CLAUDE.md managed-block template stamp. Returns an integer version,
// 0 for a managed block without a v= stamp, or null when there is no managed
// block (not an AIEB-scaffolded workspace).
function workspaceStampVersion(cwd) {
  try {
    const text = fs.readFileSync(path.join(cwd, "CLAUDE.md"), "utf8");
    const m = text.match(/managed-by-ai-employee-builder:intro:start(?:[^\S\r\n]+v=(\d+))?/);
    if (!m) return null;
    return m[1] ? parseInt(m[1], 10) : 0;
  } catch {
    return null;
  }
}

// The server's current CLAUDE.md template version. Absent/malformed -> null
// (the live server may not send this field yet — that means "no nudge").
function templateVersion(remote) {
  const raw = remote?.claude_md_template;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const UPDATE_CMDS = `/plugin install ${PLUGIN_NAME}@${MARKETPLACE}  →  /reload-plugins  →  /setup-aieb`;

const FIRM =
  `[${PLUGIN_NAME} hook] The AI Employee Builder plugin shell installed here is v{have}, ` +
  `below the minimum supported v{min}. It may misbehave until updated. At a natural ` +
  `opening, tell the user plainly and give the exact steps: ${UPDATE_CMDS}. After updating, ` +
  `suggest they say 'check my setup' so their workspace gets refreshed too. (Paid skill ` +
  `content already updates automatically — this is only the local shell.)`;

const GENTLE =
  `[${PLUGIN_NAME} hook] A newer AI Employee Builder plugin shell is available (v{latest}; ` +
  `this workspace has v{have}). When there's a natural opening, ` +
  `mention it ONCE, casually, with the steps: ${UPDATE_CMDS}, and that afterwards they can ` +
  `say 'check my setup' to refresh their workspace. Don't push or interrupt a task. ` +
  `(Skill content updates automatically — this only refreshes the local shell.)`;

const WORKSPACE_BEHIND =
  `[${PLUGIN_NAME} hook] This folder's AI Employee workspace map (the managed block in ` +
  `CLAUDE.md, v{ws}) is behind the current template (v{tpl}). At a natural opening, mention ` +
  `gently: "Your AI Employee workspace map is a version behind — say 'check my setup' to ` +
  `refresh it." Don't push or interrupt a task.`;

function emit(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: context
      }
    })
  );
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
    event = JSON.parse(raw);
  } catch {
    event = {};
  }

  if (isThrottled()) {
    logEvent("skipped-throttle");
    return;
  }
  const remote = await fetchRemoteVersions();
  if (!remote) {
    logEvent("no-remote-version");
    return;
  }
  // Only throttle a successful check. A transient Cowork/Claude network miss
  // should retry next session, not suppress update awareness for 24 hours.
  recordCheck();

  const parts = [];
  let shellStage = null;

  // Tier 1 — shell version.
  const have = installedVersion();
  const latest = remote.latest;
  const minimum = remote.min || remote.minimum;
  if (!have) {
    logEvent("no-installed-version");
  } else if (minimum && versionLess(have, minimum)) {
    parts.push(FIRM.replace("{have}", have).replace("{min}", String(minimum)));
    shellStage = "nudge-firm";
  } else if (latest && versionLess(have, latest)) {
    parts.push(GENTLE.replace("{latest}", String(latest)).replace("{have}", have));
    shellStage = "nudge-gentle";
  }

  // Tier 2 — workspace CLAUDE.md template stamp.
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  const wsVersion = workspaceStampVersion(cwd);
  const tplVersion = templateVersion(remote);
  const workspaceBehind = wsVersion !== null && tplVersion !== null && wsVersion < tplVersion;
  if (workspaceBehind) {
    parts.push(
      WORKSPACE_BEHIND.replace("{ws}", String(wsVersion)).replace("{tpl}", String(tplVersion))
    );
  }

  if (parts.length) {
    emit(parts.join("\n\n"));
    logEvent(shellStage || "nudge-workspace-only", {
      have,
      latest,
      ...(minimum ? { min: minimum } : {}),
      workspace_behind: workspaceBehind,
      ...(workspaceBehind ? { ws_v: wsVersion, tpl_v: tplVersion } : {})
    });
    return;
  }

  logEvent("already-current", { have, latest });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
