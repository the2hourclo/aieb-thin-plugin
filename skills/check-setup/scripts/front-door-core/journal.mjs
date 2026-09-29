import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { acquireLock, assertLock, releaseLock } from "./lock.mjs";
import { resolveTarget, revalidateRoot, nodeWriterContext } from "./readiness.mjs";
import { newWorkspace, confirmRoot, readRecord } from "./identity.mjs";

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const bytesAt = (file) => { try { return fs.readFileSync(file); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } };
const digest = (bytes) => bytes === null ? null : sha(bytes);
const journalDir = (root) => path.join(root, ".claude-state", "transactions");
const checkInternal = (root, file) => resolveTarget(root, path.relative(root, file));
const operationalNames = [
  /^\.claude-state\/(?:workspace\.json|pending-build\.json|builds\/[0-9a-f-]{36}\.json|progress-state\.yaml|onboarding-progress\.json|roadmap-progress\.json)$/i,
  /^BUSINESS-MAP\.md$/i, /^(?:marketing|sales|product|operations|finance|strategy)\/DEPARTMENT\.md$/i,
  /^\.claude-state\/generated\/[\w./-]+$/
];
const answerKeys = /^(?:goal|answers|value|text|reasons|member_words|normalized|trigger|method|result|review_mode|transcript|current_step)$/i;
const storageSources = new Set(["member_choice", "trial_intake_declined", "legacy_reconsent_required", "default_disclosed"]);
const statuses = new Set(["active", "awaiting_answer", "paused", "blocked", "completed", "cancelled", "abandoned"]);
const steps = new Set(["readiness", "job", "today", "ladder", "assets", "build", "first_run", "handover"]);
const rungs = new Set(["no_build_one_off", "no_build_connect_first", "no_build_extend_existing", "asset", "skill", "connect", "system"]);
const outcomes = new Set(["employee_saved", "asset_saved", "done_directly", "extended_existing", "cancelled", "abandoned"]);
export const BLOCKER_CODES = Object.freeze(["prerequisite_needed", "asset_missing", "tool_unavailable",
  "permission_required", "workspace_partial", "other"]);
const blockerCodes = new Set(BLOCKER_CODES);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const isUuid = (value) => typeof value === "string" && uuid.test(value);
const isSha = (value) => typeof value === "string" && sha256.test(value);
const isSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const isPath = (value) => typeof value === "string" && value.length > 0 && !value.includes(String.fromCharCode(0));
const storageAllowed = (row) => onlyKeys(row, ["mode", "source", "disclosed_at_revision"])
  && ["full", "restricted"].includes(row.mode) && storageSources.has(row.source)
  && Number.isInteger(row.disclosed_at_revision) && row.disclosed_at_revision >= 0;

const onlyKeys = (value, names) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every((key) => names.includes(key));
const exactKeys = (value, names) => onlyKeys(value, names) && names.every((key) => Object.hasOwn(value, key));
function canonicalDestination(root, safePath) {
  const canonicalRoot = fs.realpathSync(root);
  let ancestor = safePath;
  while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
  const destination = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, safePath));
  const relative = path.relative(canonicalRoot, destination).replaceAll("\\", "/");
  return relative;
}
const destinationKey = (relative) => process.platform === "win32" ? relative.toLowerCase() : relative;
const validAuthorization = (ref) => onlyKeys(ref, ["kind", "ref", "path"])
  && typeof ref.kind === "string" && /^[a-z_]+$/.test(ref.kind)
  && (ref.ref === undefined || typeof ref.ref === "string" && /^[a-z0-9_-]+$/i.test(ref.ref))
  && (ref.path === undefined || isPath(ref.path));
