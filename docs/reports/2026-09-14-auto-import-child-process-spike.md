# Auto-import child-process isolation spike

Date: 2026-09-14. Parent revision:
`49a7a5f4ee5c112be160b32720bcb53410a32342`.

## Contract

This spike replaced each of the six existing sequential auto-import compiler batches with a distinct
Node child process. Each process received the frozen workspace/overlay snapshot, ran the official
completion and entry-details proof, flushed its IPC response, disposed the Language Service, and exited
before the next batch started. External sampling counted the complete server, semantic worker, Rust
sidecar, and active verifier child process tree; child RSS was not hidden or double-counted.

The public LSP RED required three fixture batches to use three distinct PIDs while returning all five
same-prefix candidates, both same-name/different-source candidates, exact import edits, and no resident
trim event. The prototype satisfied this contract. A large response initially exposed an IPC race:
disconnecting before the send callback lost the response. Awaiting the callback fixed the race before
the real A/B.

## Fixed Gramony A/B

- Workspace: Gramony `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- SDK: API 24 / OpenHarmony 6.1.1.125.
- Target: `features/home/src/main/ets/dao/ChatDao.ets`, prefix `Cha`, UTF-16 `43:41`.
- Six sequential batches, root limit 2, three fresh server/index processes per mode.
- Normal automatic diagnostics remained enabled; RSS was sampled externally every 100 ms.

| Mode | Completion runs | Median | Peak product RSS runs | Median |
|---|---|---:|---|---:|
| resident | 6.181 / 5.857 / 5.200 s | 5.857 s | 530,018,304 / 500,699,136 / 571,965,440 B | 530,018,304 B |
| child process | 21.116 / 19.834 / 19.990 s | 19.990 s | 592,642,048 / 603,099,136 / 602,046,464 B | 602,046,464 B |

All six runs returned the same 16 normalized completion identities and edits, including 12
discovery-backed pre-resolved items. Every run published the same 31 diagnostics with SHA-256
`96ac3039af05961adc6778ea9ba90747a66dff55f1513da529420ff4b54b166a`.

Child exit did return the process tree close to its light baseline between batches, so hard lifecycle
release worked. It did not improve the product peak: median peak increased 13.59%. Rebuilding the SDK
and compiler state six times raised median completion latency to 3.41x resident.

## Decision

Correctness: GREEN. Hard lifecycle release: GREEN. Memory and latency gates: FAILED.

The child-process implementation, environment switch, and public process-only contract were fully
withdrawn. Production source is unchanged relative to the parent revision. This route must not be
retried with more workers or hidden child RSS.

Together with the real `ChatList` façade failure, this closes the two lifecycle/partition alternatives
selected after semantic cleanup. The next RED moves back to the backend compatibility gate: API 24
annotation declaration syntax used by the fixed SDK must be added to the backend-independent semantic
contract. A failure is an `ohos-typescript`/target-SDK incompatibility result and triggers the documented
`ets2panda` fallback spike; it must not be patched with regex or ignored diagnostics.

Normalized evidence is in
[`evidence/2026-09-14-auto-import-child-process-spike.json`](evidence/2026-09-14-auto-import-child-process-spike.json).
Raw 100 ms curves remain at `/private/tmp/arkts-gramony-auto-import-batch-process-current.json`.
