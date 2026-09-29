import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadCore } from "./front-door-core/entry.mjs";
import { verifyBuilderClosure, loadBuilder } from "./front-door-builder-entry.mjs";

export const TRANSITIONS = Object.freeze({
  start: { from: [null], prerequisites: ["root_verified", "storage_resolved", "slot_empty"], files: ["workspace", "record", "pointer"], verification: "read_back_all", recovery: "journal_roll_forward" },
  ask: { from: ["active"], prerequisites: ["no_outstanding_question"], files: ["record"], verification: "revision_plus_one", recovery: "journal_roll_forward" },
  answer: { from: ["awaiting_answer"], prerequisites: ["matching_question_id"], files: ["record"], verification: "revision_plus_one", recovery: "journal_roll_forward" },
  onboarding_return: { from: ["active", "awaiting_answer"], prerequisites: ["artifacts_reconciled"], files: ["record", "journey"], verification: "read_back_all", recovery: "journal_roll_forward" },
  choose_rung: { from: ["active"], prerequisites: ["no_required_question"], files: ["record"], verification: "revision_plus_one", recovery: "journal_roll_forward" },
  record_asset: { from: ["active"], prerequisites: ["asset_read_evidence"], files: ["record"], verification: "hash_bound_to_revision", recovery: "journal_roll_forward" },
  verify_output: { from: ["active"], prerequisites: ["read_back_hash"], files: ["record"], verification: "hash_bound_to_revision", recovery: "journal_roll_forward" },
  update_goal: { from: ["active"], prerequisites: [], files: ["record"], verification: "dependent_evidence_invalidated", recovery: "journal_roll_forward" },
  asset_changed: { from: ["active"], prerequisites: [], files: ["record"], verification: "dependent_evidence_invalidated", recovery: "journal_roll_forward" },
  block: { from: ["active", "awaiting_answer"], prerequisites: ["blocker_code"], files: ["record"], verification: "slot_retained", recovery: "journal_roll_forward" },
  unblock: { from: ["blocked"], prerequisites: ["prerequisite_verified"], files: ["record"], verification: "slot_retained", recovery: "journal_roll_forward" },
  pause: { from: ["active", "awaiting_answer", "blocked"], prerequisites: [], files: ["record", "pointer"], verification: "pointer_cleared_after_record", recovery: "journal_roll_forward" },
  resume: { from: ["paused"], prerequisites: ["empty_slot", "revalidated"], files: ["record", "pointer"], verification: "pointer_claimed", recovery: "journal_roll_forward" },
  cancel: { from: ["active", "awaiting_answer", "blocked", "paused"], prerequisites: [], files: ["record", "pointer"], verification: "outcome_before_pointer_clear", recovery: "journal_roll_forward" },
  abandon: { from: ["active", "awaiting_answer", "blocked", "paused"], prerequisites: [], files: ["record", "pointer"], verification: "outcome_before_pointer_clear", recovery: "journal_roll_forward" },
  restrict: { from: ["active", "awaiting_answer", "blocked", "paused"], prerequisites: [], files: ["record", "pointer"], verification: "outcome_before_pointer_clear", recovery: "journal_roll_forward" },
  complete: { from: ["active"], prerequisites: ["verified_outcome", "no_required_question"], files: ["record", "pointer", "journey"], verification: "outcome_before_pointer_clear", recovery: "journal_roll_forward" },
  resolve_bad_pointer: { from: [null], prerequisites: ["explicit_resolution", "known_pointer_hash"], files: ["pointer"], verification: "matching_pointer_only", recovery: "journal_roll_forward" },
  pointer_cleanup: { from: ["completed", "cancelled", "abandoned", "paused"], prerequisites: ["matching_pointer"], files: ["pointer"], verification: "matching_pointer_only", recovery: "journal_roll_forward" }
});

const terminal = new Set(["completed", "cancelled", "abandoned"]);
const outcomeKinds = new Set(["employee_saved", "asset_saved", "done_directly", "extended_existing", "cancelled", "abandoned"]);
const rungKinds = new Set(["no_build_one_off", "no_build_connect_first", "no_build_extend_existing", "asset", "skill", "connect", "system"]);
const assetRoles = new Set(["brand", "voice", "ip", "example", "template", "other"]);
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isAssetEvent = (event) => typeof event.asset_id === "string"
  && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.asset_id)
  && typeof event.path === "string" && event.path.length > 0 && isHash(event.content_sha256)
  && (event.role === undefined || assetRoles.has(event.role));
