# C1 headless workspace-symbol index: TDD evidence

Parent revision: `a4da5556b7f233abee00b152356ab477dba76f31`

## Scope and public boundary

This tracer bullet adds a headless, in-memory Rust crate. `WorkspaceIndex`
accepts changed and removed document snapshots, parses ArkTS workspace symbols,
and delegates document replacement and search to `SymbolStore`. `MemoryStore`
is the spike implementation; a later persistent store can implement the same
three-method boundary without coupling the parser or callers to SQLite.

The returned symbol contract contains URI, kind, optional container, and a
zero-based UTF-16 name range. The parser intentionally covers only the C1
symbols (`class`, `struct`, declared `function`, and direct class/struct
methods). Persistence, sidecar transport, interfaces, enums, variables, and
arrow functions remain out of scope.

## RED/GREEN cycles

### 1. Refresh two ArkTS documents and query their symbols

RED:

```text
cargo test -p arkts-index-core --test workspace_symbols -- refreshes_arkts_documents_and_searches_workspace_symbols
```

Exit 101: the integration test could not import `Document`, `Position`,
`SymbolKind`, `TextRange`, or `WorkspaceIndex` from the empty public crate.

GREEN: the same command passed `1 passed; 0 failed`. The test covers class,
struct, function, and method kinds; URI and container names; and name ranges.
The `greet` declaration has an emoji before its name on the same line, so its
expected character 11 proves UTF-16 code-unit counting rather than byte or
Unicode-scalar counting.

### 2. Prefer prefix results to substring results

RED:

```text
cargo test -p arkts-index-core --test workspace_symbols -- ranks_prefix_symbol_matches_before_substring_matches
```

Exit 101: the result was `["DomainMain", "MainPanel"]`, placing a substring
match before the expected prefix match.

GREEN: the same command passed after adding exact/prefix-aware ranking.

### 3. Camel-case acronym lookup

RED:

```text
cargo test -p arkts-index-core --test workspace_symbols -- finds_camel_case_symbols_by_acronym
```

Exit 101: query `MP` returned zero results for `MainPage`.

GREEN: the same command passed after adding acronym matching below exact and
prefix matches, but above substring matches.

### 4. Isolate a malformed document

RED:

```text
cargo test -p arkts-index-core --test workspace_symbols -- rejects_one_malformed_document_without_failing_the_refresh_batch
```

Exit 101: both documents were reported indexed (`2` instead of `1`), and the
malformed document exposed partial symbols.

GREEN: the same command passed after making tokenization/parsing fallible.
Unclosed quotes/comments and unbalanced braces reject only that document; its
snapshot is removed while healthy documents in the batch are committed.

## Final verification

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release -p arkts-index-core
cargo tree --workspace
pnpm check:fast
```

Results:

- Rust integration tests: `4 passed; 0 failed`.
- Clippy: no warnings.
- Release build: passed.
- Dependency tree contains only `arkts-index-core`; there is no Tauri,
  `rusqlite`, or ArkLine schema dependency.
- Existing language-server/Zed gate: `5 passed; 0 failed`.
- The first `pnpm check:fast` attempt stopped before tests because this new
  worktree had no `node_modules` (`tsc: command not found`). After
  `pnpm install --offline --frozen-lockfile`, the unchanged command passed.
