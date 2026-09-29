import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const timestamp = (clock = () => new Date()) => clock().toISOString();
const permittedRootEvidence = (rootResult) => [rootResult.selected_root_evidence, rootResult.writable_access_evidence]
  .filter(Boolean).map((entry) => ({ kind: entry.kind,
    detail: { root: entry.detail?.root, scope: entry.detail?.scope || null,
      ...(entry.detail?.tool !== undefined ? { tool: entry.detail.tool } : {}),
      ...(entry.detail?.session_id !== undefined ? { session_id: entry.detail.session_id } : {}),
      ...(entry.detail?.process_id !== undefined ? { process_id: entry.detail.process_id } : {}),
      ...(entry.detail?.operations !== undefined ? { operations: entry.detail.operations } : {}) },
    observed_at: entry.observed_at || null }));

export function validateTimestamp(value, now = new Date()) {
  const date = new Date(value);
  return typeof value === "string" && Number.isFinite(date.getTime()) && date.toISOString() === value
    && date.getTime() <= now.getTime();
}

export function readRecord(file, { workspaceId = null, now = new Date(), version = SCHEMA_VERSION } = {}) {
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (error) { return { ok: false, code: error.code === "ENOENT" ? "missing" : "unreadable" }; }
  return parseRecordBytes(bytes, { workspaceId, now, version });
}

export function parseRecordBytes(bytes, { workspaceId = null, now = new Date(), version = SCHEMA_VERSION } = {}) {
  let row;
  try { row = JSON.parse(bytes.toString("utf8")); }
  catch { return { ok: false, code: "unreadable" }; }
  if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, code: "unreadable" };
  if (!Number.isInteger(row.schema_version) || row.schema_version < 1) return { ok: false, code: "unreadable" };
  if (row.schema_version > version) return { ok: false, code: "unsupported_version" };
  if (workspaceId && row.workspace_id !== workspaceId) return { ok: false, code: "foreign_record" };
  for (const key of ["created_at", "updated_at", "set_at"].filter((k) => row[k] !== undefined)) {
    if (!validateTimestamp(row[key], now)) return { ok: false, code: "invalid_timestamp", field: key };
  }
  return { ok: true, value: row };
}

export function newWorkspace({ root, surface, evidence, clock = () => new Date(), workspaceId = crypto.randomUUID() }) {
  if (evidence?.root !== "verified") return { ok: false, code: "root_unverified" };
  const at = timestamp(clock);
  return { ok: true, value: { schema_version: SCHEMA_VERSION, workspace_id: workspaceId, created_at: at,
    root_confirmations: [{ canonical_path: fs.realpathSync(root), surface,
      evidence: permittedRootEvidence(evidence), confirmed_at: at }] } };
}

export function confirmRoot(workspace, { root, surface, evidence, clock = () => new Date() }) {
  if (evidence?.root !== "verified") return { ok: false, code: "root_unverified" };
  const canonical = fs.realpathSync(root);
  if (workspace.root_confirmations?.some((row) => row.canonical_path === canonical && row.surface === surface)) {
    return { ok: true, value: workspace, changed: false };
  }
  return { ok: true, changed: true, value: { ...workspace, root_confirmations: [
    ...(workspace.root_confirmations || []), { canonical_path: canonical, surface,
      evidence: permittedRootEvidence(evidence), confirmed_at: timestamp(clock) }
  ] } };
}

export function workspaceFile(root) { return path.join(root, ".claude-state", "workspace.json"); }
