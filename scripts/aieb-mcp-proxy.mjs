import readline from "node:readline";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import tls from "node:tls";

// Trust the OS certificate store (VPN / AV / corporate-proxy CAs) so HTTPS works
// behind TLS-inspecting networks (Norton, Zscaler, corporate proxies). Done in
// CODE so it works no matter how Node was launched (NODE_OPTIONS isn't always
// honored by the process that spawns this proxy).
let caNote = "";
try {
  if (tls.getCACertificates && tls.setDefaultCACertificates) {
    const sys = tls.getCACertificates("system");
    if (sys && sys.length) {
      tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...sys]);
      caNote = ` (+${sys.length} system CAs)`;
    }
  }
} catch (error) {
  caNote = ` (system-CA load failed: ${error.message})`;
}

const DEFAULT_MCP_URL = "https://aieb-gated-mcp.vercel.app/mcp";
const DEFAULT_RENEW_URL = "https://chiefleverageofficer.com/aieb";

const explicitInstanceId = process.env.AIEB_INSTANCE_ID || "";
const stateDir = path.join(os.homedir(), ".aieb-mcp");
const statePath = path.join(stateDir, "activation.json");
const configPath = path.join(stateDir, "config.json");

// Strip whitespace and any surrounding quotes a buyer pasted along with a value
// (keys arrive as  "ABCD-…" ,  'ABCD-…' , or with stray spaces).
function cleanValue(raw) {
  let value = String(raw ?? "").trim();
  while (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

// The old workspace .mcp.json shipped with a PASTE_… placeholder. If that leaked
// into the env it must never shadow the real key stored globally.
function isUsableKey(value) {
  return Boolean(value) && !/^PASTE([_\-]|$)/i.test(value) && !/YOUR[_\- ]?LICENSE/i.test(value);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

// License + URL resolution. Order for the key: env AIEB_LICENSE_KEY, then the
// user-global ~/.aieb-mcp/config.json ({ "license_key": "…" }). The config file
// may also carry an AIEB_MCP_URL override. Once a key is found the settings are
// cached; while the key is missing we re-read the file on every message so a
// /setup-aieb run mid-session gets picked up without a restart.
let settingsCache = null;
async function getSettings() {
  if (settingsCache && settingsCache.licenseKey) return settingsCache;

  const cfg = (await readJsonFile(configPath)) || {};
  const envKey = cleanValue(process.env.AIEB_LICENSE_KEY);
  const fileKey = cleanValue(cfg.license_key);
  const licenseKey = isUsableKey(envKey) ? envKey : isUsableKey(fileKey) ? fileKey : "";

  const remoteUrl =
    cleanValue(process.env.AIEB_MCP_URL) ||
    cleanValue(cfg.AIEB_MCP_URL || cfg.mcp_url) ||
    DEFAULT_MCP_URL;
  const activateUrl =
    cleanValue(process.env.AIEB_ACTIVATE_URL) ||
    cleanValue(cfg.AIEB_ACTIVATE_URL) ||
    remoteUrl.replace(/\/mcp\/?$/, "/activate");

  settingsCache = { licenseKey, remoteUrl, activateUrl };
  return settingsCache;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function readState() {
  return (await readJsonFile(statePath)) || {};
}

async function writeState(state) {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

const NO_KEY_MESSAGE =
  "No AI Employee Builder license key is set up on this machine yet. " +
  "Run /setup-aieb once (your license key is in your Lemon Squeezy receipt email) " +
  "and the connector will work in every folder.";

function networkError(error) {
  const cause = error?.cause ? error.cause.code || error.cause.message || String(error.cause) : "";
  return new Error(
    "Can't reach the AI Employee Builder server — check your internet, VPN, or firewall, " +
      `then try again. (${error.message}${cause ? ": " + cause : ""})`
  );
}

// A key the server REJECTED is remembered for 5 minutes so a broken key doesn't
// hammer /activate on every single message. Success is already cached on disk
// (activation.json); network blips are NOT cached, so they retry immediately.
// Concurrent messages share ONE in-flight activation (single-flight), so even a
// burst of parallel requests produces a single /activate call.
const ACTIVATION_FAILURE_TTL_MS = 5 * 60 * 1000;
const activationFailures = new Map(); // key fingerprint -> { message, until }
const activationInFlight = new Map(); // key fingerprint -> Promise<instance_id>

async function getInstanceId(settings) {
  const { licenseKey, activateUrl } = settings;
  if (!licenseKey) throw new Error(NO_KEY_MESSAGE);
  if (explicitInstanceId) return explicitInstanceId;

  const key = fingerprint(licenseKey);

  const recentFailure = activationFailures.get(key);
  if (recentFailure && Date.now() < recentFailure.until) {
    throw new Error(recentFailure.message);
  }
  activationFailures.delete(key);

  const state = await readState();
  if (state[key]?.instance_id) return state[key].instance_id;

  let inFlight = activationInFlight.get(key);
  if (!inFlight) {
    inFlight = activate(key, licenseKey, activateUrl);
    activationInFlight.set(key, inFlight);
    inFlight.catch(() => {}).finally(() => activationInFlight.delete(key));
  }
  return inFlight;
}

async function activate(key, licenseKey, activateUrl) {
  const state = await readState();
  const machine = os.hostname() || "buyer-device";
  const localId = state[key]?.local_id || crypto.randomUUID();

  let response;
  try {
    response = await fetch(activateUrl, {
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
  } catch (error) {
    // Transport failure — not a verdict on the key. Never cached.
    throw networkError(error);
  }

  const payload = await response.json().catch(() => ({}));

  if (response.ok && payload.instance_id) {
    state[key] = {
      local_id: localId,
      instance_id: payload.instance_id,
      activated_at: new Date().toISOString()
    };
    await writeState(state);
    return payload.instance_id;
  }

  if (response.status >= 400 && response.status < 500) {
    // The server looked at the key and said no — relay its reason AND the
    // renewal link it sent back.
    const reason = payload.reason || "the license key wasn't accepted.";
    const renewUrl = payload.renew_url || DEFAULT_RENEW_URL;
    const message =
      `Your AI Employee Builder license wasn't accepted — ${reason} ` +
      `Double-check the key in your Lemon Squeezy receipt email and run /setup-aieb to re-enter it, ` +
      `or renew/manage your license here: ${renewUrl}`;
    activationFailures.set(key, { message, until: Date.now() + ACTIVATION_FAILURE_TTL_MS });
    throw new Error(message);
  }

  // 5xx / malformed success — server-side trouble, transient, not cached.
  throw new Error(
    `The AI Employee Builder server had a problem answering (HTTP ${response.status}). ` +
      "Please try again in a minute."
  );
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
  const settings = await getSettings();
  const instanceId = await getInstanceId(settings);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${settings.licenseKey}`
  };
  if (instanceId) headers["X-AIEB-Instance-ID"] = instanceId;

  let response;
  try {
    response = await fetch(settings.remoteUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(message)
    });
  } catch (error) {
    throw networkError(error);
  }

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

getSettings().then(
  (settings) =>
    console.error(
      `AIEB MCP proxy ready (node ${process.version})${caNote} -> ${settings.remoteUrl}` +
        (settings.licenseKey ? "" : " [no license key yet — run /setup-aieb]")
    ),
  () => console.error(`AIEB MCP proxy ready (node ${process.version})${caNote}`)
);
