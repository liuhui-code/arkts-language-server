# E0b advertised capability artifact evidence gate

Date: 2026-09-03

Parent revision: `3264efe`

## Public contract

The machine-readable LSP feature matrix is a release contract: every feature
whose capability is advertised must name executable protocol, bundle, and
immutable installed-artifact evidence. `artifactGap` remains valid only for a
planned capability that is still absent.

## RED

After signature help, document symbols, and references acquired immutable
artifact transcripts, the focused test removed the references artifact record
but left a non-empty human `artifactGap`.

```text
node --test --test-name-pattern "rejects an enabled capability without immutable artifact evidence" tests/lsp-feature-matrix.test.mjs
```

Observed: `Missing expected exception.` The validator still let an enabled,
advertised feature bypass artifact verification by writing an explanatory
string.

## Minimal GREEN

The validator now rejects every enabled feature with an empty artifact evidence
list. Planned/absent capabilities may continue carrying an explicit gap, so the
matrix can still describe unfinished work without pretending it is released.

```text
node --test tests/lsp-feature-matrix.test.mjs
# 11 passed, 0 failed, 0 skipped
```

No capability or runtime behavior changed in this slice.
