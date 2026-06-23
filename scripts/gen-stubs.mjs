#!/usr/bin/env node
/**
 * gen-stubs.mjs — generate the thin plugin's auto-routing skill stubs.
 *
 * Each AIEB skill ships to buyers as a tiny LOCAL stub: the skill's real
 * frontmatter (name + description + USE WHEN triggers, copied verbatim so the
 * harness auto-routes exactly like the full skill) wrapped around a fixed
 * "loader" body that tells Claude to fetch the real instructions from the
 * gated `aieb` MCP via get_skill. No skill body, no workflows, no references
 * are stored locally — only the routing surface + the fetch convention.
 *
 * Re-run this whenever a source skill's description changes, to keep the stub
 * triggers in sync with the canonical skill.
 *
 *   node scripts/gen-stubs.mjs
 *
 * Source of truth for frontmatter = the canonical skills in clo-os-plugins.
 * Override with AIEB_SKILLS_SRC if that checkout lives elsewhere.
 */
import fs from "node:fs";
import path from "node:path";

const SRC =
  process.env.AIEB_SKILLS_SRC ||
  "C:/Users/rkham/OneDrive/Desktop/clo-os-plugins/plugins/ai-employee-builder/skills";
const DST = path.resolve(import.meta.dirname, "..", "skills");

// The skills a buyer should be able to trigger. business-x-ray first (it's the
// proven one). install-skill is manual-only — its source frontmatter already
// carries disable-model-invocation: true, preserved verbatim below.
const SKILLS = [
  "business-x-ray",
  "meta-create-skill",
  "meta-create-agent",
  "meta-create-command",
  "meta-create-hook",
  "meta-create-mcp",
  "meta-create-plugin",
  "business-os",
  "retrospective",
  "onboard",
  "install-skill",
];

function loaderBody(skillId) {
  return `# ${skillId} — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the \`get_skill\` tool on the \`aieb\` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the \`aieb\` MCP \`get_skill\` tool with:

- \`skill_id\`: \`${skillId}\`
- \`path\`: \`SKILL.md\`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read \`references/foo.md\`"*, *"load \`workflows/bar.md\`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with \`get_skill\` using that exact path instead:

- *"read \`references/foo.md\`"* → \`get_skill(skill_id="${skillId}", path="references/foo.md")\`
- *"load \`workflows/bar.md\`"* → \`get_skill(skill_id="${skillId}", path="workflows/bar.md")\`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with \`get_skill\` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. No license / errors

If \`get_skill\` returns a license or entitlement error, stop. Tell the user plainly that their AI Employee Builder license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
`;
}

let count = 0;
for (const id of SKILLS) {
  const srcPath = path.join(SRC, id, "SKILL.md");
  if (!fs.existsSync(srcPath)) {
    console.error(`SKIP ${id}: source not found at ${srcPath}`);
    continue;
  }
  const src = fs.readFileSync(srcPath, "utf8");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    console.error(`SKIP ${id}: no frontmatter block in source`);
    continue;
  }
  const frontmatter = m[1].trim();
  const out = `---\n${frontmatter}\n---\n\n${loaderBody(id)}`;
  const dstDir = path.join(DST, id);
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, "SKILL.md"), out, "utf8");
  count++;
  console.log(`wrote skills/${id}/SKILL.md`);
}
console.log(`\nDone — ${count}/${SKILLS.length} stubs generated.`);
