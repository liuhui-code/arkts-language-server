# P1 Call Hierarchy capability and immutable-artifact evidence

Date: 2026-09-06

## Scope

This slice makes the correctness-complete Legacy Call Hierarchy discoverable
through `callHierarchyProvider: true` only after binding the public capability
to protocol, production-bundle, and immutable installed-artifact evidence.

The installed tracer materializes its own conformance workspace and traverses:

1. `textDocument/prepareCallHierarchy` for an opened caller;
2. `callHierarchy/outgoingCalls` to an unopened target function;
3. `textDocument/didClose` for the caller;
4. `callHierarchy/incomingCalls` from the target back to that now-unopened
   caller.

It compares the complete declaration ranges, selection ranges, and both call
site ranges against corpus markers. Emoji before each selection and call site
proves that the compared character offsets are UTF-16 code units. No fixture
under `fixtures/basic` is reachable from the artifact test.

## Parent revision

The first artifact RED was observed from parent revision:

```text
8f8caa1 test(call-hierarchy): prove request lifecycle reliability
```

Other agents advanced the shared branch during this slice. Their files and
commits were preserved.

## RED -> GREEN record

### 1. Immutable installed artifact

The artifact-first tracer, capability assertion, and unique verified claim were
added before the production capability changed.

```sh
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
```

RED:

```text
tests 4, pass 0, fail 1, skipped 3
Expected values to be strictly equal:
actual: undefined
expected: true
```

The failure was the installed server's missing `callHierarchyProvider`, before
any Call Hierarchy request ran.

After the one-line production capability change, the same immutable installation
test reached the full tracer. Its first run exposed an inaccurate fixture
declaration marker (`character: 9` expected versus the compiler's full
comment-inclusive declaration at `character: 0`). Moving the marker to the
actual declaration boundary made the public expectation precise without
changing production behavior.

GREEN:

```text
tests 4, pass 1, fail 0, skipped 3
```

The smoke now returns exactly one new claim:

```text
call-hierarchy.artifact.immutable-prepare-outgoing-incoming-unopened-utf16
```

`assertExactVerifiedArtifactClaims` binds it to the same immutable-artifact
test in the feature matrix and rejects missing, extra, or duplicate claims.

### 2. Public capability contract

The exact capability contract required the provider before production changed.

```sh
node --test tests/lsp-capability-contract.test.mjs
```

RED:

```text
tests 7, pass 6, fail 1
LSP capability contract mismatch:
- callHierarchyProvider: missing; expected true
```

Minimal production GREEN added only `callHierarchyProvider: true` to the
existing semantic capability registration. All three former withholding
assertions in the real Call Hierarchy bundle suite now require `true`.

```text
tests 7, pass 7, fail 0
```

### 3. Executable evidence matrix

The enabled matrix row names exact tests and unique stable claims for:

- seven cancellation, freshness, and shutdown protocol cases from revision
  `8f8caa1`;
- real production stdio prepare/outgoing and unopened incoming traversal;
- physical root/open-source identity enforcement;
- raw-work preflight and aggregate exact-source byte budgets;
- the installed immutable-artifact tracer above.

The first focused matrix execution correctly rejected the new protocol file
because its separately owned layer-manifest registration was not yet present:

```sh
node --test tests/lsp-feature-matrix.test.mjs
```

```text
tests 15, pass 14, fail 1
tests/lsp-call-hierarchy-reliability.test.mjs is unclassified, expected protocol
```

This is an explicit integration dependency, not weakened evidence: the matrix
continues to fail closed until the integration slice classifies that test as
protocol evidence.

Integration commit `650681f` subsequently registered the reliability file in
the protocol layer. The unchanged matrix then passed in full:

```text
tests 15, pass 15, fail 0
```

## Focused GREEN evidence

```sh
pnpm build
# GREEN: dist/server.cjs (10.2 MB reported by esbuild)

pnpm check
# GREEN: tsc --noEmit -p tsconfig.json

node --test tests/conformance-scenario.test.mjs
# GREEN: 3 pass, 0 fail

node --test tests/lsp-feature-matrix.test.mjs
# GREEN: 15 pass, 0 fail

node --test tests/lsp-call-hierarchy-reliability.test.mjs
# GREEN: 7 pass, 0 fail

node --test tests/lsp-call-hierarchy.test.mjs
# GREEN: 34 pass, 0 fail

node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
# GREEN: 1 pass, 0 fail, 3 skipped

node --test tests/release/portable-install.acceptance.mjs
# GREEN: 4 pass, 0 fail

pnpm check:fast
# GREEN: 557 pass, 0 fail, 0 skipped, 0 todo
```

This aggregate gate was rerun from integrated HEAD `650681f` after the
cross-root watched-create fix (`5f960fd`) and layer registration landed.

## Honest known gaps

- Incoming call discovery performs a correctness-first `O(project)` membership
  and content refresh for each request. This slice does not claim the pending
  watched-create/nested-root optimization is complete.
- TypeScript Call Hierarchy queries still run synchronously on the stdio process;
  cancellation cannot preempt work from inside the compiler query. Moving that
  work behind the supervised semantic worker remains a separate performance and
  isolation slice.

Neither gap is hidden behind a worker prerequisite: the current Legacy path is
enabled because its public correctness, lifecycle, bounds, and installed bytes
are executable and fail closed.
