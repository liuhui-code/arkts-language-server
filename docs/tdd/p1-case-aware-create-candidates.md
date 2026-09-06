# P1 volume-aware casing for created module candidates

Parent revision: `d3d6f53`.

## Regression

On a case-insensitive volume, a closure can remember the missing lexical candidate `target.ets` and later receive a create event spelled `Target.ets`. Exact path matching missed the new preferred module, so the warm closure kept resolving `target.ts`.

Globally lowercasing paths is not correct: a case-sensitive volume may legally contain distinct files with those names.

## RED/GREEN

```text
node --test --test-name-pattern "watched create matches candidate casing" tests/project-file-set-cache.test.mjs
```

RED on a case-insensitive volume retained the warm fallback closure. GREEN invalidates it and selects the new ETS source. The same test asserts the inverse contract on a case-sensitive volume.

## Identity rule

Missing candidates retain their lexical and physical identities plus a tagged folded comparison identity. A create event contributes that folded identity only when an alternate-cased lookup of the existing event path resolves to the same physical path. This makes the comparison volume-aware, adds only bounded identities to the existing candidate cap, and never scans closures more than once per batch.
