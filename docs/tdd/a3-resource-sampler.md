# A3 resource sampler: TDD evidence

- Parent revision: `d4fbf6b1980ad41dfb3b280600c470e9e9e9799b`
- Public boundary: `createResourceSampler({ pids, probe, clock, intervalMs })`
- Focused command: `node --test tests/resource-sampler.test.mjs`

## Contract

The helper accepts an explicit PID list, a batch probe, a clock/timer adapter,
and a sampling interval. It deduplicates and numerically sorts the PID set,
takes an immediate sample, and then samples periodically without overlapping
an in-flight probe. A successful sample records only `timestamp` and per-process
`pid`, `rssBytes`, and `cpuPercent`, so the snapshot is JSON serializable.

`start()` and `stop()` are idempotent. Stop clears the single interval once,
waits for an in-flight probe to finish, and prevents every later timer callback
from starting a probe. A failed probe becomes a sample with a controlled
`name/message/code` summary; stack, stderr, environment, and arbitrary error
properties are not copied. Sampling can recover on the next interval.

This slice intentionally injects the probe and clock. Platform-specific process
discovery, `ps` integration, persistence, CI upload, and threshold enforcement
are later integration work.

## RED -> GREEN cycles

1. **Periodic JSON-safe samples**
   - RED: module import failed with `ERR_MODULE_NOT_FOUND` because the sampler
     did not exist.
   - GREEN: duplicate input PIDs produced one sorted PID set, repeated start
     created one interval, and immediate/periodic records contained exact
     timestamps, RSS, and CPU values.
2. **Bounded idempotent stop**
   - RED: `sampler.stop` was absent.
   - GREEN: stop removed the timer once, waited for the deferred probe to be
     recorded, and later clock advances caused no new probes.
3. **Controlled probe failure**
   - RED: the first probe rejection escaped from `start()`.
   - GREEN: the failure became a minimized error record, the next interval
     recovered with a process sample, and stop left zero timers.

Final focused result: 3 tests passed, 0 failed, 0 skipped.
