import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const result = (root, reason, next_action, more = {}) => ({ root, reason, next_action, ...more });
const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
const beneath = (base, target) => { const rel = path.relative(base, target); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
const evidenceFor = (evidence, kinds) => evidence.find((e) => kinds.includes(e.kind));
const matchingRoot = (candidate, root) => typeof candidate === "string" && path.isAbsolute(candidate)
  && same(path.resolve(candidate), path.resolve(root));
const folderWriteScopes = new Set(["workspace", "folder", "attached_folder", "codex_workspace_write", "folder_write"]);
const grantCoversWriter = (detail, writer) => {
  const restricted = detail?.tool !== undefined || detail?.session_id !== undefined
    || detail?.process_id !== undefined || detail?.operations !== undefined;
  if (restricted && !writer) return false;
  return (!detail?.tool || detail.tool === writer?.tool)
    && (detail?.session_id === undefined || detail.session_id === writer?.session_id)
    && (detail?.process_id === undefined || detail.process_id === writer?.process_id)
    && (detail?.operations === undefined || Array.isArray(detail.operations)
      && detail.operations.includes(writer?.operation));
};
export const nodeWriterContext = (operation = "write") => ({ tool: "node_fs", process_id: process.pid,
  session_id: process.env.CODEX_SESSION_ID || null, operation });

export function boundary(root, { home = os.homedir(), temp = os.tmpdir(), allowCoworkMount = false } = {}) {
  if (!root || !path.isAbsolute(root)) return { ok: false, code: "unknown_root" };
  const resolved = path.resolve(root);
  let canonical;
  try { canonical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved; }
  catch (error) { return { ok: false, code: ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed" }; }
  for (const candidate of [resolved, canonical]) {
    if (same(candidate, path.parse(candidate).root)) return { ok: false, code: "drive_root" };
    if (same(candidate, path.resolve(home))) return { ok: false, code: "home_dir" };
    const lower = candidate.replaceAll("\\", "/").toLowerCase();
    if (!allowCoworkMount && (beneath(path.resolve(temp), candidate) || /(?:^|\/)(?:tmp|temp|scratch)(?:\/|$)/i.test(lower))) {
      return { ok: false, code: "transient_dir" };
    }
    if (/(?:^|\/)(?:appdata|library\/caches|program files(?: \(x86\))?|windows|system32|\.cache|plugins\/cache)(?:\/|$)/i.test(lower)) {
      return { ok: false, code: "system_or_cache_dir" };
    }
  }
  return { ok: true, canonical_path: canonical };
}

export function resolveTarget(root, relative) {
  if (!relative || path.isAbsolute(relative) || path.win32.isAbsolute(relative)) return { ok: false, code: "symlink_escape" };
  const canonical = fs.realpathSync(root);
  const target = path.resolve(root, relative);
  if (!beneath(path.resolve(root), target)) return { ok: false, code: "symlink_escape" };
  let current = target;
  while (!fs.existsSync(current) && current !== path.dirname(current)) current = path.dirname(current);
  try {
    const real = fs.realpathSync(current);
    if (!beneath(canonical, real)) return { ok: false, code: "symlink_escape" };
  } catch { return { ok: false, code: "symlink_escape" }; }
  return { ok: true, path: target };
}

export function evaluateReadiness({ root, evidence = [], surface = "codex", access = "unknown", boundaryOptions = {} } = {}) {
  const selected = evidenceFor(evidence, ["host_attached_folder", "workspace_selected"]);
  if (surface === "cowork" && !selected) return result("unverified", "cowork_folder_not_attached", "attach_folder");
  if (!selected || !root) return result("unverified", "unknown_root", "confirm_root");
  if (!matchingRoot(selected.detail?.root, root)) return result("unverified", "unknown_root", "confirm_root");
  const checked = boundary(root, { ...boundaryOptions, allowCoworkMount: surface === "cowork" && selected.kind === "host_attached_folder" });
  if (!checked.ok) return checked.code === "unknown_root" ? result("unverified", "unknown_root", "confirm_root")
    : result("blocked", checked.code, "choose_project_folder");
  try {
    if (!fs.statSync(checked.canonical_path).isDirectory()) return result("unverified", "unknown_root", "confirm_root");
  } catch (error) {
    if (error?.code === "ENOENT") return result("unverified", "unknown_root", "confirm_root");
    return result("blocked", ["EACCES", "EPERM"].includes(error?.code) ? "read_only" : "write_verification_failed", "choose_project_folder");
  }
  if (access === "read_only") return result("blocked", "read_only", "choose_project_folder", { selected_root_evidence: selected });
  const grant = evidenceFor(evidence, ["host_permission_grant"]);
  const scopedGrant = grant && matchingRoot(grant.detail?.root, root)
    && folderWriteScopes.has(grant.detail?.scope);
  if (!scopedGrant) return result("unverified", "write_access_unverified", "verify_write_access", { selected_root_evidence: selected });
  return result("verified", null, "none", { canonical_path: checked.canonical_path,
    selected_root_evidence: selected, writable_access_evidence: grant,
    instruction_file: surface === "codex" ? "AGENTS.md" : "CLAUDE.md",
    skill_home: surface === "codex" ? ".agents/skills" : ".claude/skills" });
}

// Members and workflows attest host facts in three words; this builds the exact
// evidence entries the readiness table needs. Only "granted" adds writable-access evidence.
export function hostEvidence({ root, surface = "codex", write_access = "unknown", now = new Date() } = {}) {
  const observed_at = now.toISOString();
  const evidence = [{ kind: surface === "cowork" ? "host_attached_folder" : "workspace_selected",
    detail: { root }, observed_at }];
  if (write_access === "granted") {
    evidence.push({ kind: "host_permission_grant", detail: { root, scope: "workspace" }, observed_at });
  }
  return evidence;
}

export function rootFromHost({ root, surface = "codex", write_access = "unknown", evidence = null, boundaryOptions = {} } = {}) {
  const list = Array.isArray(evidence) ? evidence : hostEvidence({ root, surface, write_access });
  return evaluateReadiness({ root, evidence: list, surface, boundaryOptions,
    access: write_access === "read_only" ? "read_only" : "unknown" });
}

// The notes folder (.claude-state) and its scripts folder must be real folders inside the project. A link there,
// or a folder that cannot be checked, could carry any save outside the project, so every route stops here first.
export function notesFolderSafe(root) {
  let current = root;
  for (const part of [".claude-state", "front-door-scripts"]) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) return false; }
    catch (error) { return error?.code === "ENOENT"; }
  }
  return true;
}

