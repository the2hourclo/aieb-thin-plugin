import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const guardPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skill_edit_guard.mjs");

function runGuard(payload) {
  const result = spawnSync(process.execPath, [guardPath], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

function assertDenied(decision) {
  assert.equal(decision?.hookSpecificOutput?.hookEventName, "PreToolUse");
  assert.equal(decision?.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(decision?.hookSpecificOutput?.permissionDecisionReason || "", /managed plugin skills/i);
}

test("denies Claude Edit against a managed plugin skill", () => {
  assertDenied(runGuard({
    tool_name: "Edit",
    tool_input: { file_path: "C:\\Users\\buyer\\.claude\\plugins\\cache\\aieb\\1.0.0\\skills\\write\\SKILL.md" }
  }));
});

test("denies Codex apply_patch when any patch target is a managed skill", () => {
  assertDenied(runGuard({
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: C:\\Users\\buyer\\.codex\\plugins\\cache\\aieb-thin-plugin\\ai-employee-builder\\1.0.0\\skills\\write\\SKILL.md\n@@\n-old\n+new\n*** End Patch"
    }
  }));
});

test("allows user-authored workspace skills and unrelated files", () => {
  assert.equal(runGuard({
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: .agents/skills/my-skill/SKILL.md\n@@\n-old\n+new\n*** End Patch"
    }
  }), null);
  assert.equal(runGuard({ tool_name: "Write", tool_input: { file_path: "notes/plan.md" } }), null);
});

test("malformed input emits no unsupported decision", () => {
  assert.equal(runGuard("not json"), null);
});
