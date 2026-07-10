#!/usr/bin/env node
// skill_edit_guard.mjs — PreToolUse guard: direct edits to managed skill files
// get an explicit confirm instead of sliding through silently.
//
// WHY: the live-reproduced buyer failure (2026-07-10 probe): asked to "add a
// rule to my write skill", the model reached for Edit on the stub SKILL.md
// instead of routing to meta-create-skill. Description text alone doesn't stop
// that instinct; this hook is the enforcement half. Decision is "ask", not
// "deny": meta-create-skill's own legitimate apply step edits skill files too,
// and the buyer stays in control with a one-click approve.
//
// Scope: files under any `.claude/skills/` tree (workspace or user) and any
// plugin `skills/` tree. Everything else passes through untouched.

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let decision = null;
  try {
    const payload = JSON.parse(raw || "{}");
    const tool = payload.tool_name || "";
    if (tool === "Edit" || tool === "Write") {
      const p = String(payload.tool_input?.file_path || "").replace(/\\/g, "/");
      const managed =
        /\/\.claude\/skills\//i.test(p) ||
        /\/\.claude\/plugins\/.*\/skills\//i.test(p);
      if (managed) {
        decision = {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason:
              "This file belongs to a managed AI Employee skill. Direct edits are overwritten by " +
              "updates and skip the update discipline. The right door: say \"update the <skill> skill\" — " +
              "the meta-create-skill employee applies changes properly (for served skills, via " +
              "digital-assets/overrides/<skill>.md, which survives every update). Approve this only if " +
              "you are deliberately hand-editing, e.g. while following meta-create-skill's own instructions."
          }
        };
      }
    }
  } catch {
    // Malformed input: never block work because the guard itself hiccuped.
  }
  if (decision) process.stdout.write(JSON.stringify(decision));
  process.exit(0);
});
