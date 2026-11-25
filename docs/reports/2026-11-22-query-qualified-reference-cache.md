# ADR0047第一种引用查询证明：实现与验收进度

日期2026-11-22。状态IN_PROGRESS；未提交、合并、发布、部署。
当前隔离工作树 `/private/tmp/arkts-query-qualified-cache-20261122`，
基底1e3886df3c4d27755a53c073462f1456b0a3de7e加本轮及继承的未提交候选。
主工作树其他工作、用户项目、SDK和日常Zed未修改。
证据E为主仓库 `.bench/repeated-query-proof-plan-20261117/implementation-20261118/query-cache-0047/`。

## 实现范围与明确缺口

解除“全局READY是唯一缓存准入条件”，首先支持可证明不逃逸的函数体let/const绑定。
这是第一种有限搜索全集证明，不能理解为所有partial结果都能缓存。
导出类、跨文件绑定、SDK相关搜索的泛化收据仍未完成；旧global-READY缓存路径保留。
真实Photos初始化约80秒及引用/重命名长尾仍为遗留，不声称本轮已经解决。
SDK状态没有被改成READY；没有提高超时、内存/规模上限，没有截断Locations。

## 调用链和改动

1. `typescript-reference-query.ts`完成真实compiler查找后调用`lexical-reference-proof.ts`。
   要求实际SourceFile原文与权威文本完全一致、一个变量标识符声明位于函数直接body、
   编译器锚点精确匹配；拒绝语法错误、destructuring、alias/property、简写属性联系及其他种类。
   绑定是词法局部的，其他文件和SDK声明不能合并进该绑定。AST扫描保留协作checkpoint。
2. `contracts/reference-query-proof.ts`版本化receipt只保留路径、原文/编译器SHA和作用域/声明位置/策略。
   解码严格检查字段、整数边界、hash和coverage，复制并freeze，绝非可任意设置的cacheable布尔值。
3. `reference-proof-consensus.ts`要求批次一致；未知/不同收据不能被后续有效批次抹掉。
   `lexical-reference-coverage.ts`重新核对原文、compiler、查询和结果范围，才可结束其他无关批次。
   其他符号仍走完整原搜索。位置转换为单次行索引+每位置常数读取，避免为每个引用重扫行前缀。
4. `reference-result-mapping.ts`传内部receipt，不向标准LSP Locations输出；
   可选metadata使用原wire budget，容不下就不给资格，不能挤掉合法主结果。
5. `reference-cache-admission.ts`区分global-READY与query-qualified准入；前后输入观察照常执行。
   新准入还绑定`project-source-namespace.ts`提供的现有resolver namespaceIdentity owner/epoch。
   该字段从原WorkspaceResolutionInputGeneration取得，在实际capture前后核对，缺失则不准入新路。
   `semantic-readiness-wire.ts`严格检查可选字段；不是用epoch代替fresh physical观察。
6. `reference-result-cache.ts`沿用128entry/8MiB元数据及答案容量，不新增RSS门限。
   每条entry的Symbol身份防异步准入时clear/reinsert ABA；另一includeDeclaration策略不得沿用本收据。
7. cache.hit/store日志包含proofKind/proofVersion/coverageKind；cache.ineligible区分未证明覆盖与输入证明不可用。
   不留SourceFile/Program/数据库reader，不引入新的SDK租约或持久化缓存。

`reference-search-executor.ts`原500行的trace字段映射原样提取到独立formatter，现487行；
现有锚点/分批公开表征保护该提取。semantic-worker-proxy496行、test-layer-manifest500行。
本切片新增源/测试/脚本均不超过500行；未更改Rust或重新构建Native。

## TDD与失败证据

