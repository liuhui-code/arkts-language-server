# R-07/R-10 source-availability transport admission

Status: **Node transport/admission RED → GREEN; Rust strict admission GREEN;
final combined public regression 98/98 GREEN; Settings 267 exact PASS;
fresh controlled whole-fast 1,081/1,081 GREEN; post-gate preflight PASS**.
Parent revision:
`9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited work is preserved.
Follows [captured open-source presence](references-open-source-presence.md),
[bounded discovery protocol](references-class-binding-protocol.md) and
[ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Approved slice and contract

The public `resolveClassBaseBinding` query gains optional `sourceAvailability`:
entries `{ uri, state: "present" | "absent" | "unknown" }`. The caller captures
source evidence and owns revision/freshness fences. This transport does not
probe disk, establish physical identity or certify that caller absence is true.

Omission, an empty array and a partial requested subset supply no evidence for
missing entries: never synthesize absence from omitted entries or missing,
legacy/rejected metadata. Preserve `unknown`, including overlap with an open
overlay. An explicit `absent` entry overlapping an overlay is contradictory
and must be rejected. Availability is bounded by the existing requested URI
set: unique canonical identities, at most 128 entries and requested membership.
Dense arrays of objects, valid URI strings and the strict string state enum
are mandatory. Positional arrays and object-shaped enum tags are invalid.

Node rejects caller errors before discovery IO and keeps the session usable.
The real Rust NDJSON endpoint validates before snapshot/store access. Existing
workspace identity, generation/readiness and overlay byte limits remain.
The Rust resolver **does not consume this new evidence** in this slice.
Even complete extensionless candidate evidence remains `unknown`; no new
production references RPC consumer or constructor candidate exclusion is added.

## Actual public REDs

Raw directory: `.bench/anchor-reuse-2026-09-28/`. Logs were created only after
unused-output guards; retained files are not overwritten. Public Node tests use
the real adapter with an external NDJSON audit boundary, not private helpers.

1. `source-availability-port-red.log`: `Child.ets → ./Base`, one on-disk base
   plus all eight extension/file-index candidates. Explicit present, unknown
   and absent states reach the public method, but the outgoing protocol field
   is **undefined**, not the nine expected rebased entries. Exit 1, 0/1 PASS;
   test 2,140.546689 ms, total 2,327.629101 ms.
2. `source-availability-admission-red.log`: state `"missing"` is accepted by
   the first transport-only implementation. Expected public rejection is
   absent. Exit 1, 0/1 PASS; test 1,338.430704 ms, total 1,532.393691 ms.
3. `source-availability-rust-red.log`: the real NDJSON process accepts a
   contradictory absent/open overlay and returns successful unknown instead
   of `invalid_params`. Exit 101, 0/1 PASS; focused test 0.82 s, wall 5.62 s.
4. `source-availability-rust-enum-red.log`: Serde accepts
   `state: { "present": null }` as an enum representation. The real endpoint
   returns a resolved binding instead of `invalid_params`. Exit 101, 0/1 PASS;
   focused test 0.61 s, wall 6.18 s.
5. `source-availability-rust-entry-shape-red.log`: Serde accepts a positional
   `[uri, "present"]` entry where the public contract requires an object.
   The real endpoint again returns resolved rather than `invalid_params`.
   Exit 101, 0/1 PASS; focused test 0.60 s, wall 5.35 s.

Each filtered Node RED runs `node --test --test-concurrency=1` against
`tests/index-class-binding-discovery.test.mjs`, using name patterns
`transports captured availability` and `rejects invalid source availability`.
Rust uses `cargo test -p arkts-index-sidecar --test class_binding_protocol
an_overlay_reported_absent_by_source_availability_is_rejected -- --exact
--test-threads=1`, preceded by `/usr/bin/time -p`. These are source-admission
failures, not a missing-reference, Windows, 5 GB or latency reproduction.
Both later shape REDs use the same Rust protocol target, filtered to
`malformed_duplicate_or_foreign_source_availability_is_rejected` with
`-- --exact --test-threads=1`. None of these REDs is inferred from a count,
filename or private helper invocation.

Historical Node RED commands, run before repair with unused-output guards:

```sh
test ! -e .bench/anchor-reuse-2026-09-28/source-availability-port-red.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'transports captured availability' \
  tests/index-class-binding-discovery.test.mjs \
  > .bench/anchor-reuse-2026-09-28/source-availability-port-red.log 2>&1

test ! -e .bench/anchor-reuse-2026-09-28/source-availability-admission-red.log && \
node --test --test-concurrency=1 \
  --test-name-pattern 'rejects invalid source availability' \
  tests/index-class-binding-discovery.test.mjs \
  > .bench/anchor-reuse-2026-09-28/source-availability-admission-red.log 2>&1
