# E0c — P0 feature-evidence audit

Date: 2026-09-03

Parent revision: `503b758be9332bf22cc1e6b818a55348f87ce8fc`

## Scope

This audit checks that the completed P0 slices below are represented by
machine-readable evidence and that one exact test cannot be relabeled as
multiple independent claims within the same feature and evidence layer.

- [x] R4 references changed-overlay behavior.
- [x] N5a rename same-scope conflict rejection sub-item.
- [x] W1 production workspace-symbol kind/range fidelity.
- [x] W1b immutable installed workspace-symbol index/kind/URI/name-range
  fidelity.
- [x] Exclude uncommitted ArkUI work and the N5b installed rename
  semantic-recheck sub-item.

## Evidence bindings

| Slice | Layer | Exact executable evidence | Stable claim |
| --- | --- | --- | --- |
| R4 | bundle-e2e | `tests/semantic/references-depth.test.mjs` — `uses only changed overlay references for both declaration policies` | `references.bundle.changed-overlay` |
| N5a conflict sub-item | bundle-e2e | `tests/semantic/rename-completeness.test.mjs` — `rejects rename when the target name already exists in the same scope` | `rename.bundle.same-scope-conflict` |
| W1 | bundle-e2e | `tests/semantic/workspace-symbol-production.test.mjs` — `returns every production overlay workspace-symbol kind with exact UTF-16 name ranges` | `workspace-symbol.bundle.production-full-kinds` |
| W1b | artifact-e2e | `tests/release/portable-install.acceptance.mjs` — `installs one verified artifact without source dependencies or a rebuild` | `workspace-symbol.artifact.immutable-index-kind-uri-name-range` |

The validator already requires a normalized repository path, the declared
test layer, one exact static `node:test` title, and a unique feature-scoped
stable claim. This slice also rejects a second claim using the same
feature/layer/path/test locator. W1b therefore exposes one honest combined
claim instead of minting separate `immutable-index` and
`immutable-kind-range` claims from the same transcript.

This audit does not mark the overall N5 lane complete: the separately owned
N5b installed semantic recheck was not committed at the audited parent and is
not registered by this change.

## RED

The regression first cloned the existing completion protocol locator and gave
the clone a different valid claim. The old validator accepted it.

```text
node --test tests/lsp-feature-matrix.test.mjs
# 11 passed, 1 failed
AssertionError: Missing expected exception.
```

After adding the locator guard, the current matrix itself exposed the real W1b
duplication:

```text
Invalid LSP feature evidence matrix:
- workspace-symbol: artifact evidence reuses tests/release/portable-install.acceptance.mjs#"installs one verified artifact without source dependencies or a rebuild" for multiple claims
```

## Minimal GREEN

The validator now tracks `(feature, layer, entry, exact test)` locators and
rejects reuse. The two W1b labels were replaced by one combined claim matching
the single installed transcript's observable coverage.

```text
node --test tests/lsp-feature-matrix.test.mjs
# 12 passed, 0 failed, 0 skipped
```

## Remaining evidence risk

The portable-install acceptance is intentionally one broad artifact test used
by several features. An exact path and test title proves that the transcript
exists, but cannot by itself prove which assertions inside the imported
semantic helper executed. Closing that cross-feature risk needs a structured
`verifiedClaims` result from the installed helper and an outer acceptance
assertion against the matrix's required artifact claims. Those files are owned
by a separate task, so this slice records the boundary rather than changing or
claiming it.
