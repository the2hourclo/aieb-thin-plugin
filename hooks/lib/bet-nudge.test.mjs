// node --test hooks/lib/bet-nudge.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bet_nudge.mjs");

function run(settings, source = "startup") {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-bet-nudge-"));
  if (settings !== null) {
    fs.mkdirSync(path.join(ws, "digital-assets", "systems-thinking"), { recursive: true });
    fs.writeFileSync(path.join(ws, "digital-assets", "systems-thinking", "SETTINGS.md"), settings);
  }
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source, cwd: ws }),
    encoding: "utf8"
  });
  fs.rmSync(ws, { recursive: true, force: true });
  return r;
}

test("silent in a folder with no SETTINGS.md", () => {
  const r = run(null);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("silent without an auto bets yes", () => {
  assert.equal(run('- 2026-11-16 · files · yes · "ok" (owner)\n').stdout, "");
});

test("reminds when the newest auto bets line is yes", () => {
  const r = run('- 2026-11-16 · auto bets · yes · … · "yes" (owner)\n');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /Quiet save/);
});

test("a later no switches it off; compact is skipped", () => {
  assert.equal(run('- 2026-11-16 · auto bets · yes · x\n- 2026-11-20 · auto bets · no · "stop"\n').stdout, "");
  assert.equal(run('- 2026-11-16 · auto bets · yes · x\n', "compact").stdout, "");
});

test("bad stdin exits 0 silently", () => {
  const r = spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