```

The recorded logs now make these guards refuse overwrite. The original
wrappers preserve the failed process status while printing terminal output.

## Incremental GREEN and characterization

Minimal Node field transfer passes 1/1 (1,859.080612 ms); strict input
admission then passes 2/2 (3,101.961599 ms). Expanded public boundary
characterization passes 63/63 (21,846.404379 ms), including diskless source,
unknown/unindexed alternatives, zero-IO rejection and preserved session state.
That 63-case run uses the preceding release sidecar; it predates the strict
Rust admission repair and final release rebuild. It cannot certify the final
combined boundary. A separate public maximum-boundary test passes **1/1**,
exit 0, test **1,975.401336 ms**, total **2,147.056982 ms** in
`source-availability-boundary-characterization.log`: it sends all 128 captured
entries, then mutates the caller's array and first state before completion.
The protocol still receives the original 128 entries and requested set.

Node admission rejects invalid/missing/object states, null/non-array/sparse
inputs, non-object entries, invalid/foreign/unrequested URIs, lexical and
canonical duplicates, over-budget evidence and absent/open-overlay conflicts.
The audit asserts zero discovery requests and a still-ready session. Omitted,
empty and partial/unknown evidence retain their wire shape; overlap with an
unknown overlay does not silently become present or absent. The real release
control for a diskless `Base.ets`, an unknown alternative and a present
unindexed alternative remains unknown; its earlier result is characterization,
not evidence that the old binary implemented the new Rust admission.

Rust first rejects the absent-overlay conflict: **1/1**, test 1.09 s, wall
5.66 s in `source-availability-rust-first-green.log`. An intermediate
13-case pass (1.67 s test, 6.11 s wall) precedes the enum/entry-shape REDs.
The subsequent strict object/string decoder's real NDJSON protocol suite
passes **13/13**, zero failures/ignored/filtered, test **2.36 s**, wall
**6.29 s** in `source-availability-rust-strict-final-green.log`. This is a
debug-protocol checkpoint, not a final release or whole-workspace gate.

Rust checks admission before snapshot/store access and leaves discovery's
existing resolver call unchanged: the new field is deliberately not passed
to the binding kernel. Its protocol controls preserve explicit-extension
binding, omitted/empty/partial/unknown evidence and unknown-overlay behavior;
even complete availability for all eight extensionless candidates stays
unknown. An admitted `absent` entry without a supplied overlay may still return
the existing persisted explicit binding: this slice's result does not certify
current source presence. Only the absent/supplied-overlay contradiction is
rejected. No availability value is persisted.

Initial `pnpm check` exposes TypeScript object-property enum widening; explicitly
type the already-validated callback result, with no cast or behavior change.
`source-availability-typecheck.log` is GREEN. The initial typecheck failure was
terminal tool output, not a persisted raw log.

At the Node freeze, contract/helper/public test are **49/154/393** physical
lines; final Rust discovery/protocol files are **188/449**. All are below 500.
No oversized parent is changed by this slice.

The fresh final-source `cargo test --workspace` completes exit 0: **159 PASS,
0 FAIL, 1 existing ignored**, aggregated from 24 terminal summaries in
`source-availability-rust-workspace.log`. Final `cargo build --release -p
arkts-index-sidecar` passes (4.96 s) and `pnpm build` passes, with separate
retained logs. The runtime and new Settings manifest are frozen in the report.

After that release rebuild, the combined public adapter/catalog/discovery/test
registration run completes **98/98 PASS**, zero failures/cancellations/skips/
todos, exit 0, **57,079.720068 ms** total in
`source-availability-final-focused.log`. The discovery file contributes 66
cases, including the final maximum-boundary and strict-state controls. This
current-source gate replaces the earlier 63-case characterization for final
combined verification; exact argv and its hash are retained in the report.

The fresh pinned Settings/API24 constructor replay then completes **267/267
individual exact Locations**, normal version-1 diagnostics and shutdown/runner
exit 0. Harness references RPC is **58,759 ms**; sampled Node maximum is
**738,242,560 bytes**. The constructor seed is still rejected as
compiler-anchor-mismatch, followed by 14 complete-scope batches. This is one
trace-on compatibility replay, not paired performance improvement, constructor
narrowing, a 500 ms result or memory graduation.

## Fresh final-source gate and frozen-input revalidation

The fresh controlled `pnpm check:fast` completes **1,081 tests / 1,081 PASS /
0 FAIL**, zero cancellations/skips/todos, exit 0, **879,285.529951 ms** total
in `source-availability-check-fast.log`. This is its terminal aggregate,
not an interim passing-line count or the preceding source's gate.

Afterward, a read-only public replay-input preflight passes `validateInputs`
and `validateBenchmarkManifest` against the same Settings query, manifest,
SDK and oracle. Runtime artifacts, standard-library aggregate, SDK declaration
digest, oracle, manifest and lock hashes match the frozen replay. Its unused
output remains absent: no server starts and no output file is created. This
is terminal-tool evidence, without an invented persisted preflight log.
The controlled gate does not certify the separate default-host SDK environment.

The next independent slice exposes caller-owned query capture through a public
interface, then proves that independently captured inputs compose with this
existing port. A candidate whose parent directory is missing stays unknown;
the fixture must preserve that missing parent, without creating a `Base`
directory to label the evidence complete. No unused references RPC is added.

Prior-source **1,062 PASS**, **267 exact Locations** and **60.696 s** are
history, not measurements for this source. No production consumer, constructor
narrowing, default/SDK/dependency policy, Worker lifecycle, memory budget or
diagnostic capability changes. Complete captured source admission and
compiler-backed constructor coverage remain separate prerequisites. No 500 ms,
original >3 GB, final memory/PSS, native Windows or default-host SDK graduation
follows. No commit, push or merge is performed. Raw hashes and subsequent
terminal gates belong in
[the current transport report](../reports/2026-09-28-settings-source-availability-transport.md).
