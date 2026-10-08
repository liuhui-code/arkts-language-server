# L01 Settings post-eviction ownership and idle RSS

Date: 2026-10-07. Status: **reproduced, L01 resource gate BLOCKED**.
Two independent new server processes replayed the same real
`applications_settings` workload with normal automatic diagnostics, an
explicit L3 control, external Node-PID RSS sampling, and the default-off
Registry reference-count probe. Neither run forced GC or took a heap snapshot.
The experimental multi-batch pressure guard was enabled; production routing
was unchanged.

## Frozen input and replay

Both ignored local [manifests](../../.bench/l01-soak/post-eviction-ownership-manifest.json)
pin clean Settings commit `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
the API24 compatibility SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`,
Node v26.3.0, `ohos-typescript@4.9.5-r10`, server HEAD
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`, server-input digest
`c3642b5da9b564d4c740b98d54f6fb4e7013193296033cd7e766cec7e334acef`,
and built server SHA-256
`26fa509aabf9265aa9e2c376ef5c3672d58b57e2b82307a05d350a96f1eb7520`.
Each report records `inputUnchanged=true`. The repeat has a separate
[manifest](../../.bench/l01-soak/post-eviction-ownership-repeat-manifest.json).
Target positions are zero-based UTF-16: `MenuController` constructor usage at
`common/src/main/ets/core/controller/MenuController.ets:90:17` and
`HomeInitData` at `common/src/main/ets/sendable/HomeInitData.ets:16:13`, both
with `includeDeclaration=false`.

Historical replay command for the first run, valid only while all pins match:

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/l01-soak/post-eviction-ownership-manifest.json \
  --out .bench/l01-soak/post-eviction-ownership-new-report.json
```

The [raw first](../../.bench/l01-soak/post-eviction-ownership-report.json) and
[raw repeat](../../.bench/l01-soak/post-eviction-ownership-repeat-report.json)
reports contain all external samples, request/diagnostic timelines and exact
normalized locations. The adjacent `*-metrics.jsonl` and `*-registry.jsonl`
files contain the default-off internal observations. A source edit requires a
rebuild and new pins; it must not be relabeled as this fixed-build run.

## Public results and ownership observations

| Observation | New process 1 | New process 2 |
| --- | ---: | ---: |
| First constructor references | 267/267 exact, 33.147 s | 267/267 exact, 36.273 s |
| `HomeInitData` baseline | 9/9 exact, 459 ms | 9/9 exact, 486 ms |
| Unsaved add reference | 10/10 exact, 3.041 s | 10/10 exact, 2.266 s |
| Unsaved remove reference | 9/9 exact, 2.290 s | 9/9 exact, 2.110 s |
| Post-L3 references | explicit `-32803`, 102 ms | explicit `-32803`, 99 ms |
| Node PID sampled peak RSS | 1,025,224,704 B | 1,008,078,848 B |
| Node PID RSS at 30 s idle end | 1,023,602,688 B | 1,008,078,848 B |
| Registry references after first/second dispose | 0 / 0 | 0 / 0 |

Each run has four complete responses with zero missing, extra, duplicate or
invalid locations; the post-L3 request is a **resource error**, not a complete
semantic result. The guard rejected its 24-batch conservative plan before
starting a verifier. Both runs therefore remain `PREPARED_SUITE=FAIL` and
`READINESS_UNSUPPORTED` / `NO_GENERATION_BOUND_PUBLIC_CONTRACT`. Candidate
catalog reached 1,846/1,846 indexed files, but this does not assert a
current-generation identity proof for the rejected request. Diagnostics passed:
the pre-opened constructor file published its existing TS 2307 diagnostic and
the edited Home file published version-3 diagnostics without errors.

The first explicit L3 eviction occurred at about 851–852 MB process RSS and
released all 2,261 sampled Registry references. **Afterward, normal automatic
diagnostics already queued for the version-3 edit created a second semantic
context.** Its Program had 423 SourceFiles (28 project, 282 SDK), rather than
the first context's 2,261 SourceFiles (1,496 project, 652 SDK). This is
diagnostic readmission, not a second full-workspace Program. Its compiler work raised
Node RSS by about 173 MB in process 1 and 156 MB in process 2. The subsequent
automatic L3 eviction released all 423 sampled Registry references. Both runs
then held approximately 1.01–1.02 GB Node RSS for 30 seconds with
`residentContextCount=0`, `projectFiles=0` and no leases in the context
metrics. In process 1 the idle-end RSS was only 1,622,016 B below the sampled
peak; process 2 ended at its sampled peak. `openDocuments=0` in those metrics
counts context documents, not the `DocumentAuthority` overlay.

This identifies a real **diagnostic-rebuild cost after explicit eviction** and
shows that dispose/refcount-zero did not promptly lower process RSS. It does
**not** establish live AST bytes or a strong-reference leak: no post-GC heap
measurement or heap snapshot was taken, and V8 may retain committed heap
after objects become collectible. An [earlier isolated GC diagnostic](2026-09-21-settings-disposal-gc-probe.md)
found collectible Worker heap under a different build and disposal path; its
numbers cannot be transferred to this L3/diagnostic-rebuild sequence.
Requested sampling was 50 ms but actual
P50 intervals were 278/292 ms (P95 329/391 ms; largest gaps 451/5,678 ms),
so peaks are lower bounds.
Mac RSS cannot substitute for the release PSS gate. No SDK mismatch, OOM or
partial references response was observed. L01 remains blocked; L02 is not
admitted, and the original >3 GB / final 50% memory gates remain open.
