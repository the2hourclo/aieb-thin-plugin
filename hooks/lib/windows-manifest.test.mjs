// Windows/Codex regression gate for plugin hook discovery and execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
const hooks = JSON.parse(fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8"));

assert.equal(manifest.hooks, "./hooks/hooks.json", "Codex manifest must explicitly declare the hook file");

const handlers = Object.entries(hooks.hooks).flatMap(([event, groups]) =>
  groups.flatMap((group) => group.hooks.map((hook) => ({ event, ...hook })))
);
assert.equal(handlers.length, 6);

for (const handler of handlers) {
  assert.equal(typeof handler.commandWindows, "string", `${handler.event} is missing commandWindows`);
  assert.match(handler.commandWindows, /process\.env\.PLUGIN_ROOT/);
  assert.match(handler.commandWindows, /process\.env\.CLAUDE_PLUGIN_ROOT/);
  assert.doesNotMatch(handler.commandWindows, /2>\/dev\/null|\|\|\s*true|\$\{CLAUDE_PLUGIN_ROOT\}/);
}

const roadmap = handlers.find((handler) => /roadmap_nudge\.mjs/.test(handler.commandWindows));
assert.ok(roadmap, "roadmap Windows hook command is missing");
const reportNudge = handlers.find((handler) => /report_nudge_stop\.mjs/.test(handler.commandWindows));
assert.ok(reportNudge, "outcome/feedback Windows Stop hook command is missing");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-codex-hook-test-"));
const fixture = path.join(tempRoot, "workspace");
const pluginData = path.join(tempRoot, "plugin-data");
fs.mkdirSync(path.join(fixture, ".claude-state"), { recursive: true });
fs.writeFileSync(
  path.join(fixture, ".claude-state", "onboarding-progress.json"),
  JSON.stringify({ completed_at: "2026-08-29T00:00:00.000Z" }),
  "utf8"
);

try {
  const result = spawnSync(roadmap.commandWindows, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: fixture }),
    env: {
      ...process.env,
      PLUGIN_ROOT: root,
      CLAUDE_PLUGIN_ROOT: root,
      PLUGIN_DATA: pluginData
    }
  });

  assert.equal(result.status, 0, result.stderr || "Windows hook command failed");
  const response = JSON.parse(result.stdout);
  assert.equal(response.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(response.hookSpecificOutput.additionalContext, /roadmap/i);

  const fakeHome = path.join(tempRoot, "home");
  const reportState = path.join(fakeHome, ".aieb-mcp");
  fs.mkdirSync(reportState, { recursive: true });
  fs.writeFileSync(
    path.join(reportState, "pending-report.json"),
    JSON.stringify({ skill_id: "write", fetched_at: Date.now(), started: true, nudged: false }),
    "utf8"
  );
  const stop = spawnSync(reportNudge.commandWindows, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PLUGIN_ROOT: root,
      CLAUDE_PLUGIN_ROOT: root,
      PLUGIN_DATA: pluginData
    }
  });
  assert.equal(stop.status, 0, stop.stderr || "Windows Stop hook command failed");
  const stopResponse = JSON.parse(stop.stdout);
  assert.equal(stopResponse.decision, "block");
  assert.match(stopResponse.reason, /report_product_outcome/);
  assert.match(stopResponse.reason, /report_skill_feedback/);
} finally {
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir()) + path.sep;
  if (resolvedTemp.startsWith(resolvedOsTemp)) fs.rmSync(resolvedTemp, { recursive: true, force: true });
}

console.log("windows-manifest.test: Codex executed SessionStart and Stop hook commands");
