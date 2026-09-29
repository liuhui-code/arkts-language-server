# Settings usage-site anchor baseline

Parent revision: `76d87e3`. This slice adds a pinned real-project benchmark
input; it does not change reference semantics, Worker lifetime or memory policy.
The separate user-owned `AGENTS.md` edit was left untouched.

## RED

The existing child-process, Content-Length-framed replay CLI could run the
`HomeInitData` usage at zero-based UTF-16 `28:30` with the verified nine-location
oracle, but there was no manifest pinning that **usage** position and the
current runtime artifacts. The stable command below, with the new manifest
path, exited 2 before starting an LSP request:

```text
ENOENT: no such file or directory, stat '.../bench/references/manifests/settings-homeinitdata-api24-usage-no-declaration.json'
```

That is a benchmark reproducibility RED, not a semantic failure. Two earlier
unmanifested exploratory replays had already returned 9/9 exact Locations for
legacy and indexed-batched; they are not substituted for the pinned GREEN.

## GREEN

Added only the usage-position manifest. It pins the clean Settings SHA,
selected API-24 SDK declaration digest, Node, query and existing compiler
oracle, server, semantic Worker, verifier Worker, standard-library assets and
Rust sidecar. Its oracle digest matches the existing
`settings-homeinitdata-api24-no-declaration.json` byte-for-byte. The manifest
does not silently claim the project's declared compile API 23 is installed.

Six independent process/index-cold mode-A replays (three legacy, three
indexed-batched) passed exact normalized URI/range comparison: each returned
all nine known references, with no missing or extra Location. All six observed
normal version-1 `publishDiagnostics` with an empty target-file list. The
indexed trace in every run emitted `references.anchor.complete`, then
`references.index.accepted` with `compiler-definition-identity`, then one
`references.batch.complete`. The separate anchor Program and batch Program
are therefore an observed cost, not an inferred one. See the
[results report](../reports/2026-09-21-settings-usage-anchor-baseline.md).

Reproduce one indexed run from the repository root:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-usage-no-declaration.json \
  --out /private/tmp/settings-homeinitdata-usage-recheck.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

`R-10` remains research: this baseline does **not** establish that fusing
anchor and batch Programs preserves re-export, overlay, mutation and
cancellation behavior, nor that its full ~2-second anchor duration is
removable. Any implementation must start with a failing public-LSP transcript
requiring exact Locations and a lower Program count, then pass independent RSS
and correctness comparison before graduation.

## Verification on this Mac

`pnpm check` passed. `node --test tests/references-replay-cli.test.mjs`
passed 10/10 with external process sampling permitted. The six pinned real
replays passed 6/6 exactness. `git diff --check` passed.

The subsequent full `pnpm check:fast` on this host **failed 937/950**: its 13
failures were LSP-response wait timeouts, including the 403-file references
completeness test and several 5-second rename/navigation waits. An unchanged
rename test and workspace-symbol test passed in isolated reruns (4.73 and
4.51 seconds respectively, close to their 5-second deadlines); the unchanged
403-file references test still timed out after 20 seconds in isolation. The
large test's stderr showed the index not yet open when references began,
followed by a ready 403/403 catalog; its safe fallback had not answered by
the test deadline. These are **open local gate failures**, not a claimed
regression fix or a passing full gate. This slice touched no production or
test code, and did not change timeout values. The previous PR revision's
independent `validate` and `windows-install` checks passed; the new revision
must be checked independently after it is pushed.
