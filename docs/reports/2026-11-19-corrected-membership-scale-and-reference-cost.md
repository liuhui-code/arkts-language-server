# Corrected whole-group proof: scale controls and reference deadline evidence

Status: implementation/verification IN_PROGRESS; no merge/deploy/UI claim.
Parent1e3886df, frozen Worker0d609a5d919e890ac0b6b2333c4e383bb53de521970590d9213607a77c541590,
Native800e6628, Node20.19.5, compiler4.9.5-r10. Source309 hashes revalidated.
Evidence root: `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Corrected complete-SDK matrix

Same preserved generated input paths/content as the earlier minimal API24 matrix;
three serial process sessions per tier, distinct new cache cold first/reused later.
OS cache not flushed. Original reference tracing/Worker progress sampler retained;
no syscall instrumentation in these ordinary sessions. Exact navigation, inferred
types, overlay edit/undo/close/reopen, full local references/alias rename, restored
source hashes, Native READY, SQLite integrity and owned close all pass:9/9.

| Project sources / actual Program project files | Initialization median/max ms | First definition median/max | Hot definition median/max | Saved dependency median/max | Unrelated save median/max | References median/max | Rename median/max |
| --- | --- | --- | --- | --- | --- | --- | --- |
|128 /128|1521.85/1626.33|64.77/66.11|23.75/27.25|107.44/109.01|73.12/125.01|198.25/244.11|147.23/148.58|
|2048 /2048|3454.78/3553.84|214.67/219.09|138.72/157.32|371.50/383.16|344.16/360.90|1254.92/1277.65|558.06/564.61|
|8192 /8192|9435.82/9441.02|1266.59/1274.85|518.93/558.43|1366.81/1484.93|1277.90/1278.66|4453.75/4548.93|1918.86/1932.77|

Hot statistics combine five within-session repetitions across three sessions;
they are not15 independent cold starts. Requested import closure16 is unchanged;
full SDK mode admits all project roots, so this grows actual Program population
as well as total source count. It does not isolate unrelated-file-only cost.
Earlier partial SDK fixedP16 controls remain a separate experiment. No complexity
claim follows merely from these three tiers. Old minimal-SDK timings lacked the
now-repaired full membership proof and cannot serve as strict-freshness acceptance
or as evidence that necessary proof overhead regressed a correct implementation.

Reproduce: `python3 <E>/scale-controls/corrected-membership-matrix.py` requires a
new output series name for each run; refuses existing evidence. Raw per-request
results/resources/identity live under `corrected-membership-n*/result.json`.
Summary: `scale-controls/corrected-membership-summary.json`.

## Current expanded failure and independent diagnostic

Final typecheck PASS. Expanded public regression67 total:66PASS/1FAIL,0skip/cancel.
`membership-capsule-final-expanded02.log` preserves the failure:20K completion
scenario initialization and interactive checks pass, then references request9
exceeds original5s client wait. The log already has3 merged references followed
by postflight semanticReadiness. This is distinct from the earlier fullcheck
initialization notification timeout. Neither has been waived or relabeled.

Independent diagnostic preserves the same selected test/assertions/deadlines;
1PASS/2not-selected. It is instrumentation, not ordinary timing or a repair.
`reference-readiness-diagnostic01-summary.json` separates sequential commands:

| Worker command | ms | lstat API calls (all domains, not distinct paths) |
| --- | ---: | ---: |
|13 before semanticReadiness|1355.72|80381|
|14 references|1681.67|80048|
|15 after semanticReadiness|1304.69|80381|

Sum4342.08ms excludes parent/IPC gaps; do not add nested spans again. In command13,
exclusive instrumented lstat675.30ms; namespace loop263.55ms; resident disk-proof
loop excluding instrumented IO235.78ms; inputsFor59.86ms; other measured78.99ms;
outside coverage42.21ms. Command15 equivalents:681.96/206.17/231.50/68.88ms;
remaining measured74.71ms; outside41.46ms. Exclusive attribution is diagnostic
and must not be multiplied into ordinary runs or called all removable cost.

Before/after capture protects changes across async reference execution and is
not redundant merely because method names match. Current/final physical proofs,
original expected facts and original deadlines remain required. New optimization
needs a failing behavioral/cost regression and explicit observation-order proof.
The references command has927.73ms outside these probes; no invented compiler,
queue or GC attribution. No product fix for this deadline claimed yet.

Original Photos cold/warm/edits, larger corrected tiers, remaining M4/M5, final
whole check, Windows/UI/endurance and real SDK-partial reference limitations
remain separate open acceptance requirements.
