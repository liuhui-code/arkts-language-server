# Gramony `ChatList` declaration façade gate

## Outcome

The real-project declaration-façade gate is **environment blocked**. The locked
`ohos-typescript@4.9.5-r4` compiler emitted declarations, but it could not type-check
the API 24 / OpenHarmony 6.1.1.125 closure without errors. No source-versus-façade
memory comparison was accepted, and no façade path is enabled in production.

This is a correctness stop, not a negative memory result. The compiler reached an
807-SourceFile closure and emitted 45 `.d.ets` files, including `ChatList.d.ets`, but
reported 145 errors. The first parser errors are on API 24 annotation declarations
such as `export @interface Retention`; missing third-party/native declarations add
module-resolution errors. Treating that emit as valid would violate the zero-error
semantic gate.

## Fixed input

- Project: Gramony at `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- Declaration source: `features/home/src/main/ets/views/Chat/ChatList.ets`.
- Real consumer: `features/home/src/main/ets/pages/Index.ets`.
- Query: imported `ChatList`, zero-based UTF-16 position `41:9`.
- Backend: `openharmony/third_party_typescript` revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`, package `4.9.5-r4`.
- SDK: API 24, OpenHarmony 6.1.1.125, declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.

## Reproduction

```bash
node scripts/bench/run-declaration-facade-memory-ab.mjs \
  --declaration /private/tmp/arkts-business-gramony/features/home/src/main/ets/views/Chat/ChatList.ets \
  --consumer /private/tmp/arkts-business-gramony/features/home/src/main/ets/pages/Index.ets \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --line 41 \
  --character 9 \
  --runs 1 \
  --out /private/tmp/gramony-chatlist-facade-ab.json
```

The command exits before the façade query with:

```text
query phase failed (2): façade emit failed with status 42
```

The underlying emit command is:

```bash
node scripts/semantic/ets-declaration-facade-spike.mjs \
  --source /private/tmp/arkts-business-gramony/features/home/src/main/ets/views/Chat/ChatList.ets \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
```

## Decision

The declaration-façade route remains stopped for this toolchain and real closure.
Do not ignore diagnostics or admit the generated files to production. The next
working-set experiment must preserve the full 65-project-file `ChatList` closure
and obtain lifecycle isolation without relying on this invalid façade.

Machine-readable evidence:
[`evidence/2026-09-14-gramony-chatlist-declaration-facade-gate.json`](evidence/2026-09-14-gramony-chatlist-declaration-facade-gate.json).
