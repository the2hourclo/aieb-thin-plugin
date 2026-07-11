#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cases = [
  ["claude-code", "claude_code"],
  ["Claude Cowork", "cowork"],
  ["codex-cli", "codex"],
  ["Claude Desktop", "claude_desktop"],
  ["mystery-client", "unknown"]
];

for (const [clientName, expectedSurface] of cases) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push({ surface: req.headers["x-aieb-client-surface"], body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "get_skill", inputSchema: { type: "object" } }] } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "aieb-proxy-smoke-"));
  const child = spawn(process.execPath, [fileURLToPath(new URL("./aieb-mcp-proxy.mjs", import.meta.url))], {
    env: { ...process.env, HOME: home, USERPROFILE: home, AIEB_MCP_URL: `http://127.0.0.1:${port}/mcp` },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: clientName, version: "test" } } }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
  const deadline = Date.now() + 5000;
  while (!received.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  child.kill();
  await exited;
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(home, { recursive: true, force: true });
  assert.ok(stdout.includes('"id":1'), `${clientName}: initialize response missing`);
  assert.equal(received[0]?.surface, expectedSurface, `${clientName}: wrong normalized surface`);
}

console.log("aieb proxy client-surface smoke passed");
