#!/usr/bin/env node
// PreToolUse guard for managed plugin skill copies.
//
// Claude reports Edit/Write with tool_input.file_path. Codex may match this
// hook through the Edit|Write aliases but reports canonical tool_name
// "apply_patch" with the patch in tool_input.command. A managed cache edit must
// fail closed on both hosts; user-authored workspace skills remain editable.

const MANAGED_PLUGIN_SKILL = /(?:^|\/)(?:\.claude|\.codex)\/plugins\/.*\/skills\//i;

function normalizePath(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\\/g, "/");
}

function pathsFromPatch(command) {
  const paths = [];
  const headers = /^\*\*\*\s+(?:Add|Update|Delete) File:\s*(.+?)\s*$/gim;
  const moves = /^\*\*\*\s+Move to:\s*(.+?)\s*$/gim;
  for (const pattern of [headers, moves]) {
    for (const match of String(command || "").matchAll(pattern)) paths.push(normalizePath(match[1]));
  }
  return paths;
}

function targetPaths(payload) {
  const tool = String(payload?.tool_name || "");
  if (tool === "Edit" || tool === "Write") return [normalizePath(payload?.tool_input?.file_path)];
  if (tool === "apply_patch") return pathsFromPatch(payload?.tool_input?.command);
  return [];
}

function denyDecision() {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "Direct edits to managed plugin skills are blocked because an update replaces them. " +
        "For a durable personal rule, create an override in digital-assets/overrides/<skill>.md " +
        "through the plugin's override procedure. If the skill misfired, run the retrospective skill. " +
        "Plugin maintainers should edit the source repository, test it, and publish through the release workflow."
    }
  };
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw || "{}");
    if (targetPaths(payload).some((filePath) => MANAGED_PLUGIN_SKILL.test(filePath))) {
      process.stdout.write(JSON.stringify(denyDecision()));
    }
  } catch {
    // Invalid hook input is not evidence that a managed path is being edited.
  }
});
