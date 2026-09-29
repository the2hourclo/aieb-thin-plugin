// Regression gate for the 2026-09-29 thin-plugin review fixes. Run: node review-fix-thin-plugin.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readState, xrayIsCurrent } from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hooksDir = path.join(root, "hooks");
const HOUR = 60 * 60 * 1000;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aieb-review-fix-thin-"));
}
function age(file, ms) {
  const t = new Date(Date.now() - ms);
  fs.utimesSync(file, t, t);
}
function jsonl(records) {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}
function walk(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String);
}

// ---- retro_nudge -----------------------------------------------------------

function retro({ prior, extra = [], source, runtime = "claude", mutateAfterFirst } = {}) {
  const dir = tmp();
  const workspace = path.join(dir, "workspace");
  const transcripts = path.join(dir, "transcripts");
  const pluginData = path.join(dir, "plugin-data");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(transcripts, { recursive: true });
  const current = path.join(transcripts, "current.jsonl");
  fs.writeFileSync(current, "", "utf8");
  if (prior) {
    const p = path.join(transcripts, "prior.jsonl");
    fs.writeFileSync(p, prior.body, "utf8");
    age(p, prior.ageMs ?? HOUR);
  }
  for (const [name, body, ageMs] of extra) {
    const p = path.join(transcripts, name);
    if (body === null) fs.mkdirSync(p);
    else fs.writeFileSync(p, body, "utf8");
    age(p, ageMs ?? HOUR);
  }
  const env = { ...process.env, PLUGIN_DATA: pluginData, CLAUDE_PLUGIN_ROOT: root };
  delete env.PLUGIN_ROOT;
  if (runtime === "codex") env.PLUGIN_ROOT = root;
  env.AIEB_RUNTIME = runtime;
  const run = () =>
    spawnSync(process.execPath, [path.join(hooksDir, "retro_nudge.mjs")], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({ hook_event_name: "SessionStart", source, cwd: workspace, transcript_path: current, session_id: "current" }),
      env
    });
  const first = run();
  let second = null;
  if (mutateAfterFirst) {
    mutateAfterFirst({ transcripts, workspace });
    second = run();
  }
  const out = { first, second, workspaceFiles: walk(workspace), stateFiles: fs.existsSync(pluginData) ? walk(pluginData) : [] };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const FRICTION_TEXT = "That skill got it wrong. I had to redo it.";
const userText = (text) => ({ type: "user", message: { role: "user", content: text } });

// 1. tool_result blocks (file reads, fetched skill bodies) are not user feedback
{
  const r = retro({
    prior: {
      body: jsonl([
        {
          type: "user",
          message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "the reviewer wrote: that skill got it wrong, this is great, nailed it" }] },
          toolUseResult: { stdout: "this is great" }
        },
        { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "that's not right, this is perfect" }] }] } },
        { type: "user", isMeta: true, message: { role: "user", content: "this is great" } }
      ])
    }
  });
  assert.equal(r.first.status, 0, r.first.stderr);
  assert.equal(r.first.stdout, "", "tool output and meta records must not trigger a nudge");
}

// 2. a genuine typed message, delivered as text blocks, still triggers
{
  const r = retro({
    prior: { body: jsonl([{ type: "user", message: { role: "user", content: [{ type: "text", text: FRICTION_TEXT }] } }]) }
  });
  assert.equal(r.first.status, 0, r.first.stderr);
  assert.match(JSON.parse(r.first.stdout).hookSpecificOutput.additionalContext, /FRICTION:/);
}

// 3. a sibling touched minutes ago is a concurrent session, not the previous one
{
  const r = retro({ prior: { body: jsonl([userText(FRICTION_TEXT)]), ageMs: 60 * 1000 } });
  assert.equal(r.first.status, 0, r.first.stderr);
  assert.equal(r.first.stdout, "", "a concurrent session must not be judged");
  assert.equal(r.stateFiles.filter((f) => f.includes("retro-nudged")).length, 0, "no marker for a skipped concurrent session");
}

