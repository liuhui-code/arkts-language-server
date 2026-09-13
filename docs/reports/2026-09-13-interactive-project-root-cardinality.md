# Interactive project-root cardinality spike

Date: 2026-09-13. This report records a default-off causal experiment on the interactive
`ohos-typescript` Program. It does not change the production default, does not claim to reproduce
the user-observed 5 GB process, and does not weaken diagnostics or references completeness.

## Question and fixed boundary

The previous Photos diagnostics-only trace built one Program with 813 SourceFiles: 206 project
files and 607 SDK declarations. All 206 project files were compiler roots even though the opened
document only reaches a smaller dependency closure. This spike tests one variable:

```text
closure profile: every admitted project file is a compiler root
current profile: current document + every open overlay are compiler roots
                 compiler follows their real imports
```

The experiment is selected with the default-off
`ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current`. The default remains `closure`. Workspace-global
operations are deliberately excluded: `references`, rename and completion paths that request
`includeWorkspaceFiles=true` retain their existing complete-membership semantics.

All real runs used repository parent `1b2a75dfe2f46439de8f507b26db0c0e3d8a16d5`, Node v26.3.0,
DevEco Studio OpenHarmony API 24 / ETS 6.1.1.125, and server SHA-256
`a7e57067a403ca1adb09ee42f1c2085423494caa1ad500ee53de2af4d9e00d1b`.

## TDD and implementation evidence

The public child-process test uses Content-Length framed stdio. The first RED was recorded against
parent `1b2a75d`:

```text
node --test --test-name-pattern "diagnostics core SDK closure" \
  tests/semantic/references-batching.test.mjs

AssertionError: expected current profile project root count 1, observed 2
```

The minimal implementation:

- carries `projectRootProfile` through the existing semantic worker runtime;
- supplies `semanticRootPaths` only for non-workspace-global operations;
- pins the current document and every open overlay;
- lets the compiler follow actual imports instead of promoting every loaded project document to a
  root;
- adds root-file counts to the existing default-off Program trace.

The GREEN public contract compares closure/current completion, definition, references and
diagnostics. Stable completion fields, definition Locations, reference Locations and diagnostics
are exact. The per-process opaque completion-resolution ID is intentionally not compared.

## Photos diagnostics-only causal series

Workspace: OpenHarmony `applications_photos` commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. Target:
`common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`.

Each value below is a fresh process with automatic diagnostics enabled. All six runs published the
same 27 diagnostics by code, severity, source, message and UTF-16 range.

| Profile | Product-tree peaks (bytes) | Median peak | Times (seconds) | Median time |
|---|---|---:|---|---:|
| closure | 551,682,048 / 522,522,624 / 546,734,080 | 546,734,080 | 14.520 / 14.472 / 14.431 | 14.472 |
| current | 455,368,704 / 463,196,160 / 464,965,632 | 463,196,160 | 14.206 / 13.469 / 13.401 | 13.469 |

The median peak fell 15.3% and median elapsed time fell 6.9%. This is below the unchanged 30%
prototype memory gate.

| Profile | Program files | Project files | SDK files | Roots | Project roots | SDK roots |
|---|---:|---:|---:|---:|---:|---:|
| closure | 813 | 206 | 607 | 207 | 206 | 1 |
| current | 380 | 29 | 351 | 2 | 1 | 1 |

This is causal evidence that root cardinality controls how much of this project's source and SDK
declaration graph the compiler reaches. It is not evidence that RSS is proportional to file count.

## Real references and cross-project check

The repository's real replay tool sent `textDocument/references`; it did not send
`workspace/symbol` or `textDocument/documentSymbol`. Every row below used the same current server
artifact for closure/current and retained normal automatic diagnostics.

| Project / symbol | Exact result | Closure peak | Current peak | Change | Closure/current diagnostic project roots |
|---|---:|---:|---:|---:|---:|
| Photos `PhotoAsset` | 9 / 9 | 567,291,904 B | 504,631,296 B | -11.0% | 206 / 1 |
| Gramony `DateHelper` | 8 / 8 | 458,280,960 B | 460,410,880 B | +0.5% | 1 / 1 |
| ChatCube `HttpService` | 33 / 33 | 460,574,720 B | 449,400,832 B | -2.4% | 1 / 1 |
| RemoteDesk `RdpCredential` | 71 / 71 | 736,821,248 B | 668,598,272 B | -9.3% | 1 / 1 |

Photos returned all nine locked legacy Locations. Its transient reference verifier remained a
separate one-batch Program with 36 project and 218 SDK SourceFiles. The profile only changed the
interactive Program, as intended. The other three projects already presented one project root to
their diagnostic Program, so this switch did not reduce their compiler cardinality and showed no
stable cross-project product benefit.

## Completion/definition warmed workflow

The Photos mode-B replay used a fresh process and performed:

```text
didOpen -> completion -> definition -> references -> idle
```

Both profiles completed completion and definition without protocol errors, returned the exact
nine-reference oracle, and published the exact 27 diagnostics. Nevertheless:

| Profile | Completion response product RSS | Final peak | Reference request |
|---|---:|---:|---:|
| closure | 800,247,808 B | 1,106,702,336 B | 2.557 s |
| current | 810,147,840 B | 1,055,588,352 B | 2.560 s |

The peak improvement is only 4.6%. The direct cause is visible in the production call boundary:
`LegacySemanticEngine.complete()` still calls `prepare(..., true)` because module-export completion
is workspace-global. The current-root profile intentionally fails to narrow such a request. The
completion response therefore leaves roughly 760--772 MB in the Node server before definition,
diagnostics and the transient reference verifier execute. A later trace can report a 380-file
diagnostic Program while RSS still contains state created by the earlier full-membership completion.

This invalidates the stronger hypothesis that interactive diagnostic root cardinality alone bounds
the common completion/definition/references workflow.

## Decision

- The exact semantic and compiler-cardinality experiment is GREEN.
- The 30% diagnostics-only memory gate fails at 15.3%.
- The warmed end-to-end memory gate fails at 4.6%.
- `ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE` remains default-off; production stays `closure`.
- No memory budget, worker count, diagnostic behavior, reference result or default strategy changes.
- The next RED must separate local/member completion from global module-export discovery. Global
  discovery may use the existing Rust index only to recall candidates; the compiler remains the
  final validator, and stale/partial/ambiguous state must fail closed. Until a public exact
  completion contract and real RSS gate pass, completion continues to use full membership.