const isOutputEvent = (event) => typeof event.path === "string" && event.path.length > 0
  && ["skill", "asset", "document"].includes(event.kind) && isHash(event.content_sha256);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readHash = (file) => { try { return hash(fs.readFileSync(file)); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } };
const iso = (clock) => clock().toISOString();
const fail = (code) => ({ ok: false, code });
const invalidateAsset = (asset) => {
  const next = { ...asset, read_evidence: null };
  if (Object.hasOwn(next, "content_sha256")) next.content_sha256 = null;
  return next;
};

export function resolveStoragePolicy({ memberChoice = null, trialIntakeDeclined = false,
  legacyRow = false, disclosedAtRevision = null } = {}) {
  if (!Number.isInteger(disclosedAtRevision) || disclosedAtRevision < 0) return fail("storage_policy_unresolved");
  if (trialIntakeDeclined) return { ok: true, storage: { mode: "restricted", source: "trial_intake_declined", disclosed_at_revision: disclosedAtRevision } };
  if (legacyRow) return { ok: true, storage: { mode: "restricted", source: "legacy_reconsent_required", disclosed_at_revision: disclosedAtRevision }, reuse_legacy: false };
  if (memberChoice === "full" || memberChoice === "restricted") return { ok: true, storage: { mode: memberChoice, source: "member_choice", disclosed_at_revision: disclosedAtRevision } };
  return { ok: true, storage: { mode: "full", source: "default_disclosed", disclosed_at_revision: disclosedAtRevision } };
}

export function newBuild({ workspaceId, storage, goal, clock = () => new Date(), buildId = crypto.randomUUID() }) {
  if (!storage?.mode || !Number.isInteger(storage.disclosed_at_revision)) return fail("storage_policy_unresolved");
  const at = iso(clock);
  return { ok: true, record: { schema_version: 1, build_id: buildId, workspace_id: workspaceId,
    status: "active", step: "readiness", revision: 1, material_revision: 1, created_at: at, updated_at: at, storage,
    goal: { member_words: goal?.member_words || "", normalized: goal?.normalized || "" }, answers: [],
    outstanding_question: null, rung: null, asset_refs: [], verified_outputs: [], blocker: null, outcome: null } };
}

export function restrictedRecord(record) {
  return { schema_version: record.schema_version, build_id: record.build_id, workspace_id: record.workspace_id,
    status: record.status, step: record.step, revision: record.revision,
    ...(record.material_revision === undefined ? {} : { material_revision: record.material_revision }),
    created_at: record.created_at,
    updated_at: record.updated_at, storage: record.storage,
    rung: record.rung ? { kind: record.rung.kind } : null,
    outstanding_question: record.outstanding_question ? {
      question_id: record.outstanding_question.question_id,
      answer_key: record.outstanding_question.answer_key, required: record.outstanding_question.required } : null,
    asset_refs: record.asset_refs.map((asset) => ({ asset_id: asset.asset_id, path: asset.path,
      content_sha256: Object.hasOwn(asset, "read_evidence")
        ? asset.read_evidence?.content_sha256 ?? null : asset.content_sha256 ?? null })),
    verified_outputs: record.verified_outputs.map(({ path, content_sha256 }) => ({ path, content_sha256 })),
    blocker: record.blocker ? { code: record.blocker.code } : null,
    outcome: record.outcome ? { kind: record.outcome.kind } : null };
}

