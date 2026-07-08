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
const PROXY_VERSION = "0.12.0";

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

// A key that the activate_license tool validated THIS session. Top priority —
// it is the only candidate the server has explicitly accepted.
let sessionKey = "";

// The activated session (key + instance id) currently used to talk to the
// server. Reset to null whenever activation fails or a new key arrives, so the
// next message re-resolves candidates — including re-reading config.json, which
// means a /setup-aieb run or hand-edited file is picked up WITHOUT a restart.
let session = null;

// License + URL resolution. Key CANDIDATES in priority order: the key
// activate_license validated this session, then env AIEB_LICENSE_KEY, then the
// user-global ~/.aieb-mcp/config.json ({ "license_key": "…" }). The config file
// may also carry an AIEB_MCP_URL override. Re-read on every resolve while no
// session is established.
async function resolveConfig() {
  const cfg = (await readJsonFile(configPath)) || {};

  const candidates = [];
  for (const raw of [sessionKey, process.env.AIEB_LICENSE_KEY, cfg.license_key]) {
    const key = cleanValue(raw);
    if (isUsableKey(key) && !candidates.includes(key)) candidates.push(key);
  }

  const remoteUrl =
    cleanValue(process.env.AIEB_MCP_URL) ||
    cleanValue(cfg.AIEB_MCP_URL || cfg.mcp_url) ||
    DEFAULT_MCP_URL;
  const activateUrl =
    cleanValue(process.env.AIEB_ACTIVATE_URL) ||
    cleanValue(cfg.AIEB_ACTIVATE_URL) ||
    remoteUrl.replace(/\/mcp\/?$/, "/activate");

  return { candidates, remoteUrl, activateUrl };
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

function networkError(error) {
  const cause = error?.cause ? error.cause.code || error.cause.message || String(error.cause) : "";
  const wrapped = new Error(
    "Can't reach the AI Employee Builder server — check your internet, VPN, or firewall, " +
      `then try again. (${error.message}${cause ? ": " + cause : ""})`
  );
  wrapped.isNetwork = true;
  return wrapped;
}

// A key the server REJECTED is remembered for 5 minutes so a broken key doesn't
// hammer /activate on every single message. Success is already cached on disk
// (activation.json); network blips are NOT cached, so they retry immediately.
// Concurrent messages share ONE in-flight activation (single-flight), so even a
// burst of parallel requests produces a single /activate call.
const ACTIVATION_FAILURE_TTL_MS = 5 * 60 * 1000;
const activationFailures = new Map(); // key fingerprint -> { message, until }
const activationInFlight = new Map(); // key fingerprint -> Promise<instance_id>

async function getInstanceId(licenseKey, activateUrl) {
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
    // renewal link it sent back, plus the in-chat fix.
    const reason = payload.reason || "the license key wasn't accepted.";
    const renewUrl = payload.renew_url || DEFAULT_RENEW_URL;
    const message =
      `Your AI Employee Builder license wasn't accepted — ${reason} ` +
      "Ask the user to paste the license key from their Lemon Squeezy receipt email " +
      "here in chat, then call the activate_license tool with it (takes effect " +
      `immediately, no restart). If the subscription lapsed, renew/manage it here: ${renewUrl}`;
    activationFailures.set(key, { message, until: Date.now() + ACTIVATION_FAILURE_TTL_MS });
    throw new Error(message);
  }

  // 5xx / malformed success — server-side trouble, transient, not cached.
  throw new Error(
    `The AI Employee Builder server had a problem answering (HTTP ${response.status}). ` +
      "Please try again in a minute."
  );
}

