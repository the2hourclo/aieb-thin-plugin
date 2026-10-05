#!/usr/bin/env node
// validate-structure.mjs — the mechanical half of skill validation.
// Replaces five contradictory prose line-budget rules with one executable answer
// (origin: 2026-07-28 context-trimming first pass; canonical numbers live in
// references/SKILL-STRUCTURE-AND-ROUTING.md § The size budget).
// 2026-10-05 — Anthropic skill-authoring best practices
//
// Checks (FAILs are deterministic; advisory heuristics print REVIEW notes):
//   1. Frontmatter parses: --- block with name: and description:; balanced quotes
//   2. Description within the official 1,024-character cap
//   3. `## Workflow Routing` present and the FIRST level-2 content section
//   4. Every workflows/*.md routed from SKILL.md (no orphans) and no dead routes
//   5. No stray markdown headings inside code fences (pollutes heading parsers)
//   6. Line budget per archetype: router (≥2 workflows) ≤250 body lines, leaf ≤500
//   7. BP4 name length, syntax, XML and reserved words; description non-empty/no XML
//   8. CC2 description + when_to_use within the 1,536-character listing cap
//   9. REVIEW BP6 description person and CC6 pre-commit skill names
//  10. REVIEW BP9 long companion files need contents near the top
//  11. REVIEW BP8/BP7 references not named in SKILL.md; cross-mentions only
//      flag unnamed targets once (CHANGELOG.md history is not navigation)
//  12. REVIEW BP20 backslash paths (Windows fences and absolute drives exempt)
//
// Usage: node validate-structure.mjs <skill-dir>
// Prints numbered FAILs or `VERDICT: CLEAN`. Exit 1 on any FAIL.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, posix } from 'node:path';

const target = process.argv[2];
if (!target || !existsSync(target) || !statSync(target).isDirectory()) {
  console.error('Usage: node validate-structure.mjs <skill-dir>');
  process.exit(2);
}

const skillPath = join(target, 'SKILL.md');
const fails = [];
const fail = (msg) => fails.push(msg);
const reviews = [];
const review = (msg) => reviews.push(msg);

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

// Read the scalar forms used by skill frontmatter, including quoted and block
// descriptions. Do not count YAML quoting or block indicators as content.
function stripScalarComments(source) {
  // Only a scalar's opening quote selects quoted style; quotes in plain text
  // are content. Quoted scalars can span lines and escape their closing quote.
  let quote = /^["']/.test(source) ? source[0] : null;
  let result = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      result += char;
      if (i === 0) continue;
      if (quote === '"' && char === '\\') result += source[++i] ?? '';
      else if (char === quote) {
        if (quote === "'" && source[i + 1] === "'") result += source[++i];
        else quote = null;
      }
    } else if (char === '#' && (i === 0 || /\s/.test(source[i - 1]))) {
      while (i < source.length && source[i] !== '\n') i++;
      if (i < source.length) result += '\n';
    } else result += char;
  }
  return result.split('\n').map((line) => line.trimEnd()).join('\n').trim();
}
function decodeScalar(source, decode = true) {
  let value = source.trim();
  const headerEnd = value.indexOf('\n');
  const header = stripScalarComments(headerEnd < 0 ? value : value.slice(0, headerEnd));
  const block = /^[>|][+-]?$/.test(header);
  // Block content is text, including lines beginning with #.
  value = block ? header + (headerEnd < 0 ? '' : value.slice(headerEnd)) : stripScalarComments(value);
  if (!decode) return value;
  if (/^[>|][+-]?(?:\n|$)/.test(value)) {
    const folded = value[0] === '>';
    value = value.replace(/^[>|][+-]?\s*\n?/, '').split('\n').map((line) => line.trim()).join(folded ? ' ' : '\n');
  } else if (value.startsWith('"') && value.endsWith('"')) {
    try { value = JSON.parse(value); }
    catch { value = value.slice(1, -1).replace(/\s*\n\s*/g, ' '); }
  } else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).replace(/''/g, "'").replace(/\s*\n\s*/g, ' ');
  }
  return value;
}
function scalar(field, decode = true) {
  const match = fmText.match(new RegExp(`^${field}:[ \\t]*([^\\n]*(?:\\n(?![a-zA-Z_-]+:)[^\\n]*)*)`, 'm'));
  return match ? decodeScalar(match[1], decode) : null;
}
const xmlTag = /<\/?[a-zA-Z][\w:.-]*(?:\s[^<>]*)?\s*\/?>/;
const skillName = scalar('name');
if (skillName !== null) {
  if (skillName.length < 1 || skillName.length > 64) fail('name: must be 1–64 characters (BP4)');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) fail('name: use lowercase letters/numbers separated by single hyphens (BP4)');
  if (xmlTag.test(skillName)) fail('name: XML tags are not allowed (BP4)');
  if (/anthropic|claude/i.test(skillName)) fail('name: must not contain reserved words anthropic or claude (BP4)');
  if (/^(verify|simplify)$/.test(skillName)) review(`name: ${skillName} — Claude Code runs a skill with this name before every commit (CC6)`);
}

