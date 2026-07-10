#!/usr/bin/env node
/**
 * send_note.mjs - fire-and-forget sender for skill-feedback notes.
 *
 * Node port of send_note.py, and the PRIMARY sender: Node is guaranteed on
 * buyer machines because the plugin's connector runs on it; Python is not on
 * stock Windows. send_note.py stays as the fallback for the rare machine
 * where node is missing but python exists.
 *
 * Part of the CLO skill-telemetry pipeline. This is the ONE thing that ships
 * in the plugin and leaves a client's machine: it takes a single friction/win
 * note and POSTs it to a Google Form's formResponse endpoint, which collects
 * it in the creator's linked Google Sheet. No API key, no secret - the Google
 * Form submit URL is public and write-only, so there is nothing sensitive to
 * extract from the plugin.
 *
 * Design rules (these matter because it runs on other people's machines):
 *   - Node standard library ONLY (node:https). No npm install, no deps.
 *   - Fail-safe: every error is swallowed, it always exits 0, it NEVER
 *     blocks a session.
 *   - Consent gate is CLOSED by default. A user-invoked note command may grant
 *     one-shot consent with --consent-this-note; it never creates persistent
 *     consent and applies only to that single distilled note.
 *   - Kill-switch: honors env CLO_TELEMETRY_OFF and config {"enabled": false}.
 *   - Config-driven: the form URL and field->entry mapping live in
 *     config.json, so the same script works for any form. Nothing
 *     form-specific is hardcoded here.
 *
 * Usage:
 *   node send_note.mjs --note-file note.json
 *   node send_note.mjs --json '{"skill":"write","type":"Win","note":"nailed it"}'
 *   node send_note.mjs --skill write --type Win --note "nailed it"
 *   node send_note.mjs --note-file note.json --dry-run   # print payload, do not send
 */
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(HERE, "config.json");
const TIMEOUT_MS = 7000; // short, so a slow/blocked network never stalls a caller

// The note fields we know about. The form's field_map decides which get sent.
const KNOWN_FIELDS = [
  "skill", "type", "task", "what_happened", "why",
  "suggested_change", "where_in_skill", "impact",
  "install_id", "plugin_version"
];

// CLI flag -> note key (mirrors send_note.py's argparse dest names).
const FLAG_TO_KEY = {
  "--skill": "skill",
  "--type": "type",
  "--task": "task",
  "--what-happened": "what_happened",
  "--why": "why",
  "--suggested-change": "suggested_change",
  "--where-in-skill": "where_in_skill",
  "--impact": "impact",
  "--install-id": "install_id",
  "--plugin-version": "plugin_version"
};

function truthy(v) {
  return ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
}

function readJson(p) {
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = { note: {}, noteFile: null, json: null, dryRun: false, consentThisNote: false, config: DEFAULT_CONFIG_PATH };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--consent-this-note") {
      args.consentThisNote = true;
    } else if (a === "--note-file") {
      args.noteFile = argv[++i];
    } else if (a === "--json") {
      args.json = argv[++i];
    } else if (a === "--config") {
      args.config = argv[++i];
    } else if (Object.prototype.hasOwnProperty.call(FLAG_TO_KEY, a)) {
      args.note[FLAG_TO_KEY[a]] = argv[++i];
    }
    // unknown flags are ignored (fail-safe, never error out)
  }
  return args;
}