export function transition(state, event, { clock = () => new Date() } = {}) {
  const spec = TRANSITIONS[event?.type];
  if (!spec) return fail("unknown_transition");
  if (event.type === "start") {
    if (state !== null || event.slot_empty !== true || event.root_verified !== true) return fail("invalid_transition");
    const started = newBuild({ workspaceId: event.workspace_id, storage: event.storage, goal: event.goal,
      clock, buildId: event.build_id || crypto.randomUUID() });
    return started.ok ? { ok: true, record: started.record, spec, pointer_action: "claim" } : started;
  }
  if (event.type === "resolve_bad_pointer") {
    return event.explicit_resolution === true && event.observed_hash ? { ok: true, record: state,
      spec, pointer_action: "clear" } : fail("resolution_required");
  }
  if (event.type === "pointer_cleanup") {
    return spec.from.includes(state?.status) && event.matching_pointer === true
      ? { ok: true, record: state, spec, pointer_action: "clear" } : fail("conflict_active_build");
  }
  if (state?.outstanding_question?.required && !["answer", "pause", "resume", "cancel", "abandon", "restrict", "block", "unblock", "onboarding_return"].includes(event.type)) {
    return fail("required_question_outstanding");
  }
  if (!spec.from.includes(state?.status ?? null)) return fail(terminal.has(state?.status) ? "terminal_build" : "invalid_transition");
  const revision = (state?.revision || 0) + 1;
  // Legacy records have no material_revision. Freeze their last material
  // boundary from the pre-transition view, before a reread advances read evidence.
  const materialRevision = state.material_revision ?? Math.max(1, ...state.asset_refs.map((asset) =>
    asset.read_evidence?.read_at_revision || 0));
  const next = { ...state, revision, material_revision: materialRevision, updated_at: iso(clock) };
  switch (event.type) {
    case "ask":
      if (state.outstanding_question) return fail("question_outstanding");
      if (!event.question_id || !event.answer_key || !event.text) return fail("invalid_question");
      next.status = "awaiting_answer";
      next.outstanding_question = { question_id: event.question_id, answer_key: event.answer_key,
        required: event.required !== false, asked_at_revision: revision, text: event.text };
      break;
    case "answer":
      if (event.question_id !== state.outstanding_question?.question_id) return fail("question_mismatch");
      next.answers = [...(state.answers || []), { key: state.outstanding_question.answer_key,
        question_id: event.question_id, value: event.value, provenance: event.provenance || "member_said",
        confirmed_at_revision: revision }];
      next.outstanding_question = null; next.status = "active"; break;
    case "choose_rung":
      if (!rungKinds.has(event.kind)) return fail("invalid_rung");
      next.rung = { kind: event.kind, reasons: event.reasons || [], evidence: event.evidence || [],
        decided_at_revision: revision, override: event.override ? { requested_by_member: true,
          reason: event.override.reason, at_revision: revision } : null }; break;
    case "record_asset":
      if (!isAssetEvent(event)) return fail("invalid_asset_evidence");
      const previousAsset = state.asset_refs.find((item) => item.asset_id === event.asset_id);
      const sameAsset = previousAsset?.path === event.path
        && (previousAsset.read_evidence?.content_sha256 ?? previousAsset.content_sha256) === event.content_sha256;
      next.asset_refs = [...state.asset_refs.filter((item) => item.asset_id !== event.asset_id), {
        asset_id: event.asset_id, path: event.path, role: event.role || "other",
        read_evidence: { content_sha256: event.content_sha256, read_at_revision: revision } }];
      if (!sameAsset) { next.rung = null; next.material_revision = revision; }
      break;
    case "verify_output":
      if (!isOutputEvent(event)) return fail("invalid_output_evidence");
      if (event.kind === "skill" && !state.rung) return fail("missing_rung_decision");
      next.verified_outputs = [...state.verified_outputs.filter((item) => item.path !== event.path), {
        path: event.path, kind: event.kind, content_sha256: event.content_sha256, verified_at_revision: revision }];
      break;
    case "update_goal":
      if (!event.goal || typeof event.goal.member_words !== "string" || typeof event.goal.normalized !== "string") return fail("invalid_goal");
      next.goal = event.goal;
      if (!isDeepStrictEqual(state.goal, event.goal)) {
        next.material_revision = revision; next.rung = null;
        next.asset_refs = state.asset_refs.map(invalidateAsset);
      }
      break;
    case "asset_changed":
      if (!state.asset_refs.some((a) => a.asset_id === event.asset_id)) return fail("invalid_asset_evidence");
      next.material_revision = revision; next.rung = null;
      next.asset_refs = state.asset_refs.map((a) => a.asset_id === event.asset_id ? invalidateAsset(a) : a);
      break;
    case "onboarding_return": next.step = "job"; break;
    case "block":
      if (!event.code) return fail("invalid_blocker");
      next.status = "blocked"; next.blocker = { code: event.code, detail: event.detail || "", since_revision: revision }; break;
    case "unblock": next.status = state.outstanding_question ? "awaiting_answer" : "active"; next.blocker = null; break;
    case "pause": next.status = "paused"; break;
    case "resume": next.status = state.outstanding_question ? "awaiting_answer" : "active"; break;
    case "cancel": case "abandon":
      next.status = event.type === "cancel" ? "cancelled" : "abandoned";
      next.outcome = { kind: event.type === "cancel" ? "cancelled" : "abandoned", at_revision: revision }; break;
    case "restrict":
      // The member declined saved notes mid-build: keep only operational metadata, then release the slot.
      next.storage = { mode: "restricted", source: "member_choice", disclosed_at_revision: revision };
      next.outstanding_question = null;
      next.status = "cancelled"; next.outcome = { kind: "cancelled", at_revision: revision }; break;
    case "complete":
      if (!outcomeKinds.has(event.outcome) || ["cancelled", "abandoned"].includes(event.outcome)) return fail("invalid_outcome");
      if (event.outcome === "employee_saved" && !state.rung) return fail("missing_rung_decision");
      if (event.outcome === "employee_saved" && !state.verified_outputs.some((item) => item.kind === "skill")) return fail("unverified_outcome");
      if (event.outcome === "asset_saved" && !state.verified_outputs.some((item) => ["asset", "document"].includes(item.kind))) return fail("unverified_outcome");
      next.status = "completed"; next.outcome = { kind: event.outcome, at_revision: revision }; next.step = "handover"; break;
    default: return fail("transition_requires_persistence_operation");
  }
  if (event.step && event.type !== "complete") next.step = event.step;
  return { ok: true, record: next, spec, pointer_action: ["pause", "cancel", "abandon", "restrict", "complete"].includes(event.type)
    ? "clear" : event.type === "resume" ? "claim" : "retain" };
}

