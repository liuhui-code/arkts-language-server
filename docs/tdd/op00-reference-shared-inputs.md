# OP00: Shared verifier inputs and classified reference search

Decision: [ADR 0017](../adr/0017-reference-shared-inputs-and-search.md).
Parent: `a111235bc4bfcb55b126752f95b3ba095f2996af`, branch `codex/op00-query-attribution`.
The dirty pre-change workspace is preserved in `.bench/op00-reference-reuse-v2/baseline.sources.jsonl`; baseline runtime hashes are in `baseline.json`. Preserve unrelated existing work.

Requirement: complete responses within 500ms. The 20s test timeout is only a hang guard. All three reuse slices are implemented and regression-verified; the 500ms requirement remains **FAIL**.

## Slice 1: retain standard-library syntax

Public transcript: `node --test --test-name-pattern='serial reference jobs reuse SDK syntax' tests/semantic/references-sdk-cache.test.mjs`, Node 20.19.5. Add an observation of genuine standard-library parser calls across real anchor/reference jobs, preserving all exact Location assertions and unnotified SDK/configuration mutation checks.

RED (`stdlib-red.log`, exit 1): all 52 actual `lib.*.d.ts` files parsed **8 times**. GREEN (`stdlib-green.log`, exit 0): each parses once, with the original SDK-byte/loader/configuration Location assertions passing. Registry receipts now distinguish SDK pins, compiler-library pins and project leases; retained project leases must remain zero.

## Slice 2: witnessed SDK candidate lookup reuse

RED command: `node --test --test-name-pattern='serial verifier reuses SDK candidate probes' tests/semantic/references-sdk-cache.test.mjs` (`lookup-red.log`, exit 1): one unchanged SDK candidate produces **588 genuine leaf lstat attempts** across real serial jobs, exceeding the <=8 assertion. The minimal verifier-only lookup cache captures actual original witnesses, validates before reuse and after each job, and preserves canonical boundary resolution. GREEN (`lookup-green.log`, exit 0) passes exact results plus unnotified higher-priority creation, deletion and same-path symlink retargeting; the new file's genuine parser receipt verifies actual refresh.

Existing engine characterization passed 4/4 before extracting module resolution (`engine-characterization.log`). After the lookup fix was GREEN, the cohesive package/SDK/relative resolution responsibility was extracted from the pre-existing 3,241-line engine into `typescript-module-resolution.ts`; the engine shrinks toward the 500-line limit and its remaining size is migration debt.

The extracted implementation and original SDK mutation/lease-release guards passed **8/8** together (`lookup-extraction-green.log`). Project leases remain zero while SDK and standard-library pins remain explicitly counted.

## Slice 3: share the classified search between declaration policies

RED: the same initial public SDK transcript asserted no additional compiler jobs when switching `includeDeclaration`; it failed **8 jobs versus 4** (`policy-red.log`, exit 1). The real compiler's classified references now produce an optional independently complete alternative projection before filtering; batches merge that projection only if every batch proves it. The existing result cache stores both complete variants under their existing keys, invalidation and capacity rules.

GREEN: initial transcript passes (`policy-green.log`, exit 0). Original overload, 403-file, partial-membership transcripts and result-cache invalidation pass **4/4** (`policy-completeness.log`). A public external-SDK-declaration transcript preserves complete usage-only results, rejects including an external declaration, and keeps the usage result usable after that rejection (`external-policy-green.log`). The reverse policy order is also checked after SDK configuration replacement. Queue cancellation uses a new query position after warming so it still tests a genuinely queued job rather than a newly eligible cache hit.

A 5,000-location real LSP regression exposed optional metadata exceeding the existing protocol node capacity (`policy-capacity-red.log`, internal error rather than a complete answer). The mapping now omits optional reuse data when it would exceed the existing wire/node envelope; the primary result is unchanged and all **5,000 exact Locations** pass (`policy-capacity-green.log`). No protocol capacity is raised. A release-order qualification still expected four jobs for two policies; it now requires the actual shared search's anchor/final jobs while checking every real job's native disposal receipt.

Focused SDK/anchor/result-cache/disposal checks passed **40/40** (`focused-cache-green.log`). Native compiler input and L3 qualification passed **16/16** with macOS process-sampling access (`native-qualification.log`).

## Integration qualification

