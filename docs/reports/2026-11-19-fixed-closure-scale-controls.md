# Fixed dependency closure with increasing unrelated source files

Status: FIXED-CLOSURE CANDIDATE MATRIX COMPLETE; overall plan remains IN_PROGRESS. Generated protocol sessions, not Photos UI or endurance. Original user source and caches untouched.

## Identity and method

Frozen candidate Worker `be97cff21fa6137d41eaedd8be09a11f050b4769c0ee6165e1d454d58ebe3178`, parent `1e3886df3c4d27755a53c073462f1456b0a3de7e`, Node20.19.5, ohos-typescript4.9.5-r10. No product source changes during measurements. Runtime source/hash manifest accompanies every session. Unchanged Native SHA800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c.

Five planned total-source tiers128/2048/8192/20000/30000, three serial process sessions each. Main/Target bytes, symbol and position are fixed. The effective generated dependency tree has16 files (balanced fanout8); all added files are unreferenced exported modules, not global scripts. Actual definition Program project-file counts are measured from compiler programFileStats, not inferred from catalog size or Worker residency counters.

Each process is cold. Native cache is new at round1 and reused at rounds2/3 for the same tier; OS page caches are not flushed. The SDK intentionally selects an unmapped alias and is reported partial. Reference tracing is consistently enabled. No diagnostic all-file syscall instrumentation is included. Five hot repeats per session are pooled for the hot distribution; they are not15 independent process starts.

## Completed session results

Cells show median / maximum milliseconds. Only controller-observed terminal sessions enter the table; an intermediate result.status set before teardown is insufficient.

| Total sources | Closed sessions | Actual definition Program files | Init | First definition | Hot definition | Saved dependency first definition | Unrelated save first definition | References | Local rename |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 128 | 3 | [16] | 1935.53 / 2030.61 | 150.91 / 167.19 | 45.67 / 48.61 | 127.25 / 132.01 | 78.88 / 124.50 | 1345.90 / 1352.65 | 391.75 / 496.87 |
| 2048 | 3 | [16] | 2943.48 / 2985.90 | 228.78 / 231.64 | 85.81 / 90.97 | 374.53 / 377.50 | 306.98 / 329.23 | 2319.72 / 2337.61 | 1872.80 / 1990.49 |
| 8192 | 3 | [16] | 6064.73 / 6138.18 | 457.12 / 458.41 | 232.09 / 246.75 | 1282.84 / 1283.98 | 1120.28 / 1132.65 | 5384.66 / 5392.85 | 6629.63 / 6679.37 |
| 20000 | 3 | [16] | 11954.54 / 12352.98 | 915.63 / 921.44 | 518.91 / 555.20 | 3046.59 / 3148.16 | 2757.41 / 2772.89 | 11718.90 / 11730.48 | 16201.16 / 16388.94 |
| 30000 | 3 | [16] | 16760.75 / 17156.04 | 1436.31 / 1448.88 | 759.34 / 862.10 | 4526.01 / 4528.32 | 4135.38 / 4192.17 | 16898.77 / 17113.97 | 23999.57 / 24109.06 |

All currently tabulated sessions passed exact results, restored-source full hash, SQLite structural postflight and sampled owned-process closure. All five tiers completed three terminal sessions (15/15PASS),300 timed request rows (including initialize, excluding teardown shutdown and server-initiated requests). No final whole-plan or check:fast PASS claim.

## Correctness oracles and calibration correction

Definition: Main.ets line2 character25 → Target.ts line0 characters13–19. References include exact declaration, import and use locations. Rename is requested from an imported local use: correct edits preserve the exported class and rewrite the import to `Target as RenamedTarget`, plus its local use. The initial calibration incorrectly demanded three edits; original calibration-run-01 FAIL is retained. Recorded public payload characterization3/3 passed, including negative omission/wrong-alias checks. Corrected calibration-run-02 passed. This is a driver correction, not a product defect or relaxed completeness assertion.

Saved Target changes `member: number = 1` to `member: string = "x"`; hover must change inferred observed type to string and back to number after undo. Noise0 is separately saved/restored. Main is opened, edited unsaved, undone, closed and reopened at version1, with exact definitions throughout. Twenty requests/session (including initialization), no concurrent performance sessions.

## Observed limitation and next implementation boundary

Program pruning is working in this fixture: it stays16 as total sources grow. It does not prove end-to-end scale independence. Heat and unrelated-edit costs grow despite fixed Program size. Existing strict membership/configuration proofs intentionally remain and the edited-input role refresh still polls the catalog. No claim of an exact O(N) exponent follows from these few tiers.

Next M4 slice should consume the existing bounded contiguous contentDeltas through an independently retained revision cursor, with exact store-owned catalog/overlay/reset/generation lineage. It must fall back to full facts refresh for gaps, removals, unknown adapters, alias/reset/configuration changes or unnotified discoveries. It must not reuse compiler-filtered changedPaths as a complete project delta or drop changes in currently unselected groups. This is a design dependency, not an implemented result. The independent current/final disk proofs remain necessary under approved planA.

## Evidence and remaining coverage

Raw evidence: `.bench/repeated-query-proof-plan-20261117/implementation-20261118/scale-controls/`: generate.mjs, run.mjs, query-oracles.mjs/test, serial-matrix.py, summarize.py, manifests, fixed-closure-series-01.json, per-round result.json, requests, raw stderr, compressed wire, phase/progress, Worker metrics/creation/exit and external resource samples. `summarize.py fixed-closure-series-01.json fixed-closure-summary-progress.json` reproduces the terminal-only aggregate.

Worker heap metrics are isolate-local samples; Node RSS includes all its Worker threads once. Native RSS is separate; summed RSS is not PSS and sampled peaks may miss spikes. Native initial catalog terminal is recorded, not proof of latest post-edit incremental qualification.

Pending:same-fixture baseline controls, fixed-total growing dependency closure and independent fanout/depth/size/reference-density axes, matched complete SDK, original Photos cold index/edit controls, watch uncertainty, full final check:fast, Windows UI and endurance. Small synthetic exact references/rename results do not close real Photos30K capability gaps.

## Sampled resource maxima across three sessions

Node RSS includes Worker threads once; native RSS is a distinct process. MiB are1024² bytes. These are maxima over samples, not exact allocation peaks.

| Total sources | Node RSS MiB | Native RSS MiB |
| ---: | ---: | ---: |
| 128 | 325.61 | 9.59 |
| 2048 | 432.40 | 40.55 |
| 8192 | 550.79 | 70.89 |
| 20000 | 869.51 | 120.98 |
| 30000 | 910.54 | 163.40 |

This matrix predates the new saved-role delta slice and must not be represented as its performance validation. The new slice needs its own frozen identity and same-input paired edit measurements.
