#!/usr/bin/env node
// Member-callable front door operations. JSON in (stdin, --json or --json-file), JSON out.
// Every command goes through the Foundation functions (lock, journal, revision checks);
// this file adds argument handling only. The closure is verified before any sibling loads.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const fail = (code, more = {}) => ({ ok: false, code, ...more });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const steps = ["readiness", "job", "today", "ladder", "assets", "build", "first_run", "handover"];
const departments = ["marketing", "sales", "product", "operations", "finance", "strategy"];
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const EVENT_COMMANDS = Object.freeze({
  ask: "ask", answer: "answer", "choose-rung": "choose_rung", "record-asset": "record_asset",
  "verify-output": "verify_output", pause: "pause", resume: "resume", complete: "complete",
  cancel: "cancel", abandon: "abandon", restrict: "restrict", block: "block", unblock: "unblock",
  "update-goal": "update_goal", "asset-changed": "asset_changed", "onboarding-return": "onboarding_return"
});
export const COMMANDS = Object.freeze(["readiness", "start", "slot", "brief", "brief-check", "map-asset", "map-roster",
  "journals", "verify", "mark-onboarded", ...Object.keys(EVENT_COMMANDS)]);
// The byte-order mark, built from its code so this file holds no invisible character.
const BOM_AT_START = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const rungKinds = new Set(["no_build_one_off", "no_build_connect_first", "no_build_extend_existing", "asset", "skill", "connect", "system"]);
const provenances = new Set(["member_said", "inferred_confirmed", "inferred_unconfirmed", "from_file", "from_map", "from_setup_intake"]);

// The helper siblings load only after the input file is cleaned up, so a missing or broken helper
// can never leave the member's answers on disk.
let entryModules = null;
async function entryPoints() {
  if (!entryModules) {
    const core = await import("./front-door-core/entry.mjs");
    const builder = await import("./front-door-builder-entry.mjs");
    entryModules = { loadCore: core.loadCore, verifyBuilderClosure: builder.verifyBuilderClosure, loadBuilder: builder.loadBuilder };
  }
  return entryModules;
}
const startupFailure = () => fail("mixed_version_closure", { detail: "helper scripts could not be loaded" });

// The workflow's standard input file is read once and removed before anything runs, so what a member said never
// lingers on disk. Only "already gone" is fine; any other failure stops the command until the file is really gone.
function consumeInput(file) {
  const full = path.resolve(file);
  if (path.basename(full) !== "input.json" || path.basename(path.dirname(full)) !== "front-door-scripts") return { ok: true };
  const stuck = (error) => fail("input_cleanup_failed", { ...(error?.code ? { error_code: error.code } : {}),
    next_action: "Close anything using .claude-state/front-door-scripts/input.json, then run the same command again." });
  try { fs.unlinkSync(full); }
  catch (error) { if (error?.code !== "ENOENT") return stuck(error); }
  return fs.existsSync(full) ? stuck() : { ok: true };
}

// The standard input file lives in the notes folder. When that folder or .claude-state is a link (or cannot be
// checked), the file may sit outside the project, so it is neither read nor deleted: the command refuses first.
function inputFolderLinked(file) {
  if (typeof file !== "string") return false;
  const full = path.resolve(file);
  if (path.basename(full) !== "input.json" || path.basename(path.dirname(full)) !== "front-door-scripts") return false;
  for (const dir of [path.dirname(full), path.dirname(path.dirname(full))]) {
    try { if (fs.lstatSync(dir).isSymbolicLink()) return true; }
    catch (error) { if (error?.code !== "ENOENT") return true; }
  }
  return false;
}

// Reads the --json-file body and removes the file. { body } (null when unreadable) or { failure }.
function takeInputFile(file) {
  if (typeof file !== "string") return { body: null };
  let body = null;
  try { body = fs.readFileSync(file, "utf8").replace(BOM_AT_START, ""); }
  catch { /* Still attempt cleanup when reading fails. */ }
  let cleaned;
  try { cleaned = consumeInput(file); } catch { cleaned = fail("input_cleanup_failed"); }
  return cleaned.ok ? { body } : { failure: cleaned };
}

// { input } to run the command, or { failure } to print instead (input is null when it could not be read or parsed).
async function readInput(argv, taken) {
  const at = (flag) => argv.indexOf(flag);
  try {
    if (at("--json") >= 0) return { input: JSON.parse(argv[at("--json") + 1]) };
    if (taken) return { input: taken.body === null ? null : JSON.parse(taken.body) };
    if (process.stdin.isTTY) return { input: {} };
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8").replace(BOM_AT_START, "").trim();
    return { input: text ? JSON.parse(text) : {} };
  } catch { return { input: null }; }
}

