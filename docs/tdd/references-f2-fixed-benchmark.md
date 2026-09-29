# F2 pinned real-project benchmark: RED/GREEN record

Parent revision: `d2e8b06975dc2112849f394d26f2d074051d385a`.
Public boundary: `scripts/bench/replay-references.mjs` CLI and a real child
LSP session, not private server functions. No production semantic behavior
changed.

1. RED: `node --test --test-name-pattern='mismatched SDK' tests/references-replay-cli.test.mjs`
   timed out after 10 seconds because the runner launched the silent server
   instead of rejecting the mismatched SDK. GREEN: the manifest preflight
   emitted `BENCHMARK_BLOCKED=SDK_MISMATCH` before launch.
2. RED: `node --test --test-name-pattern='workspace-relative exact Location oracle' tests/references-replay-cli.test.mjs`
   failed with “oracle must be a Location array or a replay report”. GREEN:
   the runner accepted a bounded workspace-relative oracle and kept its exact
   UTF-16 range validation.
3. RED: `node --test --test-name-pattern='unavailable pinned SDK' tests/references-replay-cli.test.mjs`
   emitted an unclassified `ENOENT`. GREEN: an unavailable manifest SDK emits
   `BENCHMARK_BLOCKED=SDK_UNAVAILABLE` before launch.
4. RED: `node --test --test-name-pattern='private index cache' tests/references-replay-cli.test.mjs`
   found the inherited `ARKTS_MEMORY_BUDGET_MB` missing from the environment
   evidence. GREEN: the runner records inherited `ARKTS_*` values alongside
   its explicit overrides.

The existing successful/failing CLI characterization tests remained GREEN
after extracting oracle parsing/comparison into
`scripts/bench/reference-location-oracle.mjs`. The changed runner fell from
657 lines at parent to 630 lines; the extracted module is 106 lines. The
repository's complete `pnpm check:fast` passed 933/0/0 before the final
extraction. Two later complete runs failed existing reference-depth cases on
their 5-second LSP response deadlines; one also timed out the overload case.
The focused reference-depth file passed 6/0/0. The complete local gate is
currently **RED**; no merge is requested on this evidence. The finalized
Photos indexed replay also passed through production stdio with three exact
Locations and 62 diagnostics (raw evidence linked in the F2 report).

Follow-up parent revision: `c8634173a9d72b71c1eeea6ba67a8f987bd46675`.
RED: `node --test --test-name-pattern='automatic diagnostics never arrive' tests/references-replay-cli.test.mjs`
showed a real Content-Length-framed child responder could return a complete
references result, omit `publishDiagnostics`, and still make the runner print
`REFERENCES_REPLAY=PASS`. GREEN: the report is FAIL unless a versioned automatic
diagnostic notification was observed. The fixture changes only benchmark
validation; production semantic behavior remains untouched.

Follow-up parent revision: `8ee8cde05c0d1911c729e882e5f4cffcbc931539`.
The repository's 500-line handwritten-file contract prompted a behavior-
preserving extraction of CLI parsing, input validation and pinned-manifest
preflight into `scripts/bench/reference-replay-input.mjs`. The existing
public CLI/real-child characterization suite was GREEN (8/8) before the
extraction when run with macOS process-sampler permission, and GREEN (8/8)
afterward. The runner fell from 632 to 450 physical lines; the new module is
198 lines. A restricted-sandbox attempt was not a behavioral RED: the
external process sampler could not start there. No production LSP behavior
was changed by this extraction. A pinned Photos production-stdio replay after
extraction also passed its three-location oracle, all 62 automatic diagnostics,
and the strict differential against the existing legacy report; its raw file
is `/private/tmp/photos-f2-refactor-verify-20260921.json`. This is a runner
regression check, not a new Settings benchmark.