// Read-only: evaluating readiness never writes.
export function fullReadiness(input = {}) {
  const rootResult = rootFromHost(input);
  if (rootResult.root === "verified" && !notesFolderSafe(input.root)) {
    return { ...rootResult, ok: false, code: "symlink_escape", detail: ".claude-state", notes_folder: "unsafe",
      workspace_state: { workspace: "partial", missing: ["onboarding_record"], next_action: "unsafe_notes_folder" } };
  }
  const workspace_state = reconcileWorkspace({ root: input.root, surface: input.surface || "codex", rootResult });
  return { ...rootResult, ok: rootResult.root === "verified", workspace_state };
}

export function revalidateRoot(root, prior, { access = "unknown", writer = null } = {}) {
  if (prior?.root !== "verified") return { ok: false, code: "root_unverified" };
  const evidence = [prior.selected_root_evidence, prior.writable_access_evidence].filter(Boolean);
  const surface = prior.instruction_file === "AGENTS.md" ? "codex"
    : prior.selected_root_evidence?.kind === "host_attached_folder" ? "cowork" : "claude";
  const current = evaluateReadiness({ root, evidence, surface, access });
  if (current.root !== "verified" || !same(current.canonical_path, prior.canonical_path)) {
    return { ok: false, code: current.reason || "root_unverified", root_result: current };
  }
  if (!grantCoversWriter(current.writable_access_evidence?.detail, writer)) {
    return { ok: false, code: "write_access_unverified", root_result: current };
  }
  return { ok: true, result: current };
}

