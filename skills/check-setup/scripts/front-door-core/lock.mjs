import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveTarget } from "./readiness.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const paths = (root) => {
  const base = path.join(root, ".claude-state", "locks");
  return { base, primary: path.join(base, "state.lock"), guard: path.join(base, "state.lock.recover") };
};
const checkedPaths = (root) => {
  const p = paths(root);
  for (const file of [p.base, p.primary, p.guard]) {
    const safe = resolveTarget(root, path.relative(root, file));
    if (!safe.ok) return safe;
  }
  return { ok: true, ...p };
};
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const writeExclusive = (file, row) => {
  const handle = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(row)); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
};
const processAbsent = (pid) => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error?.code === "ESRCH") return true; throw error; }
};

export function processScopeEvidence(scopeIdentity = null) {
  // Host identity is not enough to establish a common PID namespace. A host
  // adapter may supply a verified namespace/boot identity; absent it, orphan
  // recovery remains unavailable by design.
  return scopeIdentity?.verified === true && typeof scopeIdentity.identity === "string" && scopeIdentity.identity
    ? { platform: process.platform, identity: scopeIdentity.identity } : null;
}

function existingGuardResult(file, scopeIdentity) {
  const guard = read(file);
  const ownScope = processScopeEvidence(scopeIdentity);
  if (!guard || !ownScope || !guard.process_scope
      || JSON.stringify(ownScope) !== JSON.stringify(guard.process_scope)
      || guard.hostname !== os.hostname()) return { ok: false, code: "recovery_required" };
  try { return processAbsent(guard.pid) ? { ok: false, code: "recovery_required" }
    : { ok: false, code: "conflict_lock" }; }
  catch { return { ok: false, code: "recovery_required" }; }
}

export async function acquireLock(root, { timeoutMs = 1000, backoffMs = 25, clock = () => new Date(),
  scopeIdentity = null, onCreated = null } = {}) {
  const p = checkedPaths(root); if (!p.ok) return p;
  fs.mkdirSync(p.base, { recursive: true });
  const started = Date.now();
  const owner_nonce = crypto.randomUUID();
  while (Date.now() - started <= timeoutMs) {
    const stillSafe = checkedPaths(root); if (!stillSafe.ok) return stillSafe;
    if (fs.existsSync(p.guard)) return existingGuardResult(p.guard, scopeIdentity);
    const row = { owner_nonce, pid: process.pid, hostname: os.hostname(), created_at: clock().toISOString(),
      process_scope: processScopeEvidence(scopeIdentity) };
    try { writeExclusive(p.primary, row); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await sleep(backoffMs);
      continue;
    }
    try {
      if (onCreated) await onCreated(row);
      if (fs.existsSync(p.guard)) {
        releaseLock(root, owner_nonce);
        return { ok: false, code: "conflict_lock" };
      }
      return { ok: true, nonce: owner_nonce, row };
    } catch (error) { releaseLock(root, owner_nonce); throw error; }
  }
  return { ok: false, code: "conflict_lock" };
}

export function assertLock(root, nonce) {
  const p = checkedPaths(root); if (!p.ok) return p;
  if (fs.existsSync(p.guard)) return { ok: false, code: "conflict_lock" };
  return read(p.primary)?.owner_nonce === nonce ? { ok: true } : { ok: false, code: "conflict_lock_owner" };
}

export function releaseLock(root, nonce) {
  const p = checkedPaths(root); if (!p.ok) return p;
  if (read(p.primary)?.owner_nonce !== nonce) return { ok: false, code: "conflict_lock_owner" };
  fs.unlinkSync(p.primary);
  return { ok: true };
}

export function recoverLock(root, { observed_nonce, scopeIdentity = null, pidAbsent = processAbsent } = {}) {
  const p = checkedPaths(root); if (!p.ok) return p;
  if (fs.existsSync(p.guard)) return { ok: false, code: "recovery_required" };
  const guard = { owner_nonce: crypto.randomUUID(), pid: process.pid, hostname: os.hostname(),
    process_scope: processScopeEvidence(scopeIdentity), created_at: new Date().toISOString() };
  try { writeExclusive(p.guard, guard); }
  catch (error) { return { ok: false, code: error?.code === "EEXIST" ? "recovery_required" : "conflict_lock_held" }; }
  try {
    const current = read(p.primary);
    if (!current || current.owner_nonce !== observed_nonce) return { ok: false, code: "conflict_lock_owner" };
    const ownScope = processScopeEvidence(scopeIdentity);
    if (!ownScope || !current.process_scope
        || JSON.stringify(ownScope) !== JSON.stringify(current.process_scope)
        || current.hostname !== os.hostname() || typeof pidAbsent !== "function") {
      return { ok: false, code: "conflict_lock_held" };
    }
    let absent;
    try { absent = pidAbsent(current.pid); } catch { return { ok: false, code: "conflict_lock_held" }; }
    if (absent !== true) return { ok: false, code: "conflict_lock_held" };
    if (read(p.primary)?.owner_nonce !== observed_nonce) return { ok: false, code: "conflict_lock_owner" };
    try { fs.unlinkSync(p.primary); }
    catch { return { ok: false, code: "conflict_lock_held" }; }
    return { ok: true };
  } finally {
    if (read(p.guard)?.owner_nonce === guard.owner_nonce) fs.unlinkSync(p.guard);
  }
}

export function recoverGuard(root, { observed_nonce, scopeIdentity = null, pidAbsent = processAbsent,
  allWritersStopped = false } = {}) {
  const p = checkedPaths(root); if (!p.ok) return p;
  const guard = read(p.guard);
  if (!guard || guard.owner_nonce !== observed_nonce) return { ok: false, code: "recovery_required" };
  const ownScope = processScopeEvidence(scopeIdentity);
  if (!allWritersStopped || !ownScope || !guard.process_scope
      || JSON.stringify(ownScope) !== JSON.stringify(guard.process_scope)
      || guard.hostname !== os.hostname() || typeof pidAbsent !== "function") return { ok: false, code: "recovery_required" };
  let absent;
  try { absent = pidAbsent(guard.pid); } catch { return { ok: false, code: "recovery_required" }; }
  if (absent !== true || read(p.guard)?.owner_nonce !== observed_nonce) return { ok: false, code: "recovery_required" };
  try { fs.unlinkSync(p.guard); return { ok: true }; }
  catch { return { ok: false, code: "recovery_required" }; }
}
