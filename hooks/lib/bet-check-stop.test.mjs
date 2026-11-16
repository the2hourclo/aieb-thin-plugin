// node --test hooks/lib/bet-check-stop.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bet_check_stop.mjs");
const BET = "- 2026-11-16 · NEW · B-2026-11-16-faq · BET: FAQ lifts bookings | WRONG IF: under 6% | READ ON: 2026-11-30\n";

// calls: [{ name, input, error }] — each becomes a tool_use plus its tool_result.
function setup({ autoBets = true, calls = [], text = "", unanswered = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-bet-stop-"));
  const ws = path.join(tmp, "ws");
  fs.mkdirSync(path.join(ws, "digital-assets", "systems-thinking"), { recursive: true });
  if (autoBets !== null)
    fs.writeFileSync(path.join(ws, "digital-assets", "systems-thinking", "SETTINGS.md"), `- 2026-11-16 · auto bets · ${autoBets ? "yes" : "no"} · x\n`);
  const lines = [];
  calls.forEach((c, i) => {
    const input = { ...c.input };
    if (input.file_path && !path.isAbsolute(input.file_path)) input.file_path = path.join(ws, input.file_path);
    const content = [{ type: "tool_use", id: `t${i}`, name: c.name, input }];
    if (i === 0 && text) content.push({ type: "text", text });
    lines.push({ type: "assistant", message: { content } });
    if (!unanswered)
      lines.push({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, is_error: !!c.error, content: c.error ? "Error: denied" : "ok" }] } });
  });
  if (!calls.length && text) lines.push({ type: "assistant", message: { content: [{ type: "text", text }] } });
  const transcript = path.join(tmp, "t.jsonl");
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { tmp, ws, transcript, data: path.join(tmp, "data") };
}

const edit = (file_path, extra = {}) => ({ name: "Edit", input: { file_path, new_string: "x", ...extra } });

function stop(ctx, extra = {}) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s1", transcript_path: ctx.transcript, cwd: ctx.ws, ...extra }),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_DATA: ctx.data }
  });
}
const blocks = (r) => r.stdout !== "" && JSON.parse(r.stdout).decision === "block";

test("stops once when a file changed and no bet was saved", () => {
  const ctx = setup({ calls: [edit("pages/booking.md")] });
  const first = stop(ctx);
  assert.equal(first.status, 0);
  assert.ok(blocks(first));
  assert.equal(stop(ctx).stdout, "", "never stops twice in one chat");
});

test("silent when a NEW bet line was appended to the ledger, or 'No bet:' was said", () => {
  assert.equal(stop(setup({ calls: [edit("pages/a.md"), edit("digital-assets/systems-thinking/BETS.md", { new_string: BET })] })).stdout, "");
  assert.equal(stop(setup({ calls: [edit("pages/a.md")], text: "No bet: typo fix" })).stdout, "");
  assert.equal(stop(setup({ calls: [edit("pages/a.md"), { name: "Bash", input: { command: `printf '${BET.trim()}' >> digital-assets/systems-thinking/BETS.md` } }] })).stdout, "");
});

test("a BETS.md edit with no NEW bet line, or a BETS.md elsewhere, doesn't count as a saved bet", () => {
  assert.ok(blocks(stop(setup({ calls: [edit("pages/a.md"), edit("digital-assets/systems-thinking/BETS.md", { new_string: "# Bets\n" })] }))));
  assert.ok(blocks(stop(setup({ calls: [edit("pages/a.md"), edit("notes/BETS.md", { new_string: BET })] }))));
});

test("a failed bet write doesn't count as a saved bet", () => {
  assert.ok(blocks(stop(setup({ calls: [edit("pages/a.md"), { ...edit("digital-assets/systems-thinking/BETS.md", { new_string: BET }), error: true }] }))));
});

test("only bookkeeping is skipped: other digital-assets and .claude/skills changes count", () => {
  assert.equal(stop(setup({ calls: [edit("digital-assets/systems-thinking/REVIEWS.md"), edit(".claude/settings.local.json")] })).stdout, "");
  assert.ok(blocks(stop(setup({ calls: [edit("digital-assets/offers/workshop.md")] }))));
  assert.ok(blocks(stop(setup({ calls: [edit(".claude/skills/my-skill/SKILL.md")] }))));
});

test("shell commands that write files count; read-only ones don't", () => {
  assert.ok(blocks(stop(setup({ calls: [{ name: "Bash", input: { command: "echo hi > pages/a.md" } }] }))));
  assert.ok(blocks(stop(setup({ calls: [{ name: "PowerShell", input: { command: "Set-Content -Path pages/a.md -Value hi" } }] }))));
  assert.equal(stop(setup({ calls: [{ name: "Bash", input: { command: "ls pages 2>&1 | grep a > /dev/null" } }] })).stdout, "");
});

test("a denied or unanswered edit doesn't count as a change", () => {
  assert.equal(stop(setup({ calls: [{ ...edit("pages/a.md"), error: true }] })).stdout, "");
  assert.equal(stop(setup({ calls: [edit("pages/a.md")], unanswered: true })).stdout, "");
});

test("silent without the auto bets yes, or while a stop is being handled", () => {
  assert.equal(stop(setup({ autoBets: false, calls: [edit("pages/a.md")] })).stdout, "");
  assert.equal(stop(setup({ autoBets: null, calls: [edit("pages/a.md")] })).stdout, "");
  assert.equal(stop(setup({ calls: [edit("pages/a.md")] }), { stop_hook_active: true }).stdout, "");
});

test("bad stdin exits 0 silently", () => {
  const r = spawnSync(process.execPath, [hook], { input: "{nope", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
