// The bundled front-door scripts: the plugin carries them, and check-setup's entry.mjs `install` copies them into a
// member's project instead of the agent retyping them. Runs the shipped files, on LF and on CRLF checkouts.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryIn = (pluginRoot) => path.join(pluginRoot, "skills", "check-setup", "scripts", "front-door-core", "entry.mjs");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
}) : [];
const listing = (dir) => walk(dir).map((file) => path.relative(dir, file).split(path.sep).join("/")).sort();
const parse = (out) => { try { return { ...JSON.parse(out.stdout.trim().split(/\r?\n/).at(-1)), status: out.status }; } catch { return { unparsed: out.stdout, stderr: out.stderr, status: out.status }; } };
const install = (pluginRoot, project, access = "granted") => parse(spawnSync(process.execPath, [entryIn(pluginRoot), "install", "--root", project, "--surface", "claude", "--write-access", access], { encoding: "utf8" }));
const verifyInstalled = (project) => parse(spawnSync(process.execPath, [path.join(project, ".claude-state", "front-door-scripts", "front-door-cli.mjs"), "verify"], { encoding: "utf8" }));

// The plugin ships both closures, and each verifies before anything runs.
assert.equal(parse(spawnSync(process.execPath, [entryIn(root), "verify"], { encoding: "utf8" })).ok, true, "the bundled core verifies itself");
const builderHome = path.join(root, "skills", "meta-create-skill", "scripts");
const builderManifest = JSON.parse(fs.readFileSync(path.join(builderHome, "front-door-builder.manifest.json"), "utf8"));
assert.ok(builderManifest.files.some((row) => row.path === "validate-structure.mjs"), "the eval toolkit's validator ships with the builder");
for (const row of builderManifest.files) {
  const bytes = fs.readFileSync(path.join(builderHome, row.path));
  assert.equal(sha(Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))), row.sha256_eol_normalized, `${row.path} matches its manifest`);
}
const coreCount = walk(path.join(root, "skills", "check-setup", "scripts", "front-door-core")).length;
assert.equal(coreCount, 10, "ten core files ship beside check-setup");
const expectedFiles = 10 + builderManifest.files.length + 1;

// Real projects live outside the temp folder: the readiness rule refuses temp, tmp and scratch folders.
const scratch = fs.mkdtempSync(path.join(os.homedir(), "aieb-plugin-install-test-"));
const projectAt = (name) => { const dir = path.join(scratch, name); fs.mkdirSync(dir, { recursive: true }); return dir; };
try {
  // LF (or whatever this checkout has): fresh install, then a matching rerun that rewrites nothing
  const project = projectAt("My Project");
  const fresh = install(root, project);
  assert.equal(fresh.ok, true, JSON.stringify(fresh).slice(0, 400));
  assert.equal(fresh.verified, true);
  assert.equal(fresh.installed.length, expectedFiles);
  assert.equal(listing(project).length, expectedFiles, "nothing but the closure was written");
  assert.equal(verifyInstalled(project).ok, true, "the installed builder verifies itself");
  const stamps = walk(project).map((file) => fs.statSync(file).mtimeMs);
  const again = install(root, project);
  assert.equal(again.ok, true);
  assert.deepEqual(again.installed, []);
  assert.equal(again.unchanged.length, expectedFiles);
  assert.deepEqual(walk(project).map((file) => fs.statSync(file).mtimeMs), stamps, "matching files are not rewritten");

  // CRLF checkout of the plugin: copies, verifies, and installs onto existing LF files without touching them
  const crlfPlugin = path.join(projectAt("crlf-plugin"), "aieb");
  for (const skill of ["check-setup", "meta-create-skill"]) {
    fs.cpSync(path.join(root, "skills", skill, "scripts"), path.join(crlfPlugin, "skills", skill, "scripts"), { recursive: true });
  }
  for (const file of walk(crlfPlugin)) fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/\r?\n/g, "\r\n"));
  const crlfProject = projectAt("crlf-project");
  const crlf = install(crlfPlugin, crlfProject);
  assert.equal(crlf.ok, true, JSON.stringify(crlf).slice(0, 400));
  assert.equal(crlf.installed.length, expectedFiles);
  assert.ok(fs.readFileSync(path.join(crlfProject, ".claude-state", "front-door-scripts", "front-door-cli.mjs"), "utf8").includes("\r\n"));
  assert.equal(verifyInstalled(crlfProject).ok, true, "a CRLF copy verifies");
  const lfOnCrlf = install(crlfPlugin, project);
  assert.equal(lfOnCrlf.ok, true, JSON.stringify(lfOnCrlf).slice(0, 300));
  assert.deepEqual(lfOnCrlf.installed, []);
  assert.equal(lfOnCrlf.unchanged.length, expectedFiles);

  // A tampered installed file is reported and kept; a tampered plugin copy installs nothing
  const tampered = path.join(project, ".claude-state", "front-door-scripts", "front-door-core", "readiness.mjs");
  fs.appendFileSync(tampered, "\n// tampered\n");
  const conflict = install(root, project);
  assert.equal(conflict.code, "install_conflict");
  assert.deepEqual(conflict.conflicts.map((row) => row.path), [".claude-state/front-door-scripts/front-door-core/readiness.mjs"]);
  assert.match(fs.readFileSync(tampered, "utf8"), /\/\/ tampered/, "the existing file is preserved");
  assert.equal(verifyInstalled(project).code, "mixed_version_closure", "and its own verify reports it");
  const brokenPlugin = path.join(projectAt("broken-plugin"), "aieb");
  for (const skill of ["check-setup", "meta-create-skill"]) fs.cpSync(path.join(root, "skills", skill, "scripts"), path.join(brokenPlugin, "skills", skill, "scripts"), { recursive: true });
  fs.appendFileSync(path.join(brokenPlugin, "skills", "meta-create-skill", "scripts", "front-door-cli.mjs"), "\n// tampered source\n");
  const brokenProject = projectAt("broken-project");
  assert.equal(install(brokenPlugin, brokenProject).code, "install_source_invalid");
  assert.deepEqual(listing(brokenProject), []);

  // Write access the host has not granted: nothing written
  for (const access of ["read_only", "unknown"]) {
    const denied = projectAt(`denied-${access}`);
    const result = install(root, denied, access);
    assert.equal(result.code, "readiness_failed");
    assert.deepEqual(listing(denied), []);
  }
  console.log(`bundled-install: ${expectedFiles} files install, verify and rerun cleanly on LF and CRLF; tampered files and sources are refused; no write access installs nothing`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
