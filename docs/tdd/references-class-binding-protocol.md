# R-10 bounded class-binding discovery protocol

Parent revision: `9f91122ac504365c57473a430094da09baac9309`.
Dirty branch `codex/references-f2-fixed-benchmark`; existing edits preserved.
Follows [captured snapshot/overlay discovery](references-class-binding-overlay.md)
and [ADR 0005](../adr/0005-index-proof-trust-boundary.md).

## Slice and authority

Add protocol-v1 NDJSON `class-bindings/resolve` and an editor-neutral Node port
over the existing per-workspace sidecar session. The endpoint reads one bounded
validated binding snapshot and applies supplied current overlays operation-locally.
No overlay or discovery result is persisted. Results are `unknown`, `no-base`,
or `resolved` declaration/spelling/span/support metadata, not final references.

This slice establishes a transport/admission boundary only. No production
references/planner consumer or discarded per-request discovery RPC is added.
No constructor candidate exclusion, second TypeChecker, schema/default, SDK,
Worker-lifetime or memory-policy change follows from lexical success.

## Admission contract

Requests carry the exact initialized `workspaceIdentity`, `expectedGeneration`,
bounded `documentUris`, unique already-requested `overlays`, `documentUri`, and
zero-based UTF-16 `classNamePosition`. Input is never silently truncated:

- At most 128 unique nonempty requested URIs; at most 4,096 UTF-8 bytes per URI
  and 64 KiB across the requested set.
- The query URI belongs to that set; overlay URIs are its unique subset.
- Each overlay text is at most 2 MiB; combined overlay text is at most 8 MiB.
- Node validates overlay workspace ownership and document versions before
  transport. Existing canonical session/URI rebasing preserves Windows drive
  spelling without lowercasing all workspace paths.

The response carries initialized workspace identity, actual `servedGeneration`,
runtime completeness and binding. A known binding requires `ready` plus equality
of runtime committed, captured snapshot and requested generations. Warming,
stale/degraded or mismatched generations yield `unknown`, not stale success.
Foreign/malformed protocol output cannot masquerade as valid discovery.

Every extensionless import/re-export hop remains `unknown`: a bounded requested
URI set cannot prove absence of competing filesystem candidates. Unknown legacy,
missing or rejected rows are not absence evidence. Invalid current source on a
traversed overlay shadows persisted success; it must not be ignored.

Transport generation equality is not a workspace/configuration freshness proof.
The future production caller must capture and fence project/SDK/workspace/index
revisions and **all relevant active overlays** before asynchronous discovery;
neither sidecar nor this port can detect an omitted buffer. `NoBase`/`Resolved`
cannot substitute for compiler constructor identity or complete search coverage.

## Actual RED → GREEN

Recorded through stable process/adapter interfaces at the parent revision:

1. `cargo test -p arkts-index-sidecar --test class_binding_protocol` initially
   exited 101: the real NDJSON process returned `method_not_found` for the new
   method. Minimal endpoint routing and existing snapshot resolver integration
   made the first explicit-extension base test GREEN (1/1).
2. The same command then exposed stale reopen success: persisted rows returned
   `resolved` while session completeness was `stale`. Requiring ready runtime
   state and runtime/snapshot/expected generation equality made it GREEN (2/2).
3. A foreign workspace identity was echoed with successful discovery. Exact
   initialized-session identity admission now rejects it with
   `workspace_mismatch`; the command returned GREEN (3/3).
4. Duplicate requested URIs initially reached storage and returned `invalid_data`
   rather than protocol `invalid_params`. Request validation is performed before
   the store read; the focused protocol command returned GREEN (4/4).
5. `node --test tests/index-class-binding-discovery.test.mjs` initially failed
   with `TypeError: resolveClassBaseBinding is not a function`, exposing the
   missing public Node adapter method. Additional actual RED cases accepted a
   resolved support set that omitted the queried class, then skipped sparse
   document/overlay array holes and sent two RPCs. Required query support and
   dense `Array.from` admission close those defects; malformed admission cannot
   start discovery transport. The final public adapter suite is GREEN.
