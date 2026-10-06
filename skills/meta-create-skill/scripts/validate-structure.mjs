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
//  13. REVIEW CC7 unescaped $ before a digit in SKILL.md body (including fences)
//
// Usage: node validate-structure.mjs <skill-dir>
// Prints numbered FAILs or `VERDICT: CLEAN` (possibly with REVIEW notes).
// YAML reading doubts are advisory; uncertain fields retain frozen legacy rules.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A deliberately bounded YAML reader. Unsupported syntax makes frontmatter
// checks advisory rather than guessing at values and rejecting a member skill.
// Origin: 2026-10-05 Astra ship-review; PyYAML differential coverage closes
// key-like quote continuations, unclosed fields, and plain-scalar folding gaps.
// YAML 1.1 presentation whitespace is ASCII space/tab, not ECMAScript WhiteSpace.
const yamlStart = text => text.replace(/^[ \t]+/, '');
const yamlEnd = text => text.replace(/[ \t]+$/, '');
const yamlTrim = text => yamlEnd(yamlStart(text));
// Physical YAML breaks also separate tokens in a flow collection.
const yamlFlowTrim = text => text.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
// Literal controls, Unicode line breaks and interior BOMs are outside this reader.
// Escaped equivalents are decoded by the complete YAML 1.1 escape table below.
const uncertainLiteral = { test(text) {
  for (const char of text) {
    const code = char.codePointAt(0);
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159) ||
        [0x2028, 0x2029, 0xfeff, 0xfffe, 0xffff].includes(code) || (code >= 0xd800 && code <= 0xdfff)) return true;
  }
  return false;
} };

export function readFrontmatter(source) {
  try { return readBoundedFrontmatter(source); }
  catch {
    // Reader limits and unexpected parser errors are uncertainty, never a new
    // rejection path. The caller will run the frozen whole-frontmatter checks.
    return { values: Object.create(null), unsupported: true,
      unreadable: new Set(['extent']), unclosed: new Set(), invalid: new Set(),
      singleLine: new Set(), skipped: new Set() };
  }
}

