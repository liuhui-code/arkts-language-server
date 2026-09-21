# F2 pinned Photos references smoke baseline

Status: **partial F2 evidence**, not a release/performance gate. Parent server
revision: `d2e8b06975dc2112849f394d26f2d074051d385a`. The checked-in
[`manifest`](../../bench/references/manifests/photos-bottomtoolbar-api24.json)
pins the Photos checkout, SDK declaration digest, exact query and server/sidecar
binary hashes. The [`oracle`](../../bench/references/oracles/photos-bottomtoolbar-get-mutually-exclusive-desc.json)
records the three known real references as workspace-relative UTF-16 ranges.
Its source is the prior fixed Photos differential, not an empty result or a
count-only comparison.

On this Mac, the checkout was clean at
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. DevEco SDK ETS API 24 was
`6.1.1.125`, with declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node was `v26.3.0`. The target was
`imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`,
`getMutuallyExclusiveDesc` at zero-based UTF-16 `351:19`, with declaration
included. Every run used a new server process, normal automatic diagnostics,
full SDK, closure dependencies, batch roots 64, a private index cache and an
external process-tree RSS sampler. Tracing was **off** for product timing.

| Strategy | Exact references | Diagnostics | Request time | Request-interval peak RSS | Whole-run peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy | 3 | 62 | 9,589 ms | 889,450,496 B | 896,401,408 B |
| batched | 3 | 62 | 106,296 ms | 841,494,528 B | 841,494,528 B |
| indexed-batched | 3 | 62 | 9,670 ms | 661,549,056 B | 661,549,056 B |

Both candidates passed the strict replay differential against legacy for the
exact Location set **and** all 62 diagnostics. Indexed-batched reduced this
one run's whole-run peak by 26.2% relative to legacy, but its cold request
remained about 9.7 seconds. Pure batching took 106 seconds, reinforcing that
batching without candidate narrowing is not a usable default here. These are
single runs; do not infer P95, a 50% memory reduction, or resolution of the
original >3 GB report. Raw JSON with the full RSS samples, request timeline,
diagnostics and normalized results remains at:

- `/private/tmp/photos-f2-legacy-20260921-unsandboxed.json`
- `/private/tmp/photos-f2-batched-20260921.json`
- `/private/tmp/photos-f2-indexed-20260921.json`

After extracting the oracle responsibility from the existing oversized
runner and tightening the manifest fields, a separate finalized-code indexed
replay again passed (3 Locations, 62 diagnostics; whole-run peak
669,839,360 B). Its raw report is
`/private/tmp/photos-f2-indexed-20260921-verified.json`. It is a second
indexed sample, not a second complete A/B/C pair.

An initial sandboxed replay failed before the first sample (`spawn EPERM`),
and was excluded; all three table rows were run with the macOS external
sampler permitted to inspect the target process. The output file from that
failed attempt is `/private/tmp/photos-f2-legacy-20260921.json` and is
explicitly **not** a semantic or memory result.

Reproduce the indexed row, choosing a fresh output path:

```sh
node scripts/bench/replay-references.mjs \
  --manifest bench/references/manifests/photos-bottomtoolbar-api24.json \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle bench/references/oracles/photos-bottomtoolbar-get-mutually-exclusive-desc.json \
  --out /private/tmp/photos-f2-indexed-new.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

The manifest refuses SDK/checkout/query/binary/oracle mismatch before server
launch. Settings/Launcher/Contacts are not represented as successful cases on
this machine: their matching SDK/checkouts and verified symbol oracles are not
present. F2 next needs ≥3 independent cold runs per strategy, ten hot runs,
both `includeDeclaration` values, and additional real-project oracles.

## Same-process repeat and unsaved-edit replay

A later mode-C indexed-batched run used the same pinned checkout, SDK, binary,
symbol and oracle: ten references at document version 1, then one unsaved
comment edit and a final request at version 2. All 11 returned the same three
exact Locations; the version-2 automatic diagnostics contained 62 items. The
first request took 10,490 ms; requests 2–10 had a median of **8,350 ms**;
the post-edit request took 8,342 ms. Whole-run peak RSS was 695,693,312 B.
This confirms correctness and no monotonic multi-gigabyte growth for this
single session, but also shows that repeat requests do not currently reuse
enough compiler work to become interactive. Raw samples and per-request
timeline: `/private/tmp/photos-f2-indexed-hot-20260921.json`.

The same legacy mode-C control returned the same three Locations on all 11
requests (requests 2–10 median 202 ms, post-edit 746 ms; whole-run peak
931,422,208 B), but **no automatic diagnostic notification arrived before
its 180-second deadline**. Its raw file is
`/private/tmp/photos-f2-legacy-hot-20260921.json`. It is *not* a valid strict
diagnostic differential or a complete PASS. This exposed a replay-tool bug:
the old status predicate could say PASS after diagnostics timed out. A real
framed-stdio CLI RED/GREEN test now requires a versioned diagnostic
notification for PASS; the legacy raw report retains its original erroneous
status and is excluded from gates. This observation does not by itself prove
whether legacy diagnostics were suppressed by the server or delayed by the
workload; that needs a separate controlled investigation.
