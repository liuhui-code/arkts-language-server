# SDK input quality and service availability — public LSP evidence

Dates: 2026-10-24–25. Decision: [ADR 0021](../adr/0021-sdk-input-quality-and-service-availability.md).
Parent revision: `e35459131366a32c48c10d1d74adef74357cd3dc`, branch
`fix/windows-path-identity-20261022`, with inherited uncommitted path/state-machine work.
Starting state and diff: `.bench/sdk-semantics-20261024/{parent.txt,before-status.txt,before-tracked.diff}`.
This work does not merge, publish, resume cache optimization or restart the paused index route.

All editor behavior tests run the real child-process server with Content-Length
framed stdio. The SDK fixtures reproduce selected-SDK directory/metadata shapes;
they are not claims that a synthetic SDK is a certified production SDK.

Use Node 20.19.5, with its directory on PATH. Evidence root below is
`.bench/sdk-semantics-20261024/`; files are retained, including failed attempts.

| Slice | RED evidence and actual symptom | GREEN / contract |
| --- | --- | --- |
| Runtime globals | `01-runtime-red.tap`: timer names 2304, console 2584 despite supplied official-shaped runtime declarations | `03-runtime-green.tap`; selected SDK runtime roots are loaded; exact definition URI/range, no browser/Node injection |
| Local unknown SDK API | `04-partial-red.tap`: root report was degraded for `@ohos.missing` | `06-partial-green.tap`, later full SDK regression; partial report plus healthy queries, real missing-module diagnostics retained |
| SDK internal missing declaration | `08-sdk-declaration-red.tap`: old logic falsely reported ready because `skipLibCheck` hid the missing triple-slash input | `10-declaration-green.tap`; actual Program membership checked, SDK issue recorded, no fabricated diagnostic code |
| Declaration-only component grammar | `11-components-red.tap`: 1005/1128 and unknown `width` on valid builder tail | `13-components-green.tap`; names come from selected SDK component metadata |
| Decorated-function boundary | Windows `29-windows-probe.stdout` records real TypeError reading missing `extend.decorator`; `30-decorator-red.tap` reproduces failed initialization over public LSP | complete empty option records keep unknown extensions disabled; healthy builder navigation succeeds; unsupported extension retains exact local 1206 |
| Partial loader file | `46-loader-call-red.tap`: a loader file containing only components also fails initialization for a decorator **call** | `52-final-sdk-regressions.tap`, Windows `53-windows-qualified.stdout`; missing nested option records use neutral defaults |
| SDK import editing / bound | `56-import-boundary-red.tap`: space-containing SDK import produces a partial report rejected by the Worker decoder | Producer/decoder accept the same bounded diagnostic data. Oversized names omit the issue specifier and retain the compiler diagnostic; existing freshness rejection is preserved |
| Runtime-only SDK coverage | `76-runtime-only-red.tap`: one runtime root incorrectly creates a full ready certificate after the component entry is removed | `78-final-proof-contracts.tap`; partial plus correct timer definitions and healthy diagnostics, no full identity |
| Benchmark consumer | first `23-check-fast.log` contains READINESS_INVALID for valid SDK partial reports | CLI retains PARTIAL while ready/latency gates fail/block; forged complete proofs remain rejected |

`43-loader-options-red.tap` is **not RED**: that first fixture used a bare decorator,
which did not exercise the compiler's decorator-call path. The corrected invocation
in `46-loader-call-red.tap` fails against the raw partial-loader path. The final
assertion uses the installed compiler's exact 1206; it does not also invent 2304
inside a construct for which that compiler suppresses name checking.

Commands for the relevant public tests:

```sh
pnpm build
node --test --test-concurrency=1 tests/semantic/sdk-runtime-globals.test.mjs
node --test --test-concurrency=1 tests/semantic-worker-readiness-protocol.test.mjs
node --test --test-concurrency=1 tests/semantic/semantic-readiness.test.mjs tests/semantic/project-initialization.test.mjs
node --test --test-concurrency=1 tests/prepared-suite-l3-cli.test.mjs tests/prepared-suite-worker-recycle-cli.test.mjs
node --test --test-concurrency=1 tests/prepared-suite-semantic-readiness.test.mjs
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony node --test --test-concurrency=1 tests/release/real-sdk.acceptance.mjs
pnpm check:fast
```

