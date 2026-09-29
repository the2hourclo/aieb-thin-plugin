import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyClosure as verifyCore } from "./front-door-core/entry.mjs";

const home = path.dirname(fileURLToPath(import.meta.url));
const expected = Object.freeze(["front-door-builder-entry.mjs", "front-door-cli.mjs",
  "front-door-build.mjs", "front-door-adapters.mjs", "front-door-assets.mjs", "front-door-brief.mjs",
  "build-record.schema.json", "build-record.restricted.schema.json", "validate-structure.mjs"]);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const normalized = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));

export function verifyBuilderClosure() {
  const core = verifyCore(); if (!core.ok) return core;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(home, "front-door-builder.manifest.json"), "utf8")); }
  catch { return { ok: false, code: "mixed_version_closure", detail: "builder manifest missing" }; }
  if (manifest.version !== 1 || !Array.isArray(manifest.files)
      || JSON.stringify(manifest.files.map((item) => item.path).sort()) !== JSON.stringify([...expected].sort())) {
    return { ok: false, code: "mixed_version_closure", detail: "builder file list differs" };
  }
  for (const item of manifest.files) {
    let bytes;
    try { bytes = fs.readFileSync(path.join(home, item.path)); }
    catch { return { ok: false, code: "mixed_version_closure", detail: item.path }; }
    if (sha(normalized(bytes)) !== item.sha256_eol_normalized) {
      return { ok: false, code: "mixed_version_closure", detail: item.path };
    }
  }
  return { ok: true, version: manifest.version };
}

export async function loadBuilder(name) {
  const verified = verifyBuilderClosure(); if (!verified.ok) return verified;
  if (!["build", "adapters", "assets", "brief"].includes(name)) return { ok: false, code: "unknown_module" };
  return { ok: true, module: await import(`./front-door-${name}.mjs`) };
}
