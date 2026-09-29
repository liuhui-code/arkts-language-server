# Shared lexical scan for cold catalog preparation

Parent revision: `3291290fc43f45e95a2ce5ad47ee2cc4c216015e`.
Public boundaries: `parse_document_symbols`, class-heritage/snapshot store
contracts, and the original framed sidecar cold-catalog performance test.
This fixes a merge-gate regression; it does not graduate navigation latency or
the references memory plan.

## RED and controls

PR #91 [run 36511588092](https://github.com/liuhui-code/arkts-language-server/actions/runs/36511588092)
passes all 1,103 Node tests and the regular Rust tests. Its explicit pinned
455-file cold-catalog test fails at **3.603547961 s** against the unchanged
**3 s** assertion. The timing assertion precedes ready/count/query assertions;
the failed run does not prove those later assertions passed.

The gate has always used Cargo's debug test profile and its
`CARGO_BIN_EXE_arkts-index-sidecar`. A release binary built for Node tests does
not change that binding. Changing the gate to release or raising the budget
would not repair the existing performance contract.

The public command, unchanged before and after the repair, is:

```sh
ARKTS_INDEX_REAL_FIXTURE=/private/tmp/arkts-merge-catalog.JmOzOS/nim-uikit-harmony \
  cargo test --locked -p arkts-index-sidecar --test ndjson_protocol \
  pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates \
  -- --ignored --exact --nocapture
```

The fixture is a clean checkout of
`netease-kit/nim-uikit-harmony@585feb45114a128a0d2a23947c83faf338e758f7`.
It remains the pre-existing CI regression fixture; Settings remains the real
references benchmark project. No files, SDK settings or project boundaries are
changed to make this control pass.

Three pre-repair local debug runs pass **1/3**, with failures at
**3.042061405 s** and **3.021799947 s**. An independent archive of main
`d2e8b06975dc2112849f394d26f2d074051d385a`, built in a separate target directory
against the same fixture/host/fresh databases, passes **3/3**. This is evidence
against attributing the failure solely to GitHub runner variance.

A separate default-off SQL observer reports `totalMs=2161.335`,
`insertReferencesMs=1623.073`, `insertExportsMs=26.521` and `commitMs=298.059`.
It neither measures all source parsing nor replaces trace-off gate evidence.
No percentage of the CI delay is inferred from this observation.

## Characterize → reuse → verify

Before editing, existing public core characterization passes **25/25**, and
SQLite heritage/snapshot characterization passes **14/14**. These protect
UTF-16 ranges, CRLF/comments, templates/regex uncertainty, unsupported imports,
provenance, generation fences and reopened stores. In particular,
`class Child { [ } ]` remains accepted for legacy symbol discovery while its
strict heritage facts remain unknown.

`document_metadata` now owns one `tokenize_with_status` and one `LineIndex` per
complete document parse. Legacy symbol extraction, heritage and binding
provenance borrow these immutable inputs. The removed legacy scanner wrapper
only disabled uncertainty reporting; that flag never changed tokens or errors.
Consumers still receive the true uncertainty state.

The public standalone heritage parser retains its original signature and
behavior. Its stricter delimiter validation remains independent; failure still
becomes `class_heritage=None` in metadata assembly, not a new document rejection.
All classification, source-gap validation, ordering, ranges and storage facts
remain unchanged. No metadata becomes compiler identity/completeness proof.

The cohesive symbol extractor moves out of the oversized `lib.rs` into the
existing metadata owner: `lib.rs` shrinks **1557→1313** physical lines;
`document_metadata.rs` is **313** lines. Other touched files remain <=500.
The remaining oversized root is still migration debt, not a waived limit.

Core plus SQLite tests after reuse pass **130/130**, zero failures. An initial
three-run gate group overlaps the tail of focused Rust testing and passes
2/3, retaining the first failure at 3.180914585 s. It is not presented as three
clean passes. After that work finishes, three fixed alternating main/repaired
controls each use fresh databases and the original debug/3 s contract:
**main 3/3 PASS, repair 3/3 PASS**. All repaired runs execute the ready/455-file
and deterministic query assertions. OS file cache is uncontrolled; passing
test durations are not reported as exact cold-catalog durations.

## Evidence and remaining merge requirements

Raw local evidence is retained under `.bench/merge-2026-09-29/`:

- `ci-3291290-validate.log`
- `pinned-catalog-current-debug-{1,2,3}.log`
- `pinned-catalog-main-debug-{1,2,3}.log`
- `pinned-catalog-current-sql.{log,ndjson}`
- `shared-scan-characterization-before.log`, `shared-scan-store-before.log`
- `shared-scan-focused-green.log`
- `pinned-catalog-shared-scan-green-{1,2,3}.log` (includes the overlap failure)
- `pinned-catalog-isolated-{main,shared}-{1,2,3}.log`

Fresh workspace tests pass **182/0 failed/1 pre-existing ignored**; strict
workspace/all-target Clippy, formatting and default-feature release build pass.
Full `pnpm check:fast` and Linux/Windows CI on the repaired commit are still
required before merge.
No CI retry is used to erase the original failure. Schema, durability, index
content, diagnostics, working-set policies, worker lifecycle, request deadlines
and the 3 s gate are unchanged. The user's `AGENTS.md` edit stays unstaged.