async function load() {
  const { loadCore, loadBuilder } = await entryPoints();
  const names = ["readiness", "identity", "state", "journal", "precedence"];
  const loaded = await Promise.all(names.map((name) => loadCore(name)));
  const bad = loaded.find((item) => !item.ok);
  if (bad) return bad;
  const [build, assets, brief, adapters] = await Promise.all(["build", "assets", "brief", "adapters"].map((n) => loadBuilder(n)));
  const badBuilder = [build, assets, brief, adapters].find((item) => !item.ok);
  if (badBuilder) return badBuilder;
  return { ok: true, readiness: loaded[0].module, identity: loaded[1].module, state: loaded[2].module,
    journal: loaded[3].module, precedence: loaded[4].module, build: build.module, assets: assets.module,
    brief: brief.module, adapters: adapters.module };
}

const validRoot = (root) => typeof root === "string" && path.isAbsolute(root) && fs.existsSync(root)
  && fs.statSync(root).isDirectory();

// A link or junction anywhere in the notes folder path: nothing may be read or saved through it.
function notesFolderLinked(root) {
  let current = root;
  for (const part of [".claude-state", "front-door-scripts"]) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) return true; }
    catch (error) { return error?.code !== "ENOENT"; }
  }
  return false;
}

function verifiedRoot(m, input) {
  if (!validRoot(input.root)) return fail("invalid_input", { detail: "root must be an existing absolute folder path" });
  const rootResult = m.readiness.rootFromHost({ root: input.root, surface: input.surface || "claude",
    write_access: input.write_access, evidence: input.evidence });
  return rootResult.root === "verified" ? { ok: true, rootResult }
    : fail(rootResult.reason || "root_unverified", { root_result: rootResult, next_action: rootResult.next_action });
}

function workspaceId(m, root) {
  const found = m.identity.readRecord(m.identity.workspaceFile(root));
  return found.ok ? { ok: true, id: found.value.workspace_id } : fail(found.code === "missing" ? "no_active_build" : found.code);
}

// The active build (pointer) or an explicit build id, read fresh from disk.
function loadBuild(m, root, buildId) {
  const ws = workspaceId(m, root); if (!ws.ok) return ws;
  if (buildId !== undefined && buildId !== null) {
    if (typeof buildId !== "string" || !uuid.test(buildId)) return fail("invalid_input", { detail: "build_id" });
    const file = path.join(root, ".claude-state", "builds", `${buildId}.json`);
    const found = m.identity.readRecord(file, { workspaceId: ws.id });
    if (!found.ok) return found.code === "missing" ? fail("no_active_build") : found;
    const valid = m.state.validateBuildRecord(found.value);
    return valid.ok ? { ok: true, record: found.value } : valid;
  }
  const slot = m.state.inspectSlot(root, ws.id);
  if (!slot.ok) return slot;
  return slot.slot === "empty" ? fail("no_active_build") : { ok: true, record: slot.record };
}

const fileHash = (root, m, relative) => {
  const safe = m.readiness.resolveTarget(root, relative);
  if (!safe.ok) return safe;
  try { return { ok: true, sha: sha(fs.readFileSync(safe.path)), path: safe.path }; }
  catch (error) { return fail(error?.code === "ENOENT" ? "asset_missing" : "asset_unreadable"); }
};

function ladderEvidence(m, root, record, input, revisionAfter) {
  const evidence = Array.isArray(input.evidence) ? input.evidence.filter((x) => x?.kind !== "goal_confirmation"
    && x?.kind !== "working_skills") : [];
  if (input.confirmed_by_member === true && record.goal) {
    evidence.push({ kind: "goal_confirmation", ref: "goal", content_sha256: m.brief.goalHash(record.goal),
      observed_at_revision: revisionAfter });
  }
  if (input.kind === "system" && Array.isArray(input.working_skills) && input.working_skills.length) {
    const hashes = [];
    for (const relative of input.working_skills) {
      const found = fileHash(root, m, relative);
      if (!found.ok) return found;
      hashes.push(found.sha);
    }
    if (hashes.length >= 2) {
      evidence.push({ kind: "working_skills", ref: input.working_skills.join(","),
        content_sha256: sha(hashes.sort().join(",")), observed_at_revision: revisionAfter });
    }
  }
  return { ok: true, evidence };
}

