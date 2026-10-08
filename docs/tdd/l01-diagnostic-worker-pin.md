# L01 experimental diagnostic worker artifact pin

Date: 2026-10-07. Parent revision:
`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

The transient diagnostic route is enabled only by the pair
`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_TRANSIENT_DIAGNOSTICS=1`.
A prepared replay with this route must pin its adjacent
`diagnostic-verifier-worker.cjs` bundle before launching the LSP server.
Existing suites that do not enable both flags must remain valid without that
new pin, including the full pre/postflight identity comparison.

Public CLI test: `tests/prepared-suite-diagnostic-worker-pin-cli.test.mjs`.
The test drives `scripts/bench/replay-references.mjs --prepared-suite` with a
Content-Length fixture server and a sibling diagnostic bundle. It checks the
ordinary suite, missing experimental pin, and valid exact SHA pin in that
order. A missing pin must exit 2 before creating a report; the valid pin can
still exit 1 because semantic readiness is unsupported, while correctness and
input identity pass.

RED command:

```bash
node --test tests/prepared-suite-diagnostic-worker-pin-cli.test.mjs
```

The first sandboxed run exited 1 before the behavioral assertion because
the existing external macOS RSS sampler could not produce its first sample.
With read-only process sampling approved, the same command reached the intended
**RED**: one test failed at the missing-pin case (`actual exit 1`, `expected
exit 2`). Its stdout was `PREPARED_SUITE=FAIL` /
`READINESS=READINESS_UNSUPPORTED`; no `PIN_MISMATCH` was raised, so the server
was launched. The preceding ordinary suite passed its unchanged-input and
correctness assertions without a diagnostic-worker pin. The valid-pin case
was not reached while RED.

The minimal implementation belongs in `capturePreparedIdentity`: include the
diagnostic bundle SHA only if both flags are enabled. No product semantic route
or worker lifecycle change is part of this slice.

After that conditional capture was added, the first GREEN attempt reached the
valid-pin run but failed `inputUnchanged`: the fixture had appended the pin by
hand, whereas the runner compares the entire JSON-stringified pin object and
the captured object had a different property order. The fixture now obtains
the valid pin object through the same public `capturePreparedIdentity` helper,
then independently checks the worker's SHA. The unchanged command is
**GREEN**, 1/1 pass, exit 0 with read-only RSS sampling. The ordinary suite
still passes without the new pin; the missing experimental pin exits 2 before
launch; the valid pin passes pre/postflight and report correctness, while
readiness remains `READINESS_UNSUPPORTED` as expected.

The new test also needed explicit fast-layer registration. Before adding it,
`node --test tests/test-layer-manifest.test.mjs` was RED with `discovered test
has no layer`; after registration, its fixed total and unit-layer count
assertions exposed the expected one-entry increments. Updating those exact
counts made the same command GREEN, 4/4.