function readBoundedFrontmatter(source) {
  const lines = source.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '').split(/\r\n|[\r\n]/);
  if (lines.at(-1) === '') lines.pop(); // A terminator is not an extra blank line.
  if (lines[0] === '---') {
    lines.shift();
    const end = lines.indexOf('---');
    if (end >= 0) lines.splice(end);
  }
  const values = Object.create(null);
  const unclosed = new Set();
  const unreadable = new Set();
  const invalid = new Set();
  const singleLine = new Set();
  let unsupported = false;
  const cannotRead = (field) => { unsupported = true; unreadable.add(field); };
  const bad = (field) => { cannotRead(field); invalid.add(field); };
  // Strip presentation whitespace, preserving a double-quoted escaped final space.
  const quotedTail = (line, quote) => {
    if (quote !== '"') return yamlEnd(line);
    const tail = line.match(/(\\+)([ \t]+)$/);
    return tail && tail[1].length % 2 ? yamlEnd(line) + tail[2][0] : yamlEnd(line);
  };
  const indent = (line) => line.match(/^ */)[0].length;
  const ignored = (line) => !yamlTrim(line) || yamlStart(line).startsWith('#');
  const comment = (value) => yamlEnd(value.replace(/(?:^|[ \t]+)#[^\r\n]*$/, ''));
  // YAML's implicit non-string scalars are outside skill text/profile fields.
  const typed = (value) => /^(?:~|null|true|false|yes|no|on|off|[-+]?[\d.][\w.:+-]*|[-+]?\.(?:inf|nan))$/i.test(value);
  const collection = (value) => /^(?:[&*!\[\]{}]|-(?:[ \t]|$)|\?(?:[ \t]|$))/.test(value);
  const skipped = new Set();
  // Read key spelling only; values of unconsumed fields are never decoded.
  const keyPattern = /^( *)(?:([a-zA-Z_][\w-]*)|"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'):(?:[ \t]+([^\r\n]*)|$)/;
  const keyOf = (match) => match[2] ?? (match[3] !== undefined ?
    scalar('"' + match[3] + '"', 0, lines.length, 'key')[0] : match[4].replace(/''/g, "'"));
  // Locate presentation boundaries only. Quotes and flow brackets can cross
  // block boundaries; block scalars own all sufficiently indented physical
  // lines (including comments). No scalar types or collection items are read.
  function skipCollection(at, parent, initial = '') {
    function tokenEnd(start, text) {
      text = yamlStart(text).replace(/^(?:[&!][^ \t\r\n]+(?:[ \t]+|$))*/, '');
      if (!/^["'[{]/.test(text)) return start;
      const stack = []; let quote = null, tokenStart = true;
      const quoted = /^["']/.test(text);
      for (let line = start - 1; line < lines.length; line++) {
        const physical = line === start - 1 ? text : lines[line];
        for (let k = 0; k < physical.length; k++) {
          const char = physical[k];
          if (quote) {
            if (quote === '"' && char === '\\') {
              const escape = physical[k + 1];
              if (!escape || !/^[0abtnvfre \"/\\N_LP]$/.test(escape)) cannotRead('extent');
              k++; continue;
            }
            if (char === quote) {
              if (quote === "'" && physical[k + 1] === "'") k++;
              else { quote = null; if (quoted && !stack.length) return line + 1; }
            }
          } else if (char === '#' && (k === 0 || /[ \t]/.test(physical[k - 1]))) break;
          else if ((char === '"' || char === "'") && tokenStart) { quote = char; tokenStart = false; }
          else if ((char === '[' || char === '{') && tokenStart) { stack.push(char); tokenStart = true; }
          else if (char === ']' || char === '}') {
            if (stack.pop() !== (char === ']' ? '[' : '{')) cannotRead('extent');
            if (!stack.length) return line + 1;
            tokenStart = false;
          } else if (char === ',' || char === ':') tokenStart = true;
          else if (!/[ \t]/.test(char)) tokenStart = false;
        }
      }
      cannotRead('extent'); // No closer: do not guess across listing fields.
      return start;
    }
    function valueEnd(start, width, text) {
      const bare = yamlStart(comment(text)).replace(/^(?:[&!][^ \t\r\n]+(?:[ \t]+|$))*/, '');
      if (!bare) {
        let next = start;
        while (next < lines.length && ignored(lines[next])) next++;
        if (next < lines.length && indent(lines[next]) > width &&
            !keyPattern.test(lines[next]) && !/^-(?:[ \t]|$)/.test(yamlStart(lines[next])))
          return valueEnd(next + 1, width, yamlStart(lines[next]));
      }
      if (/^[|>]/.test(bare)) return scalar(bare, width, start, 'opaque', 'extent')[1];
      if (/^["']/.test(bare)) scalar(yamlStart(text).replace(/^(?:[&!][^ \t\r\n]+(?:[ \t]+|$))*/, ''), width, start, 'opaque', 'extent');
      if (/^[@`]/.test(bare) || !/^["'[{|>]/.test(bare) && /:(?:[ \t]|$)/.test(bare)) cannotRead('extent');
      if (bare && !/^["'[{]/.test(bare)) {
        // Plain scalar continuations may begin with quotes, brackets or tags.
        // They remain plain text; opening a token there would invent an extent.
        while (start < lines.length && (ignored(lines[start]) || indent(lines[start]) > width)) start++;
        return start;
      }
      return tokenEnd(start, text);
    }
    at = valueEnd(at, parent, initial);
    while (at < lines.length) {
      if (ignored(lines[at])) { at++; continue; }
      const width = indent(lines[at]), text = yamlStart(lines[at]);
      if (width < parent || (width === parent && !/^-(?:[ \t]|$)/.test(text))) break;
      // Compact sequence mappings have their own indentation after the dash.
      const dash = text.match(/^(?:- +)+/);
      const payload = dash ? text.slice(dash[0].length) : text;
      const match = payload.match(keyPattern);
      if (!match && !dash) cannotRead('extent');
      const initial = match ? (match[5] ?? '') : payload;
      const ownerWidth = width + (match && dash ? dash[0].length : 0);
      at = valueEnd(at + 1, ownerWidth, initial);
    }
    return at;
  }
  function scalar(initial, parent, at, field, owner = field) {
    const cannotRead = () => { unsupported = true; unreadable.add(owner); };
    const bad = () => { cannotRead(); invalid.add(owner); };
    const markUnclosed = () => {
      cannotRead();
      unclosed.add(owner);
    };
    if (uncertainLiteral.test(initial)) cannotRead();
    let value = comment(initial);
    // Retain the profile's supported, single-line models list.
    if (field === 'models' && /^\[[a-zA-Z0-9_. -]+(?:,[a-zA-Z0-9_. -]+)*\]$/.test(value)) {
      const items = value.slice(1, -1).split(',').map(item => yamlTrim(item));
      if (items.some(typed)) cannotRead(field);
      return [items, at];
    }
    if (collection(value)) {
      cannotRead(field);
      return [undefined, skipCollection(at, parent, value)];
    }
    const block = value.match(/^([|>])(?:(?:([+-])([1-9])?)|(?:([1-9])([+-])?))?$/);
    if (/^[|>]/.test(value) && !block) bad(field);
    if (block) {
      const chomp = block[2] ?? block[5];
      let width = block[3] || block[4] ? parent + Number(block[3] ?? block[4]) : null;
      // Auto indentation includes leading all-space lines; explicit indicators
      // skip only their declared indentation (PyYAML scan_block_scalar_*).
      let breaks = '';
      if (width === null) {
        let maximum = parent + 1;
        while (at < lines.length && /^ *$/.test(lines[at])) {
          maximum = Math.max(maximum, lines[at].length);
          breaks += '\n'; at++;
        }
        if (at < lines.length) maximum = Math.max(maximum, indent(lines[at]));
        width = maximum;
      }
      const scanBreaks = () => {
        let result = '';
        while (at < lines.length && /^ *$/.test(lines[at]) && lines[at].length <= width) {
          result += '\n'; at++;
        }
        return result;
      };
      breaks += scanBreaks();
      let out = '', lineBreak = '';
      while (at < lines.length && indent(lines[at]) >= width) {
        const text = lines[at++].slice(width);
        out += breaks + text;
        lineBreak = '\n';
        breaks = scanBreaks();
        if (at < lines.length && indent(lines[at]) >= width) {
          const next = lines[at].slice(width);
          if (block[1] === '>' && !/^[ \t]/.test(text) && !/^[ \t]/.test(next)) {
            if (!breaks) out += ' ';
          } else out += lineBreak;
        } else break;
      }
      if (at < lines.length && !ignored(lines[at]) && indent(lines[at]) > parent) bad(field);
      if (chomp !== '-') out += lineBreak;
      if (chomp === '+') out += breaks;
      return [out, at];
    }
    if (/^['"]/.test(initial)) {
      const quote = initial[0];
      const closesAhead = (from) => {
        for (let line = from; line < lines.length; line++) {
          const text = lines[line];
          for (let k = 0; k < text.length; k++) {
            if (quote === '"' && text[k] === '\\') { k++; continue; }
            if (text[k] !== quote) continue;
            if (quote === "'" && text[k + 1] === "'") { k++; continue; }
            return !yamlTrim(comment(text.slice(k + 1)));
          }
        }
        return false;
      };
      let text = quotedTail(initial.slice(1), quote), out = '', k = 0, continuedEscape = false;
      const escapes = { '0': 0, a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13,
        e: 27, [String.fromCharCode(9)]: 9, ' ': 32, '"': 34, '/': 47, '\\': 92, N: 0x85, _: 0xa0, L: 0x2028, P: 0x2029 };
      while (true) {
        if (k >= text.length) {
          if (at >= lines.length) {
            markUnclosed();
            return [out, at];
          }
          let blanks = 0;
          while (at < lines.length && !yamlTrim(lines[at])) { blanks++; at++; }
          if (at >= lines.length) {
            markUnclosed();
            return [out, at];
          }
          // Recover listing fields after an unrelated broken quoted value.
          if (!['name', 'description'].includes(owner) && /^(?:name|description):(?:[ \t]|$)/.test(lines[at]) && !closesAhead(at)) {
            markUnclosed();
            return [out, at];
          }
          out += blanks ? '\n'.repeat(blanks) : continuedEscape ? '' : ' ';
          continuedEscape = false;
          text += quotedTail(yamlStart(lines[at++]), quote);
        }
        const char = text[k++];
        if (char === quote) {
          if (quote === "'" && text[k] === "'") { out += "'"; k++; continue; }
          if (yamlTrim(comment(text.slice(k)))) bad(field);
          return [out, at];
        }
        if (quote === '"' && char === '\\') {
          if (k >= text.length) { continuedEscape = true; continue; }
          const escape = text[k++];
          if (escape === '\n') continue;
          if (Object.hasOwn(escapes, escape)) out += String.fromCodePoint(escapes[escape]);
          else if (['x', 'u', 'U'].includes(escape)) {
            const size = { x: 2, u: 4, U: 8 }[escape];
            const hex = text.slice(k, k + size);
            const code = Number.parseInt(hex, 16);
            if (hex.length !== size || !/^[0-9a-f]+$/i.test(hex) || code > 0x10ffff) bad(field);
            else out += String.fromCodePoint(code);
            k += size;
          } else bad(field);
        } else out += char;
      }
    }
    if (/^[@`]/.test(value) || (!/^[&*!\[\]{}]/.test(value) && /:(?:[ \t]|$)/.test(value))) bad(field);
    if (/\t/.test(value)) bad(field);
    if (/^(?:[&*!\[\]{}|>@`]|-(?:[ \t]|$)|\?(?:[ \t]|$))/.test(value) || /:(?:[ \t]|$)/.test(value)) {
      cannotRead(field);
      return [undefined, at];
    }
    const parts = yamlTrim(value) ? [yamlTrim(value)] : [];
    let blanks = 0, commented = comment(initial) !== yamlEnd(initial);
    if (typed(value)) cannotRead(field);
    while (at < lines.length) {
      if (ignored(lines[at])) {
        if (!yamlTrim(lines[at]) && /\t/.test(lines[at])) bad(field);
        if (yamlTrim(lines[at])) commented = true;
        else blanks++;
        at++; continue;
      }
      if (indent(lines[at]) <= parent) break;
      if (commented && parts.length) bad(field);
      const continuation = comment(yamlTrim(lines[at]));
      if (collection(continuation)) {
        cannotRead(field);
        return [undefined, skipCollection(at + 1, parent, continuation)];
      }
      if (/:(?:[ \t]|$)/.test(continuation)) bad(field);
      if (/\t/.test(continuation)) bad(field);
      if (/^(?:-(?:[ \t]|$)|[\w-]+:[ \t])/.test(continuation)) { cannotRead(field); break; }
      parts.push((parts.length ? (blanks ? '\n'.repeat(blanks) : ' ') : '') + continuation);
      blanks = 0;
      commented = continuation !== yamlTrim(lines[at]);
      at++;
    }
    if (!parts.length) cannotRead(field); // YAML null is outside text fields.
    return [parts.join(''), at];
  }
  function flowMetadata(text) {
    if (uncertainLiteral.test(text)) cannotRead('metadata');
    const result = Object.create(null);
    let quote = null, level = 0, part = '', parts = [], tokenStart = true;
    for (let k = 1; k < text.length - 1; k++) {
      const char = text[k];
      if (quote) {
        part += char;
        if (quote === '"' && char === '\\') part += text[++k] ?? '';
        else if (char === quote) {
          if (quote === "'" && text[k + 1] === "'") part += text[++k];
          else quote = null;
        }
      } else if (char === '#' && (k === 0 || /[ \t\n]/.test(text[k - 1]))) {
        while (k < text.length && text[k] !== '\n') k++;
        part += '\n';
      } else if ((char === '"' || char === "'") && tokenStart) { quote = char; part += char; tokenStart = false; }
      else if ((char === '[' || char === '{') && tokenStart) { level++; part += char; tokenStart = true; }
      else if (char === ']' || char === '}') { level--; part += char; tokenStart = false; }
      else if (char === ',' && level === 0) { parts.push(part); part = ''; tokenStart = true; }
      else { part += char; if (char === ',' || char === ':') tokenStart = true; else if (!/[ \t\n]/.test(char)) tokenStart = false; }
    }
    parts.push(part);
    for (const entry of parts.filter(part => yamlFlowTrim(part))) {
      const match = yamlFlowTrim(entry).replaceAll('\n', ' ').replace(/^((?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')):(?=[^ \t\r\n])/, '$1: ').match(keyPattern);
      if (!match) { cannotRead('metadata'); continue; }
      const key = keyOf(match), value = match[5] ?? '';
      // Flattening a scalar's internal breaks would guess at YAML folding.
      const presentation = yamlFlowTrim(entry).slice(yamlFlowTrim(entry).indexOf(':') + 1);
      if (['stakes', 'freedom', 'weight', 'models'].includes(key) && /\n/.test(yamlFlowTrim(presentation)) &&
          !collection(yamlTrim(value))) cannotRead('metadata');
      if (Object.hasOwn(result, key) && ['stakes', 'freedom', 'weight', 'models'].includes(key)) cannotRead('metadata');
      result[key] = undefined;
      if (!['stakes', 'freedom', 'weight', 'models'].includes(key) ||
          (key !== 'stakes' && collection(yamlTrim(value)) && !(key === 'models' && /^\[[a-zA-Z0-9_. -]+(?:,[a-zA-Z0-9_. -]+)*\]$/.test(yamlTrim(value)) && !yamlTrim(value).slice(1, -1).split(',').some(item => typed(yamlTrim(item)))))) skipped.add(`metadata.${key}`);
      else result[key] = scalar(yamlTrim(value), 0, lines.length, key, 'metadata')[0];
    }
    return result;
  }
  function mapping(at, parent, depth, owner) {
    const result = Object.create(null);
    while (at < lines.length) {
      if (ignored(lines[at])) { at++; continue; }
      if (indent(lines[at]) < parent) break;
      const explicit = lines[at].match(/^ *\? +([a-zA-Z_][\w-]*)$/);
      if (explicit && indent(lines[at]) === parent) {
        let next = at + 1; while (next < lines.length && ignored(lines[next])) next++;
        if (next < lines.length && indent(lines[next]) === parent && /^: +/.test(yamlStart(lines[next]))) {
          result[explicit[1]] = undefined; skipped.add(owner ? `${owner}.${explicit[1]}` : explicit[1]);
          at = skipCollection(next + 1, parent, yamlStart(lines[next]).slice(2)); continue;
        }
      }
      const match = lines[at].match(keyPattern);
      if (indent(lines[at]) !== parent || !match || /\t/.test(lines[at].slice(0, indent(lines[at]) + 1))) {
        cannotRead('extent');
        if (owner) cannotRead(owner);
        at++; continue;
      }
      const key = keyOf(match);
      if (typeof key !== 'string' || uncertainLiteral.test(key)) cannotRead(owner ?? 'keys');
      const initial = yamlStart(match[5] ?? '');
      at++;
      const valueStart = at;
      if (Object.hasOwn(result, key) && (depth === 0 ? ['name', 'description', 'when_to_use', 'metadata'].includes(key) : ['stakes', 'freedom', 'weight', 'models'].includes(key))) cannotRead(owner ?? key);
      let next = at;
      while (next < lines.length && ignored(lines[next])) {
        if (!comment(initial) && !yamlTrim(lines[next]) && /\t/.test(lines[next]) &&
            (depth === 0 ? ['name', 'description', 'when_to_use', 'metadata'].includes(key) :
              ['stakes', 'freedom', 'weight', 'models'].includes(key))) bad(owner ?? key);
        next++;
      }
      if (depth === 0 && key === 'metadata' && /^\{/.test(initial)) {
        at = skipCollection(at, parent, initial);
        const text = [initial, ...lines.slice(valueStart, at)].join('\n');
        result[key] = flowMetadata(text.slice(0, text.lastIndexOf('}') + 1)); continue;
      }
      const opaque = depth === 0 ? !['name', 'description', 'when_to_use', 'metadata'].includes(key) :
        !['stakes', 'freedom', 'weight', 'models'].includes(key);
      const supportedModels = key === 'models' && /^\[[a-zA-Z0-9_. -]+(?:,[a-zA-Z0-9_. -]+)*\]$/.test(comment(initial)) &&
        !comment(initial).slice(1, -1).split(',').some(item => typed(yamlTrim(item)));
      // Retain the existing advisory profile policy for non-text collections.
      const profileCollection = depth > 0 && key !== 'stakes' && !supportedModels &&
        (collection(initial) || (!comment(initial) && next < lines.length &&
          (keyPattern.test(lines[next]) || /^-(?:[ \t]|$)/.test(yamlStart(lines[next])))));
      if (opaque || profileCollection) {
        result[key] = undefined; skipped.add(owner ? `${owner}.${key}` : key);
        const collectionStart = at;
        at = skipCollection(at, parent, initial);
        if (!opaque && uncertainLiteral.test([initial, ...lines.slice(collectionStart, at)].join('\n'))) cannotRead(owner ?? key);
        continue;
      }
      if (!comment(initial) && next < lines.length && indent(lines[next]) > parent &&
          (keyPattern.test(lines[next]) || /^ *\? +[a-zA-Z_][\w-]*$/.test(lines[next]))) {
        if (depth >= 1 || ['name', 'description'].includes(key)) {
          cannotRead(owner ?? key); result[key] = undefined; at = skipCollection(next, parent);
        }
        else [result[key], at] = mapping(next, indent(lines[next]), depth + 1, key);
      } else {
        let start = initial, scalarAt = at;
        if (!comment(initial) && next < lines.length && indent(lines[next]) > parent) {
          start = yamlStart(lines[next]); scalarAt = next + 1;
        }
        [result[key], at] = scalar(start, parent, scalarAt, key, owner ?? key);
        if (uncertainLiteral.test([start, ...lines.slice(valueStart, at)].join('\n'))) cannotRead(owner ?? key);
        if (depth === 0 && initial && !/^[|>]/.test(initial) && (!/^["']/.test(initial) || at === valueStart) &&
            !lines.slice(valueStart, at).some(line => !ignored(line))) singleLine.add(key);
      }
    }
    return [result, at];
  }
  Object.assign(values, mapping(0, 0, 0)[0]);
  // A syntax doubt invalidates document-level certainty: no new content FAIL
  // may depend on a document that a strict loader could reject.
  if (invalid.size || unclosed.size || uncertainLiteral.test(lines.join('\n'))) cannotRead('extent');
  return { values, unsupported, unclosed, unreadable, invalid, singleLine, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

function main() {
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
const lines = raw.split(/\r\n|[\r\n]/);

// ---- 1. Frontmatter ----
let fmEnd = -1;
if (lines[0] !== '---') {
  fail('frontmatter: file does not open with `---` on line 1');
} else {
  fmEnd = lines.findIndex((l, i) => i > 0 && l === '---');
  if (fmEnd === -1) fail('frontmatter: opening `---` never closed');
}
const fm = fmEnd > 0 ? lines.slice(1, fmEnd) : [];
const parsed = readFrontmatter(fm.join('\n') + '\n');
// Frozen f901fb1c extraction. Only certain reads may disprove these rules.
const legacyLines = raw.split(/\r?\n/);
const legacyEnd = legacyLines.findIndex((line, i) => i > 0 && line === '---');
const legacyFm = legacyEnd > 0 ? legacyLines.slice(1, legacyEnd).join('\n') : '';
const legacyDescription = legacyFm.match(/^description:\s*([\s\S]*?)(?=^[a-zA-Z_-]+:|\s*$(?![\s\S]))/m);
const extentUnknown = parsed.unreadable.has('extent') || parsed.unreadable.has('keys');
const scalar = (field) => !extentUnknown && !parsed.unreadable.has(field) && !parsed.unclosed.has(field) && typeof parsed.values[field] === 'string' ? parsed.values[field] : null;
for (const field of new Set([...parsed.invalid, ...parsed.unclosed])) {
  const colon = parsed.invalid.has(field) && new RegExp('^' + field + ':.*:[ \t]', 'm').test(fm.join('\n'));
  review(colon ? `${field} isn't valid YAML as written (a ': ' inside an unquoted value); wrap it in quotes so strict loaders accept it; check with a YAML parser` :
    `frontmatter: ${parsed.unclosed.has(field) ? 'unclosed quote' : 'invalid YAML'} in ${field}; check it with a YAML parser`);
}
if (parsed.unsupported && !parsed.invalid.size && !parsed.unclosed.size) review("frontmatter uses YAML the checker can't read exactly; retaining legacy checks; check it by hand with a YAML parser");
if (extentUnknown && fmEnd > 0) {
  if (legacyLines[0] !== '---') fail('frontmatter: file does not open with `---` on line 1');
  else if (legacyEnd < 0) fail('frontmatter: opening `---` never closed');
}
if (scalar('name') === null && !/^name:\s*\S+/m.test(legacyFm)) fail('frontmatter: no `name:` field');
const fieldFailure = (field, msg) => parsed.singleLine.has(field) ? fail(msg) :
  review(`${field} is written across lines; check by hand: ${msg}`);
const xmlTag = /<\/?[a-zA-Z][\w:.-]*(?:[ \t\r\n][^<>]*)?[ \t\r\n]*\/?>/;
const skillName = scalar('name');
if (skillName !== null) {
  if (skillName.length < 1 || skillName.length > 64) fieldFailure('name', 'name: must be 1–64 characters (BP4)');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) fieldFailure('name', 'name: use lowercase letters/numbers separated by single hyphens (BP4)');
  if (xmlTag.test(skillName)) fieldFailure('name', 'name: XML tags are not allowed (BP4)');
  if (/anthropic|claude/i.test(skillName)) fieldFailure('name', 'name: must not contain reserved words anthropic or claude (BP4)');
  if (/^(verify|simplify)$/.test(skillName)) review(`name: ${skillName} — Claude Code runs a skill with this name before every commit (CC6)`);
}

// ---- 2. Description cap ----
const description = scalar('description');
if (description === null) {
  if (!legacyDescription) fail('frontmatter: no `description:` field');
  else {
    let desc = legacyDescription[1].trim();
    const quoted = desc.startsWith('"');
    if (quoted && !desc.endsWith('"')) fail('frontmatter: description opens with `"` but never closes it');
    if (quoted) desc = desc.slice(1, desc.endsWith('"') ? -1 : undefined);
    if (desc.length > 1024) fail(`description: ${desc.length} chars — exceeds the official 1,024-char cap (compress: one exemplar phrase per trigger family; see references/frontmatter.md)`);
  }
} else {
  let desc = description;
  if (!yamlTrim(desc)) fieldFailure('description', 'description: must be non-empty (BP4)');
  if (xmlTag.test(desc)) fieldFailure('description', 'description: XML tags are not allowed (BP4)');
  if (desc.length > 1024) {
    fail(`description: ${desc.length} chars — exceeds the official 1,024-char cap (compress: one exemplar phrase per trigger family; see references/frontmatter.md)`);
  }
  const listingLength = scalar('when_to_use') !== null || !Object.hasOwn(parsed.values, 'when_to_use') && !extentUnknown ? desc.length + (scalar('when_to_use') ?? '').length : 0;
  if (listingLength > 1536) fieldFailure(parsed.singleLine.has('description') ? 'when_to_use' : 'description', `description + when_to_use: ${listingLength} chars — exceeds the 1,536-char listing cap (CC2)`);
  if (/\bI (?:can|will|'ll|help)\b|\bI['’](?:m|ll)\b|\byou can\b|\byou(?:['’]ll| will)\b/i.test(desc)) {
    (parsed.singleLine.has('description') ? review : (msg) => fieldFailure('description', msg))('description: write the description in third person; it is injected into the system prompt (BP6)');
  }
}

// Profile guidance uses the same reader as the listing fields.
const profile = parsed.values.metadata && typeof parsed.values.metadata === 'object' ? parsed.values.metadata : {};
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
// ---- 13. Positional substitutions (advisory only; Markdown fences do not exempt them) ----
// Only exactly one adjacent backslash escapes a token; two or more still expand.
// An unclosed frontmatter block has no identifiable body to scan.
if (lines[0] !== '---' || fmEnd >= 0) {
  for (let i = bodyStart; i < lines.length; i++) {
    const amounts = [...lines[i].matchAll(/(\\*)\$\d[\d,.]*/g)]
      .filter((match) => match[1].length !== 1)
      .map((match) => match[0].slice(match[1].length).replace(/[,.]+$/, ''));
    if (amounts.length) {
      review(`SKILL.md:${i + 1} ${amounts.map((amount) => `"${amount}"`).join(', ')} — Claude Code replaces $0, $1, … with the skill's arguments when the skill runs; write a literal amount as ${String.fromCharCode(92)}${amounts[0]} (reference files are read as written) (CC7)`);
    }
  }
}
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

}
