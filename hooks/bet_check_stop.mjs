#!/usr/bin/env node
/**
 * Stop hook: once per chat, catch a finished build that has no bet yet.
 *
 * Fires only in a folder where the owner said yes to automatic bets
 * (newest `auto bets` line in digital-assets/systems-thinking/SETTINGS.md is
 * `yes`). If this chat successfully changed a file outside the skill's own
 * bookkeeping (an edit tool's target or, after a shell command, a file or
 * folder on disk changed since the chat began, so deletes and renames count),
 * and BETS.md got no NEW bet line in this chat
 * (an edit adding one, or the file on disk changed since the chat began and
 * holds one), Claude is
 * stopped ONCE and asked to run the Self-Improving AI Skill's Quiet save (or
 * to say why no bet fits).
 *
 * Why a Stop hook here, when the plugin otherwise keeps none: the start-of-chat
 * reminder alone was ignored in 2 of 2 test runs on 2026-11-16 (Sonnet 5.5, a
 * member-like folder): Claude finished the job and never saved the bet. The
 * owner's own workspace uses the same stop-once check. Spam guards: it never
 * stops twice in one chat (marker file), never while a stop is already being
 * handled (stop_hook_active), only reads Claude Code transcripts (Codex and
 * anything unreadable are skipped), only counts tool calls whose result came
 * back without an error, and every error exits 0 silently.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);
const LEDGER = "digital-assets/systems-thinking/bets.md";
// A saved bet is a NEW line with its BET: field (bet-tracker.md, Quiet save).
const BET_LINE = /·\s*NEW\s*·[^\n]*\bBET:/;
const DATED_BET = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*NEW\s*·[^\n]*\bBET:/gm;
// A shell command's text says nothing reliable about what it wrote (Astra
// round 2: a python one-liner wrote a page unseen, "print(2 > 1)" looked like
// a write). So a shell call only tells the hook to look at the disk.
// Folders a member's build never lives in; the bounded scan skips them.
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".next", ".cache"]);
const SCAN_LIMIT = 5000;
const FAILED_RESULT = /^\s*(Error\b|<tool_use_error>)|user (rejected|denied)|was (rejected|denied|blocked)/i;

const REASON =
  "This chat changed files for the owner but saved no bet, and automatic bets are on in this folder. " +
  "Load the self-improving-ai skill and run workflows/bet-tracker.md 'Quiet save' now: it appends one NEW line " +
  "to digital-assets/systems-thinking/BETS.md without asking, redraws the bets page, and you end your reply with " +
  "its one line. If this chat was only a question, research, a typo fix or a draft still being edited, write " +
  "'No bet: <why>' instead. In a scheduled or unattended run, or if the skill can't load, write 'No bet: <why>' and stop. " +
  "You won't be stopped for this again in this chat.";

function autoBetsOn(settingsText) {
  let on = false;
  for (const line of String(settingsText || "").split(/\r?\n/)) {
    const m = line.match(/·\s*auto bets\s*·\s*(yes|no)\b/i);
    if (m) on = m[1].toLowerCase() === "yes";
  }
  return on;
}

function stateDir() {
  const base = process.env.PLUGIN_DATA || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), ".claude");
  return path.join(base, ".clo-os-state", "bet-check");
}

// Bookkeeping the skill writes itself, and folders that hold no member work.
// .claude/ counts only where members build: skills, agents, commands, hooks.
function bookkeeping(rel) {
  const r = rel.replace(/\\/g, "/");
  if (/^(digital-assets\/systems-thinking|\.claude-state|\.git)(\/|$)/.test(r)) return true;
  if (/^\.claude(\/|$)/.test(r) && !/^\.claude\/(skills|agents|commands|hooks)\//.test(r)) return true;
  return false;
}

// Anything under root (not bookkeeping) changed at or after `since`. Bounded walk.
// A file counts by its own mtime; a folder counts by its mtime too, which moves
// when an entry inside it is added, deleted or renamed (Astra round 3).
function changedOnDisk(root, since, shellText = "") {
  const found = [];
  let seen = 0;
  const recent = (p) => { try { return fs.statSync(p).mtimeMs >= since; } catch { return false; } };
  const born = (p) => { try { return fs.statSync(p).birthtimeMs >= since; } catch { return false; } };
  const ignored = (name, r) => SKIP_DIRS.has(name) || (r.replace(/\\/g, "/") !== ".claude" && bookkeeping(r + "/"));
  const walk = (dir, rel, depth) => {
    if (depth > 8 || seen > SCAN_LIMIT || found.length) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    // .claude itself is bookkeeping, but members build inside its skills,
    // agents, commands and hooks, so walk through it without counting it.
    // A folder whose new entry is bookkeeping or a skipped folder (a fresh
    // node_modules, the bets page) is explained by that, so it doesn't count.
    if (rel.replace(/\\/g, "/") !== ".claude" && recent(dir)) {
      const explained = entries.some((e) => {
        const r = path.join(rel, e.name);
        // a new .claude folder explains its parent too: anything built inside
        // it is still found by the walk below
        return (e.isDirectory() ? SKIP_DIRS.has(e.name) || bookkeeping(r + "/") : bookkeeping(r)) && born(path.join(dir, e.name));
      });
      // A skipped folder (node_modules, .cache) that a shell command named and
      // that is now gone explains it too: cache cleanup is not member work.
      // Command text only ever explains a change away here; it never adds one.
      const present = new Set(entries.map((e) => e.name));
      // The command must name this folder's own child (bare at the top, else
      // by its path), so a cleanup elsewhere can't hide a deleted page here.
      // Whole path tokens only: "appweb/node_modules" never names "web/node_modules".
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const named = (n) => {
        const p = esc(rel ? path.join(rel, n).replace(/\\/g, "/") : n);
        return new RegExp(`(^|[\\s"'=;&|(]|\\./)${p}([\\s"'/;&|)]|$)`).test(shellText.replace(/\\/g, "/"));
      };
      const cleanup = [...SKIP_DIRS].some((n) => !present.has(n) && named(n));
      if (!explained && !cleanup) { found.push(rel || "."); return; }
    }
    for (const e of entries) {
      if (++seen > SCAN_LIMIT || found.length) return;
      const full = path.join(dir, e.name);
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (!ignored(e.name, r)) walk(full, r, depth + 1);
      } else if (e.isFile() && !bookkeeping(r) && recent(full)) {
        found.push(r);
      }
    }
  };
  walk(root, "", 0);
  return found;
}

function newText(input = {}) {
  const parts = [input.new_string, input.content, input.new_source];
  if (Array.isArray(input.edits)) for (const e of input.edits) parts.push(e?.new_string);
  return parts.filter((x) => typeof x === "string").join("\n");
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n");
  return "";
}

// What this chat changed, and whether it already saved a bet or said "No bet:".
// A tool call counts only once its result came back without an error.
function readTranscript(file, cwd) {
  const calls = [];
  const ok = new Set();
  let noBet = false;
  let since = Infinity; // when this chat began: its earliest record timestamp
  const root = path.resolve(cwd);
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    const ts = Date.parse(rec?.timestamp || "");
    if (Number.isFinite(ts) && ts < since) since = ts;
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (rec.type === "user" && part?.type === "tool_result" && part.tool_use_id) {
        if (!part.is_error && !FAILED_RESULT.test(resultText(part.content))) ok.add(part.tool_use_id);
        continue;
      }
      if (rec.type !== "assistant") continue;
      if (part?.type === "text" && /\bNo bet:/i.test(part.text || "")) noBet = true;
      if (part?.type === "tool_use") calls.push(part);
    }
  }
  const changed = [];
  let betSaved = false;
  let shellRan = false;
  let shellText = "";
  for (const part of calls) {
    if (!part.id || !ok.has(part.id)) continue;
    if (WRITE_TOOLS.has(part.name)) {
      const target = part.input?.file_path || part.input?.notebook_path;
      if (!target) continue;
      const rel = path.relative(root, path.resolve(root, target));
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue; // outside this folder
      if (rel.replace(/\\/g, "/").toLowerCase() === LEDGER) {
        if (BET_LINE.test(newText(part.input))) betSaved = true;
        continue;
      }
      if (!bookkeeping(rel)) changed.push(rel);
    } else if (SHELL_TOOLS.has(part.name)) {
      shellRan = true;
      shellText += " " + String(part.input?.command || "");
    }
  }
  // Evidence on disk, judged from when this chat began. Without a timestamp
  // there is no "since", so only edit-tool evidence counts.
  if (Number.isFinite(since)) {
    const ledger = path.join(root, "digital-assets", "systems-thinking", "BETS.md");
    try {
      // The file must have changed in this chat AND hold a NEW bet dated on or
      // after the day the chat began, so an older NEW line doesn't count.
      if (!betSaved && fs.statSync(ledger).mtimeMs >= since) {
        const day = new Date(since - new Date(since).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        for (const m of fs.readFileSync(ledger, "utf8").matchAll(DATED_BET)) if (m[1] >= day) betSaved = true;
      }
    } catch {}
    if (shellRan && !changed.length) changed.push(...changedOnDisk(root, since, shellText));
  }
  return { changed, betSaved, noBet };
}

export function decide(event, { dir = stateDir() } = {}) {
  if (!event || event.stop_hook_active) return null;
  const transcript = event.transcript_path;
  const sessionId = String(event.session_id || "").replace(/[^\w-]/g, "");
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  if (!transcript || !sessionId || !fs.existsSync(transcript)) return null;
  if (/[\\/]\.codex[\\/]/i.test(transcript)) return null;
  let settings;
  try {
    settings = fs.readFileSync(path.join(cwd, "digital-assets", "systems-thinking", "SETTINGS.md"), "utf8");
  } catch {
    return null;
  }
  if (!autoBetsOn(settings)) return null;
  const marker = path.join(dir, `${sessionId}.done`);
  if (fs.existsSync(marker)) return null;
  const { changed, betSaved, noBet } = readTranscript(transcript, cwd);
  if (!changed.length || betSaved || noBet) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  return { decision: "block", reason: REASON };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // best-effort
  }
  return data;
}

async function main() {
  const raw = await readStdin();
  const result = decide(raw ? JSON.parse(raw) : null);
  if (result) process.stdout.write(JSON.stringify(result));
}

if (!process.env.AIEB_BET_CHECK_NO_MAIN) {
  main()
    .catch(() => {})
    .finally(() => {
      process.exitCode = 0;
    });
}
