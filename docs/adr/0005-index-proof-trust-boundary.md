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

Initial catalog warming is not post-mutation recovery. A global request may
observe generation 0 before the first committed catalog and fall back to
complete-scope verification. The [real Settings first-click replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
shows that this can plan many batches and remain on that plan after catalog
readiness. An [opt-in bounded-wait experiment](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
now covers both initial generation-zero warming and the pre-open window. It
keeps the request snapshot/cancellation signal, rechecks the existing
candidate-eligibility proof, and uses complete compiler fallback on timeout.
This is **not a default policy**: three exact Settings runs still took
39.8–50.5 seconds and postponed diagnostics. Defaulting the wait,
mid-request replanning or switching initial warming to legacy still require
responsiveness, diagnostic and completed-memory gates. Stale candidates must
never exclude files or become final Locations.

## Gate

Stale, partial, ambiguous, re-export, SDK-import and unsaved-overlay cases
must fail conservative. On verifier failure, discard all partial Locations
before retrying or failing. Mutation → safe fallback → committed generation →
indexed recovery has a real LSP transcript covering indexed → mutation →
legacy fallback → generation advance → indexed recovery with exact Location
equality. See [the TDD record](../tdd/references-index-resync.md).
If the sidecar moves from ready to warming after it served candidates, matching
the old committed generation is insufficient: both anchor paths must reject
the candidate set and use complete semantics. The
[state-race transcript](../tdd/references-index-state-race.md) covers this case.
