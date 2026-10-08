# L01 repeated L2 trim: exact, but not resource-admitted

Date: 2026-10-07. Status: **public LSP regression GREEN; Settings L01
resource/latency admission BLOCKED**. `ARKTS_L01_REARM_TRIM` is default-off
and requires `ARKTS_BENCHMARK_CONTROL=1`. Production references routing,
diagnostics, worker count, full SDK and the 1024 MiB soft budget are unchanged.

## Question and public contract

After the backend ownership repair, a single L2 trim released sampled
`DocumentRegistry` references, but the coordinator's `trimmed` bit stayed set
after the next query rebuilt the Program. A second L2 acknowledgement then
skipped the rebuilt Program. The new [real child-process LSP test](../../tests/semantic/semantic-registry-trim.test.mjs)
checks exact references and definition, normal v1 diagnostics,
`L2 → query → L2 → query → L3`, and an immediate duplicate L2 with no query.

The test first failed on the prior implementation (`1 !== 2` actual trim
probes). A query-boundary re-arm made its experimental transcript pass: both
L2 trims released the sampled Registry references to zero, whereas the
duplicate L2 did not trim again. A second public transcript then failed on
the unconditional change (`2 !== 1` in default mode). The final change
enables re-arm only when both benchmark control and the new opt-in flag are
set; default mode retains one L2 per context. The two LSP transcripts and
coordinator tests pass 9/9 after `pnpm check` and `pnpm build`.
`git diff --check` passes; the handwritten source/test files touched by the
re-arm slice are at most 499 lines. A broader `pnpm check:fast` attempt did
not become GREEN: its fixed-timeout repository bundle scenario failed during
cold setup, and the run was interrupted after that failure rather than
recorded as a full pass.
This remains a pre-merge gate, not a reason to weaken its timeouts.

This is not a Program-generation proof. The query-boundary mark is in
`finally`, so even a failed or cancelled compiler call can re-arm. No
production resource claim follows from the small fixture.

## Fixed real Settings replay

The qualifying opt-in process used clean `applications_settings` commit
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, the API24 compatibility SDK
with declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node `v26.3.0`, `ohos-typescript@4.9.5-r10`, server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, and fixed server-input
SHA-256 `88305c898f58d04f99863480308c5ec8727ad07a2f2cfd05d9b22041b6ada0a0`.
The built server/semantic-worker digests are in the ignored
[manifest](../../.bench/l01-soak/registry-rearm-optin-20-manifest.json);
the replay confirmed `inputUnchanged=true`.

The real symbols were `MenuController` at zero-based UTF-16 `90:17` in
`common/src/main/ets/core/controller/MenuController.ets` and `HomeInitData`
at `16:13` in `common/src/main/ets/sendable/HomeInitData.ets`;
`includeDeclaration=false`. The latter's unsaved overlay alternated nine
and ten known references over 20 edits. Normal automatic diagnostics and
original project boundaries stayed enabled. There was no explicit memory
pressure, forced GC or heap snapshot. The exact 22-request Location sets,
diagnostic timeline, process RSS curve and L2/L3 events are in the ignored
[report](../../.bench/l01-soak/registry-rearm-optin-20-report.json) and
[Registry probe](../../.bench/l01-soak/registry-rearm-optin-20.jsonl).

| Evidence | Qualifying opt-in run |
| --- | ---: |
| Complete exact Location sets / planned | 22 / 22 |
| Normal diagnostics | PASS |
| Automatic L2 / L3 | 3 / 4 |
| First context L2 sequence | 1, 1 — rebuilt Program was trimmed again |
| Registry refcount after every sampled L2/L3 | 0 |
| Edited references P50 / P95 / max | 2.173 / 24.499 / 25.374 s |
| Edited requests over 20 s | 7 / 20 |
| Externally sampled Node PID RSS peak, lower bound | 1,969,491,968 B |
| Externally sampled product-tree RSS peak, lower bound | 2,021,646,336 B |
| Last positive idle Node RSS sample | 847,683,584 B |

The macOS external sampler requested 50 ms but actually observed 294 ms
median and 350 ms P95 intervals, so the reported peaks are lower bounds.
The sampler's own peak RSS was 127,406,080 B and was not added to Node.
Worker threads share the Node PID and were not counted twice. These are RSS,
not the process-tree PSS required for release. The top-level command prints
`PREPARED_SUITE=FAIL` only because its separate generation-bound semantic
readiness field remains `READINESS_UNSUPPORTED`; this run's
`correctness.status` and diagnostics gate are both `PASS`.

One earlier unchanged-input 20-edit run of the unconditional re-arm build
also had 22/22 exact sets and diagnostics PASS, with 3 L2, 5 L3, a sampled
2,222,657,536 B Node peak and 25.251 s maximum edited response. A second
run observed 22/22 exact Location sets and eight L3 evictions, but its
top-level correctness/integrity status is **FAIL** because the test build
changed during the process (`inputUnchanged=false`); it is exploratory and
excluded from qualified comparison. Neither these few runs nor the earlier
fixed-backend runs isolate the re-arm's causal RSS effect.

From the current checkout, the one-command local replay is:

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/registry-rearm-optin-20-manifest.json \
  --out .bench/l01-soak/registry-rearm-optin-20-replay-report.json
```

This ignored local manifest pinned the build at report capture. Subsequent
source changes invalidate that pin; regenerate and re-pin the manifest before
another comparable run. The first two responses are preparation/baseline, followed
by 20 alternating unsaved edit references.

## Decision and next safe test

The registry ownership invariant is now observable and exact, but the full
Settings LS repeatedly crosses the 1024 MiB policy's L3 entry threshold.
The worker samples RSS after requests and immediately evicts an unleased
context at L3, including the one just used. The next legacy full-LS query
then creates another Program; four such evictions and seven >20 s requests
remain in the qualifying run. This is a pressure/rebuild feedback loop, not
proof that retained compiler objects leak. Simply skipping L3 or raising
the budget would hide, not satisfy, the resource gate.

Keep re-arm benchmark-only. A later [public LSP RED/GREEN](../tdd/l01-l2-program-witness.md)
now prevents a no-op invalid rename from re-arming L2 and requires a positive
compiler `createProgram` event. This is build observation, not a strict
resident-Program identity proof or a resource pass. The next L01 experiment
still needs pressure-aware *admission*: while L3 is
latched and the process has not fallen below its target, do not repeatedly
admit an experimental full resident LS. Preserve the existing complete
transient semantic path or return an explicit resource error, never a partial
reference set. Prove that with a real LSP RED test and the same fixed Settings
workload before considering L02. The >3 GB/50% original-case, DevEco/PSS,
stable residency and ≤500 ms gates remain open.
