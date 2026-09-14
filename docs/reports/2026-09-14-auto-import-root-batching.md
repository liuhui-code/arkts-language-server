# Auto-import root batching gate

Date: 2026-09-14. Parent server revision:
`6ac95099e0e14af232cd4a771e1a9521008bb7fe` plus the uncommitted batching slice under test.

## Contract

Ready export discovery may now partition declaration roots into stable sequential groups. Each
compiler Program contains the current document, every open overlay, and at most the configured number
of discovery roots. Results merge by official completion identity (`name + module source`), and a
later pre-resolved item replaces an earlier weaker duplicate discovered through an import closure.

The behavior is enabled only with the existing default-off discovery profile. The new
`ARKTS_AUTO_IMPORT_BATCH_ROOTS` accepts 1..128; its default is 128, preserving the previous discovery
behavior. Workspace profile and stale/partial discovery are unchanged.

The real LSP fixture proves:

- five candidates across three two-root Programs (`3/3/2` roots including the current file);
- two same-name candidates in different batches retain distinct module sources;
- an earlier batch importing a later declaration cannot downgrade its pre-resolved result;
- every candidate resolves to its exact import edit without another compiler Program.

## Fixed Gramony replay

- Workspace: Gramony `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API 24 / ETS 6.1.1.125.
- Node: v26.3.0.
- Target: `features/home/src/main/ets/dao/ChatDao.ets`.
- In-memory overlay: remove the existing `Chat` import and complete `Cha` at UTF-16 `43:41`.
- Each run used a fresh server and Rust cache, waited for catalog `ready`, retained normal automatic
  diagnostics, and sampled the server process tree externally every 100 ms.

| Root limit | Programs | Project roots per Program | Project files per Program | Completion | Peak RSS |
|---:|---:|---|---|---:|---:|
| 128 | 1 | 13 | 66 | 3.829 s | 487,632,896 B |
| 8 | 2 | 9 / 5 | 39 / 66 | 3.900 s | 518,311,936 B |
| 2 | 6 | 3 / 3 / 3 / 3 / 3 / 3 | 38 / 28 / 30 / 33 / 25 / 65 | 5.740 s | 572,743,680 B |

All runs returned the same 16 normalized `Cha*` completion identities and edits. Exactly 12 were
discovery-backed and pre-resolved in every run; the four local/global items legitimately used normal
resolve. All runs published the same 31 diagnostics with SHA-256
`96ac3039af05961adc6778ea9ba90747a66dff55f1513da529420ff4b54b166a`.

## Decision

Semantic batching correctness: GREEN. Product memory gate: FAILED. Relative to limit 128, limit 8
increased peak by 6.29%; limit 2 increased peak by 17.45% and completion time by 49.92%.

This proves root count is not the effective upper bound: one declaration root can pull a 65-file
dependency closure, and sequential Programs in the long-lived semantic worker retain enough compiler
state to increase the product peak. The smaller limit is not enabled by default. The next slice must
measure and bound actual admitted dependency closures and compiler-context lifetime; it must not tune
the root count, truncate candidates, or weaken diagnostics.

Normalized evidence is in
[`evidence/2026-09-14-auto-import-root-batching.json`](evidence/2026-09-14-auto-import-root-batching.json).
The raw 100 ms curves remain at `/private/tmp/arkts-gramony-auto-import-batches-current.json`.
