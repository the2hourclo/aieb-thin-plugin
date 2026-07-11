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

const DST = path.resolve(import.meta.dirname, "..", "skills");

// Single source of truth = the SERVER manifest: every tier's skill_ids becomes a
// stub, sourced from that tier's canonical skill repo. Buyers get ALL stubs
// regardless of plan — a locked skill returns the server's upgrade message at the
// moment of felt need (that's the upsell surface, by design).
const MANIFEST_PATH =
  process.env.AIEB_MANIFEST_PATH ||
  "C:/Users/rkham/OneDrive/Desktop/Cursor Projects/operations/mcp-servers/aieb-gated-mcp/config/aieb-skills.manifest.json";
const TIER_SRC = {
  // The keyless free tier's skills are authored in the server repo (content-src).
  free: path.dirname(MANIFEST_PATH).replace(/config$/, "content-src"),
  aieb:
    process.env.AIEB_SKILLS_SRC ||
    "C:/Users/rkham/OneDrive/Desktop/clo-os-plugins/plugins/ai-employee-builder/skills",
  community:
    process.env.AIEB_FLEET_SRC ||
    "C:/Users/rkham/OneDrive/Desktop/clo-os-plugins/plugins/clo-community/skills"
};

// MCP-only skills authored inside the server repo (no plugin-repo source).
const SRC_OVERRIDES = {
  "setup-content-employees": path.dirname(MANIFEST_PATH).replace(/config$/, "content-src"),
  "check-setup": path.dirname(MANIFEST_PATH).replace(/config$/, "content-src")
};

// Skills whose FULL body ships locally instead of a loader stub. The rescue
// skill cannot live behind the connector it exists to rescue (2026-07-11
// architecture pass, R1): check-setup must be able to run when get_skill is
// missing or broken. Source stays canonical (content-src / plugin repo); this
// script copies the whole body so regeneration keeps local copies in lockstep.
// The skill stays in the manifest so find_skill and older (stub-era) shells
// still resolve it server-side.
const LOCAL_FULL = new Set(["check-setup"]);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const SKILLS = [];
for (const [tierId, tier] of Object.entries(manifest.tiers)) {
  const srcRoot = TIER_SRC[tierId];
  if (!srcRoot) {
    console.error(`SKIP tier ${tierId}: no source root configured`);
    continue;
  }
  for (const id of tier.skill_ids || []) {
    SKILLS.push({ id, srcRoot: SRC_OVERRIDES[id] || srcRoot, tier: tierId });
  }
}

function loaderBody(skillId) {
  return `# ${skillId} — MCP loader

This file is **only a loader**. The full instructions for this skill — its SKILL.md and every workflow, reference, template, and example — live on the **AI Employee Builder MCP server** and are fetched at runtime through the \`get_skill\` tool on the \`aieb\` MCP server, after your license is checked. Nothing of value is stored in this file.

Follow these rules exactly.

## 1. Load the real instructions first

Call the \`aieb\` MCP \`get_skill\` tool with:

- \`skill_id\`: \`${skillId}\`
- \`path\`: \`SKILL.md\`

Then follow exactly what it returns. That returned SKILL.md is the real router — it names every workflow, reference, and example path you will need.

**Before concluding the connector is missing, search properly.** The tool's full name varies by surface (Claude Code: \`mcp__aieb__get_skill\`; Cowork/Desktop: \`mcp__plugin_ai-employee-builder_aieb__get_skill\`) — match ANY tool ending in \`get_skill\`, never an exact name. On Cowork, MCP tools load lazily: they may not appear in the visible tool list until searched for — run a tool search for "get_skill" before deciding it's absent.

**If a \`get_skill\` tool truly does NOT exist on any server after searching**, the connector is missing on this machine. Stop and tell the user the fix for THEIR surface, then wait:

> **Claude Code:** The AI Employee Builder connector isn't set up yet — run /setup-aieb, open the secure link it gives you, then /reload-plugins. Never paste a license key into chat.
>
> **Claude Desktop / Cowork:** Make sure the AI Employee Builder plugin is installed (Customize → Personal plugins — if it's missing, add the marketplace \`the2hourclo/aieb-thin-plugin\` and install it), then run /setup-aieb here in chat. It gives you a secure page where you enter the key; the plugin saves only an opaque device token. Never paste the key into chat. Still nothing after that? Say "check my setup" and I'll walk you through it.

Do not guess at or reconstruct the skill's content in the meantime.

## 2. Every file path is an MCP path — never read it from disk

The returned instructions are written as if the files sit on local disk (e.g. *"read \`references/foo.md\`"*, *"load \`workflows/bar.md\`"*). **They are not local.** Whenever the instructions tell you to read, load, open, or see any file path inside this skill, fetch it with \`get_skill\` using that exact path instead:

- *"read \`references/foo.md\`"* → \`get_skill(skill_id="${skillId}", path="references/foo.md")\`
- *"load \`workflows/bar.md\`"* → \`get_skill(skill_id="${skillId}", path="workflows/bar.md")\`

Do **not** use the Read tool for these paths. A "file not found" on disk is expected — it just means you must fetch the path from the MCP.

## 3. Scripts

If an instruction says to run a script, fetch its text with \`get_skill\` (same skill_id, the script's path), write it to a local working file, then execute it.

## 4. Locked skill (upgrade message)

If \`get_skill\` returns a 🔒 message saying this skill is part of a higher plan, that is a NORMAL answer, not an error: relay the message and the upgrade link to the user warmly, then stop. The existing device connection unlocks it after they upgrade — nothing to reinstall and no key belongs in chat. Do not retry, and never reconstruct the skill's content yourself.

## 5. No license / errors

If \`get_skill\` returns a license or entitlement error, stop. Tell the user plainly that their license must be active, and share the renewal link the server returns. Never invent, guess, or reconstruct the skill's content.

---

**Now do step 1.**
`;
}

