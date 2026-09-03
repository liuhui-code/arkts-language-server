# W1b installed workspace-symbol fidelity

Date: 2026-09-03

Parent revision: `1d9302d66daccef5ffe8e4dae7b43ea535a5828e`

## Scope and public boundary

The portable-install acceptance builds one immutable artifact from the verified
runtime bytes, installs that artifact into a temporary prefix, and starts the
installed `arkts-language-server --stdio` command from an external working
directory. The semantic smoke reuses the conformance `ArkuiPage.ets` document;
it does not add a second corpus or a scripted semantic substitute.

After opening `ArkuiPage.ets`, the transcript sends three independent
`workspace/symbol` requests and compares the installed command's complete
`SymbolInformation` values with the materialized fixture markers:

| Declaration | LSP kind | Required location |
| --- | ---: | --- |
| `struct ArkuiPage` | 23 (`Struct`) | ArkuiPage URI and exact name range |
| property `title` | 7 (`Property`) | ArkuiPage URI and exact name range |
| method `build` | 6 (`Method`) | ArkuiPage URI and exact name range |

The `title` marker follows a non-BMP emoji, so its exact range also protects
the negotiated UTF-16 position contract.

## Stable RED: installed helper had no fidelity evidence

The acceptance first required the installed semantic helper to return its
actual and expected workspace-symbol transcript. The existing helper returned
no evidence because it only checked the `Greeter` name/URI/range lifecycle and
discarded `kind`; its ArkUI assertions exercised only
`textDocument/documentSymbol`.

RED command:

```text
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
```

Stable failure:

```text
0 passed, 1 failed, 3 skipped
AssertionError: installed smoke must expose workspace-symbol kind, URI, and name-range evidence
```

## Minimal GREEN

The helper now queries each exact ArkUI name through the installed LSP command,
keeps only the matching URI/name result, and returns the full name, kind, URI,
and range transcript. The artifact acceptance performs the exact deep
comparison. Existing callers may ignore the returned evidence, so no launcher,
server, corpus, package, manifest, or feature-matrix contract changes.

Focused GREEN:

```text
node --test --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' tests/release/portable-install.acceptance.mjs
# 1 passed, 0 failed, 3 skipped
```

Full immutable-artifact regression:

```text
node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped
```

## Deliberate boundaries

- This slice does not add installed rename coverage.
- It does not advertise or implement `workspaceSymbol/resolve`; W1c already
  records why bounded complete Locations are retained.
- It does not duplicate the production all-kinds fixture. W1a owns exhaustive
  kind coverage; W1b closes only the immutable installed-artifact boundary.
