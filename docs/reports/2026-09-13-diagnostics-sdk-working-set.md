# Diagnostics SDK working-set experiment on Photos 6.1

Status: diagnostics independently rebuild a large interactive Program after references. SDK declarations
dominate that Program's source text, but globally replacing the interactive SDK ambient root with
`common.d.ts` is semantically invalid. The experiment produced five new false diagnostics and was removed;
production continues to use the full SDK ambient root.

## Fixed environment

- implementation parent: `2a40dce1e17932185baac0ac578cc645390daf00`
- workspace: OpenHarmony `applications_photos`, commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24,
  declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`
- semantic backend: `ohos-typescript@4.9.5-r4`, revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`
- Node: `v26.3.0`
- target: `common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`
- operation: fresh server, initialize/index, `didOpen`, wait for the normal automatic
  `textDocument/publishDiagnostics`, then one second idle
- process accounting: external 250 ms process-tree RSS sampling; worker RSS is not summed twice

The production change in this slice is observation only. When existing default-off references tracing is
enabled, `diagnostics.program.complete` records bounded Program cardinality, text size, diagnostic count,
RSS and V8 heap usage. It records no source text or complete path. A real child-process LSP test verifies
that changing only the transient reference verifier's SDK profile does not change the full interactive
diagnostics Program.

## Full interactive Program

The full control published the expected 27 diagnostics in 14.494 seconds and reached a product process-tree
peak of 544,686,080 bytes. At the end of semantic diagnostics, the compiler Program contained:

| Class | SourceFiles | UTF-16 code units |
|---|---:|---:|
| project | 206 | 2,335,577 |
| SDK | 607 | 18,622,997 |
| other | 0 | 0 |
| total | 813 | 20,958,574 |

The SDK therefore accounts for 74.7% of SourceFiles and 88.9% of Program text. The trace point reported
500,645,888 bytes RSS and 341,757,088 bytes V8 heap used. This proves that automatic diagnostics alone can
establish the approximately 545--558 MB workflow floor observed after the bounded references response; it
is not retained reference-verifier state or duplicate Rust-sidecar accounting.

## Causal `common.d.ts` counterexample

A temporary, default-off experiment changed only the long-lived interactive engine's SDK ambient root from
`index-full.d.ts` to `common.d.ts`. It was run in a new process against the same file and SDK:

| Profile | Diagnostics | SDK files / code units | Trace RSS / heap | Product peak | Time |
|---|---:|---:|---:|---:|---:|
| full | 27 exact | 607 / 18,622,997 | 500,645,888 / 341,757,088 B | 544,686,080 B | 14.494 s |
| common | 32, **not exact** | 476 / 13,276,760 | 455,237,632 / 262,380,416 B | 498,991,104 B | 13.608 s |

The smaller root removed 131 SDK SourceFiles and 28.7% of SDK text. Product peak fell only 8.4%, while the
published diagnostics gained five false errors:

- three `TS2304` errors for `AppStorage` at zero-based UTF-16 positions `41:4`, `63:4` and `86:6`;
- two `TS2304` errors for `Resource` at positions `41:27` and `58:30`.

There were no removed diagnostics. This is a direct counterexample to treating `common.d.ts` as a safe
global interactive profile. Because the correctness gate failed on the first run, the experiment was not
repeated three times and the temporary environment switch was removed rather than exposed to users.

Raw local evidence:

- `/private/tmp/arkts-photoasset-diagnostics-full-control.json`
- `/private/tmp/arkts-photoasset-diagnostics-common-counterexample.json`
- `/private/tmp/arkts-photoasset-diagnostics-cardinality-2a40dce.json`

## Decision

The measurements support two separate conclusions:

1. SDK declaration closure is the dominant text input to the first diagnostics Program and is a valid next
   working-set boundary to investigate.
2. A static `full` to `common` ambient-root switch is not a correct implementation of that boundary.

The next implementation must discover a conservative SDK declaration closure while preserving global
ArkUI/runtime ambient declarations such as `AppStorage` and `Resource`, or keep the full SDK. Missing,
ambiguous or stale dependency evidence must fall back to full semantics. It may not hide the resulting
diagnostics, disable automatic diagnostics, or retain the unsafe experimental switch.

Gates:

- diagnostics-only Program/RSS observability: PASS
- full-profile 27-diagnostic transcript: PASS
- causal SDK-cardinality reduction: PASS
- exact diagnostic code/range/message under `common`: **FAIL** (five false errors)
- static global interactive `common` profile: STOPPED and removed
- whole-workflow final target `<=50%` of legacy references peak: OPEN

