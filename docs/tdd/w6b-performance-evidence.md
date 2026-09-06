# W6-B performance evidence contract: TDD evidence

- Parent revision: `f1f69ca42722ccd087f17c1667451181b0b34187`
- Public boundary: `evaluatePerformanceEvidence({ metric, candidate, baseline, gate })`
- Focused command: `node --test tests/performance-evidence.test.mjs`
- Scope: test infrastructure only; this slice does not register a test layer or
  enable a performance threshold.

## Contract

The helper emits the JSON-safe
`arkts-language-server.performance-evidence` schema at version 1. Candidate
and baseline series each provide raw `{ runId, value }` records plus fixture,
artifact, and runner identities. It preserves input run order, strips
unallowlisted fields, and returns a deeply frozen copy detached from caller
input.

Each series must contain between 1 and 100 raw runs. Run IDs are bounded and
unique within the series, and values are finite non-negative numbers. The
contract sorts a private value copy and computes p50, p95, and p99 with the
nearest-rank rule `value[ceil(p * n) - 1]`; it never accepts caller-supplied
percentile summaries.

A comparison is valid only when candidate and baseline have the same fixture
ID/digest and runner ID/fingerprint, but different artifact SHA-256 digests.
All identity digests are lowercase 64-character SHA-256 values. The collector
remains responsible for hashing the actual fixture, artifact, and runner
configuration; this pure contract validates and binds those identities but
does not access external bytes.

Fewer than 10 unique candidate or baseline runs yields
`publishable: false` and `verdict: null`. With at least 10 runs in both series,
the selected nearest-rank percentile must pass both `absoluteMax` and
`relativeMax` for a `pass`; either failure produces `fail`. A zero selected
baseline percentile is rejected because it cannot produce a finite relative
ratio; finite inputs whose division overflows are rejected for the same reason.
Invalid metrics, gates, series, runs, identities, summary-only
baselines, and same-artifact baselines fail closed before evidence is emitted.

## RED -> GREEN cycles

1. **Raw samples and nearest-rank statistics**
   - RED: the focused command failed with `ERR_MODULE_NOT_FOUND` because
     `tests/support/performance-evidence.mjs` did not exist.
   - GREEN: unsorted raw runs were retained and p50/p95/p99 were recomputed by
     nearest rank, including a 20-run case that distinguishes rank selection
     from interpolation.
2. **Bounded, independently identified runs**
   - RED: 101 records and duplicate run IDs were accepted.
   - GREEN: each series is bounded at 100 entries; duplicate, malformed,
     non-finite, and negative raw records are rejected deterministically.
3. **Identity-bound evidence**
   - RED: fixture/artifact/runner identity was absent from output and
     mismatched comparison identities were accepted.
   - GREEN: identities are copied into evidence; cross-fixture/cross-runner and
     same-artifact comparisons fail closed.
4. **Publishable verdict readiness**
   - RED: fewer than 10 candidate or baseline runs had no explicit readiness
     state.
   - GREEN: incomplete evidence is retained with a null, non-publishable
     verdict; 10 or more unique runs can produce a verdict.
5. **Absolute and relative evaluation**
   - RED: sufficient evidence had no gate evaluation.
   - GREEN: the selected percentile reports both absolute and relative
     outcomes, and the overall verdict passes only when both do. Invalid gates
     and zero or overflowing relative ratios are rejected.
6. **Fail-closed serialization**
   - RED: summary-only baseline input, arbitrary identity/gate fields, and
     mutable output could escape the evidence boundary.
   - GREEN: rawless baselines are rejected, only allowlisted bounded fields are
     retained, and the complete result is deeply immutable and schema-tagged.

Final focused result: 21 tests passed, 0 failed, 0 skipped, 0 todo. The suite is
deterministic and uses no clock, timer, or sleep.
