# r10 cross-project references gate

## Outcome

The current `ohos-typescript@4.9.5-r10` artifact preserves exact
`textDocument/references` results across four fixed real projects. Each legacy
and indexed run used a fresh Language Server process, the same rebuilt server
and Rust sidecar artifacts, normal automatic diagnostics, and external
product-process-tree RSS sampling.

This is a **cross-project correctness PASS**, not a release-default decision.
Each performance cell below is one independent run, so it is causal evidence
for the fixed replay only, not a stable median. The user-observed 5 GB case is
still not reproduced.

| Project | Legacy request / peak | Indexed common request / peak | Exact locations | Verifier project / SDK files |
|---|---:|---:|---:|---:|
| Gramony | 3.094 s / 407,252,992 B | 2.405 s / 407,281,664 B | 8 / 8 | 32 / 226 |
| ChatCube | 4.572 s / 521,555,968 B | 2.496 s / 380,964,864 B | 33 / 33 | 48 / 138 |
| RemoteDesk | 9.822 s / 787,152,896 B | 5.640 s / 660,140,032 B | 71 / 71 | 387 / 494 |
| Photos | 9.882 s / 785,317,888 B | 5.631 s / 614,957,056 B | 15 / 15 | 400 / 390 |

The single-run indexed peak changed by +0.01%, -26.96%, -16.14%, and -21.69%
respectively. `indexed-batched` and the verifier-only `common` SDK profile
therefore remain opt-in: the result is not monotonic, does not meet the final
50% memory target, and has not been repeated enough for a release statistic.

## Photos oracle correction

The historical r4 Photos oracle contained nine locations. The first r10
indexed replay returned fifteen and correctly failed that old oracle. A new
r10 legacy process independently returned the same fifteen normalized
locations. The six additions are real usages in `PhotoSwiper.ets`,
`ReportAlbumDataUtil.ets`, and `CleanupDataImplAsync.ets`; no historical
location disappeared.

The authoritative oracle for this backend revision is therefore the r10
legacy result, not the r4 nine-location set. This is evidence that the compiler
upgrade corrected a previous false-negative result, not evidence of a batching
false positive.

## Real sequential multi-batch check

The same Photos query was replayed with `--batch-roots 2`. It returned all
fifteen r10 legacy locations exactly. The ProjectGraph attempt completed its
first semantic-unit batch, then the second batch reported `source-unavailable`;
the request discarded the partial result and conservatively restarted as four
sequential batches, as required by the fail-closed contract.

| Run | Request | Peak product RSS | Result |
|---|---:|---:|---:|
| Photos legacy | 9.882 s | 785,317,888 B | 15 exact |
| Photos indexed, default root limit | 5.631 s | 614,957,056 B | 15 exact |
| Photos indexed, root limit 2 | 21.622 s | 626,348,032 B | 15 exact |

The conservative batches used at most 394 project SourceFiles for the first
batch and 208--209 for the remaining batches, versus 1,246 project membership
files. However, forced small batching took 2.19x the legacy request time and
did not improve peak RSS over the one-batch indexed run. It is a correctness
proof for the compiler-working-set batching mechanism, not a parameter change.
The production root limit remains unchanged.

## Fixed identities

- Server merge commit: `743f4e6d26868a6d8be22d8e684c476172e132ab`.
- Server artifact SHA-256:
  `fd7f973789e16147cf09515cdf58c2a6cea36c2488d471eabd999c6a87a4a64d`.
- Sidecar artifact SHA-256:
  `f498ead6998a052bb790d3a51914c12475f65aff13e440708823cf73a35c5591`.
- Node: v26.3.0 on macOS.
- SDK: OpenHarmony API 24, version 6.1.1.125.

Machine-readable summary:
[`evidence/2026-09-14-r10-cross-project-references-gate.json`](evidence/2026-09-14-r10-cross-project-references-gate.json).
