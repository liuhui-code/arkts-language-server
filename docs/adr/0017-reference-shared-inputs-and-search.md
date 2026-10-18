# ADR 0017: Reuse verifier library inputs, SDK lookups and classified reference searches

- Status: Accepted by maintainer instruction on 2026-10-18; implemented and regression-verified, full fast **1872/1872 PASS**. The **500ms performance requirement remains FAIL**.
- Follow-up: [ADR 0018](0018-semantic-groups-and-initial-preparation.md) accepts initialization-time preparation outside configurable runtime pressure, stable groups and delayed project disposal. It replaces per-job project disposal for migrated contexts; the 1872/1872 result here certifies only this earlier implementation.
- Extends ADR 0016's retained SDK syntax to the compiler's standard libraries and SDK-internal lookup results. Retains one serial Worker, fresh per-job project LanguageService, full scope, current-input fences and disposal before publication.
- Performance requirement: every complete reference response within **500ms**. The existing 20s transcript timeout is a hang guard, not acceptance. No performance graduation without measured complete responses.

## Evidence

[Post-cache attribution](../tdd/op00-reference-sdk-cache-attribution.md) reproduced the 403-file case at 9.76–9.85s. Fourteen fresh Programs spend 84.4% of a traced replay in readiness. Internal observations identify repeated SDK relative-import path/freshness checks (4.805s), SDK text acquisition (0.885s), and 52 standard libraries parsed fourteen times (0.768s including reads/binding). Switching `includeDeclaration` triggers a second seven-batch search, although the compiler already returns definition classification before our filter.

## Decision

1. Retain compatible standard-library SourceFiles alongside current SDK SourceFiles through the existing DocumentRegistry. Compiler artifact, actual snapshot bytes and parsing settings define compatibility; a constant host version is insufficient. Keep project leases job-scoped.
2. Reuse SDK-internal candidate lookup results, including genuine negative lookups, in the existing serial verifier isolate. Capture identities at their original actual lookup. Validate retained facts before reuse and before publishing; replacement, creation of a higher-priority candidate, deletion, configuration changes and symlink retargeting invalidate dependent reuse. Preserve ArkTS extension priority and canonical containment checks. Reuse must not manufacture a new witness for a cached answer or rely solely on watcher delivery.
3. Retain complete classified reference-search output before declaration filtering. Under the same current project/overlay/dependency inputs, project both declaration policies from that search. Each policy keeps its own boundary, source mapping and completeness checks. An incomplete result is never upgraded by caching; excluding declarations must not fail merely because a discarded declaration cannot be published. Distinct batches still prove their own project-file scope.

Use existing Worker ownership and result-cache limits. These changes require neither a new eviction framework nor retaining all project Programs. They do not replace official compiler authority with lexical matches. SDK path lookup reuse must stay independent of project-specific import resolution and overlays.

## Implementation and verification

Work in vertical RED/GREEN slices through real framed-stdio LSP transcripts: standard-library parse reuse first; then SDK lookup reuse and unnotified filesystem mutations; then declaration-policy search reuse with exact overload, external-definition, overlay, cancellation and complete-scope results. Observe genuine compiler/IO calls without replacing their results.

Preserve existing original 403-file oracles and deadlines, measure per-request transport time separately from test duration, and test with both the default environment and a writable index cache. Record default index permission degradation; a ready index can still require complete fallback. Run focused suites and `pnpm check:fast`. Report remaining latency above 500ms explicitly.

All three slices are implemented. The complete `pnpm check:fast` run exits **0**, with **1872 passed**, zero failed/cancelled/skipped/todo. Before/after verification binds the same 692 code inputs, 82 artifacts and compiler/SDK identities; unrelated pre-existing workspace changes remain preserved. RED/GREEN commands, integration qualifications and measurement evidence are recorded in [the implementation record](../tdd/op00-reference-shared-inputs.md).

In the unchanged 403-file transcript, SDK parsing is now once per each of 255 files, standard-library parsing once per each of 52 files, and declaration policies share one seven-job search. Three isolated transport replays still measure **3791–3971ms** for the first complete response, followed by roughly **1–2ms** cached responses. The whole four-request case falls from approximately 9.8s to **4.05–4.23s**. Neither correctness regression success nor cached latency satisfies the cold 500ms requirement. First SDK parsing and fresh Program preparation remain on that request's critical path.

A separate forced-GC observation measures **165.8–167.1MiB** of live heap in the entire retained verifier isolate after project disposal. This includes SDK, standard libraries and runtime; it is neither SDK-only incremental memory nor RSS, and that instrumented replay is excluded from latency acceptance.

Official precedents: TypeScript [shared DocumentRegistry and snapshots](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API), [4.9 Program resolution/oldProgram reuse](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/compiler/program.ts), [file/directory watching](https://www.typescriptlang.org/docs/handbook/configuring-watch.html), and clangd's [per-file reference index](https://clangd.llvm.org/design/indexing). Our unnotified-change contract still requires explicit current-input proofs.
