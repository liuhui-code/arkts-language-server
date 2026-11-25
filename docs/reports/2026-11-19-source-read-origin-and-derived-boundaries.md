# M4-a: actual source-read origin and pure boundary derivation

2026-11-19. One implemented slice of approved plan A; the full goal remains open.
Worktree `/private/tmp/arkts-repeat-query-20261117`, parent main
`1e3886df3c4d27755a53c073462f1456b0a3de7e`. Frozen Worker
`fb37ca8531f39ff12ab2cb466d6ddedb872a623f30a1d195996682910eec161a`;
Native remains 800e6628, Node20.19.5/x64, compiler4.9.5-r10.
E means main repository `.bench/repeated-query-proof-plan-20261117/implementation-20261118`.
E/runtime-m4-source-origin-identity.json records 309 source hashes and runtime hashes.

## Cause and implementation

ProjectOperationScopes.ensure already reads admitted source bytes but discarded the
physical origin. ScopeSourceBoundaries.get observed root/file again, and
relativeModuleBoundary resolved the containing source again. Existing versioned
inputs did not automatically remove these repeated derivation steps.

- Qualified readDiskSource reads compare descriptor/named mode and return actual
  mode. Admitted snapshots preserve it; five-field admission tokens stay unchanged.
- SourceReadOrigin validates original strong six-field provenance and original
  root mapping, without IO. Only module/reference consumers retain this metadata,
  never another text/AST cache.
- relativeModuleBoundaryFromPhysical classifies the original physical input.
  LoadedConfigurationWitness retains its full original identity for query/final
  validation; conflicting facts cannot be overwritten.
- Native membership/root, configuration/SDK, target/negative resolution witnesses,
  final fencing and cancellation remain. Legacy/weak/missing-mode producers,
  overlays, external SDK and mismatched roots use the original path.

Files: project/source-read-origin and loaded-configuration-witness;
core/types/project-operation-scopes, scope-dependency-graph, scope-module-bindings,
scope-source-boundaries, typescript-source-boundary; core/workspace read adapters.
All these files remain below 500 lines. ADR0045 was refined, remains Proposed.

## Tests and provenance

- m4-source-origin-mode-red/green: controlled second-fstat mode inconsistency
  previously completed preparation; now rejected, same-session actual-read retry
  returns exact definition, one Worker, normal close. Not a Windows field reproduction.
- Initial characterization failed because the fixture confused `/var` lexical and
  `/private` physical roots. Corrected characterization passed 4/4; that fixture
  failure is not the product RED. All original evidence remains.
- m4-boundary-origin-red: public stdio navigation exposed one redundant boundary
  realpath versus expected zero. Final-green passed 27/27, no skip/cancel, exact
  definitions, aliases/escapes/overlap/missing overlays and final source/directory/
  SDK races. Original metadata remains stale after same-text inode or mode change.
- expanded passed 56/56 on the preceding build: namespace move/restore/directory
  deletion, unnotified package/target changes, atomic save, SDK dependencies,
  retained evidence, retries and cancellation. Final build only avoids allocating
  origins without module/reference consumers and reran the 27 focused cases.
  These 56 cases are not advertised as a final full-suite run.
- Final TypeScript check/build passed; full check:fast remains pending.

Focused command under Node20: `node --test --test-concurrency=1 tests/source-read-provenance.test.mjs tests/semantic/navigation-source-origin.test.mjs tests/semantic/scope-dependency-lifecycle.test.mjs tests/semantic/navigation-final-member-fence.test.mjs`.

## Serial 30K comparison

Original isolated Photos input, 30000 sources/29995 eligible, same SDK and target
picker-screen to ScreenManager81:9-20. Process cold, closed warm56 Native cache;
not a fresh cold index. Protocol, not UI/endurance. SDK remains partial and full
references/rename are not proved. Reproducer: E/m4-source-origin-controller.py;
series.json, summary.json and per-run directories retain every result.

| Ordinary timing/resource | M3 control | M4-a candidate |
|---|---:|---:|
| Initialization ms |74285|69979|
| First definition ms |5242.64|5357.95|
| Three hot queries median ms |2716.02|2697.43|
| Hot maximum ms |2722.49|2705.64|
| Node process peak RSS MiB |2105.60|2174.70|
| Native peak RSS MiB |136.95|138.20|

Both exact results, Native30000/30000, SQLite integrity and owned close passed,
without incident. Node RSS already includes shared Worker process memory; no
thread duplication. Heap was not separately measured. One ordinary session/version
cannot prove stable initialization gains or memory leaks. Observed init difference
is -4306ms (5.8%); first is +115ms and hot is essentially unchanged.
Independent candidate diagnostic: init73511, first6173.21, hot median3371.89ms;
all checks passed. Its overhead is not mixed into ordinary timing.

Diagnostic initialization comparison with the preceding M3 diagnostic:

- graph.update31537 to27195ms contains bindings.resolve28281 to23910ms;
  these intervals must not be added.
- role.parse21695 to21971ms, still19771 calls: that hotspot is unresolved.
- Internal query-phase configuration.identity417662 to378314;
  project lstat1046357 to967877.
- Same-phase native-realpath/other55009 to15661 (-39348). `other` includes the
  workspace root; it does not mean all are external files. The observer only
  wraps native realpath, not plain realpath. The separate public fixture proves
  the containing-file plain boundary probe1 to0; do not claim a total syscall count.
- Final project lstat86462 unchanged, final member pass still1. Byte-read guards remain.

Full spans/counts: E/m4-source-origin-initial-stage-comparison.json and original
worker-causes.ndjson.m0.ndjson. Phase names describe internal validation scopes,
not necessarily separate public LSP requests.

## Remaining, rollback and references

Initial binding151631 calls, role parsing19771 and many input observations remain;
hot definition is still about2.7s. True changed-node/reverse-edge updates, M5
uncertainty recovery, scale/edit matrix, full check, Windows UI and endurance remain.
No500ms or size-independent claim. SDKpartial/full-reference limitations remain.
Rollback the origin handoff/pure boundary consumer to original root/file capture;
descriptor mode protection is independently retainable. No DB migration/deployment/merge.

Context7 resolve(Node.js) failed at transport, no library ID/query result obtained.
Fallback pinned official [Node20.19.5 FS documentation](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html)
and [bundled libuv Windows implementation](https://github.com/nodejs/node/blob/v20.19.5/deps/uv/src/win/fs.c).
Windows mode derives from file info; it is not complete POSIX permissions and this
source review is not Windows execution evidence.

## Expanded unit-contract run: environment failure retained

The restricted `pnpm test:unit` run produced sampling failures, including explicit
`spawn EPERM`. A minimal Node spawn of `ps` for its own PID failed with EPERM in
the restricted context and succeeded with permitted sampling (status0). The run
also contained RSS/qualification assertion failures; their exact causes are not
all proved by that probe and must be checked in the permitted rerun.
The owned test tree was stopped with SIGTERM after exact PID/command verification,
exit143, preserving the log and failure index. This is an interrupted failed run,
not a completed suite or a pass. E/m4-restricted-unit-stop.json records the owned
PIDs; E/m4-restricted-unit-failure-index.json retains each failed record.
A complete unit-contract rerun with permitted sampling is running in a new log
`m4-source-origin-unit-permitted.log`; execution.json records its live handle.
No assertion, threshold or test exclusion was changed. Neither run is check:fast.
