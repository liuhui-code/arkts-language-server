# Bundled ArkTS standard-library declarations

Parent revision: `3c0900fe98407112948d9009ef69376e4c5c8608`.
This is the R-02 diagnostic-validity slice of the
[references latency plan](../plans/2026-09-20-references-latency-execution-plan.md).

## RED: public LSP behavior

A new real child-process, Content-Length-framed LSP test opens an `.ets` file
using `Object.keys`, `Array.from`, `Promise.resolve`, `string.includes` and an
ArkUI-like `Text(content)` declaration/call,
then waits for its versioned `textDocument/publishDiagnostics`. Against the
previous production bundle, the following command failed:

```text
node --test tests/semantic/standard-library-diagnostics.test.mjs \
  tests/test-layer-manifest.test.mjs
```

The response contained TS 2304 for `Object`/`Array`, TS 2583 for `Promise`,
and TS 2339 for `string.includes`. This was a server-delivery defect, not
evidence that the project's selected API 24 was semantically equivalent to
its declared compile SDK 23. The bundled `ohos-typescript` worker resolved
its default library beside `dist/semantic-worker.cjs`, where no `lib*.d.ts`
assets had been delivered.

After copying the library files, a second public RED exposed the compiler's
default `lib.es2022.full.d.ts`: its DOM `Text` conflicted with the ArkUI-like
`Text`, producing TS 2300 and TS 2348, and the first real Settings replay
surfaced a TS 2554 call mismatch. Delivering files alone was therefore not
the correct diagnostic fix; the selected compiler library also had to exclude
DOM globals.

## GREEN: fixed compiler assets

The runtime build copies the pinned compiler package's 70 `lib*.d.ts` files
beside the bundled workers and emits `dist/arkts-standard-library.json` with
their sorted names. A missing selected `lib.es2022.d.ts` fails the build instead
of silently producing an incomplete asset set. Production compiler options
explicitly select `lib.es2022.d.ts`, excluding the default full/DOM library
while retaining the ES2022 standard globals.
The semantic backend remains the only diagnostic authority; no SDK path,
memory policy, reference strategy or diagnostic enablement changed.

```text
pnpm build
node --test tests/semantic/standard-library-diagnostics.test.mjs \
  tests/release/portable-install.acceptance.mjs \
  tests/test-layer-manifest.test.mjs
```

The focused run passed **9/9** tests, including portable installed-artifact
acceptance with sealed standard-library assets and an installed LSP semantic
smoke. The new public diagnostic test is registered in the `bundle-e2e` test
layer. The Windows delivery path has structural tests but was not executed on
Windows by this Mac run.

The benchmark replay now records deterministic SHA-256 identities for the
standard-library manifest plus all named declaration bytes and both adjacent
semantic Worker bundles. Optional manifest pins are checked before launching
the server; old manifests without those fields remain accepted. A targeted
RED/GREEN covered changed declarations, changed manifest contents and a
preflight mismatch. The full replay CLI suite passed **10/10** tests. The
existing Settings manifest still needs refreshed pins for a formally validated
run of this new build.

```text
node --test tests/references-replay-cli.test.mjs
```

## Real-project check and limits

Two fresh-process Settings/API-24 mode-A replays after the no-DOM selection
returned 248/248 exact `MenuController` Locations each and normal diagnostics.
The file's published diagnostics fell from 18 in the preceding F6b build to
one TS 2307 for `@ohos.systemparameter`; the intermediate full-library build
had two, including TS 2554. The final diagnostic Program had 361 SourceFiles:
27 project, 282 SDK and 52 standard-library files, versus 309 total before
delivery. The final raw transcript, normalized result, and external RSS
samples are preserved in
[`settings-api24-stdlib-no-dom-a-1.json`](/private/tmp/settings-api24-stdlib-no-dom-a-1.json)
and [`settings-api24-stdlib-no-dom-a-2.json`](/private/tmp/settings-api24-stdlib-no-dom-a-2.json).
See the [real-project report](../reports/2026-09-21-settings-api24-standard-library.md)
for fixed inputs and remaining gates.

These two cold runs on successive builds do not graduate cold latency, memory,
cross-SDK diagnostic equivalence, Windows execution or the original >3 GB
references gate.