export async function verifyWriteAccess({ root, evidence = [], surface = "codex", access = "unknown", fileTool,
  boundaryOptions = {}, nonce = crypto.randomUUID() }) {
  const prior = evaluateReadiness({ root, evidence, surface, access, boundaryOptions });
  if (prior.root === "blocked" || prior.reason !== "write_access_unverified" || !fileTool) return prior;
  const relative = `.aieb-write-probe-${nonce}`;
  const target = resolveTarget(root, relative);
  if (!target.ok) return result("blocked", "symlink_escape", "none");
  const content = "AIEB write access probe\n";
  const recovery = { probe_path: target.path, created: false, read_back: false, removed: false };
  try {
    if (await fileTool.exists(target.path)) throw Object.assign(new Error("probe destination exists"), { code: "EEXIST" });
    const grant = await fileTool.createExclusive(target.path, content);
    recovery.created = true;
    const read = await fileTool.read(target.path);
    if (read !== content) throw new Error("probe read-back mismatch");
    recovery.read_back = true;
    if (!resolveTarget(root, relative).ok) throw new Error("probe path changed before cleanup");
    await fileTool.remove(target.path);
    recovery.removed = !(await fileTool.exists(target.path));
    if (!recovery.removed) throw new Error("probe removal not verified");
    const reportedScope = grant?.scope;
    const folderGrant = folderWriteScopes.has(reportedScope) && matchingRoot(grant?.root, root)
      ? { kind: "host_permission_grant", detail: { root, scope: reportedScope,
        ...(grant.tool !== undefined ? { tool: grant.tool } : {}),
        ...(grant.session_id !== undefined ? { session_id: grant.session_id } : {}),
        ...(grant.process_id !== undefined ? { process_id: grant.process_id } : {}),
        ...(grant.operations !== undefined ? { operations: grant.operations } : {}) }, observed_at: new Date().toISOString() }
      : null;
    if (folderGrant) return { ...evaluateReadiness({ root, evidence: [...evidence, folderGrant], surface, access,
      boundaryOptions }), observed_writability: true, host_reported_grant: grant, recovery };
    return result("unverified", "write_access_unverified", "verify_write_access", {
      observed_writability: true, host_reported_grant: grant ?? null, recovery
    });
  } catch (error) {
    const code = error?.code === "EACCES" || error?.code === "EPERM" ? "read_only" : "write_verification_failed";
    return result("blocked", code, "choose_project_folder", { recovery: { ...recovery, error: error?.message, error_code: error?.code } });
  }
}

export function reconcileWorkspace({ root, surface = "codex", rootResult, onboarding = null } = {}) {
  if (rootResult?.root === "blocked") return { workspace: "blocked", missing: [], next_action: rootResult.next_action };
  if (rootResult?.root !== "verified") return { workspace: "unverified", missing: [], next_action: "confirm_root" };
  const instruction = surface === "codex" ? "AGENTS.md" : "CLAUDE.md";
  const skillHome = surface === "codex" ? ".agents/skills" : ".claude/skills";
  const missing = [];
  if (!fs.existsSync(path.join(root, skillHome))) missing.push("scaffold");
  const instructionText = fs.existsSync(path.join(root, instruction)) ? fs.readFileSync(path.join(root, instruction), "utf8") : "";
  if (!instructionText.includes("BUSINESS-MAP.md")) missing.push("instruction_block");
  const map = path.join(root, "BUSINESS-MAP.md");
  const mapText = fs.existsSync(map) ? fs.readFileSync(map, "utf8") : "";
  if (!mapText.trim()) missing.push("business_map");
  const linkedDepartments = [...mapText.matchAll(/\]\(([^)\r\n]+)\/DEPARTMENT\.md\)/g)]
    .map((match) => match[1])
    .filter((dir) => !path.isAbsolute(dir) && !path.win32.isAbsolute(dir)
      && !dir.split(/[\\/]/).includes("..") && !/^[a-z][a-z\d+.-]*:/i.test(dir)
      && beneath(path.resolve(root), path.resolve(root, dir)));
  const departments = linkedDepartments.length ? linkedDepartments
    : ["marketing", "sales", "product", "operations", "finance", "strategy"];
  if (!departments.every((d) => fs.existsSync(path.join(root, d)))) missing.push("departments");
  let row = onboarding;
  if (!row) try { row = JSON.parse(fs.readFileSync(path.join(root, ".claude-state", "onboarding-progress.json"), "utf8")); }
  catch { row = null; }
  let legacyDone = false;
  try { legacyDone = /^  1-onboard:\s*done\s*$/m.test(fs.readFileSync(path.join(root, ".claude-state", "progress-state.yaml"), "utf8")); }
  catch { /* no legacy journey */ }
  if (!(row?.phases?.scaffold === "completed" && row?.phases?.["business-os"] === "completed") && !legacyDone) missing.push("onboarding_record");
  return { workspace: missing.length ? "partial" : "ready", missing,
    next_action: !missing.length ? "none" : missing.some((x) => x !== "onboarding_record") ? "repair_scaffold" : "run_onboard_return_mode" };
}
