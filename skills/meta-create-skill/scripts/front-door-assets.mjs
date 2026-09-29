import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadCore } from "./front-door-core/entry.mjs";
import { verifyBuilderClosure } from "./front-door-builder-entry.mjs";

const headings = { assets: "Where things live", roster: "AI Employees", department: "Assets" };
const columns = { assets: ["id", "what", "path", "owner dept", "used by"],
  roster: ["employee id", "name", "job", "invocation", "skill path", "asset ids"],
  department: ["id", "what", "path", "owner dept", "used by"] };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const normalized = (value) => value.replace(/\r\n/g, "\n");
const cell = (value) => String(value ?? "").trim().replace(/\|/g, "\\|");
const parseRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((x) => x.trim());

export function parseIndex(text, type) {
  const title = headings[type];
  if (!title) return { ok: false, code: "unsupported_document" };
  const lines = normalized(text).split("\n");
  const matches = lines.flatMap((line, i) => line.trim() === `## ${title}` ? [i] : []);
  if (matches.length > 1) return { ok: false, code: "unsupported_document", detail: "duplicate section" };
  if (!matches.length) return { ok: true, found: false, rows: [], lines };
  const start = matches[0], end = lines.findIndex((line, i) => i > start && /^##\s+/.test(line));
  const sectionEnd = end < 0 ? lines.length : end;
  const table = [];
  for (let i = start + 1; i < sectionEnd; i++) if (/^\s*\|/.test(lines[i])) table.push({ line: lines[i], i });
  if (table.length < 2) return { ok: false, code: "unsupported_document", detail: "missing table" };
  const header = parseRow(table[0].line).map((x) => x.toLowerCase());
  if (JSON.stringify(header) !== JSON.stringify(columns[type])
    || !parseRow(table[1].line).every((x) => /^:?-{3,}:?$/.test(x))
    || table.some((item) => parseRow(item.line).length !== columns[type].length)) {
    return { ok: false, code: "unsupported_document", detail: "malformed table" };
  }
  const rows = table.slice(2).map((item) => ({ cells: parseRow(item.line), index: item.i }));
  if (new Set(rows.map((row) => row.cells[0])).size !== rows.length) return { ok: false, code: "unsupported_document", detail: "duplicate id" };
  return { ok: true, found: true, rows, lines, tableEnd: table.at(-1).i, sectionEnd };
}

export function upsertIndex(text, type, row) {
  const parsed = parseIndex(text, type);
  if (!parsed.ok) return parsed;
  const id = row[columns[type][0]];
  if (!slug.test(id || "")) return { ok: false, code: "invalid_asset_id" };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rendered = `| ${columns[type].map((key) => cell(row[key])).join(" | ")} |`;
  const finish = (changed) => {
    const verified = parseIndex(changed, type);
    return verified.ok && verified.rows.some((item) => item.cells[0] === id)
      ? { ok: true, text: changed } : { ok: false, code: "unsupported_document", detail: "resulting table invalid" };
  };
  if (!parsed.found) {
    const table = [`## ${headings[type]}`, `| ${columns[type].join(" | ")} |`,
      `| ${columns[type].map(() => "---").join(" | ")} |`, rendered].join(eol);
    const separator = text.endsWith(eol) ? eol : `${eol}${eol}`;
    return finish(`${text}${separator}${table}${eol}`);
  }
  const old = parsed.rows.find((item) => item.cells[0] === id);
  if (old && old.cells[columns[type].indexOf("path")] && row.path
    && old.cells[columns[type].indexOf("path")] !== row.path) return { ok: false, code: "conflict_asset_id" };
  const chunks = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter((part, i, all) => part || i < all.length - 1);
  const offset = (index) => chunks.slice(0, index).join("").length;
  if (old) {
    const start = offset(old.index), line = chunks[old.index];
    const ending = line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";
    return finish(`${text.slice(0, start)}${rendered}${ending}${text.slice(start + line.length)}`);
  }
  const insertion = offset(parsed.tableEnd + 1);
  const before = text.slice(0, insertion);
  const separator = before && !before.endsWith("\n") ? eol : "";
  return finish(`${before}${separator}${rendered}${eol}${text.slice(insertion)}`);
}

function managedVoice(root) {
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    const block = /<!-- AIEB-CONTENT-EMPLOYEES:start[^>]*-->([\s\S]*?)<!-- AIEB-CONTENT-EMPLOYEES:end -->/.exec(text)?.[1];
    const line = block?.split(/\r?\n/).find((x) => /^\|\s*(?:Verbatim voice samples|Voice samples)\b/i.test(x));
    const home = line?.split("|")[2]?.trim().replace(/^`|`$/g, "").replace(/[\\/]+$/, "");
    if (home) return `${home}/voice-profile.md`.replaceAll("\\", "/");
  }
  return null;
}