async function eventCommand(m, command, input) {
  const type = EVENT_COMMANDS[command];
  const root = verifiedRoot(m, input); if (!root.ok) return root;
  const loaded = loadBuild(m, input.root, input.build_id); if (!loaded.ok) return loaded;
  const { record } = loaded;
  if (input.step !== undefined && !steps.includes(input.step)) return fail("invalid_input", { detail: "step" });
  const event = { type, ...(input.step ? { step: input.step } : {}) };
  const need = (...keys) => keys.every((key) => input[key] !== undefined && input[key] !== null && input[key] !== "");
  switch (type) {
    case "ask":
      if (!need("question_id", "answer_key", "text")) return fail("invalid_question");
      Object.assign(event, { question_id: input.question_id, answer_key: input.answer_key, text: input.text,
        required: input.required !== false });
      break;
    case "answer":
      if (!need("question_id") || input.value === undefined) return fail("invalid_input", { detail: "question_id and value" });
      Object.assign(event, { question_id: input.question_id, value: input.value, provenance: input.provenance });
      break;
    case "choose_rung": {
      if (!need("kind")) return fail("invalid_rung");
      const evidence = ladderEvidence(m, input.root, record, input, record.revision + 1);
      if (!evidence.ok) return evidence;
      if (input.kind === "system" && !input.override && !evidence.evidence.some((x) => x.kind === "working_skills")) {
        return fail("system_prerequisite_missing");
      }
      Object.assign(event, { kind: input.kind, reasons: Array.isArray(input.reasons) ? input.reasons : [],
        evidence: evidence.evidence, override: input.override?.reason ? { reason: String(input.override.reason) } : null,
        step: input.step || "ladder" });
      break;
    }
    case "record_asset": {
      if (!need("asset_id", "path")) return fail("invalid_asset_evidence");
      const found = fileHash(input.root, m, input.path); if (!found.ok) return found;
      Object.assign(event, { asset_id: input.asset_id, path: input.path, role: input.role || "other", content_sha256: found.sha });
      break;
    }
    case "verify_output": {
      if (!need("path", "kind")) return fail("invalid_output_evidence");
      const found = fileHash(input.root, m, input.path);
      if (!found.ok) return fail(found.code === "asset_missing" ? "output_verification_failed" : found.code);
      Object.assign(event, { path: input.path, kind: input.kind, content_sha256: found.sha });
      break;
    }
    case "complete": Object.assign(event, { outcome: input.outcome }); break;
    case "block": Object.assign(event, { code: input.code, detail: input.detail }); break;
    case "update_goal": Object.assign(event, { goal: input.goal }); break;
    case "asset_changed": Object.assign(event, { asset_id: input.asset_id }); break;
    default: break;
  }
  const saved = await m.build.persistEvent({ root: input.root, rootResult: root.rootResult, record, event });
  if (!saved.ok) return saved;
  const view = saved.record.storage.mode === "restricted" ? m.build.restrictedRecord(saved.record) : saved.record;
  return { ok: true, build_id: saved.record.build_id, status: saved.record.status, step: saved.record.step,
    revision: saved.record.revision, record: view, resume_limited: saved.resume_limited === true };
}

async function start(m, input) {
  const root = verifiedRoot(m, input); if (!root.ok) return root;
  const words = input.goal?.member_words;
  if (typeof words !== "string" || !words.trim()) return fail("invalid_input", { detail: "goal.member_words" });
  if (input.disclosed !== true) return fail("storage_policy_unresolved", { detail: "say where things are saved, then set disclosed: true" });
  const policy = m.build.resolveStoragePolicy({ memberChoice: input.storage_choice || null,
    trialIntakeDeclined: input.trial_intake_declined === true, legacyRow: input.legacy_row === true, disclosedAtRevision: 0 });
  if (!policy.ok) return policy;
  const goal = { member_words: words.trim(), normalized: String(input.goal.normalized || words).trim() };
  const saved = await m.build.persistStart({ root: input.root, rootResult: root.rootResult,
    surface: input.surface || "claude", storage: policy.storage, goal });
  if (!saved.ok) return saved;
  const view = policy.storage.mode === "restricted" ? m.build.restrictedRecord(saved.record) : saved.record;
  return { ok: true, build_id: saved.record.build_id, workspace_id: saved.workspace.workspace_id,
    storage: policy.storage, record: view, resume_limited: saved.resume_limited === true };
}