| 证据 | 实际结果 |
|---|---|
| public-red01 | 冻结前候选a321/8792：精确引用正确，store0而预期1，公开RED |
| public-green01 | 第一条局部证明store→hit通过，全局仍partial |
| public-boundaries03 | 19项中8失败：7因新worktree未复制fixture所需target/release Native；1新oracle误把`./Target`字符串计为符号 |
| public-boundaries04 | 补齐同SHA Native并修正独立oracle后，原19项全部PASS，未放宽产品断言 |
| receipt-red06 / green07 | 自身实现阶段解码副本可变，增加freeze后通过 |
| entry-lifetime-red08 / green09 | clear后重插相同证明可复活旧entry；改为不可复用entry身份后通过 |
| telemetry-red10 | 新证明缺少可辨识日志字段；实现后后续公开回归通过 |
| focused05 | 100项：97PASS、3个10秒客户端观测超时，原日志保留 |
| focused-serial11 | 相同相关用例加合同检查104/104PASS，0skip/cancel；未修改deadline；不能仅据此把超时独占归因为CPU |
| lexical-coverage-red12 / green13 | 5文件4计划批次，精确相同结果由4实际批次降为1；4个公开用例GREEN |
| silent-configuration-red15 | 初版测试在配置变更后误要求prepare:false仍partial，实际合法unprepared；校正阶段，不算产品根因 |
| silent-configuration-red16 | 修正后实际确认：重准备后旧环境receipt仍hit，输入域隔离缺口 |
| environment-green17 | owner/epoch绑定后12/12相关检查PASS，不再复活旧环境receipt |
| environment-wire-red18 / green19 | 规范化epoch、拒绝非法/溢出/前导零，9项GREEN，legacy无字段仍可传输 |
| frozen-focused20 | 最终冻结129/129PASS，零skip/cancel，含私有协议及原输入最终围栏 |
| actual-checkfast21 | 最终2767/2767PASS，零fail/skip/cancel；1046输入/76资产前后不变，见final-pipeline01.json |

公开回归同时验证UTF16/多行源位置、无通知源码编辑、根级watch失效、includeDeclaration独立策略、
SDK未知的跨文件类与简写属性不缓存，以及取消/合并、目录生命周期、原源/成员/SDK最终围栏。
独立preload计数真实createProgram及Worker构造，先断言计数非零校准，再证明命中不增加二者；
不能只以无batch日志猜测没有Program工作。该测试用于机制验证，不作无插桩时延声明。
配置变更反例中的Locations恰好相同；问题是旧收据跨输入域复用，未伪称已观察到错误位置。

## 版本与复现

Node20.19.5，实际安装ohos-typescript4.9.5-r10。
Context7 resolve-library-id连接失败，官方raw源码抓取也失败，未声称成功取得最新文档。
实际安装编译器 `node_modules/typescript/lib/typescript.js:141265` 的getSymbolScope及调用链
作为匹配运行版本的一手源码证据；实现不调用该私有函数，而使用现有公共AST/checker API。
前候选2758/2758全量PASS只属于qualification修正，不能充当新缓存候选的完整门禁。

冻结1046份源/测试/脚本/配置及76运行资产：source-freeze01.json、runtime-identity01.json。
server SHA256 570b30d51f1ee796f2ba96977a9803145c0dc441f15d4c11351344884521d5e4
Worker SHA256 883443435d0c3a4224e82178197d2f5d08f1af085cf157d3e38a163200b73c4e
Native SHA256 800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c
compiler SHA256 af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc

```sh
# 固定Node20与依赖；当前候选完整门禁
pnpm check:fast
# 公开功能回归；Node test按文件串行，不修改响应截止
node --test --test-concurrency=1 tests/semantic/references-query-cache-proof.test.mjs tests/reference-query-proof.test.mjs
```

冻结流水线复现入口E/final-pipeline01.mjs，不覆盖既有结果。
通过后E/scale-after-gate01.mjs自动串行新隔离2048/20K/30K各3会话，追加probe但保留原导入闭包。
逐次request/wire、source恢复、资源、数据库检查与错误保留；结果未生成前不计成功。
原始项目不动；新测试副本与日常缓存分离。沿用45秒外部请求保护及原Native/tree/system/disk/SQLite保护，
仅保留既有Node RSS测试停线豁免；不改产品/V8策略。

## 未完成

泛化跨文件/SDK相关coverage与实际输入读集receipt、实际Photos符号适用性、
九会话规模结果、当前完整门禁、Windows及真实Zed UI/耐久尚未收口。
因此这是已实施的第一种证明与有限准入，不是ADR0047全方案完成，也不承诺500ms。

完整check:fast已完成：2767/2767PASS，源码与全部runtime无漂移；这是当前第一种producer候选的门禁。
规模首六个会话（2048/20K各3）PASS，每会话7次已确认result-cache.hit；30K仍在执行。
20K真正命中仍约5秒，主要输入观察成本未消除，保持遗留；不能以缓存hit或批次减少宣称500ms。