// Menu slimming (manifest-driven, sources untouched): every stub description is
// prefixed with its employee label ("Writing employee · …") so grouped identity
// survives on surfaces that ignore user-invocable; skills marked menu:"hidden"
// (the chain gears) also get `user-invocable: false` so they leave the visible
// /skill menu while model-invocation and cross-skill chains keep working.
const EMPLOYEE_LABELS = {
  builder: "Builder employee",
  setup: "Setup employee",
  writing: "Writing employee"
};

function applyMenuFields(frontmatter, skillMeta) {
  let fm = frontmatter;
  const label = EMPLOYEE_LABELS[skillMeta?.employee];
  if (label) {
    const lines = fm.split(/\r?\n/);
    const i = lines.findIndex((line) => /^description\s*:/.test(line));
    if (i !== -1) {
      const after = lines[i].replace(/^description\s*:\s*/, "");
      if (/^[>|]/.test(after)) {
        // Block/folded scalar: prefix the first content line instead.
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim()) {
            lines[j] = lines[j].replace(/^(\s*)/, `$1${label} · `);
            break;
          }
        }
      } else {
        const quote = after.startsWith('"') || after.startsWith("'") ? after[0] : "";
        const rest = quote ? after.slice(1) : after;
        lines[i] = `description: ${quote}${label} · ${rest}`;
      }
      fm = lines.join("\n");
    }
  }
  if (skillMeta?.menu === "hidden") {
    fm += `\nuser-invocable: false`;
  }
  return fm;
}

let count = 0;
let hiddenCount = 0;
for (const { id, srcRoot, tier } of SKILLS) {
  const srcPath = path.join(srcRoot, id, "SKILL.md");
  if (!fs.existsSync(srcPath)) {
    console.error(`SKIP ${id} (${tier}): source not found at ${srcPath}`);
    continue;
  }
  const src = fs.readFileSync(srcPath, "utf8");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    console.error(`SKIP ${id} (${tier}): no frontmatter block in source`);
    continue;
  }
  const skillMeta = manifest.skills?.[id];
  const frontmatter = applyMenuFields(m[1].trim(), skillMeta);
  if (skillMeta?.menu === "hidden") hiddenCount++;
  const body = LOCAL_FULL.has(id)
    ? src.slice(m[0].length).replace(/^\s+/, "") // full body, verbatim from source
    : loaderBody(id);
  const out = `---\n${frontmatter}\n---\n\n${body}`;
  const dstDir = path.join(DST, id);
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, "SKILL.md"), out, "utf8");
  count++;
  const extras = ["context:", "hooks:", "agent:", "model:"]
    .filter((key) => frontmatter.includes(key))
    .map((key) => key.replace(":", ""));
  const menuTag = skillMeta?.menu === "hidden" ? ", menu-hidden" : "";
  console.log(`wrote skills/${id}/SKILL.md (${tier}${menuTag}${extras.length ? ", carries: " + extras.join("+") : ""})`);
}
console.log(`\nDone — ${count}/${SKILLS.length} stubs generated (${hiddenCount} menu-hidden).`);