function slot(m, input) {
  if (!validRoot(input.root)) return fail("invalid_input", { detail: "root" });
  const ws = workspaceId(m, input.root);
  if (!ws.ok) return ws.code === "no_active_build" ? { ok: true, slot: "empty", paused: [], precedence: m.precedence.resumePrecedence({}) } : ws;
  const found = m.state.inspectSlot(input.root, ws.id);
  if (!found.ok) return found;
  const paused = [];
  const dir = path.join(input.root, ".claude-state", "builds");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((x) => /^[0-9a-f-]{36}\.json$/i.test(x)).sort()) {
      const row = m.identity.readRecord(path.join(dir, name), { workspaceId: ws.id });
      if (row.ok && m.state.validateBuildRecord(row.value).ok && row.value.status === "paused") {
        paused.push({ build_id: row.value.build_id, updated_at: row.value.updated_at,
          ...(row.value.goal ? { goal: row.value.goal.normalized || row.value.goal.member_words } : {}) });
      }
    }
  }
  return { ...found, paused, precedence: m.precedence.resumePrecedence({ build: found.record || null }),
    ...(found.record ? { resume_limited: found.record.storage.mode === "restricted" } : {}) };
}

function brief(m, input) {
  if (!validRoot(input.root)) return fail("invalid_input", { detail: "root" });
  const loaded = loadBuild(m, input.root, input.build_id); if (!loaded.ok) return loaded;
  const assets = {};
  for (const ref of loaded.record.asset_refs || []) {
    const found = fileHash(input.root, m, ref.path);
    assets[ref.asset_id] = found.ok ? { readable: true, content_sha256: found.sha } : { readable: false };
  }
  return { ok: true, build_id: loaded.record.build_id, brief: m.brief.briefFromBuild(loaded.record, { assets }) };
}

// A brief assembled in the chat (no saved notes): same rules as `brief`, nothing read from or written to the build record.
function briefCheck(m, input) {
  if (!validRoot(input.root)) return fail("invalid_input", { detail: "root" });
  const words = typeof input.goal?.member_words === "string" ? input.goal.member_words.trim() : "";
  if (!words) return fail("invalid_input", { detail: "goal.member_words" });
  const goal = { member_words: words, normalized: String(input.goal.normalized || words).trim() };
  const answers = [];
  for (const item of Array.isArray(input.answers) ? input.answers : []) {
    if (!item || typeof item.key !== "string" || !item.key || item.value === undefined
        || item.provenance !== undefined && !provenances.has(item.provenance)) return fail("invalid_input", { detail: "answers" });
    answers.push({ key: item.key, question_id: item.key, value: item.value, provenance: item.provenance || "member_said", confirmed_at_revision: 1 });
  }
  const record = { schema_version: 1, revision: 1, material_revision: 1, goal, answers, outstanding_question: null,
    rung: null, asset_refs: [], storage: { mode: "restricted", source: "member_choice", disclosed_at_revision: 0 } };
  const assets = {};
  for (const item of Array.isArray(input.assets) ? input.assets : []) {
    if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.asset_id || "") || typeof item.path !== "string") return fail("invalid_asset_evidence");
    const found = fileHash(input.root, m, item.path);
    assets[item.asset_id] = found.ok ? { readable: true, content_sha256: found.sha } : { readable: false };
    record.asset_refs.push({ asset_id: item.asset_id, path: item.path, role: item.role || "other",
      read_evidence: found.ok ? { content_sha256: found.sha, read_at_revision: 1 } : null });
  }
  if (input.kind !== undefined) {
    if (!rungKinds.has(input.kind)) return fail("invalid_rung");
    const evidence = ladderEvidence(m, input.root, record, input, 1);
    if (!evidence.ok) return evidence;
    record.rung = { kind: input.kind, reasons: Array.isArray(input.reasons) ? input.reasons : [], evidence: evidence.evidence,
      decided_at_revision: 1, override: input.override?.reason ? { requested_by_member: true, reason: String(input.override.reason), at_revision: 1 } : null };
  }
  return { ok: true, transient: true, brief: m.brief.briefFromBuild(record, { assets }) };
}

const alias = (row, pairs) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [pairs[key] || key, value]));
const layoutOf = (root) => departments.some((dept) => fs.existsSync(path.join(root, dept, "DEPARTMENT.md"))) ? "full" : "lean";

async function mapIndex(m, kind, input) {
  const root = verifiedRoot(m, input); if (!root.ok) return root;
  const loaded = loadBuild(m, input.root, input.build_id); if (!loaded.ok) return loaded;
  const pairs = kind === "roster"
    ? { employee_id: "employee id", skill_path: "skill path", asset_ids: "asset ids" }
    : { owner_dept: "owner dept", used_by: "used by" };
  const row = alias(input.row, pairs);
  if (kind === "asset") {
    const found = fileHash(input.root, m, row.path || ""); if (!found.ok) return found;
  }
  const layout = input.layout || layoutOf(input.root);
  const department = input.department || (kind === "asset" && layout === "full" ? row["owner dept"] : null);
  const saved = await m.assets.persistIndex({ root: input.root, rootResult: root.rootResult, storage: loaded.record.storage,
    layout, kind, row, department,
    authorization_ref: { kind: "build_state_transition", ref: loaded.record.build_id } });
  return saved.ok ? { ok: true, kind, layout, id: row[kind === "roster" ? "employee id" : "id"] } : saved;
}

