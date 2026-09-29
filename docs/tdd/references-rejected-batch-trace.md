# Rejected verifier observations without changing semantics

Parent HEAD `9f91122ac504365c57473a430094da09baac9309`, existing dirty
`codex/references-f2-fixed-benchmark` tree preserved. This follows
[complete-scope retry](references-rejected-anchor-complete-retry.md).

## RED

Extend the public framed-LSP same-name parameter transcript: a rejected
discovery anchor must retain the actual verifier startup, host preparation,
Program/Checker, query and memory observations. It must not be represented as a
successful batch. Known parameter Locations remain the result oracle.

```sh
node --test --test-name-pattern='same-name parameter' \
  tests/semantic/references-anchor-reuse.test.mjs
```

RED: exit 1, 1,946.908 ms; `rejected verifier must retain its actual
workerStartupMs observation`. Rejection previously emitted only session/index,
omitting preparation that had already happened.

## GREEN and protected refactor

Copy existing `ReferenceBatchVerification` observations into the default-off
`references.anchor.seed.rejected` event. No new compiler query or memory
sampling occurs. Initial check/build and focused transcript: 1/1 PASS,
1,680.593 ms. Only after GREEN, extract the same metric projection used by
successful batches into `verificationTraceFields`; optional trace invocation
does not evaluate this projection when tracing is off.

Add public trace-off characterization: exact known parameter results and no
rejected-anchor event or compiler preparation metrics. Focused constructor,
multi-batch, shadowing, trace-off and post-rejection cancellation/edit:
6/6 PASS, 106,145.668 ms, zero failures/skips. Check/build PASS. Existing
constructor oracle covers explicit/implicit bases, aliases, inheritance and
both declaration policies. No partial Locations after cancellation/edit.

Additional public completeness and conservative semantic-unit suites:
7/7 PASS, 37,873.045 ms, zero failures/skips. These cover unopened references
beyond resident/lazy windows, partial membership, module/target boundaries,
declared local package closure and non-module package fail-closed behavior.

Executor/test: 352/483 physical lines, below 500. No runtime default, scope,
budget, Worker lifecycle, concurrency, SDK or compiler authority change.
This slice has focused verification; the prior 995-test full gate belongs to
the preceding build and is not claimed as a full gate for this trace build.

Real Settings evidence: [rejected-batch trace report](../reports/2026-09-27-settings-rejected-batch-trace.md).

Subsequent full verification with the
[expanded constructor boundaries](references-constructor-search-boundaries.md):
authorized `pnpm check:fast` 996/996 PASS, exit 0, zero failures/cancellations/
skips/todos, 908,988.667 ms. This closes this observation build's full-regression
follow-up; final-build Settings manifest preflight matches. Test size is now
489 lines after the additional characterization. No latency gate is inferred.
