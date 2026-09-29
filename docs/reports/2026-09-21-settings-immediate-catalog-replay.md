# Settings first-request references during index startup

## Fixed input and method

Parent server revision `da8f7c0`; the source change in this slice is a
benchmark-only `--catalog-state immediate` option. It sends a real
Content-Length-framed `textDocument/references` request after `initialize`
and `didOpen`, without waiting for the private Rust catalog to finish. Normal
automatic diagnostics remain enabled. Each run starts a fresh server and
private index cache; this is **index-cold**, not the existing catalog-ready
semantic-cold baseline. No project source or boundary was modified.

- Real project: clean OpenHarmony `applications_settings` checkout
  `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
  `/private/tmp/arkts-settings-e2e.vrQQm9/project`.
- Selected SDK: DevEco OpenHarmony API 24, version `6.1.1.125`, declaration
  digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  The project declares compile API 23; this is a fixed same-SDK compatibility
  experiment, **not** proof of matched API-23 or DevEco equivalence.
- Node `v26.3.0`; server bundle SHA-256
  `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`;
  sidecar SHA-256
  `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`.
  The [manifest](../../bench/references/manifests/settings-homeinitdata-api24-usage-no-declaration.json)
  also pins Worker bundles, standard-library assets and the oracle digest.
- Query: `common/src/main/ets/sendable/HomeInitData.ets`, usage-site
  `HomeInitData` at zero-based UTF-16 `28:30`, `includeDeclaration=false`.
  The compiler-backed [oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json)
  has nine exact normalized Locations.

Reproduce from the repository root, using a previously unused output path:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-usage-no-declaration.json \
  --out /private/tmp/settings-homeinitdata-immediate-new.json \
  --mode A --catalog-state immediate --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```

Change only `--strategy` to `legacy` for the control. The runner reports
actual catalog state and phase order; `immediate` does **not** imply that the
index was certainly stale on every machine.

## Observations

| Fresh process | Exact response | Request | Observed product-tree peak RSS | Catalog observation |
| --- | --- | ---: | ---: | --- |
| Indexed-batched, 120 s limit | **No**; timeout, no partial result | >120,000 ms | 721,645,568 B before cancellation | Completed ~26.7 s after request started |
| Legacy, 30 s limit | **No**; timeout | >30,000 ms | 690,282,496 B before cancellation | Not observed before shutdown |
| Legacy, 90 s limit, run 1 | **Yes**, 9/9 exact | 38,139 ms | 909,705,216 B | Not observed before shutdown |
| Legacy, 90 s limit, run 2 | **Yes**, 9/9 exact | 31,554 ms | 874,885,120 B | Not observed before shutdown |

The successful legacy runs published normal version-1 diagnostics with zero
target-file diagnostics. The indexed request and the 30-second legacy request
timed out before a normal diagnostic publication was observed; do not call
those complete or diagnostically equivalent. These are single attempts, not
a latency distribution. Peak measurements include the server process tree,
not the RSS sampler; Worker-thread RSS is not added again. A timed-out run's
peak cannot be treated as its hypothetical completed-query peak.

The indexed trace recorded `direct-candidate-ineligible` with
`supported=false`, `complete=false`, `completeness=stale`, generation 0. It
then planned 23 conservative batches over 1,466 member files. Eleven batches
finished before the 120-second deadline; their `createProgram` time summed
to 79.6 s of 104.0 s batch time, while verifier query time summed to 1.63 s.
The completed batch Programs had 529–864 SourceFiles. Catalog progress reached
`Indexed 1846/1846 files; skipped 1 entries` about 26.7 s after startup, but
the already planned request continued its conservative batches. This strongly
implicates stale-first planning plus repeated compiler preparation in the
timeout; the trace does not by itself distinguish an actual stale sidecar
candidate from every possible Node-side unsupported-candidate mapping.

The existing [catalog-ready usage-site baseline](2026-09-21-settings-usage-anchor-baseline.md)
returned 9/9 exact with a 7,191 ms indexed median from three independent
processes. That workflow waits for indexing before the click, so it must not
be pooled with these index-cold runs.

The full raw reports, including external RSS samples, LSP transcript,
diagnostics and trace, are preserved on this Mac at:

- `/private/tmp/settings-homeinitdata-immediate-1790001129494.json`
- `/private/tmp/settings-homeinitdata-immediate-legacy-1790001316802.json`
- `/private/tmp/settings-homeinitdata-immediate-legacy-long-1790001453698.json`
- `/private/tmp/settings-homeinitdata-immediate-legacy-classified-1790001777957.json`

The first two legacy artifacts predate the corrected `not-observed`
classification; their server-close catalog observer errors are not proof of
catalog failure. The last legacy artifact uses the corrected classification.

## Gate and next decision

The real first-click latency gate is **RED**; the indexed 120-second replay is
a timeout, not a successful 9/9 result. Do not make initial stale index switch
to `legacy` by default on this evidence: the completed legacy runs still take
31–38 s and use more memory, and this Settings result does not bound the
original >3 GB workload. Before changing production policy, a public-LSP
RED/GREEN must define snapshot-safe, cancellable initial-index readiness or
replanning, prove exact result and diagnostic behavior, and compare completed
process-tree RSS on the same Settings input. No result truncation or
index-only answer is acceptable.
