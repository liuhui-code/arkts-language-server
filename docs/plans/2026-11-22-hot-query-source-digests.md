# Hot query performance: source digest vertical slice

Status: SLICE_IMPLEMENTED_AND_VALIDATED_WITH_PERFORMANCE_LIMITS (W7).
No merge/deploy. Current /private/tmp/arkts-lexical-reference-probe-20261123
inherits the ADR0047/Q4 and digest checkpoints; historical failures retained.
[Final evidence and limits](../reports/2026-11-23-hot-query-acceptance.md).

1. DONE: source/artefact provenance and2048 diagnostic. Hypotheses: namespace
   rereads dominate; redundant status derivation; new proof overhead/regression.
   First measurement identifies repeated source content reads; do not assign
   every remaining millisecond to this finding.
2. DONE: public RED96opens despite actual hit; implementation reuses guarded
   per-file digests under fresh original membership and final union.
3. DONE targeted22checks: hot no-content-read, silent restored-mtime changed
   source, controlled mid-reuse mutation rejected, query eligibility/lifecycle.
4. DONE checkpoint pairings plus final W7:2048/20K/30K ×3processes ×2versions serial alternating comparison,
   fixed closure16; exact definition and reference answers/actual cache hits,
   original source restoration, SQLite and process closure. Not UI/endurance.
5. DONE: focused120, actual full2801, production identity145, final scale146
   9sessions/72queries, actual Photos12612queries+overlay1478queries; postflight,
   source/runtime archive148,24-file task patch and final limitation report.
   Strict all-dist134 FAILED only on expected test fixture regeneration; raw
   failure retained, independently revalidated12SDKtests and production assets.

Do not alter product deadlines, V8/RSS/size policies or whole-result contracts.
Raw proof scans remain; later reduction needs separate measured equivalence.
ADR0048 records the cross-request derived-data vs fresh-validity distinction.


2026-11-23 continuation: W1 full failed overlay contract (preserved), W2 fixed
closed-only and actual full2790 PASS. W3 direct completed numeric observation
removes duplicate DTO allocations without altering final order or quotas.
Paired36 DONE18PASS; focused38 DONE100PASS; full39 RUNNING. Original Photos
first refs45s protection and real hot definition~2.5s remain unsolved. Diagnostic
counts and limits recorded in report. Continue measured scope/proof work without
confusing this performance slice with full Photos/UI/endurance acceptance.


Current W5 /2026-11-23: original-load seeding GREEN68 and final focused70 111PASS.
Actual final full71 RUNNING, frozen69, prior37/56 stopped after original20s
initialization failure plus concurrent-suite attribution ambiguity. No threshold
changed. Only final current full remains active. After it, serial78(original
admission-file controls)→79(scale)→80(actual Photos definition)→81(original
refs-first), with full input postflight82. Earlier WAIT-only benchmark chains
ran0queries, raw failures retained. These are prerequisites, not acceptance yet.


W6 continuation: default-policy actual Photos108 completed3PASS/12exactqueries/
9actualhits; first median/max8125.95/8156.65ms, hot1021.59/1061.71ms. Program87
project vs former1025root batch (same fullSDK). Original45s failure retained.
Current final109 froze1068inputs, focused110/full111 then current generated
scale112 serially. Completion requires those actual outputs plus persisted
patch/identity and report. Whole-project final fences,85s initialization and
remaining hot scans are not solved by finite lexical proof routing.
