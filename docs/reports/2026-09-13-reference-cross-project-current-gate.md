# Current-artifact cross-project references gate

Date: 2026-09-13. This is a production-gate check for the current `indexed-batched`
implementation. It does not claim that these projects reproduce the user-observed 5 GB case,
and it does not change the default `legacy` strategy.

## Fixed inputs

All runs used DevEco Studio's OpenHarmony API 24 SDK at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`, Node v26.3.0,
the current `dist/server.cjs`, and a freshly rebuilt current
`target/release/arkts-index-sidecar`. An earlier run that combined the current Node bundle with
an older sidecar was discarded before comparison.

| Project | Fixed revision | Target symbol and UTF-16 position | Exact oracle |
|---|---|---|---:|
| Gramony | `0a1ee4b026b6736671f0030ba9859aceaa962298` | `DateHelper.ets`, `DateHelper`, `0:16` | 8 locations |
| ChatCube | `fd729d0f5c607763adc8ce054ad29171c66c78dc` | `HttpService.ets`, `HttpService`, `130:16` | 33 locations |
| RemoteDesk | `8edc187868e94ed41634e8a6c4c4c072e3a48679` | `RdpCredential.ets`, `RdpCredential`, `17:16` | 71 locations |

Every replay sent `textDocument/references`; no replay sent `workspace/symbol` or
`textDocument/documentSymbol`. Automatic diagnostics remained enabled.

## Same-artifact diagnostic A/B

The following are single independent cold processes at server commit `107d22b`. RSS is the
target Node process only, not the harness and not a sum of worker-thread RSS. These runs are
causal diagnostics, not publishable latency statistics.

| Project | Strategy | Request | Peak Node RSS | Compiler Program (project / SDK) | Result |
|---|---:|---:|---:|---:|---|
| Gramony | legacy | 43.385 s | 378,396,672 B | diagnostic Program 77 / 624 | 8/8 exact |
| Gramony | indexed/full | 44.083 s | 453,079,040 B | 32 / 622 | 8/8 exact |
| Gramony | indexed/common | 11.791 s | 437,264,384 B | 32 / 495 | 8/8 exact |
| ChatCube | legacy | 27.860 s | 533,360,640 B | diagnostic Program 263 / 677 | 33/33 exact |
| ChatCube | indexed/full | 29.159 s | 468,094,976 B | 48 / 555 | 33/33 exact |
| ChatCube | indexed/common | 10.133 s | 401,252,352 B | 48 / 423 | 33/33 exact |
| RemoteDesk | legacy | 31.580 s | 773,496,832 B | diagnostic Program 829 / 728 | 71/71 exact |
| RemoteDesk | indexed/full | 47.985 s | 753,827,840 B | 387 / 722 | 71/71 exact |
| RemoteDesk | indexed/common | 17.553 s | 643,379,200 B | 387 / 595 | 71/71 exact |

Against the same-run legacy process, `indexed/full` changed peak RSS by +19.7% for Gramony,
-12.2% for ChatCube, and -2.5% for RemoteDesk; latency ratios were 1.02x, 1.05x, and 1.52x.
This fails the production default memory gate. The verifier-only `common` profile materially
reduced the shared SDK working set, but Gramony still remained above legacy because the fixed
cost of the interactive and transient semantic contexts dominates this small project.

## Durable replay command and raw evidence

The repository now has one self-contained command that uses the existing `LspSession`, launches
the real server with Content-Length framed stdio, retains normal diagnostics, samples the server
process tree outside the target process, validates exact normalized locations, and records the
repo/workspace revisions plus server and sidecar SHA-256 identities.

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-business-gramony \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/base/src/main/ets/utils/DateHelper/DateHelper.ets \
  --symbol DateHelper \
  --line 0 \
  --character 16 \
  --oracle /private/tmp/arkts-gramony-a-sep10-v1-gramony-A1.json \
  --out /private/tmp/gramony-references.json \
  --mode A \
  --strategy indexed-batched \
  --sdk-profile common \
  --trace
```

Three clean-HEAD executions produced these committed raw reports. Their RSS is the product
process-tree sum (Node server plus child sidecar); the sampler process is recorded separately and
not added.

| Project | Request | Product-tree peak RSS | Program project / SDK | Diagnostics | Exact result | Raw curve |
|---|---:|---:|---:|---:|---:|---|
| Gramony | 2.982 s | 461,205,504 B | 32 / 495 | 10 | 8/8 | [JSON](evidence/2026-09-13-gramony-indexed-common-references.json) |
| ChatCube | 2.960 s | 412,577,792 B | 48 / 423 | 70 | 33/33 | [JSON](evidence/2026-09-13-chatcube-indexed-common-references.json) |
| RemoteDesk | 5.670 s | 672,903,168 B | 387 / 595 | 8 | 71/71 | [JSON](evidence/2026-09-13-remotedesk-indexed-common-references.json) |

The lower wall times than the immediately preceding diagnostic A/B demonstrate substantial
machine/cold-state variance. In particular, the earlier 14.085-second Photos observation is not
a fixed product latency. Only same-artifact, same-environment repeated series may be used for a
release performance claim.

## Decision

- The cross-project correctness gate is GREEN for these three class symbols.
- The durable reproduction-tooling gate is GREEN.
- `common` remains verifier-only and default-off; interactive diagnostics continue to use full
  SDK semantics.
- `indexed-batched` remains opt-in because memory benefit is not monotonic across project size,
  the fixed verifier context can regress small projects, and no real >3 GB reproducer is fixed.
- The next allowed experiment is a conservative interactive-diagnostics SDK closure with an
  exact full-profile diagnostic oracle and fail-closed fallback. Static `common` replacement is
  stopped because it already produced five false TS2304 diagnostics in Photos.
