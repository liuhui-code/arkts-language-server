# Saved disk changes update only affected role facts

Status: IMPLEMENTED_SLICE; final expanded101/101PASS plus source-origin2/2PASS, zero skipped/cancelled. Paired ordinary acceptance pending. A-plan/M4 remains open.
No merge, deployment, product memory/deadline change or Rust rebuild.

## Evidence that selected this slice

The preceding be97cff2 generated fixed-closure matrix completed15/15 sessions,
300 requests,128/2048/8192/20000/30000 sources. Actual definition Program size
stayed16, but unrelated-save first definition medians grew78.88→306.98→1120.28→
2757.41→4135.38ms. This is not proof that all of those milliseconds belong to role
polling. It proves that Program pruning alone has not removed unrelated-file cost.
See [scale controls](2026-11-19-fixed-closure-scale-controls.md); those timings
predate this slice and are not its performance validation.

Public LSP RED against frozen be97cff2, parent1e3886df3c4d27755a53c073462f1456b0a3de7e:
`node --test --test-concurrency=1 --test-name-pattern='saved disk delta' tests/semantic/navigation-group-membership-reuse.test.mjs`
with ARKTS_TEST_SERVER_PATH pointing to runtime-m4-completed-facts/server.cjs.
A save to Unused350.ts still caused401 role token polls instead of2:400 catalog
members plus the changed source's authoritative read admission. The actual source
was parsed/read once already; the defect is repeated unchanged-fact polling,
not400 redundant text parses. Focused RED1FAIL/10not-selected retained.

## Implementation and authority boundary

ProjectOperationScopes retains one successful facts receipt with catalog owner,
canonical root, reset epoch, content revision, aliases, resolver generation and
covered membership paths. Exact unchanged catalog reuse still follows the earlier
completed-facts decision.

When the actual catalog changes, a narrow disk-delta path additionally requires:

- Genuine Store-owned current catalog; original completed facts remain present.
- Same complete member names, canonical owner, reset epoch, aliases and generation.
- Original overlay lifecycle still current: open/edit/close cannot use disk-only evidence.
- Existing contentDeltas form a contiguous, strictly increasing sequence from this
  facts consumer's own revision to the current workspace revision, in the exact root.
- Every changed path is canonical lexical spelling and already belongs to the facts.
  Missing history, unknown/new paths, removals or reset take the old full pass.

Consume full-project contentDeltas, never compiler-filtered changedPaths: an input
outside the current Program must still update its facts. The existing bounded
history is reused; no second watcher journal or cache framework is added. Only
changed facts poll tokens and load/parse changed bytes. Graph update and the
original current/end member proofs, configuration, load-window and final fences
are unchanged. Delta evidence does not replace physical validity. Unnotified
changes invalidate admission/history and conservatively recover through existing
paths. Revoke the receipt before any writes; cancellation cannot certify a partial
update. Capture a new receipt only after successful graph and end-member validation.

No source/AST/Program is retained by the new cursor; there is one current receipt,
not unbounded historical states. Existing role-pool ownership/release remains.

## Tests and observed limitations

Focused GREEN1PASS/10not-selected:401→2 token polls, source reads1, role parses1;
raw leaf observations1338 and member prepare2/final1 are unchanged. Exact global
definition and the changed file's inferred type remain current in the same Worker.
TypeScript check/build passed. Frozen candidate Worker:
`aeb4f1a5428710177d3203492dc90091f76fc3ce9b337343f2af13e7f82e0f6e`.
Manifest: I/runtime-m4-role-delta-identity.json.

The expanded case additionally edits two currently excluded inputs and undoes both,
requiring4 polls and exact types in each later selected file. Its first expanded
attempt expected widened string for a const literal; the compiler correctly returned
literal "updated". Original failure retained, oracle corrected to exact literal type.
This is test expectation correction, not evidence of a product type defect. Final
expanded run `m4-saved-role-delta-final-expanded.log` passed101/101 with zero
skips/cancels; separate source-origin regression2/2 passed. Both multi-file changes
and undo poll4 facts (two tokens plus authoritative read admissions), and exact
literal types prove currently unselected inputs are not dropped. Do not call the
original60/61 failed attempt green.

Targeted regressions include partial initialization, namespace/SDK/identity proofs,
unchanged and unowned producers, same-size/mtime unnotified global changes, source
moves/recovery, exact disk references, real compiler cancellation and pending graph
mutation recovery. Full check:fast and same-input paired ordinary edit measurements
for this new candidate remain pending. Do not infer elapsed speedup from401→2.

## Relationship to ADR and remaining work

ADR0019's incremental inputs and independent current/final disk proofs are preserved;
ADR0035's input/authority clocks and ADR0036's stale-namespace recovery remain.
ADR0045 Proposed refinement records the narrower derived-facts consumer. No watch-only
consistency contract or Accepted status is introduced.

This does not make all operations O(delta): member paths are still compared,
original physical proofs still cover complete membership, current graph proofs still
traverse facts, and genuine topology changes still use conservative influence
recomputation. M4 reverse-edge/influence maintenance, M5 uncertainty, matched SDK,
growing effective dependency controls and Windows/UI/endurance remain open.

Rollback: remove diskFactDelta selection and pass all membership paths to updateFacts;
retain independent completed unchanged receipt if desired. No on-disk migration.

Paired ordinary serial measurements started after all regression processes exited: `scale-controls/saved-role-delta-series-01.json`, same previous2048/30000 fixtures and three fresh processes/tier, independent fresh Native cache for first round. Results remain pending until owned close and SQLite postflight complete.

## Next measurement: known body save invalidates the member proof

Code-confirmed sequence, with elapsed attribution NOT YET MEASURED:
`SemanticDocumentStore.workspaceFilesChanged` updates an existing catalog's
`diskIdentities` and revision for a known accepted source. The complete proof owns
a separate original token Map; `captureCompleteMembershipProof.current` rejects and
permanently invalidates on that mismatch. `scanProjectMembership` then cannot use
its complete-proof return path and enumerates/qualifies the entire namespace.
This is a concrete fallback branch, not proof that it accounts for all4.1s.
Current2048 paired ordinary measurements do not demonstrate a material unrelated-save
speedup from role dispatch alone, so do not prioritize token counts over wall time.

Next public regression should observe actual namespace enumerations after a known
body-only save and require current exact semantics plus all original file/directory
and final proofs. Instrument first; do not infer enumeration count from scan()
entry calls because scan may return through its existing proof fast path.

Potential complete design to validate: retire the old proof and construct a distinct
new member proof from actual admitted changed tokens while retaining original tokens
for all untouched inputs and original namespace/configuration witnesses. Only known
existing non-overlay body changes, unchanged complete member names and exhaustive
compatible deltas qualify. Check all unexplained identity differences and fall back
to enumeration for additions/removals, missing tokens, aliases, uncertainty, reset
or already-invalid old proof. New proof must still perform all raw current/final
file and namespace observations. Never mutate/re-stamp the old proof or let old
requests consume the new owner; a watch notification alone is not validity. Copying
a token Map is acceptable if it removes repeated filesystem enumeration without
introducing a new persistent framework. This is a hypothesis/design for the next
slice, not implemented or measured performance improvement.