function restrictedBuildAllowed(row) {
  const required = ["schema_version", "build_id", "workspace_id", "status", "step", "revision",
    "created_at", "updated_at", "storage", "rung", "outstanding_question", "asset_refs",
    "verified_outputs", "blocker", "outcome"];
  if (!onlyKeys(row, [...required, "material_revision"]) || required.some((key) => !Object.hasOwn(row, key))) return false;
  if (row.schema_version !== 1 || !isUuid(row.build_id) || !isUuid(row.workspace_id)
      || !statuses.has(row.status) || !steps.has(row.step) || !Number.isInteger(row.revision) || row.revision < 1
      || !isTimestamp(row.created_at) || !isTimestamp(row.updated_at)
      || !storageAllowed(row.storage) || row.storage.mode !== "restricted"
      || row.material_revision !== undefined && (!Number.isInteger(row.material_revision)
        || row.material_revision < 1 || row.material_revision > row.revision)) return false;
  if (row.rung !== null && (!exactKeys(row.rung, ["kind"]) || !rungs.has(row.rung.kind))) return false;
  if (row.outstanding_question !== null && (!exactKeys(row.outstanding_question,
    ["question_id", "answer_key", "required"]) || typeof row.outstanding_question.question_id !== "string"
    || typeof row.outstanding_question.answer_key !== "string"
    || typeof row.outstanding_question.required !== "boolean")) return false;
  if (!Array.isArray(row.asset_refs) || row.asset_refs.some((item) => !exactKeys(item,
    ["asset_id", "path", "content_sha256"]) || typeof item.asset_id !== "string" || !isPath(item.path)
    || item.content_sha256 !== null && !isSha(item.content_sha256))) return false;
  if (!Array.isArray(row.verified_outputs) || row.verified_outputs.some((item) => !exactKeys(item,
    ["path", "content_sha256"]) || !isPath(item.path) || typeof item.content_sha256 !== "string"
    || !isSha(item.content_sha256))) return false;
  if (row.blocker !== null && (!exactKeys(row.blocker, ["code"]) || !blockerCodes.has(row.blocker.code))) return false;
  if (row.outcome !== null && (!exactKeys(row.outcome, ["kind"]) || !outcomes.has(row.outcome.kind))) return false;
  return true;
}

function restrictedWorkspaceAllowed(row) {
  return exactKeys(row, ["schema_version", "workspace_id", "created_at", "root_confirmations"])
    && row.schema_version === 1 && isUuid(row.workspace_id) && isTimestamp(row.created_at)
    && Array.isArray(row.root_confirmations)
    && row.root_confirmations.every((confirmation) => exactKeys(confirmation,
      ["canonical_path", "surface", "evidence", "confirmed_at"])
      && typeof confirmation.canonical_path === "string" && path.isAbsolute(confirmation.canonical_path)
      && ["codex", "claude", "cowork"].includes(confirmation.surface)
      && isTimestamp(confirmation.confirmed_at)
      && Array.isArray(confirmation.evidence)
      && confirmation.evidence.every((entry) => exactKeys(entry, ["kind", "detail", "observed_at"])
        && ["host_attached_folder", "workspace_selected", "host_permission_grant", "write_readback", "parsed_file"].includes(entry.kind)
        && (entry.observed_at === null || isTimestamp(entry.observed_at))
        && onlyKeys(entry.detail, ["root", "scope", "tool", "session_id", "process_id", "operations"])
        && isPath(entry.detail.root)
        && (entry.detail.scope === undefined || entry.detail.scope === null || typeof entry.detail.scope === "string")
        && (entry.detail.tool === undefined || typeof entry.detail.tool === "string")
        && (entry.detail.session_id === undefined || entry.detail.session_id === null || typeof entry.detail.session_id === "string")
        && (entry.detail.process_id === undefined || Number.isInteger(entry.detail.process_id))
        && (entry.detail.operations === undefined || Array.isArray(entry.detail.operations)
          && entry.detail.operations.every((operation) => typeof operation === "string"))));
}

function restrictedPointerAllowed(row) {
  return exactKeys(row, ["schema_version", "workspace_id", "build_id", "set_at"])
    && row.schema_version === 1 && isUuid(row.workspace_id) && isUuid(row.build_id)
    && isTimestamp(row.set_at);
}

// Fields the shipped onboarding has always written next to the phases. They are progress/status lines (no member
// answers) and the adapters only ever patch other spans, so they are kept byte for byte. Only adapter targets
// (metadata_only) may carry them, and only in these bounded shapes. The backup repo URL had no named field before
// github_repo, so the key names an agent plausibly chose are accepted too, holding only a plain github.com repo URL.
// Checked by character code rather than a regex escape, so a member copy retyped by an agent stays byte-exact.
function hasControlCharacter(text) { for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32) return true; return false; }
const githubRepoUrl = (value) => typeof value === "string"
  && /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(?:\.git)?\/?$/.test(value);