## First producer final receipts; second producer worktree

The frozen first producer **completed**, not merely started, its actual final
`pnpm check:fast`: **2767/2767 PASS, zero fail/skip/cancel/todo**, unchanged
1046 source inputs and 76 runtime assets. `final-pipeline01.json` has status
`PASS_FIRST_PRODUCER_GATES_ONLY`; `actual-checkfast21.log` is the raw outer run.
Its nine generated protocol sessions (2048/20K/30K ×3) also completed, with
117 functional queries, 135 total client requests and 63 true result-cache hits;
all source-restoration, SQLite integrity and CLOSED checks passed.
`scale-after-gate01.json`, `scale-summary01.json` and each round's raw files retain
those receipts. This is lexical-query evidence, not Photos/UI/endurance or the
second producer's final gate.

True cache hits still pay full namespace observation: first hot-query median/max
2048=603.70/629.48ms, 20K=5144.38/5359.59ms, 30K=8972.10/9820.34ms.
Do not compare this local-variable probe directly with the earlier Target-class
query or claim that all performance costs were removed. These costs remain in
the existing performance backlog.

Second producer isolated worktree:
`/private/tmp/arkts-query-cache-inputs-20261122`, detached parent
`1e3886df3c4d27755a53c073462f1456b0a3de7e` plus inherited WIP and new changes.
The original user worktree, Photos project, SDK and daily Zed installation are
unchanged. Raw new evidence is under
`.bench/repeated-query-proof-plan-20261117/implementation-20261118/query-cache-0047/compiler-inputs/`.

- `public-class-red01.log`: unmapped-target fixture returns correct Locations,
  but old frozen first producer stores zero instead of one.
- `public-class-red02.log`: same RED with explicit project API20/selected API24;
  five exact cross-file Locations, old first producer store0 vs expected1.
- `portable-red03.log` → `portable-green04.log`: original positive/negative facts,
  same-length/restored-mtime replacement and stale owner export checks.
- `schema-red05.log` → `schema-green06.log`: full-program schema, nested owned
  immutable metadata, hostile accessor rejection.
- `wire-budget-red11.log` → `facts-wire-green12.log`: 17,000 facts over the
  65,536-node wire budget must omit the optional receipt, preserving Locations.
  The combined witness/lifetime/schema run passed19; it is not the full gate.
- `public-legacy-green15.log` actually had **one failure**: shorthand incorrectly
  gained admission. Kept as failure evidence; `public-green18.log` passed6 after
  restricting the producer to single exported project declarations.
- `sdk-input-red19.log` is a missing API/module scaffold failure, **not proof of
  a reproduced public defect**. `sdk-input-green20.log` passed11 contracts;
  shared SDK negative lookup and exact SourceFile/read evidence now participate.
- `sdk-unidentified-red24.log` is a real public failure: an unidentified SDK
  distribution incorrectly stored1. Identified-distribution admission fixed it;
  `public-green27.log` passed22 including public/cache/schema/manifest checks.
- `program-audit28.log` passed3 public cases; actual compiler/Worker creation
  counters are positive before the cache hit and unchanged across it.
- `source-fence-red29.log` confirmed mismatch was only ineligibility. The new
  issuance registers source facts with the original compiler witness and throws
  input-unavailable on confirmed divergence. `source-fence-green30.log` retained
  one incorrect expected-message assertion; corrected `source-fence-green32.log`
  passed11. `typecheck31.log` passed; `public-final-fence34.log` passed7.

The second producer supports full Program search coverage with selected SDK
identity/target/config/positive and negative path facts. It still declines
multiple differing Program receipts, index-only exclusion coverage, unsupported
query kinds, malformed/unidentified SDK and diagnostic-unknown environments.
It does not replace global READY, change API20 to API24, or clear the complete
result contract. Its final whole check and new scale/actual Photos verification
remain outstanding; first-producer full/scale receipts do not cover this code.

## Aggregated/index-qualified candidate (Q4), still IN_PROGRESS

`/private/tmp/arkts-query-index-proof-20261122` is a separate proper detached
worktree; Q3 source/runtime remain frozen. Evidence subdirectory is
`query-cache-0047/indexed-inputs/`. No deployment, merge or user SDK edit.

