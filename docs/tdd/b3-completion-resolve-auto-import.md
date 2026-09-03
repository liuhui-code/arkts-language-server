# B1b/B2b/B3 completion resolve and auto-import TDD evidence

- Initial tested parent: `3b5f76c1e919cfe1501b2a8038c5fef2c5e2fb74`
- B1a list-fidelity prerequisite: `537b9ac6f881ebcce9efbc60c936234ed88dd815`
- Concurrent project-file-set prerequisite: `052c670bd71cbf4aea68c0eaf1f1c34b4860e2f0`
- Public boundary: a real materialized `Home.ets` session through bundled
  `dist/server.cjs --stdio`, plus a real scripted semantic-server process for
  cancellation and lifecycle behavior

## Walking transcript RED to GREEN

Focused command used after each production change:

```sh
pnpm build
node --test \
  --test-name-pattern='resolves and applies an unopened class auto-import through the production server' \
  tests/semantic/semantic-characterization.test.mjs
```

The single transcript opens only materialized `Home.ets`, whose completion
marker follows an emoji and is therefore measured in UTF-16 code units. It then
walked through these stable failures:

1. RED: the list item exposed TypeScript internals as `provider`,
   `engineVersion`, `entrySource`, and `entryData`, rather than an opaque value.
   The focused result was `0/1` passed.
2. GREEN for list privacy, then RED: the opaque item reached
   `completionItem/resolve`, which returned `-32601 Unhandled method`.
3. GREEN for resolve routing and the public semantic port, then integration
   RED: an intermediate canonical/lexical root mismatch produced a long import
   path back into `/private/var/...`. The independently tested project-file-set
   fix in `052c670` restored the deterministic workspace-relative import
   `../services/Greeter.ets` without a workaround in the completion adapter.
4. GREEN for the import edit, then RED: after applying both edits and sending
   `didChange` version 2, diagnostics still reported unknown `Entry` and
   `Component`. The discovered SDK ambient prelude was absent from the
   TypeScript project.
5. GREEN: the TypeScript host now includes at most one fixed SDK component
   prelude: production `common.d.ts`, or the conformance SDK's `arkui.d.ts`
   fallback. It performs no SDK directory traversal and does not expand with
   project size.

Before capability advertisement, the full transcript passed while still
asserting that `completionProvider.resolveProvider` was absent. It proved:

- exactly one unopened `Greeter` class candidate and exact UTF-16 replacement
  `textEdit`;
- a UUID-only public `data` envelope, retained unchanged by resolve;
- resolved class detail and the exact Greeter JSDoc;
- exactly one version-bound import edit at `{ line: 0, character: 0 }`;
- safe combined application via the existing `applyTextEdits` helper;
- `publishDiagnostics` for version 2 with an empty diagnostics array;
- exact definition navigation to the complete `greeter.definition` range.

## Resolve data trust boundary

The LSP adapter keeps the actual semantic completion in a server-side registry
bounded to 512 entries. The public UUID indexes a record bound to document URI,
document version, and original completion position. Resolve uses only this
record; client-supplied label, detail, position-related edits, and semantic
provider data are never authoritative. Entries are discarded on document
change, close, server disposal, and oldest-first capacity eviction. Returned
additional edits must match both the recorded URI and version before conversion
to LSP `TextEdit`.

The scripted protocol command was:

```sh
node --test tests/lsp-reliability.test.mjs
```

Its cancellation slice was first RED with `-32603` because the scripted port
did not implement resolve; after the minimal abort-aware implementation, the
client received `-32800 RequestCancelled`. The suite also proves that forged
UUIDs and version-1 items after `didChange` version 2 receive `-32602`, altered
client label/detail fields are ignored in favor of the server record, resolve
after shutdown receives `-32600`, and the server still disposes exactly once.

Final result: `8/8` passed, `0` failed, `0` skipped.

## Capability evidence gate

Only after the bundle and protocol transcripts were GREEN, changing the bundle
assertion to `resolveProvider: true` produced RED (`undefined` received), and
updating the expected feature audit produced RED because `completion-resolve`
was still planned. GREEN then:

- advertises `completionProvider.resolveProvider: true`;
- moves that path from absent to required in the capability contract;
- enables `completion-resolve` with protocol evidence from
  `tests/lsp-reliability.test.mjs` and bundle evidence from
  `tests/semantic/semantic-characterization.test.mjs`;
- records the existing installed-artifact evidence for completion, definition,
  and diagnostics while retaining an explicit completion-resolve artifact gap.

Final verification commands:

```sh
pnpm check
pnpm build
node --test tests/semantic/semantic-characterization.test.mjs
node --test tests/lsp-reliability.test.mjs
node --test tests/lsp-capability-contract.test.mjs tests/lsp-feature-matrix.test.mjs
```

Final results were respectively: TypeScript check and bundle build passed;
`5/5`, `8/8`, and `4/4` tests passed with no failures or skips. This slice did
not modify `SemanticDocumentStore`, test manifests,
package scripts, CI, release workflows, or installed artifacts.
