# Backend Spike S2b — Core semantic contracts

Parent revision: 7358a741538186061b02dfdb20297fa348f33923 (PR #11 merge).
Branch: codex/backend-spike-core-contracts.

## RED → GREEN

The first focused test failed with `ERR_MODULE_NOT_FOUND` for
`direct-scenarios.mjs`. After adding the smallest direct host surface and eight
scenario definitions, the first real run remained RED:

```text
OHOS_TYPESCRIPT_SPIKE=FAIL
EXECUTED=12 DEFERRED=21 FAILED=1
```

The failing case expected an assignment diagnostic, but the existing public
transcript named by the contract is the `greting`/`greeting` spelling case.
The scenario was corrected to that authoritative TS2552 code and exact UTF-16
span. The next real run was GREEN for this batch:

```text
OHOS_TYPESCRIPT_SPIKE=INCOMPLETE
EXECUTED=13 DEFERRED=21 FAILED=0
```

INCOMPLETE remains the correct overall state because 21 mandatory cases are
not yet direct official-backend scenarios. A report-portability test then
exposed an absolute auto-import source path; the evidence serializer now
normalizes that source relative to the contract root.

## Verification

- Focused spike and manifest tests: 10/10 passed.
- Full `pnpm check:fast`: 848/848 passed, 0 fail/cancel/skip/todo
  (464,302.49 ms).
- Default runner without `--allow-incomplete`: exit 42.
- Report size: 13,473 bytes, below the 64 KiB contract.
- Every passed scenario reports `disposed: true`.
- Production `ohos-typescript` import gate: passed.
- `git diff --check`: passed.
