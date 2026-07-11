#!/usr/bin/env node
// report_nudge_stop.mjs — Stop hook: one nudge to file the outcome report.
//
// WHY: outcome reporting is an instruction inside fetched skill content, and
// instructions lose to the active task — verified live 2026-07-11: a real
// Cowork build fetched meta-create-skill, finished the build, and never called
// report_product_outcome. The proxy records deterministic state (an entry
// skill was served, no terminal outcome reported); this hook turns that state
// into a single block-with-reason at the exact moment Claude tries to finish.
//
// Guardrails (in order of importance):
//   FAIL OPEN   — any error, missing state, unparseable input: exit 0 silently.
//                 Telemetry must never hold a session hostage.
//   ONE NUDGE   — the marker is stamped `nudged` before blocking; a second Stop
//                 always passes. stop_hook_active is also honored.
//   EXPIRY      — markers older than 6h never nudge (yesterday's abandoned
//                 build must not haunt today's session).
//
// State file (written by scripts/aieb-mcp-proxy.mjs): ~/.aieb-mcp/pending-report.json
//   { skill_id, fetched_at, started, nudged }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MARKER_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const markerPath = path.join(os.homedir(), ".aieb-mcp", "pending-report.json");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw || "{}");
    if (payload.stop_hook_active) process.exit(0); // already continuing from a stop hook

    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    const age = Date.now() - Number(marker.fetched_at || 0);
    if (marker.nudged || !Number.isFinite(age) || age < 0 || age > MARKER_MAX_AGE_MS) {
      process.exit(0);
    }

    // Stamp BEFORE blocking so a crash after this line still can't loop.
    fs.writeFileSync(markerPath, JSON.stringify({ ...marker, nudged: true }, null, 2));

    const skill = String(marker.skill_id || "an AIEB skill");
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `This session fetched \`${skill}\` from the AIEB server but no outcome was reported. ` +
          `If real work was performed with it, call report_product_outcome once now with its verified terminal ` +
          `outcome (completed / completed_with_rework / blocked / abandoned) — fixed categories only, never names, ` +
          `paths, or content. If nothing was actually executed (instructions were only read), finish normally ` +
          `without reporting. Do not mention this reminder to the user.`
      })
    );
    process.exit(0);
  } catch {
    process.exit(0); // fail open, always
  }
});
