# Alias/barrel definition LSP test isolation

Date: 2026-10-07. Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

## RED evidence

The existing public `textDocument/definition` characterization in
`tests/semantic/semantic-characterization.test.mjs` timed out waiting for LSP
response id 4 in the full fast suite. The invocation was:

```sh
ARKLINE_HARMONY_SDK_PATH="$PWD/fixtures/semantic/arkui-language-features/sdk/openharmony" \
DEVECO_SDK_HOME="$PWD/fixtures/semantic/arkui-language-features/sdk/openharmony" \
pnpm check:fast
```

That run had 1,313 passes and one timeout. It did not reach the URI/range
assertions, so it is not evidence of a semantic mismatch. The same test then
passed in eleven isolated new-process runs (initial run plus ten repetitions),
with its original five-second `LspProcess.response()` deadline.

## Characterization-preserving change

Move the alias/barrel scenario to
`tests/semantic/definition-alias-barrel.test.mjs`, keeping the same fixture,
LSP request, response id, five-second deadline, target URI, exact UTF-16 range,
non-empty range, and source-text assertions. Its own test-file process no
longer shares the 1,800-line characterization file's test sequence. Update
the explicit fast-layer manifest and the mandatory
`definition.alias-reexport` contract evidence path. No server implementation,
timeout setting, or product latency goal changes.

## GREEN evidence and limitation

```sh
node --test tests/semantic/definition-alias-barrel.test.mjs \
  tests/test-layer-manifest.test.mjs \
  tests/semantic-contract-manifest.test.mjs
pnpm check
```

Both passed. The old characterization file shrank from 1,836 to 1,777 physical
lines; it remains above the repository's 500-line migration limit. The new
test is 79 lines. A fresh complete `pnpm check:fast` remains required before
merge, and this isolation does not prove that occasional host-load timeouts
cannot recur or that definition latency meets the product target.
