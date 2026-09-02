# D2 review hardening: reproducible Zed delivery

Parent revision: `e5697ca`

## RED → GREEN slices

1. `cargo test --locked --manifest-path editors/zed/query-validator/Cargo.toml`
   parsed representative ArkTS but failed because `@comment` and the normal
   JavaScript/TypeScript captures were absent. Vendoring the exact
   `tree-sitter-javascript` v0.23.1 highlight baseline made the capture contract
   GREEN while retaining the pinned ArkTS delta.
2. The outline fixture then failed on missing `greet`. Adding a
   `function_declaration` item made struct/function/method outline captures
   GREEN.
3. `node --test tests/zed-query-gate.test.mjs` exposed the free-floating
   manifest parser, missing commit-length validation, accepted dirty grammar
   cache, and hard-coded query list in successive REDs. The GREEN gate parses
   only `[grammars.arkts]`, verifies declared origin/HEAD and a clean worktree,
   and discovers every shipped `.scm`.
4. `node --test tests/local-delivery-config.test.mjs` observed zero frozen
   installs when `esbuild` existed even though no valid lockfile state was
   recorded. The GREEN installer uses an atomic fingerprint covering lockfile
   SHA-256, platform, architecture, Node major/module ABI, and pnpm version,
   and reruns `pnpm install --frozen-lockfile` after any change. Its WASM build
   is also locked and asserted through the public fake-toolchain test.
5. The workflow contract failed because `pnpm check:fast` was absent. The GREEN
   workflow installs a pinned Node/pnpm toolchain, performs the frozen install,
   runs the Node gate, then runs real query and locked WASM gates.

## Focused acceptance

```text
node --test tests/zed-query-gate.test.mjs tests/local-delivery-config.test.mjs
10 tests passed

./scripts/check-zed-queries.sh
2 parser/capture tests passed
validated brackets.scm, highlights.scm, indents.scm, outline.scm

cargo build --locked --target wasm32-wasip2 --release
Finished release profile
```

The first full `pnpm check:fast` run was also executed, but the shared 2-second
LSP harness timed out under concurrent first-build load. The integration branch
independently raises that existing harness timeout to five seconds; the full
gate is rerun after this branch is merged onto that revision.
