# PR112: observe completed L2 log records

Parent: `143d43206d0ee69d44f7a4960e7a710b446d3a0e`.
Trigger: complete CI41487119220 on streaming head50317e4, Linux fast2316/2317,
one failure, no skips/cancellations/todos. Windows install/LSP smoke passed;
later Linux query/WASM/artifact/large stages were not reached after fast failed.
Original CI log is retained locally as
`.bench/pr112-review-20261103/ci-streaming503-validate.log`.

## Cause and RED

At2026-11-02T17:37:06.578Z, the original L2 rearm test threw
`SyntaxError: Unterminated string in JSON at position80` from its `readEvents`
helper, before completing the pressure/rearm assertions. The helper read a live
JSONL file and parsed every nonempty fragment, including the final incomplete
line. Concurrent appenders do not give a reader an atomic file snapshot.
The error is in the test observer; the original CI does not establish a failed
L2 state transition, nor does a later pass explain the exact scheduling window.

A deterministic new test exercises that actual test helper with real file I/O:
write half an event, complete it with a newline, append another partial event,
then delimit that malformed event. Before correction it fails on the first
partial record with the same SyntaxError class. The RED selection intentionally
filters unrelated tests and is not a full-file receipt.

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='^L2 observations wait for complete JSONL records and reject complete corrupt records$' \
  tests/semantic/semantic-l2-rearm-witness.test.mjs
```

## Minimal correction and GREEN

Use the existing `completeLogEvents` reader for the live observer. It waits for
newline-delimited records while retaining every completed record; a malformed
completed record still throws. The missing-file behavior, original L2/Program
assertions, public framed-stdio server/Worker transcript, observation deadline
and pressure controls are unchanged. No product logger or scheduler is changed.
The existing readiness/reference reader contracts supply related characterization.

Node20.19.5, complete files, exit0:38/38, zero fail/skip/cancel/todo,
83131.995846ms. This is scoped evidence and does not replace the original full CI.

```sh
node --test --test-concurrency=1 \
  tests/semantic/semantic-l2-rearm-witness.test.mjs \
  tests/semantic/project-initialization.test.mjs \
  tests/semantic/references-constructor-scope-exclusion.test.mjs
```

Raw RED/GREEN: `.bench/pr112-review-20261103/l2-log-framing-{red,green}.log`.
The earlier143d432 complete CI was started before this additional observer issue
was found. Its status must be recorded separately if superseded/cancelled; it
cannot qualify the new head. Final exact-head complete CI remains required.

This enforces ADR0013's observation and retained-failure rules. It does not
promote an ADR, waive the legacy100K cost contract, alter product budgets or
claim real UI/Windows UNC/full30K references/rename/endurance acceptance.
