#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveLedgerEvents,
  ingestRuntimeInboxes,
  readRetrospectivePreferences,
  retrospectivePaths
} from "../hooks/lib/retrospective-ledger.mjs";

const SELF_PATH = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    parsed[key] = argv[index + 1];
    index++;
  }
  return parsed;
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return [
    "Usage:",
    `  node ${SELF_PATH} ingest --workspace <path>`,
    `  node ${SELF_PATH} paths --workspace <path> [--runtime claude|codex|agent]`,
    `  node ${SELF_PATH} archive --workspace <path> --event <64-char-id> --state reviewed|dismissed|applied`
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const workspace = path.resolve(args.workspace || process.cwd());

  if (command === "ingest") {
    output(ingestRuntimeInboxes(workspace));
    return;
  }

  if (command === "paths") {
    const runtime = ["claude", "codex", "agent"].includes(args.runtime) ? args.runtime : "agent";
    output({
      preferences: readRetrospectivePreferences(workspace),
      paths: retrospectivePaths(workspace, runtime)
    });
    return;
  }

  if (command === "archive") {
    output(archiveLedgerEvents(workspace, [{ event_id: args.event, state: args.state }]));
    return;
  }

  process.stdout.write(`${usage()}\n`);
  process.exitCode = 1;
}

try {
  main();
} catch {
  output({ enabled: false, error: "local-ledger-operation-failed" });
  process.exitCode = 1;
}
