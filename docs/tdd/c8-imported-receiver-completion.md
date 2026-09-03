# C8 imported-receiver member completion

Date: 2026-09-03

Parent revision: `68dad41c4b093f8f4bacdf87cd25cc4127b38f7a`

## Scope

This tracer exercises the production Content-Length stdio server with an open
consumer and an unopened imported ArkTS class. At `receiver.m`, after an emoji
on the same line, completion must return exactly one field and one method with
their LSP-native kinds and the exact UTF-16 replacement range.

It characterizes cross-file receiver inference, method completeness, duplicate
suppression, and source-coordinate mapping in one public-protocol scenario.

## RED

The new test found both members and mapped both replacement ranges correctly,
but the imported member variable was collapsed into the generic property kind:

```text
Expected CompletionItemKind.Field (5)
Actual CompletionItemKind.Property (10)
```

Focused command:

```text
node --test --test-name-pattern="imported receiver" \
  tests/semantic/semantic-characterization.test.mjs
```

## GREEN

The minimal implementation preserves TypeScript's
`memberVariableElement` distinction through the semantic contract and maps the
new `field` kind to LSP `CompletionItemKind.Field`. No completion discovery,
ranking, or indexing behavior changed.

Verification:

```text
pnpm build
# GREEN

node --test tests/semantic/semantic-characterization.test.mjs
# 9/9 passed, 0 skipped

pnpm check
# GREEN, no TypeScript errors
```

