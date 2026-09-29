#!/usr/bin/env node
// No executable sibling is imported until every file in the declared closure
// passes its line-ending-normalized digest check. Raw hashes are recorded for
// source parity; CRLF checkout is accepted by the runtime verifier.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const home = path.dirname(fileURLToPath(import.meta.url));
const expected = Object.freeze([
  "entry.mjs", "readiness.mjs", "identity.mjs", "precedence.mjs",
  "lock.mjs", "journal.mjs", "state.mjs",
  "schemas/workspace.schema.json", "schemas/pending-build.schema.json"
]);
// The builder scripts the plugin bundles beside the core (see install below).
const builderExpected = Object.freeze([
  "front-door-builder-entry.mjs", "front-door-cli.mjs", "front-door-build.mjs", "front-door-adapters.mjs",
  "front-door-assets.mjs", "front-door-brief.mjs", "build-record.schema.json", "build-record.restricted.schema.json",
  "validate-structure.mjs"
]);
const coreManifestName = "front-door-core.manifest.json", builderManifestName = "front-door-builder.manifest.json";
const installDirectory = ".claude-state/front-door-scripts";
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const normalized = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
const mixed = (detail) => ({ ok: false, code: "mixed_version_closure", detail });

function checkManifest(dir, manifestName, allowed) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, manifestName), "utf8")); }
  catch (error) { return mixed(`manifest: ${error.code || error.message}`); }
  if (manifest.version !== 1 || !Array.isArray(manifest.files)
      || JSON.stringify(manifest.files.map((f) => f.path).sort()) !== JSON.stringify([...allowed].sort())) {
    return mixed("closure file list or version differs");
  }
  for (const item of manifest.files) {
    if (!allowed.includes(item.path)) return mixed(item.path);
    let bytes;
    try { bytes = fs.readFileSync(path.join(dir, ...item.path.split("/"))); }
    catch (error) { return mixed(`${item.path}: ${error.code || error.message}`); }
    // Git may check out CRLF on Windows. The normalized digest is mandatory;
    // the raw digest additionally detects exact-byte parity where available.
    if (sha(normalized(bytes)) !== item.sha256_eol_normalized) return mixed(`${item.path}: digest mismatch`);
  }
  return { ok: true, version: manifest.version, files: manifest.files };
}

export function verifyClosure() {
  const checked = checkManifest(home, coreManifestName, expected);
  return checked.ok ? { ok: true, version: checked.version } : checked;
}

// Where the plugin keeps the builder scripts: skills/meta-create-skill/scripts, beside skills/check-setup.
const bundledBuilderHome = path.resolve(home, "..", "..", "..", "meta-create-skill", "scripts");
const failure = (code, detail, more = {}) => ({ ok: false, code, detail, ...more });

// One destination, checked before any write and again right before it: every existing part of the
// path must be a real folder or file (no symlink, no junction), and the whole path must stay inside the project.
function checkDestination(readiness, root, relative) {
  let current = root;
  const parts = relative.split("/");
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === "ENOENT") break;
      return failure("symlink_escape", relative);
    }
    if (stat.isSymbolicLink()) return failure("symlink_escape", relative);
    const last = i === parts.length - 1;
    if (!last && !stat.isDirectory()) return { conflict: `${parts.slice(0, i + 1).join("/")}: exists and is not a folder` };
    if (last && !stat.isFile()) return { conflict: `${relative}: exists and is not a file` };
  }
  const target = readiness.resolveTarget(root, relative);
  return target.ok ? { ok: true, path: target.path } : failure("symlink_escape", relative);
}

