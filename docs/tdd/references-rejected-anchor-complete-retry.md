# Rejected discovery anchor: complete retry without redundant re-anchoring

Parent HEAD `9f91122ac504365c57473a430094da09baac9309`, existing dirty
`codex/references-f2-fixed-benchmark` tree preserved. This follows the
[direct-import safety repair](references-direct-import-anchor-proof.md).

## Characterization and RED

Extend the same real framed-LSP constructor transcript with an implicit base
constructor, a direct import alias and two inherited levels. Each local/import
query is compared with its own legacy oracle, both declaration policies, four
profiles including tracing off. Initial characterization: 1/1 PASS, 97,418 ms.
This does not prove constructor index completeness or normalize class identity.

Add a structural requirement: after compiler rejection, no standalone definition
Worker is needed to retry complete scope. Command:

```sh
node --test --test-name-pattern='explicit constructor references' \
  tests/semantic/references-anchor-reuse.test.mjs
```

RED: exit 1, 33,083 ms; `a rejected discovery anchor must use complete scope
without a second cold definition Worker`. The references themselves are exact;
the failure identifies redundant compiler preparation, not a new false negative.

## Minimal GREEN

The executor discards the attempted candidate plan and all collected Locations.
It removes only `expectedReferenceAnchor` and recursively verifies all legal
membership in the **same immutable request snapshot**. Candidate/support/identity
narrowing is not retained; dependency profile becomes closure. Existing bounded
batching, optional complete semantic graph and per-batch Worker termination stay
unchanged. No compiler objects/definitions cross Programs. The failed verifier
is terminated before retry. Checkpoints/final revision validation remain active.

Constructor plus shadowed-parameter transcript: 2/2 PASS, 92,002 ms. Exact
Locations stay protected; trace proves `candidateFiles == membershipFiles`
for retry and no standalone anchor completion. `pnpm check` and build PASS.

Add public interruption probes **after** rejection, not only during the first
candidate batch. Cancellation returns -32800, mutation returns -32801, neither
publishes partial Locations; fresh recovery matches the known parameter oracle.
Both PASS: 2/2, 10,000 ms. No timing threshold/assertion is weakened.

Final authorized `pnpm check:fast`: 995/995 PASS, exit 0, zero failures,
cancellations, skips or todos; 889,268.737 ms. This includes a fresh runtime
build and the expanded public constructor and post-rejection interruption
transcripts. Executor/test remain 340/463 physical lines, below 500.

The real Settings replay and broader regression outcome are recorded in
[the report](../reports/2026-09-27-settings-seed-complete-retry.md).
This is safe fallback fusion, not compiler-backed constructor candidate
completeness, Worker/LS persistence, a new budget or a feature/default promotion.
