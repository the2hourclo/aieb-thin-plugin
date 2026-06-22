import readline from "node:readline";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const remoteUrl = process.env.AIEB_MCP_URL || "https://aieb-gated-mcp.vercel.app/mcp";
const activateUrl = process.env.AIEB_ACTIVATE_URL || remoteUrl.replace(/\/mcp\/?$/, "/activate");
const licenseKey = process.env.AIEB_LICENSE_KEY || "";
const explicitInstanceId = process.env.AIEB_INSTANCE_ID || "";
const stateDir = path.join(os.homedir(), ".aieb-mcp");
const statePath = path.join(stateDir, "activation.json");

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return {};
  }
}

async function writeState(state) {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function getInstanceId() {
  if (!licenseKey) return "";
  if (explicitInstanceId) return explicitInstanceId;

  const key = fingerprint(licenseKey);
  const state = await readState();
  if (state[key]?.instance_id) return state[key].instance_id;

  const machine = os.hostname() || "buyer-device";
  const localId = state[key]?.local_id || crypto.randomUUID();
  const response = await fetch(activateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${licenseKey}`
    },
    body: JSON.stringify({
      instance_name: `AIEB MCP - ${machine} - ${localId.slice(0, 8)}`
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.instance_id) {
    throw new Error(payload.reason || `AIEB activation failed with HTTP ${response.status}`);
  }

  state[key] = {
    local_id: localId,
    instance_id: payload.instance_id,
    activated_at: new Date().toISOString()
  };
  await writeState(state);
  return payload.instance_id;
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResponse(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message
    }
  };
}

async function forward(message) {
  const instanceId = await getInstanceId();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  if (licenseKey) headers.Authorization = `Bearer ${licenseKey}`;
  if (instanceId) headers["X-AIEB-Instance-ID"] = instanceId;

  const response = await fetch(remoteUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(message)
  });

  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return errorResponse(message.id, -32000, `Remote AIEB MCP returned HTTP ${response.status}.`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeMessage(errorResponse(null, -32700, error.message));
    return;
  }

  try {
    const response = await forward(message);
    if (response) writeMessage(response);
  } catch (error) {
    console.error(`AIEB MCP proxy error: ${error.message}`);
    writeMessage(errorResponse(message.id, -32000, error.message));
  }
});

console.error(`AIEB MCP proxy forwarding to ${remoteUrl}`);
