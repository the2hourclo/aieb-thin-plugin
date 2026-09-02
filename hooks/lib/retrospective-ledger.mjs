// Cross-runtime, local-only retrospective ledger for AIEB workspaces.
//
// Hooks capture pointer-only events in the active runtime's inbox. A separate
// deterministic ingestion step normalizes those events into one shared AIEB
// ledger. Nothing in this module performs network I/O or edits a skill.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 1;
const RUNTIMES = new Set(["claude", "codex", "agent"]);
const SIGNALS = new Set(["friction", "win"]);
const STATES = new Set(["unreviewed", "reviewed", "proposed", "approved", "dismissed", "applied"]);
const SHARED_REL = [".aieb", "retrospective"];
const RUNTIME_REL = {
  claude: [".claude", ".state", "retrospective", "inbox.jsonl"],
  codex: [".codex", ".state", "retrospective", "inbox.jsonl"],
  agent: [".agents", ".state", "retrospective", "inbox.jsonl"]
};
const GITIGNORE_ENTRIES = [
  ".aieb/retrospective/",
  ".claude/.state/retrospective/",
  ".codex/.state/retrospective/",
  ".agents/.state/retrospective/"
];
const LOCAL_FIELDS = new Set(["schema_version", "event_id", "captured_at", "runtime", "signal", "source", "privacy"]);
const LOCAL_SOURCE_FIELDS = new Set(["session_ref", "transcript_path", "message_index"]);
const SHARED_FIELDS = new Set([
  "schema_version",
  "event_id",
  "captured_at",
  "ingested_at",
  "runtime",
  "signal",
  "state",
  "source",
  "privacy"
]);
const SHARED_SOURCE_FIELDS = new Set(["source_ref", "session_ref", "message_index"]);
const ARCHIVABLE_STATES = new Set(["reviewed", "dismissed", "applied"]);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function nowIso(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

function writeTextAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, value, "utf8");
  fs.renameSync(temp, file);
}

function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}

function ensurePrivacyGitignore(cwd) {
  const file = path.join(cwd, ".gitignore");
  let current = "";
  try { current = fs.readFileSync(file, "utf8"); } catch {}
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !existing.has(entry));
  if (missing.length === 0) return;
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  const heading = existing.has("# AIEB private retrospective state") ? "" : "# AIEB private retrospective state\n";
  fs.appendFileSync(file, `${separator}${heading}${missing.join("\n")}\n`, "utf8");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return { records: [], invalid: 0 };
  const records = [];
  let invalid = 0;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      invalid++;
    }
  }
  return { records, invalid };
}

function forbiddenContentKeys(value, pathPrefix = "") {
  if (!value || typeof value !== "object") return [];
  const violations = [];
  const forbidden = new Set(["content", "message", "prompt", "quote", "excerpt", "text"]);
  for (const [key, child] of Object.entries(value)) {
    const current = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (forbidden.has(key.toLowerCase())) violations.push(current);
    violations.push(...forbiddenContentKeys(child, current));
  }
  return violations;
}