// Resolve the session used to talk to the server. Tries each key candidate in
// priority order until one activates; a network failure aborts immediately (it
// is not a verdict on any key). With NO candidates the session is KEYLESS —
// requests forward without Authorization so the server's free tier answers and
// its own guidance (free map vs broken setup vs not-a-member) takes over.
async function ensureSession() {
  if (session) return session;

  const { candidates, remoteUrl, activateUrl } = await resolveConfig();

  if (!candidates.length) {
    return { licenseKey: "", instanceId: "", remoteUrl };
  }

  let lastError = null;
  for (const licenseKey of candidates) {
    try {
      const instanceId = await getInstanceId(licenseKey, activateUrl);
      session = { licenseKey, instanceId, remoteUrl };
      return session;
    } catch (error) {
      if (error.isNetwork) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
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

function toolResult(id, text, isError) {
  return result(id, { content: [{ type: "text", text }], isError: Boolean(isError) });
}

async function forward(message) {
  const { licenseKey, instanceId, remoteUrl } = await ensureSession();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  if (licenseKey) headers.Authorization = `Bearer ${licenseKey}`;
  if (instanceId) headers["X-AIEB-Instance-ID"] = instanceId;

  let response;
  try {
    response = await fetch(remoteUrl, {
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

// --- Local tools -----------------------------------------------------------

// The in-chat license setup. Handled entirely by THIS proxy (which runs on the
// buyer's real machine), so it works from sandboxed surfaces (Cowork, Desktop)
// where Claude's file tools can't reach the home directory. This is the primary
// setup path on every surface: the buyer pastes their key in chat, Claude calls
// this tool, done — no file editing, no restart.
const ACTIVATE_TOOL = {
  name: "activate_license",
  description:
    "Set up or fix the AI Employee Builder license on this machine. Call this whenever the user " +
    "provides their AIEB license key (it's in their Lemon Squeezy receipt email) — first-time setup, " +
    "a replaced key, or after any AIEB call failed with a license problem. Validates the key with the " +
    "server, saves it user-globally, and takes effect immediately — no restart, no file editing. " +
    "Never echo the full key back in chat; refer to it by its last 4 characters only.",
  inputSchema: {
    type: "object",
    properties: {
      license_key: {
        type: "string",
        description: "The buyer's AIEB license key exactly as pasted (stray quotes/spaces are fine)."
      }
    },
    required: ["license_key"]
  }
};

// Offline fallback for tools/list — the live server catalog is preferred, this
// is the floor that keeps the connector usable when the server is unreachable.
const GET_SKILL_FALLBACK_TOOL = {
  name: "get_skill",
  description:
    "Fetch and then FOLLOW an AI Employee Builder skill — its SKILL.md plus any workflows/references " +
    "it names. Call this whenever the user wants an AIEB job (business x-ray, create a skill/agent/hook/" +
    "command/MCP/plugin, onboarding, roadmap); pass the matching skill_id with path SKILL.md, then do " +
    "what it returns. Path defaults to SKILL.md; pass workflow/reference paths to fetch deeper files.",
  inputSchema: {
    type: "object",
    properties: {
      skill_id: { type: "string", description: "AIEB skill id, e.g. meta-create-skill or business-x-ray." },
      path: { type: "string", description: "Optional file path inside the skill. Defaults to SKILL.md." },
      task_context: { type: "string", description: "Optional short description of the task." }
    },
    required: ["skill_id"]
  }
};

// Always present the local activate_license tool alongside whatever catalog is
// in play (live or fallback) — it must be callable precisely when the license
// is broken, which is exactly when the live catalog may not load.
function withLocalTools(tools) {
  const list = Array.isArray(tools) && tools.length ? tools : [GET_SKILL_FALLBACK_TOOL];
  const filtered = list.filter((t) => t?.name !== ACTIVATE_TOOL.name);
  return [...filtered, ACTIVATE_TOOL];
}

async function handleActivateLicense(id, args) {
  const key = cleanValue(args?.license_key);
  if (!isUsableKey(key)) {
    return toolResult(
      id,
      "That doesn't look like a license key. Ask the user to copy the key from their Lemon Squeezy " +
        "receipt email (the 'License key' line) and paste it here, then call this tool again.",
      true
    );
  }

  // An explicit attempt deserves a fresh verdict — drop any cached rejection.
  activationFailures.delete(fingerprint(key));

  try {
    const { activateUrl } = await resolveConfig();
    await getInstanceId(key, activateUrl);

    // The server accepted the key — persist it user-globally so every folder
    // and every future session finds it, and adopt it right now.
    const cfg = (await readJsonFile(configPath)) || {};
    cfg.license_key = key;
    cfg.saved_at = new Date().toISOString();
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2), "utf8");

    sessionKey = key;
    session = null; // rebuild with the new key on the next call

    return toolResult(
      id,
      "License activated and saved. AI Employee Builder is ready on this machine — every folder, " +
        "no restart needed. Continue with the user's original task now (re-run the call that failed, " +
        "if there was one)."
    );
  } catch (error) {
    return toolResult(id, error.message, true);
  }
}

// How long we wait for the server's live catalog before falling back to the
// local floor. Bounded so a slow/down server can never stall the MCP handshake.
const TOOLS_LIST_TIMEOUT_MS = 2500;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// Ask the licensed server for its live tool catalog. Returns the tools array,
// or null on any failure (timeout, network, invalid license) so the caller can
// fall back locally. This is what lets catalog changes ship WITHOUT a reinstall.
async function fetchRemoteTools(message) {
  try {
    const payload = await forward(message);
    const tools = payload?.result?.tools;
    return Array.isArray(tools) && tools.length ? tools : null;
  } catch {
    return null;
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

  const { id, method } = message;

  // --- Answer the handshake LOCALLY so attaching never depends on the network
  // or on a license being set up yet ---
  if (method === "initialize") {
    writeMessage(
      result(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "aieb", version: PROXY_VERSION }
      })
    );
    return;
  }
  if (typeof method === "string" && method.startsWith("notifications/")) {
    return; // notifications get no response
  }
  if (method === "tools/list") {
    const remoteTools = await withTimeout(fetchRemoteTools(message), TOOLS_LIST_TIMEOUT_MS);
    writeMessage(result(id, { tools: withLocalTools(remoteTools) }));
    return;
  }
  if (method === "tools/call" && message.params?.name === ACTIVATE_TOOL.name) {
    writeMessage(await handleActivateLicense(id, message.params?.arguments));
    return;
  }
  if (method === undefined && id === undefined) {
    return;
  }

  try {
    const response = await forward(message);
    if (response) writeMessage(response);
  } catch (error) {
    console.error(`AIEB MCP proxy error: ${error.message}`);
    if (message.id !== undefined) {
      writeMessage(errorResponse(message.id, -32000, error.message));
    }
  }
});

resolveConfig().then(
  ({ candidates, remoteUrl }) =>
    console.error(
      `AIEB MCP proxy ready (node ${process.version})${caNote} -> ${remoteUrl}` +
        (candidates.length ? "" : " [no license key yet — paste it in chat and Claude will activate it]")
    ),
  () => console.error(`AIEB MCP proxy ready (node ${process.version})${caNote}`)
);
