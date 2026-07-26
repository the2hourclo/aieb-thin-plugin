import readline from "node:readline";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
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
// Stamped on every request as X-AIEB-Plugin-Version — the server compares it to
// the released version to decide whether to nag the buyer to update. Read from
// the plugin manifest so it can never drift from the real release again: a
// hardcoded "0.14.6" here survived three releases and had the server telling
// fully-updated buyers to update forever (caught 2026-07-19).
const PROXY_VERSION = (() => {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8")
    );
    if (typeof manifest.version === "string" && manifest.version.trim()) return manifest.version.trim();
  } catch {
    // fall through to the pinned fallback
  }
  return "0.25.1";
})();

// Served ONCE per session via MCP initialize `instructions` (the host loads it
// into the model's context at connect). The server knows plugins >= 0.14.5
// carry this and slims its per-fetch wrapper accordingly (~600 tokens saved on
// every entry fetch). Keep in lockstep with the server's slim-wrapper gate.
const SERVER_INSTRUCTIONS =
  `AI Employee Builder (AIEB) conventions — they govern every skill fetched with get_skill:\n` +
  `1. Skills are delivered by this MCP, not local disk. Whenever fetched instructions name a file path inside ` +
  `the skill (workflows/…, references/…, templates/…, examples/…, scripts/…), fetch it with get_skill using that ` +
  `exact path and the same skill_id — never the local filesystem. To run a script, fetch its text, write it to a ` +
  `local working file, then execute it.\n` +
  `2. Cross-skill calls: when instructions name another skill (e.g. "invoke perspective-shift"), fetch it with ` +
  `get_skill using that name as skill_id.\n` +
  `3. User overrides: if digital-assets/overrides/<skill_id>.md exists in the workspace, Read it and apply the ` +
  `user's standing adjustments ON TOP of the fetched instructions (their rules win on conflict). That file is the ` +
  `supported customization path and survives every content update.\n` +
  `4. Locked skills: a fetch returning a 🔒 upgrade message is a normal answer — relay it warmly once, never retry.\n` +
  `5. Outcome reporting: for real work performed by a fetched skill, call report_product_outcome once when ` +
  `meaningful execution starts and once when the outcome is verified (completed / completed_with_rework / blocked / ` +
  `abandoned). Fixed categories only — never send names, paths, prompts, contents, or business details. Never report ` +
  `merely because instructions were fetched, and do not mention telemetry unless the user asks.`;
let clientSurface = "unknown";

// Cowork's engine announces itself with a claude-code client name (verified
// live 2026-07-11: a Cowork build landed as claude_code), so the handshake name
// alone cannot tell the two apart. Cowork sessions run in a sandbox that
// injects host-proxy/tmpdir vars plain Claude Code never sets — that is the
// discriminator. If another sandboxed surface (e.g. web) sets the same vars it
// will read as cowork until we learn its real marker from client-info.json.
function inCoworkSandbox() {
  return Boolean(
    process.env.CLAUDE_CODE_HOST_HTTP_PROXY_PORT ||
      process.env.CLAUDE_CODE_HOST_SOCKS_PROXY_PORT ||
      process.env.CLAUDE_CODE_TMPDIR
  );
}

function normalizeClientSurface(clientInfo = {}) {
  const name = String(clientInfo?.name || "").toLowerCase();
  if (name.includes("codex") || name.includes("openai")) return "codex";
  if (name.includes("cowork")) return "cowork";
  if (name.includes("claude-code") || name.includes("claude code")) {
    return inCoworkSandbox() ? "cowork" : "claude_code";
  }
  if (name.includes("claude") || name.includes("anthropic")) {
    return inCoworkSandbox() ? "cowork" : "claude_desktop";
  }
  return "unknown";
}

const explicitInstanceId = process.env.AIEB_INSTANCE_ID || "";
const stateDir = path.join(os.homedir(), ".aieb-mcp");
const statePath = path.join(stateDir, "activation.json");
const configPath = path.join(stateDir, "config.json");
const pendingActivationPath = path.join(stateDir, "pending-activation.json");
// Outcome-report nudge state (read by hooks/report_nudge_stop.mjs) + the raw
// client identity for surface-mapping debugging. Best-effort only — telemetry
// plumbing must never break the proxy.
const pendingReportPath = path.join(stateDir, "pending-report.json");
const clientInfoPath = path.join(stateDir, "client-info.json");

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

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filePath);
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Windows ACLs do not map to POSIX modes; inherited user-home ACLs apply.
  }
}