// Copies the bundled front-door scripts into <project>/.claude-state/front-door-scripts/ (builder files there,
// core files in front-door-core/). Refuses before writing anything when the project is not ready, a destination
// leaves the project, or an existing file differs from the release; matching files stay untouched.
export async function installBundle({ root, surface, writeAccess }) {
  const loaded = await loadCore("readiness");
  if (!loaded.ok) return loaded;
  const readiness = loaded.module;
  const ready = readiness.fullReadiness({ root, surface, write_access: writeAccess, evidence: null });
  if (!ready.ok) return { ok: false, code: "readiness_failed", root: ready.root, reason: ready.reason, next_action: ready.next_action };
  const project = ready.canonical_path;

  const builder = checkManifest(bundledBuilderHome, builderManifestName, builderExpected);
  if (!builder.ok) return failure("install_source_invalid", builder.detail || builder.code);
  const core = checkManifest(home, coreManifestName, expected);
  if (!core.ok) return failure("install_source_invalid", core.detail || core.code);
  const plan = [];
  const add = (sourceDir, relative, targetDir, digests) => {
    let bytes;
    try { bytes = fs.readFileSync(path.join(sourceDir, ...relative.split("/"))); }
    catch (error) { return `${relative}: ${error.code || error.message}`; }
    plan.push({ relative: `${targetDir}/${relative}`, bytes, digests: digests || { raw: sha(bytes), eol: sha(normalized(bytes)) } });
    return null;
  };
  for (const item of builder.files) add(bundledBuilderHome, item.path, installDirectory, { raw: item.sha256_raw, eol: item.sha256_eol_normalized });
  for (const item of core.files) add(home, item.path, `${installDirectory}/front-door-core`, { raw: item.sha256_raw, eol: item.sha256_eol_normalized });
  const manifestProblem = add(bundledBuilderHome, builderManifestName, installDirectory)
    || add(home, coreManifestName, `${installDirectory}/front-door-core`);
  if (manifestProblem) return failure("install_source_invalid", manifestProblem);

  const conflicts = [], missing = [], unchanged = [];
  for (const item of plan) {
    const checked = checkDestination(readiness, project, item.relative);
    if (checked.conflict) { conflicts.push({ path: item.relative, reason: checked.conflict }); continue; }
    if (!checked.ok) return checked;
    if (!fs.existsSync(checked.path)) { missing.push(item); continue; }
    const existing = fs.readFileSync(checked.path);
    if (sha(existing) === item.digests.raw || sha(normalized(existing)) === item.digests.eol) unchanged.push(item.relative);
    else conflicts.push({ path: item.relative, reason: "differs from the release; kept as it is" });
  }
  if (conflicts.length) return { ok: false, code: "install_conflict", conflicts };

  const createdFiles = [], createdFolders = [];
  const rollback = () => {
    for (const file of createdFiles.reverse()) { try { fs.unlinkSync(file); } catch { /* best effort */ } }
    for (const folder of createdFolders.reverse()) { try { fs.rmdirSync(folder); } catch { /* not empty or gone */ } }
  };
  try {
    for (const item of missing) {
      const checked = checkDestination(readiness, project, item.relative);
      if (!checked.ok) throw Object.assign(new Error(checked.detail || "destination changed"), { installCode: checked.code || "install_conflict" });
      const absent = [];
      for (let dir = path.dirname(checked.path); !fs.existsSync(dir); dir = path.dirname(dir)) absent.push(dir);
      for (const dir of absent.reverse()) { fs.mkdirSync(dir); createdFolders.push(dir); }
      const recheck = checkDestination(readiness, project, item.relative);
      if (!recheck.ok) throw Object.assign(new Error(recheck.detail || "destination changed"), { installCode: recheck.code || "install_conflict" });
      fs.writeFileSync(checked.path, item.bytes, { flag: "wx" });
      createdFiles.push(checked.path);
    }
    const installed = path.join(project, ...installDirectory.split("/"));
    const builderAfter = checkManifest(installed, builderManifestName, builderExpected);
    const coreAfter = checkManifest(path.join(installed, "front-door-core"), coreManifestName, expected);
    if (!builderAfter.ok || !coreAfter.ok) throw Object.assign(new Error((builderAfter.ok ? coreAfter : builderAfter).detail), { installCode: "install_verify_failed" });
  } catch (error) {
    rollback();
    return failure(error.installCode || "install_failed", error.message);
  }
  return { ok: true, directory: installDirectory, installed: missing.map((item) => item.relative), unchanged, verified: true };
}

export async function loadCore(moduleName) {
  const checked = verifyClosure();
  if (!checked.ok) return checked;
  if (!["readiness", "identity", "precedence", "lock", "journal", "state"].includes(moduleName)) {
    return { ok: false, code: "unknown_module" };
  }
  return { ok: true, module: await import(`./${moduleName}.mjs`) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const checked = verifyClosure();
  let result = checked;
  const flag = (name) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
  if (checked.ok && command === "install") {
    const surface = flag("surface") || "codex", writeAccess = flag("write-access") || "unknown";
    if (!flag("root") || !["claude", "codex", "cowork"].includes(surface)
        || !["granted", "unknown", "read_only"].includes(writeAccess)) {
      result = { ok: false, code: "invalid_input", detail: "--root <folder> --surface <claude|codex|cowork> --write-access <granted|unknown|read_only>" };
    } else result = await installBundle({ root: flag("root"), surface, writeAccess });
  } else if (checked.ok && command === "readiness") {
    const loaded = await loadCore("readiness");
    if (args.includes("--root")) {
      // Plain flags: no JSON, so no shell quoting rules apply on any host.
      const surface = flag("surface") || "codex", writeAccess = flag("write-access") || "unknown";
      if (!flag("root") || !["claude", "codex", "cowork"].includes(surface)
          || !["granted", "unknown", "read_only"].includes(writeAccess)) {
        result = { ok: false, code: "invalid_input", detail: "--root <folder> --surface <claude|codex|cowork> --write-access <granted|unknown|read_only>" };
      } else result = loaded.module.fullReadiness({ root: flag("root"), surface, write_access: writeAccess, evidence: null });
    } else {
      const root = args[0];
      // Second argument: an evidence array, or {surface, write_access, evidence}.
      const given = args[1] ? JSON.parse(args[1]) : [];
      const options = Array.isArray(given) ? { evidence: given } : given;
      result = loaded.module.fullReadiness({ root, surface: args[2] || options.surface || "codex",
        write_access: options.write_access, evidence: options.evidence ?? null });
    }
  } else if (checked.ok && command === "verify") result = checked;
  else if (checked.ok) result = { ok: false, code: "unknown_command" };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok && (command === "install" || result.root !== "verified")) process.exitCode = 2;
}
