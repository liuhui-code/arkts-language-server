# L01 post-eviction GC probe runner pin

Date: 2026-10-07. Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

The post-eviction GC probe is experimental and effective only when both
`ARKTS_BENCHMARK_CONTROL=1` and `ARKTS_L01_POST_EVICTION_GC_PROBE=1` appear in
the prepared suite runtime environment. For that case the replay parent must
be launched with **exactly** `NODE_OPTIONS=--expose-gc`. The runner rejects a
missing or augmented value before starting the server. It conditionally adds
`nodeOptions` to captured input pins. Every report records the effective
`NODE_OPTIONS` launch value (or `null`), including the control arm; ordinary
prepared suites do not acquire a new pin. The LSP
child inherits the parent's option through the existing `LspSession` launch.

The stable interface is `scripts/bench/replay-references.mjs --prepared-suite`.
`tests/prepared-suite-gc-probe-pin.test.mjs` uses a framed LSP fixture server,
asserts that unpinned/incorrect launches create no report, verifies the
preflight pin mismatch, and checks the child actually sees `globalThis.gc`
when the exact option is pinned. It also checks an ordinary replay's identity
and report remain unchanged. This is a reproducibility pin, not evidence of a
production GC or memory benefit.

RED:

```bash
node --test tests/prepared-suite-gc-probe-pin.test.mjs
```

The first test exited 1 because the runner launched the fixture server and
produced a `READINESS_UNSUPPORTED` report instead of rejecting the missing
parent option with exit 2. The test-layer manifest was separately RED because
the new executable test lacked a layer assignment.

GREEN (read-only macOS process RSS sampling permission required for full
fixture runs):

```bash
node --test tests/prepared-suite-gc-probe-pin.test.mjs
```

Result: 3/3 pass. Without process-sampling permission, the fixture's external
RSS sampler cannot obtain its first sample; that is an environment block, not
a semantic test failure. The runner's preflight-rejection test passes without
that permission. The valid replay still exits 1 because the existing public
semantic-readiness contract is unsupported, while exact reference correctness,
diagnostics, input identity, and option inheritance pass.

A follow-up public test first failed when an ordinary control replay launched
with `NODE_OPTIONS=--expose-gc` but omitted that effective option from its
report. The runner now records it without making it a control-arm pin. The
focused test then passed 3/3 with macOS child-process RSS sampling permission.
