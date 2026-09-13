# Cross-project direct-import validation and process-isolation no-go

## Scope

This follow-up starts from merged `main`
`2e1033d91dfe2d4e6538e0b01614312d7dc8c2b7`. It first checks the indexed
direct-import anchor on a second real project and declaration kind. It then
tests whether replacing each transient verifier worker thread with an
operation-scoped child process fixes the remaining Photos peak.

No production strategy, memory budget, worker count, diagnostic behavior or
result limit changed. The process-isolation implementation was opt-in during
the experiment and was removed after it failed the existing memory gate.

## FilePicker class usage

Fixed input:

- workspace: `/private/tmp/applications_filepicker-6.1-lts`
- commit: `d691e8ec5da1e75e25dbefc922df0ea3fe361ee5`
- SDK: DevEco OpenHarmony API 24 through LSP initialization options
- file: `entry/src/main/ets/entryability/MainAbility.ets`
- symbol: `StartModeOptions` at the direct named-import usage in the
  `startModeOptions` field
- request: `textDocument/references`, `includeDeclaration=true`
- oracle: the fixed legacy 49-Location result

Three independent new processes all used `indexed-declaration-identity`, made
one verifier batch with 14 candidate files, and produced a 56-project-file / 576-SDK-file
Program. All returned the exact 49 legacy Locations and published four version-1
diagnostics.

| Run | Request | Peak product RSS | Locations |
|---:|---:|---:|---:|
| 1 | 4.702 s | 453,689,344 bytes | 49/49 exact |
| 2 | 6.033 s | 493,121,536 bytes | 49/49 exact |
| 3 | 4.738 s | 503,345,152 bytes | 49/49 exact |

Median request time is 4.738 seconds, 1.68x the fixed 2.820-second legacy
median. Median peak is 493,121,536 bytes, 10.9% above the fixed
444,665,856-byte legacy median. The cross-project/class correctness check is
GREEN and the latency stays inside the 2x gate, but small-project memory remains
a negative result. This continues to prohibit an unconditional default switch.

## Photos child-process verifier experiment

The fixed Photos `PhotoAsset` input remained commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`, API 24, zero-based UTF-16
position `82:26`, and the same nine-Location legacy oracle. The experiment
created a fresh child process for each of the three sequential verifier batches
and waited for it to exit before starting the next batch. A public child-process
LSP differential first proved exact equality with worker isolation.

| Run | Request | Peak product RSS | Result |
|---:|---:|---:|---|
| 1 | 12.578 s | 650,428,416 bytes | 9/9 exact |
| 2 | 11.451 s | 785,551,360 bytes | 9/9 exact |
| 3 | 11.683 s | 767,680,512 bytes | 9/9 exact |

The 767,680,512-byte median is 5.9% above the current transient-worker median
of 724,774,912 bytes and effectively equal to the 768,888,832-byte legacy
peak. Median request time is 11.683 seconds, effectively unchanged from the
11.760-second worker result. OS process reclamation therefore does not attack
the dominant peak for this workload.

Decision: **NO-GO**. The process implementation and its feature flag were
removed. The next optimization must reduce the largest correct verifier
closure and/or its 675 SDK SourceFiles; changing the isolation container does
not satisfy the 30% prototype gate or the 50% production target.

Raw local evidence:

```text
/private/tmp/arkts-filepicker-startmode-direct-anchor-main-1.json
/private/tmp/arkts-filepicker-startmode-direct-anchor-main-2.json
/private/tmp/arkts-filepicker-startmode-direct-anchor-main-3.json
/private/tmp/arkts-photoasset-process-isolation-run1.json
/private/tmp/arkts-photoasset-process-isolation-run2.json
/private/tmp/arkts-photoasset-process-isolation-run3.json
```

