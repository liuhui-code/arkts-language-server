# H6d safe CI evidence upload: TDD evidence

- Parent revision: `11b52f2e8d4c09b3806813450b7e25b3fa1658dd`
- Public boundary: `withTestEvidence(...)` failure manifest and the checked-in
  Zed workflow
- Scope completed: make the retained `failure.json` safe before any external
  artifact upload is enabled
- Scope pending: GitHub Actions artifact upload wiring

## Slice 1: never persist the original test error message

RED command:

```sh
node --test tests/test-evidence.test.mjs
```

The regression supplied a 1,000-character error message containing explicit
secret and source markers, plus a non-allowlisted error name. The retained
`failure.json` reproduced both values verbatim. Result: 3 passed, 1 failed.

Minimal GREEN change:

- `failure.json.error.message` is now the fixed string `Test case failed`.
- Error names outside the existing safe-name allowlist become `Error`.
- JSON-scalar `code` and `signal` remain available for diagnosis.
- The exact original error object is still rethrown to the test runner.

GREEN command:

```sh
node --test tests/test-evidence.test.mjs
```

Result: 4 passed, 0 failed.

## Slice 2: workflow upload is pending explicit authorization

A static contract was first exercised against the current workflow and reached
the expected RED: there is no `Upload retained test failure evidence` step.
The intended minimal workflow change was then rejected by the managed safety
review because `actions/upload-artifact` sends files to an external GitHub
Actions artifact destination and the user has not explicitly authorized that
payload and destination.

The unimplemented RED assertion was removed so the repository remains GREEN.
No workflow file was changed, and no upload was attempted. H6d CI upload remains
pending until the user explicitly authorizes uploading only:

```text
${{ runner.temp }}/arkts-test-evidence/**/failure.json
```

to this repository's GitHub Actions artifacts for seven days.

Once authorized, the static workflow contract must require:

- a step-local `ARKTS_TEST_EVIDENCE_ROOT` on the one canonical release-gate
  step;
- one uploader after that gate with `if: ${{ always() }}`;
- the immutable `actions/upload-artifact` v4.6.2 commit
  `ea165f8d65b6e75b540449e92b4886f43607fa02`;
- only the `**/failure.json` path above, `if-no-files-found: ignore`, seven-day
  retention, and `include-hidden-files: false`;
- no repository root, source, transcript, environment dump, `dist`, `target`,
  fixture, or `node_modules` path;
- no additional build or test command. The existing single serialized
  `pnpm check:release` remains the only workflow release invocation.

Layer-runner failure-marker generation is deliberately outside this slice and
remains follow-up work.