async function modules() {
  const closure = verifyBuilderClosure(); if (!closure.ok) return closure;
  const [identity, journal, state, lock, readiness] = await Promise.all([loadCore("identity"), loadCore("journal"),
    loadCore("state"), loadCore("lock"), loadCore("readiness")]);
  const bad = [identity, journal, state, lock, readiness].find((x) => !x.ok);
  return bad || { ok: true, identity: identity.module, journal: journal.module, state: state.module,
    lock: lock.module, readiness: readiness.module };
}
const target = (file, after, expected) => ({ path: file, after, expected_before_hash: expected,
  purpose: "operational_state", authorization_ref: { kind: "build_state_transition" } });

export async function persistStart({ root, rootResult, surface = "codex", evidence, storage, goal,
  clock = () => new Date(), buildId = crypto.randomUUID() }) {
  if (rootResult?.root !== "verified") return fail("root_unverified");
  if (!["full", "restricted"].includes(storage?.mode) || !Number.isInteger(storage?.disclosed_at_revision)) return fail("storage_policy_unresolved");
  const core = await modules(); if (!core.ok) return core;
  const recovery = await core.journal.recoverPending(root, rootResult);
  if (!recovery.ok) return recovery;
  const workspacePath = path.join(root, ".claude-state", "workspace.json");
  const existing = core.identity.readRecord(workspacePath, { now: clock() });
  if (!existing.ok && existing.code !== "missing") return existing;
  const workspace = existing.ok ? core.identity.confirmRoot(existing.value, { root, surface, evidence: rootResult, clock })
    : core.identity.newWorkspace({ root, surface, evidence: rootResult, clock });
  if (!workspace.ok) return workspace;
  const slot = core.state.canStart(root, workspace.value.workspace_id, clock());
  if (!slot.ok) return slot;
  const built = transition(null, { type: "start", slot_empty: true, root_verified: true,
    workspace_id: workspace.value.workspace_id, storage, goal, build_id: buildId }, { clock });
  if (!built.ok) return built;
  const record = storage.mode === "restricted" ? restrictedRecord(built.record) : built.record;
  const validNewRecord = core.state.validateBuildRecord(record);
  if (!validNewRecord.ok) return validNewRecord;
  const recordPath = `.claude-state/builds/${buildId}.json`;
  const pointer = { schema_version: 1, build_id: buildId, workspace_id: workspace.value.workspace_id, set_at: iso(clock) };
  const writes = [];
  if (!existing.ok || workspace.changed) writes.push(target(".claude-state/workspace.json", JSON.stringify(workspace.value), readHash(workspacePath)));
  writes.push(target(recordPath, JSON.stringify(record), null));
  writes.push(target(".claude-state/pending-build.json", JSON.stringify(pointer), null));
  const saved = await core.journal.transact({ root, rootResult, storage, transition: "start", targets: writes, clock });
  return saved.ok ? { ok: true, record: built.record, workspace: workspace.value,
    resume_limited: storage.mode === "restricted" } : saved;
}

