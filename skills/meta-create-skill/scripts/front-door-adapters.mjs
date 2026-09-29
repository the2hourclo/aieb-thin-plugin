import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadCore } from "./front-door-core/entry.mjs";
import { verifyBuilderClosure } from "./front-door-builder-entry.mjs";

const unsupported = (detail) => ({ ok: false, code: "unsupported_document", detail });
const hash = (content) => crypto.createHash("sha256").update(content).digest("hex");
const status = (value) => value === "done" || value === "completed" ? "done" : value === "skipped" ? "skipped" : "pending";

export function normalizeOnboarding(text) {
  let row;
  try { row = JSON.parse(text); } catch { return unsupported("malformed onboarding JSON"); }
  if (!row || typeof row !== "object" || !row.phases || typeof row.phases !== "object") return unsupported("missing phases");
  return { ok: true, scaffold: status(row.phases.scaffold), business_os: status(row.phases["business-os"]),
    complete: Boolean(row.completed_at) && status(row.phases.scaffold) === "done" && status(row.phases["business-os"]) === "done" };
}

export function normalizeRoadmap(text) {
  let row;
  try { row = JSON.parse(text); } catch { return unsupported("malformed roadmap JSON"); }
  if (!row || typeof row !== "object" || Array.isArray(row)) return unsupported("malformed roadmap object");
  return { ok: true, first_skill: status(row.stages?.["3-first-skill"] ?? row.ladder?.["3-first-skill"] ?? row["first-skill"]),
    first_skill_name: typeof row.first_skill === "string" && row.first_skill.trim() ? row.first_skill : null,
    raw: row };
}

export function normalizeJourney(text) {
  if (/\t|(^|\s)[&*][A-Za-z][\w-]*|^\s*[-?]\s|:\s*[|>\[{]|^\s*\{\s*$/m.test(text)) return unsupported("unsupported YAML construct");
  const lines = text.split(/\r?\n/);
  let section = "";
  const seen = new Set(), values = {};
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const top = /^([A-Za-z][\w-]*):(?:\s*(.*))?$/.exec(line);
    if (top) { section = top[1]; if (seen.has(section)) return unsupported(`duplicate section ${section}`);
      seen.add(section); if (top[2]) values[section] = top[2]; continue; }
    const child = /^  ([\w-]+):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!child || !section) return unsupported("unsupported YAML line");
    const key = `${section}.${child[1]}`;
    if (seen.has(key)) return unsupported(`duplicate key ${key}`);
    seen.add(key); values[key] = child[2];
  }
  return { ok: true, onboarding: status(values["ladder.1-onboard"]),
    xray: status(values["ladder.2-map"]), first_skill: status(values["ladder.3-first-skill"]),
    next_build: values["next.build"] || null, values };
}

export function patchJourney(text, updates) {
  const parsed = normalizeJourney(text); if (!parsed.ok) return parsed;
  const allowed = new Set(["ladder.1-onboard", "ladder.3-first-skill", "next.build", "next.ready", "next.blocker"]);
  if (Object.keys(updates).some((key) => !allowed.has(key))) return unsupported("unowned journey field");
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value)
        || key.startsWith("ladder.") && !["done", "pending", "skipped"].includes(value)
        || key === "next.ready" && !["true", "false"].includes(value)) {
      return unsupported("invalid journey scalar");
    }
  }
  const parts = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter((x, i, all) => x || i < all.length - 1);
  let section = "";
  const matched = new Set();
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    const top = /^([A-Za-z][\w-]*):/.exec(line);
    if (top) { section = top[1]; continue; }
    const child = /^(  ([\w-]+):)([ \t]*)([^#\r\n]*?)([ \t]*)(#.*)?(\r?\n)?$/.exec(line);
    if (!child) continue;
    const key = `${section}.${child[2]}`;
    if (!Object.hasOwn(updates, key)) continue;
    matched.add(key);
    parts[i] = `${child[1]}${child[3]}${updates[key]}${child[5]}${child[6] || ""}${child[7] || ""}`;
  }
  if (matched.size !== Object.keys(updates).length) return unsupported("owned journey key missing");
  const changed = parts.join("");
  const verified = normalizeJourney(changed);
  if (!verified.ok || Object.entries(updates).some(([key, value]) => verified.values[key] !== value)) {
    return unsupported("journey patch failed validation");
  }
  return { ok: true, text: changed };
}

