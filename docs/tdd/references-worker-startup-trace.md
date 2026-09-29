# Trace transient Worker startup before choosing a reuse experiment

Parent `9f91122ac504365c57473a430094da09baac9309`, plus existing dirty slices;
user-owned AGENTS.md edits preserved. R-01/R-11, ADR 0003: this adds observation,
not request-scoped Worker reuse, persistent LS, or a changed semantic scope.

## RED → GREEN

The real child-process LSP alias/re-export transcript already checks exact
Locations. Extend its cold trace requirement to both anchor and batch startup:

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node --test \
  --test-name-pattern='cold usage-site anchor trace separates compiler preparation' \
  tests/semantic/references-anchor-reuse.test.mjs
```

RED: exit 1, 2,482 ms, `anchor trace must distinguish worker startup from
Program preparation`. GREEN after the minimal change: 1/1, 2,437 ms.
`pnpm check` and `pnpm build` pass. The trace-off characterization also requires
the new field to be absent, while preserving the same exact Locations.

## Measurement and ownership

With the existing trace flag only, the verifier sends a private
`runtime-ready` message after loading its module dependencies but before
semantic preparation. The parent records spawn-to-message-receipt wall time
as `workerStartupMs`. Both parent response handlers distinguish this marker
from the final result; it cannot prematurely resolve a reference/definition.
Startup therefore includes module loading, startup scheduling, transport and
parent callback scheduling; it is not pure Worker creation CPU time. The child
may start preparation before the parent consumes the marker: these elapsed
fields are not guaranteed disjoint and must not be added as exact CPU spans.

Trace disabled sends no marker and publishes no startup field. No source
text/path/AST is added to the marker. stdout stays protocol-only. Every Worker
still disposes its engine and terminates per batch or isolated anchor. Tests
retain cancellation, edit, fallback and same-process recovery behavior.

Real Settings attribution and final focused regression results are in the
[report](../reports/2026-09-27-settings-worker-startup-attribution.md). The
original >3 GB reproducer, final memory gate and 500 ms cold/edit target are
not declared solved by instrumentation.

Final focused command (anchor reuse/seed, all four conservative-unit fixtures,
scheduling/coalescing, index state/resync, worker transport and test inventory)
passes **41/41**, zero skips/failures, 211,112 ms. The suite includes cancellation
after startup and ContentModified with exact same-process recovery. Subsequent
authorized pmset inspection reports CPU_Speed_Limit=35; do not interpret the
slower fixture wall time as a code regression. Hash preflight and
`git diff --check` pass; full check:fast/release is not claimed.

All files changed by this slice stay within 500 physical lines: parent Worker
adapter 197, runtime 190, executor 332, anchor 116, public test 423. Existing
large-file migration debt from earlier slices remains recorded separately;
this observation change does not grow those files.

Real follow-up completes: constructor references return 267 exact tuples but
diagnostic timeout makes the replay FAIL; three fresh HomeInitData controls
return all nine exact Locations with normal diagnostics/exit. Measured startup
is secondary (constructor about 6.6%, controls 7.5–8.4% of request wall time),
not the dominant Program preparation cost. Machine CPU limiting snapshots
35→28 prevent product latency graduation. No Worker reuse is implemented.

Subsequently extend the existing constructor characterization to two implicit
inheritance levels and an aliased `new Leaf()` site with no base-name lexeme.
Command `node --test --test-name-pattern='explicit constructor references
preserve their own identity' tests/semantic/references-anchor-reuse.test.mjs`
passes 1/1, 79,278 ms. The three real-LSP profiles retain separate class and
constructor definitions/results, both declaration policies, explicit super,
transitive constructor call and same-name isolation. This characterizes an
already-supported compiler behavior before future index changes; no semantic
fix or fabricated RED is claimed. It reruns one of the original 41 tests.