export function collectAssetIndexes(root) {
  const rows = [];
  const sources = [["BUSINESS-MAP.md", "assets"]];
  for (const dept of ["marketing", "sales", "product", "operations", "finance", "strategy"]) {
    sources.push([`${dept}/DEPARTMENT.md`, "department"]);
  }
  for (const [relative, kind] of sources) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    const parsed = parseIndex(fs.readFileSync(file, "utf8"), kind);
    if (!parsed.ok) return parsed;
    rows.push(...parsed.rows.map((item) => ({ id: item.cells[0], what: item.cells[1], path: item.cells[2],
      owner_dept: item.cells[3], used_by: item.cells[4], source: relative })));
  }
  return { ok: true, rows };
}

function legacyCandidates(root, assetId, role) {
  const home = path.join(root, "digital-assets");
  if (!fs.existsSync(home)) return [];
  const found = [];
  if (role === "voice") found.push("digital-assets/voice/voice-profile.md");
  const pending = [{ dir: home, depth: 0 }];
  let visited = 0;
  while (pending.length && visited < 100) {
    const { dir, depth } = pending.shift();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 100) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 2) pending.push({ dir: full, depth: depth + 1 });
      else if (entry.isFile() && path.parse(entry.name).name === assetId) {
        found.push(path.relative(root, full).replaceAll("\\", "/"));
      }
    }
  }
  return [...new Set(found)].filter((candidate) => fs.existsSync(path.join(root, candidate)));
}

export async function resolveAsset({ root, assetId, role = "other", explicitPath = null,
  indexed = null, legacy = null }) {
  const loaded = await loadCore("readiness"); if (!loaded.ok) return loaded;
  const safe = (relative) => loaded.module.resolveTarget(root, relative);
  if (indexed === null) {
    const collected = collectAssetIndexes(root);
    if (!collected.ok) return collected;
    indexed = collected.rows;
  }
  if (legacy === null) legacy = legacyCandidates(root, assetId, role);
  const paths = [...new Set(indexed.filter((row) => row.id === assetId).map((row) => row.path))];
  if (paths.length > 1) return { ok: false, code: "conflict_asset_id", paths };
  const managed = role === "voice" ? managedVoice(root) : null;
  if (role === "voice" && paths[0] && managed && paths[0] !== managed) {
    return { ok: false, code: "conflict_voice_asset", paths: [paths[0], managed] };
  }
  const chosen = explicitPath || paths[0] || managed || legacy[0] || null;
  if (!chosen) return { ok: false, code: "asset_missing" };
  const checked = safe(chosen);
  if (!checked.ok) return checked;
  if (!fs.existsSync(checked.path)) {
    const dept = indexed.find((row) => row.id === assetId)?.owner_dept;
    const suggestions = [];
    if (dept && /^(marketing|sales|product|operations|finance|strategy)$/.test(dept)) {
      const dir = path.join(root, dept);
      if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase().includes(assetId.split("-")[0])) suggestions.push(`${dept}/${entry.name}`);
      }
    }
    return { ok: false, code: "indexed_path_missing", repair_proposal: { missing: chosen, suggestions } };
  }
  return { ok: true, path: chosen, source: explicitPath ? "explicit" : paths[0] ? "index" : managed ? "managed_block" : "legacy" };
}