function jsonSpans(text) {
  JSON.parse(text);
  let i = 0;
  const space = () => { while (/\s/.test(text[i] || "") && i < text.length) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') return { value: JSON.parse(text.slice(start, i)), start, end: i };
    }
    throw new Error("unterminated string");
  };
  const value = () => {
    space();
    const start = i;
    if (text[i] === '"') { string(); return { type: "scalar", start, end: i }; }
    if (text[i] === "{") {
      i++; space();
      const properties = new Map();
      while (text[i] !== "}") {
        const key = string(); space();
        if (text[i++] !== ":") throw new Error("missing colon");
        const child = value();
        if (properties.has(key.value)) throw new Error("duplicate decoded key");
        properties.set(key.value, child);
        space();
        if (text[i] !== ",") break;
        i++; space();
      }
      if (text[i++] !== "}") throw new Error("unterminated object");
      return { type: "object", properties, start, end: i };
    }
    if (text[i] === "[") {
      i++; space();
      while (text[i] !== "]") {
        value(); space();
        if (text[i] !== ",") break;
        i++; space();
      }
      if (text[i++] !== "]") throw new Error("unterminated array");
      return { type: "array", start, end: i };
    }
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    JSON.parse(text.slice(start, i));
    return { type: "scalar", start, end: i };
  };
  const root = value(); space();
  if (i !== text.length) throw new Error("trailing JSON");
  return root;
}

export function patchJsonOwned(text, section, key, value) {
  let root;
  try { root = jsonSpans(text); } catch { return unsupported("ambiguous or malformed JSON"); }
  const parent = section ? root.properties?.get(section) : root;
  const target = parent?.type === "object" ? parent.properties.get(key) : null;
  if (!target || target.type !== "scalar") return unsupported("owned scalar missing or ambiguous");
  const rendered = JSON.stringify(value);
  if (rendered === undefined) return unsupported("unsupported JSON value");
  const changed = text.slice(0, target.start) + rendered + text.slice(target.end);
  try { jsonSpans(changed); } catch { return unsupported("patch produced unsupported JSON"); }
  return { ok: true, text: changed };
}

export function returnModeJourney(text) {
  // X-Ray remains pending. Only the return pointer is redirected.
  return patchJourney(text, { "next.build": "first-employee" });
}

export async function persistAdapter({ root, rootResult, storage, relative, updates = null,
  section = null, key = null, value = null, authorization_ref }) {
  const closure = verifyBuilderClosure(); if (!closure.ok) return closure;
  if (rootResult?.root !== "verified") return { ok: false, code: "root_unverified" };
  if (!["full", "restricted"].includes(storage?.mode) || !Number.isInteger(storage?.disclosed_at_revision)) return { ok: false, code: "storage_policy_unresolved" };
  const loaded = await loadCore("journal"); if (!loaded.ok) return loaded;
  if (![".claude-state/progress-state.yaml", ".claude-state/onboarding-progress.json",
    ".claude-state/roadmap-progress.json"].includes(relative)) return unsupported("unowned adapter path");
  const prepare = () => {
    let current;
    try { current = fs.readFileSync(path.join(root, relative)); }
    catch { return unsupported("adapter source missing"); }
    let patch;
    if (relative.endsWith(".yaml")) patch = patchJourney(current.toString("utf8"), updates || {});
    else {
      const allowed = relative.endsWith("onboarding-progress.json")
        ? (section === "phases" && ["scaffold", "business-os"].includes(key)) || (!section && key === "completed_at")
        : section === "stages" && ["3-first-skill", "4-system", "5-autonomy"].includes(key);
      if (!allowed) return unsupported("unowned JSON field");
      patch = patchJsonOwned(current.toString("utf8"), section, key, value);
    }
    return patch.ok ? { ok: true, current, patch } : patch;
  };
  // A malformed source must be rejected without creating lock or journal files.
  if (!loaded.module.listJournals(root).length) {
    const preflight = prepare(); if (!preflight.ok) return preflight;
  }
  const recovery = await loaded.module.recoverPending(root, rootResult);
  if (!recovery.ok) return recovery;
  const prepared = prepare(); if (!prepared.ok) return prepared;
  return loaded.module.transact({ root, rootResult, storage, transition: "adapter_update", targets: [{
    path: relative, after: prepared.patch.text, expected_before_hash: hash(prepared.current), purpose: "operational_state",
    authorization_ref, metadata_only: true
  }] });
}