export async function persistEvent({ root, rootResult, record, event, clock = () => new Date() }) {
  if (rootResult?.root !== "verified") return fail("root_unverified");
  if (!event || typeof event !== "object" || Array.isArray(event)) return fail("unknown_transition");
  if (!["full", "restricted"].includes(record?.storage?.mode) || !Number.isInteger(record?.storage?.disclosed_at_revision)) return fail("storage_policy_unresolved");
  const core = await modules(); if (!core.ok) return core;
  const rootCheck = core.readiness.revalidateRoot(root, rootResult,
    { writer: core.readiness.nodeWriterContext("write") });
  if (!rootCheck.ok) return rootCheck;
  let held;
  try { held = await core.lock.acquireLock(root); }
  catch (error) { return { ok: false, code: ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed",
    recovery: { error: error?.message, error_code: error?.code } }; }
  if (!held.ok) return held;
  try {
  const recovery = core.journal.recoverJournals(root, { nonce: held.nonce });
  if (!recovery.ok) return recovery;
  if (event.type === "record_asset" && !isAssetEvent(event)) return fail("invalid_asset_evidence");
  if (event.type === "verify_output" && !isOutputEvent(event)) return fail("invalid_output_evidence");
  if (["record_asset", "verify_output"].includes(event.type)) {
    const checked = await loadCore("readiness"); if (!checked.ok) return checked;
    const safe = checked.module.resolveTarget(root, event.path);
    if (!safe.ok) return safe;
    let bytes;
    try { bytes = fs.readFileSync(safe.path); }
    catch { return fail(event.type === "record_asset" ? "asset_unreadable" : "output_verification_failed"); }
    if (hash(bytes) !== event.content_sha256) return fail(event.type === "record_asset" ? "stale_asset" : "output_verification_failed");
  }
  const recordPath = `.claude-state/builds/${record.build_id}.json`;
  const file = path.join(root, recordPath);
  let recordBytes;
  try { recordBytes = fs.readFileSync(file); }
  catch (error) { return fail(error?.code === "ENOENT" ? "missing" : "unreadable"); }
  const onDisk = core.identity.parseRecordBytes(recordBytes, { workspaceId: record.workspace_id, now: clock() });
  if (!onDisk.ok) return onDisk;
  const validRecord = core.state.validateBuildRecord(onDisk.value);
  if (!validRecord.ok) return validRecord;
  if (onDisk.value.revision !== record.revision) return fail("conflict_revision");
  let persistedView;
  try { persistedView = record.storage.mode === "restricted" ? restrictedRecord(record) : record; }
  catch { return fail("unreadable"); }
  if (!core.state.validateBuildRecord(persistedView).ok) return fail("unreadable");
  if (!isDeepStrictEqual(onDisk.value, persistedView)) return fail("conflict_external_change");
  const changed = transition(record, event, { clock });
  if (!changed.ok) return changed;
  let serialized;
  try { serialized = changed.record.storage.mode === "restricted" ? restrictedRecord(changed.record) : changed.record; }
  catch { return fail("unreadable"); }
  const validProposed = core.state.validateBuildRecord(serialized);
  if (!validProposed.ok) return validProposed;
  const writes = [target(recordPath, JSON.stringify(serialized), hash(recordBytes))];
  if (event.type === "onboarding_return" || event.type === "complete" && event.outcome === "employee_saved") {
    const adapters = await loadBuilder("adapters"); if (!adapters.ok) return adapters;
    const journeyPath = path.join(root, ".claude-state", "progress-state.yaml");
    let before;
    try { before = fs.readFileSync(journeyPath, "utf8"); }
    catch { return fail("unsupported_document"); }
    const update = event.type === "onboarding_return" ? adapters.module.returnModeJourney(before)
      : adapters.module.patchJourney(before, { "ladder.3-first-skill": "done" });
    if (!update.ok) return update;
    writes.push(target(".claude-state/progress-state.yaml", update.text, readHash(journeyPath)));
    writes.at(-1).metadata_only = record.storage.mode === "restricted";
  }
  const pointerPath = path.join(root, ".claude-state", "pending-build.json");
  const pointer = core.identity.readRecord(pointerPath, { workspaceId: record.workspace_id, now: clock() });
  if (pointer.ok) {
    const validPointer = core.state.validatePointer(pointer.value);
    if (!validPointer.ok) return validPointer;
  } else if (pointer.code !== "missing") return pointer;
  if (changed.pointer_action === "retain" && (!pointer.ok || pointer.value.build_id !== record.build_id)) {
    return fail("conflict_active_build");
  }
  if (changed.pointer_action === "clear") {
    const pausedTerminal = stateTerminalFromPause(record, event);
    if (pointer.ok && pointer.value.build_id === record.build_id) {
      writes.push(target(".claude-state/pending-build.json", null, readHash(pointerPath)));
    } else if (!pausedTerminal) return fail("conflict_active_build");
  } else if (changed.pointer_action === "claim") {
    if (pointer.code !== "missing") return fail("conflict_active_build");
    writes.push(target(".claude-state/pending-build.json", JSON.stringify({ schema_version: 1,
      build_id: record.build_id, workspace_id: record.workspace_id, set_at: iso(clock) }), null));
  }
  const saved = await core.journal.transact({ root, rootResult, storage: changed.record.storage, transition: event.type,
    targets: writes, lockNonce: held.nonce, clock });
  return saved.ok ? { ok: true, record: changed.record, resume_limited: changed.record.storage.mode === "restricted" } : saved;
  } finally { core.lock.releaseLock(root, held.nonce); }
}

