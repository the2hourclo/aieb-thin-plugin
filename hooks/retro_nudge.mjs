#!/usr/bin/env node
/**
 * SessionStart hook (Node is guaranteed on buyer machines because the connector
 * runs on it; Python is not on stock
 * Windows): scan the PREVIOUS session's transcript for explicit skill wins or
 * friction.
 *
 * If the user clearly praised or corrected an ai-employee-builder skill's
 * output last session, inject a small nudge into this session's first turn. The nudge routes by
 * OWNERSHIP: a skill in the buyer's own `.claude/skills/` is theirs — the
 * plugin's author can't fix it, so the retrospective skill (a direct
 * SKILL.md patch) leads. A consent-gated rich win/friction note is offered only for the
 * plugin's built-in skills — there is no note command; Claude runs the
 * procedure itself after an explicit in-chat yes.
 *
 * Why SessionStart instead of a Stop + UserPromptSubmit pair: retros look
 * backward at completed work, so triggering at the start of the NEXT session
 * is conceptually cleaner AND avoids any Stop-class hook (a bug in a Stop
 * hook can spam, because every model turn re-fires Stop). One event, one
 * script, no recursion vectors.
 *
 * Behavior:
 *   1. Locate the previous transcript: all .jsonl siblings of this session's
 *      transcript, excluding the current one, most-recently-modified wins.
 *   2. If we've already nudged about that transcript (marker file keyed by
 *      transcript filename), exit silent.
 *   3. Scan USER messages only for explicit friction or win phrases. Tool
 *      output and assistant text never count as customer feedback.
 *   4. Emit additionalContext with the nudge.
 *   5. When the workspace explicitly opted in, append pointer-only evidence to
 *      the runtime inbox and ingest it into the shared local AIEB ledger.
 *   6. Mark the transcript as nudged so resumes don't repeat it.
 *
 * All failure modes exit 0 silently — the nudge is a nice-to-have, never a
 * blocker.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { captureAndIngest, detectRuntime } from "./lib/retrospective-ledger.mjs";

const PLUGIN_NAME = "ai-employee-builder";
const IS_CODEX = Boolean(process.env.PLUGIN_ROOT);
const OWN_SKILLS_PATH = IS_CODEX ? ".agents/skills/" : ".claude/skills/";
const RETRO_ACTION = IS_CODEX ? "the retrospective skill" : `/${PLUGIN_NAME}:retrospective`;

function claudeRoot() {
  if (process.env.PLUGIN_DATA) return process.env.PLUGIN_DATA;
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, ".claude");
}

function logEvent(stage, fields = {}) {
  try {
    const logPath = path.join(claudeRoot(), ".clo-os-state", `${PLUGIN_NAME}-hooks.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const record = {
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
      hook: "retro_nudge",
      stage,
      plugin: PLUGIN_NAME,
      ...fields
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // never block on logging
  }
}

const FRICTION_PATTERNS = [
  /\bthat skill (got it wrong|messed up|missed it|didn't work)/i,
  /\bfix (this|that) skill\b/i,
  /\bthe \w+(-\w+)? skill (got it wrong|messed up|didn't work|misfired)/i,
  /\bskill (didn't|did not) (activate|trigger|fire|run)/i,
  /\b(redo|try again).{0,40}(skill|wrong|missed)/i,
  /\bthe (output|result) (was|is) (wrong|off|bad)\b/i,
  /\bthat'?s not (what i wanted|right|how)/i,
  /\bskill (output|result) (was|is) wrong\b/i,
  // "keeps <verb>ing ... wrong/badly" complaint class, e.g.
  // "it keeps formatting the table wrong", "keeps writing it badly".
  /\bkeeps? (doing|getting|making|formatting|writing|producing)\b.{0,40}\b(wrong|badly|incorrectly)/i,
  /\bkeeps? (messing|screwing) (it |this |that )?up\b/i
];

const WIN_PATTERNS = [
  /\b(exactly what i wanted|that'?s exactly it|nailed it|perfect result)\b/i,
  /\b(that|this|it) (worked|works) (perfectly|great|well|first try|right away)\b/i,
  /\b(used|use|ship|shipped|publish|published) (that|this|it) as[- ]is\b/i,
  /\b(no changes|no edits|no revisions) (needed|required)\b/i,
  /\b(saved|saves) me (a lot of )?(time|hours|work)\b/i,
  /\b(that|this) is (great|excellent|perfect|really good)\b/i
];

const COMMON_NUDGE =
  `[${PLUGIN_NAME} hook] The previous session for this project contained explicit user feedback about a skill. ` +
  "Handle the current request first. At a natural opening, inspect which skill produced the evaluated result and " +
  "where it lives. Never quote or upload transcript text. Mention any follow-up once, without pushing. ";

const FRICTION_NUDGE =
  "FRICTION: If this was the user's OWN skill in " +
  `${OWN_SKILLS_PATH}, do not report it as AIEB product feedback; offer to run ${RETRO_ACTION} and patch that ` +
  "skill's SKILL.md. If it was a plugin-shipped skill fetched through get_skill, call report_skill_feedback once " +
  "with signal=friction and the closest fixed category (no free text). Then lead with the instant local fix: offer " +
  "to add one or two additive rules to digital-assets/overrides/<skill>.md using " +
  "self-improve/write-override-procedure.md. Separately, you may offer to send one richer anonymized note to the " +
  "author; only after an explicit yes, follow skill-telemetry/note-friction-procedure.md. The override and rich note " +
  "are independent; neither happens without an explicit yes. ";

const WIN_NUDGE =
  "WIN: If this was the user's OWN skill in " +
  `${OWN_SKILLS_PATH}, do not report it as AIEB product feedback; offer to run ${RETRO_ACTION} and preserve the ` +
  "winning move in that skill. If it was a plugin-shipped skill fetched through get_skill, call " +
  "report_skill_feedback once with signal=win and the closest fixed category (no free text). You may then offer to " +
  "send the author one richer anonymized win note; only after an explicit yes, follow " +
  "skill-telemetry/note-win-procedure.md. Do not treat a generic thank-you as a win. ";

function buildNudge(signals, ledger = null) {
  const ledgerContext = ledger?.ingest?.enabled
    ? `LOCAL LEDGER: AIEB recorded pointer-only evidence locally and .aieb/retrospective/ledger.jsonl now has ${ledger.ingest.unreviewed || 0} unreviewed item(s). No transcript text was copied or uploaded. If the user chooses retrospective, start from that ledger, resolve source_ref against the runtime-local inbox, and keep the retrospective skill's explicit approval gate before any edit. `
    : "";
  return COMMON_NUDGE + (signals.friction ? FRICTION_NUDGE : "") + (signals.win ? WIN_NUDGE : "") + ledgerContext;
}

function findPreviousTranscript(current) {
  try {
    const parent = path.dirname(current);
    if (!fs.existsSync(parent)) return null;
    let currentReal;
    try {
      currentReal = fs.realpathSync(current);
    } catch {
      currentReal = path.resolve(current);
    }
    const candidates = [];
    for (const name of fs.readdirSync(parent)) {
      if (!name.endsWith(".jsonl")) continue;
      const p = path.join(parent, name);
      let real;
      try {
        real = fs.realpathSync(p);
      } catch {
        real = path.resolve(p);
      }
      if (real === currentReal) continue;
      candidates.push(p);
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0];
  } catch {
    return null;
  }
}

function flattenMessageText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenMessageText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.message === "string") return value.message;
  return flattenMessageText(value.content);
}

function userMessagesFromTranscript(transcript) {
  let body;
  try {
    body = fs.readFileSync(transcript, "utf8");
  } catch {
    return "";
  }
  const messages = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.message?.role === "user") messages.push(flattenMessageText(record.message.content));
    else if (record?.role === "user") messages.push(flattenMessageText(record.content));
    else if (record?.type === "user") messages.push(flattenMessageText(record.message?.content ?? record.content));
    else if (record?.payload?.type === "user_message") {
      messages.push(flattenMessageText(record.payload.message ?? record.payload.content));
    }
  }
  return messages.filter(Boolean);
}

function feedbackMatches(transcript) {
  const messages = userMessagesFromTranscript(transcript);
  const matches = [];
  messages.forEach((userText, message_index) => {
    if (FRICTION_PATTERNS.some((pattern) => pattern.test(userText))) {
      matches.push({ signal: "friction", message_index });
    }
    if (WIN_PATTERNS.some((pattern) => pattern.test(userText))) {
      matches.push({ signal: "win", message_index });
    }
  });
  return matches;
}

function feedbackSignals(matches) {
  return {
    friction: matches.some((match) => match.signal === "friction"),
    win: matches.some((match) => match.signal === "win")
  };
}

function alreadyNudgedMarker(cwd, transcript) {
  const safe = path.basename(transcript).replace(/[^A-Za-z0-9_.-]/g, "_");
  return path.join(cwd, ".claude-state", `retro-nudged-${PLUGIN_NAME}-${safe}`);
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // stdin is best-effort
  }
  return data;
}

async function main() {
  const raw = await readStdin();
  if (!raw) return;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  const transcriptPath = event.transcript_path;
  if (!transcriptPath) {
    logEvent("no-transcript-path");
    return;
  }

  const prior = findPreviousTranscript(transcriptPath);
  if (prior === null) {
    logEvent("no-prior-transcript");
    return;
  }

  const marker = alreadyNudgedMarker(cwd, prior);
  try {
    if (fs.existsSync(marker)) {
      logEvent("already-nudged", { prior: path.basename(prior) });
      return;
    }
  } catch {
    return;
  }

  const matches = feedbackMatches(prior);
  const signals = feedbackSignals(matches);
  if (!signals.friction && !signals.win) {
    logEvent("no-feedback", { prior: path.basename(prior) });
    return;
  }

  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "", "utf8");
  } catch {
    // best-effort — a missing marker only risks one extra nudge
  }

  const ledger = captureAndIngest({
    cwd,
    runtime: detectRuntime(event),
    sessionId: event.session_id,
    transcriptPath: prior,
    matches
  });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: buildNudge(signals, ledger)
      }
    })
  );
  logEvent("nudge-emitted", {
    prior: path.basename(prior),
    friction: signals.friction,
    win: signals.win,
    ledger_enabled: ledger.capture.enabled,
    ledger_ingested: ledger.ingest.ingested || 0
  });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