function unexpectedKeys(value, allowed, pathPrefix) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [pathPrefix];
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${pathPrefix}.${key}`);
}

function validTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function detectRuntime(event = {}, env = process.env) {
  const explicit = String(env.AIEB_RUNTIME || event.runtime || event.platform || "").toLowerCase();
  if (/codex/.test(explicit)) return "codex";
  if (/claude|cowork/.test(explicit)) return "claude";
  if (/agent/.test(explicit)) return "agent";
  // Codex/Agent Plugins exposes PLUGIN_ROOT; Claude exposes CLAUDE_PLUGIN_ROOT.
  if (env.PLUGIN_ROOT) return "codex";
  if (env.CLAUDE_PLUGIN_ROOT) return "claude";
  return "agent";
}

export function retrospectivePaths(cwd, runtime = "agent") {
  const safeRuntime = RUNTIMES.has(runtime) ? runtime : "agent";
  const sharedRoot = path.join(cwd, ...SHARED_REL);
  return {
    sharedRoot,
    preferences: path.join(sharedRoot, "preferences.json"),
    ledger: path.join(sharedRoot, "ledger.jsonl"),
    archive: path.join(sharedRoot, "archive.jsonl"),
    syncState: path.join(sharedRoot, "sync-state.json"),
    lock: path.join(sharedRoot, ".ingest.lock"),
    inbox: path.join(cwd, ...RUNTIME_REL[safeRuntime])
  };
}

export function readRetrospectivePreferences(cwd) {
  const file = retrospectivePaths(cwd).preferences;
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value?.schema_version !== SCHEMA_VERSION) return { enabled: false, reason: "unsupported-schema" };
    if (value?.enabled !== true) return { enabled: false, reason: "disabled", value };
    if (value?.capture_mode !== "pointer-only") return { enabled: false, reason: "unsafe-capture-mode", value };
    return { enabled: true, reason: "enabled", value };
  } catch {
    return { enabled: false, reason: "missing-or-invalid" };
  }
}

export function validateLocalEvent(record) {
  const violations = [];
  for (const key of unexpectedKeys(record, LOCAL_FIELDS, "event")) {
    violations.push(`RETRO-002 unexpected local field is forbidden: ${key}`);
  }
  for (const key of unexpectedKeys(record?.source, LOCAL_SOURCE_FIELDS, "event.source")) {
    violations.push(`RETRO-002 unexpected local source field is forbidden: ${key}`);
  }
  if (record?.schema_version !== SCHEMA_VERSION) violations.push("RETRO-006 schema_version must be 1");
  if (!RUNTIMES.has(record?.runtime)) violations.push("RETRO-006 runtime is invalid");
  if (!SIGNALS.has(record?.signal)) violations.push("RETRO-006 signal is invalid");
  if (!validTimestamp(record?.captured_at)) violations.push("RETRO-006 captured_at is invalid");
  if (record?.privacy !== "pointer-only") violations.push("RETRO-002 privacy must be pointer-only");
  if (!/^[a-f0-9]{64}$/.test(record?.event_id || "")) violations.push("RETRO-004 event_id is invalid");
  if (!/^[a-f0-9]{64}$/.test(record?.source?.session_ref || "")) violations.push("RETRO-002 session_ref is invalid");
  if (typeof record?.source?.transcript_path !== "string" || !record.source.transcript_path) {
    violations.push("RETRO-002 local transcript pointer is missing");
  }
  if (!Number.isInteger(record?.source?.message_index) || record.source.message_index < 0) {
    violations.push("RETRO-002 message_index is invalid");
  }
  for (const key of forbiddenContentKeys(record)) violations.push(`RETRO-002 transcript content key is forbidden: ${key}`);
  return violations;
}

export function validateSharedEvent(record) {
  const violations = [];
  for (const key of unexpectedKeys(record, SHARED_FIELDS, "event")) {
    violations.push(`RETRO-002 unexpected shared field is forbidden: ${key}`);
  }
  for (const key of unexpectedKeys(record?.source, SHARED_SOURCE_FIELDS, "event.source")) {
    violations.push(`RETRO-002 unexpected shared source field is forbidden: ${key}`);
  }
  if (record?.schema_version !== SCHEMA_VERSION) violations.push("RETRO-006 schema_version must be 1");
  if (!RUNTIMES.has(record?.runtime)) violations.push("RETRO-006 runtime is invalid");
  if (!SIGNALS.has(record?.signal)) violations.push("RETRO-006 signal is invalid");
  if (!STATES.has(record?.state)) violations.push("RETRO-006 state is invalid");
  if (!validTimestamp(record?.captured_at)) violations.push("RETRO-006 captured_at is invalid");
  if (!validTimestamp(record?.ingested_at)) violations.push("RETRO-006 ingested_at is invalid");
  if (record?.privacy !== "pointer-only") violations.push("RETRO-002 privacy must be pointer-only");
  if (!/^[a-f0-9]{64}$/.test(record?.event_id || "")) violations.push("RETRO-004 event_id is invalid");
  if (!/^[a-f0-9]{64}$/.test(record?.source?.source_ref || "")) violations.push("RETRO-002 source_ref is invalid");
  if (!/^[a-f0-9]{64}$/.test(record?.source?.session_ref || "")) violations.push("RETRO-002 session_ref is invalid");
  if (!Number.isInteger(record?.source?.message_index) || record.source.message_index < 0) {
    violations.push("RETRO-002 message_index is invalid");
  }
  if ("transcript_path" in (record?.source || {})) violations.push("RETRO-002 shared ledger cannot store transcript_path");
  for (const key of forbiddenContentKeys(record)) violations.push(`RETRO-002 transcript content key is forbidden: ${key}`);
  return violations;
}

function acquireLock(file, now = Date.now()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    const fd = fs.openSync(file, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquired_at: now }));
    return () => {
      try { fs.closeSync(fd); } catch {}
      try { fs.unlinkSync(file); } catch {}
    };
  } catch (error) {
    if (error?.code !== "EEXIST") return null;
    try {
      const age = now - fs.statSync(file).mtimeMs;
      if (age > 30_000) {
        fs.unlinkSync(file);
        return acquireLock(file, now);
      }
    } catch {}
    return null;
  }
}

export function captureFeedbackEvents({ cwd, runtime, sessionId, transcriptPath, matches, now = new Date() }) {
  const preferences = readRetrospectivePreferences(cwd);
  if (!preferences.enabled) {
    return { enabled: false, captured: 0, reason: `RETRO-001 ${preferences.reason}` };
  }

  const safeRuntime = RUNTIMES.has(runtime) ? runtime : "agent";
  ensurePrivacyGitignore(cwd);
  const paths = retrospectivePaths(cwd, safeRuntime);
  // The prior transcript is the captured source. Prefer its stable local path
  // over the *current* hook session id so retries from later sessions keep the
  // same idempotency key.
  const sessionRef = sha256(transcriptPath || sessionId || "unknown-session");
  let captured = 0;
  const seen = new Set(readJsonl(paths.inbox).records.map((record) => record?.event_id).filter(Boolean));

  for (const match of matches || []) {
    if (!SIGNALS.has(match?.signal) || !Number.isInteger(match?.message_index) || match.message_index < 0) continue;
    const eventId = sha256(`${safeRuntime}\u0000${sessionRef}\u0000${match.message_index}\u0000${match.signal}`);
    if (seen.has(eventId)) continue;
    const record = {
      schema_version: SCHEMA_VERSION,
      event_id: eventId,
      captured_at: nowIso(now),
      runtime: safeRuntime,
      signal: match.signal,
      source: {
        session_ref: sessionRef,
        transcript_path: transcriptPath,
        message_index: match.message_index
      },
      privacy: "pointer-only"
    };
    if (validateLocalEvent(record).length > 0) continue;
    appendJsonLine(paths.inbox, record);
    seen.add(eventId);
    captured++;
  }
  return { enabled: true, captured, inbox: paths.inbox };
}

export function ingestRuntimeInboxes(cwd, now = new Date()) {
  const preferences = readRetrospectivePreferences(cwd);
  if (!preferences.enabled) return { enabled: false, ingested: 0, reason: `RETRO-001 ${preferences.reason}` };

  const paths = retrospectivePaths(cwd);
  ensurePrivacyGitignore(cwd);
  const release = acquireLock(paths.lock, now.getTime());
  if (!release) return { enabled: true, ingested: 0, reason: "RETRO-004 ingest-locked" };

  try {
    const current = readJsonl(paths.ledger);
    const archived = readJsonl(paths.archive);
    const validCurrent = current.records.filter((record) => validateSharedEvent(record).length === 0);
    const known = new Set(
      [...current.records, ...archived.records]
        .map((record) => record?.event_id)
        .filter((eventId) => /^[a-f0-9]{64}$/.test(eventId || ""))
    );
    const additions = [];
    let invalid = current.invalid + archived.invalid + (current.records.length - validCurrent.length);
    invalid += archived.records.filter((record) => validateSharedEvent(record).length > 0).length;

    for (const runtime of RUNTIMES) {
      const inbox = retrospectivePaths(cwd, runtime).inbox;
      const parsed = readJsonl(inbox);
      invalid += parsed.invalid;
      for (const local of parsed.records) {
        if (validateLocalEvent(local).length > 0) {
          invalid++;
          continue;
        }
        if (known.has(local.event_id)) continue;
        const shared = {
          schema_version: SCHEMA_VERSION,
          event_id: local.event_id,
          captured_at: local.captured_at,
          ingested_at: nowIso(now),
          runtime: local.runtime,
          signal: local.signal,
          state: "unreviewed",
          source: {
            source_ref: local.event_id,
            session_ref: local.source.session_ref,
            message_index: local.source.message_index
          },
          privacy: "pointer-only"
        };
        if (validateSharedEvent(shared).length > 0) continue;
        additions.push(shared);
        known.add(shared.event_id);
      }
    }

    for (const record of additions) appendJsonLine(paths.ledger, record);
    writeJsonAtomic(paths.syncState, {
      schema_version: SCHEMA_VERSION,
      last_ingested_at: nowIso(now),
      ledger_event_count: known.size,
      last_result: { ingested: additions.length, invalid_records_preserved: invalid }
    });
    return {
      enabled: true,
      ingested: additions.length,
      invalid,
      total: known.size,
      unreviewed: [...validCurrent, ...additions].filter((record) => record?.state === "unreviewed").length
    };
  } finally {
    release();
  }
}

export function archiveLedgerEvents(cwd, decisions, now = new Date()) {
  const preferences = readRetrospectivePreferences(cwd);
  if (!preferences.enabled) return { enabled: false, archived: 0, reason: `RETRO-001 ${preferences.reason}` };

  const normalized = new Map();
  let rejected = 0;
  for (const decision of decisions || []) {
    const eventId = decision?.event_id;
    const state = decision?.state;
    if (!/^[a-f0-9]{64}$/.test(eventId || "") || !ARCHIVABLE_STATES.has(state)) {
      rejected++;
      continue;
    }
    normalized.set(eventId, state);
  }
  if (normalized.size === 0) return { enabled: true, archived: 0, rejected, missing: 0 };

  const paths = retrospectivePaths(cwd);
  ensurePrivacyGitignore(cwd);
  const release = acquireLock(paths.lock, now.getTime());
  if (!release) return { enabled: true, archived: 0, rejected, reason: "RETRO-004 ingest-locked" };

  try {
    const archive = readJsonl(paths.archive);
    const archivedIds = new Set(archive.records.map((record) => record?.event_id).filter(Boolean));
    const lines = fs.existsSync(paths.ledger) ? fs.readFileSync(paths.ledger, "utf8").split(/\r?\n/) : [];
    const kept = [];
    const additions = [];
    const found = new Set();

    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        kept.push(line);
        continue;
      }
      const state = normalized.get(record?.event_id);
      if (!state || validateSharedEvent(record).length > 0) {
        kept.push(line);
        continue;
      }
      found.add(record.event_id);
      if (!archivedIds.has(record.event_id)) {
        const archivedRecord = { ...record, state };
        if (validateSharedEvent(archivedRecord).length === 0) {
          additions.push(archivedRecord);
          archivedIds.add(record.event_id);
        } else {
          kept.push(line);
        }
      }
    }

    for (const record of additions) appendJsonLine(paths.archive, record);
    writeTextAtomic(paths.ledger, kept.length ? `${kept.join("\n")}\n` : "");
    return {
      enabled: true,
      archived: additions.length,
      rejected,
      missing: [...normalized.keys()].filter((eventId) => !found.has(eventId) && !archivedIds.has(eventId)).length
    };
  } finally {
    release();
  }
}

export function captureAndIngest(input) {
  try {
    const capture = captureFeedbackEvents(input);
    if (!capture.enabled) return { capture, ingest: { enabled: false, ingested: 0 } };
    return { capture, ingest: ingestRuntimeInboxes(input.cwd, input.now) };
  } catch {
    return {
      capture: { enabled: false, captured: 0, reason: "RETRO-002 local-storage-error" },
      ingest: { enabled: false, ingested: 0, reason: "RETRO-002 local-storage-error" }
    };
  }
}

export const RETROSPECTIVE_SCHEMA_VERSION = SCHEMA_VERSION;