const stateTerminalFromPause = (record, event) => record.status === "paused"
  && ["cancel", "abandon", "restrict"].includes(event.type);

export async function resolveBadPointer({ root, rootResult, storage, observedHash, authorization_ref }) {
  if (rootResult?.root !== "verified") return fail("root_unverified");
  if (!authorization_ref || authorization_ref.kind !== "explicit_resolution") return fail("resolution_required");
  const core = await modules(); if (!core.ok) return core;
  const pointerPath = path.join(root, ".claude-state", "pending-build.json");
  if (!observedHash || readHash(pointerPath) !== observedHash) return fail("conflict_external_change");
  const recovery = await core.journal.recoverPending(root, rootResult);
  if (!recovery.ok) return recovery;
  if (readHash(pointerPath) !== observedHash) return fail("conflict_external_change");
  return core.journal.transact({ root, rootResult, storage, transition: "resolve_bad_pointer",
    targets: [{ ...target(".claude-state/pending-build.json", null, observedHash), authorization_ref }] });
}

export async function cleanupPointer({ root, rootResult, storage, record, clock = () => new Date() }) {
  if (rootResult?.root !== "verified") return fail("root_unverified");
  if (!["paused", "completed", "cancelled", "abandoned"].includes(record?.status)) return fail("invalid_transition");
  const core = await modules(); if (!core.ok) return core;
  const recovery = await core.journal.recoverPending(root, rootResult);
  if (!recovery.ok) return recovery;
  const saved = core.identity.readRecord(path.join(root, ".claude-state", "builds", `${record.build_id}.json`),
    { workspaceId: record.workspace_id, now: clock() });
  if (!saved.ok) return saved;
  const validRecord = core.state.validateBuildRecord(saved.value);
  if (!validRecord.ok) return validRecord;
  if (!isDeepStrictEqual(saved.value, storage.mode === "restricted" ? restrictedRecord(record) : record)) {
    return fail("conflict_external_change");
  }
  const pointerPath = path.join(root, ".claude-state", "pending-build.json");
  const pointer = core.identity.readRecord(pointerPath, { workspaceId: record.workspace_id, now: clock() });
  if (pointer.ok) {
    const validPointer = core.state.validatePointer(pointer.value);
    if (!validPointer.ok) return validPointer;
  } else if (pointer.code !== "missing") return pointer;
  if (!pointer.ok || pointer.value.build_id !== record.build_id) return fail("conflict_active_build");
  return core.journal.transact({ root, rootResult, storage, transition: "pointer_cleanup", clock,
    targets: [target(".claude-state/pending-build.json", null, readHash(pointerPath))] });
}