Q3 focused final gate passed149/149. Its actual check:fast was **not passed**:
normal sandbox denied `/bin/ps`, multiple prepared-suite cases could not obtain
an initial RSS sample, and further errors also need classification. The managed
stage was stopped (only its8 owned descendants) and logs retained;
`compiler-inputs/environment-stop39.json` records the process set.
The exact frozen hover case passed in an authorized sampling environment:
`sampler-permission-control38.log` selected1PASS/11unselected, not a whole gate.
`actual-checkfast37.log` and `final-pipeline01.json` retain STOPPED_PRESERVE_FAILURE.
No failed whole run is relabeled green or covered by the older2767 receipt.

Q4 records the admitted Native complete qualification/source fingerprint and
binding-result digest in parent cache admission. The executor qualifies actual
Program scope only after completing required verification. Matching distinct
Program receipts combine immutable read evidence; conflicts fail the request.
Original index freshness/binding/anchor checks remain before this capture.

- `public-narrow-red01.log`: 15 members, 3 candidates, actual compiler scope
  smaller than membership, correct5Locations but old Q3 stores0.
- `public-narrow-green04.log`: the new narrowed case passed.
- `multi-program-red05.log`: the synthetic differing-receipt consensus contract
  failed; the public batch1 case itself passed because its support closure caused
  equivalent Program scopes. Do not claim that case reproduced differing Programs.
- `public-different-program-red09.log`: separate real LSP full-scope/batch1 test
  verified different actual Program file counts and then failed old Q3 store0.
- `coverage-contract-green10.log`:20PASS, including real differing Programs,
  candidate coverage, silently added NewUse.ts (5→7Locations, old cache refused),
  declaration policy, overlay and immutable/current qualification contracts.
- `store-fence-red11.log` / `store-fence-green12.log`: stale facts after computation
  must fail even when cache namespace/eligibility is absent; a new request's
  rejected hit may miss and recompute instead.13 contracts PASS after the repair.
- `batch-fence-red14.log` / `batch-fence-green15.log`: conflicting actual identity
  across batches fails the old request instead of merely dropping cache metadata.
- `skip-lib-check-red18.log`: real public SDK declaration contains a missing type;
  ordinary exact3Locations still return, but old candidate incorrectly stored1.
  First guard attempt `skip-lib-check-green21.log` still failed that case: a
  non-null transient unknown Symbol is not resolution proof. Installed source
  inspection and `sdk-symbol-green23.log` (25PASS) verify the corrected guard.
- `refusal-observation-red24.log`: bounded refusal trace was absent. New
  `references.proof.refused` codes distinguish environment, declaration,
  diagnostics, unresolved bindings, coverage and original-input gaps; no source
  text is logged. New targeted run is recorded separately.

Official source/API provenance is `compiler-api-sources28.json`; installed
compiler4.9.5-r10 SHA remains af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc.
New known proof restrictions are sufficient conditions, not proof that every
rejected answer is wrong. They leave global readiness/capabilities unchanged.

The first2048 class calibration **failed**, after correct definition and first/
repeated reference answers: no result hit. Preserve
`indexed-inputs/calibration-2048/round1/{result.json,wire.ndjson.gz,logs,resources*}`.
Actual definition P16 and verifier P16, 2 Native candidates from2048 members;
first references3136.76ms, repeat2276.44ms. CLOSED, source restoration and SQLite
checks passed. Logs said query-coverage-unproven; exact eligibility cause is being
measured with refusal codes. This is calibration, not scale acceptance, and not
Photos/UI. No threshold/SDK/input was changed to manufacture a hit.

### Calibration closure and binding scope correction

- `refusal-observation-green27.log`:12 public cases PASS.
- Calibration round2-observed repeated the original no-hit result and identified
  `unresolved-type-inputs`. Independent `diagnostic-runtime-identity29.json` /
  round3-diagnostic located ancestor `@types/node/globals.d.ts` at245:globalThis.
  Instrumented timings are not ordinary product costs.
- `intrinsic-resolution30.json` is a diagnostic-only runtime lookup experiment;
  production does **not** use private `resolveName`. The supported public API
  control `public-scope-intrinsics31.json` distinguished unknown MissingSdkType
  from actual globalThis/undefined bindings by scope identity.
- `intrinsic-red32.log` is a real failing public positive case. The public-scope
  correction passed26 cases (`intrinsic-green35.log`) while keeping the unknown
  SDK base refusal. Calibration round4 still failed; it is not relabeled passed.
