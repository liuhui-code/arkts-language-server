# Q4 — Conditional code-action capability advertisement

Date: 2026-09-03

Parent revision: `fbe3d6f35f415da89641938f0d711acbfc78455e`

## Public contract

The server advertises code actions only when the initializing client supports
all four parts of the implemented quick-fix exchange:

1. code-action literals whose kind set contains `quickfix`;
2. opaque code-action `data`;
3. resolving the `edit` property;
4. versioned `WorkspaceEdit.documentChanges`.

For that client, initialize returns exactly:

```json
{
  "codeActionProvider": {
    "codeActionKinds": ["quickfix"],
    "resolveProvider": true
  }
}
```

If any prerequisite is absent, false, or lacks the required value, the
top-level `codeActionProvider` property is absent. The server does not claim
commands, refactors, fix-all, source actions, or any code-action family beyond
the existing spelling quick fix.

## RED → GREEN

The positive real-stdio initialize assertion was written first. After fixing a
missing test import, the behavioral RED was:

```text
Expected codeActionProvider
  { codeActionKinds: ["quickfix"], resolveProvider: true }
received undefined
```

Focused command:

```sh
node --test tests/lsp-capability-contract.test.mjs
```

The minimal implementation keeps the semantic capability object configurable
from initialize and adds the provider only when the four client predicates are
true. The next run deliberately exposed the stale public contract:

```text
codeActionProvider: must be absent, received
{"codeActionKinds":["quickfix"],"resolveProvider":true}
```

Moving that exact value from the absent set into the required contract produced
GREEN. A second public-interface test then varies each prerequisite independently
and observes that initialize omits the provider in all cases. It also deletes
the complete `codeActionLiteralSupport` object to prove structural absence is
handled without throwing. Each spawned server writes only to an isolated
temporary log directory and is closed without sleeps.

## Cross-layer evidence

- The production diagnostic characterization uses the same fully capable
  client and now asserts the exact provider options before exercising list and
  resolve.
- The shared installed semantic helper makes the same assertion. Both the
  source installer and immutable artifact acceptance import that helper.
- The feature matrix promotes only `code-actions`, linking the conditional
  capability, cancellation behavior, real TS2552 list/resolve/apply flow, and
  local plus immutable installed transcripts.

## Verification

```sh
node --test tests/lsp-capability-contract.test.mjs
# 3 passed, 0 failed

node --test tests/lsp-capability-contract.test.mjs \
  tests/semantic/diagnostic-code-characterization.test.mjs
# 10 passed, 0 failed

node --test tests/release/portable-install.acceptance.mjs
# 4 passed, 0 failed, 0 skipped; about 16.8 seconds

pnpm check
# exit 0
```

The local installer was not invoked in this slice because it rebuilds repository
outputs. The immutable artifact gate used a fresh bundle containing the Q4
implementation.
