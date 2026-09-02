# Domain Invariant Contract — AIEB Continuous Improvement Ledger

**Contract version:** 1
**Applies to:** plugin hooks that capture retrospective signals and ingest them into customer-owned workspace state
**Ledger:** `.aieb/retrospective/ledger.jsonl`
**Commit seam:** immediately before appending a validated shared-ledger event
**Ontology sources:** `hooks/lib/retrospective-ledger.mjs`, `skills/retrospective`, and the plugin privacy contract in `README.md`

## Entities

| Entity | Identity key | Allowed types | Lifecycle states | Canonical source |
|---|---|---|---|---|
| Runtime event | `event_id` | `friction`, `win` | captured, ingested | runtime inbox |
| Ledger item | `event_id` | skill-improvement evidence | unreviewed, reviewed, proposed, approved, dismissed, applied | shared ledger |
| Consent | workspace path | pointer-only local capture | enabled, disabled | `preferences.json` |

## Relationships

| ID | Subject | Relationship | Object | Cardinality |
|---|---|---|---|---|
| RETRO-003 | Workspace | owns | Shared ledger | exactly one canonical ledger |
| RETRO-004 | Runtime event | becomes | Ledger item | at most one item per `event_id` |
| RETRO-008 | Ledger item | resolves through | Runtime-local source pointer | exactly one originating runtime |

## Actions and side effects

| Action | Actor | Target | Side-effect class | Idempotency key | Commit mechanism |
|---|---|---|---|---|---|
| Capture signal | plugin hook | runtime inbox | local append | runtime + session ref + message index + signal | validated JSONL append |
| Ingest event | plugin processor | shared ledger | shared local append | `event_id` | workspace lock + validation + append |
| Archive reviewed event | retrospective workflow | shared archive | local move | `event_id` | workspace lock + validated rewrite/append |
| Change skill | retrospective skill | customer-owned skill | user-owned file edit | separately approved proposal | explicit in-chat approval only |

## Invariant registry — canonical home

| ID | Rule | Phase | Enforcer | Failure behavior |
|---|---|---|---|---|
| RETRO-001 | Capture is off unless the workspace contains explicit `enabled: true`, `capture_mode: pointer-only` consent. | preflight | ledger library | skip silently; existing nudge remains available |
| RETRO-002 | Automated capture stores no transcript, prompt, message, excerpt, quote, or free-text content. Runtime inboxes may store only a local pointer; the shared ledger may not store the path. | both | validators + tests | reject the event |
| RETRO-003 | `.aieb/retrospective/ledger.jsonl` is the only cross-runtime canonical ledger. | preflight | path adapter | reject alternate shared targets |
| RETRO-004 | Replays, archived evidence, and concurrent hook starts cannot create a second ledger event with the same `event_id`. | both | deterministic ID + workspace lock + ledger/archive scan | skip duplicate or locked pass |
| RETRO-005 | Capture and ingestion perform no network I/O. | execution | module boundary + tests/review | block release if introduced |
| RETRO-006 | Only declared schema versions, runtimes, signals, and states enter the ledger. Malformed input is preserved in place and skipped. | both | validators | skip; report count in sync state |
| RETRO-007 | Capturing evidence never authorizes a skill edit, product-feedback upload, or production sync. | commit | retrospective approval gate | stop and ask separately |
| RETRO-008 | Full transcript locations remain in their originating runtime inbox; shared entries carry opaque references only. | postflight | shared-event validator | reject the shared event |
| RETRO-009 | Every ledger and runtime-inbox path is excluded from version control before the first capture. | preflight | ledger library | append missing `.gitignore` entries without replacing existing rules |

## Legal state transitions

| ID | Entity | From | Action | To | Preconditions |
|---|---|---|---|---|---|
| RETRO-STATE-001 | Ledger item | unreviewed | human review | reviewed | source evidence inspected locally |
| RETRO-STATE-002 | Ledger item | reviewed | propose repair | proposed | repeated pattern or owner-directed immediate fix |
| RETRO-STATE-003 | Ledger item | proposed | owner decision | approved or dismissed | explicit decision in the active conversation |
| RETRO-STATE-004 | Ledger item | approved | verified repair | applied | edit, regression, and validation evidence exist |

## Exceptions and escalation

| Case | Why it is not mechanical | Required evidence | Escalation owner |
|---|---|---|---|
| Whether feedback is actually skill-specific | requires context and ownership judgment | local transcript review | customer + retrospective skill |
| Whether a proposed repair is desirable | requires business judgment | before/after proposal | customer |
| Whether anonymized product feedback should be shared | external disclosure decision | separate explicit consent | customer |

## Validation protocol

1. Require safe, explicit workspace consent.
2. Normalize a pointer-only runtime event and validate it before capture.
3. Acquire the workspace ingestion lock.
4. Validate local events, deduplicate against the canonical ledger, and append only clean shared records.
5. Preserve malformed lines in place; record their count without repairing or deleting them automatically.
6. Move only reviewed, dismissed, or applied entries into the shared archive; include archive IDs in every later dedupe pass.
7. Release the lock and verify the shared ledger and archive contain no transcript path or content fields.

## Carve-outs

- The existing nudge may still detect a signal when the ledger is disabled; it does not persist evidence.
- A customer can run an immediate retrospective without enabling automatic capture.
- Product telemetry remains a separate consent and server contract.
- Plugin caches never hold customer ledger state because updates can replace the cache.
