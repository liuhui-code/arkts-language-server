# Live overlay metadata dispatches role changes without full catalog polling

Status: IMPLEMENTED_SLICE, final expanded117/117PASS, ordinary performance and
whole-plan acceptance pending. Frozen Worker
b0d57d20b24b63001dc487c729e76f9de25db4ac33e102c5edd8a92373c916fe,
parent1e3886df, Node20.19.5/ohos-typescript4.9.5-r10, unchanged Native800e6628.
No merge, deployment, timeout/RSS change or user-source/cache deletion.

## Public RED and actual boundary

Previous4802 member-renewal candidate still polls400 noise-file role tokens after
one unsaved edit to opened Unused350.ts, despite unchanged genuine member catalog.
Public stdio LSP regression `unsaved overlay edits...` fails400 vs1. Actual noise
leaf checks are800 (prepare400/final400), source reads0 and role parses1. This is
metadata polling, not400 compiler reparses. Evidence: I/m4-overlay-facts-delta-red.log.

Overlay lifecycle invalidation previously said only that something changed. The
completed role-facts receipt therefore could not locate that change and refreshed
all source facts. Disk-only contentDeltas are deliberately unavailable for this
input-authority transition; treating them as exhaustive would be incorrect.

## Implementation and ownership

OverlayDocumentMap maintains opaque per-open-path tokens in addition to its live
lifecycle. A frozen observation contains only a current() guard publicly; private
WeakMap metadata records producer identity and a snapshot of path/token pairs.
No source bytes, DocumentRecord, AST or inferred filesystem history is copied into
that metadata. Observations are reused while the lifecycle is unchanged, so hot
reads do not allocate another open-path snapshot. Disk-cache-only writes/eviction
do not change this live-overlay metadata.

changedOverlayPaths accepts only actual observations from the same producer and a
still-current new observation. It compares all old/new open-path tokens, covering
open, edits, rollback, removal, clear and same-number reopen. Clones, other stores
and stale new observations return unknown. A net-equal overlay set may give an empty
dispatch delta, but never makes the old lifecycle current again.

ProjectOperationScopes consumes it only after successful physical membership and
configuration checks, with the exact same Store-owned catalog, complete member
names, canonical root, reset epoch, resolver generation and successful old facts
receipt. Every changed path must already have a source fact. Mixed catalog/overlay
changes, unknown producers, gaps or unproven mappings retain the original full pass.
The original live-overlay/current/end member/configuration/read/final guards remain.
A metadata delta determines which facts to update; it is not cached validity.

## Close/reopen root spelling refinement

The first implementation correctly narrowed edit/undo to1 poll but close still
polled401. Diagnostic evidence shows the catalog/revision, member names, canonical
root, reset epoch and resolver generation were unchanged. Only the observed
`/private/var/.../Unused350.ts -> /var/.../Unused350.ts` alias was removed on close.
The old byte-for-byte alias-string guard forced full refresh.

Permit changed alias entries only when their logical path belongs to the genuine
exhaustive overlay delta and existing facts, and the physical path is exactly the
unchanged canonical root plus the logical root-relative path. Use existing lexical
containment and sameResolvedPath (Windows drive letter only). Nested links, physical
retargets, unrelated alias changes and unknown mappings fall back. No filesystem
check is removed or replaced with path-prefix reasoning: complete current/end and
final physical proofs still run. Filename/directory case is preserved.

The diagnostic preload's first attempt had an injected-source syntax/scope error;
that failed log is retained and is not a product failure. Corrected diagnostic-02
captured aliasesSame=false while every other listed gate stayed equal. Source and
assertions were not relaxed to conceal it.

## Verification

- Focused public RED1FAIL/11not-selected; narrowed-edit first attempt remained FAIL
  at close401 vs2; both original logs preserved.
- Owned public edit/undo polls1, source reads0 and original noise leaf800 remain.
  Close polls2 (one token plus its actual guarded disk read); reopen at version1
  polls1. Exact global definition and changed inferred types remain correct, disk
  bytes unchanged, single Worker. Unknown frozen overlay clones retain400/401/400.
- Map/component plus whole public file19/19PASS, no skips/cancels. Genuine-producer,
  missing/stale observations, multiple paths, rollback/net equality and clear covered.
- Frozen final expanded117/117PASS, zero skips/cancels: original namespace/SDK,
  same-size/mtime unnotified changes, file moves/recovery, byte/reference evidence,
  current/final races, actual compiler cancellation and graph retry included.
- TypeScript check/build and diff whitespace check passed. Full check:fast, actual
  Windows, original Photos and endurance remain pending; this is not UI evidence.

Commands/logs: I/m4-overlay-facts-{delta-red,delta-green,close-diagnostic,
close-diagnostic-02,alias-green,delta-expanded-first,delta-final-expanded}.log;
runtime-m4-overlay-delta-identity.json records all source/runtime hashes. Public
coverage lives in tests/semantic/navigation-group-membership-reuse.test.mjs;
component tests in tests/overlay-document-map.test.mjs. Optional facts-gate observer
is private test-only and disabled by default.

## Bounds and remaining work

Metadata snapshots costO(open paths), independent of closed project source count;
actual retained observations are owned by current/in-flight contexts and WeakMap
keys, not a global historical journal. Resource-lifetime endurance remains required.
No claim of zero memory growth is made from this design alone.

Member paths/current/final physical facts and graph proofs still traverse whole
sets. Module binding begin still clears its lookup cache on any serialized alias
change; this separate remaining derived-input cost needs its own public regression
and exact read-dependency design. Do not describe this slice as complete graph delta
or all close/reopen performance solved. Full SDK preparation also follows a distinct
whole-group Program route; partial-path timings cannot stand for it.

ADR0045 Proposed refinement records the new dispatch mechanism; ADR0019/0035/0037/
0044 physical freshness, document epochs and original input-owner contracts remain.
Rollback to full facts refresh when the old lifecycle changes; opaque metadata can
then stay inert. No storage migration or new configuration.
