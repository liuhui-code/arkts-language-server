# Local Zed LSP spike evidence

> Historical feasibility record from the initial spike. It is superseded for
> current capabilities, delivery, and acceptance by `README.md` and
> `docs/zed-local-beta-smoke.md`.

Date: 2026-09-02

Initial repository parent: `unborn main`

ArkLine extraction source revision:
`2337ff1a5875e27b37bdd03e58ba5ca33c75afe7`

## RED -> GREEN slices

1. `npm test` failed because `dist/server.mjs` did not exist. A minimal standard
   LSP initialize handler made the transcript GREEN.
2. The focused completion transcript failed with `Expected title in []`.
   Extracting the ten-file semantic core and adapting LSP URI/UTF-16 positions
   made both `title` and `save` GREEN.
3. The focused definition transcript returned no location. Connecting
   `SemanticDocumentStore` dependency loading to the type engine made the
   target `Model.ets:2:3` (LSP `1:2`) GREEN.
4. The Zed adapter contract failed with missing `editors/zed/extension.toml`.
   The minimal local extension, pinned grammar and launch command made it
   GREEN.
5. `tsc --noEmit` reported missing Node declarations. Adding a pinned
   `@types/node` dependency and project typecheck made it GREEN.

## Final quality gate

```text
pnpm test
```

Result: TypeScript check passed, bundle succeeded, 5 tests passed and 0 failed.

The Zed WASM adapter also built successfully with:

```text
cargo build --target wasm32-wasip2 --release
```

## Real Zed smoke

Zed refreshed its extension index with `arkts` version `0.0.1`, registered the
`.ets` matcher, and launched this exact process:

```text
/usr/local/bin/node <repository>/dist/server.cjs --stdio
```

macOS denied automated Control-Space input through `osascript`, so the visual
popup was not machine-driven. The same built executable's completion and
definition behavior is covered by the byte-level stdio contracts.

## Decision

At the time of this spike, the local standalone LSP architecture was feasible
but the persistent Rust index was not yet proven. That limitation is historical:
the Local Beta now ships and acceptance-tests the persistent index and
`workspace/symbol` path.

## PR-0 contract freeze

Parent revision: `d5fdfb7e96b9a74421c84f5d92cdf7d8169aa847`

This was a behavior-preserving refactor protected by the existing real-process
LSP characterization suite. `pnpm test` passed 5/5 before the refactor and
`pnpm check:fast` passed 5/5 after extracting contracts, project resolution,
the legacy semantic adapter, LSP composition, and the shared transcript
harness.
