# G2 test layer runner: TDD evidence

- Parent revision: `f235d93204b75fd3cb68bdbba187dc0de21655eb`
- Public boundary: `runNodeTestLayer(options)` and
  `node scripts/run-node-test-layer.mjs ...`
- Focused command: `node --test tests/test-layer-runner.test.mjs`

## Contract

The runner imports the single G1 manifest by default and accepts exactly one
selection:

- `--fast` selects every layer marked `fast`;
- `--layer <id>` selects one named layer;
- optional `--list` prints only the selected entry paths, one per line, and
  never starts a child process.

Selected entries are deduplicated and sorted with ordinal string ordering. An
unknown argument/layer, missing layer id, duplicate selector/modifier, mixed
`--fast` plus `--layer`, or empty selection fails before spawning. Rejecting an
empty selection is important because bare `node --test` would perform implicit
discovery and could cross the intended layer boundary.

Execution uses the current Node executable with:

```text
--test --test-concurrency=1 <stable selected entries...>
```

It inherits stdio and returns the child `code` and `signal` unchanged. The CLI
sets the same exit code, or re-sends the same signal to itself. Spawn failures
are rejected rather than converted into a passing status.

## RED -> GREEN cycles

1. **Fast list selection**
   - RED: `ERR_MODULE_NOT_FOUND` because the runner did not exist.
   - GREEN: fast entries were deduplicated, sorted, printed without headers,
     and no child was spawned.
2. **Layer execution and termination**
   - RED: `--layer` still took the list-only fast path and made zero spawn calls.
   - GREEN: the selected layer produced the exact Node arguments and preserved
     both a non-zero exit code and a terminating signal.
3. **Selection grammar**
   - RED: an unknown layer leaked `Cannot read properties of undefined`.
   - GREEN: all unknown, missing, duplicate, and mixed selections produced
     deterministic pre-spawn errors.
4. **Empty selection safety**
   - RED: an empty fast selection attempted to spawn bare `node --test`.
   - GREEN: it failed before spawning.

Final focused result: 6 tests passed, 0 failed, 0 skipped. A real CLI list smoke
for `--layer protocol --list` also returned the five manifest protocol entries
with exit code 0.

G2 intentionally does not modify the G1 manifest or package scripts. The
integration owner must classify `tests/test-layer-runner.test.mjs` in the
manifest before running G1, then connect commands in G3.
