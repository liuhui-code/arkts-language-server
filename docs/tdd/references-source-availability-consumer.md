# R-07/R-10 current-source availability consumption

Parent: `9f91122ac504365c57473a430094da09baac9309`; dirty branch
`codex/references-f2-fixed-benchmark`. Preserve inherited changes. Follows
[capture](references-source-availability-capture.md),
[transport](references-source-availability-transport.md),
[ADR 0005](../adr/0005-index-proof-trust-boundary.md) and the active plan.

## Approved public contract

The existing `class-bindings/resolve` NDJSON port consumes explicitly supplied
availability. No production references RPC/planner consumer is introduced.
Omitted availability preserves the historical generation-bound lexical query;
its result is not a current-presence/content certificate. Explicit empty,
partial and unknown evidence cannot restore missing source facts from SQLite.

`ClassBindingSnapshot.resolve_current_sources` uses only current source texts
and explicit absent URIs in its bounded requested universe. Every traversed
relative import/re-export alternative needs evidence; exactly one present
alternative is required. An unreadable present competitor remains unknown,
not absent. No absent state is inferred from missing, old or rejected rows.
The shared lexical kernel remains separate from compiler semantic identity.

Current text comes from an admitted authoritative overlay, otherwise a confined
disk read. Read bounds reuse 2 MiB/file and 8 MiB total, including overlays.
Canonical local URI roundtrip and an existing physical parent within the root
are required. Disk leaf links/non-files, invalid UTF-8, failed reads and changed
stat witnesses cannot revive persisted metadata. Unix opens use no-follow and
nonblocking flags. The already-locked `libc` 0.2.189 becomes a direct Unix
dependency; no package revision is upgraded.

Caller-owned absence is a supplied assumption, not a sidecar absence scan.
The independently captured ordinary `./Base` input still has four unknown
missing-parent `index.*` candidates. The complete-evidence protocol control
is an explicitly supplied universe, not evidence that the capture producer can
certify missing parents. No Base directory is manufactured in either control.

Reads/stat rechecks are best-effort, not an atomic filesystem/content snapshot.
The caller must still capture all relevant overlays/scope and call
`assertCurrent` before IO and acceptance. Numeric generation alone is not
freshness; required current source is reparsed even at the same generation.
No source text, availability or resolved binding is written to the database.

## Actual RED → GREEN

Raw evidence directory: `.bench/anchor-reuse-2026-09-28/`; unused-output guards
preserve previous logs. Public Rust tests launch the real NDJSON child.

1. `availability-consumer-absence-red.log`: deleting Base while generation 7
   remains committed still returns the persisted resolved binding. Exit 101,
   0/1 PASS. Minimal admission prevents stale metadata fallback;
   `availability-consumer-absence-green.log`: exit 0, 1/1 PASS.
2. `availability-consumer-current-source-red.log`: current Base text moves the
   name after a non-BMP comment; presence alone returns unknown. Exit 101,
   0/1 PASS. Bounded fresh reads supply current text;
   `availability-consumer-current-source-green.log`: exit 0, 2/2 PASS. New
   UTF-16 range is 0:22–26, not persisted 0:13–17; omitted legacy query still
   observes the unchanged persisted range.
3. `availability-consumer-extensionless-red.log`: complete caller evidence
   and two current diskless overlays still return unknown. Exit 101, 0/1 PASS.
   The shared kernel now validates every competing alternative;
   `availability-consumer-extensionless-green.log`: exit 0, 3/3 PASS. A single
   unknown alternative continues to withhold discovery.
4. `availability-consumer-node-port-red.log`: the public Node port with the
   preceding release binary still returns unknown for complete evidence.
   Exit 1, 0/1 PASS; this is an old-artifact transport RED, not a source failure.
5. `availability-consumer-captured-port-red.log`: independently captured
   input composes with that old binary, which returns the stale persisted
   13–17 range instead of current 22–26. Exit 1, 0/1 PASS. Release rebuild and
   final-source composition validation are recorded separately below.

Copyable filtered Rust command (substitute the exact test name above):

```sh
cargo test -p arkts-index-sidecar --test class_binding_availability \
  captured_absence_cannot_resolve_a_deleted_source_from_committed_rows \
  -- --exact --test-threads=1
```

Node RED commands use `node --test --test-concurrency=1
--test-name-pattern 'resolves complete caller-evidenced'` against
`tests/index-class-binding-discovery.test.mjs`, and pattern
`'captured current inputs compose'` against
`tests/class-binding-input-snapshot.test.mjs`.

## Characterization and remaining gates

The initial real-protocol characterization passes 11 availability + 13 existing
protocol tests. Final expansion adds the exact 8 MiB aggregate boundary.
Tests protect current anchor/re-export edits, rowless source, overlay authority,
unchanged storage, generation mismatch, missing/unknown support, invalid UTF-8,
non-files/links, Unicode URI/ranges and source budgets. Existing protocol tests
now explicitly distinguish supplied evidence from omitted legacy behavior.

Changed handwritten source/tests remain below 500 lines. Existing oversized
core `lib.rs`, sidecar `main.rs` and semantic proxy are not edited or grown.
Rust workspace completes 171 PASS/0 FAIL/1 existing ignored; release and
typecheck/build pass. Final public Node focus is 96/96 PASS and real framed-LSP
focus 17/17 PASS, all exit 0. Fixed Settings replay preserves 267 exact tuples,
diagnostics and exit 0, but takes 144.399 s after seed rejection and 14 complete
batches. Sparse external sampling observes Node/tree peaks
696,737,792/700,014,592 bytes; nominal 50 ms interval is actually median 212 ms.
An earlier restricted sampler attempt is separately environment-blocked before
any LSP request. This is compatibility, not a latency/memory graduation.
Fresh controlled whole-fast is FAIL/exit 1: 1,093 tests, 1,078 PASS, 15 FAIL,
zero cancellations/skips/todos, 2,561,937.955961 ms. Thirteen LSP waits, one
bounded A/B subprocess and one scheduling trace assertion fail. Post-failed-run
read-only public preflight matches source/lock/project/SDK/runtime pins, but
cannot convert that gate into PASS. Independent unchanged-artifact recheck of
all 15 failed cases completes 12/15 PASS, 3 FAIL under the original deadlines
and assertions. Installed-package initialization then passes three isolated
runs without changes; constructor references still time out independently.
The scheduling audit's terminal-lane assumption is corrected separately,
preserving all public response/freshness assertions; three isolated GREENs
and its related 51/51 focus pass. See
[the scheduling RED/GREEN](references-scheduling.md). No fresh whole-fast has
yet certified that test repair, so the broader gate remains open.
The preceding 1,092-case PASS does not certify this source.
Actual terminal status/hashes are recorded in
[the report](../reports/2026-09-28-settings-source-availability-consumer.md).

Constructor inherited/factory/own-reference coverage and exact differential
remain mandatory before exclusion. No defaults, membership, SDK profile,
Worker lifetime, memory budget, diagnostics or complete-result behavior change.
No 500 ms, original >3 GB, 50% memory/PSS, native Windows or default-host SDK
graduation; no commit, push or merge.
