# ADR 0005: Index proof and fallback boundary

Status: **Accepted; resynchronization recovery proposed**.

## Decision

Rust/SQLite may discover candidate occurrences and provide bounded identity
proof for planning. It does not decide final ArkTS symbol equality or produce
final reference Locations; `ohos-typescript` verifies them. Narrowing requires
a committed ready generation compatible with the current workspace, project,
SDK and overlay snapshot, unique declaration identity, complete alias/binding
resolution and no candidate truncation. Unknown or ambiguous proof cannot
exclude files. Never lowercase workspace paths unconditionally to mask case
differences.

The current post-mutation `forceLegacy` protects correctness but persists for
the session. A future change may restore indexed batching only after the
sidecar commits a matching new generation and snapshot fingerprints agree.

## Gate

Stale, partial, ambiguous, re-export, SDK-import and unsaved-overlay cases
must fail conservative. On verifier failure, discard all partial Locations
before retrying or failing. Mutation → safe fallback → committed generation →
indexed recovery must have a real LSP transcript before changing the policy.
