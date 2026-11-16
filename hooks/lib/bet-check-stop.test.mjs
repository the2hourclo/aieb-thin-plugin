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
// The chat "began" 10 minutes ago (record timestamps). `before` files are dated
// an hour before that; `during` files are written now, i.e. by this chat.
function setup({ autoBets = true, calls = [], text = "", unanswered = false, before = {}, during = {}, after = null, stamped = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-bet-stop-"));
  const ws = path.join(tmp, "ws");
  fs.mkdirSync(path.join(ws, "digital-assets", "systems-thinking"), { recursive: true });
  const began = Date.now() - 10 * 60000;
  const put = (rel, body) => {
    const f = path.join(ws, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
    return f;
  };
  const old = new Date(began - 60 * 60000);
  if (autoBets !== null)
    fs.utimesSync(put("digital-assets/systems-thinking/SETTINGS.md", `- 2026-11-16 · auto bets · ${autoBets ? "yes" : "no"} · x\n`), old, old);
  for (const [rel, body] of Object.entries(before)) fs.utimesSync(put(rel, body), old, old);
  // folders made by setup are dated before the chat too, so only this chat's moves show
  const age = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) age(path.join(d, e.name)); fs.utimesSync(d, old, old); };
  age(ws);
  if (after) after(ws);
  for (const [rel, body] of Object.entries(during)) put(rel, body);
  const timestamp = stamped ? new Date(began).toISOString() : undefined;
  const lines = [];
  calls.forEach((c, i) => {
    const input = { ...c.input };
    if (input.file_path && !path.isAbsolute(input.file_path)) input.file_path = path.join(ws, input.file_path);
    const content = [{ type: "tool_use", id: `t${i}`, name: c.name, input }];
    if (i === 0 && text) content.push({ type: "text", text });
    lines.push({ type: "assistant", timestamp, message: { content } });
    if (!unanswered)
      lines.push({ type: "user", timestamp, message: { content: [{ type: "tool_result", tool_use_id: `t${i}`, is_error: !!c.error, content: c.error ? "Error: denied" : "ok" }] } });
  });
  if (!calls.length && text) lines.push({ type: "assistant", timestamp, message: { content: [{ type: "text", text }] } });
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
  // a shell append that really changed BETS.md in this chat, with today's NEW bet
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const bet = BET.replace("2026-11-16", today);
  assert.equal(stop(setup({ calls: [edit("pages/a.md"), { name: "Bash", input: { command: "python append_bet.py" } }],
    during: { "digital-assets/systems-thinking/BETS.md": bet } })).stdout, "");
});

test("reading BETS.md is not saving a bet (Astra round 2)", () => {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const grep = { name: "Bash", input: { command: "grep '· NEW ·.*BET:' digital-assets/systems-thinking/BETS.md" } };
  // the ledger already holds a NEW bet but wasn't touched in this chat
  assert.ok(blocks(stop(setup({ calls: [edit("pages/a.md"), grep], before: { "digital-assets/systems-thinking/BETS.md": BET.replace("2026-11-16", today) } }))));
  // touched in this chat, but only an older NEW bet is in it (say a CLOSED line was appended)
  assert.ok(blocks(stop(setup({ calls: [edit("pages/a.md"), grep], during: { "digital-assets/systems-thinking/BETS.md": BET.replace("2026-11-16", "2020-01-01") + "- x · CLOSED · y\n" } }))));
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

test("a shell command counts by what changed on disk, not by its wording (Astra round 2)", () => {
  const py = { name: "Bash", input: { command: `python -c "from pathlib import Path; Path('pages/a.md').write_text('new')"` } };
  const readOnly = { name: "Bash", input: { command: `python -c "print(2 > 1)"` } };
  // wrote a page with no redirect in sight: stops
  assert.ok(blocks(stop(setup({ calls: [py], during: { "pages/a.md": "new" } }))));
  assert.ok(blocks(stop(setup({ calls: [{ name: "PowerShell", input: { command: "Set-Content -Path pages/a.md -Value hi" } }], during: { "pages/a.md": "hi" } }))));
  // a ">" that writes nothing, with older files on disk: silent
  assert.equal(stop(setup({ calls: [readOnly], before: { "pages/a.md": "old" } })).stdout, "");
  // changes only in bookkeeping or skipped folders: silent
  assert.equal(stop(setup({ calls: [py], during: { "node_modules/x/i.js": "1", ".git/HEAD": "x", "digital-assets/systems-thinking/bets-page.html": "<p>" } })).stdout, "");
  // no timestamps in the transcript: shell evidence can't be judged, so silent
  assert.equal(stop(setup({ calls: [py], during: { "pages/a.md": "new" }, stamped: false })).stdout, "");
});

test("shell changes Astra round 3 named: .claude/skills writes, deletes and renames count", () => {
  const sh = { name: "Bash", input: { command: "python tidy.py" } };
  assert.ok(blocks(stop(setup({ calls: [sh], during: { ".claude/skills/my-skill/SKILL.md": "x" } }))));
  assert.ok(blocks(stop(setup({ calls: [sh], before: { ".claude/skills/my-skill/SKILL.md": "x" },
    after: (ws) => fs.appendFileSync(path.join(ws, ".claude/skills/my-skill/SKILL.md"), "y") }))));
  // a page deleted: no file is newer, but its folder moved
  assert.ok(blocks(stop(setup({ calls: [sh], before: { "pages/a.md": "a", "pages/b.md": "b" },
    after: (ws) => fs.rmSync(path.join(ws, "pages/b.md")) }))));
  // a page renamed, keeping its old date
  assert.ok(blocks(stop(setup({ calls: [sh], before: { "pages/a.md": "a" },
    after: (ws) => fs.renameSync(path.join(ws, "pages/a.md"), path.join(ws, "pages/c.md")) }))));
  // a deleted top-level page counts too
  assert.ok(blocks(stop(setup({ calls: [sh], before: { "notes.md": "n" }, after: (ws) => fs.rmSync(path.join(ws, "notes.md")) }))));
  // .claude bookkeeping alone stays silent, even when the file is new
  assert.equal(stop(setup({ calls: [sh], before: { "pages/a.md": "a" }, during: { ".claude/settings.local.json": "{}" } })).stdout, "");
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