async function markOnboarded(m, input) {
  const root = verifiedRoot(m, input); if (!root.ok) return root;
  // no_notes: the member declined saved notes, so there is no build record. Setting up the Business Operating
  // System is a deliverable they agreed to; only operational progress lines are touched, through the protected writer.
  let common;
  if (input.no_notes === true) {
    common = { root: input.root, rootResult: root.rootResult,
      storage: { mode: "restricted", source: "member_choice", disclosed_at_revision: 0 },
      authorization_ref: { kind: "explicit_member_request", ref: "business_operating_system_setup" } };
  } else {
    const loaded = loadBuild(m, input.root, input.build_id); if (!loaded.ok) return loaded;
    common = { root: input.root, rootResult: root.rootResult, storage: loaded.record.storage,
      authorization_ref: { kind: "build_state_transition", ref: loaded.record.build_id } };
  }
  const done = new Date().toISOString();
  const patches = [
    { relative: ".claude-state/onboarding-progress.json", section: "phases", key: "scaffold", value: "completed" },
    { relative: ".claude-state/onboarding-progress.json", section: "phases", key: "business-os", value: "completed" },
    { relative: ".claude-state/onboarding-progress.json", section: null, key: "completed_at", value: done },
    { relative: ".claude-state/progress-state.yaml", updates: { "ladder.1-onboard": "done", "next.build": "first-employee" } }
  ];
  for (const patch of patches) {
    const saved = await m.adapters.persistAdapter({ ...common, ...patch });
    if (!saved.ok) return saved;
  }
  return { ok: true, onboarded: true, xray_pending: true };
}

export async function run(command, input) {
  let closure;
  try { closure = (await entryPoints()).verifyBuilderClosure(); } catch { return startupFailure(); }
  if (!closure.ok) return closure;
  if (!COMMANDS.includes(command)) return fail("unknown_command", { usage: COMMANDS.join(" | ") });
  if (command === "verify") return { ok: true, version: closure.version, commands: COMMANDS };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("invalid_input", { detail: "JSON object expected" });
  if (validRoot(input.root) && notesFolderLinked(input.root)) return fail("symlink_escape", { detail: ".claude-state" });
  const m = await load(); if (!m.ok) return m;
  if (command === "readiness") {
    if (!validRoot(input.root)) return fail("invalid_input", { detail: "root must be an existing absolute folder path" });
    return m.readiness.fullReadiness({ root: input.root, surface: input.surface || "claude",
      write_access: input.write_access, evidence: input.evidence });
  }
  if (command === "start") return start(m, input);
  if (command === "slot") return slot(m, input);
  if (command === "brief") return brief(m, input);
  if (command === "brief-check") return briefCheck(m, input);
  if (command === "map-asset") return mapIndex(m, "asset", input);
  if (command === "map-roster") return mapIndex(m, "roster", input);
  if (command === "mark-onboarded") return markOnboarded(m, input);
  if (command === "journals") {
    return validRoot(input.root) ? { ok: true, journals: m.journal.listJournals(input.root) } : fail("invalid_input", { detail: "root" });
  }
  return eventCommand(m, command, input);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  // Cleanup comes first, so a refused or crashed start never leaves input.json behind; a cleanup failure wins.
  // A linked notes folder is refused before the input file is touched, so nothing outside the project is read or deleted.
  const fileAt = rest.indexOf("--json-file");
  const linkedInput = fileAt >= 0 && inputFolderLinked(rest[fileAt + 1]);
  const taken = fileAt >= 0 && !linkedInput ? takeInputFile(rest[fileAt + 1]) : null;
  let result;
  if (linkedInput) result = fail("symlink_escape", { detail: ".claude-state" });
  else if (taken?.failure) result = taken.failure;
  else {
    try {
      const closureFirst = (await entryPoints()).verifyBuilderClosure();
      result = closureFirst;
      if (closureFirst.ok) {
        const read = command === "verify" ? { input: {} } : await readInput(rest, taken);
        result = read.failure || await run(command, read.input === null ? undefined : read.input);
      }
    } catch { result = startupFailure(); }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok && result.root !== "verified") process.exitCode = 2;
}
