import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const setup = read("skills/setup-aieb/SKILL.md");
const check = read("skills/check-setup/SKILL.md");
const command = read("commands/setup-aieb.md");

const preflight = setup.indexOf("## 4. Verify the Cowork Project and folder boundary");
const stateRead = setup.indexOf("Read `.claude-state/progress-state.yaml` first");
assert.ok(preflight >= 0 && stateRead > preflight, "Cowork preflight must run before reading workspace state");
assert.match(setup, /New chat → Project → Add folder/);
assert.match(setup, /Do not inspect `.claude-state`, fetch `onboard`, scaffold, or write anything in temporary scratch space/);
assert.match(setup, /Connector ✅.*Paid entitlement ✅.*Workspace ❌ not attached/s);
assert.match(setup, /readable, writable root is attached and non-empty:[\s\S]*Is `<root>` the Project folder you want AIEB to use\?[\s\S]*Stop until they explicitly confirm/);
assert.match(setup, /workspace already exists in another Project or folder:[\s\S]*Do not create replacement state or re-onboard here/);
assert.match(setup, /reach this branch only after Step 4 verified an attached empty readable\/writable root, or after the user explicitly confirmed the named non-empty root/);
assert.match(setup, /## 6\. Offer the private Continuous Improvement Ledger/);
assert.match(setup, /"capture_mode": "pointer-only"/);
assert.match(setup, /never treat local capture as consent to send product feedback/i);

assert.doesNotMatch(check, /file checks don't apply/i);
assert.match(check, /Workspace ❌ not attached/);
assert.match(check, /Workspace ⚠️ read-only/);
assert.match(check, /Workspace ⚠️ wrong Project/);
assert.match(check, /Workspace ⚠️ unverified/);
assert.match(check, /Connector[\s\S]*Paid entitlement[\s\S]*Workspace/);
assert.match(command, /before[^\n]*reading state or fetching onboarding/i);

const expectedVersion = "0.32.0";
for (const relative of ["plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
  assert.equal(JSON.parse(read(relative)).version, expectedVersion, `${relative} version drifted`);
}
const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
assert.equal(marketplace.metadata.version, expectedVersion);
assert.equal(marketplace.plugins[0].version, expectedVersion);
assert.equal(JSON.parse(read("skill-telemetry/config.json")).plugin_version, `ai-employee-builder-${expectedVersion}`);
assert.match(read("scripts/aieb-mcp-proxy.mjs"), /return "0\.32\.0";/);

console.log("cowork-workspace-preflight-contract.test: boundary, recovery, and version contracts pass");