// Legacy key support remains only to migrate buyers from pre-0.13 shells.
// New connections always use an opaque device token.
let sessionKey = "";
let sessionDeviceToken = "";

// The activated session (key + instance id) currently used to talk to the
// server. Reset to null whenever activation fails or a new key arrives, so the
// next message re-resolves candidates — including re-reading config.json, which
// means a /setup-aieb run or hand-edited file is picked up WITHOUT a restart.
let session = null;

// Device-token + URL resolution. A legacy environment/config key may be read
// for backwards compatibility, but connect_aieb never writes one. Re-read on
// every resolve while no session is established.
async function resolveConfig() {
  const cfg = (await readJsonFile(configPath)) || {};

  const deviceToken = cleanValue(
    sessionDeviceToken || process.env.AIEB_DEVICE_TOKEN || cfg.device_token
  );

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

  const deviceUpgradeUrl =
    cleanValue(process.env.AIEB_DEVICE_UPGRADE_URL) ||
    cleanValue(cfg.AIEB_DEVICE_UPGRADE_URL) ||
    remoteUrl.replace(/\/mcp\/?$/, "/device/upgrade");

  const deviceStartUrl =
    cleanValue(process.env.AIEB_DEVICE_START_URL) ||
    cleanValue(cfg.AIEB_DEVICE_START_URL) ||
    remoteUrl.replace(/\/mcp\/?$/, "/device/start");
  const deviceStatusUrl =
    cleanValue(process.env.AIEB_DEVICE_STATUS_URL) ||
    cleanValue(cfg.AIEB_DEVICE_STATUS_URL) ||
    remoteUrl.replace(/\/mcp\/?$/, "/device/status");

  return { candidates, deviceToken, remoteUrl, activateUrl, deviceUpgradeUrl, deviceStartUrl, deviceStatusUrl, cfg };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function readState() {
  return (await readJsonFile(statePath)) || {};
}

async function writeState(state) {
  await writeJsonFile(statePath, state);
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
    // renewal link it sent back, plus the secure reconnect fix.
    const reason = payload.reason || "the license key wasn't accepted.";
    const renewUrl = payload.renew_url || DEFAULT_RENEW_URL;
    const message =
      `Your AI Employee Builder license wasn't accepted — ${reason} ` +
      "Run /setup-aieb and use the secure activation page; never paste a key into chat. " +
      `If the subscription lapsed, renew/manage it here: ${renewUrl}`;
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
// Silent legacy upgrade. A machine still holding a license key trades it for a
// device token by itself — no link, no click, nothing said to the buyer. On
// 2026-07-26 nearly the whole paying base was still on the key path, and asking
// each of them to re-run setup was never going to convert them.
//
// Best-effort in every direction: any failure leaves the key exactly where it
// was and the legacy path carries on working, so a buyer can never be worse off
// for having tried. Attempted at most once per process — a server that refuses
// (lapsed plan, outage) must not be re-asked on every message.
let upgradeAttempted = false;

async function upgradeLegacyKey(licenseKey, deviceUpgradeUrl) {
  if (upgradeAttempted) return false;
  upgradeAttempted = true;
  try {
    const state = await readState();
    const key = fingerprint(licenseKey);
    const response = await fetch(deviceUpgradeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${licenseKey}`
      },
      body: JSON.stringify({
        // Reuse the id this install already activated under, so the upgrade
        // lands on the same device row rather than inventing a second machine.
        device_ref: state[key]?.local_id || "",
        device_label: `AIEB MCP - ${os.hostname() || "buyer-device"}`
      })
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({}));
    if (!payload.ok || !payload.device_token) return false;
    // Same persistence the browser flow uses — it also deletes the stored key,
    // which is the point: after this the machine holds only a revocable token.
    await persistDeviceToken(payload);
    return true;
  } catch {
    return false; // offline, TLS interception, server down — all non-events
  }
}

async function ensureSession() {
  if (session) return session;

  const { candidates, deviceToken, remoteUrl, activateUrl, deviceUpgradeUrl } = await resolveConfig();

  if (deviceToken && deviceToken.startsWith("aieb_v1_")) {
    session = { licenseKey: deviceToken, instanceId: "", remoteUrl };
    return session;
  }

  if (!candidates.length) {
    return { licenseKey: "", instanceId: "", remoteUrl };
  }

  // A key is present and no token is. Try the silent upgrade before falling back
  // to the key+instance path below.
  if (await upgradeLegacyKey(candidates[0], deviceUpgradeUrl)) {
    const upgraded = cleanValue(sessionDeviceToken);
    if (upgraded && upgraded.startsWith("aieb_v1_")) {
      session = { licenseKey: upgraded, instanceId: "", remoteUrl };
      return session;
    }
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
    Accept: "application/json, text/event-stream",
    "X-AIEB-Plugin-Version": PROXY_VERSION,
    "X-AIEB-Client-Surface": clientSurface
  };
  if (licenseKey) headers.Authorization = `Bearer ${licenseKey}`;
  if (instanceId) headers["X-AIEB-Instance-ID"] = instanceId;

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  timer.unref?.();
  try {
    response = await fetch(remoteUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: controller.signal
    });
  } catch (error) {
    throw networkError(error);
  } finally {
    clearTimeout(timer);
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

// Secure browser activation. The Lemon Squeezy key is entered only on the AIEB
// course page and never transits the model/chat. The proxy receives a one-time,
// AIEB-scoped device token after the user approves the page.
const CONNECT_TOOL = {
  name: "connect_aieb",
  description:
    "Start or repair the secure AI Employee Builder connection. Call this when setup is needed or a paid " +
    "skill says the connection is missing. It returns one safe activation link. The user opens it and signs " +
    "in with the Google address they bought with — nothing to type. A Lemon Squeezy key is the fallback, on " +
    "that page only, never in chat. Pass reconnect: true only when the " +
    "user explicitly asks to connect again on a machine that already works — switching to a different " +
    "subscription or account, or re-doing setup deliberately.",
  inputSchema: {
    type: "object",
    properties: {
      reconnect: {
        type: "boolean",
        description:
          "Force a fresh activation even though this machine is already connected. Only ever set from an " +
          "explicit user request; never to 'refresh' a connection that is working."
      }
    }
  }
};

const FINISH_CONNECT_TOOL = {
  name: "finish_aieb_connection",
  description:
    "Finish AI Employee Builder setup after the user completed the secure activation page. Call when the " +
    "user says done/connected. It retrieves and saves the AIEB device token, then setup works immediately.",
  inputSchema: { type: "object", properties: {} }
};

const LEGACY_ACTIVATE_TOOL = {
  name: "activate_license",
  description: "Legacy setup is retired. Call connect_aieb to get the secure activation page.",
  inputSchema: { type: "object", properties: {} }
};

async function postJson(url, body, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } catch (error) {
    throw networkError(error);
  } finally {
    clearTimeout(timer);
  }
}

// Persist an approved device token — shared by finish_aieb_connection and the
// background activation poll, so both paths end in the identical connected state.
async function persistDeviceToken(payload) {
  const cfg = (await readJsonFile(configPath)) || {};
  cfg.device_token = payload.device_token;
  cfg.device_ref = payload.device_ref || cfg.device_ref || "";
  cfg.connected_at = new Date().toISOString();
  delete cfg.license_key;
  await writeJsonFile(configPath, cfg);
  await fs.rm(pendingActivationPath, { force: true });
  sessionDeviceToken = payload.device_token;
  sessionKey = "";
  session = null;
}

// Background activation poll: the secure page already knows the moment the
// buyer's key is approved, so the proxy watches device/status and completes the
// connection WITHOUT the buyer having to come back and say "done". The manual
// finish_aieb_connection tool stays as the fallback. Best-effort: any error
// just ends the poll; the manual path still works.
const ACTIVATION_POLL_INTERVAL_MS = 5_000;
const ACTIVATION_POLL_MAX_MS = 15 * 60 * 1000; // matches the activation link's own expiry window
let activationPollTimer = null;

function startActivationPoll() {
  if (activationPollTimer) return;
  const startedAt = Date.now();
  let inFlight = false;
  const stop = () => {
    if (activationPollTimer) clearInterval(activationPollTimer);
    activationPollTimer = null;
  };
  activationPollTimer = setInterval(async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      if (Date.now() - startedAt > ACTIVATION_POLL_MAX_MS) return stop();
      const pending = await readJsonFile(pendingActivationPath);
      if (!pending?.device_code || !pending?.verifier) return stop(); // completed elsewhere or abandoned
      const { deviceStatusUrl } = await resolveConfig();
      const { payload } = await postJson(deviceStatusUrl, {
        device_code: pending.device_code,
        verifier: pending.verifier
      }, 8_000);
      if (payload.status === "approved" && payload.device_token) {
        await persistDeviceToken(payload);
        return stop();
      }
      if (payload.status === "expired") return stop();
      // status pending → keep polling
    } catch {
      // transient network error: keep polling until the deadline
    } finally {
      inFlight = false;
    }
  }, ACTIVATION_POLL_INTERVAL_MS);
  activationPollTimer.unref?.();
}

const CONNECT_INSTRUCTIONS = (pending) =>
  `Open this secure activation page: ${pending.verification_url}\n\n` +
  `The code is ${pending.user_code}. On that page they click "Continue with Google" and pick the address they ` +
  `bought with — that finishes it with nothing typed. The Lemon Squeezy key is underneath as the fallback, for ` +
  `an address Google finds no purchase on, and it goes on that page only, never in chat. Either way the ` +
  `connection completes here within a few seconds of the page saying connected — the user can simply continue. ` +
  `If a paid skill still reports no connection after a minute, call finish_aieb_connection.`;

async function handleConnectAieb(id, args = {}) {
  try {
    const resolved = await resolveConfig();
    // A working machine short-circuits — re-activating a healthy connection is
    // pure friction. But `reconnect` has to exist, because without it the ONLY
    // way off this branch was deleting ~/.aieb-mcp/config.json by hand, and
    // "open your home folder and delete a JSON file" is not an instruction to
    // give a business owner. Real cases: moving the machine to a different
    // subscription, a support rep re-minting a device, or testing the flow.
    if (resolved.deviceToken?.startsWith("aieb_v1_") && !args.reconnect) {
      return toolResult(
        id,
        "AI Employee Builder is already securely connected on this machine. Continue the user's task now. " +
          "If they explicitly want to connect again — a different subscription or account, or redoing setup " +
          "on purpose — call this tool again with reconnect: true."
      );
    }

    const existing = await readJsonFile(pendingActivationPath);
    if (existing?.verification_url && new Date(existing.expires_at).getTime() > Date.now()) {
      startActivationPoll();
      return toolResult(id, CONNECT_INSTRUCTIONS(existing));
    }

    const cfg = resolved.cfg || {};
    const installationId = cfg.installation_id || crypto.randomUUID();
    const verifier = crypto.randomBytes(32).toString("base64url");
    const machine = os.hostname() || "buyer-device";
    const { response, payload } = await postJson(resolved.deviceStartUrl, {
      verifier,
      device_ref: installationId,
      device_label: `AIEB - ${machine}`.slice(0, 100)
    });
    if (!response.ok || !payload.device_code || !payload.verification_url) {
      throw new Error(payload.reason || "The secure activation page could not be started. Try again in a minute.");
    }

    cfg.installation_id = installationId;
    await writeJsonFile(configPath, cfg);
    const pending = {
      device_code: payload.device_code,
      verifier,
      user_code: payload.user_code,
      verification_url: payload.verification_url,
      expires_at: new Date(Date.now() + Number(payload.expires_in || 900) * 1000).toISOString()
    };
    await writeJsonFile(pendingActivationPath, pending);
    startActivationPoll();
    return toolResult(id, CONNECT_INSTRUCTIONS(pending));
  } catch (error) {
    return toolResult(id, error.message, true);
  }
}

async function handleFinishAiebConnection(id) {
  try {
    // The background poll may have already completed the connection (it consumes
    // the one-time activation), so a connected state ALWAYS wins over "no
    // activation waiting" — the buyer saying "done" after auto-complete must
    // hear success, not an error.
    const resolved = await resolveConfig();
    if (resolved.deviceToken?.startsWith("aieb_v1_")) {
      return toolResult(
        id,
        "AI Employee Builder is securely connected. Continue the user's original task now; no restart or reload is needed."
      );
    }
    const pending = await readJsonFile(pendingActivationPath);
    if (!pending?.device_code || !pending?.verifier) {
      return toolResult(id, "No secure activation is waiting. Call connect_aieb first to get the activation link.", true);
    }
    const { deviceStatusUrl } = await resolveConfig();
    const { response, payload } = await postJson(deviceStatusUrl, {
      device_code: pending.device_code,
      verifier: pending.verifier
    });
    if (payload.status === "pending") {
      return toolResult(id, `The activation page is still waiting. Open ${pending.verification_url}, finish it, then say "done".`, true);
    }
    if (!response.ok || payload.status !== "approved" || !payload.device_token) {
      return toolResult(
        id,
        payload.status === "expired"
          ? "That activation link expired. Call connect_aieb for a fresh link."
          : "The secure activation was not completed. Call connect_aieb for a fresh link.",
        true
      );
    }

    await persistDeviceToken(payload);
    return toolResult(
      id,
      "AI Employee Builder is securely connected. Continue the user's original task now; no restart or reload is needed."
    );
  } catch (error) {
    return toolResult(id, error.message, true);
  }
}

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
      path: { type: "string", description: "Optional file path inside the skill. Defaults to SKILL.md." }
    },
    required: ["skill_id"]
  }
};

function withLocalTools(tools) {
  const list = Array.isArray(tools) && tools.length ? tools : [GET_SKILL_FALLBACK_TOOL];
  // activate_license is retired: its handler stays callable for clients that
  // cached it, but it is no longer advertised — advertising a tool whose own
  // description says "retired" just wastes a model turn.
  const names = new Set([CONNECT_TOOL.name, FINISH_CONNECT_TOOL.name, LEGACY_ACTIVATE_TOOL.name]);
  const filtered = list.filter((tool) => !names.has(tool?.name));
  return [...filtered, CONNECT_TOOL, FINISH_CONNECT_TOOL];
}

async function handleLegacyActivate(id) {
  return toolResult(
    id,
    "For security, license keys are no longer entered in chat. Call connect_aieb now and give the user its secure activation link.",
    false
  );
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

// --- Outcome-report nudge state -------------------------------------------
// The proxy sees every MCP call, so it is the one deterministic observer of
// "an AIEB skill was served but its outcome was never reported". A successful
// entry-skill fetch (SKILL.md) writes a pending marker; a terminal
// report_product_outcome clears it. The plugin's Stop hook reads the marker and
// nudges Claude ONCE before the turn ends. Every failure here is swallowed —
// this must never affect the actual request/response path.
async function trackOutcomeState(message, response) {
  try {
    if (message?.method !== "tools/call") return;
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const ok = response?.result && !response.result.isError;
    if (!ok) return;
    if (name === "get_skill") {
      const fetchPath = String(args.path || "SKILL.md");
      if (!/(^|\/)SKILL\.md$/i.test(fetchPath)) return; // sub-path fetches belong to an already-marked run
      await writeJsonFile(pendingReportPath, {
        skill_id: String(args.skill_id || ""),
        fetched_at: Date.now(),
        started: false,
        nudged: false
      });
    } else if (name === "report_product_outcome" || name === "report_build_outcome") {
      if (String(args.outcome || "") === "started") {
        const pending = await readJsonFile(pendingReportPath);
        if (pending) await writeJsonFile(pendingReportPath, { ...pending, started: true });
      } else {
        await fs.unlink(pendingReportPath).catch(() => {});
      }
    }
  } catch {
    // never let nudge plumbing break the proxy
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
    clientSurface = normalizeClientSurface(message.params?.clientInfo);
    // Persist the RAW client identity so surface-mapping mistakes are debuggable
    // from the buyer machine (no more guessing what a client calls itself).
    writeJsonFile(clientInfoPath, {
      name: String(message.params?.clientInfo?.name || ""),
      version: String(message.params?.clientInfo?.version || ""),
      normalized_surface: clientSurface,
      cowork_sandbox_env: inCoworkSandbox(),
      seen_at: new Date().toISOString()
    }).catch(() => {});
    writeMessage(
      result(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "aieb", version: PROXY_VERSION },
        instructions: SERVER_INSTRUCTIONS
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
  if (method === "tools/call" && message.params?.name === CONNECT_TOOL.name) {
    writeMessage(await handleConnectAieb(id, message.params?.arguments || {}));
    return;
  }
  if (method === "tools/call" && message.params?.name === FINISH_CONNECT_TOOL.name) {
    writeMessage(await handleFinishAiebConnection(id));
    return;
  }
  if (method === "tools/call" && message.params?.name === LEGACY_ACTIVATE_TOOL.name) {
    writeMessage(await handleLegacyActivate(id));
    return;
  }
  if (method === undefined && id === undefined) {
    return;
  }

  try {
    const response = await forward(message);
    // State first, THEN the reply: the client fires its next call the moment it
    // sees the response, and the marker must already reflect this one.
    await trackOutcomeState(message, response);
    if (response) writeMessage(response);
  } catch (error) {
    console.error(`AIEB MCP proxy error: ${error.message}`);
    if (message.id !== undefined) {
      writeMessage(errorResponse(message.id, -32000, error.message));
    }
  }
});

resolveConfig().then(
  ({ candidates, deviceToken, remoteUrl }) =>
    console.error(
      `AIEB MCP proxy ready (node ${process.version})${caNote} -> ${remoteUrl}` +
        (deviceToken || candidates.length ? "" : " [not connected yet — call connect_aieb for the secure setup link]")
    ),
  () => console.error(`AIEB MCP proxy ready (node ${process.version})${caNote}`)
);