function postForm(actionUrl, body) {
  // node:https instead of fetch so this also runs on older Node versions -
  // the whole pipeline is fail-silent, but the primary path should work on
  // whatever Node the buyer's connector already runs.
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(actionUrl);
    } catch {
      resolve(null);
      return;
    }
    const lib = url.protocol === "http:" ? http : https;
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "clo-skill-telemetry/1.0"
        },
        timeout: TIMEOUT_MS
      },
      (res) => {
        res.resume(); // drain so the socket frees
        resolve(res.statusCode ?? null);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end(body);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --- Kill-switch (environment) - checked before doing any work ---
  if (truthy(process.env.CLO_TELEMETRY_OFF)) {
    console.log("[send_note] disabled via CLO_TELEMETRY_OFF - skipping.");
    return;
  }

  // --- Load config (fail-safe) ---
  const cfg = readJson(args.config);
  if (Object.keys(cfg).length === 0) {
    console.log("[send_note] no/invalid config.json - skipping.");
    return;
  }
  if (cfg.enabled === false) {
    console.log("[send_note] disabled in config - skipping.");
    return;
  }

  const actionUrl = String(cfg.form_action_url || "").trim();
  const fieldMap = cfg.field_map && typeof cfg.field_map === "object" ? cfg.field_map : {};
  if (!actionUrl || actionUrl.startsWith("REPLACE_") || Object.keys(fieldMap).length === 0) {
    console.log("[send_note] form not configured yet (form_action_url / field_map are placeholders) - skipping.");
    return;
  }

  // --- Consent gate (opt-in, CLOSED by default). Nothing leaves the machine
  //     unless the user explicitly granted consent. A MISSING install.json
  //     means the consent flow never ran => NOT opted in => skip silently.
  //     Creator/dev mode is an explicit env opt-in (CLO_TELEMETRY_DEV=1),
  //     never the absence of a file. ---
  const install = readJson(path.join(
    process.env.USERPROFILE || process.env.HOME || os.homedir(),
    ".clo-skill-telemetry", "install.json"
  ));
  if (!truthy(process.env.CLO_TELEMETRY_DEV) && !args.consentThisNote) {
    if (install.consent !== "granted") {
      console.log(`[send_note] not opted in (consent=${install.consent ?? "absent"}) - skipping.`);
      return;
    }
  }

  // --- Assemble the note from whichever input was provided ---
  let note = {};
  try {
    if (args.noteFile) {
      note = JSON.parse(fs.readFileSync(args.noteFile, "utf8"));
    } else if (args.json) {
      note = JSON.parse(args.json);
    } else {
      for (const k of KNOWN_FIELDS) {
        if (args.note[k] !== undefined) note[k] = args.note[k];
      }
    }
    if (!note || typeof note !== "object" || Array.isArray(note)) note = {};
  } catch (e) {
    console.log(`[send_note] could not read note (${e && e.message}) - skipping.`);
    return;
  }

  if (Object.keys(note).length === 0) {
    console.log("[send_note] empty note - nothing to send.");
    return;
  }

  // --- Fill install_id / plugin_version from config defaults if omitted ---
  // so callers (commands, reviewer agent) don't have to know them.
  for (const k of ["install_id", "plugin_version"]) {
    if (!note[k] && cfg[k]) note[k] = cfg[k];
  }
  if (!note.install_id && install.install_id) {
    note.install_id = install.install_id; // prefer the anonymous install id
  }

  // --- Map note keys -> Google Form entry IDs ---
  const payload = {};
  for (const [key, entryId] of Object.entries(fieldMap)) {
    if (key in note && note[key] !== null && note[key] !== undefined && String(note[key]) !== "") {
      payload[entryId] = String(note[key]);
    }
  }
  if (Object.keys(payload).length === 0) {
    console.log("[send_note] note had no mappable fields - skipping.");
    return;
  }

  const body = new URLSearchParams(payload).toString();

  if (args.dryRun) {
    console.log(`[send_note] DRY RUN - would POST to:\n  ${actionUrl}\n  ${JSON.stringify(payload, null, 2)}`);
    return;
  }

  // --- Fire-and-forget POST. Any failure is swallowed by design. ---
  const code = await postForm(actionUrl, body);
  if (code !== null) {
    // Google Forms returns HTTP 200 on a successful submit. Best-effort:
    // a non-200 is logged but never raised.
    console.log(`[send_note] sent (HTTP ${code}).`);
  } else {
    console.log("[send_note] send failed - ignored.");
  }
}

main()
  .catch(() => {
    // fail-safe: never surface an error, never block a session
  })
  .finally(() => {
    process.exitCode = 0;
  });