export function assetRowsFromMap(text) {
  const parsed = parseIndex(text, "assets");
  return parsed.ok ? parsed.rows.map((row) => ({ id: row.cells[0], what: row.cells[1], path: row.cells[2],
    owner_dept: row.cells[3], used_by: row.cells[4] })) : parsed;
}

export async function readAssetEvidence(root, relative, revision) {
  const loaded = await loadCore("readiness"); if (!loaded.ok) return loaded;
  const safe = loaded.module.resolveTarget(root, relative);
  if (!safe.ok) return safe;
  try {
    const bytes = fs.readFileSync(safe.path);
    return { ok: true, path: relative, content_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      read_at_revision: revision };
  } catch (error) { return { ok: false, code: error?.code === "ENOENT" ? "asset_missing" : "asset_unreadable" }; }
}

export async function persistIndex({ root, rootResult, storage, layout = "lean", kind,
  row, department = null, authorization_ref }) {
  const closure = verifyBuilderClosure(); if (!closure.ok) return closure;
  if (rootResult?.root !== "verified") return { ok: false, code: "root_unverified" };
  if (!["full", "restricted"].includes(storage?.mode) || !Number.isInteger(storage?.disclosed_at_revision)) return { ok: false, code: "storage_policy_unresolved" };
  const core = await loadCore("journal"); if (!core.ok) return core;
  if (kind !== "roster" && kind !== "asset") return { ok: false, code: "unsupported_document" };
  const relative = kind === "roster" || layout === "lean" ? "BUSINESS-MAP.md"
    : `${department}/DEPARTMENT.md`;
  if (kind === "asset" && layout === "full" && !/^(marketing|sales|product|operations|finance|strategy)$/.test(department || "")) {
    return { ok: false, code: "unsupported_document" };
  }
  const prepare = () => {
    let before;
    try { before = fs.readFileSync(path.join(root, relative)); }
    catch { return { ok: false, code: "unsupported_document", detail: "index missing" }; }
    const update = upsertIndex(before.toString("utf8"), kind === "roster" ? "roster" : layout === "lean" ? "assets" : "department", row);
    if (!update.ok) return update;
    if (kind === "asset" && layout === "full") {
      let map;
      try { map = fs.readFileSync(path.join(root, "BUSINESS-MAP.md"), "utf8"); }
      catch { return { ok: false, code: "unsupported_document", detail: "business map missing" }; }
      if (!map.includes(`${department}/DEPARTMENT.md`)) return { ok: false, code: "unsupported_document", detail: "department index not linked" };
      const mapAssets = parseIndex(map, "assets");
      if (!mapAssets.ok) return mapAssets;
      if (mapAssets.rows.some((item) => item.cells[0] === row.id)) return { ok: false, code: "conflict_asset_id" };
      for (const other of ["marketing", "sales", "product", "operations", "finance", "strategy"]) {
        if (other === department) continue;
        const file = path.join(root, other, "DEPARTMENT.md");
        if (!fs.existsSync(file)) continue;
        const parsed = parseIndex(fs.readFileSync(file, "utf8"), "department");
        if (!parsed.ok) return parsed;
        if (parsed.rows.some((item) => item.cells[0] === row.id)) return { ok: false, code: "conflict_asset_id" };
      }
    }
    return { ok: true, before, update };
  };
  if (!core.module.listJournals(root).length) {
    const preflight = prepare(); if (!preflight.ok) return preflight;
  }
  const recovery = await core.module.recoverPending(root, rootResult);
  if (!recovery.ok) return recovery;
  const prepared = prepare(); if (!prepared.ok) return prepared;
  const expected = crypto.createHash("sha256").update(prepared.before).digest("hex");
  return core.module.transact({ root, rootResult, storage, transition: kind === "roster" ? "roster_upsert" : "asset_upsert",
    targets: [{ path: relative, after: prepared.update.text, expected_before_hash: expected,
      purpose: "operational_state", authorization_ref, metadata_only: storage.mode === "restricted" }] });
}
