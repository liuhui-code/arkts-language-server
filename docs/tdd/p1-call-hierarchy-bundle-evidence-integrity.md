# P1 Call Hierarchy bundle-evidence integrity

Date: 2026-09-06

## Defect

The Call Hierarchy feature matrix attributed three `bundle-e2e` claims to tests
that bundled and called `CallHierarchySourceAuthority` or
`SemanticRequestRunner` directly. Those tests are valuable unit contracts, but
they do not prove that the production LSP registration connects raw-work
preflight and result-source authority to Content-Length stdio requests. A
reviewer confirmed the weakness by moving `dist/server.cjs` aside: all three
claimed tests still passed.

This slice keeps those unit contracts and replaces only their matrix evidence
with public protocol observations. It changes no production code.

## Parent revision

The first RED was observed while the shared branch HEAD was:

```text
8ed16a3 fix(workspace): retain removal delta across cancellation
```

Other agents subsequently advanced the shared branch. Their changes were
preserved.

## RED -> GREEN

### 1. Raw-work preflight wiring

The matrix first named the missing public transcript:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

RED: `14` passed and `1` failed because
`rejects raw call work before result-source validation through production
registration stdio` did not exist.

The new test bundles the real `runLanguageServer` composition with a
deterministic semantic-engine test seam, then communicates only through
`LspProcess` Content-Length frames. The seam returns 257 duplicate raw edges to
a missing result source. The response is `result-limit-exceeded`, not
`source-unavailable`. That externally distinguishable error proves the
production registration runs its raw edge budget before result-source
filesystem validation. It also avoids a false positive from the Legacy
TypeScript layer, which independently has an equivalent 256-edge limit.

GREEN:

```sh
node --test --test-name-pattern='rejects raw call work before result-source validation through production registration stdio' tests/lsp-call-hierarchy.test.mjs
# 1 pass, 0 fail, 35 skipped
```

Matrix claim:

```text
call-hierarchy.bundle.stdio-production-wiring-raw-work-preflight-before-source-validation
```

### 2. Physical result-source validation

The matrix then named a precise public behavior instead of the previous broad
private-authority claim.

```sh
node --test --test-name-pattern='maps the complete public capability contract' tests/lsp-feature-matrix.test.mjs
```

RED: `1` failed because
`rejects a physically escaped result source through production registration
stdio` did not yet exist.

The GREEN test uses the full production registration with a deterministic
semantic-engine seam. The seam returns a complete result whose URI is lexically
inside the workspace and whose fingerprint matches the target bytes, while its
source symlink resolves physically outside the root. The stdio request fails
with `source-outside-workspace`. If registration omitted `resultItems` or the
runner bypassed result-source authority, the LSP adapter would accept the
lexically in-root item and leak a successful response.

GREEN:

```sh
node --test --test-name-pattern='rejects a physically escaped result source through production registration stdio' tests/lsp-call-hierarchy.test.mjs
# 1 pass, 0 fail, 35 skipped
```

Matrix claim:

```text
call-hierarchy.bundle.stdio-production-wiring-physical-result-source-validation
```

The former `physical-root-open-source-identity` wording was intentionally
removed: a single private-authority test cannot stand in for production stdio
wiring, and the replacement claim does not imply more than it observes.

### 3. Aggregate result-source budget wiring

The matrix first named another missing public transcript.

```sh
node --test --test-name-pattern='maps the complete public capability contract' tests/lsp-feature-matrix.test.mjs
```

RED: `1` failed because
`enforces aggregate result-source bytes through production registration stdio`
did not exist.

The GREEN test bundles the real `runLanguageServer` composition with a
deterministic semantic-engine test seam, then communicates only through
`LspProcess` Content-Length frames. Four distinct 4 MiB result sources are
accepted at the exact 16 MiB boundary. Adding one byte in a fifth source fails
the whole request with `result-limit-exceeded`. This proves production
registration -> `SemanticRequestRunner` -> result-source authority wiring while
keeping the semantic fixture deterministic. It is bundle evidence, not a claim
about immutable installed bytes; the separate artifact tracer remains the
artifact-level gate.

GREEN:

```sh
node --test --test-name-pattern='enforces aggregate result-source bytes through production registration stdio' tests/lsp-call-hierarchy.test.mjs
# 1 pass, 0 fail, 35 skipped
```

Matrix claim:

```text
call-hierarchy.bundle.stdio-production-wiring-aggregate-result-source-budget
```

## Evidence boundary

- The matrix no longer promotes private-module tests as bundle evidence.
- Raw-work ordering, physical validation, and aggregate accounting execute the
  production transport, request runner, registration, and authority with only
  the semantic result producer replaced.
- Immutable package composition remains covered solely by
  `call-hierarchy.artifact.immutable-prepare-outgoing-incoming-unopened-utf16`.

## Final verification

```sh
node --test --test-concurrency=1 --test-reporter=dot \
  tests/lsp-call-hierarchy.test.mjs \
  tests/lsp-feature-matrix.test.mjs
# 51 pass, 0 fail

pnpm check
# GREEN: tsc --noEmit -p tsconfig.json

pnpm build
# GREEN: dist/server.cjs (10.2 MB reported by esbuild)

node --test \
  --test-name-pattern='rejects raw call work|rejects a physically escaped|enforces aggregate result-source bytes' \
  tests/lsp-call-hierarchy.test.mjs
# 3 pass, 0 fail, 33 skipped

node --test tests/lsp-feature-matrix.test.mjs
# 15 pass, 0 fail
```
