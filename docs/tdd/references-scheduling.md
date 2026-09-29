# References interactive scheduling

Parent revision: `26cbeac`. This slice implements F6 / R-06 for references
without increasing global verifier concurrency or changing reference results.

## RED

A real Content-Length framed LSP transcript added a default-off delay inside
the transient reference verifier, started references, then requested a
definition. The definition did not return until references had settled:

```text
node --test tests/semantic/references-scheduling.test.mjs
AssertionError: definition completed only after references settled
```

The failure proved that moving compiler work to a transient Worker had not
released the persistent semantic Worker's single Promise queue.

## GREEN

The supervisor now owns one detached references slot in addition to its normal
active command. While that slot is occupied it dispatches only explicitly
classified interactive requests. Mutations retain priority, advance the
ordered revision, and cancel the detached snapshot as ContentModified. Worker
responses are correlated by request ID so the interactive response may arrive
before the references response.

The runtime no longer awaits references in its serial queue. Request-local
`AsyncLocalStorage` isolates cancellation cells and trace correlation for
concurrent work. An opt-in trace records each admitted interactive method and
its queue wait; the artificial verifier delay remains test-only and disabled
by default.

The public transcript proves:

```text
delayed references starts
→ definition returns before references
→ hover returns before references
→ didChange cancels old references as ContentModified
→ new definition observes the changed document
```

Focused verification:

```text
pnpm check
pnpm build
node --test tests/semantic-worker-supervisor-lanes.test.mjs \
  tests/semantic-worker-supervisor.test.mjs \
  tests/semantic-cancellation-scope.test.mjs \
  tests/semantic/references-scheduling.test.mjs \
  tests/test-layer-manifest.test.mjs
```

All 51 focused tests passed. The broader references/workspace regression run
passed 56 of 57 tests in parallel; the sole existing overload test exceeded
its five-second response deadline under contention, then passed all three
cases when rerun alone. No handwritten source or test added by this slice
exceeds 500 lines. The pre-existing `semantic-worker-supervisor.ts` debt was
reduced from 998 to 953 lines by extracting the command codec; it did not grow.

## Current gate: terminal-lane audit repair (2026-09-28)

Parent `9f91122ac504365c57473a430094da09baac9309`, existing dirty tree
preserved. The current whole-fast run and independent original 15-case
recheck both reproduce a narrower test failure: every public assertion above
passes, but the final audit expects `define,hover,define` in
`references.interactive.start` and observes only `define,hover`.

The last definition is sent **after** awaiting the stale references response.
This event only describes interactive work while a global reference trace is
active. The Worker's terminal `finally` may already have cleared that trace;
requiring it after the terminal response is an invalid lifecycle assumption,
not evidence that the third response failed. Same-port log ordering and the
parent's synchronous append rule out an unflushed audit as the demonstrated
failure. No new production event or scheduler policy is introduced.

The minimal test repair checks exact `define,hover` and the unchanged
`0 <= queueWaitMs < 250` **before** sending the edit, while both public
`referencesSettled === false` assertions still hold. After shutdown it checks
exact ordinary `request.completed` events for definition/hover/definition,
all `outcome=ok`. The stale `-32801`, edited-definition exact equality,
all request deadlines, verifier delay and production assets remain unchanged.

Raw logs live under `.bench/anchor-reuse-2026-09-28/`:

| Command / log | Terminal result |
| --- | --- |
| Original whole-fast / `availability-consumer-check-fast.log` | 1,078/1,093 PASS, 15 FAIL, exit 1; audit RED among other failures |
| Original failed-case filter / `availability-consumer-failed-transcripts-recheck-1.log` | 12/15 PASS, 3 FAIL, exit 1; audit RED reproduced independently |
| Three serial unchanged-deadline scheduling runs / `availability-consumer-scheduling-green-{1,2,3}.log` | Each 1/1 PASS, exit 0; 3,767.862988 / 2,968.549034 / 2,319.598416 ms |
| Five-file supervisor/cancellation/framed-LSP/manifest focus / `availability-consumer-scheduling-focus.log` | 51/51 PASS, exit 0, zero cancellations/skips/todos; 55,935.865402 ms |

The test was 110 lines, SHA256
`6b517a37f03790242d5cd1a303ed2f15a02a982a5755c31af6b06a2c09aed932`;
it is now 122 lines, SHA256
`79ac1ff86a9fb16c3c2cb3d9fbce5734842042703ffaa52e7e1cc717476a7eae`.
The existing test-layer assignment remains unchanged. These focused GREENs
do not replace a fresh whole-fast gate: the original constructor references
deadline still fails independently. See the
[current consumer report](../reports/2026-09-28-settings-source-availability-consumer.md)
for all retained failures and fingerprints. This is a TDD test-contract repair,
not a scheduler/performance optimization or a new 500 ms claim.
