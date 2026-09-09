# Foundation F3 — Backend-independent semantic contracts

Parent revision: `5f910a9` (PR #8 merge).
Branch: `codex/foundation-semantic-contracts`.

## Contract catalog

`tests/semantic-contract/manifest.json` declares 34 mandatory cases across the
nine required categories: syntax, completion, definition, references, rename,
diagnostics, incomplete input, Unicode, and project-boundary semantics.

Twenty-nine cases point at an exact static `node:test` name. Those tests use existing
public LSP transcripts or established workspace/index contracts and already
assert exact URI, range, edit, diagnostic, freshness, or membership identity.
The manifest validator proves that every evidence file exists and every named
test appears exactly once, so stale or renamed evidence fails the fast gate.

Five cases are raw official-backend fixtures:

- an ETS `struct` declaration;
- `struct` inside a string and inside a comment;
- completion at incomplete `this.`;
- a completion query after a non-BMP character using UTF-16 positions.

The raw fixtures intentionally do not require the legacy virtual-rewrite backend
to pass. They are direct inputs for the Backend Spike host and prevent a failed
official-parser gate from being hidden by another regex rewrite. Each fixture
contains exactly one removable `/*@query*/` marker and an explicit oracle.

No DevEco oracle was invented. `tests/oracle/deveco-24.json` remains deferred
until the first controlled human confirmation can record exact symbol identity,
URI, range, diagnostic code, and edit results.

## RED → GREEN

`node --test tests/semantic-contract-manifest.test.mjs` was RED at parent
`5f910a9`: `tests/semantic-contract/manifest.json` did not exist. Adding the
manifest, category case files, raw fixtures, and exact-evidence validation made
the same command GREEN.

The test-layer manifest was then advanced from 90/44 total/unit entries to
91/45 and remained GREEN. No product runtime implementation changed in F3.

## Focused verification

- Contract inventory: 34 total; category counts `3/4/4/4/4/3/3/2/7` in manifest
  order.
- `node --test tests/semantic-contract-manifest.test.mjs tests/test-layer-manifest.test.mjs`:
  5/5 passed with no failures, cancellations, skips, or todos.

## Foundation exit gate

- `pnpm check:fast`: 839/839 passed with no failures, cancellations, skips, or
  todos (`duration_ms 462211.705599`).
- `git diff --check`: passed.
- The DevEco API 24 oracle remains an explicitly deferred human-confirmed
  artifact; the automated exit gate does not pretend it exists.
