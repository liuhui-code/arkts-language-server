# Gramony `ChatList` declaration façade gate

## Outcome

The real-project declaration-façade gate remains **environment blocked**, but the
API 24 parser blocker is closed. Production now pins `ohos-typescript@4.9.5-r10`
and enables the compiler's official `etsAnnotationsEnable` option for SDK API 24+.
Both real annotation declaration files parse without diagnostics. The remaining
real closure still cannot type-check without errors, so no source-versus-façade
memory comparison was accepted and no façade path is enabled in production.

This is still a correctness stop, not a negative memory result. With `r10`, the
compiler reached a 545-SourceFile closure and emitted the same 45 `.d.ets` files,
including `ChatList.d.ets`, but reported 71 errors. The previous annotation parser
errors are gone; the remaining failures are unresolved project native/third-party
modules and dependent type errors. Treating that emit as valid would still violate
the zero-error semantic gate.

## Fixed input

- Project: Gramony at `0a1ee4b026b6736671f0030ba9859aceaa962298`.
- Declaration source: `features/home/src/main/ets/views/Chat/ChatList.ets`.
- Real consumer: `features/home/src/main/ets/pages/Index.ets`.
- Query: imported `ChatList`, zero-based UTF-16 position `41:9`.
- Backend source reference: `openharmony/third_party_typescript` revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`.
- Production artifact: `ohos-typescript@4.9.5-r10`, compiler JS SHA-256
  `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`.
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
Do not ignore diagnostics or admit the generated files to production. The API 24
annotation parser no longer blocks the official backend, so `ets2panda` fallback
is not triggered. Reopen this façade A/B only after the real native and third-party
declaration closure is complete and the emit reaches zero errors.

Machine-readable evidence:
[`evidence/2026-09-14-gramony-chatlist-declaration-facade-gate.json`](evidence/2026-09-14-gramony-chatlist-declaration-facade-gate.json).
