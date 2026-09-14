# References multi-batch identity anchor gate

## Outcome

Identity-bounded references can now verify more candidates than one root batch
without losing references. The Rust index returns the declaration URI as an
explicit field beside its opaque declaration identity. The reference executor
pins that declaration file into every identity batch, so each fresh compiler
Program can resolve the query symbol before calling `findReferences()`.

The safety boundary remains strict:

- the index proof must be complete;
- the declaration URI must be a member of the exact identity candidate set;
- every batch still contains the query/open document and the declaration;
- an absent or inconsistent declaration URI keeps the dependency profile on
  conservative closure;
- the compiler remains the only authority for returned Locations.

Production remains `legacy`, and the dependency profile remains `closure` by
default.

## TDD result

Parent revision: `5c0b4ebdea42573c233ffd0bf482575371630561`.

The public LSP RED changed the direct-import fixture to
`batch-roots=1`. Before the anchor contract, the requested identity profile
fell back to closure and its consumer batch loaded the six-file irrelevant
dependency chain. The Rust NDJSON RED separately required the reference result
to expose the actual declaration URI; the old response returned `null`.

GREEN passes the declaration URI through the in-memory and SQLite stores,
sidecar protocol, TypeScript adapter, semantic-worker protocol, and reference
executor. The public LSP fixture runs two sequential identity batches, returns
the exact conservative Location set, and reduces the largest project Program
from nine files to three.

## Real Photos usage-site gate

The fixed query starts at a real import usage rather than at the declaration.
This ensures that the declaration must be reconstructed in every compiler
Program.

```text
workspace: OpenHarmony applications_photos
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       DevEco API 24 / 6.1.1.125
Node:      v26.3.0
file:      feature/privacy/src/main/ets/about/AgreementConfig.ets
symbol:    Routers
position:  20:16 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Three independent legacy processes and three independent identity-batched
processes all returned the same 19 normalized Locations and the same eight
normal diagnostics for the opened usage document.

| Strategy | Request runs | Peak RSS runs |
|---|---|---|
| legacy | 8.953 / 8.872 / 9.026 s | 807,149,568 / 811,466,752 / 803,962,880 B |
| identity, root limit 1 | 5.710 / 6.542 / 8.127 s | 425,357,312 / 417,001,472 / 451,002,368 B |

The identity median is 6.542 seconds and 425,357,312 bytes versus the legacy
median of 8.953 seconds and 807,149,568 bytes. That is a 26.94% latency
improvement and a 47.30% product-tree RSS reduction.

Every identity run completed two sequential batches with zero closure
expansion. The maximum Program contained 127 SourceFiles: three project files
and 124 SDK declarations. The two batches independently returned overlapping
exact subsets which were merged and deduplicated to the 19-item oracle.

This closes the real multi-batch correctness gate, but not the release gate.
The measured 0.527 peak-RSS ratio remains above the planned 0.50 target, and
this is still not the user-reported greater-than-3-GB project.

Machine-readable summary:
[`evidence/2026-09-15-references-multibatch-identity-anchor.json`](evidence/2026-09-15-references-multibatch-identity-anchor.json).

## Replay

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file feature/privacy/src/main/ets/about/AgreementConfig.ets \
  --symbol Routers --line 20 --character 16 \
  --oracle /private/tmp/photos-routers-legacy-pass.json \
  --out /private/tmp/photos-routers-usage-identity.json \
  --mode A --strategy indexed-batched --sdk-profile common \
  --dependency-profile identity --batch-roots 1 \
  --trace --idle-ms 0 --timeout-ms 60000
```

## Next gate

The remaining first-stage work is not another root-count reduction. The
identity verifier is already at three project files in this real case. The
next experiment must profile the remaining 124 SDK roots and verifier setup
cost, or obtain the original greater-than-3-GB reproducer. No release default
may change until exact correctness holds across the broader symbol matrix and
the final memory threshold passes.