const legacyOnboardingFields = Object.freeze({
  git: (value) => value === "available" || value === "unavailable",
  github_backup: (value) => ["pending", "enabled", "skipped", "deferred"].includes(value),
  current_step: (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && !hasControlCharacter(value),
  ...Object.fromEntries(["github_repo", "github_repo_url", "github_url", "github_backup_url", "repo_url"].map((key) => [key, githubRepoUrl]))
});
const legacyJourneyComment = "per the ontology spec: null until the X-Ray finishes";
const legacyJourneySayLine = /^  say: "([^"\\]{1,300})"$/;
const legacyJourneySay = { test: (line) => { const said = legacyJourneySayLine.exec(line); return Boolean(said) && !hasControlCharacter(said[1]); } };

function restrictedLegacyStateAllowed(relative, row, attested = false) {
  if (relative.endsWith("onboarding-progress.json")) {
    const legacy = attested ? Object.keys(legacyOnboardingFields) : [];
    return onlyKeys(row, ["started_at", "completed_at", "plugin_version", "phases", ...legacy])
      && legacy.every((name) => row[name] === undefined || legacyOnboardingFields[name](row[name]))
      && onlyKeys(row.phases, ["scaffold", "business-os"])
      && Object.values(row.phases).every((value) => ["pending", "in-progress", "completed", "skipped"].includes(value))
      && [row.started_at, row.completed_at, row.plugin_version].every((value) => value === undefined || value === null || typeof value === "string");
  }
  if (relative.endsWith("roadmap-progress.json")) {
    return onlyKeys(row, ["started_at", "updated_at", "plugin_version", "stages"])
      && onlyKeys(row.stages, ["3-first-skill", "4-system", "5-autonomy"])
      && Object.values(row.stages).every((value) => ["pending", "in-progress", "completed", "skipped"].includes(value))
      && [row.started_at, row.updated_at, row.plugin_version].every((value) => value === undefined || value === null || typeof value === "string");
  }
  return generatedMetadataAllowed(row);
}

function generatedMetadataAllowed(value) {
  const permitted = new Set(["schema_version", "workspace_id", "build_id", "status", "step", "revision",
    "material_revision", "created_at", "updated_at", "set_at", "storage", "mode", "source", "disclosed_at_revision",
    "kind", "question_id", "answer_key", "required", "asset_id", "path", "content_sha256",
    "blocker", "code", "outcome", "rung", "verified_outputs", "asset_refs"]);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, child]) => {
    if (!permitted.has(key) || answerKeys.test(key)) return false;
    switch (key) {
      case "schema_version": return child === 1;
      case "workspace_id": case "build_id": return isUuid(child);
      case "status": return statuses.has(child);
      case "step": return steps.has(child);
      case "revision": case "material_revision": return Number.isInteger(child) && child >= 1;
      case "disclosed_at_revision": return Number.isInteger(child) && child >= 0;
      case "created_at": case "updated_at": case "set_at": return isTimestamp(child);
      case "storage": return storageAllowed(child) && child.mode === "restricted";
      case "mode": return child === "restricted";
      case "source": return storageSources.has(child);
      case "kind": return rungs.has(child) || outcomes.has(child) || ["skill", "asset", "document"].includes(child);
      case "question_id": case "answer_key": return typeof child === "string";
      case "required": return typeof child === "boolean";
      case "asset_id": return isSlug(child);
      case "path": return isPath(child);
      case "content_sha256": return child === null || isSha(child);
      case "code": return blockerCodes.has(child);
      case "blocker": return child === null || exactKeys(child, ["code"]) && blockerCodes.has(child.code);
      case "rung": return child === null || exactKeys(child, ["kind"]) && rungs.has(child.kind);
      case "outcome": return child === null || exactKeys(child, ["kind"]) && outcomes.has(child.kind);
      case "asset_refs": return Array.isArray(child) && child.every((item) => exactKeys(item,
        ["asset_id", "path", "content_sha256"]) && isSlug(item.asset_id)
        && isPath(item.path) && (item.content_sha256 === null || isSha(item.content_sha256)));
      case "verified_outputs": return Array.isArray(child) && child.every((item) => exactKeys(item,
        ["path", "content_sha256"]) && isPath(item.path) && isSha(item.content_sha256));
      default: return false;
    }
  });
}