- Round5-diagnostic36 identified a different input: Node globals' import of
  `undici-types` at297..311 was actually unresolved. The root lexical
  node_modules/undici-types path is absent; the dependency exists under pnpm's
  physical @types/node package. Do not call this an uninstalled SDK or claim a
  complete symlink-resolution root cause from this observation alone.
- `import-type-red37.log` is **not RED**: selected1PASS/9unselected. A valid SDK
  import-type control already worked; its name was corrected to characterize
  behavior. `import-type-api38.json` confirms actual public checker behavior.
- `reachable-sdk-red39.log` established the real gap: an unreferenced missing SDK
  type wrongly blocked an independently bound project class. Eligibility now
  follows actual searched project bindings into transitive SDK declarations.
  Original all-input read/lookup/final fences remain. This is the planned
  query-dependency distinction, not a failed-import ignore list.
- `typecheck40.log` caught use of runtime-only SymbolFlags.All. Public Node tests
  use esbuild and do not prove type checking. It was replaced with supported
  Value|Type|Namespace flags; `typecheck43.log` and `typecheck48.log` PASS.
  Do not infer typecheck success from the preceding shell's later test exit.
- `reachable-sdk-green45.log`:28PASS. `anchor-certificate-red46.log` exposed
  candidate promotion without actual compiler anchor evidence; contracts47 and
  public50 passed after requiring it (public50:15PASS). Existing TypeScript
  language-service2852-line migration debt did not grow; executor remains<500.

**Calibration round6-reachable-public PASS**: original2048 files, same SDK and
actual definition/verifier P16,13 functional queries,7 true result-cache hits,
correct saved/undone/unsaved-open/closed results, source restored, SQLite PASS,
CLOSED. Its raw result/wire/log/resource files are retained beside rounds1–5.
This is one calibration session, not nine scale sessions, Photos/UI/endurance,
full-SDK correctness or a complete whole-gate receipt. The earlier round6 JSON
pointing at a typecheck-failed artifact was never executed and remains evidence.

### Final frozen candidate gates and scale validation

Final candidate `/private/tmp/arkts-query-index-proof-20261122` is based on
`1e3886df3c4d27755a53c073462f1456b0a3de7e` plus preserved inherited changes
and this implementation; it is **uncommitted, not main/deployed**. Frozen1059
source inputs and76 runtime assets were unchanged before/after gates.
Server SHA256 `b8ed84281e5c82f2c03c30e42cdac68afe792855760e50017adbf3abbff8964e`;
Worker `ab989fffa6f03c8853adf1798e8119edac9b9c4dcef49abd4b058b348da37b44`.
Native/compiler identities are unchanged and recorded in runtime-identity01.json.

- Final related serial suite: **202/202 PASS**,0fail/skip/cancel/todo,
  `indexed-inputs/frozen-focused51.log`.
- Actual final `pnpm check:fast`: **2787/2787 PASS**,0fail/skip/cancel/todo,
  2026-11-22T12:31:43Z–13:56:08Z; `actual-checkfast52.log`,
  `final-pipeline01.json`. Earlier failed/typecheck/sampling receipts remain failed.
- New isolated scale fixtures2048/20000/30000 each3 sequential fresh LSP
  processes: **9/9 PASS**,117 functional queries,63 actual result-cache hits;
  exact references after saved edit/undo/open unsaved/close, source restoration,
  all SQLite postflight PASS and processes CLOSED. Each scale's first Native
  cache was fresh and next two reused; OS cache was not controlled.
  `scale-after-final-gates01.json`, per-session result/wire/logs/resources,
  and reproducible `scale-summary53.json` preserve all individual values.

Per-operation three-process median/max(ms), same symbol and P16 definition
closure; **global semanticState remains partial**:

| N | definition | first class references | first hot repeat | saved edit first | saved edit repeat |
|---:|---:|---:|---:|---:|---:|
| 2048 | 264.67/268.29 | 2752.84/2759.36 | 523.58/547.38 | 2207.22/2221.73 | 528.62/563.66 |
| 20000 | 1091.94/1101.84 | 13179.86/13340.70 | 5053.91/5180.69 | 13383.25/13727.00 | 4918.12/4967.59 |
| 30000 | 1699.15/1702.63 | 21927.21/21964.44 | 8657.22/8812.28 | 22101.87/22639.53 | 8636.01/8946.71 |

