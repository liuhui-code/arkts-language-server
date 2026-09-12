# References locked-SDK external-terminal report

Date: 2026-09-12  
Parent revision: `3269b0b92497cefd2716a7084d1a2f8d0c2eb0ce`  
Branch: `codex/reference-sdk-identity`

## Outcome

The SDK external-terminal vertical slice is GREEN at Rust store, sidecar protocol, TypeScript
adapter, and real child-process LSP boundaries. It is not yet a large-Photos performance result.
The production default remains `legacy`.

The public LSP fixture proves all of the following in one transcript:

- the environment SDK is missing while Zed-compatible `initializationOptions.sdk.path` selects the
  valid SDK;
- an unrelated same-name `@ohos.example` import is classified as an external terminal;
- compiler candidates fall from five to four;
- `resolvedBindings=1` and `unresolvedSdkBindings=0`;
- indexed and conservative normalized Location sets are exactly equal.

The terminal identity is opaque (`sdk:` plus 64 lowercase hexadecimal characters). It is accepted
only for an identified SDK declaration whose canonical file is physically contained by the selected
canonical SDK root. It is never represented as a workspace URI or returned in target identity URIs.

## TDD record

Public RED:

```bash
pnpm build
node --test --test-name-pattern='locked SDK module as an external terminal' \
  tests/semantic/references-batching.test.mjs
```

Before implementation the trace reported `compiler-definition`, five candidates,
`resolvedBindings=0`, and `unresolvedSdkBindings=1`.

Protocol RED:

```bash
cargo test -p arkts-index-sidecar --test ndjson_protocol \
  sidecar_classifies_an_external_sdk_terminal_without_admitting_its_occurrences -- --exact
```

The sidecar rejected the request because only `resolvedSourceUri` was supported.

Focused GREEN covered malformed identities, conflicting duplicate terminals, both store
implementations, custom editor SDK selection, candidate reduction, and exact LSP results.

## Fixed Photos replay

Environment:

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24
Node:      20.19.5
target:    common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets
symbol:    PhotoAsset
position:  82:26 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Three independent new processes completed the 1,794-file catalog and compiler anchor. In every
run, the first `references/candidates` request exceeded the unchanged 15-second sidecar timeout
before the SDK resolution overlay could be built:

| Run | Anchor duration | First index result | Conservative fallback |
|---|---:|---|---|
| 1 | 17.209 s | timeout at 15 s | 1,246 candidates, 20 batches |
| 2 | 16.655 s | timeout at 15 s | 1,246 candidates, 20 batches |
| 3 | 15.960 s | timeout at 15 s | 1,246 candidates, 20 batches |

Each harness then reached only six completed batches before its 180-second request limit. There was
no OOM, but there was also no references response, so no Location or RSS value is reported as a
successful measurement. Failed-run temporary caches (about 2.2 GB total) were deleted after
inspection; the fixed checkout and prior successful oracle reports remain.

Status: **environment/time-limit blocked for this real large-project gate**. The failure is stable
and fail-conservative. It must not be used to claim that the SDK terminal reduced Photos memory or
candidates.

## Next gate

The next slice is the existing-index performance boundary exposed by this replay: make the first
million-occurrence identity query complete reliably inside the product's existing 15-second limit,
without changing timeout, semantic results, worker count, diagnostics, or default strategy. Then
rerun the same `PhotoAsset` oracle so the actual 229 SDK bindings and compiler candidate reduction
can be measured.
