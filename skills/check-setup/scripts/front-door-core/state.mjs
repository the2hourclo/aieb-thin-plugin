import path from "node:path";
import { readRecord, SCHEMA_VERSION } from "./identity.mjs";

const activeStatuses = new Set(["active", "awaiting_answer", "blocked"]);
const allStatuses = new Set(["active", "awaiting_answer", "paused", "blocked", "completed", "cancelled", "abandoned"]);
const allSteps = new Set(["readiness", "job", "today", "ladder", "assets", "build", "first_run", "handover"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[a-f0-9]{64}$/;
const isUuid = (value) => typeof value === "string" && uuid.test(value);
const isSha = (value) => typeof value === "string" && sha.test(value);
const isSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const rungs = new Set(["no_build_one_off", "no_build_connect_first", "no_build_extend_existing", "asset", "skill", "connect", "system"]);
const outcomes = new Set(["employee_saved", "asset_saved", "done_directly", "extended_existing", "cancelled", "abandoned"]);
const blockers = new Set(["prerequisite_needed", "asset_missing", "tool_unavailable", "permission_required", "workspace_partial", "other"]);
const sources = new Set(["member_choice", "trial_intake_declined", "legacy_reconsent_required", "default_disclosed"]);
const provenances = new Set(["member_said", "inferred_confirmed", "inferred_unconfirmed", "from_file", "from_map", "from_setup_intake"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value, required, optional = []) => object(value) && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const rev = (value, ceiling) => Number.isInteger(value) && value >= 1 && value <= ceiling;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const evidence = (row, ceiling) => keys(row, ["kind", "ref", "content_sha256", "observed_at_revision"])
  && typeof row.kind === "string" && typeof row.ref === "string" && isSha(row.content_sha256)
  && rev(row.observed_at_revision, ceiling);

export function validatePointer(pointer) {
  return keys(pointer, ["schema_version", "build_id", "workspace_id", "set_at"])
    && pointer.schema_version === 1 && isUuid(pointer.build_id) && isUuid(pointer.workspace_id)
    && timestamp(pointer.set_at) ? { ok: true } : { ok: false, code: "unreadable" };
}

export function validateBuildRecord(record) {
  const common = ["schema_version", "build_id", "workspace_id", "status", "step", "revision", "created_at",
    "updated_at", "storage", "rung", "outstanding_question", "asset_refs", "verified_outputs", "blocker", "outcome"];
  const full = record?.storage?.mode === "full";
  const required = full ? [...common, "goal", "answers"] : common;
  if (!keys(record, required, ["material_revision"]) || record.schema_version !== 1
      || !isUuid(record.build_id) || !isUuid(record.workspace_id) || !allStatuses.has(record.status)
      || !allSteps.has(record.step) || !rev(record.revision, Number.MAX_SAFE_INTEGER)
      || record.material_revision !== undefined && !rev(record.material_revision, record.revision)
      || !timestamp(record.created_at) || !timestamp(record.updated_at)
      || !keys(record.storage, ["mode", "source", "disclosed_at_revision"])
      || !["full", "restricted"].includes(record.storage.mode) || !sources.has(record.storage.source)
      || !Number.isInteger(record.storage.disclosed_at_revision) || record.storage.disclosed_at_revision < 0
      || !Array.isArray(record.asset_refs) || !Array.isArray(record.verified_outputs)) return { ok: false, code: "unreadable" };
  const n = record.revision;
  if (full) {
    if (!keys(record.goal, ["member_words", "normalized"])
        || typeof record.goal.member_words !== "string" || typeof record.goal.normalized !== "string"
        || !Array.isArray(record.answers) || record.answers.some((a) => !keys(a,
          ["key", "question_id", "value", "provenance", "confirmed_at_revision"])
          || typeof a.key !== "string" || typeof a.question_id !== "string"
          || !provenances.has(a.provenance) || !rev(a.confirmed_at_revision, n))) return { ok: false, code: "unreadable" };
    if (record.outstanding_question !== null && (!keys(record.outstanding_question,
      ["question_id", "answer_key", "required", "asked_at_revision", "text"])
      || typeof record.outstanding_question.question_id !== "string"
      || typeof record.outstanding_question.answer_key !== "string"
      || typeof record.outstanding_question.required !== "boolean"
      || !rev(record.outstanding_question.asked_at_revision, n)
      || typeof record.outstanding_question.text !== "string")) return { ok: false, code: "unreadable" };
    if (record.rung !== null && (!keys(record.rung, ["kind", "reasons", "evidence", "decided_at_revision", "override"])
      || !rungs.has(record.rung.kind) || !Array.isArray(record.rung.reasons)
      || record.rung.reasons.some((x) => typeof x !== "string") || !Array.isArray(record.rung.evidence)
      || record.rung.evidence.some((x) => !evidence(x, n)) || !rev(record.rung.decided_at_revision, n)
      || record.rung.override !== null && (!keys(record.rung.override, ["requested_by_member", "reason", "at_revision"])
        || record.rung.override.requested_by_member !== true || typeof record.rung.override.reason !== "string"
        || !rev(record.rung.override.at_revision, n)))) return { ok: false, code: "unreadable" };
    if (record.asset_refs.some((a) => !keys(a, ["asset_id", "path", "role", "read_evidence"])
      || !isSlug(a.asset_id) || typeof a.path !== "string"
      || !["brand", "voice", "ip", "example", "template", "other"].includes(a.role)
      || a.read_evidence !== null && (!keys(a.read_evidence, ["content_sha256", "read_at_revision"])
        || !isSha(a.read_evidence.content_sha256) || !rev(a.read_evidence.read_at_revision, n)))) return { ok: false, code: "unreadable" };
    if (record.verified_outputs.some((o) => !keys(o, ["path", "kind", "content_sha256", "verified_at_revision"])
      || typeof o.path !== "string" || !["skill", "asset", "document"].includes(o.kind)
      || !isSha(o.content_sha256) || !rev(o.verified_at_revision, n))) return { ok: false, code: "unreadable" };
    if (record.blocker !== null && (!keys(record.blocker, ["code", "detail", "since_revision"])
      || !blockers.has(record.blocker.code) || typeof record.blocker.detail !== "string"
      || !rev(record.blocker.since_revision, n))) return { ok: false, code: "unreadable" };
    if (record.outcome !== null && (!keys(record.outcome, ["kind", "at_revision"])
      || !outcomes.has(record.outcome.kind) || !rev(record.outcome.at_revision, n))) return { ok: false, code: "unreadable" };
  } else {
    if (record.outstanding_question !== null && (!keys(record.outstanding_question, ["question_id", "answer_key", "required"])
      || typeof record.outstanding_question.question_id !== "string"
      || typeof record.outstanding_question.answer_key !== "string"
      || typeof record.outstanding_question.required !== "boolean")) return { ok: false, code: "unreadable" };
    if (record.rung !== null && (!keys(record.rung, ["kind"]) || !rungs.has(record.rung.kind))) return { ok: false, code: "unreadable" };
    if (record.asset_refs.some((a) => !keys(a, ["asset_id", "path", "content_sha256"])
      || typeof a.asset_id !== "string" || typeof a.path !== "string"
      || a.content_sha256 !== null && !isSha(a.content_sha256))) return { ok: false, code: "unreadable" };
    if (record.verified_outputs.some((o) => !keys(o, ["path", "content_sha256"])
      || typeof o.path !== "string" || !isSha(o.content_sha256))) return { ok: false, code: "unreadable" };
    if (record.blocker !== null && (!keys(record.blocker, ["code"]) || !blockers.has(record.blocker.code))) return { ok: false, code: "unreadable" };
    if (record.outcome !== null && (!keys(record.outcome, ["kind"]) || !outcomes.has(record.outcome.kind))) return { ok: false, code: "unreadable" };
  }
  return { ok: true };
}

export function inspectSlot(root, workspaceId, now = new Date()) {
  const pointerPath = path.join(root, ".claude-state", "pending-build.json");
  const pointer = readRecord(pointerPath, { workspaceId, now, version: SCHEMA_VERSION });
  if (!pointer.ok) return pointer.code === "missing" ? { ok: true, slot: "empty" } : { ok: false, code: pointer.code, path: pointerPath };
  if (!validatePointer(pointer.value).ok) return { ok: false, code: "unreadable", path: pointerPath };
  const recordPath = path.join(root, ".claude-state", "builds", `${pointer.value.build_id}.json`);
  const record = readRecord(recordPath, { workspaceId, now });
  if (!record.ok) return { ok: false, code: record.code === "missing" ? "dangling_pointer" : record.code, path: recordPath };
  if (record.value.build_id !== pointer.value.build_id || !validateBuildRecord(record.value).ok) return { ok: false, code: "unreadable", path: recordPath };
  const age = now.getTime() - Date.parse(record.value.updated_at);
  if (age < 0 || !Number.isFinite(age)) return { ok: false, code: "invalid_timestamp", path: recordPath };
  return { ok: true, slot: activeStatuses.has(record.value.status) ? "owned" : "unresolved_pointer",
    pointer: pointer.value, record: record.value, stale: age >= 14 * 86400000 };
}

export function canStart(root, workspaceId, now = new Date()) {
  const slot = inspectSlot(root, workspaceId, now);
  return !slot.ok ? slot : slot.slot === "empty" ? { ok: true } : { ok: false, code: "conflict_active_build", slot };
}

export function firstSkillDone(record) {
  return record?.status === "completed" && record?.outcome?.kind === "employee_saved"
    && record?.verified_outputs?.some((row) => row.path && row.content_sha256
      && (record.storage?.mode === "restricted" || row.kind === "skill"));
}
