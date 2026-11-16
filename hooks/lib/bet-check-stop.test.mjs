// node --test hooks/lib/bet-check-stop.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bet_check_stop.mjs");

function setup({ autoBets = true, writes = [], text = "" } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-bet-stop-"));
  const ws = path.join(tmp, "ws");
  fs.mkdirSync(path.join(ws, "digital-assets", "systems-thinking"), { recursive: true });
  if (autoBets !== null)
    fs.writeFileSync(path.join(ws, "digital-assets", "systems-thinking", "SETTINGS.md"), `- 2026-11-16 · auto bets · ${autoBets ? "yes" : "no"} · x\n`);
  const content = writes.map((f) => ({ type: "tool_use", name: "Edit", input: { file_path: path.join(ws, f) } }));
  if (text) content.push({ type: "text", text });
  const transcript = path.join(tmp, "t.jsonl");
  fs.writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { content } }) + "\n");
  return { tmp, ws, transcript, data: path.join(tmp, "data") };
}

function stop(ctx, extra = {}) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s1", transcript_path: ctx.transcript, cwd: ctx.ws, ...extra }),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_DATA: ctx.data }
  });
}

test("stops once when a file changed and no bet was saved", () => {
  const ctx = setup({ writes: ["pages/booking.md"] });
  const first = stop(ctx);
  assert.equal(first.status, 0);
  assert.equal(JSON.parse(first.stdout).decision, "block");
  assert.equal(stop(ctx).stdout, "", "never stops twice in one chat");
});

test("silent when BETS.md was written, 'No bet:' was said, or only digital-assets changed", () => {
  assert.equal(stop(setup({ writes: ["pages/a.md", "digital-assets/systems-thinking/BETS.md"] })).stdout, "");
  assert.equal(stop(setup({ writes: ["pages/a.md"], text: "No bet: typo fix" })).stdout, "");
  assert.equal(stop(setup({ writes: ["digital-assets/notes.md"] })).stdout, "");
});

test("silent without the auto bets yes, or while a stop is being handled", () => {
  assert.equal(stop(setup({ autoBets: false, writes: ["pages/a.md"] })).stdout, "");
  assert.equal(stop(setup({ autoBets: null, writes: ["pages/a.md"] })).stdout, "");
  assert.equal(stop(setup({ writes: ["pages/a.md"] }), { stop_hook_active: true }).stdout, "");
});

test("bad stdin exits 0 silently", () => {
  const r = spawnSync(process.execPath, [hook], { input: "{nope", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
