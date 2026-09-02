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

function runScenario(records, { ledgerEnabled = false, runtime = "codex" } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-feedback-hook-test-"));
  const workspace = path.join(tempRoot, "workspace");
  const transcripts = path.join(tempRoot, "transcripts");
  const pluginData = path.join(tempRoot, "plugin-data");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(transcripts, { recursive: true });
  if (ledgerEnabled) {
    const preferences = path.join(workspace, ".aieb", "retrospective", "preferences.json");
    fs.mkdirSync(path.dirname(preferences), { recursive: true });
    fs.writeFileSync(
      preferences,
      `${JSON.stringify({ schema_version: 1, enabled: true, capture_mode: "pointer-only" }, null, 2)}\n`,
      "utf8"
    );
  }
  const prior = path.join(transcripts, "prior.jsonl");
  const current = path.join(transcripts, "current.jsonl");
  fs.writeFileSync(prior, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  fs.writeFileSync(current, "", "utf8");

  try {
    const result = spawnSync(process.execPath, [hook], {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({ hook_event_name: "SessionStart", cwd: workspace, transcript_path: current, session_id: "current" }),
      env: { ...process.env, AIEB_RUNTIME: runtime, PLUGIN_ROOT: root, CLAUDE_PLUGIN_ROOT: root, PLUGIN_DATA: pluginData }
    });
    const ledgerPath = path.join(workspace, ".aieb", "retrospective", "ledger.jsonl");
    const ledger = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, "utf8") : "";
    return { result, ledger };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const { result: friction, ledger: disabledLedger } = runScenario([
  { type: "user", message: { role: "user", content: "That skill got it wrong. I had to redo it." } }
]);
assert.equal(friction.status, 0, friction.stderr);
const frictionContext = JSON.parse(friction.stdout).hookSpecificOutput.additionalContext;
assert.match(frictionContext, /FRICTION:/);
assert.match(frictionContext, /report_skill_feedback/);
assert.match(frictionContext, /note-friction-procedure/);
assert.doesNotMatch(frictionContext, /That skill got it wrong/, "transcript text must never enter hook output");
assert.equal(disabledLedger, "", "missing consent must not create a ledger");

const { result: win, ledger: enabledLedger } = runScenario(
  [{ payload: { type: "user_message", message: "This worked first try. I used it as-is." } }],
  { ledgerEnabled: true, runtime: "claude" }
);
assert.equal(win.status, 0, win.stderr);
const winContext = JSON.parse(win.stdout).hookSpecificOutput.additionalContext;
assert.match(winContext, /WIN:/);
assert.match(winContext, /signal=win/);
assert.match(winContext, /note-win-procedure/);
assert.match(winContext, /pointer-only evidence locally/);
assert.match(enabledLedger, /"runtime":"claude"/);
assert.doesNotMatch(enabledLedger, /This worked first try|transcript_path/);

const { result: assistantOnly } = runScenario([
  { type: "assistant", message: { role: "assistant", content: "The user said this is a perfect result." } }
]);
assert.equal(assistantOnly.status, 0, assistantOnly.stderr);
assert.equal(assistantOnly.stdout, "", "assistant/tool text must not masquerade as user feedback");

console.log("feedback-nudge.test: explicit user wins/friction trigger; non-user text stays silent");
