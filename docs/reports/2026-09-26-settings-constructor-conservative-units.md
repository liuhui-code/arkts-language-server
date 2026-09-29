# Settings constructor: full-scope semantic-unit experiment

Status: **fixture GREEN; Settings optimization inactive; latency/diagnostic
gate FAIL; default unchanged**. Parent `9f91122ac504365c57473a430094da09baac9309`
plus preceding dirty slices; user `AGENTS.md` edits preserved.

## Fixed environment and oracle

Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; Node v26.3.0,
Darwin 25.6.0 x64. Selected ETS API24 SDK 6.1.1.125 at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Project compile/target/compatible are 23/20/20. This is same-SDK compatibility
investigation, not API23 equivalence or DevEco parity.

Query `common/src/main/ets/core/controller/MenuController.ets`, zero-based
UTF-16 **90:17**, `new MenuController(menu)`, declaration excluded.
The [manifest](../../bench/references/manifests/settings-menucontroller-constructor-units-api24.json)
pins all runtime asset hashes. Server SHA256 is
`12d2e783294fc181757491d09a032cb4442bb1a79b5b9364ac3192865dde82b0`;
semantic worker `7c63f51a21f45237c099106d65fa8b63890ff8eeb8e199e02834f94e5be7c679`.
Strategy indexed-batched, closure, full SDK, roots 64; seed/memo both off.

The new [267-location constructor oracle](../../bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json)
uses the previous same-position fresh legacy result. Known source checks cover
MenuController construction 90:15–29 and `super()` in ExternalMenuController
47:4–9 and WifiPasswordButtonMenuController 58:4–9. Current-build fresh legacy
also matches every normalized path/range tuple. This is compiler differential
evidence, not independent proof of every location/SDK diagnostic. Compiler
zero-width ranges are retained. The 247-location class-declaration oracle is
separate and unchanged; class/constructor identity must not be normalized.

## Trace-only rejection probe

`menu-seed-proof-prefix-A.json` is a deliberately ten-second request probe,
not a successful replay/completed memory benchmark. SHA256
`9bfb539dce2191eaf811bb8a2b34c93a87c8c9d7b79cfb95ab32860acf0da804`.
Default-off trace `references.anchor.seed.proof-rejected` records:

```text
reason=identity-incomplete
supported=true complete=true completeness=ready
identityComplete=false supportComplete=false
seedGeneration=servedGeneration=committedGeneration=1
```

Source resolution before rejection is 58 resolved, zero unresolved. Staleness
and source-resolution failure therefore do not explain the first rejection;
the exact unclassified binding/occurrence remains to be isolated. Compiler
then anchors at constructor 84:2, not exported class 70:13. No proof is bypassed.

## Prototype and real result

Default-off `ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1` lets the existing
planner group **all** legal membership candidates by a ready, complete graph,
even when index narrowing is unavailable. No candidates are excluded.
Unavailable/incomplete graphs retain file batching. Each final batch still
uses exact compiler verification and terminates its Worker, concurrency one.
Public fixtures prove alias/re-export/constructor/derived-super/same-name,
both declaration policies and unsaved-overlay equality with legacy; complete
unit grouping reduces redundant batches. This is not a hard memory bound.

| Run | First request ms | Post-edit ms | Process-tree peak RSS bytes | Overall |
| --- | ---: | ---: | ---: | --- |
| indexed-batched, flag on, mode C | 93,927 | 118,650 | 856,649,728 | FAIL: diagnostic timeout |
| same-build legacy, flag off, mode A | 9,234 | not run | 743,792,640 | PASS |

All eleven mode-C responses equal the oracle (267 locations); nine cache hits
take 37–72 ms. Each miss plans 23 batches over all 1,466 membership files,
`semanticUnitMode=conservative`. **Grouping never activates**; 46 transient
batches complete. Normal diagnostics remain enabled but no publication is
observed by the 180-second deadline; this is not a zero-diagnostic PASS.
Legacy publishes version-1 diagnostics (one diagnostic). Both exit 0.
Cold requests still fail the user's 500 ms goal.

RSS is externally sampled process-tree memory, not Node-only PSS. Worker
threads are not counted twice; harness/sampler are separate. Sample counts
1,576/143; sampler peaks 122,884,096/98,467,840 bytes. No forced GC, snapshots,
disabled diagnostics or changed checkout. Different mode-C/A workflows and
single runs cannot establish paired memory graduation, retention or P95.

Artifacts in `.bench/anchor-reuse-2026-09-26/` retain raw memory samples,
framed request transcript, timeline, normalized results, events and shutdown:

| File | SHA256 |
| --- | --- |
| `menu-conservative-units-C-on-1.json` | `cec3701eb9614e250bda38ac066eaea9e7a235b4a82292559b98f6691cfc4f56` |
| `menu-constructor-units-legacy-A-1.json` | `573825adb321fc5cbe88da1095957f27abb4dbe9c231b15cdf5c79ee20a2be3f` |

## Concrete blocker and next slice

Unchanged Settings through HarmonyProjectModel returns unavailable/incomplete,
reason `semantic-unit-unavailable`. `settings.native` (`native_api`) and
`settings.network` (`feature/network`) omit root module targets, while their
module profiles declare default plus ohosTest. The current omitted-target rule
requires a sole profile target, so these scopes report ambiguous-product-target
and invalidate the graph. Nonexistent source probe paths in other modules were
not treated as evidence of invalid modules.

Next: public framed-LSP RED for omitted root targets plus default/ohosTest;
verify selection semantics and retain ambiguous/explicit-target safety. Repair
the owner if supported, re-catalog and establish a fresh complete-scope oracle
if membership changes; then retry this experiment. Dependency completeness
may be a separate blocker. Do not remove modules, alter their profiles, mark
an incomplete graph complete or silently reuse old scope/oracle. Both flags
remain off; original >3 GB, 50%/PSS, Windows and release gates remain open.

Check/build and **38/38 focused tests** pass (85,425 ms), including cancellation,
index state race/resync, scheduling and coalescing. No new full check:fast PASS
claim, commit, push or merge. [TDD record](../tdd/references-conservative-semantic-units.md).

## Replay

```sh
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=0 ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-constructor-units-api24.json \
  --out .bench/anchor-reuse-2026-09-26/menu-conservative-units-C-on-replay.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Use a new output filename. Manifest rejects changed runtime hashes; explicitly
version a new manifest rather than silently accepting a different build.

## Subsequent target repair (separate build, not the table above)

The public omitted-target LSP regression first fails on a missing unsaved
cross-module construction. Minimal repair in HarmonyProjectModel excludes
ohosTest from implicit candidates, then still requires one production target.
Explicit mappings are untouched; multiple production targets and test-only
profiles remain unavailable. An inactive test-source construction is excluded.
Check/build plus model/target-membership/two unit transcripts pass 38/38 in
26,018 ms. The model remains 494 lines; no real-project profile is modified.

Read-only Settings check now selects default for native/network and produces
32 ready units, but graph completeness is still false. The specific remaining
edge is phone's `@ohos/settings.suggestion: file:../../feature/suggestion`:
the local directory exists but is not a module in the root build profile.
This is different from the repaired target-selection bug. Do not invent that
module declaration, discard the edge or mark the graph complete. The planner
still takes full-scope file fallback. Membership restores 30 previously
excluded files, from 1,466 to 1,496, so new compiler evidence must be obtained
before treating the old oracle as a current-scope golden.

New server SHA256 `7f4e1104b18c574de391313afe92a15c06ede7d3a09f38947fd242a416c06733`,
semantic worker `f6356017a24c13dae786e04da55785e7a6f39bf10c3738c8a0869032d7014502`.
The linked pinned manifest/table describe the **pre-repair** build and remain
unchanged to retain their evidence identity. Next graph work needs a public
test for an undeclared local dependency without losing scope/semantic closure;
the current fail-conservative rule is not waived for speed.

Fresh **post-repair** complete-scope legacy replay:
`menu-constructor-target-fixed-legacy-A-1.json`, SHA256
`89759f5883a765d27dfa8e8953dd93b005e37bda9cc89a971b5c69e963b648af`.
It passes all 267 exact locations in **9,500 ms** despite restored membership.
Process-tree peak RSS **748,560,384 bytes**, 145 samples; sampler peak
106,688,512 bytes, server exit 0. Normal version-1 diagnostics publish one
TS2307 (`@ohos.systemparameter`); no diagnostic-equivalence claim is made.
The old oracle was used as a comparator, not silently assumed valid: the new
fresh compiler result explicitly checks every tuple and known constructions
again. This single control supports keeping the same result set for this
query, not graph completeness, P95, all symbols or the 500 ms goal. Raw JSON
pins the new build; the old manifest is not supplied to this exploratory run.

Post-repair expanded anchor/seed/units/index-race/resync/scheduling/coalescing/
transport/inventory suite also passes **39/39** (94,228 ms), zero skipped or
cancelled. This is separate from the 38 model/target/unit cases and is not a
full check:fast/release result. No commits, pushes or merges were performed.