function restrictedTextAllowed(relative, text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (relative.endsWith(".yaml")) {
    let section = "";
    return lines.every((line) => {
      const bare = line.endsWith(` # ${legacyJourneyComment}`)
        ? line.slice(0, line.length - legacyJourneyComment.length - 3).replace(/\s+$/, "") : line;
      const top = /^([a-z_]+):/.exec(bare);
      if (top) section = top[1];
      return !bare.trim()
        || /^(?:version|last_updated|onboarding|ladder|next):(?:\s*(?:[0-9TZ:.-]+)?)?$/.test(bare)
        || /^  [a-z0-9_-]+:\s*(?:done|pending|skipped|true|false|null|first-employee|2-map|[0-9TZ:.-]+)$/.test(bare)
        || section === "next" && legacyJourneySay.test(bare);
    });
  }
  if (relative.endsWith(".md")) return lines.every((line) => !line.trim()
    || /^#(?:#)? (?:Business Map|Where things live|AI Employees|Assets|Departments)$/.test(line)
    || /^\| (?:id \| what \| path \| owner dept \| used by|employee id \| name \| job \| invocation \| skill path \| asset ids) \|$/.test(line)
    || /^\| (?:--- \| ){4,5}--- \|$/.test(line)
    || /^\| [a-z0-9-]+ \|\s*\|\s*(?:\|\s*)?(?:[.a-z0-9_/-]+)?(?: \|\s*[a-z0-9-]*){2,3} \|$/.test(line)
    || /^- \[[a-z-]+\]\([a-z-]+\/DEPARTMENT\.md\)$/.test(line));
  return false;
}

export function validateTarget(root, target, storage) {
  if (!storageAllowed(storage)) {
    return { ok: false, code: storage?.mode && Number.isInteger(storage?.disclosed_at_revision)
      ? "storage_policy_violation" : "storage_policy_unresolved" };
  }
  if (!target || !["operational_state", "requested_deliverable"].includes(target.purpose)
      || !isPath(target.path) || !target.authorization_ref
      || target.after !== null && typeof target.after !== "string" && !Buffer.isBuffer(target.after)
      || target.metadata_only !== undefined && typeof target.metadata_only !== "boolean") {
    return { ok: false, code: "storage_policy_violation", detail: "purpose and authorization required" };
  }
  if (!validAuthorization(target.authorization_ref)) return { ok: false, code: "storage_policy_violation" };
  const safe = resolveTarget(root, target.path);
  if (!safe.ok) return safe;
  const relative = canonicalDestination(root, safe.path);
  const key = destinationKey(relative);
  const reserved = /^\.claude-state\//i.test(relative) || /^BUSINESS-MAP\.md$/i.test(relative)
    || /^(?:marketing|sales|product|operations|finance|strategy)\/DEPARTMENT\.md$/i.test(relative);
  if (reserved && target.purpose !== "operational_state") {
    return { ok: false, code: "storage_policy_violation", detail: "reserved operational path" };
  }
  if (target.purpose === "operational_state" && !operationalNames.some((re) => re.test(relative))) {
    return { ok: false, code: "storage_policy_violation", detail: "path outside protected operational set" };
  }
  let authorizedPath = null;
  if (target.authorization_ref.path !== undefined) {
    const authorized = resolveTarget(root, target.authorization_ref.path);
    if (!authorized.ok) return { ok: false, code: "storage_policy_violation" };
    authorizedPath = canonicalDestination(root, authorized.path);
  }
  if (target.purpose === "requested_deliverable" && (target.authorization_ref.kind !== "explicit_member_request"
      || authorizedPath === null || destinationKey(authorizedPath) !== destinationKey(relative))) {
    return { ok: false, code: "storage_policy_violation", detail: "deliverable lacks explicit request" };
  }
  const content = target.after === null ? null : Buffer.from(target.after);
  if (storage.mode === "restricted" && target.purpose === "operational_state" && content !== null) {
    // Restricted operational records are JSON metadata. Text adapters may
    // update only their existing, separately validated metadata spans; callers
    // pass an explicit metadata-only attestation for those targets.
    if (key.endsWith(".json")) {
      let parsed;
      try { parsed = JSON.parse(content.toString("utf8")); } catch { return { ok: false, code: "storage_policy_violation" }; }
      const allowed = key.startsWith(".claude-state/builds/") ? restrictedBuildAllowed(parsed)
        : key === ".claude-state/workspace.json" ? restrictedWorkspaceAllowed(parsed)
        : key === ".claude-state/pending-build.json" ? restrictedPointerAllowed(parsed)
        : restrictedLegacyStateAllowed(key, parsed, target.metadata_only === true);
      if (!allowed) {
        return { ok: false, code: "storage_policy_violation" };
      }
    } else if (target.metadata_only !== true || !restrictedTextAllowed(key, content.toString("utf8"))) {
      return { ok: false, code: "storage_policy_violation" };
    }
  }
  return { ok: true, path: safe.path, relative, key, bytes: content };
}

