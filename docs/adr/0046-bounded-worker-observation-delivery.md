# ADR0046: Bounded delivery of Worker observations

- Date: 2026-11-16.
- Status: Proposed; implementation authorized by the ongoing initialization/failure repair. No independent review or Accepted claim.
- Related: IDX-V1-INIT-001, IDX-V1-SCALE-004; ADR0006, ADR0020, ADR0023, ADR0026, ADR0044/0045.

## Evidence

The generated20004-source control inherited residentFastPath=0 and referencesTrace=1,
so its original5s failures must not be called default production results. Preserve
that coverage and historical failures. Independently enable the default resident
path without changing input, SDK, five-second wait or assertions. Its first definition
completed successfully at5181ms, after the client wait expired. With queue trace
off alone it still failed. With reference detail trace off as well, the same first
definition completed at2446ms; full references still exceeded5s. These are separate
runs, not a claim that every millisecond is logging or that reference latency is fixed.

The traced first definition generated40114 input-check events for20057 sources.
Worker monotonic emission span137.9ms versus parent file-log span3835ms. Each
postLog message was handled by the parent with stderr.write plus appendFileSync.
A public130-project-source regression gives a direct counterexample:732 valid
span events perform732 synchronous file appends. Existing lifecycle logging tests
are GREEN before modifying the sink. Evidence is under
`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`:
`default-definition-input-trace-backlog.json`, `readiness-log-batching-red.log`,
`large-query-default-policy-control-valid.log`, `large-query-reference-trace-control.log`.

## Decision

1. Keep the existing Worker log envelope, per-source span emission and event data.
   Do not wait for the Worker's event loop to yield before exposing a long check's
   start; cancellation observers depend on seeing that start while it is executing.
2. The unblocked parent owns one bounded delivery buffer: at most64 info rows and
   64KiB serialized payload accounting. Flush on reaching either bound, or on the
   parent's next setImmediate. Oversized single rows use the existing direct sink.
   These are observation batch limits, not source, memory-policy or operation limits.
3. Drain accepted info rows before delivering an error, a request terminal,
   ownership failure, Worker exit/error, retirement or session disposal. Cancel a
   pending scheduled callback when draining. No duplicate callback delivery and no
   timer or buffer retained across owner disposal. Already ignored old-generation
   messages remain ignored; this change cannot authorize an old semantic result.
4. Add an optional infoBatch sink to StructuredLogger. File logging writes each
   batch as complete newline-delimited schema1 JSON records with one stderr write
   and one file append. Normal info/error methods keep their synchronous contract;
   custom loggers without a bulk sink retain immediate per-row delivery.
5. Preserve all events, exact order within each Worker stream, source paths,
   monotonic fields and normal filesystem-error degradation. Main-thread operational
   messages can interleave; do not infer worker execution time from persistence
   timestamps. This is not fsync or durability across abrupt process/system death.
6. Do not change request scheduling, cancellation/retirement deadlines, readiness,
   input freshness, semantic result completeness or recovery budgets. Do not turn
   off trace to pass the original tests. Logging does not replace those checks.

## Alternatives and boundaries

- Dropping/sampling events loses the cancellation and stage evidence used by tests.
- Buffering in the synchronous Worker hides a source-start event while it is stuck.
- An unbounded asynchronous stream merely transfers the problem into queued memory.
- A dedicated logging process/thread and a new protocol are unnecessary for the
  measured per-row syscall overhead. This smaller parent/sink change preserves the
  existing envelope and error behavior. Reconsider only with new measurements.
- Increasing timeouts or disabling validation conceals the independent qualification
  cost. Full references still need separate improvement and complete validation.

## Official API reference and adaptation

Context7 resolution failed again with its transport unavailable; no fetched Context7
result is claimed. Fallback references are the exact running Node20.19.5 docs:
[filesystem synchronous API](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html#synchronous-api)
explains that synchronous filesystem operations hold the calling event loop;
[setImmediate and clearImmediate](https://nodejs.org/download/release/v20.19.5/docs/api/timers.html#setimmediatecallback-args)
describe event-loop scheduling and cancellation of the scheduled handle. We schedule
on the parent, not the blocked Worker, keep the handle referenced until drain and
cancel it at explicit lifecycle boundaries. The buffering policy is this project's
decision, not a claim that Node prescribes64rows or64KiB.

## Verification and rollback

- RED through real framed stdio: all732 spans present but732 physical appends.
- GREEN same test: all732 spans present and17 appends, exact definition unchanged.
- Unit coverage: ordered64-row bound, error/terminal drains, idle start visibility,
  oversized-row bypass, cancellation of a flushed callback, synchronous custom sink.
- Required related regressions: true input-check cancellation, failed initialization,
  healthy/retired Worker recovery, shutdown, original20K traced mixed scenario and
  frozen real30K replay. No local subset is whole check:fast or UI acceptance.
- Rollback the delivery adapter and optional sink together; leave all input proof,
  source lifetime and Native index changes untouched. Historical failures remain.
