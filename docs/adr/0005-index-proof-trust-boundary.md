# ADR 0005: Index proof and fallback boundary

Status: **Accepted; resynchronization recovery implemented**.

## Decision

Rust/SQLite may discover candidate occurrences and provide bounded identity
proof for planning. It does not decide final ArkTS symbol equality or produce
final reference Locations; `ohos-typescript` verifies them. Narrowing requires
a committed ready generation compatible with the current workspace, project,
SDK and overlay snapshot, unique declaration identity, complete alias/binding
resolution and no candidate truncation. Unknown or ambiguous proof cannot
exclude files. Never lowercase workspace paths unconditionally to mask case
differences.

Post-mutation `forceLegacy` protects correctness only while the index remains
at the previously accepted generation. Source or project changes schedule a
new catalog. Indexed batching resumes only when the sidecar reports `ready`
with `committedGeneration` greater than the mutation baseline. Unknown status,
catalog failure or a non-advancing generation remains on the complete legacy
path.

## Gate

Stale, partial, ambiguous, re-export, SDK-import and unsaved-overlay cases
must fail conservative. On verifier failure, discard all partial Locations
before retrying or failing. Mutation → safe fallback → committed generation →
indexed recovery has a real LSP transcript covering indexed → mutation →
legacy fallback → generation advance → indexed recovery with exact Location
equality. See [the TDD record](../tdd/references-index-resync.md).
