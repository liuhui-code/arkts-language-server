# C11e commit characters: TDD evidence

Scope: preserve TypeScript completion entry overrides and list defaults through
the editor-neutral semantic contract, Legacy adapter, and LSP adapter while
publishing the optional field only to clients that advertise
`commitCharactersSupport`.

## TDD exception for this evidence file

- Reason: this file records completed RED/GREEN behavior slices and changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Initial parent revision: `e1bb8ca`

## RED

After the provider-level precedence slice (`2f66e4c`), a real stdio client
advertising `textDocument.completion.completionItem.commitCharactersSupport`
still received no `commitCharacters` field from list or resolve:

```sh
pnpm build
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "replaces the complete identifier when completion is accepted mid-token"
# FAIL: undefined !== [".", ",", ";"]
```

The no-capability imported-receiver test also established the fail-closed
contract: list and resolve must not own the optional field.

## GREEN (`pending`)

The semantic contract and Legacy conversion now preserve `commitCharacters`.
The LSP server captures an immutable per-client profile during initialize and
conditionally emits the field for both list and resolve. The condition is
strictly `=== true`, and explicit `[]` remains an empty list rather than being
replaced by a default.

Focused verification:

```sh
node --test --test-concurrency=1 \
  tests/semantic/semantic-characterization.test.mjs \
  --test-name-pattern "replaces the complete identifier|completes imported receiver"
# 16/16 passed (selected tests run in the characterization layer)

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 17/17 passed

pnpm check
# PASS
```

Capability-gate mutation (forcing the server profile to `true`) makes the
no-capability imported-receiver regression fail, proving the gate is active.
