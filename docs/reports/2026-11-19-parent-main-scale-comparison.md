# Same-input parent-main and candidate scale comparison

Status: completed comparison; full A-plan acceptance remains IN_PROGRESS.

## Identity and conditions

Plan parent main1e3886df (frozen Worker d39a901d) is compared with completed-facts be97cff2 at all five tiers; the later member-renewal4802ca0e has matching2048/30000 evidence. All frozen parent runtime hashes were checked before running. No claim about a newer remote main is made. Latest overlay candidate b0d57d20 is NOT covered by these timings.

Three serial fresh Node20.19.5 processes per version/tier, identical fixture paths/bytes/SDK/query positions; separate fresh Native cache at round1, reused at rounds2/3. OS caches not flushed; versions ran serially in fixed order, so small differences may include temporal/cache effects. Same reference tracing and Native800e6628, ohos-typescript4.9.5-r10.

Each fixture keeps real import closure16, balanced fanout8/depth3, with unreferenced exported modules added to increase N. Every measured definition Program contains16 project files; these are not global scripts or increasing effective dependencies. Unique noise module contents avoid artificial whole-project role-cache hits. Total source bytes grow with N and are recorded in manifests; this is not a fixed-total-bytes experiment.

All36 sessions in this comparison passed exact results, source restore hash, per-DB structural postflight and owned-process closure.720 timed request rows include initialize and exclude teardown shutdown/server-initiated requests. Sessions are separate; no endurance duration is inferred. SDK is intentionally partial; local synthetic references/rename success does not prove real Photos SDK completeness.

## Hot query growth

Values are median / maximum ms over five hot repeats in each of three processes (15 repeated samples, not15 independent cold starts).

| Total sources N | Actual Program P | Parent main | Completed-facts be97 | Later member-renewal4802 |
| ---: | ---: | ---: | ---: | ---: |
| 128 | 16 | 49.82 / 52.35 | 45.67 / 48.61 | not measured |
| 2048 | 16 | 117.60 / 138.53 | 85.81 / 90.97 | 87.80 / 96.78 |
| 8192 | 16 | 395.40 / 407.46 | 232.09 / 246.75 | not measured |
| 20000 | 16 | 943.76 / 1063.42 | 518.91 / 555.20 | not measured |
| 30000 | 16 | 1395.90 / 1508.37 | 759.34 / 862.10 | 755.74 / 792.13 |

Hot cost remains positively associated with unrelated total N in this controlled range. At30K the reduction is1395.90→755.74ms (~46%), not scale independence. The code still iterates every member in raw physical current/final proofs; graph proof traversal also remains. That is a code basis for linear work in those specific stages, not a measured end-to-end complexity theorem.

## Thirty-thousand-source operations

Each operation has three process samples except hot repeats above. Values median / maximum ms.

| Operation | Parent main | Member-renewal4802 |
| --- | ---: | ---: |
| initialization | 16159.50 / 16759.44 | 17041.08 / 17353.80 |
| first-definition | 2217.74 / 2227.66 | 1421.14 / 1429.57 |
| hot-definition | 1395.90 / 1508.37 | 755.74 / 792.13 |
| saved-dependency-first-definition | 5161.73 / 5172.00 | 1432.68 / 1434.54 |
| unrelated-save-first-definition | 4612.49 / 4660.82 | 1017.85 / 1033.90 |
| overlay-edit-definition | 1482.99 / 1493.00 | 1015.12 / 1053.53 |
| closed-definition | 1444.16 / 1456.64 | 1072.71 / 1080.09 |
| textDocument/references | 17004.77 / 17283.30 | 16982.65 / 17003.29 |
| textDocument/rename | 23959.80 / 23962.33 | 23902.38 / 24026.25 |

The known-save improvement is large: unrelated save4612.49→1017.85ms (~78%), dependency save5161.73→1432.68ms (~72%). These cover compatible known disk saves, not every edit. Unnecessary role polling and failed-proof/re-enumeration were removed; all original physical current/final checks remain.

Initialization did NOT improve in this unique-content fixture:16159.50→17041.08ms (~5.5% higher median). No attribution is made without stage measurements. First definition improved2217.74→1421.14ms; references (~17s) and local rename (~24s) remain essentially unchanged and are material remaining costs.

References are first queried after the edit/open/close sequence; rename follows and returns a local alias edit checked at exact locations. Rename is not applied. These are not a repeat-reference-cache experiment or the historical rename-then-first-reference workload.

## Broader SDK control and next evidence

An initial fixture named matched used string"24", which is a release alias requiring a real version map. Actual report remained partial; matched-n128-round1 PASS is functionally valid but proves no full-SDK coverage. CLI regression generator-matched-red.log fails on string versus numeric target; generator-matched-green.log passes after requesting numeric24. Original inputs/results are preserved; no product SDK policy changed.

Independent corrected matched-api24-n128-round1 reports READY with source coverage128 and actual definition Program128, despite requested import closure16. All exact operations/SQLite/closure passed; first54.24ms and hot18.30–21.38ms in this one small session. It is a minimal one-declaration SDK, not a complete real SDK or a scale result. The initialization full-SDK branch prepares whole semantic groups, while partial coverage initializes ProjectOperationScopes. Larger matched-SDK controls are required before assuming partial-path benefits generalize.

Pending: latest overlay candidate timing, fixed total with real dependency growth, independent fanout/depth/file-size/reference-density controls, full SDK larger tiers, original Photos cold/warm/edit verification, M4 graph/reverse influence, M5 uncertainty, full check:fast, Windows/UI/endurance. All errors/long tails remain in raw evidence.

Evidence: I/scale-controls/parent-main-{baseline-series-01,baseline-summary,comparison}.json, fixed-closure-summary.json, member-renewal-summary.json, all per-round results/logs/raw framed wire/resource/progress files, generation/runtime identities. `summarize.py` accepts series/result filenames and includes only controller-observed terminal sessions.

## Later correctness finding: complete-SDK timings require requalification

NAV-FRESH-002 independently proves parent main and b0d57d20 whole-group SDK-READY queries
can return stale[] after unnotified unrelated module→global changes. The partial-SDK P16
matrix above has its own current/final membership checks. The separate complete minimal-SDK
128/2048/8192 matrix (9/9 routine-operation sessions) is NOT strict-freshness acceptance;
its fast hot numbers omitted that membership observer. Corrected0a8898a0 must be timed
separately. See `2026-11-19-full-sdk-membership-proof.md`; do not compare those paths as
identical correctness contracts without this qualification.
