#!/usr/bin/env node
/**
 * setup-license.mjs — one-shot license setup used by the /setup-aieb command.
 *
 * What it does, in order:
 *   1. Sanitizes the pasted license key (strips whitespace + surrounding quotes).
 *   2. Activates the key against the AIEB server's /activate endpoint
 *      (reusing an existing activation for this key/machine when one is saved,
 *      so re-running setup never burns extra Lemon Squeezy activations).
 *   3. Writes the key user-globally to ~/.aieb-mcp/config.json — the connector
 *      defined at the plugin level reads it from there in EVERY folder.
 *   4. Verifies end to end with a real get_skill fetch
 *      (meta-create-skill / SKILL.md) through the licensed /mcp endpoint.
 *
 * Key input (first match wins): AIEB_SETUP_KEY env, AIEB_LICENSE_KEY env,
 * --key <value>, or the first positional argument.
 *
 * Output: ONE JSON line on stdout. The full key is never printed — only the
 * last 4 characters as key_hint. Exit 0 = key accepted and saved (see
 * "verified" for the end-to-end check); exit 1 = not set up.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import tls from "node:tls";

// Trust the OS certificate store (VPN / AV / corporate-proxy CAs) — same fix as
// the proxy, so setup succeeds on the same machines the proxy will run on.
try {
  if (tls.getCACertificates && tls.setDefaultCACertificates) {
    const sys = tls.getCACertificates("system");
    if (sys && sys.length) {
      tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...sys]);
    }
  }
} catch {
  // best-effort only
}

const DEFAULT_MCP_URL = "https://aieb-gated-mcp.vercel.app/mcp";
const DEFAULT_RENEW_URL = "https://chiefleverageofficer.com/aieb";

const stateDir = path.join(os.homedir(), ".aieb-mcp");
const statePath = path.join(stateDir, "activation.json");
const configPath = path.join(stateDir, "config.json");

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

function isUsableKey(value) {
  return Boolean(value) && !/^PASTE([_\-]|$)/i.test(value) && !/YOUR[_\- ]?LICENSE/i.test(value);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function pickKeyInput() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--key");
  const flagValue = flagIndex !== -1 ? args[flagIndex + 1] : "";
  const positional = args.find((a, i) => !a.startsWith("--") && (flagIndex === -1 || i !== flagIndex + 1));
  return (
    process.env.AIEB_SETUP_KEY ||
    process.env.AIEB_LICENSE_KEY ||
    flagValue ||
    positional ||
    ""
  );
}

function keyHint(key) {
  return key.length > 4 ? `…${key.slice(-4)}` : "…";
}

function fail(payload) {
  process.stdout.write(JSON.stringify({ ok: false, ...payload }) + "\n");
  process.exit(1);
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const licenseKey = cleanValue(pickKeyInput());
  if (!isUsableKey(licenseKey)) {
    fail({
      kind: "no_key",
      reason:
        "No license key was provided (or it still looks like a placeholder). Paste the key from your Lemon Squeezy receipt email."
    });
  }

  const existingConfig = (await readJsonFile(configPath)) || {};
  const mcpUrl =
    cleanValue(process.env.AIEB_MCP_URL) ||
    cleanValue(existingConfig.AIEB_MCP_URL || existingConfig.mcp_url) ||
    DEFAULT_MCP_URL;
  const activateUrl =
    cleanValue(process.env.AIEB_ACTIVATE_URL) ||
    cleanValue(existingConfig.AIEB_ACTIVATE_URL) ||
    mcpUrl.replace(/\/mcp\/?$/, "/activate");

  const fp = fingerprint(licenseKey);
  const state = (await readJsonFile(statePath)) || {};
  const machine = os.hostname() || "buyer-device";
  const localId = state[fp]?.local_id || crypto.randomUUID();

  async function activate() {
    let response;
    let payload;
    try {
      ({ response, payload } = await fetchJson(
        activateUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${licenseKey}`
          },
          body: JSON.stringify({ instance_name: `AIEB MCP - ${machine} - ${localId.slice(0, 8)}` })
        },
        15000
      ));
    } catch (error) {
      fail({
        kind: "network",
        reason: `Can't reach the AI Employee Builder server — check your internet, VPN, or firewall, then try again. (${error.message})`
      });
    }

    if (response.ok && payload.instance_id) return payload.instance_id;

    if (response.status >= 400 && response.status < 500) {
      fail({
        kind: "rejected",
        reason: payload.reason || "The license key wasn't accepted.",
        renew_url: payload.renew_url || DEFAULT_RENEW_URL,
        key_hint: keyHint(licenseKey)
      });
    }

    fail({
      kind: "server",
      reason: `The AI Employee Builder server had a problem answering (HTTP ${response.status}). Try again in a minute.`
    });
  }

  async function saveState(instanceId) {
    state[fp] = {
      local_id: localId,
      instance_id: instanceId,
      activated_at: state[fp]?.instance_id === instanceId && state[fp]?.activated_at
        ? state[fp].activated_at
        : new Date().toISOString()
    };
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  async function saveConfig() {
    const merged = { ...existingConfig, license_key: licenseKey, saved_at: new Date().toISOString() };
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf8");
  }

  async function verify(instanceId) {
    try {
      const { payload } = await fetchJson(
        mcpUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${licenseKey}`,
            "X-AIEB-Instance-ID": instanceId
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "get_skill",
              arguments: {
                skill_id: "meta-create-skill",
                path: "SKILL.md",
                task_context: "/setup-aieb verification fetch"
              }
            }
          })
        },
        20000
      );
      if (payload.error) {
        return {
          ok: false,
          kind: "rejected",
          reason: payload.error.message || "The server declined the request.",
          renew_url: payload.error.data?.renew_url || ""
        };
      }
      const text = payload.result?.content?.[0]?.text || "";
      if (payload.result?.isError || !text) {
        return { ok: false, kind: "server", reason: text || "The server returned an empty skill." };
      }
      return { ok: true, bytes: text.length };
    } catch (error) {
      return {
        ok: false,
        kind: "network",
        reason: `Activated and saved, but the verification fetch couldn't reach the server. (${error.message})`
      };
    }
  }

  // Reuse a saved activation for this key when one exists (re-running /setup-aieb
  // must not consume another Lemon Squeezy activation slot).
  let instanceId = state[fp]?.instance_id || "";
  let reusedActivation = Boolean(instanceId);
  if (!instanceId) {
    instanceId = await activate();
  }
  await saveState(instanceId);
  await saveConfig();

  let verification = await verify(instanceId);
  if (!verification.ok && verification.kind === "rejected" && reusedActivation) {
    // The saved activation may be stale (deactivated instance). Try ONE fresh
    // activation; if the key itself is bad, activate() exits with the reason.
    instanceId = await activate();
    reusedActivation = false;
    await saveState(instanceId);
    verification = await verify(instanceId);
  }

  if (!verification.ok && verification.kind === "rejected") {
    fail({
      kind: "rejected",
      reason: verification.reason,
      renew_url: verification.renew_url || DEFAULT_RENEW_URL,
      key_hint: keyHint(licenseKey)
    });
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      verified: verification.ok,
      ...(verification.ok ? {} : { verify_note: verification.reason }),
      reused_activation: reusedActivation,
      key_hint: keyHint(licenseKey),
      config_path: configPath,
      mcp_url: mcpUrl
    }) + "\n"
  );
  process.exit(0);
}

main().catch((error) => {
  fail({ kind: "unexpected", reason: error.message });
});