The first full `pnpm check:fast` run is preserved in `check-fast-final.log`. It was stopped with SIGTERM (shell exit 143) after failures were observed; it is **not a passing full run**. Its reference failures exposed tests that used a declaration-policy switch to force another real search. A complete alternate projection now legitimately hits the result cache, so those tests no longer reached their intended resident admission, batch, index-recovery or cancellation boundary.

Keep those boundaries under test by querying another character inside the same symbol for the other policy; preserve every exact URI/UTF-16 Location oracle and every actual job's isolation/disposal assertion. The package-alias differential instead explicitly checks one native indexed search plus one complete policy cache hit. RED commands used the existing public transcripts at the parent above; `qualification-red.log`, `independent-search-red.log`, `coalescing-red.log`, `resident-policy-red.log` and `resident-input-policy-red-real.log` retain failures. The similarly named `resident-input-policy-red.log` selected no tests and is not RED evidence.

SDK lookup reuse also moved the first negative leaf load from a reference job into index-anchor preparation, so an old injection restricted to reference jobs did not fire. Run that qualification with the existing `batched` strategy so the first genuine load belongs to the search whose end fence is being tested. Keep the original negative load, subsequent real file creation, `-32803` rejection and fresh recovery checks. Record the actual verifier entrypoint in the injection receipt. `negative-search-load-green.log` proves rejection and recovery with request-local resolution reuse both enabled and disabled. An exploratory anchor injection in `negative-first-load-green.log` is not acceptance evidence: anchor failure can conservatively retry a new complete search.

The updated independent-search qualifications passed **23/23** resident/batch coverage (`coverage-independent-green.log`), **16/16** constructor exclusions (`constructor-independent-green.log`), **13/13** resident session references (`resident-policy-green.log`) and **6/6** native input-proof transactions (`resident-input-policy-green.log`). Alias, pre-open recovery and cancellation qualifications pass in their corresponding `*-green.log` files. The first full run also contained a 5s completion-response timeout in the general LSP session test; its unchanged public transcript passes in isolated replay and the subsequent complete runs. Neither that timeout nor the references 500ms requirement was raised.

The next complete `pnpm check:fast` command (`check-fast-qualified.log`, real exit **1**) ran **1872** tests: **1867 PASS, 5 FAIL**, with zero cancelled/skipped/todo. It exposed the same cache-bypassed-path issue in catalog generation recovery (one case), index resynchronization (two cases), interactive recovery (one case) and L3 admission (one case). All five original exact-result, generation, pressure and job-count assertions remain; separate cursors on the same symbol force the intended independent searches. Each previously failing transcript is individually GREEN in `generation-policy-green.log`, `resync-policy-green.log`, `interactive-recovery-policy-green.log` and `l3-policy-green.log`. Their complete four-file qualification also passes **28/28**, zero skipped/cancelled/todo, actual exit **0** (`final-path-qualifications-green.log` and `.exit`). `validation-qualified-failed-post.json` confirms that all 692 code inputs, all 82 artifacts and compiler/SDK identities stayed identical to that run's input snapshot through its actual completion. Production code remains identical to the controlled timing replay.

The final complete command, with those qualifications present from the start, is **GREEN**: `PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm check:fast`, actual shell exit **0** (`check-fast-verified.log`, `check-fast-verified.exit`). Its last root summary is **1872 tests, 1872 PASS, 0 FAIL, 0 cancelled/skipped/todo**, duration **2777779.284ms** (46.3 minutes). Nested intentional negative test runs are not the root verdict. `validation-verified-input.json` and `validation-verified-post.json` prove all **692 code files**, **82 artifacts**, parent revision and SDK/compiler identities identical before and after that whole run. Production runtime identities also match the transport timings; the only later rebuilt artifact is the SDK-discovery test driver, not an LSP runtime bundle.

The private evidence audit (`.bench/op00-reference-reuse-v2/audit.mjs`, output `audit.json`) additionally verifies the unchanged original completeness transcript, all eight unfiltered focused-suite summaries, the three transport replays, writable-index control, genuine parser/IO counts and retained-heap evidence. Against the 1758-file dirty-workspace baseline, this change modifies **28 existing files** and adds **4**; all **1730 other baseline files** are byte-identical. Existing staged and unstaged work remains preserved. No commit, push or merge was performed.

## Isolated 403-file measurements

All measurements use Node **20.19.5**, the installed API 24 SDK, the unchanged `references-completeness.test.mjs` transcript and exact four-result Location oracles. The original 20s deadlines remain hang guards. `validation-input.json` binds the runtime/compiler/SDK inputs; each run's state records all 82 bundle hashes before and after plus its exact observer producers. No runtime changes occurred between these controlled runs and integration qualification fixes; the latter change test cursors/observation only.

