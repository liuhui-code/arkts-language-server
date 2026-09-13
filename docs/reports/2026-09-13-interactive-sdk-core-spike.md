# Interactive SDK core-closure spike

Status: correctness GREEN on the fixed Photos diagnostic workload and three additional real projects,
but the product-memory gate FAILED. The profile remains default-off and is not a production-default
candidate.

## Fixed environment

- implementation parent: `3a7e1e2a2e7736ed204071c3ba2d98dbab9d0aae`
- server artifact SHA-256: `5e3505df21f481714025e5e914deaf13de57ffd737f1d8249c6773d012cc8c21`
- index sidecar SHA-256: `f498ead6998a052bb790d3a51914c12475f65aff13e440708823cf73a35c5591`
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24,
  declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`
- semantic backend: `ohos-typescript@4.9.5-r4`, revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`
- Node: `v26.3.0`
- process accounting: fresh server per run and external 250 ms product-process-tree RSS sampling;
  worker RSS was not summed separately

The opt-in `ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core` experiment seeds the interactive compiler with
the SDK's `common.d.ts`, `units.d.ts`, and `common_ts_ets_api.d.ts`. Compiler reference traversal still
loads declarations reachable from those roots. If any seed is absent, discovery fails closed to the
existing full SDK prelude. The default is `full`.

The seed adds the declarations that the earlier unsafe `common.d.ts` experiment proved necessary for
`AppStorage` and `Resource`. It is an experimental SDK-specific seed, not a generally proven dynamic
declaration-closure algorithm.

## Public LSP contracts

The real child-process LSP test first demonstrated RED at parent revision `3a7e1e2`: the core run still
reported five SDK files because the environment contract was not wired. After the minimal wiring, the
same test was GREEN:

- `textDocument/references` Location set exactly matched `full`;
- published diagnostic code/range/message set exactly matched `full` and was empty;
- the interactive diagnostic Program used three SDK files instead of five.

A second child-process contract removes one required core seed. The `core` request then uses the same
three-file full Program as the control and preserves references and diagnostics exactly. This proves the
missing-seed fail-closed path.

## Photos diagnostics-only A/B

Workspace OpenHarmony `applications_photos` was fixed at
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. The target was
`common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`. Every run initialized and
indexed a fresh server, sent `didOpen`, waited for the normal automatic `textDocument/publishDiagnostics`,
then observed one second idle.

All six runs published the same 27 diagnostics. After normalization by code, category/severity, source,
message, and UTF-16 range, every full/core pair and every run within a profile was exactly equal.

| Profile | Product peaks (bytes) | Median peak | Times | Median time | Program project / SDK | SDK text units |
|---|---:|---:|---:|---:|---:|---:|
| full | 531,693,568 / 435,396,608 / 547,987,456 | 531,693,568 | 14.395 / 20.654 / 14.320 s | 14.395 s | 206 / 607 | 18,622,997 |
| core | 490,962,944 / 497,950,720 / 497,037,312 | 497,037,312 | 13.522 / 13.500 / 13.582 s | 13.522 s | 206 / 478 | 13,428,629 |

The core seed removed 129 SDK SourceFiles and 27.9% of SDK text. Median product peak fell only 6.5%, and
median publication time fell 6.1%. Individual peaks overlap and the second pair reversed direction. This
does not pass the required 30% prototype memory reduction and must not be presented as causal product
improvement.

## Real references cross-check

The fixed Photos `PhotoAsset` request at zero-based UTF-16 `82:26` completed through
`textDocument/references` with the core profile and returned the exact nine-location legacy oracle. Normal
automatic diagnostics remained enabled. Three other real-project class requests also retained their exact
Location and diagnostic sets:

| Project | Exact references | Exact diagnostics | Interactive SDK files full -> core | Observed product peak change |
|---|---:|---:|---:|---:|
| Gramony | 8 | 10 | 255 -> 122 | -5.1% |
| ChatCube | 33 | 70 | 303 -> 172 | -1.2% |
| RemoteDesk | 71 | 8 | 257 -> 125 | +11.0% |

These are single cross-check runs against the preceding committed full-profile evidence, so the peak
changes are illustrative rather than a same-artifact performance claim. Their non-monotonic direction is
consistent with the Photos conclusion: SourceFile/text-cardinality reduction alone does not yet control
whole-product RSS.

Raw local evidence:

- `/private/tmp/arkts-photoasset-diagnostics-full-current{,-2,-3}.json`
- `/private/tmp/arkts-photoasset-diagnostics-core-current{,-2,-3}.json`
- `/private/tmp/arkts-photos-photoasset-interactive-core-current.json`
- `/private/tmp/arkts-{gramony,chatcube,remotedesk}-interactive-core-current.json`

## Decision

- exact diagnostics and references for the tested corpus: PASS
- absent core seed fallback: PASS
- SDK Program-cardinality reduction: PASS
- 30% product peak reduction: **FAIL** (6.5% median on the fixed Photos workload)
- production default: unchanged (`full` interactive SDK profile and `legacy` references)
- static core seed: retained only as a default-off differential experiment
- next optimization boundary: checker/Program lifetime and the maximum correct interactive project closure;
  do not add more static SDK seed files, disable diagnostics, force GC, or claim SourceFile count as RSS

