# R-07: source-local literal roots, not a smaller reference universe

Parent `911ae43c274175614559b63f0311504747d8393d`, dirty
`codex/references-resident-fast-path`. Preserve preceding R-09/R-07 changes and
user AGENTS.md. Previous whole-fast is 1126/1126 PASS; it does not certify this
new test or implementation. Production defaults and original Settings stay.

## Public tracer RED

```sh
/usr/bin/caffeinate -i /Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  --test --test-name-pattern='literal-only candidate roots' \
  tests/semantic/references-constructor-scope-exclusion.test.mjs
```

Actual 1 FAIL, exit 1, duration 10,331.740012 ms (case 10,220.068495 ms).
Legacy/control/enabled exact URI+UTF-16 sets pass first, including an unopened
inherited alias caller. Cost assertion then fails **10 != 6** completed batches
across both declaration policies. Normal diagnostics and real sidecar are active;
references still use the original 30 s deadline. The fixture contains an empty
external module, a nonempty exported scalar module with an ordinary comment,
and an unknown `new OtherName()` caller. No private compiler test is substituted.

## Bounded implementation contract

After an actual successful original-cursor/raw-constructor/same-Program search,
only source-local, closed external-module grammar may prove a root irrelevant.
Use the pinned official frontend for syntax, not another parser/Program/checker.
Keep original membership, dependency admission, all overlays and unknown roots.
Ordinary comments are not code; directives, JSDoc, parse errors and unknown
grammar remain unknown. No target-name or absence-of-`new` heuristic is proof.

Worker and accepting owner read each source under its original admission token.
After any root replanning, recheck all consumed exclusions before publication;
failure discards work and runs the original complete plan without exclusions.
An anchor rejection also discards the narrowed plan. Do not union partial
Programs into the existing whole-scope shortcut.

`ARKTS_REFERENCES_CONSTRUCTOR_SCOPE` remains default-off. SDK/full closure,
1024 MiB budget, per-batch Worker lifecycle, result completeness and diagnostics
are unchanged. Preliminary scalar-only source surveys find only a few main
Settings files; the stricter comment discipline rejects three prior matches,
and type annotations remain unknown in this slice. Raw logs do not identify
which matching files are missing from any actual Program. This is not evidence
of a Settings speedup or general constructor graduation.

## First GREEN and safety characterization

The same public tracer passes **1/1, exit 0**, duration 8,493.418090 ms:
legacy/control/enabled exact sets, unknown inherited caller retained,
**10 control -> 6 enabled** completed batches and two root replans. Original
complete membership and dependency availability do not change.

An additional after-replan unnotified disk mutation passes **1/1, exit 0**,
11,768.751661 ms. Actual final old-token recheck rejects the changed literal
root, discards collected work, and executes all original conservative batches
without exclusions. The captured response stays exact; a fresh process finds
the added inherited caller. This characterizes the new fallback rather than
claiming an invented second defect RED. Independent review also finds and
fixes recursive anchor/semantic-unit fallback losing the disabled-exclusion
state; the current state is now explicitly carried through both branches.

Alias-only re-export, identifier initializer, parse recovery, JSDoc and
triple-slash directives are additional public conservative characterizations.
At that checkpoint, focused and complete regression gates were still pending;
the preceding 1126-case gate cannot certify these new source/test inputs.

Related focus subsequently passes **38/38, exit0**,134,857.386425 ms. The
positive test is then strengthened at the dependency seam: the unknown caller
imports the omitted literal root's scalar export. Actual complete Programs
still load that dependency, exact Locations and 10->6 batches remain; the
one-case strengthening passes **1/1**,8,734.671115 ms. These focused commands
do not replace the final frozen-input whole gate below.

[Fixed Settings](../reports/2026-09-29-settings-constructor-literal-roots.md)
is **11 x 267 exact/valid, exit0**, normal version2 diagnostics. It has **0**
new-rule hits, two seed rejections and28 completed batches: cold/edit
61.205/61.528s, nine existing cache hits27-51ms. This does not show a real
Settings acceleration, constructor proof graduation, 500ms or memory gate.
New artifacts and oracle/SDK/source are pinned separately from preceding runs.

## Final complete gate and postflight

Fresh `pnpm check:fast` is **1133/1133 PASS, exit0**, zero failures,
cancellations/skips/todos; duration **1,093,203.504409 ms**. Original test
deadlines and diagnostic behavior remain unchanged. The frozen332-file
source/test/build inventory matches before/after at SHA256
`41889b1017906300391a1134997a15bc5af912dbb1adb062fe8495cce25b372d`.
Full log SHA256 is
`d96a377c902223c88a2efd8ce8cce304c37063c76cff5538adc516efe835d485`.
Final manifest preflight, clean unchanged Settings, artifact/SDK/oracle pins,
user AGENTS.md identity and `git diff --check` all pass. Independent evidence
review finds no blocking inconsistency and no changed-source size violation;
the existing LanguageService3629-line debt is unchanged by this slice.

This completes this narrow implementation/regression slice, **not R-07's
general constructor proof**, default graduation, cold/edit500ms, original>3GB
or final50%/PSS/DevEco/nativeWindows gates. No commit, push or merge.
