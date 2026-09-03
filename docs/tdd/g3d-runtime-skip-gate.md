# G3d runtime no-skip gate TDD evidence

- Parent revision: `6a59940a46af985e4e95e0052b2cb4ad4faea2fb`
- Scope: fail explicit Node test layers when runtime results contain skipped,
  todo, or cancelled tests
- Public boundary: `runNodeTestLayer(...)`
- Runtime baseline: Node `20.19.5` from `.node-version`

## API choice

Node 20 documents custom test reporters as async generators over test events,
and supports multiple reporters with paired destinations. The runner therefore
uses the stable reporter/event API rather than scanning test source or parsing
human-readable output.

## RED: runtime annotations still exited zero

Command:

```sh
node --test tests/test-layer-runner.test.mjs
```

The test generated real temporary Node test files whose options were assembled
at runtime, outside the static scanner's syntax patterns. Both `skip` and
`todo` were exercised for:

- `--fast`
- `--layer artifact-e2e`
- `--layer large`

All six cases failed the new assertion in the same way:

```text
Expected code: 1
Actual code:   0
```

This proves the source scanner alone could not enforce the no-skip gate.

## GREEN: machine-readable runtime policy

The child now receives two reporters:

- `spec` writes directly to inherited stdout, preserving real-time logs and
  avoiding output pipes or deadlocks;
- `node-test-runtime-reporter.mjs` consumes terminal test events and writes one
  JSON summary to an isolated temporary destination.

The reporter retains only three integer counters: `skipped`, `todo`, and
`cancelled`. It ignores test stdout, stderr, names, files, and source. The
runner reads at most `4097` bytes, accepts summaries up to `4096` bytes, and
fails closed for missing, malformed, or oversized summaries.

Runtime policy is explicit:

| Selection | skipped | todo | cancelled |
| --- | --- | --- | --- |
| fast | reject | reject | reject |
| artifact-e2e | reject | reject | reject |
| large | reject | reject | reject |
| default/other layer | reject | reject | reject |

An existing nonzero exit or signal is returned unchanged. Only an otherwise
successful child with a policy violation is converted to `{ code: 1,
signal: null }`. Spawn errors retain object identity.

The runner now waits for ChildProcess `close`, rather than `exit`, before
reading the reporter destination, ensuring the machine output is complete. A
clean real Node test is accepted with code zero, while all real skip/todo cases
are rejected. Cancellation production and consumption are separately covered
through the reporter event contract and a machine-summary boundary test.

The nested real-process test removes Node's internal `NODE_TEST_CONTEXT` only
inside its injected spawn wrapper; production runner environment behavior is
unchanged.

## Final verification

```sh
node --test tests/test-layer-runner.test.mjs
```

Result: `28/28` passed, `0` failed, `0` skipped, `0` todo.

This slice does not modify the test-layer manifest, package scripts, workflows,
or production language-server code.
