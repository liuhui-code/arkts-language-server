# Backend Cutover — Official production semantic owner

Parent revision: `4d0f95d5df6d93d161dbc3e0bfedcbc50933602e` (PR #15 merge).
Branch: `codex/backend-cutover-contract`.

## RED

The first production-ownership contract failed because the package still resolved vanilla
`typescript@5.9.2` instead of the locked official frontend:

```text
production composition has one locked official semantic backend and no virtual rewrite
actual: typescript: 5.9.2
expected: typescript: npm:ohos-typescript@4.9.5-r4
```

After the package alias was switched, `pnpm check` exposed the expected TypeScript 4.9 API boundary
differences. The first focused production run passed 34/37 scenarios; the remaining failures covered
the old virtual-rewrite assertion, completion commit characters, and CRLF/absolute auto-import edits.

The first complete `pnpm check:fast` run then provided the backend-independent regression baseline:

```text
tests 854
pass 823
fail 31
```

Those failures identified official ETS adapter gaps rather than permission to restore the legacy
parser: `.ets` module-resolution extensions, official struct name spans and call hierarchy prepare,
ArkUI loader options, local struct-member ranking, SDK-version diagnostic codes, and ETS formatting.

## GREEN

Production now resolves `typescript` to the locked `ohos-typescript@4.9.5-r4` package. One
backend-neutral factory constructs exactly one `OhosTypeScriptSemanticEngine`; production composition
and the default LSP runtime no longer instantiate `LegacySemanticEngine` directly. The engine consumes
the selected Zed/project SDK, loads its bounded ETS loader options, uses `ScriptKind.ETS`, and obtains
its `DocumentRegistry` from the shared official registry pool.

`src/core/virtual/arkts-virtual-document.ts` and its semantic rewrite path were deleted. Source and
generated coordinates are now identical. Official AST/checker results remain authoritative; narrow
adapter normalization handles frontend result-shape differences:

- official struct AST nodes repair zero-length definition spans and prepare call hierarchy items;
- local members already returned by the official completion provider are promoted ahead of the
  provider limit for `this.` inside a struct;
- official SDK component identities (`ColumnAttribute`, `TextAttribute`) replace legacy fixture names;
- the ETS formatter suppresses only the official formatter's synthetic indentation before a decorated
  top-level `struct`, identified from the official AST;
- the official 4.9 excess-property diagnostic code `2322` replaces vanilla 5.9 code `2353` in the SDK
  refresh contract.

No regex-based ETS parser or second semantic backend was introduced.

Focused verification:

```text
tests/ohos-typescript-spike.test.mjs + lifecycle + formatting: 17/17 passed
tests/semantic/local-package-resolution.test.mjs: 25/25 passed
tests/semantic/project-sdk-selection.test.mjs: 20/20 passed
call hierarchy / lifecycle / watcher group: 70/71 initially; final stale-overlay case passed
```

Complete fast verification:

```text
pnpm check:fast
tests 854
pass 854
fail/cancel/skip/todo 0
duration 496,735.85 ms
```

`pnpm check:release` and canonical GitHub validation are recorded after the branch is committed and
the clean release gate completes.

## Reproduction

```bash
pnpm check
node --test tests/ohos-typescript-spike.test.mjs
node --test tests/semantic/local-package-resolution.test.mjs
node --test tests/semantic/project-sdk-selection.test.mjs
pnpm check:fast
git diff --check
```
