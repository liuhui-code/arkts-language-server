# Reference verifier SDK working-set experiment on Photos 6.1

Status: the verifier-only `common.d.ts` profile reduces the actual references interval and keeps the fixed
reference/diagnostic transcript exact, but it does not reduce the end-to-end product peak because normal
automatic diagnostics subsequently rebuild the full interactive Program. The profile remains opt-in;
the default is `full` and the default references strategy remains `legacy`.

## Fixed environment

- implementation parent: `f9097af05ad9e835bda669f08603394ec8b2b46f`
- workspace: OpenHarmony `applications_photos`, commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24,
  declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`
- semantic backend: `ohos-typescript@4.9.5-r4`, revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`
- Node: `v26.3.0`
- target: `common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`
- symbol: `PhotoAsset`; zero-based UTF-16 position `82:26`; `includeDeclaration=true`
- process model: fresh server per run, normal diagnostics enabled, external 250 ms process-tree RSS sampling

The experiment changes only the ambient entry root of each transient reference verifier. The long-lived
interactive engine continues to use `index-full.d.ts`, so completion, hover, and automatic diagnostics are not
silently downgraded. A real child-process LSP contract verifies that `full` and `common` return the same
normalized references and published diagnostics while the verifier Program contains fewer SDK files.

## Real-project transcript

The same-commit `full` control returned nine references and 27 diagnostics in 4.354 seconds. Its verifier
contained 351 SDK SourceFiles / 15,397,526 SDK UTF-16 code units and reported 500,490,240 bytes prepared RSS.

Three independent `common` runs produced:

| Run | References | Diagnostics | Request | Product peak | Verifier SDK files / code units | Prepared RSS |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 9 exact | 27 exact | 3.288 s | 563,097,600 B | 218 / 9,915,017 | 445,353,984 B |
| 2 | 9 exact | 27 exact | 3.343 s | 573,390,848 B | 218 / 9,915,017 | 449,458,176 B |
| 3 | 9 exact | 27 exact | 3.256 s | 563,027,968 B | 218 / 9,915,017 | 457,428,992 B |

The `common` median is 3.288 seconds and 563,097,600 bytes. Relative to the same-commit `full` control,
request time improves 24.5%, but the whole-workflow peak improves only 1.5%. Relative to the previous
three-run full-profile median of 555,728,896 bytes, the whole-workflow median is 1.3% higher, so the small
end-to-end difference is noise rather than a product-memory win.

## Phase-aligned RSS evidence

A second full/common pair retained every external sample and phase timestamp:

| Profile | References interval peak | Post-response diagnostics peak | Request | SDK files / code units |
|---|---:|---:|---:|---:|
| `full` | 560,152,576 B | 571,219,968 B | 3.981 s | 351 / 15,397,526 |
| `common` | 487,247,872 B | 568,356,864 B | 3.212 s | 218 / 9,915,017 |

During the references interval, `common` lowers peak RSS by 13.0% and request time by 19.3%. After the response,
the required automatic diagnostic publication builds the complete interactive Program and raises RSS to the
same approximately 568--571 MB floor. In the `common` run, the process tree was 487,247,872 bytes at the
references peak and 568,356,864 bytes at the diagnostics peak; the sidecar stayed approximately 40 MB, so the
increase belongs to the Node language-server process rather than duplicate sidecar accounting.

Raw local evidence:

- `/private/tmp/arkts-photoasset-sdk-full-f9097af.json`
- `/private/tmp/arkts-photoasset-sdk-common-f9097af-run1.json`
- `/private/tmp/arkts-photoasset-sdk-common-f9097af-run2.json`
- `/private/tmp/arkts-photoasset-sdk-common-f9097af-run3.json`
- `/private/tmp/arkts-photoasset-sdk-full-timeline-f9097af.json`
- `/private/tmp/arkts-photoasset-sdk-common-timeline-f9097af.json`

## Decision

This experiment confirms that SDK closure is a real part of the transient verifier cost, but disproves it as
the owner of the end-to-end peak on this workflow. The option stays default-off for further differential tests;
it does not authorize switching production references or interactive semantics to `common.d.ts`.

The next hard boundary is the full interactive Program rebuilt for diagnostics after references. The next RED
must phase-align diagnostics Program cardinality and RSS, then test a bounded diagnostic working set without
dropping, delaying indefinitely, or changing any diagnostic code/category/range. Worker/process reshuffling,
forced GC, root-cap tuning, and the stopped declaration-façade path are not valid substitutes.

Gates:

- nine normalized reference locations: PASS
- 27 diagnostics, exact code/category/range transcript: PASS
- verifier SDK cardinality reduced: PASS (351 to 218)
- references interval relative to fixed legacy peak: PASS (487,247,872 / 768,888,832 = 63.4%)
- whole-workflow final target `<=50%` of legacy: OPEN (median 73.2%)
- default strategy/profile switch: NOT AUTHORIZED (`legacy` / `full` remain defaults)