// 4. Codex: a rollout whose session_meta cwd is another project is skipped
{
  const meta = (cwd) => ({ type: "session_meta", payload: { id: "x", cwd } });
  const other = retro({
    runtime: "codex",
    prior: { body: jsonl([meta(path.join(os.tmpdir(), "some-other-project")), { payload: { type: "user_message", message: FRICTION_TEXT } }]) }
  });
  assert.equal(other.first.status, 0, other.first.stderr);
  assert.equal(other.first.stdout, "", "another project's Codex rollout must not nudge this workspace");
  assert.deepEqual(other.workspaceFiles, [], "nothing written into this workspace");
}
{
  // Same project: the declared cwd must equal the hook's cwd; build it after the fact via a fixed workspace path.
  const dir = tmp();
  const workspace = path.join(dir, "workspace");
  const transcripts = path.join(dir, "transcripts");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(transcripts, { recursive: true });
  const prior = path.join(transcripts, "prior.jsonl");
  const current = path.join(transcripts, "current.jsonl");
  fs.writeFileSync(prior, jsonl([{ type: "session_meta", payload: { cwd: workspace } }, { payload: { type: "user_message", message: FRICTION_TEXT } }]), "utf8");
  fs.writeFileSync(current, "", "utf8");
  age(prior, HOUR);
  const env = { ...process.env, PLUGIN_ROOT: root, CLAUDE_PLUGIN_ROOT: root, PLUGIN_DATA: path.join(dir, "pd"), AIEB_RUNTIME: "codex" };
  const res = spawnSync(process.execPath, [path.join(hooksDir, "retro_nudge.mjs")], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: workspace, transcript_path: current }),
    env
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /FRICTION:/);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5. the marker lives in the plugin's state dir, never in the project folder
{
  const r = retro({ prior: { body: jsonl([userText(FRICTION_TEXT)]) } });
  assert.match(r.first.stdout, /FRICTION:/);
  assert.deepEqual(r.workspaceFiles, [], "hook must not write into the session cwd");
  assert.ok(r.stateFiles.some((f) => f.includes("retro-nudged-")), `marker missing from plugin data: ${r.stateFiles}`);
}

// 6. a scan with no match is marked too, so later starts do not re-read the transcript
{
  const r = retro({
    prior: { body: jsonl([userText("please summarise the report")]) },
    mutateAfterFirst: ({ transcripts }) => {
      const p = path.join(transcripts, "prior.jsonl");
      fs.writeFileSync(p, jsonl([userText(FRICTION_TEXT)]), "utf8");
      age(p, HOUR);
    }
  });
  assert.equal(r.first.stdout, "");
  assert.equal(r.second.status, 0, r.second.stderr);
  assert.equal(r.second.stdout, "", "an already-scanned transcript is not scanned again");
  assert.deepEqual(r.workspaceFiles, []);
}

// 7. compact restarts do nothing
{
  const r = retro({ source: "compact", prior: { body: jsonl([userText(FRICTION_TEXT)]) } });
  assert.equal(r.first.stdout, "");
  assert.equal(r.stateFiles.filter((f) => f.includes("retro-nudged")).length, 0);
}

// 8. an unreadable prior transcript exits 0 quietly and is retried next time (no marker)
{
  const r = retro({ prior: undefined, extra: [["locked.jsonl", null, HOUR]] });
  assert.equal(r.first.status, 0, r.first.stderr);
  assert.equal(r.first.stdout, "");
  assert.equal(r.stateFiles.filter((f) => f.includes("retro-nudged")).length, 0, "an unreadable file must not be marked scanned");
}

// ---- state / onboard_nudge -------------------------------------------------

function onboard(stateYaml) {
  const dir = tmp();
  const workspace = path.join(dir, "workspace");
  fs.mkdirSync(path.join(workspace, ".claude-state"), { recursive: true });
  if (stateYaml !== null) fs.writeFileSync(path.join(workspace, ".claude-state", "progress-state.yaml"), stateYaml, "utf8");
  const env = { ...process.env, PLUGIN_DATA: path.join(dir, "pd"), CLAUDE_PLUGIN_ROOT: root };
  delete env.PLUGIN_ROOT;
  const res = spawnSync(process.execPath, [path.join(hooksDir, "onboard_nudge.mjs")], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: workspace }),
    env
  });
  const state = readState(workspace);
  fs.rmSync(dir, { recursive: true, force: true });
  return { res, state };
}

