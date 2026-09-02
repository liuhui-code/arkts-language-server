# D2.4: pinned Zed grammar and query gate

Parent revision: `2afa7f7`

## Validator boundary

Zed's official `zed-extension` validator is currently published by its own CI
for `x86_64-unknown-linux-gnu`, not for this macOS development host. Its source
validates language queries with `tree_sitter::Query::new` after building the
pinned grammar.

The local gate implements that same semantic boundary rather than checking
query text with regular expressions:

- `scripts/check-zed-queries.sh` shallow-fetches the exact grammar revision
  from `extension.toml` without fetching its unrelated sample-project
  submodule and verifies the checkout HEAD;
- the small, lockfile-pinned native validator compiles that revision's
  `parser.c` and calls `tree_sitter::Query::new` for every shipped Zed query;
- CI runs this source-based validator and the extension's locked WASM build.

An unverified prebuilt `zed-extension` executable is deliberately not
downloaded or executed by this repository's CI.

## Highlights RED → GREEN

RED against grammar revision
`a16e9d2d5c63a1cd02aa5edd4c4b2309f4da16fa`:

```text
scripts/check-zed-queries.sh
highlights.scm does not compile: Query error at 49:4. Invalid node type build
```

The prior query targeted nodes from a different ArkTS grammar. The minimal
GREEN replaced it with the pinned grammar's maintained ArkTS highlighting
baseline:

```text
validated .../languages/arkts/highlights.scm
```

## Editor query slices

Each query was added to the public gate before its implementation. The RED for
`outline.scm`, then `indents.scm`, then `brackets.scm` was a missing query file;
each subsequent GREEN compiled all queries accumulated so far against the real
grammar.

Final query gate:

```text
validated .../highlights.scm
validated .../outline.scm
validated .../indents.scm
validated .../brackets.scm
```

The review-hardened gate no longer names those four files. It discovers every
shipped `.scm` recursively, so a future Zed query cannot bypass compilation.
It also runs capture-level parser tests before compiling all discovered files.

The manifest parser reads `repository` and `rev` only from the exact
`[grammars.arkts]` table. Before compilation, the cache must match that declared
origin and revision and have no modified or untracked files. This prevents a
matching `HEAD` from masking locally changed `parser.c` or `scanner.c` inputs.
Repository URLs are compared canonically so the conventional trailing `.git`
suffix used by caches created by the earlier gate remains compatible.

`highlights.scm` now embeds the pinned `tree-sitter-javascript` v0.23.1
baseline plus the ArkTS delta. The real parser regression fixture asserts
captures for comments, constants, functions, names, strings, returns, numbers,
and ArkTS structs. The outline fixture asserts struct, top-level function, and
method items.

## Language configuration RED → GREEN

RED:

```text
node --test tests/local-delivery-config.test.mjs
config.toml did not provide block comments, documentation comments,
autoclosing pairs, or ArkTS `$` identifier behavior
```

GREEN adds those public Zed language configuration contracts and passes the
focused Node test.