Hits were established from actual cache events and **no new verifier batches or
candidate selection**, not inferred from repeat labels. This is cache correctness/
reuse evidence, **not resolution of scale-dependent latency**:30K hot still
~8.66s. Raw namespace/freshness proof cost remains and is tracked separately.
These generated protocol cases are not Photos, Windows, Zed UI or endurance
acceptance; first lexical producer measurements are not an apples-to-apples
class-query speedup baseline. No new500ms gate or product thresholds changed.

An additional read-only real Photos29995 protocol run is in progress using this
exact candidate, existing isolated source and fresh cache. Its SDK API24 vs target20
state and refusal reasons will be reported without forcing READY or cache use.

### Actual isolated Photos29995: FAILED first-reference observation

Read-only run `indexed-inputs/photos-final01` used the final frozen runtime,
existing Photos36 isolated source topology and installed DevEco SDK API24
(6.1.1.125), project target20; cache `photos-final01-index` was initially fresh.
It is **protocol driven, not UI**, and not a continuous endurance session.

- Started2026-11-22T14:15:00.791Z; handshake7.71ms. Initialization/preparation
  **96370.66ms** then `phase:complete, semanticState:partial`, reason only
  `sdk-inputs-incomplete`, sourceNamespace29995. No forced READY.
- First references: actual original file
  `product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`,
  `extensionWindow`,0-based line43 character9, includeDeclaration=true.
  Expected exact lexical3Locations are in `photos-query-plan01.json`.
- LSP request id2 never returned within the unchanged45000ms **external test
  protection**. At14:17:22.496Z the client timed it out and sent SIGTERM to its
  owned language process. This was **not observed product OOM, Worker crash,
  watchdog recovery or a semantic result/error response**. No cache proof/store
  or successful first answer existed; hot and class queries were not executed.
- At14:16:49.421Z resident lookup refused `program-unobserved`; at14:16:50.177Z
  conservative plan had29995 members/candidates,30batches, batch0 roots1025.
  No batch completion/proof issuance was observed before stop. A verifier/SDK
  isolate started at14:16:50.316Z. The exact internal parse/bind/lookup split in
  that isolate is **unmeasured**; parent progress counters are not evidence that
  this separate isolate was at the same phase. First-answer construction remains
  a blocker before this cache feature can help this actual query. Do not infer
  deadlock/OOM or claim a lexical proof would have been accepted if it returned.
- Process sampler peaks: Node3409.19MiB, Native67.05MiB, tree3476.24MiB.
  Last Worker metric reports whole-process RSS3651088384bytes (~3481.95MiB),
  distinct sampling instants; Worker heapUsed1191337728bytes belongs to the
  semantic isolate, not all Worker heaps. Do not sum repeated RSS across threads.
- Sampled owned PIDs33441/33446 CLOSED; both observed DB integrity checks PASS
  after closure; selected source SHA and two SDK metadata SHAs unchanged. This
  is not an all-SDK/all-source byte hash assertion. No user project/SDK edit or
  daily Zed restart occurred.

Exact requests, external stop timeline, Worker counters/epochs, per-second
metrics, resources, raw service logs and wire are preserved in that directory.
`photos-query-session01.mjs` + `photos-query-config01.json` reproduce the run
with fresh output/cache paths and pinned Node20.19.5. Do not overwrite failures.
This **FAIL remains FAIL** alongside9generated scale PASS; SDK/actual30K first
reference availability and real UI/Windows remain open, not silently excluded
from acceptance. It also does not invalidate the independently demonstrated
conditional reuse cases or establish that every partial answer is cacheable.

### Delivery scope and remaining work

ADR0047 conditional cache mechanism is implemented and its final full gate is
GREEN. Review/acceptance is pending; no commit/merge/push/deploy performed.
Full namespace validation still scales with project N (30K true hits~8.66s).
Actual Photos first reference did not reach proof production within45s. Neither
remaining performance work nor unknown SDK/cross-file cases are declared solved.

Final auxiliary `git diff --check` reports one new trailing blank line at
`src/project/loaded-configuration-witness.ts:362` (final-diff-check54.json).
It is not GREEN and was not silently removed after the frozen full gate.
This whitespace-only review item does not change test outcomes; source/runtime
hash recheck after all runs remains unchanged. Existing2852-line language-service
migration debt remains; the modified file did not grow.
