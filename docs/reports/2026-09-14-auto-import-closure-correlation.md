# Auto-import dependency-closure correlation

Date: 2026-09-14. Parent revision:
`d51ffa1d07142c53130284b68d743d0426edac36`.

## Observability contract

When the existing default-off `ARKTS_REFERENCES_TRACE=1` is active, every batched auto-import
`completion.program.complete` event now includes:

- zero-based batch index and total batch count;
- admitted discovery root and candidate counts;
- one 16-hex SHA-256 prefix per workspace-relative discovery-root path.

The trace does not contain source text or absolute candidate paths. The fingerprint is deterministic,
so a local operator with the same fixed workspace can correlate a compiler Program with its input
roots. With tracing disabled, this slice adds no logging and changes no semantic behavior.

## Public LSP proof

The five-candidate child-process fixture asserts three batch events with indices `0/1/2`, total count
`3`, root/candidate counts `2/2/1`, and exact fingerprints derived independently in the test from the
fixture's workspace-relative paths. Existing assertions continue to require all candidate identities,
same-name/different-source separation, exact import edits, and zero discovery-backed resolve Programs.

## Fixed Gramony result

The fixed `ChatDao.ets` / `Cha` replay was repeated with one discovery root per Program. All 16 visible
completion identities and edits were preserved, all 12 discovery candidates were pre-resolved, and the
same 31 diagnostics were published with SHA-256
`96ac3039af05961adc6778ea9ba90747a66dff55f1513da529420ff4b54b166a`.

| Root fingerprint | Workspace-relative declaration | Project files |
|---|---|---:|
| `2231bada862b2406` | `features/home/src/main/ets/entities/Chat.ets` | 23 |
| `b10fe5c91fca4909` | `features/home/src/main/ets/pages/Chat/ChatDetail.ets` | 38 |
| `319bf49d95021a6b` | `features/home/src/main/ets/viewmodel/Chat/ChatDataSource.ets` | 24 |
| `3d5b6f34178e6229` | `features/home/src/main/ets/viewmodel/Chat/ChatPhotoNodeController.ets` | 26 |
| `58fade6a7cc43915` | `features/home/src/main/ets/views/Chat/ChatDetailBottom.ets` | 30 |
| `f16ba70130eff3d6` | `features/home/src/main/ets/views/Chat/ChatDetailBottomMediaSheet.ets` | 29 |
| `329d1b249fff3237` | `features/home/src/main/ets/views/Chat/ChatDetailBottomPhotoPicker.ets` | 23 |
| `556f647a040b88a2` | `features/home/src/main/ets/views/Chat/ChatDetailItem.ets` | 32 |
| `f50d828305b69112` | `features/home/src/main/ets/views/Chat/ChatDetailNone.ets` | 23 |
| `51ed7b000db68d86` | `features/home/src/main/ets/views/Chat/ChatDetailTopSearch.ets` | 24 |
| `85212319af6ae3c7` | `features/home/src/main/ets/views/Chat/ChatItem.ets` | 29 |
| `5f6c6fe935e198fb` | `features/home/src/main/ets/views/Chat/ChatList.ets` | **65** |

The one-root run completed in 8.300 seconds and peaked at 576,696,320 bytes. It is diagnostic evidence,
not an optimization result.

## Conclusion

The previous final two-root Program reached 65 project files because `ChatList.ets` alone has a
65-file compiler dependency closure; the paired `ChatItem.ets` alone reaches only 29. `ChatList.ets`
imports `ChatItem`, `ChatViewModel`, `HomeTopSearch`, and `../../../../../Index`, so this is a real
feature dependency closure rather than an accidental extra root.

This rejects root cardinality as the effective bound. The next experiment must operate on compiler
lifecycle state between batches, while preserving every legal dependency in the 65-file closure. If
backend semantic cleanup cannot stop sequential retention, the next architectural choices are a true
child process or declaration façade—not a smaller root constant.

Normalized evidence is in
[`evidence/2026-09-14-auto-import-closure-correlation.json`](evidence/2026-09-14-auto-import-closure-correlation.json).
Raw curves are retained at `/private/tmp/arkts-gramony-auto-import-batches-limit-1.json`.
