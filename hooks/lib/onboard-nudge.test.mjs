// SessionStart onboarding nudge: build requests go to the meta-create-skill front door, a fresh
// workspace with no build request gets one offer, and the mid-flight and silent branches are unchanged.
// The hook runs before the member's first message exists, so what is tested is the instruction it hands the model.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = path.join(root, "hooks", "onboard_nudge.mjs");
const source = fs.readFileSync(hook, "utf8").replace(/\r\n/g, "\n");

// The one member-facing line, read from its single constant in the hook source.
const constant = /const FRESH_OFFER_LINE =\n((?:\s+"(?:[^"\\]|\\.)*"(?: \+)?\n?)+);/.exec(source);
assert.ok(constant, "the offer line is one constant in the hook source");
const OFFER = [...constant[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).join("");
assert.equal(OFFER, "Looks like AI Employee Builders is freshly installed here. Want to build your first AI Employee? Tell me the job you'd like help with, and I'll set up your workspace as part of it.");
assert.equal(source.split("Want to build your first AI Employee?").length - 1, 1, "the wording lives in exactly one place");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-onboard-nudge-"));
let scenario = 0;
function workspace(setup = () => {}) {
  const dir = path.join(temp, `workspace-${++scenario}`);
  fs.mkdirSync(dir, { recursive: true });
  setup(dir);
  return dir;
}
const put = (dir, relative, body = "") => {
  const file = path.join(dir, ...relative.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
function fire(dir, { source: eventSource = "startup", codex = false, data = path.join(temp, "plugin-data") } = {}) {
  const env = { ...process.env, PLUGIN_DATA: data };
  delete env.PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_ROOT;
  if (codex) env.PLUGIN_ROOT = root;
  const result = spawnSync(process.execPath, [hook], { encoding: "utf8", env, input: JSON.stringify({ hook_event_name: "SessionStart", source: eventSource, cwd: dir }) });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "SessionStart");
  return output.additionalContext;
}

try {
  // ---- Fresh workspace: conditional routing, one offer -------------------------------------------------------------
  const fresh = fire(workspace());
  assert.ok(fresh, "a fresh workspace is nudged");
  assert.ok(fresh.includes(OFFER), "the offer line is used as written");
  assert.equal(fresh.split(OFFER).length - 1, 1, "the line appears once");
  const build = fresh.indexOf("(1) If it asks for an AI Employee, a job to automate, or help getting started");
  const other = fresh.indexOf("(2) If it is anything else");
  assert.ok(build >= 0 && other > build && fresh.indexOf(OFFER) > other, "the build request is routed before the offer is allowed");
  assert.match(fresh, /load the `meta-create-skill` skill and follow its front door/);
  assert.match(fresh, /runs setup as part of the build, so do NOT offer onboarding separately and do NOT say the offer line in \(2\)/);
  assert.match(fresh, /offer ONCE/);
  assert.match(fresh, /if the user says no, accept it gracefully and stay silent/);
  assert.match(fresh, /\(3\) If their first message is already about onboarding/);
  assert.match(fresh, /get_skill` tool for `onboard`/);
  assert.match(fresh, /Don't ask for a license key in chat/);
  assert.doesNotMatch(fresh, /walk you through building your first custom skill|say 'onboard me'|set up the authoring folders/, "the old onboarding pitch is gone");
  console.log("onboard-nudge: a fresh workspace routes build requests to the front door and offers the single line otherwise");

  // ---- Once per workspace, at most three times ---------------------------------------------------------------------
  const capped = workspace();
  const data = path.join(temp, "capped-data");
  const seen = [1, 2, 3, 4].map(() => fire(capped, { data }));
  assert.deepEqual(seen.map(Boolean), [true, true, true, false], "three nudges, then silent forever");

  // ---- Silent branches ----------------------------------------------------------------------------------------------
  assert.equal(fire(workspace(), { source: "compact" }), null, "compaction never nudges");
  assert.equal(fire(workspace((dir) => put(dir, ".claude/skills/reply/SKILL.md", "x"))), null, "a workspace with authored skills is not fresh");
  assert.equal(fire(workspace((dir) => put(dir, ".claude/skills/reply/SKILL.md", "x")), { codex: false }), null);
  assert.ok(fire(workspace((dir) => put(dir, ".claude/skills/reply/SKILL.md", "x")), { codex: true }), "Codex looks in .agents/skills, not .claude/skills");
  assert.equal(fire(workspace((dir) => put(dir, ".agents/skills/reply/SKILL.md", "x")), { codex: true }), null);
  assert.equal(fire(workspace((dir) => put(dir, ".claude-state/progress-state.yaml", "onboarding:\n  completed_at: 2026-09-01\n"))), null, "onboarded (state file) is silent");
  assert.equal(fire(workspace((dir) => put(dir, ".claude-state/onboarding-progress.json", JSON.stringify({ completed_at: "2026-09-01", phases: {} })))), null, "onboarded (legacy record) is silent");
  console.log("onboard-nudge: silent after three nudges, on compaction, and once skills or onboarding exist");

  // ---- Mid-flight onboarding is unchanged --------------------------------------------------------------------------
  for (const [label, setup] of [
    ["state file", (dir) => put(dir, ".claude-state/progress-state.yaml", "onboarding:\n  completed_at: null\n  current_step: \"map your business\"\n  phases:\n    scaffold: completed\n    business-os: in-progress\n")],
    ["legacy record", (dir) => put(dir, ".claude-state/onboarding-progress.json", JSON.stringify({ completed_at: null, current_step: "map your business", phases: { scaffold: "completed", "business-os": "in-progress" } }))]
  ]) {
    const midFlight = fire(workspace(setup));
    assert.ok(midFlight, `${label}: mid-flight is nudged`);
    assert.match(midFlight, /MID-ONBOARDING — setup started here but never finished/);
    assert.match(midFlight, /scaffold: completed · business-os: in-progress/);
    assert.match(midFlight, /NEVER restart onboarding from scratch/);
    assert.match(midFlight, /do their thing first and offer the resume once, at a natural pause/);
    assert.ok(!midFlight.includes(OFFER), `${label}: the fresh-workspace offer is not made mid-flight`);
  }
  console.log("onboard-nudge: the mid-flight resume branch is unchanged and never makes the fresh-workspace offer");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
