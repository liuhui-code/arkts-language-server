# C10 contextual manual completion: TDD evidence

Scope: allow a valid manually invoked completion request to reach TypeScript
when the cursor has no identifier prefix, while keeping workspace module-export
completion disabled below the existing two-character threshold.

## TDD exception for this evidence file

- Reason: this file records an already completed RED/GREEN behavior slice and
  changes no runtime behavior.
- Scope: this file only.
- Owner: ArkTS Language Server maintainers.
- Expiry: 2026-09-13.

Parent revision: `4af4c21`

RED setup:

```sh
pnpm build
```

RED command:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern "completes contextual object properties without a prefix" \
  tests/semantic/semantic-characterization.test.mjs
```

Observed RED: the production stdio server returned an empty completion list for
`return { | }` in an `Options`-typed object literal. The TypeScript engine never
ran because ArkLine required an ASCII identifier prefix or a preceding dot.

Minimal GREEN (`02f8719`): remove only that pre-provider prefix gate. TypeScript
now decides whether the syntax position supports completion. The existing
`prefix.length >= 2` condition still controls module-export completion, so a
zero-prefix manual request cannot turn into a workspace auto-import scan. The
first-128 accepted-item quota, incomplete flag and cooperative checkpoints are
unchanged.

The real LSP test sends `CompletionTriggerKind.Invoked`, receives `title` and
`count` exactly once, and proves that the unopened workspace class `Greeter` is
absent. The current cross-layer kind policy maps TypeScript
`memberVariableElement` to LSP `Field`; contextual Property-vs-Field fidelity is
deliberately left for a separate contract rather than folded into this slice.

GREEN:

```sh
node --test --test-concurrency=1 tests/semantic/semantic-characterization.test.mjs
# 12/12 passed

node --test --test-concurrency=1 \
  tests/semantic/typescript-cooperative-cancellation.test.mjs
# 14/14 passed

pnpm check
# PASS
```

Independent review found no P0/P1 and confirmed that LSP automatic triggering
remains limited to `.` while manual invocation can reach contextual TypeScript
completion.
