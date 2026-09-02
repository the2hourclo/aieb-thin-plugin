import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  archiveLedgerEvents,
  captureAndIngest,
  captureFeedbackEvents,
  detectRuntime,
  ingestRuntimeInboxes,
  retrospectivePaths,
  validateLocalEvent,
  validateSharedEvent
} from "./retrospective-ledger.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aieb-retrospective-ledger-test-"));
const workspace = path.join(tempRoot, "workspace");
fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, ".gitignore"), "node_modules/\n", "utf8");

function writePreferences(enabled, capture_mode = "pointer-only") {
  const file = retrospectivePaths(workspace).preferences;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ schema_version: 1, enabled, capture_mode, decided_at: "2026-09-02T00:00:00+00:00" }, null, 2)}\n`,
    "utf8"
  );
}

function jsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

try {
  const disabled = captureFeedbackEvents({
    cwd: workspace,
    runtime: "codex",
    sessionId: "session-disabled",
    transcriptPath: path.join(tempRoot, "disabled.jsonl"),
    matches: [{ signal: "friction", message_index: 0 }]
  });
  assert.equal(disabled.enabled, false, "RETRO-001: missing consent must disable capture");
  assert.equal(fs.existsSync(retrospectivePaths(workspace, "codex").inbox), false);
  assert.equal(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8"), "node_modules/\n");

  writePreferences(true, "full-text");
  const unsafeMode = captureFeedbackEvents({
    cwd: workspace,
    runtime: "codex",
    sessionId: "session-unsafe",
    transcriptPath: path.join(tempRoot, "unsafe.jsonl"),
    matches: [{ signal: "friction", message_index: 0 }]
  });
  assert.equal(unsafeMode.enabled, false, "RETRO-001: unsafe capture mode must fail closed");
  assert.match(unsafeMode.reason, /unsafe-capture-mode/);
  assert.equal(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8"), "node_modules/\n");

  writePreferences(true);
  const transcript = path.join(tempRoot, "private-transcript.jsonl");
  fs.writeFileSync(transcript, '{"role":"user","content":"private correction"}\n', "utf8");
  const first = captureFeedbackEvents({
    cwd: workspace,
    runtime: "codex",
    sessionId: "session-one",
    transcriptPath: transcript,
    matches: [{ signal: "friction", message_index: 0 }],
    now: new Date("2026-09-02T08:00:00Z")
  });
  assert.equal(first.captured, 1);
  const gitignore = fs.readFileSync(path.join(workspace, ".gitignore"), "utf8");
  assert.ok(gitignore.includes("node_modules/"), "preserves existing gitignore entries");
  for (const privacyPath of [
    ".aieb/retrospective/",
    ".claude/.state/retrospective/",
    ".codex/.state/retrospective/",
    ".agents/.state/retrospective/"
  ]) {
    assert.ok(gitignore.includes(privacyPath), `protects ${privacyPath}`);
  }

  const firstIngest = ingestRuntimeInboxes(workspace, new Date("2026-09-02T08:01:00Z"));
  assert.equal(firstIngest.ingested, 1);
  const ledgerPath = retrospectivePaths(workspace).ledger;
  const ledger = jsonl(ledgerPath);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].runtime, "codex");
  assert.equal(ledger[0].state, "unreviewed");
  assert.equal(validateSharedEvent(ledger[0]).length, 0);
  assert.doesNotMatch(JSON.stringify(ledger[0]), /private-transcript|private correction|transcript_path/);

  const local = jsonl(retrospectivePaths(workspace, "codex").inbox);
  assert.equal(local.length, 1);
  assert.equal(local[0].source.transcript_path, transcript, "RETRO-008: source pointer stays runtime-local");
  assert.doesNotMatch(JSON.stringify(local[0]), /private correction/);

  const replay = captureFeedbackEvents({
    cwd: workspace,
    runtime: "codex",
    sessionId: "session-one",
    transcriptPath: transcript,
    matches: [{ signal: "friction", message_index: 0 }]
  });
  assert.equal(replay.captured, 0, "RETRO-004: replay must not duplicate the runtime event");
  assert.equal(ingestRuntimeInboxes(workspace).ingested, 0, "RETRO-004: replay must not duplicate the ledger item");
  assert.equal(jsonl(ledgerPath).length, 1);

  captureFeedbackEvents({
    cwd: workspace,
    runtime: "claude",
    sessionId: "session-two",
    transcriptPath: path.join(tempRoot, "claude.jsonl"),
    matches: [{ signal: "win", message_index: 2 }]
  });
  const agentInbox = retrospectivePaths(workspace, "agent").inbox;
  fs.mkdirSync(path.dirname(agentInbox), { recursive: true });
  fs.appendFileSync(agentInbox, "{malformed\n", { encoding: "utf8", flag: "a" });
  const crossRuntime = ingestRuntimeInboxes(workspace);
  assert.equal(crossRuntime.ingested, 1);
  assert.equal(crossRuntime.invalid, 1, "RETRO-006: malformed input is preserved and counted");
  assert.equal(jsonl(ledgerPath).length, 2);
  assert.equal(fs.readFileSync(agentInbox, "utf8"), "{malformed\n");

  writePreferences(false);
  const optedOut = captureFeedbackEvents({
    cwd: workspace,
    runtime: "codex",
    sessionId: "session-three",
    transcriptPath: path.join(tempRoot, "third.jsonl"),
    matches: [{ signal: "friction", message_index: 1 }]
  });
  assert.equal(optedOut.enabled, false);
  assert.equal(jsonl(ledgerPath).length, 2);

  const badLocal = {
    schema_version: 1,
    event_id: "a".repeat(64),
    captured_at: "2026-09-02T00:00:00+00:00",
    runtime: "codex",
    signal: "friction",
    source: { session_ref: "b".repeat(64), transcript_path: transcript, message_index: 0 },
    content: "must never persist"
  };
  assert.match(validateLocalEvent(badLocal).join("\n"), /RETRO-002/);

  const badShared = { ...ledger[0], source: { ...ledger[0].source, transcript_path: transcript } };
  assert.match(validateSharedEvent(badShared).join("\n"), /RETRO-002/);
  const unknownShared = { ...ledger[0], rationale: "private free text" };
  assert.match(validateSharedEvent(unknownShared).join("\n"), /unexpected shared field/);

  writePreferences(true);
  const rejectedArchive = archiveLedgerEvents(workspace, [{ event_id: ledger[0].event_id, state: "approved" }]);
  assert.equal(rejectedArchive.archived, 0, "approved work must remain active");
  assert.equal(rejectedArchive.rejected, 1);
  assert.equal(jsonl(ledgerPath).length, 2);
  const archived = archiveLedgerEvents(workspace, [{ event_id: ledger[0].event_id, state: "reviewed" }]);
  assert.equal(archived.archived, 1);
  assert.equal(jsonl(ledgerPath).length, 1);
  assert.equal(jsonl(retrospectivePaths(workspace).archive).length, 1);
  assert.equal(jsonl(retrospectivePaths(workspace).archive)[0].state, "reviewed");
  assert.equal(ingestRuntimeInboxes(workspace).ingested, 0, "archived evidence must not re-enter the ledger");
  assert.equal(jsonl(ledgerPath).length, 1);
  const replayArchive = archiveLedgerEvents(workspace, [{ event_id: ledger[0].event_id, state: "reviewed" }]);
  assert.equal(replayArchive.archived, 0, "archive is idempotent");
  assert.equal(jsonl(retrospectivePaths(workspace).archive).length, 1);

  const brokenWorkspace = path.join(tempRoot, "broken-workspace");
  const brokenPreferences = retrospectivePaths(brokenWorkspace).preferences;
  fs.mkdirSync(path.dirname(brokenPreferences), { recursive: true });
  fs.mkdirSync(path.join(brokenWorkspace, ".gitignore"), { recursive: true });
  fs.writeFileSync(
    brokenPreferences,
    `${JSON.stringify({ schema_version: 1, enabled: true, capture_mode: "pointer-only" })}\n`,
    "utf8"
  );
  const storageFailure = captureAndIngest({
    cwd: brokenWorkspace,
    runtime: "codex",
    sessionId: "session-storage-failure",
    transcriptPath: path.join(tempRoot, "storage-failure.jsonl"),
    matches: [{ signal: "friction", message_index: 0 }]
  });
  assert.equal(storageFailure.capture.enabled, false, "storage errors must fail closed without throwing");
  assert.match(storageFailure.capture.reason, /local-storage-error/);

  assert.equal(detectRuntime({}, { PLUGIN_ROOT: "x" }), "codex");
  assert.equal(detectRuntime({}, { CLAUDE_PLUGIN_ROOT: "x" }), "claude");
  assert.equal(detectRuntime({ platform: "generic-agent" }, {}), "agent");
} finally {
  const resolved = path.resolve(tempRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}

console.log("retrospective-ledger.test: consent, privacy, cross-runtime ingestion, archiving, corruption, and idempotency CLEAN");
