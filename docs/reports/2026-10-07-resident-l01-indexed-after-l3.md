# L01: indexed references after a real L3 eviction on Settings/API24

Date: 2026-10-07. Local control result: **3/3 exact recovery PASS**. Overall
prepared-suite status remains **FAIL** because generation-bound semantic
readiness is `READINESS_UNSUPPORTED`. L01 resource admission, the original
`>3 GB` case, the 50% memory gate, and the 500 ms product target remain open.

## Fixed inputs

The [manifest](../../bench/references/manifests/settings-resident-l01-indexed-after-l3-api24.json)
is SHA-256 `8922512a1b93284f9622ba8d00196b34c23acd44858688781ca918bfd51393dc`.
It reuses two already verified real symbols and exact Location oracles:

1. `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets`,
   usage of `HomeInitData` at zero-based UTF-16 `40:37`: `textDocument/definition`
   must return the declaration at
   `common/src/main/ets/sendable/HomeInitData.ets` `16:13–16:25`.
2. That declaration at `16:13`: `textDocument/references` with
   `includeDeclaration=true` must return the ten fixed locations in
   [the existing oracle](../../bench/references/oracles/settings-homeinitdata-api24-with-declaration.json).

Both documents were opened before the queries. The existing runner waited for
both normal version-1 diagnostic publications before applying explicit L3
pressure. The definition query was first, then the benchmark-only control
requested L3 and waited for a new `semantic.context.evict` event, then the
previously unqueried references target ran. The checkout and SDK boundaries
were not modified.

The clean `applications_settings` checkout was
`ecc550dfaed880e04e38a2477eb7235cd50475b9`, workspace files digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`.
The explicit DevEco SDK was OpenHarmony API24 `6.1.1.125`, declarations digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is the established API24 compatibility track, not a matched API23 or
DevEco equivalence result. Node was `v26.3.0`; the compiler backend was
`ohos-typescript@4.9.5-r10`. Server HEAD was
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86` with current uncommitted
server input digest
`198a2d0c8496dea6e688a84c266f7cb46122976efc1c1b126067f47cf178a709`.
`dist/server.cjs` digest was `26fa509aabf9265aa9e2c376ef5c3672d58b57e2b82307a05d350a96f1eb7520`;
semantic Worker digest was `2146b3f69b2e1f20a0e2d7b655d4b146ac60693cc3a57eb76b14691d9b509620`;
sidecar digest was `84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796`.
Every postflight pin matched the preflight pin.

The fixed environment used `indexed-batched + closure + full SDK`, 64 batch
roots, 1024 MiB budget, and `ARKTS_REFERENCES_TRACE=1`. It kept the base
manifest's `ARKTS_REFERENCES_CONTEXT_RETENTION=dispose` and
`ARKTS_SEMANTIC_SESSION_REUSE=off`. `ARKTS_BENCHMARK_CONTROL=1` enabled only
the existing explicit pressure control. Experimental pressure admission,
transient diagnostics and forced GC were not enabled. This is a trace-on
control, not a trace-off latency distribution.

## Reproduction

With the same pinned inputs and an unused output path, run:

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-indexed-after-l3-api24.json \
  --out .bench/l01-soak/indexed-after-l3-next-report.json
```

The macOS external RSS sampler needs permission to inspect the child Node PID.
The command exits 1 with `PREPARED_SUITE=FAIL` and `READINESS_UNSUPPORTED`
even when the two local query controls are exact. Re-pin before replay if the
build, sources, checkout or SDK changes.

Three independent new server processes produced these ignored raw reports.
Each raw JSON includes the Content-Length LSP transcript, normalized Location
arrays, normal diagnostics, event timeline, worker phases, and external RSS
samples:

| Run / raw report SHA-256 | Definition, 1/1 | References after L3, 10/10 | Node peak RSS | Product-tree peak RSS |
| --- | ---: | ---: | ---: | ---: |
| [01](../../.bench/l01-soak/indexed-after-l3-1-report.json) `13551068…703433f6` | 3,015.5 ms | 4,556.7 ms | 833,724,416 B | 883,077,120 B |
| [02](../../.bench/l01-soak/indexed-after-l3-2-report.json) `77ad69b3…5b8871` | 2,914.1 ms | 4,563.8 ms | 838,582,272 B | 880,844,800 B |
| [03](../../.bench/l01-soak/indexed-after-l3-3-report.json) `3127ef57…6c45f4` | 2,863.9 ms | 4,586.3 ms | 822,259,712 B | 866,856,960 B |

All six LSP responses were `COMPLETE`. Each matched the corresponding
normalized URI and UTF-16 range oracle exactly: `missing=[]`, `extra=[]`,
`duplicates=[]`, `invalid=[]`. The arrays also matched across all three runs.
There was no timeout, OOM, empty result, blocked scenario, or partial response.
Each process shut down with exit code 0. Normal automatic diagnostics passed
on both version-1 overlays (`HomePageMenuManager.ets`: TS2339;
`HomeInitData.ets`: none).

Each run observed catalog candidate state `ready` for 1,846/1,846 indexed
files, then context sequence 1 was actually evicted with
`reason=memory-level3` and `residentContextCount=0` before the references
request started. The pre-open diagnostic barrier completed before that
pressure request. On the references query, committed generation 1 produced a
`seed-accepted`, `identityComplete=true` proof; the indexed planner accepted
three candidate files and ran one transient verifier batch. The verified batch
Program had 674 SourceFiles: 151 project, 410 SDK, and 113 other; the full
project membership contained 1,496 files. Across the three runs, the worker
`createProgram` phase took 2,468/2,484/2,513 ms, while its query phase took
57/55/58 ms. These are traced phase timings, not separate end-to-end requests.

The requested external sampling interval was 50 ms; observed P50 was 125 ms
and P95 was 137 ms on all three runs. Reported RSS peaks are sampled lower
bounds. Node worker threads are already in the Node PID RSS and were not added
again; sampler/harness memory is separate. This control reports RSS, not PSS
or a DevEco comparison. Explicit benchmark pressure demonstrates recovery
after eviction, not the frequency of natural L3 in normal editing.

## Decision

The current indexed path recovered exact references after a witnessed L3
eviction in three independent Settings processes, with ordinary diagnostics
intact. The references median was **4,563.8 ms**, far above 500 ms. The result
does not admit L01 or L02: product readiness remains unsupported, and the
resource stability, original large-project peak, 50% memory, and latency
release gates are still unproven.
