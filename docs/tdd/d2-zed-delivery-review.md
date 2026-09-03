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

The first full `pnpm check:fast` run timed out under concurrent first-build
load with the old 2-second LSP harness. The integrated five-second harness and
serialized suites now pass the complete gate; this historical failure is kept
as the RED evidence.

## Real-Zed stale grammar regression

An isolated Zed Preview 1.19.0 run exposed a boundary the native query compiler
could not cover. Zed loaded an ignored `grammars/arkts.wasm` left by an older
development-extension build; it predated the current manifest and failed to
compile `highlights.scm` with `Invalid node type "property_identifier"`. The
same query correctly compiled against the pinned source grammar, proving the
fault was stale generated state rather than the shipped query.

The installer now records the exact grammar repository and revision beside
Zed's generated WASM. An absent or changed source stamp invalidates that one
generated artifact; repeated installs with the same identity preserve it. The
installer also prints the required `zed: install dev extension` action and
extension directory, because Zed owns grammar compilation and exposes no local
extension-install CLI.

TDD command:

```text
node --test --test-name-pattern="dependency fingerprint" tests/local-delivery-config.test.mjs
```

RED: an unproven stale grammar survived installation and no Zed reinstall step
was shown. GREEN: first install and revision changes invalidate the artifact,
same-revision installs preserve it, the atomic source stamp advances, and the
user-facing command is explicit. The portable installer suite remained 3/3.
