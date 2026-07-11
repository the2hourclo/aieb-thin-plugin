#!/usr/bin/env node
/**
 * check-contract.mjs — the client↔server contract drift gate.
 *
 * The thin plugin's commands and stubs reference served content by exact
 * (skill_id, path) pairs fetched via get_skill. Nothing else guards that
 * seam: a server-side workflow rename ships silently broken buyer commands.
 * (Origin: 2026-07-11 inversion audit — /harden-skill, /schedule-skill,
 * /audit-skills, /rescore-assets all hard-reference workflow paths.)
 *
 * This gate extracts every referenced pair from commands/*.md and
 * skills/*​/SKILL.md and asserts each exists in the server's PUBLISHED
 * content bundle (content/skills/) and that each skill_id is in the
 * manifest. Run it after gen-stubs and before any thin-plugin push or
 * server production deploy:
 *
 *   node scripts/check-contract.mjs
 *
 * Env: AIEB_SERVER_DIR overrides the server repo location.
 * Prints VERDICT: CLEAN on success; lists failures and exits 1 otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR =
  process.env.AIEB_SERVER_DIR ||
  "C:/Users/rkham/OneDrive/Desktop/Cursor Projects/operations/mcp-servers/aieb-gated-mcp";
const CONTENT_DIR = path.join(SERVER_DIR, "content", "skills");
const MANIFEST_PATH = path.join(SERVER_DIR, "config", "aieb-skills.manifest.json");

// Placeholder examples in the stub loader template — not real content paths.
const PLACEHOLDERS = new Set(["references/foo.md", "workflows/bar.md"]);

if (!fs.existsSync(CONTENT_DIR) || !fs.existsSync(MANIFEST_PATH)) {
  console.error(`Server repo not found at ${SERVER_DIR} (set AIEB_SERVER_DIR). Cannot check contract.`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const manifestIds = new Set(Object.keys(manifest.skills || {}));

// Collect every (skill_id, path) reference from a file's text.
function extractRefs(text) {
  const refs = [];
  // Form A: get_skill(skill_id="X", path="Y")
  for (const m of text.matchAll(/get_skill\(\s*skill_id\s*=\s*"([a-z0-9-]+)"\s*,\s*path\s*=\s*"([^"]+)"\s*\)/g))
    refs.push({ id: m[1], p: m[2] });
  // Form B (commands): `skill_id: X`, `path: Y`
  for (const m of text.matchAll(/`skill_id:\s*([a-z0-9-]+)`\s*,\s*`path:\s*([^`]+)`/g))
    refs.push({ id: m[1], p: m[2] });
  // Form C (stub bullets): - `skill_id`: `X` ... - `path`: `Y` (adjacent lines)
  const idM = text.match(/-\s*`skill_id`:\s*`([a-z0-9-]+)`/);
  const pM = text.match(/-\s*`path`:\s*`([^`]+)`/);
  if (idM && pM) refs.push({ id: idM[1], p: pM[1] });
  return refs;
}

const files = [];
for (const dir of ["commands", "skills"]) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) continue;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.join(base, entry.name));
    if (entry.isDirectory()) {
      const sm = path.join(base, entry.name, "SKILL.md");
      if (fs.existsSync(sm)) files.push(sm);
    }
  }
}

const failures = [];
let checked = 0;
const seen = new Set();
for (const file of files) {
  const rel = path.relative(root, file);
  for (const { id, p } of extractRefs(fs.readFileSync(file, "utf8"))) {
    if (PLACEHOLDERS.has(p)) continue;
    const key = `${id}::${p}::${rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    checked++;
    if (!manifestIds.has(id)) {
      failures.push(`${rel}: skill_id "${id}" is not in the server manifest`);
      continue;
    }
    if (!fs.existsSync(path.join(CONTENT_DIR, id, p)))
      failures.push(`${rel}: get_skill(${id}, ${p}) — path missing from published bundle content/skills/${id}/${p}`);
  }
}

if (failures.length) {
  console.error(`Contract check: ${checked} refs checked, ${failures.length} BROKEN:\n` + failures.map((f) => `  - ${f}`).join("\n"));
  console.error("VERDICT: BROKEN");
  process.exit(1);
}
console.log(`Contract check: ${checked} (skill_id, path) refs across ${files.length} files — all resolve in the published bundle.`);
console.log("VERDICT: CLEAN");
