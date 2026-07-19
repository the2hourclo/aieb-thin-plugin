// state.mjs — read the buyer's unified build state (.claude-state/progress-state.yaml).
//
// One source of truth: business-x-ray writes it, skills update it, the SessionStart
// hooks read it so Claude opens ALREADY knowing the roadmap and nudges the specific
// next build. Replaces the split .claude-state/onboarding-progress.json +
// roadmap-progress.json (the hooks fall back to those until a buyer is migrated).
//
// The parser is a MINIMAL YAML reader scoped to the schema WE emit (nested maps, block
// lists, flow lists/maps, quoted/bare scalars, comments). It is NOT general-purpose
// YAML — it only has to read the file business-x-ray writes. FAIL-OPEN everywhere:
// any parse/read error returns null so a malformed file can never hold a session.

import fs from "node:fs";
import path from "node:path";

const STATE_REL = [".claude-state", "progress-state.yaml"];
// The post-map build checkpoints from the buyer-journey map (2026-07-19):
// first skill → skill system → make-it-run-itself. A legacy file with the old
// 7-stage names simply reads as "these stages missing → pending → unfinished",
// which keeps the nudge alive until the roadmap skill rewrites the ladder.
const LADDER_STAGES = ["3-first-skill", "4-system", "5-autonomy"];

// ---- scalar + flow parsing -------------------------------------------------

function parseScalar(s) {
  s = s.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  const q = s[0];
  if ((q === '"' || q === "'") && s[s.length - 1] === q && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s; // bare string (dates, ids, enums)
}

// split top-level commas, respecting quotes and nested [ ] { }
function splitTop(inner) {
  const out = [];
  let depth = 0, q = null, cur = "";
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "[" || ch === "{") { depth++; cur += ch; continue; }
    if (ch === "]" || ch === "}") { depth--; cur += ch; continue; }
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

function parseValue(s) {
  s = s.trim();
  if (s.startsWith("[")) {
    const inner = s.slice(1, s.lastIndexOf("]"));
    if (inner.trim() === "") return [];
    return splitTop(inner).map((x) => parseValue(x));
  }
  if (s.startsWith("{")) {
    const inner = s.slice(1, s.lastIndexOf("}"));
    const obj = {};
    if (inner.trim() === "") return obj;
    for (const pair of splitTop(inner)) {
      const idx = pair.indexOf(":");
      if (idx === -1) continue;
      obj[pair.slice(0, idx).trim()] = parseValue(pair.slice(idx + 1));
    }
    return obj;
  }
  return parseScalar(s);
}

// ---- comment stripping (only outside quotes) -------------------------------

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

// only treat ":" as a map-colon if outside quotes/flow and followed by space/EOL
function firstMapColon(s) {
  if (s[0] === "[" || s[0] === "{" || s[0] === '"' || s[0] === "'") return -1;
  let q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "[" || ch === "{") { depth++; continue; }
    if (ch === "]" || ch === "}") { depth--; continue; }
    if (ch === ":" && depth === 0 && (i + 1 === s.length || s[i + 1] === " ")) return i;
  }
  return -1;
}

// ---- block parser (indent-based recursive descent) -------------------------

export function parseYaml(text) {
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const stripped = stripComment(raw);
    if (stripped.trim() === "") continue;
    lines.push({ indent: stripped.match(/^ */)[0].length, content: stripped.trim() });
  }
  let i = 0;

  function parseBlock(indent) {
    if (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith("- ")) {
      return parseList(indent);
    }
    return parseMap(indent);
  }

  function parseMap(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !lines[i].content.startsWith("- ")) {
      const content = lines[i].content;
      const idx = firstMapColon(content);
      if (idx === -1) { i++; continue; }
      const key = content.slice(0, idx).trim();
      const rest = content.slice(idx + 1).trim();
      i++;
      if (rest === "") {
        if (i < lines.length && lines[i].indent > indent) obj[key] = parseBlock(lines[i].indent);
        else obj[key] = null;
      } else {
        obj[key] = parseValue(rest);
      }
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith("- ")) {
      const after = lines[i].content.slice(2).trim();
      const idx = firstMapColon(after);
      if (idx !== -1) {
        const item = {};
        const key = after.slice(0, idx).trim();
        const rest = after.slice(idx + 1).trim();
        i++;
        if (rest === "") {
          if (i < lines.length && lines[i].indent > indent) item[key] = parseBlock(lines[i].indent);
          else item[key] = null;
        } else {
          item[key] = parseValue(rest);
        }
        // remaining keys of the SAME item sit deeper than the dash line
        while (i < lines.length && lines[i].indent > indent && !lines[i].content.startsWith("- ")) {
          const c = lines[i].content;
          const ci = firstMapColon(c);
          if (ci === -1) { i++; continue; }
          const k = c.slice(0, ci).trim();
          const r = c.slice(ci + 1).trim();
          const kIndent = lines[i].indent;
          i++;
          if (r === "") {
            if (i < lines.length && lines[i].indent > kIndent) item[k] = parseBlock(lines[i].indent);
            else item[k] = null;
          } else {
            item[k] = parseValue(r);
          }
        }
        arr.push(item);
      } else {
        i++;
        arr.push(parseValue(after));
      }
    }
    return arr;
  }

  return parseMap(0);
}

// ---- public API the hooks use ----------------------------------------------

export function stateFilePath(cwd) {
  return path.join(cwd, ...STATE_REL);
}

// Returns the parsed state object, or null if the file is missing/unreadable/bad.
export function readState(cwd) {
  try {
    const p = stateFilePath(cwd);
    if (!fs.existsSync(p)) return null;
    return parseYaml(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function onboardingComplete(state) {
  return Boolean(state && state.onboarding && state.onboarding.completed_at);
}

// True if the generic 7-stage build ladder still has somewhere to go.
export function ladderUnfinished(state) {
  const ladder = state && state.ladder;
  if (!ladder || typeof ladder !== "object" || Array.isArray(ladder)) return false;
  return LADDER_STAGES.some((s) => {
    const v = s in ladder ? ladder[s] : "pending";
    return v !== "done" && v !== "completed" && v !== "skipped";
  });
}

// What the roadmap nudge should surface. Prefers the precomputed next.say; falls
// back to a generic prompt. `ready` = safe to build unattended (no blocker).
export function nextNudge(state) {
  if (!state) return null;
  const next = state.next && typeof state.next === "object" ? state.next : {};
  const roadmap = Array.isArray(state.roadmap) ? state.roadmap : [];
  const pending = roadmap.find((r) => r && r.status !== "done" && r.status !== "skipped");
  const hasWork = Boolean(pending) || ladderUnfinished(state);
  return {
    hasWork,
    ready: next.ready === true && !next.blocker,
    blocker: next.blocker || null,
    say: typeof next.say === "string" && next.say.trim() ? next.say : null,
    item: pending || null,
  };
}
