# L01 diagnostic admission: measured memory level at Program completion

Date: 2026-10-07. Decision: **L01 resource admission BLOCKED; L02 not
admitted**. Normal automatic diagnostics stayed enabled and passed in both
real Settings/API24 runs. This report distinguishes the observed memory level
of a diagnostic Program from the preceding L3 eviction event.

## Fixed input and evidence

Both fresh child-process Content-Length LSP runs used clean Settings commit
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, the API24 compatibility SDK
(declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`),
Node `v26.3.0`, `ohos-typescript@4.9.5-r10`, and the **same built server**
SHA-256 `26fa509aabf9265aa9e2c376ef5c3672d58b57e2b82307a05d350a96f1eb7520`.
Both reports record `inputUnchanged=true`. The default-off trace adds
`documentVersion` and `memoryLevel` to `diagnostics.program.complete`; its
public real-LSP test was RED before the change and GREEN after it. It is
observation, not a change to diagnostic scheduling or publication.

Historical replays use the saved, ignored local manifests and need fresh
output paths and matching build/input pins:

```bash
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/diagnostic-admission-trace-manifest.json --out .bench/l01-soak/diagnostic-admission-trace-replay.json
node scripts/bench/replay-references.mjs --prepared-suite .bench/l01-soak/natural-diagnostic-level-manifest.json --out .bench/l01-soak/natural-diagnostic-level-replay.json
```

| Real-LSP run | References | Diagnostics and traced Program | External Node PID RSS sampled peak |
| --- | --- | --- | ---: |
| [Explicit L3 control](../../.bench/l01-soak/diagnostic-admission-trace-report.json) | 5 requests: 4 complete exact, 1 explicit `-32803` resource error | PASS; after context 1's `memory-level3` eviction, v3 diagnosis created context 2; `diagnostics.program.complete` reports `memoryLevel=level1`, 423 SourceFiles / 28 project | 1,020,383,232 B |
| [Natural 20-edit loop](../../.bench/l01-soak/natural-diagnostic-level-report.json), no explicit pressure | 22/22 complete exact | PASS; four context creates and four automatic `memory-level3` evictions; final v21 diagnosis reports `memoryLevel=level3`, 423 SourceFiles / 28 project | 1,744,920,576 B |

The explicit control shows that an **L3 eviction** does not establish the
memory level of a later diagnostic Program: its v3 completion measured level 1.
The natural loop supplies a separate active-L3 observation: the final v21
diagnostic Program completed with `memoryLevel=level3`, then its context was
evicted. The trace does not establish
that diagnostics caused all four context creations in that run; only the
final v21 creation has this direct diagnostic-Program witness. The 423-file
Program is smaller than the initial 2,261-file full-workspace Program; these
counts describe scope, not retained bytes.

The natural run has `correctness=PASS` and `diagnostics=PASS`, while its
top-level suite status remains `FAIL` because semantic readiness is
`READINESS_UNSUPPORTED`. The explicit-control run has `correctness=FAIL`
because `-32803` is not a complete semantic answer. Neither sampled RSS peak
is a hard cap or a PSS result; the external sampler's observed P95 intervals
were 346/352 ms despite a 50 ms request. No post-GC live heap, heap snapshot,
or PSS attribution was collected, so these runs do not identify a retained
compiler object or prove a leak. They also do not establish a same-workload
causal RSS difference between explicit pressure and natural edits.

## Next safe slice

Keep normal diagnostics and their versioned publications. Start with a public
real-LSP failing transcript for an automatic diagnosis that begins while the
policy is **actually** at L3, then make the smallest pressure-aware admission
change that avoids rebuilding a resident Program there without hiding a
diagnostic failure. Replay the same natural Settings loop with the completion
level trace and independent memory sampling; verify exact references,
diagnostic versions, errors, and context ownership. Post-GC/PSS measurement
remains necessary for memory attribution. Until this passes, do not admit L02,
promote the experimental route, raise the budget, or suppress diagnostics.
