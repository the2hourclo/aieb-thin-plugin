#!/usr/bin/env node
// validate-structure.mjs — the mechanical half of skill validation.
// Replaces five contradictory prose line-budget rules with one executable answer
// (origin: 2026-07-28 context-trimming first pass; canonical numbers live in
// references/SKILL-STRUCTURE-AND-ROUTING.md § The size budget).
//
// Checks (deterministic only — judgment rows stay in validate-skill.md):
//   1. Frontmatter parses: --- block with name: and description:; balanced quotes
//   2. Description within the official 1,024-character cap
//   3. `## Workflow Routing` present and the FIRST level-2 content section
//   4. Every workflows/*.md routed from SKILL.md (no orphans) and no dead routes
//   5. No stray markdown headings inside code fences (pollutes heading parsers)
//   6. Line budget per archetype: router (≥2 workflows) ≤250 body lines, leaf ≤500
//
// Usage: node validate-structure.mjs <skill-dir>
// Prints numbered FAILs or `VERDICT: CLEAN`. Exit 1 on any FAIL.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const target = process.argv[2];
if (!target || !existsSync(target) || !statSync(target).isDirectory()) {
  console.error('Usage: node validate-structure.mjs <skill-dir>');
  process.exit(2);
}

const skillPath = join(target, 'SKILL.md');
const fails = [];
const fail = (msg) => fails.push(msg);

if (!existsSync(skillPath)) {
  fail(`SKILL.md missing at ${skillPath}`);
  report();
}

const raw = readFileSync(skillPath, 'utf8').replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '');
const lines = raw.split(/\r?\n/);

// ---- 1. Frontmatter ----
let fmEnd = -1;
if (lines[0] !== '---') {
  fail('frontmatter: file does not open with `---` on line 1');
} else {
  fmEnd = lines.findIndex((l, i) => i > 0 && l === '---');
  if (fmEnd === -1) fail('frontmatter: opening `---` never closed');
}
const fm = fmEnd > 0 ? lines.slice(1, fmEnd) : [];
const fmText = fm.join('\n');
if (!/^name:\s*\S+/m.test(fmText)) fail('frontmatter: no `name:` field');

// ---- 2. Description cap ----
const descMatch = fmText.match(/^description:\s*([\s\S]*?)(?=^[a-zA-Z_-]+:|\s*$(?![\s\S]))/m);
if (!descMatch) {
  fail('frontmatter: no `description:` field');
} else {
  let desc = descMatch[1].trim();
  const quoted = desc.startsWith('"');
  if (quoted && !desc.endsWith('"')) fail('frontmatter: description opens with `"` but never closes it');
  if (quoted) desc = desc.slice(1, desc.endsWith('"') ? -1 : undefined);
  if (desc.length > 1024) {
    fail(`description: ${desc.length} chars — exceeds the official 1,024-char cap (compress: one exemplar phrase per trigger family; see references/frontmatter.md)`);
  }
}

// ---- 3 + 5. Heading scan with fence tracking ----
let inFence = false;
let firstH2 = null;
const strayInFence = [];
const bodyStart = fmEnd + 1;
for (let i = bodyStart; i < lines.length; i++) {
  const line = lines[i];
  if (/^(```|~~~)/.test(line.trim())) { inFence = !inFence; continue; }
  if (inFence) {
    if (/^#{1,6}\s/.test(line)) strayInFence.push(`line ${i + 1}: ${line.trim().slice(0, 60)}`);
    continue;
  }
  if (firstH2 === null && /^##\s/.test(line) && !/^###/.test(line)) firstH2 = line.trim();
}
// Routing-first applies only to skills that HAVE workflows to route — a leaf
// skill with no workflows/ owes no routing section (carve-out: over-enforcing
// this on leaf skills was the gate's own first false positive, 2026-07-28).
const wfDirEarly = join(target, 'workflows');
const hasWorkflows = existsSync(wfDirEarly) && readdirSync(wfDirEarly).some((f) => f.endsWith('.md'));
if (hasWorkflows) {
  if (firstH2 === null) {
    fail('routing: no `## Workflow Routing` section found (no level-2 headings at all)');
  } else if (firstH2 !== '## Workflow Routing') {
    fail(`routing: first level-2 section is \`${firstH2}\` — \`## Workflow Routing\` must come first (untagged, exact)`);
  }
  if (!/^## Workflow Routing$/m.test(raw)) {
    fail('routing: `## Workflow Routing` heading missing or tagged (e.g. "(SYSTEM PROMPT)") — the untagged form is a served-slicer contract');
  }
}
for (const s of strayInFence) fail(`stray heading inside a code fence — pollutes heading parsers → ${s}`);

// ---- 4. Workflow routing coverage ----
const wfDir = join(target, 'workflows');
let wfFiles = [];
if (existsSync(wfDir)) {
  wfFiles = readdirSync(wfDir).filter((f) => f.endsWith('.md'));
  for (const f of wfFiles) {
    if (!raw.includes(`workflows/${f}`)) fail(`orphan workflow: workflows/${f} is never routed from SKILL.md`);
  }
}
const routed = [...raw.matchAll(/workflows\/([a-z0-9-]+\.md)/g)].map((m) => m[1]);
for (const r of new Set(routed)) {
  if (!existsSync(join(wfDir, r))) fail(`dead route: SKILL.md points at workflows/${r} which does not exist`);
}

// ---- 6. Line budget ----
const bodyLines = lines.length - bodyStart;
const isRouter = wfFiles.length >= 2;
const budget = isRouter ? 250 : 500;
if (bodyLines > budget) {
  fail(`size: SKILL.md body is ${bodyLines} lines — over the ${isRouter ? 'router' : 'leaf'} budget of ${budget} (canonical table: references/SKILL-STRUCTURE-AND-ROUTING.md; move doctrine to references/, procedures to workflows/)`);
}

report();

function report() {
  const name = basename(target);
  if (fails.length === 0) {
    console.log(`validate-structure: ${name} — frontmatter ok, description within cap, routing first, ${wfFiles?.length ?? 0} workflows all routed, no stray fence headings, body ${typeof bodyLines !== 'undefined' ? bodyLines : '?'} lines within budget.`);
    console.log('VERDICT: CLEAN');
    process.exit(0);
  }
  console.log(`validate-structure: ${name} — ${fails.length} FAIL(S)`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log(`VERDICT: ${fails.length} VIOLATION(S) — fix and re-run until CLEAN`);
  process.exit(1);
}