for (const [label, body] of [["zero-byte", ""], ["comment-only", "# progress-state.yaml\n# nothing yet\n"], ["unrelated keys", "version: 2\nlast_updated: 2026-07-16\n"]]) {
  const { res, state } = onboard(body);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(state, null, `${label} state file carries no state`);
  assert.equal(res.stdout, "", `${label} state file must not trigger MID-ONBOARDING`);
}

{
  const { res } = onboard("version: 2\nonboarding:\n  started_at: 2026-07-16\n  completed_at: null\nladder:\n  1-onboard: done\n  2-map: in_progress\n");
  assert.equal(res.status, 0, res.stderr);
  // 1-onboard is done, so the workspace counts as onboarded and stays silent.
  assert.equal(res.stdout, "");
}
{
  const { res, state } = onboard("version: 2\nonboarding:\n  started_at: 2026-07-16\n  completed_at: null\n  current_step: \"Business X-Ray\"\nladder:\n  2-map: in_progress\n");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(xrayIsCurrent(state), true);
  const ctx = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /MID-ONBOARDING/);
  assert.match(ctx, /skill_id: business-x-ray/);
  assert.doesNotMatch(ctx, /skill_id: onboard/, "X-Ray-only buyers cannot fetch onboard");
}
{
  const { res, state } = onboard("onboarding:\n  started_at: 2026-07-16\n  completed_at: null\n  current_step: scaffold\n");
  assert.equal(xrayIsCurrent(state), false);
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /skill_id: onboard/);
}

// ---- update_ping: Codex installs report their own version ------------------

async function updatePingOnCodex() {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ latest: "99.0.0", min: "0.0.1" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = tmp();
  try {
    const env = { ...process.env, PLUGIN_ROOT: root, PLUGIN_DATA: path.join(dir, "pd"), AIEB_VERSION_URL: `http://127.0.0.1:${server.address().port}/version` };
    delete env.CLAUDE_PLUGIN_ROOT;
    const child = spawn(process.execPath, [path.join(hooksDir, "update_ping.mjs")], { cwd: root, env });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stdin.end(JSON.stringify({ hook_event_name: "SessionStart", cwd: dir }));
    const code = await new Promise((resolve) => child.on("close", resolve));
    return { code, stdout };
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
{
  const version = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8")).version;
  const { code, stdout } = await updatePingOnCodex();
  assert.equal(code, 0);
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, new RegExp(`this workspace has v${version.replace(/\./g, "\\.")}`));
  assert.match(ctx, /codex plugin add/, "Codex update steps are used");
}

// ---- stale tool references -------------------------------------------------

{
  const offenders = [];
  const skip = new Set([".git", "scripts", "node_modules"]);
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(p);
      else if (/\.(md|mjs|json)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) {
        if (fs.readFileSync(p, "utf8").includes("report_skill_feedback")) offenders.push(path.relative(root, p));
      }
    }
  };
  scan(root);
  assert.deepEqual(offenders, [], "report_skill_feedback is not in the live tool catalog");
}
{
  const researcher = fs.readFileSync(path.join(root, "agents", "youtube-researcher.md"), "utf8").split("\n").find((l) => l.startsWith("tools:"));
  assert.doesNotMatch(researcher, /\b(Edit|MultiEdit|Write|Bash)\b/, "read-only researcher must not carry write tools");
  const breakout = fs.readFileSync(path.join(root, "agents", "youtube-breakout-search.md"), "utf8").split("\n").find((l) => l.startsWith("tools:"));
  assert.doesNotMatch(breakout, /\*/, "breakout agent must not get every tool");
  const reviewer = fs.readFileSync(path.join(root, "agents", "telemetry-reviewer.md"), "utf8");
  assert.doesNotMatch(reviewer, /inbox\.json|SessionStart nudge/);
  assert.match(reviewer, /--consent-this-note/);
}

console.log("review-fix-thin-plugin.test: retro/onboard/update_ping/agent fixes hold");