Three sequential transport-only replays, measured from actual request send to the complete received frame:

| Run | First complete response | Repeat, excluding declarations | First including declarations | Repeat including declarations | Entire four-request test |
| --- | ---: | ---: | ---: | ---: | ---: |
| `timing-final-1` | 3970.555ms | 1.706ms | 1.147ms | 0.971ms | 4228.348ms |
| `timing-final-2` | 3791.086ms | 1.850ms | 1.297ms | 1.046ms | 4049.687ms |
| `timing-final-3` | 3890.416ms | 1.524ms | 1.112ms | 1.009ms | 4151.976ms |

`timing-1` is excluded from the controlled comparison because input-hash capture overlapped it; the exclusion was recorded before inspecting its result. The trace replay confirms **7** real compiler jobs instead of 14, followed by **3** complete result-cache hits. A separate writable-index control reaches **403/403 ready**, preserves all Location oracles and still takes about **3.795s** for its first response; default cache-directory permission degradation therefore does not explain the remaining cold cost.

The separate `final-trace` replay records approximately **4037ms** from send to the complete frame and **4024.01ms** inside the server. Its non-overlapping server-time breakdown is:

| Component | Time | Share of server request |
| --- | ---: | ---: |
| Seven Programs becoming ready | 2995.44ms | 74.44% |
| Verifier startup/runtime-ready delivery | 306.35ms | 7.61% |
| Per-job host preparation | 12.86ms | 0.32% |
| Actual reference queries | 90.94ms | 2.26% |
| Other batch work, including input fences and publication | 171.35ms | 4.26% |
| Planning and gaps between batches | 12.41ms | 0.31% |
| Outer request preparation, queuing and completion | 434.66ms | 10.80% |

The outer component includes **101.80ms** of document preparation; it is not additional time to sum again. Trace observation is diagnostic evidence, separate from the three transport-only measurements. Startup and outer work remain part of the target, even though Program readiness still dominates.

The diagnostic-only `final-phase` replay is not transport-performance acceptance. Its genuine observations show:

- SDK: **255 files, 255 parse calls, maximum one per file**.
- Compiler libraries: **52 files, 52 parse calls, maximum one per file**.
- SDK lstat/realpath/stat attempts: **18,627** across 7 jobs, versus **311,682** across 14 before these changes. Both lookup reuse and removing the second policy search contribute; attempts per job fall from about 22,263 to 2,661.
- Program readiness: **2979.524ms** total, including **1874.620ms** in the first job; the remaining six fresh Programs each take **172–196ms** in this diagnostic replay.
- First genuine SDK parsing still costs **1180.966ms** exclusive time; subsequent jobs perform no SDK parsing. Actual reference queries total **90.197ms**. Setup, host preparation, post-query work, input fences, disposal and publication total about **193ms**.

**500ms verdict: FAIL.** First responses remain **3.79–3.97s**. Reusing subsequent policy results does not satisfy cold-response acceptance. The remaining critical path contains the first SDK parse plus seven fresh Program preparations; those costs must be removed from the request path or reduced further before claiming the target.

## Retained-memory observation

After the successful full check, `node .bench/op00-reference-reuse-v2/measure-retained.mjs` runs only the original 403-file public transcript. Its exact four Location oracles pass (one selected test, two deliberately unselected tests); all 82 artifact hashes and the transcript stay identical before/after, actual exit **0**. This separate diagnostic run uses three forced-GC turns after each disposed job's call stack unwinds, then forwards the unchanged response. It is excluded from transport-latency acceptance.

The same verifier isolate produces **7** samples, each with **255 SDK files** and **52 compiler-library files** in its Program receipt. Post-GC live heap ranges from **173830984 to 175234152 bytes**, or **165.78–167.12MiB** (`retained-403.jsonl`). This is the **whole verifier isolate's heap**, including retained SDK/library syntax, lookup state and runtime. It does not isolate SDK-only incremental cost and is not process RSS. Earlier SDK-only incremental measurements describe the previous version and cannot be substituted for this version. This observation does not claim a long-soak memory bound.

Remaining source-size debt: `typescript-language-service.ts` shrinks **3241 → 3178** lines after extracting the cohesive **95-line** module resolver, but remains above 500. Other changed/new handwritten source, fixture and test files stay at or below 500 lines; the existing 500-line query observer stays exactly 500.
