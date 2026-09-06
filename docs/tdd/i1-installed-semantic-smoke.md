# I1/I2 installed semantic smoke: characterization evidence

- Parent revision: `6a59940a46af985e4e95e0052b2cb4ad4faea2fb`
- Public boundary: the command produced by `scripts/install-local.sh`, launched
  with `--stdio` from a working directory outside the installed workspace
- Scope: installed definition, versioned diagnostics, and completion against
  the deterministic v1 conformance corpus

## Test-first observation

The existing local-delivery acceptance was extended only after installation had
succeeded and the installed command had answered a real initialize request. It
materializes `fixtures/conformance/v1` and then starts that installed command
through the existing Content-Length-framed `LspSession` transport.

The first execution was already GREEN, so this slice records existing product
behavior as characterization. No production or installer change was made.

Environment isolation used by the semantic session:

- a dedicated external cwd, outside the materialized workspace;
- missing HOME and DevEco paths;
- only the corpus-owned OpenHarmony SDK through
  `ARKLINE_HARMONY_SDK_PATH`;
- an isolated index cache;
- an empty sidecar override, forcing the installed artifact's portable adjacent
  sidecar resolution.

The client advertises UTF-16 positions, versioned diagnostics, and work-done
progress. It receives and answers `window/workDoneProgress/create`, but never
waits for catalog progress or catalog completion before issuing semantic
requests.

## Characterized installed behavior

1. Materializer-owned markers provide every request position and expected
   range; the acceptance contains no hand-written source coordinate.
2. Only `OtherConsumer.ets` is opened at version 1.
3. Its `publishDiagnostics` notification has the same URI, `version: 1`, and an
   empty diagnostics array.
4. Definition at the marker-derived `Profile` reference returns exactly one
   location: the unopened `model/Profile.ets` URI and its complete,
   marker-derived `Profile` range.
5. `OtherConsumer.ets` is closed, then only `Home.ets` is opened.
6. Completion at the marker-derived `Gree` position contains exactly one
   `Greeter`; it is `CompletionItemKind.Class` and its text edit replaces the
   exact marker-derived range with `Greeter`.

## Verification

```sh
node --test tests/release/local-delivery.acceptance.mjs
```

Result: 1 passed, 0 failed, 0 skipped. The complete acceptance took about 8
seconds, including the existing installer/build/idempotence checks.

Completion resolve, auto-import application, catalog-completion waiting, and
installer restructuring remain deliberately outside this characterization.
