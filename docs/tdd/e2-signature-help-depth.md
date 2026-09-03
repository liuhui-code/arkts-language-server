# E2 — Signature-help depth

Date: 2026-09-03

Parent revision: `d6163e7`

## Public contract

Signature-help requests preserve the editor's trigger intent through the LSP,
semantic, and TypeScript layers:

- missing context and malformed combinations conservatively become `invoked`;
- a whitelisted `(`, `,`, or `<` trigger becomes `characterTyped`;
- a valid trigger while help is already active becomes `retrigger`;
- a content-change retrigger carries no character; and
- `)` is accepted only as a retrigger character.

Initialize advertises `(`, `,`, and `<` as trigger characters and `)` as the
dedicated retrigger character. Arbitrary client strings are never cast into the
TypeScript trigger-reason union.

## API evidence

Context7 resolved the official libraries to `/microsoft/typescript/v5.9.2` and
`/microsoft/vscode-languageserver-node`, but neither documentation query
returned the signature-help declarations. The exact locally locked declarations
were therefore used as the version authority:

- TypeScript 5.9.2 accepts `,`, `(`, and `<` for `characterTyped`, with `)` added
  only for `retrigger`;
- LSP protocol 3.17.5 defines Invoked, TriggerCharacter, and ContentChange plus
  `isRetrigger` and an optional trigger character.

## RED → GREEN

The capability test uses the real Content-Length stdio server. Its first RED
showed that `retriggerCharacters` was absent. After adding `)`, a second RED
showed that `<` was absent from `triggerCharacters`. Each minimum capability
change made the focused transcript GREEN.

```text
Expected retriggerCharacters [")"], received undefined
Expected triggerCharacters ["(", ",", "<"], received ["(", ","]
```

The next real child-process test sent eleven context variants through the
production LSP adapter and an injected semantic port. Initial RED returned the
old fixed label instead of `scripted invoked`. Minimal GREEN added the neutral
trigger-reason query and passed it through LegacySemanticEngine, the type-engine
registry, and `getSignatureHelpItems`.

A final malformed case (`triggerKind: 99`, `isRetrigger: true`) was RED because
the first mapper trusted `isRetrigger` before validating the trigger kind. The
mapper now branches on a known LSP trigger kind first and returned `invoked` in
the GREEN run.

## Production depth transcript

The production fixture opens only `Main.ets`; its imported overload definitions
remain unopened. At a nested `transform<number>(1, …)` call occurring after an
emoji on the same line, the real TypeScript service returns both generic
overloads, selects the two-argument instantiated overload, and reports active
signature 1 and active parameter 1.

The initial assertion expected the selected overload to retain `T`; TypeScript
correctly returned its instantiated `number` signature instead. This was a test
expectation correction, not a product defect. The resulting scenario and the
separate ranged didChange v2 scenario were GREEN characterizations. The latter
replaces the call with a string instantiation and the immediately following
request returns the new string signature, never the stale number signature.
Positions are calculated from JavaScript string offsets, so the emoji exercises
UTF-16 code-unit coordinates rather than a hand-written column.

## Verification

```sh
pnpm build
# exit 0

node --test tests/lsp-semantic-request-reliability.test.mjs \
  tests/semantic/editor-capabilities.test.mjs
# 16 passed, 0 failed, 0 skipped

pnpm check
# exit 0
```

The scripted fixture build initially needed explicit sandbox permission to
replace `dist/scripted-semantic-server.cjs`; that was an execution-permission
boundary, not a product failure.

The integration step observed the expected stale-contract RED, then updated the
capability contract and feature matrix to require
`triggerCharacters: ["(", ",", "<"]` and `retriggerCharacters: [")"]`.
