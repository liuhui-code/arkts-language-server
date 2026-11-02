# Context-retention failure evidence (test tooling only)

Parent: `accb2ebcfcc68a2b9040b65a21620f3c78ba7504`.
Status: candidate; tiny and three complete-file cohorts verified; full CI pending.

## Why

CI41445966155 fails the unchanged source-delta owner assertion with create count
2 instead of1 after correct marker completion. Its temporary fixture was removed
by ordinary teardown and the original per-fixture causal trace was not retained.
This change preserves a bounded event summary on assertion failure before cleanup.
It is an observability change, not a production root-cause fix or ADR contract change.

Node20 paired accb/5e9 selected null and complete-file null did not reproduce it.
Extra delayed-watch/settled-v1 controls passed both; they do not justify adding a
wait to the original test. The existing diagnostic-discovered mutation=false test
produced content-revision-change retirement on both, but its targeted mutation
window is not evidence that the original CI took that path.
Candidate complete-file17/19 has two independent unchanged10s preparation timeouts;
baseline19/19 passed. Both local timeout causes and original CI cause remain unknown.
No prior failure is replaced or converted to a pass by this tooling candidate.

## Characterization / TDD

The original LSP test remains unchanged except wrapping its owner-count assertion.
The exact assertion callback, expected count, marker results and all deadlines stay.
No production source, environment, worker or protocol hook is added.

Command (Node20.19.5):

```sh
node --test --test-name-pattern='^context failure evidence' \
  tests/semantic/changed-source-read-witness.test.mjs
```

RED: a pass-through helper implementation, with four added contracts, yields
2PASS/2FAIL/19 name-filter skips. Missing failure evidence and missing unavailable
fallback fail; original error identity is independently asserted.
GREEN: implemented helper, expanded field/bounds checks, yields
4PASS/0FAIL/19 name-filter skips. No LSP child is launched by these tiny contracts.
This is not the original19-case cohort passing, nor a complete-suite result.

Contracts cover original AssertionError object identity/code/actual/expected,
matching event selection, tail80 bound, omitted count,160-character string bound,
finite numeric values, scalar-only field allowlist, raw source/environment field
exclusion, proof-path digest, actual process/timing/script counters, lazy success path, collection failure, and diagnostic-output failure.

## Behavior and limits

Only a failed synchronous assertion triggers collection. The last80 matching
context-create/evict, prepare, and proof/witness events are projected through an
explicit scalar-field allowlist. Arbitrary input fields (including sourcePath,
content and environment), nested objects and nonfinite numbers are omitted.
Strings are truncated at160 characters. Earlier matching event count is reported.
Only the actually observed proof-rejected `sourcePath` field receives a SHA256 digest
(at most4096 input characters); the raw path is never emitted. This correlates
repeated facts within a fixture, not inferred roots or globally normalized paths.
If collection fails, a fixed unavailable record is attempted; if diagnostic output
fails, it is ignored. In every case the exact original thrown error is rethrown.

The helper does not prevent existing completeLogEvents from reading the full local
JSONL input; only the diagnostic payload is bounded. No protocol/source dump is
emitted. Evidence is test diagnostic output, so runner failure can still prevent
its delivery. It does not reconstruct original CI logs or guarantee future failure
reproduction.

Actual paired-event field audit found no workspace/root/group/cacheKey on context
create/evict or prepare records. The candidate does not invent such identities.
It includes observed pid/monotonicNs and script admission counters alongside existing
contextSequence/residentContextCount to separate process clocks and owner churn.
These records can establish replacement versus an additional resident context,
but cannot identify each context's root/group. Production telemetry is unchanged.

The revised four tiny contracts pass4/4, with19 name-filter skips, on Node20.19.5.
## Final scoped validation

On the same Node20.19.5 candidate, three complete files ran serially:
changed-source-read-witness23/23 (original19 plus tiny4), readiness-catalog-ordering4/4,
and readiness-catalog-input-windows7/7. Each exits0, with zero failure, skip,
cancellation or todo. Original deadlines and owner/marker assertions remain.
30 fixture logs and full test-parent protocol transcripts are retained externally.
The null case passed, so no real failure summary was triggered during this cohort.
The tiny contracts exercise summary generation and original-error retention.

The validation copy uses test-parent-only protocol logging and cleanup-time fixture
copying, excluded from the candidate patch. Scheduling may be affected; this is an
evidence-instrumented cohort, not a native/uninstrumented full CI. No production
hook was added. The exact accb build artifacts used for prior paired diagnosis
were reused (semantic-worker0528f326..., servere588dfb9..., native508a7b9b...).
All454 source files under src/crates/scripts match main, candidate and validation;
the candidate helper/test bytes match those exercised. Only tests and this TDD
record are proposed changes.

Earlier CI owner2 failure and candidate17/19 preparation timeouts remain unknown,
not repaired or overwritten by the new scoped pass. Fresh complete CI remains
pending; publication is subject to root review. Maintainer evidence:
`/workspace/shared/pr112-main114-integration-ci-evidence/failure-evidence-{red,green}.log`
and `paired/README.md` (local evidence paths, not portable repository links).


## Final Worker-lifecycle evidence extension

Source audit confirms exactly three existing log events:
`semantic-worker-host.ts` emits `semantic.worker.started` with
semanticWorkerCount/threadId; `semantic-worker-recycle.ts` emits
`semantic.worker.recovery.retired` with oldThreadId and
`semantic.worker.recovery.complete` with oldThreadId/newThreadId/documents.
These are now accepted explicitly; Worker rows retain only ts, pid and their
corresponding finite numeric fields. Worker failure/error records are not added,
nor are their raw reason/error/path fields. Production telemetry is unchanged.

The added tiny contract models the same process with thread1 then thread2 and
contextSequence1 on each side. It checks restart linkage, finite numeric filtering,
timestamp truncation, exclusion of failure records and original AssertionError
identity/actual/expected preservation. Against the previously integrated helper it
fails RED (0PASS/1FAIL/23 name skips); final tiny selection passes5/5 with19 name
skips. This is characterization of observed logging fields, not a real forced
Worker restart test or a reconstruction of original CI.

This is the final observation scope; absent context root/group identity remains
an explicit limitation. Prior unknown failures are not marked fixed.

Final Worker-extension bytes subsequently pass the same three complete files
serially on Node20.19.5: changed-source-read-witness24/24 (original19 plus tiny5),
readiness-catalog-ordering4/4, readiness-catalog-input-windows7/7; all exit0 with
zero failure/skip/cancellation/todo. The same production/runtime input is reused,
all30 fixtures plus full test-parent protocol traces are retained under
`failure-evidence-worker-runs/`; no original owner failure is reproduced.
These evidence-instrumented scoped results do not replace the original CI failure,
earlier preparation timeouts, or pending complete CI. Earlier23-case receipt above
remains a distinct pre-Worker-extension result, not overwritten or summed.
