# Settings rejected-anchor complete-scope retry

Status: **exactness/normal-diagnostic smoke PASS; 500 ms latency FAIL**.
R-10 fallback fusion avoids one redundant definition preparation. Constructor
candidate completeness and final memory-release gates remain open.

## Change and public evidence

The [TDD transcript](../tdd/references-rejected-anchor-complete-retry.md)
proves the previous retry built another isolated definition Program after
rejecting a discovery anchor. The executor now discards candidate scope and
collected Locations, removes the rejected expected anchor, and replays all
legal membership using the same immutable request snapshot. No symbols or
definitions from the rejected Program are reused. The transient Worker has
terminated before the next batch. Existing checkpoint, overlay authority and
final revision checks remain mandatory.

Explicit/implicit constructors, direct/re-export aliases, inherited `new Leaf`,
`super`, same-name exclusion and both declaration policies match their own
legacy oracles, including trace-off. Parameter shadowing remains exact.
Cancellation and edit **after** rejection return -32800/-32801 without partial
results; fresh recovery passes. No Rust/schema, new flag, budget, concurrency,
SDK profile or persistent Worker/LS changes. Experimental seed/grouping remain
opt-in. No commit, push or merge.

## Frozen environment

- Parent server HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty
  `codex/references-f2-fixed-benchmark`; user changes preserved.
- Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`,
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`, no source/target edits.
- Node v26.3.0, `ohos-typescript` 4.9.5-r10, macOS Darwin 25.6 x64.
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API24 / 6.1.1.125; digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Project 23/20/20 declarations unchanged: explicit API24 compatibility probe,
  not exact DevEco/API23 diagnostic parity.
- Query `common/src/main/ets/core/controller/MenuController.ets`,
  `MenuController`, zero-based UTF-16 **90:17**, declaration excluded.
  Separate 267-location constructor oracle; never substitute 247 class refs.
- [Manifest](../../bench/references/manifests/settings-menucontroller-seed-complete-retry-api24.json)
  pins repo/SDK/oracle/server/Workers/standard-library/sidecar hashes.
  Earlier manifests and raw runs are not overwritten.
- Indexed-batched, closure, full SDK, 64 roots. Existing local-export seed and
  conservative semantic-unit experiments explicitly on; anchor memo off.
  Automatic diagnostics on; no forced GC, snapshots or truncation.

Authorized read-only `pmset -g therm` at 2026-09-27 02:11:44 +0800 reports
scheduler 100, available CPUs 12, speed limit 100. This snapshot does not prove
constant clock/thermal behavior throughout the run. No test suite runs
concurrently with the replay. Do not compare latency with the prior 35/28
speed-limit constructor probe as a code improvement.

## Result and attribution

One fresh-process replay: **PASS**, 267 exact URI+range tuples, legal UTF-16,
normal version-1 diagnostics (one unresolved `@ohos.systemparameter` diagnostic),
normal shutdown/exit 0. No OOM, timeout or partial response.

| Observation | Value |
| --- | ---: |
| References request | 52,121 ms |
| Product process-tree peak RSS | 887,697,408 bytes |
| Node PID peak RSS | 843,218,944 bytes |
| External samples | 470 |
| Completed conservative batches | 14 |
| Membership / retry candidates | 1,496 / 1,496 |
| Maximum project Program SourceFiles | 1,348 |
| Summed successful batch Program readiness | 39,618.57 ms |
| Standalone anchor completions | 0 |
| Diagnostic publication after reference response | 2,031 ms |

Timeline: pending class-export seed → 60-candidate attempted plan → compiler
anchor mismatch → complete-scope retry → 14 batches → 267 exact references.
No narrowed result survives mismatch; no standalone anchor is built in between.
The successful-batch readiness sum excludes the rejected batch and is not an
additive exact CPU breakdown. The rejected attempt still pays preparation;
this change only removes redundant re-anchoring, not all cold Programs.

The 52.121-second request still **fails 500 ms**. Normal diagnostic publication
passes the unchanged replay deadline but occurs after references; this is not
proof of nonblocking diagnostic latency. One run is not a P95, retention plateau,
three-process replication or memory no-regression gate. Node Worker RSS is
process-level, not summed again. Product tree, sampler and harness are separate;
50 ms is the requested sampling interval, not a guaranteed `ps` cadence.

## Replay and raw evidence

Raw `.bench/anchor-reuse-2026-09-27/menu-seed-complete-retry-A-1.json` contains
external RSS samples, request/diagnostic timeline, complete normalized references,
effective environment, events and exit evidence. SHA256:
`fcd7ec10586146fa69fd8618625901b49f59601189dc546e73ed11f35707f0a7`.

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-seed-complete-retry-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-seed-complete-retry-A-new.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

## Verification and remaining gates

Focused constructor/parameter: 2/2 PASS, 92,002 ms. Post-rejection cancel/edit:
2/2 PASS, 10,000 ms. Final authorized `pnpm check:fast`: **995/995 PASS**, exit 0,
zero failures/cancellations/skips/todos, 889,268.737 ms. It includes type check
and a fresh build. The previous 993/993 result belongs to the preceding build;
this is a separate whole-suite run against the changed executor. Nested
SKIP/TODO transcripts deliberately test rejection by the gate, not skipped
acceptance cases. Runtime/oracle pins and document links match; `git diff --check`
passes. No native Windows performance validation or Rust/schema changes.

Touched executor/test are 340/463 physical lines, below 500. Constructor-specific
candidate completeness, cold/edit ≤500 ms, original >3 GB reproducer, 50% memory
gate, controlled release distributions and native Windows performance remain
open. Do not promote identity, seed/grouping experiments or Worker reuse based
on this safe fallback fusion.
