# Settings: conservative class-heritage metadata check

Status: lexical prerequisite implemented and tested; constructor candidate
narrowing and latency graduation remain **open**.

Server checkout: `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; no existing changes reset/overwritten.
Project: clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`, unchanged boundaries.

## Read-only real-source check

A temporary Rust probe calls the new public core API on four fixed source
files, without running a compiler or loading an SDK. This is **not** LSP E2E,
reference Location validation, or a memory/latency experiment. SDK/API24 remains
the selected comparison environment for later semantic benchmarks.

| Workspace-relative file | Named lexical facts | Lexically complete |
| --- | ---: | --- |
| `common/src/main/ets/core/controller/MenuController.ets` | 38 | false |
| `common/src/main/ets/core/controller/Controller.ets` | 3 | false |
| `feature/wifi/src/main/ets/controller/WifiSetupProxyControllers.ets` | 3 | false |
| `feature/wifi/src/main/ets/controller/WifiSetupIpControllers.ets` | 3 | false |

Examples use zero-based UTF-16 positions:

- `MenuController`: name `70:13–70:27`; base spelling `Controller`,
  `70:36–70:46`.
- `WifiSetupProxyEntryController`: name `84:13–84:42`; base spelling
  `MenuController`, `84:51–84:65`.
- `Controller implements ...` and `WifiSetupIpEntryController ... implements ...`
  are outside the simple-header subset and are not emitted as complete facts.

Partial counts are **not** actual class totals. All four files withhold
completeness; no inference that omitted classes/constructor references are
absent is permitted. This proves the conservative path remains necessary on
the actual target, not that lexical metadata has solved the compiler workload.

Raw probe/source/result and real-stdio regression log:
`/private/tmp/arkts-heritage-validation.991hpj/`.
`settings-facts.txt` SHA-256:
`cb292e5486713e71032e2ed81a44f8221d0ca6672725c28dd7267ac5cb31dcdf`.
Release sidecar SHA-256 after this build:
`e32f5154ba9b1048cc5954ab021b1ed18503aa75704b26df712af530e7ed424e`.
Earlier benchmark manifests are not silently repinned to this new binary.

## Verification and interpretation

[TDD record](../tdd/references-class-heritage-facts.md): 10 new public Rust API
tests GREEN; workspace 96 passed/1 existing ignored; release build, TypeScript
check/build, formatting and diff checks pass. The three public real-child-process
LSP suites pass **9/9**, 51,907.250 ms total suite duration, zero failures/skips.
That duration is not a Settings request latency.

No new performance replay was made for this metadata-only slice. Last actual
[Settings semantic replay](2026-09-27-settings-full-search-coverage.md) remains
267 exact constructor Locations, 54,306 ms, 841,601,024-byte Node peak, normal
diagnostics and no full-scope early-completion proof. Those historical metrics
are not claimed as measurements of the newly built sidecar.

Next implementation gate: persist discovery facts with generation/reopen
integrity, then resolve bindings and establish compiler-backed constructor
candidate completeness. Lexical facts alone must never replace that proof.
