#!/usr/bin/env node
/**
 * SessionStart hook (Node port of retro_nudge.py — Node is guaranteed on
 * buyer machines because the connector runs on it; Python is not on stock
 * Windows): scan the PREVIOUS session's transcript for skill friction.
 *
 * If the user corrected an ai-employee-builder skill's output last session,
 * inject a small nudge into this session's first turn. The nudge routes by
 * OWNERSHIP: a skill in the buyer's own `.claude/skills/` is theirs — the
 * plugin's author can't fix it, so the retrospective skill (a direct
 * SKILL.md patch) leads. A consent-gated friction note (following
 * skill-telemetry/note-friction-procedure.md) is offered only for the
 * plugin's built-in skills — there is no note command; Claude runs the
 * procedure itself after an explicit in-chat yes.
 *
 * Why SessionStart instead of a Stop + UserPromptSubmit pair: retros look
 * backward at completed work, so triggering at the start of the NEXT session
 * is conceptually cleaner AND avoids any Stop-class hook (a bug in a Stop
 * hook can spam, because every model turn re-fires Stop). One event, one
 * script, no recursion vectors.
 *
 * Behavior (identical to the Python fallback — keep the two in lockstep):
 *   1. Locate the previous transcript: all .jsonl siblings of this session's
 *      transcript, excluding the current one, most-recently-modified wins.
 *   2. If we've already nudged about that transcript (marker file keyed by
 *      transcript filename), exit silent.
 *   3. Scan it for friction phrases. No match -> exit silent.
 *   4. Emit additionalContext with the nudge.
 *   5. Mark the transcript as nudged so resumes don't repeat it.
 *
 * All failure modes exit 0 silently — the nudge is a nice-to-have, never a
 * blocker.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

const NUDGE =
  `[${PLUGIN_NAME} hook] The previous session for this project showed friction ` +
  "with a skill — the user corrected its output, redid it, or said it " +
  "missed. When there's a natural opening (NOT before answering their " +
  "current question), mention it casually ONCE. First check WHERE the " +
  "skill lives. If it is the user's OWN skill (it lives in this project's " +
  `${OWN_SKILLS_PATH}), LEAD with the fix they control: \"By the way, a skill ` +
  "seemed to miss last session. That one is yours — want me to run " +
  `${RETRO_ACTION} and patch its SKILL.md so it doesn't happen ` +
  "again?\" (the plugin's author can't fix a skill that exists only on " +
  "this machine). If it is one of the plugin's built-in skills (fetched " +
  "through get_skill, so read-only — you can't edit its SKILL.md), LEAD " +
  "with the instant LOCAL fix: \"That one ships with the plugin, so I " +
  "can't edit it directly — but I can add a personal rule so it does it " +
  "your way from now on. It writes a short override to " +
  "digital-assets/overrides/<skill>.md, stays on your machine, and your " +
  "rule wins over the default. Want that?\" On yes, follow this plugin's " +
  "self-improve/write-override-procedure.md (distill the correction into " +
  "one or two additive rules; append, never overwrite). THEN you may also " +
  "offer the upstream flag as a separate, secondary step: \"Want me to " +
  "also flag it to the author so it's fixed for everyone? One short " +
  "anonymized note, nothing else leaves your machine.\" On yes to that, " +
  "follow skill-telemetry/note-friction-procedure.md (one distilled note). " +
  "The override and the note are independent — the override fixes it for " +
  "this user now, the note helps the next release; neither happens without " +
  "an explicit yes. Don't push, don't interrupt mid-task, mention it once.";

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

function hasFriction(transcript) {
  let body;
  try {
    body = fs.readFileSync(transcript, "utf8");
  } catch {
    return false;
  }
  return FRICTION_PATTERNS.some((p) => p.test(body));
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

  if (!hasFriction(prior)) {
    logEvent("no-friction", { prior: path.basename(prior) });
    return;
  }

  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "", "utf8");
  } catch {
    // best-effort — a missing marker only risks one extra nudge
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: NUDGE
      }
    })
  );
  logEvent("nudge-emitted", { prior: path.basename(prior) });
}

main()
  .catch(() => {})
  .finally(() => {
    process.exitCode = 0;
  });
