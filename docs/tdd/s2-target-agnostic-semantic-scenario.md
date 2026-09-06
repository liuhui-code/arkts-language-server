# S2 target-agnostic semantic scenario TDD evidence

- Parent revision: `720c2027b2654fb7018caf3c6b92e342edf5211d`
- Scope: one reusable production semantic transcript across repository launch targets

## RED

Command:

```sh
node --test tests/conformance-scenario.test.mjs
```

The focused test failed before starting either target because the reusable
scenario module did not exist:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'tests/support/conformance-scenario.mjs'
```

## GREEN

`runThisCompletionScenario(target)` now performs one real stdio transcript:

1. initialize with the target root and UTF-16 client capability;
2. open a deterministic ArkTS `Profile` document;
3. request completion after `this.`;
4. return the completion labels and close through shutdown/exit.

The same scenario runs against both of these injected targets:

- `node dist/server.cjs --stdio` from the repository root;
- the repository CLI from a temporary working directory outside the repository.

The CLI case verifies launch-mode independence only. It is not an installed or
packaged artifact acceptance test.

Verification:

```sh
node --test tests/conformance-scenario.test.mjs
```

Result: both target subtests passed; required field `title`, method `save`, and
clean exit code `0` were observed for each target (`0` failed, `0` skipped).
