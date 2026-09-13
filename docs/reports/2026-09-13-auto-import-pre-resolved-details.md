# Auto-import pre-resolved details slice

Date: 2026-09-13. This report follows the bounded auto-import resolve-root slice. It closes the
observed second compiler preparation for a ready discovery-backed completion item. The behavior is
still default-off and does not change the release gate.

## RED and cause

Parent revision: `7935091a48aea7e7ae1b67fffb5002823366e9c8`. The public child-process LSP RED
required a ready discovery-backed `completionItem/resolve` to produce the exact existing edit with
zero `completion.resolve.program.complete` events. The parent emitted one event.

The cause was duplicate work, not an intrinsically slow two-root Program. Candidate validation in
the completion request already called official `ohos-typescript getCompletionEntryDetails()`, but
the serializable detail/documentation/edit was discarded. Resolve prepared compiler state and
called the same API again. Normal automatic diagnostics could run between the two requests and
change the active Program, making the second preparation particularly visible.

## Implementation contract

Only a ready, discovery-backed completion under the default-off `discovery` profile records a
pre-resolved value. It contains strings, ranges and current-document edits, never `Program`, AST or
`ts.Symbol` objects. The LSP adapter continues to expose only `arktsCompletionId`; the payload stays
in the server-owned resolution record.

The semantic proxy returns this value only when the document version still matches and every edit
targets that same document/version. Otherwise it removes the private payload and uses the existing
worker resolve path. Missing/stale discovery records no value and retains the full-workspace
fallback. The production default `workspace` neither consumes nor forwards the private value.

The 5,000-export child-process contract is GREEN:

- ready completion records one pre-resolved item and exact resolve emits zero compiler events;
- stale completion records zero pre-resolved items and exact resolve emits one 25-root event;
- the client item data remains the single opaque UUID field;
- the exact `ManyExports` additional edit is unchanged.

## Fixed Photos replay

OpenHarmony `applications_photos` stayed at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`; SDK stayed API 24 / ETS 6.1.1.125. The
fresh-process workflow waited for `index.catalog.terminal=ready`, kept automatic diagnostics, and
used the same `ConflictContent` overlay at UTF-16 `318:41`.

| Profile | Program files | Project roots | Completion RSS | Completion | Resolve | Resolve compiler events | Workflow peak |
|---|---:|---:|---:|---:|---:|---:|---:|
| workspace | 1,928 | 1,246 | 743,702,528 B | 15.915 s | 1.266 s | 1 | 814,252,032 B |
| discovery | 772 | 2 | 468,336,640 B | 11.527 s | 4.09 ms | 0 | 585,510,912 B |

Completion, resolved detail/range/edit and the 90-diagnostic fingerprint are exact. In this one A/B,
completion RSS fell 37.03%, completion latency fell 27.57%, resolve latency fell 99.68%, and the
externally sampled product peak fell 28.09%.

The former 4.10x discovery resolve regression is therefore closed for this reproducer. The overall
30% memory prototype threshold is still missed by 1.91 percentage points, the result is one noisy
A/B rather than a distribution, and other real projects are not yet covered. The profile remains
default-off.

Normalized evidence is committed in
[`evidence/2026-09-13-photos-auto-import-pre-resolved.json`](evidence/2026-09-13-photos-auto-import-pre-resolved.json).
The raw report remains `/private/tmp/arkts-real-auto-import-resolve-ab.json`.

## Next gate

Run the same ready auto-import completion/resolve contract on Gramony, ChatCube and RemoteDesk, then
repeat Photos in independent processes. Exact completion/edit/diagnostics and zero ready resolve
compiler events are hard gates. If those pass, investigate the remaining product peak in normal
diagnostics and the completeness model for ambient/global contributors before considering any
default change.
