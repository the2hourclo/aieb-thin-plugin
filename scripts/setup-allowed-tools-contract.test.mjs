import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = fs.readFileSync(path.join(root, "commands/setup-aieb.md"), "utf8");
const frontmatter = command.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
assert.ok(frontmatter, "setup command must have frontmatter");
const allowed = frontmatter[1].match(/^allowed-tools:\s*\[([^\r\n]*)\]\s*$/m);
assert.ok(allowed, "setup command must declare an inline allowed-tools list");
const entries = allowed[1].split(",").map((entry) => entry.trim());
assert.ok(entries.some((entry) => entry.startsWith("Bash")), "setup needs scoped shell grants");
for (const entry of entries) {
  if (/^Bash\b/i.test(entry)) {
    assert.match(entry, /^Bash\([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)* \*\)$/, `shell grant must have a command prefix: ${entry}`);
  }
  assert.doesNotMatch(entry, /\b(?:gh|curl|node|npx|powershell|rm)\b/i, `forbidden setup grant: ${entry}`);
}

console.log("setup-allowed-tools-contract.test: shell grants are scoped and exclude outside-account, runtime, and removal commands");
