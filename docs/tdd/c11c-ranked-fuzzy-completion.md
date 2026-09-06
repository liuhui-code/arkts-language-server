# C11c ranked fuzzy completion: TDD evidence

Scope: admit camel-case and ordered-subsequence completion matches before the
128-item publication quota without allowing weak early matches to hide a later
strong prefix match. Preserve TypeScript `sortText` tiers and provider order,
bounded memory, truthful incompleteness, and cooperative cancellation.

## TDD exception for this evidence file

- Reason: this file records an already completed RED/GREEN behavior slice and
  changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Parent revision: `4be4b53`

RED command:

```sh
pnpm build
node --test --test-concurrency=1 \
  --test-name-pattern "keeps a camel-subsequence member beyond the raw provider quota" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed RED 1: the production stdio fixture requested `zzq` from a typed
receiver whose `zebraZoneQuery` member was behind more than 128 provider
entries. Prefix-only filtering returned no result.

Observed RED 2: a naive ordered-subsequence implementation accepted the first
128 `alphaMethod*` matches for `me` and omitted the later, stronger
`memberTarget` prefix match.

Minimal GREEN (`a69315f`): preserve TypeScript's ordered `sortText` tiers, keep
at most 128 candidates in each of three quality buckets (prefix, camel,
generic subsequence), select stronger matches within a tier, then restore the
original provider order before publication. Native incompleteness, unscanned
raw tails, and matching overflow are ORed into `isIncomplete`; raw scanning,
bounded sorting, result mapping, and final publication share the request-local
cooperative cancellation scope.

Mutation proof: collapsing camel/subsequence matches into the prefix bucket
made the E2E RED with `alphaMethod127 !== memberTarget`. The same fixture also
kills the old `startsWith` implementation and raw-first-128 truncation.

GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
# 15/15 passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 15/15 passed

pnpm check
# PASS
```

Independent review found no P0/P1 and confirmed the 127/128/129 boundaries,
fixed candidate memory, provider-order restoration, truthful incompleteness,
and cancellation cadence.
