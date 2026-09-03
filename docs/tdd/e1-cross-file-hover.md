# E1 cross-file hover characterization

Date: 2026-09-03

Parent revision: `4b245df45a8b10d3e2acbd9dd1531f2b7252a012`

## Scope

This characterization exercises the production Content-Length stdio server
with only `Consumer.ets` opened. `RemoteService.ets` remains unopened and is
loaded through the consumer's relative import dependency closure.

The scenario queries hover at two reference sites after emoji markers on their
respective lines:

1. the local `ServiceAlias` type reference imported from the unopened class;
2. the `formatGreeting` receiver member declared in that unopened class.

It requires the local alias signature, member signature, source JSDoc prose,
readable `@since`, `@param`, and `@returns` tags, and exact UTF-16 ranges for the
current reference tokens. The pre-existing whitespace transcript continues to
require `null`.

## Characterization result

The requested production behavior was already GREEN. The TypeScript language
service's dependency closure loaded the unopened `.ets` module lazily,
`getQuickInfoAtPosition` preserved source documentation and tags, and the
ArkTS virtual-document mapping returned the reference-site ranges.

The first assertion draft incorrectly expected the source class name in the
alias signature. The observed signature was correctly local to the reference:

```text
(alias) class ServiceAlias
import ServiceAlias
```

That assertion was corrected before treating the run as evidence. It was a
test-expectation error, not a production RED. No production code was changed or
artificial failure introduced.

## Verification

```text
pnpm build
# GREEN

node --test --test-name-pattern="unopened imported alias and member" \
  tests/semantic/editor-capabilities.test.mjs
# 1/1 selected passed, 9 skipped

node --test tests/semantic/editor-capabilities.test.mjs
# 10/10 passed, 0 skipped

pnpm check
# GREEN, no TypeScript errors
```

This closes the missing bundle-level regression contract. Installed-artifact
hover coverage and capability-matrix policy remain outside this slice.
