#!/usr/bin/env node
// report-nudge-smoke.mjs — local smoke for the outcome-report nudge chain:
//   proxy marker lifecycle (entry fetch → pending, terminal report → cleared,
//   failed fetch → no marker), client-info persistence, cowork sandbox-env
//   surface detection, and the Stop hook's one-nudge/expiry/fail-open rules.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const proxyPath = fileURLToPath(new URL("./aieb-mcp-proxy.mjs", import.meta.url));
const hookPath = fileURLToPath(new URL("../hooks/report_nudge_stop.mjs", import.meta.url));

function rpc(id, method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

async function runProxySession({ env = {}, exchanges }) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const msg = JSON.parse(body);
      received.push({ surface: req.headers["x-aieb-client-surface"], msg });
      const name = msg.params?.name;
      const failing = name === "get_skill" && msg.params?.arguments?.skill_id === "fail-me";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: failing
            ? { content: [{ type: "text", text: "denied" }], isError: true }
            : { content: [{ type: "text", text: "ok" }] }
        })
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "aieb-nudge-smoke-"));
  const child = spawn(process.execPath, [proxyPath], {
    env: { ...process.env, HOME: home, USERPROFILE: home, AIEB_MCP_URL: `http://127.0.0.1:${port}/mcp`, ...env },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.stdout.setEncoding("utf8");
  let responses = 0;
  child.stdout.on("data", (chunk) => {
    responses += chunk.split("\n").filter((l) => l.trim()).length;
  });
  // Real MCP clients await each tool result before the next call — mirror that,
  // otherwise the fetch/report messages race and the marker asserts get flaky.
  async function sendAndWait(line, expected) {
    child.stdin.write(line);
    const deadline = Date.now() + 8000;
    while (responses < expected && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }
  await sendAndWait(rpc(1, "initialize", { clientInfo: { name: "claude-code", version: "t" } }), 1);
  let id = 1;
  let expected = 1;
  for (const [method, params] of exchanges) await sendAndWait(rpc(++id, method, params), ++expected);
  // markers are written after the response is sent — give the async write a beat
  await new Promise((r) => setTimeout(r, 300));
  child.kill();
  await exited;
  await new Promise((resolve) => server.close(resolve));
  return { home, received, stateDir: path.join(home, ".aieb-mcp") };
}

async function readJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// --- 1. entry fetch writes the marker; terminal report clears it ---
{
  const { home, stateDir } = await runProxySession({
    exchanges: [
      ["tools/call", { name: "get_skill", arguments: { skill_id: "meta-create-skill", path: "SKILL.md" } }]
    ]
  });
  const pending = await readJson(path.join(stateDir, "pending-report.json"));
  assert.ok(pending && pending.skill_id === "meta-create-skill" && pending.nudged === false, "marker not written on entry fetch");
  const info = await readJson(path.join(stateDir, "client-info.json"));
  assert.ok(info && info.name === "claude-code" && info.normalized_surface === "claude_code", "client-info not persisted");
  await fs.rm(home, { recursive: true, force: true });
  console.log("PASS entry fetch writes marker + client-info persisted");
}
{
  const { home, stateDir } = await runProxySession({
    exchanges: [
      ["tools/call", { name: "get_skill", arguments: { skill_id: "meta-create-skill", path: "SKILL.md" } }],
      ["tools/call", { name: "report_product_outcome", arguments: { skill_id: "meta-create-skill", activity_type: "built_artifact", output_type: "skill", outcome: "started", friction: "none" } }],
      ["tools/call", { name: "report_product_outcome", arguments: { skill_id: "meta-create-skill", activity_type: "built_artifact", output_type: "skill", outcome: "completed", friction: "none" } }]
    ]
  });
  const pending = await readJson(path.join(stateDir, "pending-report.json"));
  assert.equal(pending, null, "terminal report did not clear the marker");
  await fs.rm(home, { recursive: true, force: true });
  console.log("PASS started marks, terminal report clears the marker");
}
// --- 2. failed fetch and sub-path fetch write no marker ---
{
  const { home, stateDir } = await runProxySession({
    exchanges: [
      ["tools/call", { name: "get_skill", arguments: { skill_id: "fail-me", path: "SKILL.md" } }],
      ["tools/call", { name: "get_skill", arguments: { skill_id: "meta-create-skill", path: "workflows/create-skill.md" } }]
    ]
  });
  const pending = await readJson(path.join(stateDir, "pending-report.json"));
  assert.equal(pending, null, "failed/sub-path fetch wrote a marker");
  await fs.rm(home, { recursive: true, force: true });
  console.log("PASS failed fetch and sub-path fetch write no marker");
}
// --- 3. cowork sandbox env flips the surface for claude-code names ---
{
  const { home, received } = await runProxySession({
    env: { CLAUDE_CODE_TMPDIR: "/tmp/claude" },
    exchanges: [["tools/call", { name: "find_skill", arguments: { query: "x" } }]]
  });
  assert.equal(received[0]?.surface, "cowork", `sandbox env not detected: ${received[0]?.surface}`);
  await fs.rm(home, { recursive: true, force: true });
  console.log("PASS cowork sandbox env overrides claude-code name");
}

// --- 4. Stop hook: nudges once, then never again; stale/absent markers pass ---
async function runHook(home, stdinPayload) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.once("exit", (code) => resolve({ code, out }));
    child.stdin.write(JSON.stringify(stdinPayload));
    child.stdin.end();
  });
}
{
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "aieb-hook-smoke-"));
  const dir = path.join(home, ".aieb-mcp");
  await fs.mkdir(dir, { recursive: true });
  const marker = path.join(dir, "pending-report.json");

  // absent marker → silent pass
  let r = await runHook(home, {});
  assert.ok(r.code === 0 && !r.out, "hook talked with no marker present");

  // fresh marker → block once
  await fs.writeFile(marker, JSON.stringify({ skill_id: "meta-create-skill", fetched_at: Date.now(), started: false, nudged: false }));
  r = await runHook(home, {});
  const blocked = JSON.parse(r.out);
  assert.equal(blocked.decision, "block", "fresh marker did not block");
  assert.ok(blocked.reason.includes("report_product_outcome"), "block reason missing tool name");

  // second stop → pass (nudged stamped)
  r = await runHook(home, {});
  assert.ok(!r.out, "hook nudged twice");

  // stop_hook_active → pass even with fresh un-nudged marker
  await fs.writeFile(marker, JSON.stringify({ skill_id: "x", fetched_at: Date.now(), started: false, nudged: false }));
  r = await runHook(home, { stop_hook_active: true });
  assert.ok(!r.out, "hook blocked while stop_hook_active");

  // stale marker → pass
  await fs.writeFile(marker, JSON.stringify({ skill_id: "x", fetched_at: Date.now() - 7 * 60 * 60 * 1000, started: false, nudged: false }));
  r = await runHook(home, {});
  assert.ok(!r.out, "hook nudged on a stale marker");

  // corrupt marker → fail open
  await fs.writeFile(marker, "not json");
  r = await runHook(home, {});
  assert.ok(r.code === 0 && !r.out, "hook failed closed on corrupt marker");

  await fs.rm(home, { recursive: true, force: true });
  console.log("PASS stop hook: one nudge, honors stop_hook_active, expiry, fail-open");
}

console.log("\nreport-nudge smoke passed");
