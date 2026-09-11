# W6-C process resource probe: TDD evidence

- Requested parent revision: `f1f69ca`
- Public boundary: `createProcessResourceProbe`, `parseDarwinPsOutput`,
  `parseLinuxProcStat`, `parseLinuxProcStatus`
- Focused command: `node --test tests/process-resource-probe.test.mjs`

The shared branch advanced while parallel tracks were running. This slice owns
only the process-resource probe helper, its focused test, and this evidence
file. It does not register the test in the layer manifest or connect a release,
semantic, or large-workspace runner.

## Contract

The probe has two phases. `identify(serverPid)` captures a frozen
`{ pid, startIdentity }` handle. `sample(identity)` re-reads the operating-system
facts and rejects the sample with `EPROCESS_IDENTITY_CHANGED` when that PID now
belongs to another process lifetime. Every retained process also carries its
own PID and start identity, so a downstream time series can key by both values
instead of conflating reused PIDs.

On macOS, an injected executor receives a bounded `/bin/ps` request with
`LC_ALL=C`. It requests `comm` rather than full argv, and the parser reads PID,
PPID, `lstart`, RSS KiB, `%cpu`, and executable name/path before the sample
discards that executable field. It rejects malformed, unsafe, over-byte-limit,
or over-row-limit output. On
Linux, an injected `readFile` reads `/proc/<pid>/stat`, `/proc/<pid>/status`,
`/proc/<pid>/task/<pid>/children`, and `/proc/uptime`. The caller must inject the
host's positive integer `CLK_TCK`; the helper does not assume that it is 100.

Samples are deeply immutable and contain only:

- one timestamp;
- a `truncated` completeness flag;
- at most `maxProcesses` server/sidecar records;
- each record's role, PID, PPID, start identity, RSS bytes, and CPU percent.

The server is first. Descendants are traversed breadth-first with stable numeric
PID ordering and charged to the sidecar subtree. A cap never silently claims a
complete tree: remaining work sets `truncated: true`.

CPU semantics are intentionally explicit. Darwin records the value reported by
`ps`. Linux records lifetime-average CPU from `/proc` CPU ticks, process start
ticks, uptime, and the injected `CLK_TCK`; it is not an interval CPU sample.

## RED to GREEN

The tracer command was always:

```text
node --test tests/process-resource-probe.test.mjs
```

Observed RED slices included:

1. `ERR_MODULE_NOT_FOUND` before the macOS parser existed.
2. `Missing expected exception` for macOS byte and process-row limits.
3. a missing Linux stat/status parser export, including the process-name
   parentheses case and unsafe combined CPU ticks.
4. `unsupported process probe platform: linux` before the `/proc` traversal.
5. `Missing expected rejection` when a reused server PID changed start identity.
6. a false `truncated: false` result when the process-tree cap was reached.
7. malformed numeric facts, invalid dependencies/limits, and a non-finite clock
   result entering or reaching a sample instead of failing closed.
8. a Linux proc file above the configured post-read byte cap reaching the
   parser.
9. the macOS execution request omitting `LC_ALL=C`.
10. a missing capability declaration for the Node heap gap.
11. the macOS execution request using full `command=` argv rather than the
    narrower `comm=` field.

Each RED received only its corresponding parser guard, traversal behavior, or
immutable output field before the focused command returned GREEN.

## Final GREEN

```text
node --test tests/process-resource-probe.test.mjs
16 passed, 0 failed, 0 skipped, 0 todo
```

## Linux exit-race regression (2026-09-11)

PR #26's canonical Linux release gate exposed a process-exit race in the declaration-façade RSS
runner. `/proc/<pid>/stat` remained readable for a zombie while `/proc/<pid>/status` no longer
contained `VmRSS`; the probe reported `EPROBE_PARSE` instead of letting the runner finish its
already collected curve. A focused injected test first reproduced this as an unexpected missing
fixture read. The stat parser now retains the kernel process state, and sampling classifies `Z` or
`X` as `EPROCESS_NOT_FOUND` before attempting RSS collection. The runner already treats that code
as the normal end of a phase. Malformed status for a live process remains a hard parse error.

## Honest remaining gaps

- Node `heapUsed`, `heapTotal`, and `external` are **not sampled**. They require
  an opt-in preload plus a bounded IPC channel wired into the real server
  process. `PROCESS_RESOURCE_PROBE_CAPABILITIES.nodeHeap.available` is `false`;
  no RSS value is relabeled as heap data.
- Linux `readFile` applies the byte cap after the injected read returns. This
  bounds parsing and retained evidence, but it is not a bounded-open primitive.
- Linux `CLK_TCK` discovery (for example via a controlled `getconf` adapter) is
  not wired; the real runner must inject the measured host value.
- This focused unit slice deliberately does not depend on a host process, use
  sleeps, connect the periodic sampler, persist evidence, or establish a
  performance baseline. Those are later W6 integration slices.

- Artifact digest: not applicable; no artifact was built or consumed.