Use `--test-name-pattern` before test file arguments to select the RED slice.
Initial failing product artifacts are recorded by the dated build logs and Windows
overlay manifests; the final tree is expected GREEN and does not recreate RED by itself.

The final ten SDK regressions prove:

1. Exact SDK timer definition plus empty healthy-source diagnostics.
2. Unknown SDK import leaves healthy definition, complete local references and exact
   rename edits usable; the missing file still publishes 2307; one Worker.
3. Explicit typed project declaration patch, watched-file event, then explicit
   readiness preparation repairs inputs in the same session and Worker.
4. Incorrect timer argument/return types remain diagnosed; lower-case `settimeout`,
   browser `window` and Node `process` remain unknown.
5. Partial loader options and unknown decorated function leave a local diagnostic,
   without failing healthy SDK queries or restarting the Worker.
6. Same-path SDK file update plus configuration refresh and preparation repairs
   the missing module, with exact new declaration navigation and one Worker.
7. Missing SDK triple-slash declaration is partial, with no fake compiler diagnostic.
8. Declaration-only SDK metadata parses builder tails; unknown extension features
   retain local diagnostics while healthy component navigation succeeds.
9. In-progress SDK import names containing spaces remain local input issues with
   healthy queries. Oversized names cannot poison the protocol or restart the
   Worker; the existing unprovable-filesystem freshness rejection remains explicit.
10. Runtime-only SDK declarations provide working global types without claiming
    complete component ambient coverage.

Protocol tests reject partial reports carrying a complete generation, identity,
coverage or capability proof; malformed issues/accessors are rejected without
invoking getters. Pressure tests keep the one-shot initialization exemption:
a partial first initialization does not grant pressure-exempt retries.

Integration failures were kept rather than discarded:

- First Mac Photos fixture was inside this repository and accidentally discovered
  its `node_modules/@types/node`. The wrong timer definition URI caught it.
  Corrected runner uses an external temporary workspace; this was a harness error.
- First Windows upload omitted the builder fixture (6/7 public tests passed).
  The fixture was supplied before the final eight-test run.
- First exception probe had a wrong bundled parameter-name anchor and is not a
  diagnosis result. Corrected probe records the actual compiler exception separately.
- The new benchmark test initially reused an output path and was rejected with
  OUTPUT_EXISTS. Independent output files fixed the test; final CLI boundary passes.
- Full-check attempts 23, 39, 49, 60 and 74 were interrupted after discoveries; none is
  advertised as a complete passing check. Final-check input and correction
  manifests preserve the exact versions. Final source/test inputs are frozen in
  `final-proof-inputs.json` before final full check 80, after the SDK consumer and
  platform-specific test migrations and strict runtime-only coverage fix.
- The first oversized-import test incorrectly expected a healthy query despite
  an existing unprovable filesystem witness. `58-sdk-boundary-green.tap` is an
  actual failed attempt. The final case asserts the exact -32803 freshness error,
  partial report and one Worker; it does not claim that input guard was fixed.
  The Windows run subsequently proves stable ENOENT absence and returns the exact
  SDK definition; `64-mac-long-name.json` and `65-windows-long-name.stdout` record
  the underlying platform error difference. Final tests assert each exact outcome.

Final check results and actual-project evidence are maintained in
[the implementation report](../reports/2026-10-25-sdk-input-quality-and-availability.md).

Final result: `pnpm check:fast` exit 0, 2,028/2,028 passed, none failed,
cancelled or skipped. All 733 frozen source/test/script/config hashes are unchanged
after the complete run. Windows SDK cases pass 10/10 and actual-SDK acceptance
passes 11/11 on the same final product. See `final-verification.json` and
`photos-proof-summary.json` under the evidence root. The authorized 455-file
cold-directory 3-second gate remains a separate excluded gate, not an implicit
release graduation.
