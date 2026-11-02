# PR112: native fixture identities on macOS

Streaming parent: `50317e4a50a35061e5db938747864a7465e3db35`.
Review branch parent: `fcaa9b5` (the independent Node diagnostic-fixture correction).
macOS, Rust1.95.0, default TMPDIR and the real debug sidecar/NDJSON protocol.

## RED and controlled comparison

The four new SQLite target files passed12/12. The subsequent default-environment
sidecar command failed in `catalog_hash_fences`: two tests passed, but
`hash_miss_refuses_changed_deleted_or_grown_source_on_second_read` timed out
waiting for its `first_wait` trace. The complete command stopped there with101;
later files and release build were not executed by that failed command.

The fixture built its gate URI from a lexical temp path under `/var/folders/...`.
On this Mac that path resolves under `/private/var/folders/...`. Production
initialize, `main.rs`, canonicalizes the workspace before scanning; its parser
job URI therefore used the physical path and never matched the lexical gate URI.
The test failed before injecting its intended second-read mutation.

One exact-test control changed only TMPDIR to `/private/tmp`, with the same debug
sidecar and original assertion. It passed all three mutation subscenarios in
9.12s. This is diagnostic evidence, not the final fix or a reason to require
users to change their temp directory. Original logs remain retained.

Before the fixture correction, a new Unix public-protocol characterization
passed: initialize through an explicit directory symlink, use the native
physical source URI for the parser gate, observe that gate, query the unchanged
old generation, release the gate, and verify the new generation and parser count.
The lexical and physical source URIs must actually differ.

## Minimal correction

`TestDir::new` still creates an isolated owned directory, then returns its actual
`fs::canonicalize` identity. Test-specified source gates and injected scanner
paths now use the same namespace as native initialize. No case folding, identity
comparison removal, production resolver change or TMPDIR override is introduced.
The explicit aliased-workspace characterization preserves coverage of lexical
versus physical roots instead of relying on an accidental OS temp alias.

Default-environment verification after correction:

```sh
cargo test --locked -p arkts-index-sidecar \
  --test catalog_hash_fences --test catalog_hash_first \
  --test catalog_hash_qualification --test catalog_scan_errors \
  --test catalog_stream_equivalence --test catalog_streaming
cargo build --locked --release -p arkts-index-sidecar
cargo fmt --all --check
```

All six complete sidecar files passed14/14, no failures/ignored tests; the
relevant release build and formatting check passed. Together with the prior
four complete SQLite targets this supplies26 focused cases, not a whole-workspace
pass. The final combined Node checks and new-head complete CI are separate
receipts recorded in the PR review. No fresh Windows filesystem/UI claim follows
from these Mac tests; the explicit symlink characterization is Unix-only.

Raw local evidence under `.bench/pr112-review-20261103/`:
`streaming-focused.log` (original failure),
`streaming-physical-temp-control.log`, `streaming-alias-characterization.log`,
`streaming-sidecar-final.log`, `final-release-build.log`.
The corrected debug binary SHA256 is
`18ea5d3fa854f225bf6ea4a40ef531c301a2a8d4e8009408d6e36137264d62ce`;
the release sidecar SHA256 is
`4dce8fc2ea2a8a3317d789da0aa1bdd539a67538909545994c7b8a187851a9b5`.
These are local artifact identities, not a deployed installation.

ADR0005 physical identity and ADR0013 retained-failure rules remain unchanged.
The streaming report's prior100K cost failure, adverse timings and open real
Windows/UI/endurance limits remain recorded and are not resolved by this fixture fix.
