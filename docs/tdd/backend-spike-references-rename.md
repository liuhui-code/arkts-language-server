# Backend Spike S2c — References and rename

Parent revision: b81f678fa90107dc713327a9d201eaaffc01238a (PR #12 merge).
Branch: codex/backend-spike-references-rename.

## RED → GREEN

The first focused test was RED because the official-backend scenario module did
not export any references/rename contract set:

```text
node --test tests/ohos-typescript-spike.test.mjs
SyntaxError: direct-scenarios.mjs does not provide
REFERENCE_RENAME_SCENARIO_IDS
```

After the minimal host surface for references, rename, and versioned file-set
updates was added, the first real run remained RED:

```text
OHOS_TYPESCRIPT_SPIKE=FAIL
EXECUTED=20 DEFERRED=13 FAILED=1
rename.explicit-barrel-alias: Cannot read properties of undefined
```

The scenario's barrel referenced `./origin` while its controlled root file was
named `alias-origin.ets`. Correcting that invalid fixture made all eight cases
GREEN without a compiler workaround:

```text
OHOS_TYPESCRIPT_SPIKE=INCOMPLETE
EXECUTED=21 DEFERRED=13 FAILED=0
```

The scenarios cover exact barrel references, overlay replacement, 80 unopened
consumers, a newly admitted target file, public alias rename isolation,
non-BMP prepare ranges, and same-scope conflict validation.

## Verification

- Report size: 17,600 bytes, below the 64 KiB contract.
- Focused spike and manifest tests: 11/11 passed.
- Default runner without `--allow-incomplete`: exit 42.
- Full `pnpm check:fast`: 849/849 passed, 0 fail/cancel/skip/todo
  (465,488.73 ms).
- Production `ohos-typescript` import gate: passed.
- `git diff --check`: passed.
