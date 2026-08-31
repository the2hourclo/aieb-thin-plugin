// Cross-runtime feedback-nudge regression gate.
// Only explicit USER messages may trigger; assistant/tool text must stay inert.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = path.join(root, "hooks", "retro_nudge.mjs");

function runScenario(records) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-feedback-hook-test-"));
  const workspace = path.join(tempRoot, "workspace");
  const transcripts = path.join(tempRoot, "transcripts");
  const pluginData = path.join(tempRoot, "plugin-data");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(transcripts, { recursive: true });
  const prior = path.join(transcripts, "prior.jsonl");
  const current = path.join(transcripts, "current.jsonl");
  fs.writeFileSync(prior, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  fs.writeFileSync(current, "", "utf8");

  try {
    return spawnSync(process.execPath, [hook], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({ hook_event_name: "SessionStart", cwd: workspace, transcript_path: current }),
      env: { ...process.env, PLUGIN_ROOT: root, CLAUDE_PLUGIN_ROOT: root, PLUGIN_DATA: pluginData }
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const friction = runScenario([
  { type: "user", message: { role: "user", content: "That skill got it wrong. I had to redo it." } }
]);
assert.equal(friction.status, 0, friction.stderr);
const frictionContext = JSON.parse(friction.stdout).hookSpecificOutput.additionalContext;
assert.match(frictionContext, /FRICTION:/);
assert.match(frictionContext, /report_skill_feedback/);
assert.match(frictionContext, /note-friction-procedure/);
assert.doesNotMatch(frictionContext, /That skill got it wrong/, "transcript text must never enter hook output");

const win = runScenario([
  { payload: { type: "user_message", message: "This worked first try. I used it as-is." } }
]);
assert.equal(win.status, 0, win.stderr);
const winContext = JSON.parse(win.stdout).hookSpecificOutput.additionalContext;
assert.match(winContext, /WIN:/);
assert.match(winContext, /signal=win/);
assert.match(winContext, /note-win-procedure/);

const assistantOnly = runScenario([
  { type: "assistant", message: { role: "assistant", content: "The user said this is a perfect result." } }
]);
assert.equal(assistantOnly.status, 0, assistantOnly.stderr);
assert.equal(assistantOnly.stdout, "", "assistant/tool text must not masquerade as user feedback");

console.log("feedback-nudge.test: explicit user wins/friction trigger; non-user text stays silent");