// ---- 2. Description cap ----
const description = scalar('description');
if (description === null) {
  fail('frontmatter: no `description:` field');
} else {
  let desc = description;
  const descSource = scalar('description', false);
  if (descSource.startsWith('"') && !descSource.endsWith('"')) {
    fail('frontmatter: description opens with `"` but never closes it');
    desc = desc.slice(1);
  }
  if (!desc.trim()) fail('description: must be non-empty (BP4)');
  if (xmlTag.test(desc)) fail('description: XML tags are not allowed (BP4)');
  if (desc.length > 1024) {
    fail(`description: ${desc.length} chars — exceeds the official 1,024-char cap (compress: one exemplar phrase per trigger family; see references/frontmatter.md)`);
  }
  const listingLength = desc.length + (scalar('when_to_use') ?? '').length;
  if (listingLength > 1536) fail(`description + when_to_use: ${listingLength} chars — exceeds the 1,536-char listing cap (CC2)`);
  if (/\bI (?:can|will|'ll|help)\b|\bI['’](?:m|ll)\b|\byou can\b|\byou(?:['’]ll| will)\b/i.test(desc)) {
    review('description: write the description in third person; it is injected into the system prompt (BP6)');
  }
}

// Profile guidance is advisory and independent of description scalar parsing.
const metadataBlock = fmText.match(/^metadata:[ \t]*(?:#[^\n]*)?\n((?:(?:[ \t]+[^\n]*|#[^\n]*)(?:\n|$))*)/m)?.[1] ?? '';
const profile = Object.fromEntries([...metadataBlock.matchAll(/^  (stakes|freedom|weight|models):[ \t]*(.*)$/gm)]
  .map((match) => [match[1], decodeScalar(match[2])]));
if (!['stakes', 'freedom', 'weight', 'models'].every((key) => Object.hasOwn(profile, key))) {
  review("record the skill's profile in metadata (stakes, freedom, weight, models)");
}
function hasSafeguard(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() ? hasSafeguard(path) : entry.isFile() &&
        /approval stop|owner-safeguards|owner's own yes/i.test(readFileSync(path, 'utf8'))) return true;
  }
  return false;
}
if (['record', 'action'].includes(profile.stakes) && !hasSafeguard(target)) {
  review('Record/Action stakes need the owner safeguards (approval stop)');
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

// ---- Companion-file guidance (advisory only) ----
const refDir = join(target, 'references');
const refFiles = existsSync(refDir) ? readdirSync(refDir).filter((f) => f.endsWith('.md') && statSync(join(refDir, f)).isFile()) : [];
const documents = [['SKILL.md', raw], ...wfFiles.map((f) => [`workflows/${f}`, readFileSync(join(wfDir, f), 'utf8')]),
  ...refFiles.map((f) => [`references/${f}`, readFileSync(join(refDir, f), 'utf8')])];
const indirectTargets = new Set();
for (const [file, content] of documents) {
  const docLines = content.split(/\r?\n/);
  if (docLines.at(-1) === '') docLines.pop(); // A final newline terminates a line; it does not add one.
  if (file !== 'SKILL.md' && docLines.length > 100 &&
      !docLines.slice(0, 40).some((line) => /^\s*#{1,6}\s+.*\b(contents|table of contents|sections|in this file)\b/i.test(line) || /^\s*(?:Contents|Sections):/i.test(line))) {
    review(`${file}: longer than 100 lines; add a table of contents in the first 40 lines (BP9)`);
  }
  if (file.startsWith('references/') && basename(file).toLowerCase() !== 'changelog.md') {
    const paths = [...content.matchAll(/\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)|`([^`\n]+)`/g)].map((m) => m[1] ?? m[2]);
    for (const link of new Set(paths)) {
      const clean = link.split(/[?#]/)[0];
      const resolved = posix.normalize(clean.startsWith('references/') ? clean : posix.join('references', clean));
      const referenced = resolved.slice('references/'.length);
      if (resolved.startsWith('references/') && refFiles.includes(referenced) &&
          !raw.includes(referenced) && !indirectTargets.has(referenced)) {
        indirectTargets.add(referenced);
        review(`${file}: ${referenced} — reachable only through another reference; link it from SKILL.md (BP8)`);
      }
    }
  }
  let fence = null;
  for (let i = 0; i < docLines.length; i++) {
    const line = docLines[i];
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker && !fence) {
      fence = { char: marker[1][0], length: marker[1].length, windows: /^(powershell|cmd|bat)(?:\s|$)/i.test(marker[2].trim()) };
      continue;
    }
    if (marker && fence && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) { fence = null; continue; }
    if (fence?.windows) continue;
    // Remove the entire drive-qualified token, so its later segments cannot match.
    const relativeOnly = line.replace(/([`"'])[a-z]:\\.*?\1/gi, '').replace(/\b[a-z]:\\[^\s`"'<>]+/gi, '');
    if (/\w+\\[\w.-]+\.(md|py|mjs|js|json|sh|ps1)\b/i.test(relativeOnly)) {
      review(`${file}:${i + 1}: use forward slashes in skill paths (BP20)`);
    }
  }
}

// Defer orphan notes until cross-mentions are known, so each target gets one note.
for (const file of refFiles) {
  if (!raw.includes(file) && !indirectTargets.has(file)) {
    review(`references/${file}: not reachable from SKILL.md (BP8/BP7)`);
  }
}

report();

function report() {
  const name = basename(target);
  if (fails.length === 0) {
    console.log(`validate-structure: ${name} — frontmatter ok, description within cap, routing first, ${wfFiles?.length ?? 0} workflows all routed, no stray fence headings, body ${typeof bodyLines !== 'undefined' ? bodyLines : '?'} lines within budget.`);
    reviews.forEach((note) => console.log(`REVIEW: ${note}`));
    console.log(`VERDICT: CLEAN${reviews.length ? ` (${reviews.length} REVIEW notes)` : ''}`);
    process.exit(0);
  }
  console.log(`validate-structure: ${name} — ${fails.length} FAIL(S)`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  reviews.forEach((note) => console.log(`REVIEW: ${note}`));
  console.log(`VERDICT: ${fails.length} VIOLATION(S) — fix and re-run until CLEAN`);
  process.exit(1);
}