6. `node --test tests/test-layer-manifest.test.mjs` failed because the new Node
   adapter test was unclassified. Registering it in `unit-contract` and updating
   the discovered count 117→118 (unit-contract files 56→57) returned GREEN (4/4).

Expanded real protocol characterization is GREEN (9/9, 1.33 s): unsaved overlay
redirection and UTF-16 ranges, nonpersistence, invalid overlay shadowing,
generation mismatch with actual served generation, requested missing row filled
by a current overlay, extensionless unknown and not-initialized rejection. These
guard already-admitted behavior; they do not imply compiler constructor proof.

The endpoint binds the request to its initialized database/session identity and
bounded requested set; it does not independently certify filesystem containment,
ProjectGraph admission or a complete source universe. The Node canonical URI
boundary rejects foreign input/output; production scope and revision admission
still belong to the future captured caller.

The Rust transcript uses the real executable, initialization, committed refresh,
NDJSON request/response framing and graceful shutdown. Node boundary transcripts
exercise the public adapter, not private protocol parsing functions. A scripted
external sidecar boundary is not a constructor/compiler oracle or LSP claim.

The Node real-release-binary transcript is not skipped: initial generation 0
is stale/unknown; committed generation 7 resolves; current overlays give
`no-base` or invalid-source `unknown` without persisting; close/reopen is stale
until refresh 8; expected 9/served 8 is unknown; generation 9 invalidates the
old base. This validates adapter plus real NDJSON/storage lifecycle, not
production references integration.

## GREEN responsibility extractions

Existing protocol characterization passed before and after each extraction:
`cargo test -p arkts-index-sidecar --test ndjson_protocol` reported 27 PASS and
1 existing ignored release fixture.

- NDJSON test process harness: oversized parent 2,717→2,545 physical lines;
  cohesive shared support module 190 lines.
- Existing reference-candidate protocol route: sidecar main 971→752 physical
  lines; cohesive child module 237 lines.

These preserve existing behavior and stdout protocol ownership; they were not
performed while a feature test was RED. Both parents remain migration debt.
New handwritten source/test modules must remain at or below 500 physical lines.

## Completed validation

- Rust workspace: 155 PASS / 1 existing ignored release fixture.
- Six named experimental snapshot/overlay/heritage/migration/layout suites:
  24/24 PASS.
- Release sidecar build and `pnpm check`: GREEN.
- Test-layer manifest: 4/4 PASS; 118 discovered entries, 57 unit-contract files.
- New Rust discovery route 132 lines, extracted reference route 237 and protocol
  test 271; sidecar main is 754 after dispatch integration (original 971).
- `node --test tests/index-adapter.test.mjs tests/index-catalog-adapter.test.mjs
  tests/index-class-binding-discovery.test.mjs`: 75/75 PASS (27,607 ms), zero
  failures/skips; new discovery suite contributes 47 including subtests and its
  actual release-process case.
- New Node contract/helper/URI module/test: 41/133/69/275 physical lines;
  cohesive URI extraction reduces the existing adapter 1,344→1,321. Existing
  Windows URI characterization remains GREEN; the parent is still migration debt.
- `pnpm check` and diff whitespace validation: GREEN.

`pnpm check:fast` on the frozen final source is GREEN: **1,047 PASS**, zero
failures/cancelled/skipped/todo, 939,691.819 ms. The authorized run permits the
read-only external RSS sampler. An earlier sandbox run was interrupted after
`ps`-permission fixture failures; those three fixtures pass in the authorized
run without changing their assertions. Logs and fixed Settings results are in
[the same-build report](../reports/2026-09-27-settings-class-binding-protocol.md).

## Remaining production gates

1. Captured DocumentAuthority/project/SDK/index admission with all relevant
   overlays and final revision recheck, plus authoritative source availability.
2. Compiler-backed constructor search coverage for inherited `super`, transitive
   `new Leaf`, static `new this()` and own-constructor barriers.
3. Exact public differential before any exclusion, then fixed Settings/API24
   compatibility and latency/memory validation.

The protocol itself does not reduce compiler working set. Cold/edit ≤500 ms,
original >3 GB reproduction and final memory graduation remain open. No new
production speedup, commit/push/merge or graduation claim.
