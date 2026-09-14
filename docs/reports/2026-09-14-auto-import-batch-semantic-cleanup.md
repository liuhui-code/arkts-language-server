# Auto-import batch semantic-cleanup gate

Date: 2026-09-14. Parent revision:
`a7d5b0625fcc2e50a5baf7b8c0df9a67e4b4c09c`.

## Contract

`ARKTS_AUTO_IMPORT_TRIM_BETWEEN_BATCHES=1` is a default-off experiment for the already default-off
discovery-root profile. After a non-final completion batch has produced pure completion data, the
semantic context calls the official backend `cleanupSemanticCache()` lifecycle entry through the
backend-neutral query context. The final batch remains resident for subsequent interactive work.

The cleanup event records only the existing privacy-safe batch trace identity and process memory. It
does not call `getProgram()` after cleanup, because doing so would immediately rebuild the semantic
Cache being measured.

The public child-process LSP contract requires exactly two cleanup events between three Programs and
ties them to the first two batch fingerprints. It still requires all five candidates, same-name
different-source identity, exact import edits, and no discovery-backed resolve Program.

## Fixed Gramony A/B

- Workspace: Gramony `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- Server parent: `a7d5b0625fcc2e50a5baf7b8c0df9a67e4b4c09c` plus this uncommitted slice.
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24 / ETS 6.1.1.125.
- Target: `features/home/src/main/ets/dao/ChatDao.ets`, prefix `Cha`, UTF-16 `43:41`.
- Root limit: 2; six sequential Programs per completion; three fresh processes per mode.
- Each run used a fresh Rust cache, retained normal automatic diagnostics, and externally sampled the
  whole product process tree every 100 ms.

| Mode | Completion runs | Median | Peak RSS runs | Median |
|---|---|---:|---|---:|
| cleanup off | 6.337 / 5.728 / 5.830 s | 5.830 s | 534,589,440 / 563,261,440 / 566,345,728 B | 563,261,440 B |
| cleanup on | 5.268 / 5.325 / 5.437 s | 5.325 s | 518,946,816 / 520,245,248 / 459,591,680 B | 518,946,816 B |

The cleanup median reduced completion time by 8.67% and peak product RSS by 7.87%. All six runs
returned the same 16 normalized completion identities and edits, including 12 discovery-backed
pre-resolved items. Every run published 31 diagnostics with SHA-256
`96ac3039af05961adc6778ea9ba90747a66dff55f1513da529420ff4b54b166a`.

Cleanup-boundary RSS did not immediately fall after each call. The observed benefit is consistent with
discarding semantic/checker state before the next Program rather than returning allocated pages to
macOS immediately.

## Decision

Correctness: GREEN. Local batch-retention signal: GREEN. Overall product memory gate: FAILED.

The experiment is retained only behind its explicit switch. A 7.87% median reduction is useful causal
evidence, but it is below the 30% prototype threshold and does not reduce the legitimate 65-project-file
`ChatList.ets` dependency closure. The default remains disabled.

The next step is not more cleanup tuning. It must compare the bounded source-context path against a
declaration-façade consumer for the large closure, or use a true child process if lifecycle isolation is
the target. Either route must preserve the same compiler-proved completion identities and normal
diagnostics.

Normalized evidence is in
[`evidence/2026-09-14-auto-import-batch-semantic-cleanup.json`](evidence/2026-09-14-auto-import-batch-semantic-cleanup.json).
Raw 100 ms curves remain at `/private/tmp/arkts-gramony-auto-import-batch-trim-current.json`.