function durableReplace(root, file, bytes, beforeReadback = null) {
  const safe = checkInternal(root, file);
  if (!safe.ok) throw Object.assign(new Error("internal path escapes root"), { code: safe.code });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${crypto.randomUUID()}`;
  const safeTemp = checkInternal(root, temp);
  if (!safeTemp.ok) throw Object.assign(new Error("temporary path escapes root"), { code: safeTemp.code });
  const handle = fs.openSync(temp, "wx", 0o600);
  try { fs.writeFileSync(handle, bytes); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  if (!checkInternal(root, temp).ok || !checkInternal(root, file).ok) {
    throw Object.assign(new Error("replacement path escapes root"), { code: "symlink_escape" });
  }
  fs.renameSync(temp, file);
  beforeReadback?.();
  if (digest(bytesAt(file)) !== sha(bytes)) throw new Error(`read-back mismatch: ${file}`);
}

function journalPath(root, id) { return path.join(journalDir(root), `${id}.json`); }
export function listJournals(root) {
  const dir = journalDir(root);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name)).sort() : [];
}

function validateJournalRow(root, row) {
  if (!storageAllowed(row?.storage)) return { ok: false, code: "storage_policy_violation" };
  if (row.storage.mode === "restricted" && !onlyKeys(row, ["txn_id", "transition", "storage", "targets", "progress"])) {
    return { ok: false, code: "storage_policy_violation" };
  }
  if (!onlyKeys(row, ["txn_id", "transition", "storage", "targets", "progress"])
      || !isUuid(row.txn_id) || typeof row.transition !== "string" || !/^[a-z_]+$/.test(row.transition)
      || !storageAllowed(row.storage) || !Array.isArray(row.targets) || !row.targets.length
      || !Array.isArray(row.progress) || row.progress.length !== row.targets.length
      || row.progress.some((value) => !["pending", "verified"].includes(value))) {
    return { ok: false, code: "unreadable" };
  }
  const paths = new Set();
  for (const target of row.targets) {
    if (row.storage.mode === "restricted" && !onlyKeys(target,
      ["path", "purpose", "authorization_ref", "metadata_only", "before_hash", "after_hash", "after_content"])) {
      return { ok: false, code: "storage_policy_violation" };
    }
    if (!onlyKeys(target, ["path", "purpose", "authorization_ref", "metadata_only", "before_hash", "after_hash", "after_content"])
        || typeof target.path !== "string"
        || !(target.before_hash === null || isSha(target.before_hash))
        || !(target.after_hash === null || isSha(target.after_hash))
        || !(target.after_content === null || typeof target.after_content === "string")) {
      return { ok: false, code: "unreadable" };
    }
    if (!validAuthorization(target.authorization_ref)) {
      return { ok: false, code: "storage_policy_violation" };
    }
    const encoded = target.after_content;
    if (encoded !== null && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
        || Buffer.from(encoded, "base64").toString("base64") !== encoded)) return { ok: false, code: "unreadable" };
    const bytes = encoded === null ? null : Buffer.from(encoded, "base64");
    if (digest(bytes) !== target.after_hash) return { ok: false, code: "conflict_external_change", path: target.path };
    const allowed = validateTarget(root, { path: target.path, after: bytes, purpose: target.purpose,
      authorization_ref: target.authorization_ref, metadata_only: target.metadata_only }, row.storage);
    if (!allowed.ok) return allowed;
    if (paths.has(allowed.key)) return { ok: false, code: "unreadable" };
    paths.add(allowed.key);
  }
  return { ok: true };
}

function applyJournal(root, row, file, nonce, interrupt = null) {
  const journalSafe = checkInternal(root, file); if (!journalSafe.ok) return journalSafe;
  for (let i = 0; i < row.targets.length; i++) {
    const target = row.targets[i];
    const lock = assertLock(root, nonce);
    if (!lock.ok) return lock;
    const safe = resolveTarget(root, target.path);
    if (!safe.ok) return safe;
    const current = digest(bytesAt(safe.path));
    if (current !== target.before_hash && current !== target.after_hash) {
      return { ok: false, code: "conflict_external_change", path: target.path, expected: target.before_hash, observed: current };
    }
    if (current !== target.after_hash) {
      interrupt?.("before", i, target.path);
      if (target.after_content === null) {
        if (fs.existsSync(safe.path)) fs.unlinkSync(safe.path);
      } else durableReplace(root, safe.path, Buffer.from(target.after_content, "base64"),
        () => interrupt?.("before_readback", i, target.path));
      interrupt?.("after", i, target.path);
    }
    if (digest(bytesAt(safe.path)) !== target.after_hash) return { ok: false, code: "write_verification_failed", path: target.path };
    row.progress[i] = "verified";
    durableReplace(root, file, Buffer.from(JSON.stringify(row)));
  }
  if (!checkInternal(root, file).ok) return { ok: false, code: "symlink_escape" };
  fs.unlinkSync(file);
  return { ok: true, txn_id: row.txn_id };
}

export function recoverJournals(root, { nonce, storage = null } = {}) {
  const safeDir = checkInternal(root, journalDir(root)); if (!safeDir.ok) return safeDir;
  for (const name of listJournals(root)) {
    const file = path.join(journalDir(root), name);
    const safeFile = checkInternal(root, file); if (!safeFile.ok) return safeFile;
    let row;
    try { row = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { ok: false, code: "unreadable", path: file }; }
    const valid = validateJournalRow(root, row);
    if (!valid.ok) return { ...valid, journal: file };
    const applied = applyJournal(root, row, file, nonce);
    if (!applied.ok) return applied;
  }
  return { ok: true };
}

export async function recoverPending(root, rootResult, lockOptions = {}) {
  const currentRoot = revalidateRoot(root, rootResult, { writer: nodeWriterContext("write") });
  if (!currentRoot.ok) return currentRoot;
  const safeDir = checkInternal(root, journalDir(root)); if (!safeDir.ok) return safeDir;
  let acquired;
  try { acquired = await acquireLock(root, lockOptions); }
  catch (error) { return { ok: false, code: ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed",
    recovery: { error: error?.message, error_code: error?.code } }; }
  if (!acquired.ok) return acquired;
  try { return recoverJournals(root, { nonce: acquired.nonce }); }
  finally { releaseLock(root, acquired.nonce); }
}

export async function transact({ root, rootResult, storage, transition, targets, interrupt = null,
  lockOptions = {}, lockNonce = null, clock = () => new Date() }) {
  const currentRoot = revalidateRoot(root, rootResult, { writer: nodeWriterContext("write") });
  if (!currentRoot.ok) return currentRoot;
  const safeDir = checkInternal(root, journalDir(root)); if (!safeDir.ok) return safeDir;
  if (typeof transition !== "string" || !/^[a-z_]+$/.test(transition)) {
    return { ok: false, code: "storage_policy_violation" };
  }
  if (!Array.isArray(targets) || !targets.length || targets.some((item) => !item
      || !validAuthorization(item.authorization_ref))) {
    return { ok: false, code: "storage_policy_violation" };
  }
  const firstCheck = targets.map((target) => validateTarget(root, target, storage)).find((item) => !item.ok);
  if (firstCheck) return firstCheck;
  if (!targets.some((item) => validateTarget(root, item, storage).relative === ".claude-state/workspace.json")) {
    const identityFile = path.join(root, ".claude-state", "workspace.json");
    const existing = readRecord(identityFile, { now: clock() });
    if (!existing.ok && existing.code !== "missing") return existing;
    const surface = rootResult.instruction_file === "AGENTS.md" ? "codex" : "claude";
    const next = existing.ok ? confirmRoot(existing.value, { root, surface, evidence: rootResult, clock })
      : newWorkspace({ root, surface, evidence: rootResult, clock });
    if (!next.ok) return next;
    if (!existing.ok || next.changed) targets = [{ path: ".claude-state/workspace.json", after: JSON.stringify(next.value),
      expected_before_hash: digest(bytesAt(identityFile)), purpose: "operational_state",
      authorization_ref: { kind: "workspace_identity" } }, ...targets];
  }
  // Prevalidate all content before creating even the lock directory or journal.
  const checked = targets.map((target) => validateTarget(root, target, storage));
  const invalid = checked.find((item) => !item.ok);
  if (invalid) return invalid;
  if (new Set(checked.map((item) => item.key)).size !== checked.length) {
    return { ok: false, code: "conflict_external_change", detail: "duplicate target destination" };
  }
  // Every caller receives compare-and-swap semantics, including callers that
  // did not supply an explicit before hash.
  try { targets = targets.map((target, i) => Object.hasOwn(target, "expected_before_hash") ? target
    : { ...target, expected_before_hash: digest(bytesAt(checked[i].path)) }); }
  catch (error) { return { ok: false, code: ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed",
    recovery: { error: error?.message, error_code: error?.code } }; }
  let lock;
  try { lock = lockNonce ? { ...assertLock(root, lockNonce), nonce: lockNonce } : await acquireLock(root, lockOptions); }
  catch (error) { return { ok: false, code: ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed",
    recovery: { error: error?.message, error_code: error?.code } }; }
  if (!lock.ok) return lock;
  try {
    const recovered = recoverJournals(root, { nonce: lock.nonce, storage });
    if (!recovered.ok) return recovered;
    const id = crypto.randomUUID();
    const row = { txn_id: id, transition, storage, targets: targets.map((target, i) => {
      const before = bytesAt(checked[i].path);
      if (Object.hasOwn(target, "expected_before_hash") && digest(before) !== target.expected_before_hash) {
        return { conflict: true, path: checked[i].relative };
      }
      const after = checked[i].bytes;
      return { path: checked[i].relative, purpose: target.purpose, authorization_ref: target.authorization_ref,
        metadata_only: target.metadata_only === true, before_hash: digest(before), after_hash: digest(after),
        after_content: after === null ? null : after.toString("base64") };
    }), progress: targets.map(() => "pending") };
    const conflict = row.targets.find((target) => target.conflict);
    if (conflict) return { ok: false, code: "conflict_external_change", path: conflict.path };
    const held = assertLock(root, lock.nonce);
    if (!held.ok) return held;
    if (!checkInternal(root, journalDir(root)).ok) return { ok: false, code: "symlink_escape" };
    fs.mkdirSync(journalDir(root), { recursive: true });
    const file = journalPath(root, id);
    durableReplace(root, file, Buffer.from(JSON.stringify(row)));
    const applied = applyJournal(root, row, file, lock.nonce, interrupt);
    return applied.ok ? { ...applied, evidence: { kind: "write_readback",
      detail: { paths: row.targets.map((target) => target.path) }, observed_at: new Date().toISOString() } } : applied;
  } catch (error) {
    return { ok: false, code: error?.code === "symlink_escape" ? "symlink_escape"
      : ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed",
      recovery: { error: error?.message, error_code: error?.code, journals: listJournals(root) } };
  } finally { if (!lockNonce) releaseLock(root, lock.nonce); }
}
