#!/usr/bin/env node
/**
 * Stop hook: once per chat, catch a finished build that has no bet yet.
 *
 * Fires only in a folder where the owner said yes to automatic bets
 * (newest `auto bets` line in digital-assets/systems-thinking/SETTINGS.md is
 * `yes`). If this chat successfully changed a file (an edit tool, or a shell
 * command that writes) outside the skill's own bookkeeping files, and did not
 * append a NEW bet line to digital-assets/systems-thinking/BETS.md, Claude is
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
// Shell commands that change files. A redirect to a null device or 2>&1 doesn't count.
const SHELL_WRITE = [
  /(^|[^0-9&>])>{1,2}\s*(?!&|\/dev\/null|\$null|nul\b)[^\s|&;]/i,
  /\btee\s/,
  /\bsed\s[^|;&]*-i/,
  /(^|[\s;&|(])(cp|mv|rm|mkdir|touch)\s/,
  /\b(Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item|Rename-Item)\b/i,
  /\[System\.IO\.File\]::(Write|Append)/i,
  /\bgit\s+(commit|apply|restore)\b/
];
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
  const root = path.resolve(cwd);
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
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
      const cmd = String(part.input?.command || "");
      if (/digital-assets[\\/]+systems-thinking[\\/]+BETS\.md/i.test(cmd) && BET_LINE.test(cmd)) {
        betSaved = true;
        continue;
      }
      if (SHELL_WRITE.some((re) => re.test(cmd))) changed.push(`(shell) ${cmd.slice(0, 60)}`);
    }
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
