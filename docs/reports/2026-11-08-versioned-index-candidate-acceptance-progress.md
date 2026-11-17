# 文件版本化索引：最终候选检查与验收进展

日期：2026-11-08。关联 [ADR0043](../adr/0043-versioned-file-index-maintenance.md)、[实施计划](../plans/2026-11-03-versioned-index-maintenance.md)、[Feature Ledger](../plans/references-feature-ledger.md#idx-v1-feature-ledger)。**整体目标仍未完成。**

> 最新权威：GC-005最终完整2406/2406、Rust416 PASS/1既有ignored；Native6553ab87。下列2393及早期状态是历史检查点，不能作为当前运行身份。最新状态见文末awake continuation、规模对照与Round11收据。

## 已完成的最终产品检查

隔离工作树：`/private/tmp/arkts-index-versioned-maintenance-20261104`。父提交 `298d65f5d7f796c347fe8be5c739e428066489d8`，未提交候选源快照 SHA256：

`c475777e9563966f47b75c66dbb36351b63e7a5023e78b6f01048ce6f75a7deb`

| 检查 | 实际结果与边界 |
| --- | --- |
| 完整 `pnpm check:fast` | 2393 PASS、0 FAIL/cancel/skip；3542.12 秒；最终产品源快照前后相同。仅此命令选择的 fast 层，不代表 UI 或所有非 fast 发布验收。 |
| Rust 全工作区 | 410 PASS、0 FAIL、1 既有 ignored。 |
| 实验布局生命周期 | 28 PASS；默认与实验布局的关闭退役均有真实子进程回归。 |
| release、fmt、严格 Clippy | 均 exit 0。测试职责提取仅改变五个 JS 测试/清单文件，五项原生检查按完全相同产品/Rust/构建输入复用，收据逐项标明原执行来源，未伪称重新执行。 |
| 原 100K 替换成本回归 | 原断言通过；所在两项测试合计 65.62 秒，不是单次操作时延，也不是 100K LSP 验收。 |
| 原固定 455 夹具 | 另行显式执行 ignored 入口，原计数、状态、排名、精确位置检查全部通过；固定 585feb，455 源码哈希及干净 Git 状态未变。冷构建 3168.92 ms 超过 3000 ms，**仅该性能门槛按用户授权豁免**。 |

权威收据：`.bench/index-versioned-maintenance-20261104/ix07-final-candidate-check-summary.json`、`ix03-source-domain-verified-checks.json`、`ix07-pinned455-correctness-receipt.json`。历史失败与中断仍保留，不改写为通过。

最终运行产物：

| 产物 | SHA256 |
| --- | --- |
| server | `979d03b64725c87f4d385e4075ccd280dd627e12f69bf8f361fbadb50ceedfd3` |
| semantic Worker | `0117f750dc6f23fea5582f13603e9a3ae7dbcbbc7b3f1461fef6cca884c4f52b` |
| reference verifier Worker | `e84abd74340b649a3ddadf0bbb8d6ae66d55c8c6213e52329166d77f3157720c` |
| Native | `409b08c4cf8096c0e91854040602269690eb98a803c14ae1d9f50567588b61ea` |

四个产物复制到各验收轮次的独立 runtime 后再次核对。Node 固定 20.19.5，SDK 沿用 DevEco 安装路径及记录的 metadata identity；本次没有更换 SDK 或部署日常扩展。

## IDX-V1-OBS-003：规模重命名 oracle 混淆绑定层

首轮 128 校准在重命名处失败。查询位于 `Main.ets` 的 `new Counter()`，服务返回两个本地编辑：导入名改为 `Counter as RenamedCounter`，使用处改为 `RenamedCounter`；不会修改原始类声明。原 oracle 错误要求所有三个引用位置都替换为新名。

独立固定旧版 298d 使用相同输入、SDK、请求顺序与位置，返回完全相同的两个编辑。仓库现有公开回归 `tests/semantic/rename-depth.test.mjs` 中的 `rename preserves an unaliased import's exported name with versioned local edits` 已明确约束该语义。这不是本轮产品回归，不能修改产品来迎合错误 oracle。

随后补充源声明重命名时又发现第二个 oracle 假设错误：把独立 barrel 公共 API 的保名行为套到了直接导入。对本夹具的 `Counter.ets` 类声明发起重命名，两版本均返回三个 `RenamedCounter` 编辑：源声明、直接导入名、构造使用处。它与带独立导出别名的 barrel 边界不同。

修订后的测试保留两类操作并严格校验：

- `rename-first/repeat`：原 Main 查询不变，校验本地别名编辑的精确文本、范围和打开版本 1。
- `origin-rename-first/repeat`：在编辑、撤销、关闭重开后，打开源声明文件版本 1，再校验跨文件完整编辑集；此时 Main 版本 4。缺失、多余、错误文本、错误版本及资源操作都不能通过。
- 源声明场景放在原编辑后首次查引用序列之后，不改变该组原有打开状态与执行顺序。返回 WorkspaceEdit 只核验，不应用重命名；各请求完整参数和版本保留在原始记录中。

两处分别有有效 RED/GREEN；最终额外 11 项驱动合同与 3 项 gate 测试通过。旧版与候选的四份原始响应，用新 oracle 重放均匹配；**这是对已保存字节的重评，不会将原失败运行 retroactively 改为 PASS**。

| 轮次/证据 | 状态 |
| --- | --- |
| `final-acceptance/scale-runs/calibration-candidate128` | 首轮错误别名 oracle 导致 FAIL，完整保留。 |
| `final-acceptance/scale-runs/diagnostic-baseline128-alias` | 固定旧版相同响应、同一 oracle FAIL，保留。 |
| `final-acceptance-02/scale-runs/calibration-candidate128` | 本地别名及前十五项操作通过；新增源声明 oracle 错误导致 FAIL，保留。 |
| `final-acceptance-02/scale-runs/diagnostic-baseline128-origin` | 固定旧版同样三个编辑，保留原 FAIL。 |
| `final-acceptance-03/real-response-oracle-replay.json` | 四份原始响应的严格语义重评记录。 |
| `final-acceptance-03/scale-runs/calibration-candidate128` | 新冷缓存与新进程实际校准 PASS，17 项操作及数据库后检通过。 |

此片只修改诊断脚本和文档；产品代码及四份产物没有改变，完整 2393 回归证据仍对应实际候选。

## 规模实验正在执行

当前活动轮次为 `final-acceptance-03/execution.json`。旧轮次不删除、不拼接成连续测试。正式实验保持三轮普通计时、一轮独立 profile，新旧版交替，冷热状态分别记录。固定两文件静态依赖闭包与扩大真实依赖闭包两因素保留；字节体量及引用密度补充实验等待主实验完整结束后串行执行。

阶段性已观察到：128、2048 文件新旧版首轮冷/暖会话通过；20K 候选首轮冷会话也通过 17 项校验，采样 Node RSS 峰值约 2227 MiB。超过 2 GiB 没有触发已豁免的 Node 测试停线。**样本尚不完整，不据此给出多轮中位数、复杂度或整体验收结论。**

本轮 SDK 准备报告仍包含 `sdk-inputs-incomplete` / `declaration-not-found`，语义状态为 partial。它不等于所有操作失败，也不能将 `phase=complete` 写成全 SDK READY。已通过结果仅证明各具体操作的精确 oracle；规模对照须保留此环境限制。

普通轮次保留原混合驱动的队列日志，两版本相同；重引用/Native raw tee 仅在独立 profile 开启，时延不得混算。静态闭包不是实测 Program 成员数；缺失的 Program 构建/read/hash/parse/realpath 计数标 UNMEASURED，不从写行或复用数倒推。

## 尚未证明

- 多轮规模矩阵完整结果、真实依赖闭包增长结果及最终趋势。
- 原 30K Photos 至少两小时单会话混合耐久；旧失败不因新校准通过而关闭。
- 完整 30K 引用/重命名可用性、SDK 完整性与持续长尾。
- 真实 Mac Zed UI 和 Windows 验收；Windows 最新只读 SSH 预检仍连接超时。

原工作区 40 个无关文件哈希未变，见 `ix08-original-other-work-preserved.json`。未提交、push、合并、部署日常 Zed、删除真实缓存或修改真实 Photos 项目。ADR0043 仍为 Proposed，没有伪造审阅或接受记录。

### Later scale failure

The same round subsequently stopped at26 sessions:21PASS/4functional-gap/1FAIL. [IDX-V1-SCALE-001](2026-11-08-scale-dependency-witness-capacity.md) is a real dependency-graph definition failure, traced to4096 proof facts and minimized128PASS/4608FAIL; fixed old298d also fails. No full matrix/2h completion is claimed and no product threshold was modified. Earlier running statuses above are dated observations.

### ADR0044 / IDX-V1-SCALE-001 implementation checkpoint (2026-11-08)

Mandatory load-owned proof retention replaces the healthy4096-fact quota; source provenance covers all retained facts.
Failure-detail bound and real unprovable/SDK/input/epoch/final-fence rejection remain unchanged. Explicit design revision:
[ADR0044](../adr/0044-load-owned-input-proof-lifetime.md), Proposed, no fabricated acceptance.
New lifetime RED1/7 then final8 plus manifest4 =12/12 PASS; actual LSP128/4608 and original source/SDK regressions26/26 PASS.
Separate approved-sampling20K diagnostic: ordinary cold/warm and trace cold PASS17 actions each so far;
trace warm in progress. Initial sandbox run17 correct actions but /bin/ps EPERM remains FAIL, not discarded.
New-source final fullcheck is queued behind the diagnostic; prior2393 PASS belongs to the prior source only.
Round04 controller has8 Python policy/gate tests PASS and separates confirmed baseline capacity failures from candidate correctness:
old failures remain FAIL, later unexecuted old operations remain UNMEASURED; timeout/resource/closure/integrity errors still stop.
No claim of full scale,2h,UI or Windows completion. Large persisted save/watch Native counters remain a required follow-up.

### Complete-checkout revalidation checkpoint (2026-11-08)

ADR0044's proof repair passes four actual20K diagnostic sessions68 exact operations with integrity/process closure;
ordinary edit-first references7.89–7.91s remain slow. Full details and hashes are in the
[capacity report](../reports/2026-11-08-scale-dependency-witness-capacity.md).
IDX-V1-ENV-003: N was partial staging, so its full-suite CLI/editor/bench ENOENT failures were preserved and stopped.
Exactly five repair inputs plus one test trailing-blank correction were integrated into complete W.
Fresh full checkfast now freezes2375 tracked/unignored inputs, including required bin/editor/bench files.
Old2393 PASS and N26/12 focused evidence do not become a new W whole-suite pass.
Round05 and its byte/reference-density supplement are queued behind complete prerequisites, not yet executed.
Persisted save/write scaling and original30K2h remain required; no UI/Windows/whole performance success claimed.

### Runtime completeness checkpoint (2026-11-08)

IDX-V1-OBS-004: immutable candidate mirrors omitted standard-library/diagnostic/runtime assets.
Prior20K subset-runtime query checks remain evidence, not complete-package acceptance or strict baseline performance comparison.
Direct N full-dist public128/4608 regression remains scoped GREEN. Missing-asset contribution to latency/SDK state is unmeasured.
[Root report correction](../reports/2026-11-08-scale-dependency-witness-capacity.md#idx-v1-obs-004-runtime-mirror-completeness-audit-2026-11-08).
Test-first runtime copier7PASS, controller/package15PASS and density8PASS. Complete built79 runtime assets and historical
installed77 assets (both70 library names) are now pinned separately; baseline3-JS layout is preserved, no defect assumed.
Round05 waiters stopped before load, evidence preserved; complete W fullcheck continues unchanged.
Round06/density06 wait behind strict prerequisites; no new scale/persisted-save/2h result yet. No product change/deploy/publish.

### Refusal and file-size evidence audit (2026-11-08)

Postflight audit of the four preserved round03 30K sessions finds32 global-operation refusals:
16 references responses explicitly say complete workspace snapshot and preparation declares incomplete membership;
16 rename responses use generic current-workspace-input rejection, so membership limitation is present but its exact
failing guard is not proven. None are credited as success. New postflight classifier5/5 PASS, with cancellation/internal
errors/SDK-only partial/count-only and inconsistent evidence negative controls. Raw records were not relabeled as passed.
Evidence: `.bench/index-versioned-maintenance-20261104/analysis/round03-refusal-qualification.json`.
New scale data will use the same scope of interpretation; no causality/complexity claim from total file count alone.

The integrated changed/new handwritten source/test/script audit covers200 files: no new/growing over500-line violation.
Seven changed legacy files remain over500 and all shrank: core lib1131,sqlite lib761,DocumentStore1661,
LegacySemanticEngine686,installed semantic smoke2142,feature matrix902,workspace coordinator test843.
Cohesive extraction and characterization evidence remains in earlier TDD slices; line counts alone do not prove cohesion.
Evidence: `ix07-proof-repair-source-size-audit.json`.

The completion audit still distinguishes required reconcile-after-missed-watch from the existing no-event-new-file defect
INPUT-010; it also retains the source-tree-cache namespace-drift boundary with no shared managed-cache exclusion contract.
Neither is silently called fixed by old/new equivalence, Node quota repair or Native integrity checks.
No further product change is made during the frozen complete check.

### IDX-V1-INIT-001: cold namespace RED/GREEN checkpoint (2026-11-08)

Previous complete checkfast2402/2403 FAIL is retained, source unchanged. Its failing assertion was Native catalog phase,
not an observed semantic READY transition. [Detailed causal chain and limits](../reports/2026-11-08-cold-cache-multi-root-initialization.md).
Cold shared directory creation is a confirmed independent defect: public Rust cold race64/64 plus lease-dir-only58/64 failures;
real Native initialize third pair IO/File exists; controlled two-root public LSP8/8 degraded, actual Native IO frames retained.
Original full failure lacks raw Native error, so exact historical equivalence remains unproven; no false claim otherwise.
Minimal AlreadyExists + original no-link/type/reparse revalidation repairs valid concurrent creation without accepting files/links,
adding retries, locks, thresholds or a schema change. Native release now9c65ce... versus retained409b08....
Rust cold/record concurrency9PASS; formal public cold/warm/root semantics/symbols/close plus original lifecycle/manifest15PASS;
same controlled public sequence8/8PASS; real Native64 pairs/128 initialize all succeed, all exits0. Focused ClippyPASS.
New source needs fresh full Node/Rust/default/experimental/pinned455 correctness checks; old410/28 not reused as new whole PASS.
Complete runtime79 assets and unchanged70 standard libraries remain required before resumed scale/30K2h. UI/Windows untested.

### Fresh combined candidate checks (2026-11-08)

The previous complete2402/2403 FAIL and stopped round06 remain preserved; new controlled public evidence confirms
IDX-V1-INIT-001 can produce that same catalog state from real Native IO/AlreadyExists. Directory idempotence repair,
no-link/type/reparse rejection and original initialization/root isolation assertions remain intact.
Fresh combined candidate checks, no reused old Rust results: workspace414PASS/0FAIL/1existing ignored;
experimental retirement28PASS; experimental namespace/use-record9PASS; release/fmt/strictClippyPASS.
Original pinned455 correctness explicitly rerun:1PASS, source455 hashes/head585feb and clean input unchanged.
Measured cold3089.691304ms exceeds3s; standing user timing-only waiver, not a timing pass.
Fresh complete Node checkfast is now running, not yet a final whole-candidate verdict.
Receipt `ix03-cold-namespace-final-checks.json` freezes2381 tracked/unignored/compiler inputs and backups all owned sources.
Round07 only starts if the six checks AND both declared supplements pass; gate17 controlsPASS, density8 controlsPASS.
Proper runtime79 assets, persisted-source1/0 counters, all ordinary/trace scale trials and original30K2h remain queued.
No user data/real cache deletion, deployment, commit, push or merge. Real UI/Windows not verified.

### IDX-V1-OBS-005: pinned driver and restored-content oracle (2026-11-08)

Pre-load audit stopped round07 and density07 while both were WAITING with zero runs/no child process.
Their receipts remain `ABORTED_BEFORE_LOAD_DRIVER_AUDIT`; the full candidate check continues unchanged.
Two test-driver errors were found before load: the controller hashed generation07 persisted scripts but invoked
the original unpinned `persisted-source-scale/run.py`, and its output receipt path disagreed with the configured directory.
The pinned generation08 now invokes its own run.py and reads that same configured output receipt; path regression
on generation07 is RED (1FAIL/1PASS), generation08 GREEN (2PASS).

The prior restored-input oracle required one new document write and derived publication outcome from write count.
That conflicts with sealed-content reuse: `maintenance_file_engine.rs` find_version may publish a new mapping/head
with zero new facts. Existing real Native `maintenance_reuse` regression, included in fresh workspace414PASS,
asserts data-updated/zero writes and correct searchable symbols across undo/redo with no parser calls.
Generation08 keeps strict unique-save=1, duplicate=0/unchanged/same-head checks. Restore accepts only0 or1 writes
with dataPublished=true, data-updated, strictly advancing head, matching complete qualification and zero qualifier writes;
zero writes must have zero fact rows. Persisted symbol presence/absence and restored disk manifest are still mandatory.
Six new oracle tests PASS after retained module-missing RED, including false unchanged/publication, nonzero hidden rows,
head mismatch, extra qualification writes and incomplete input negative controls. This is a driver correction, not product repair.

Generation08 controls: Python gate/baseline/runtime17PASS plus path2PASS; density8PASS; write oracle6PASS.
New controllers38297/69173 are waiting on fresh complete checks/main acceptance respectively. Product source/artifacts
remain frozen. No scaling, two-hour protocol or real UI completion is claimed. Raw evidence and old drivers remain under
`.bench/index-versioned-maintenance-20261104/{final-acceptance,persisted-source-scale,density-acceptance}-0{7,8}`.

### Fresh final whole-candidate gate GREEN (2026-11-08 10:10 UTC)

The actual frozen integrated candidate passed complete `pnpm check:fast`: **2406/2406**,0failed,0skipped,0cancelled;
Node test duration3527845.166422ms. Fresh workspace Rust414PASS/1existing ignored, experimental28+9PASS,
release/fmt/strictClippyPASS and pinned455 correctness1PASS complete the six checks and two declared supplements.
The455 cold3089.691304ms timing-only user waiver remains explicit. SourceAfter equals all2381 SourceBefore hashes.
Receipt: `.bench/index-versioned-maintenance-20261104/ix03-cold-namespace-final-checks.json`.
This replaces no historical failures and does not imply true UI/Windows or whole scale/endurance acceptance.

Round08 copied/verified all79 current runtime assets, with the exact server145f982c/semantic19715a2b/
referencefc3b7229/Native9c65ce08 identities recorded in the receipt. Persisted source public LSP calibration128
and formal128/2048 sessions PASS, including exact Native file-write1/duplicate0/full-qualification0 counters,
disk-derived symbols after close, forged-save-payload rejection, restored source manifests, normal closure and DB integrity.
20K is currently executing;30K and the full multi-round semantic baseline/current matrix plus original30K2h remain pending.
2048 changed-save observed~656–733ms; zero-write duplicate~634–745ms. These are preliminary end-to-end maintenance
observations including scheduling and qualification, not parser-only timings or physical IO claims; no phase attribution inferred.
Source counts204 changed/new handwritten files audited,0new/growing over500-line violations;7shrinking legacy debts retained.
Evidence: `ix08-integrated-source-size-audit.json`. Product W remains frozen; no commit/push/deploy/merge.

### IDX-V1-GC-005 and OBS-006: round08 stopped, not endurance complete

Round08 persisted calibration128/formal128+2048 passed their symbol/write/input/integrity checks.20K FAIL:
save15848.6ms (1document write), duplicate unchanged0writes but qualification missing within original30s.
All observed LSP-owned PIDs closed/server0/integrityPASS. Raw failure and controllersSTOPPED remain.
Independent same-release Native-only128/20K and protected stack samples locate GC SQL scanning while the incoming
writer waits on Collection::Barrier. Native20K operation labelsPASS do NOT establish complete success: teardown
needed protection kill(-9); validated interpretation records closureFAIL, ACK signed offsets not request latencies.
SQL VM regression (actual bundled3.53.2/public collector) RED512549k->20488488k; rewriteGREEN28k->116k.
No deleted-data/owner/fence/budget/schema rule weakened. NULL/live-pin/current-data characterization passes original,
removing NULL guard from rewrite fails, final guard restored. Default focused testsGREEN; experimental/release and
new final complete checks still required. Prior complete2406PASS applies only pre-GC-repair frozen snapshot.
OBS006 audit adapter lost CLI argv; corrected after RED with3PASS and real empty isolated cache-GC CLI0/schemaPASS.
Earlier raw automatic-GC errors are driver-invalid evidence, not proven product CLI failures. Shared observer changed
only after all round08 controllers terminated. Full scale/30K2h/UI remain incomplete.
[Detailed report](../reports/2026-11-08-versioned-index-gc-query-cost.md).

## Final repair focused/public checkpoint (2026-11-08)

Default focused GC12PASS and experimental WITHOUT ROWID GC12PASS, including actual bundled collector VM work.
Release rebuilt13.84s; Native6553ab87ff0c9d20a36344062fa9b38fa095251fbbaeae0d91adf3395d2c9b2e.
Independent complete79-asset public LSP replay on new20K/30K fixtures passes original30s observations,3unique saves,
3duplicate watches and restore, exact symbols/forged payload refusal, source manifest restoration, process exit0/closure
and integrity. No automatic cache-GC error after adapter argv correction.
20K save median2355.2ms/max2440.5ms; duplicate median2377.9ms/max2381.1ms.
30K save median3376.2ms/max3484.1ms; duplicate median3358.0ms/max3360.0ms.
These are3 in-session samples, not independent cold trials. Earlier failed20K first save15848.6ms and duplicate30s
failure remain, not a valid many-round performance ratio; adapter argv also differs, while direct Native stack/VM
experiments independently isolate SQL scan cost. Full scans still grow with real source count; no500ms success claim.
Evidence `driver-failure-20261108/repaired-public-summary.json` and all underlying runs.
Fresh combined whole-candidate checks and gated full scale/original30K2h are next, not yet passed.

### Current execution after GC repair (2026-11-08 10:35 UTC)

New candidate full gate is RUNNING: `ix03-gc-query-final-checks.json`, frozen2384 inputs, fresh workspace Rust
currently executing. Six main checks plus three mandatory supplements (experimental namespace, experimental GC
work and pinned455 correctness). Previous complete2406PASS remains a pre-GC-repair result. Round09 controller
82102 waits for that gate; density09 controller29593 waits for main acceptance/restoration. No simultaneous pressure
load, no product source or queued-driver mutation during this freeze. Formal30K2h has NOT_STARTED.
Latest independent same-scenario20K/30K diagnostic PASS is described above; not final-scale/UI/endurance approval.

### New GC-005 candidate non-Node full checks GREEN (2026-11-08)

Fresh workspace Rust416PASS/0FAIL/1existing ignored (100 result summaries); release/fmt/strictClippyPASS.
Fresh experimental retirement28PASS, namespace/use-record9PASS, GC work12PASS, pinned455 correctness1PASS.
New complete Node checkfast is RUNNING. All2384 frozen inputs rechecked unchanged; final sourceAfter proof
still belongs to the full controller. Round09 and density09 remain waiting; no pressure load concurrent with checks.
Exact log/receipt prefix `ix03-gc-query-final-*`. Previous2406PASS remains pre-GC-repair evidence only.
Documentation canonical-ID/current-ledger changes are in R only with a pending doc-only correction manifest;
frozen W/raw receipts are untouched. No final scale/endurance/UI/Windows completion claimed.

### OBS-007/008 pre-load driver audit (2026-11-08)

Generation09 remained WAITING/zero-runs and was stopped before load; full product check49098 continues untouched.
Static30K target catalog omission was discovered before any long-run launch. Public generator on preserved isolated
30060-input/30000-source Photos produced the exact prior44-target catalog609fb35c; generation10 pins that input
and baseline identity before its full gate and refuses missing/invalid/symlink inputs without starting load.
A real framed child acknowledges shutdown then ignores exit and handles protectiveTERM with code0, proving old
code0/cleaned-up PID evidence insufficient. New shared closure policy requires observed normal exit, shutdown ACK
and no close/cleanup protection; all scale/persisted/density/Photos wrappers enforce it. No deadline/budget changes.
Baseline known refusal exception also requires strict normal closure; historical failure remainsFAIL.
Python21 +Node32 +path2 controlsPASS; initial sandbox/formal-env and patch-script failures retained.
[Detailed evidence and limits](../reports/2026-11-08-index-acceptance-inputs-and-close-evidence.md).
Generation10 main76464 waits for fresh full gate, density63088 only after main/restored. Whole scale/2h/UI NOT_COMPLETE.

### Final GC-005 candidate full gate GREEN, strict-close round10 started (2026-11-08 11:43 UTC)

Fresh `pnpm check:fast`2406/2406PASS,0failed/0skipped/0cancelled; test duration3573390.392551ms.
Fresh Rust416PASS/0FAIL/1existing ignored, fmt/strictClippy/releasePASS; experimental retirement28, namespace9,
GC work12 and pinned455 correctness1PASS.455 cold3135.678718ms exceeds3s and is user-waived for timing only.
All2384 frozen inputs equal final sourceAfter. Receipt `ix03-gc-query-final-checks.json`, Native6553ab87,
server145f982c/semantic19715a2b/referencefc3b7229. This is the actual post-GC-repair whole check, not reused prior2406.
Round10 verified/copied79 runtime assets. Actual persisted128 calibration and formal128 PASS with strict NORMAL
closure: shutdown acknowledged, observed code0/no signal, zero protection/cleanup interventions; DB integrity and
input restoration remain required.2048 is running. Three-round semantic matrix/original30K2h/density/UI still incomplete.
No W product/doc or queued-code changes after full freeze; canonical ID documentation corrections remain outside W
with explicit pending manifest. Original failures and old frozen draft IDs remain retained. No commit/push/deployment.

### Strict-close persisted-source four-level scale complete (round10)

Generated independent plain-class sources; SDK intentionally unavailable, no semantic Program or Photos/UI claim.
Three saves/duplicates within one session per size, not three independent session trials. Real framed public LSP,
complete79-asset current runtime, Node20.19.5, Native6553ab87.

| actual sources/native indexed | save median /max ms | duplicate-watch median /max ms | save/duplicate document writes | close |
| --- | ---: | ---: | --- | --- |
|128|415.95 /442.50|409.93 /410.89|1 /0|NORMAL|
|2048|541.50 /568.65|513.76 /521.80|1 /0|NORMAL|
|20000|2413.60 /2463.19|2273.22 /2378.58|1 /0|NORMAL|
|30000|3454.30 /3484.08|3480.68 /3493.96|1 /0|NORMAL|

Each session has7 file terminals (3save,3duplicate,restore),8 real qualified terminals,15 full-start requests but only8
accepted starts. Refused-busy admission attempts are not extra builds/publications. Including required cold facts,
logical documents written are N+4; qualification writes0 documents. This supports per-file delta facts and no full
facts rewrite, while complete-current qualification/read work still grows. It does not prove parser-call or physical
write-byte counts; release read/hash/parse/realpath calls remain UNMEASURED.
Exact persisted symbols after close/forged save payload rejection, restored input manifests, unchanged artifacts,
normal shutdown/no protection and DB integrity allPASS.128 calibration is separate from the formal128 row.
Raw results and sampled per-PID RSS retained in `final-acceptance-10/persisted-source-scale-summary.json`.

Semantic matrix now running, including candidate128 exact17-action calibration PASS. Old baseline20K/30K actual
trace confirms configuration-witness-capacity at4096 and safe normal close/integrity; preflight records remainFAIL,
not successful samples. Later ordinary baseline cases may continue only under the verified narrow failure policy;
current candidate gets no such exception. Full three-round matrix/density/original Photos30K2h remain unfinished.

### Round10 actual20K dependency closure cold session (first ordinary trial)

Complete79-asset current package passed all17 exact queried operations in dependencies20000 cold session, including
first/repeated completion/definition/references/rename, edit/undo/reopen and origin rename. Actual strict normal
shutdown, source/runtime identity and DB integrity remain enforced. This is proper full-package evidence, unlike
restricted older20K mirrors under OBS004. It is one ordinary cold session, not the completed3-trial matrix orPhotos/UI.
Raw `final-acceptance-10/scale-runs/dependencies-20000-candidate-0-ordinary-cold/result.json`; warm currentlyrunning.
Baseline20K/30K preflights stillFAIL with4096-capacity proof;30K global semantic gaps are not credited as successes.

Round10 first-trial20K actual dependency sessions now bothPASS/NORMALclose,17 exact queried operations each.
Cold means newprocess/empty application index; warm means another newprocess with retained index, not a reused
semantic Worker/Program. Repeat operations within each session are separate query-hot observations. Old20K ordinary
cold andwarm first-definition capacity refusals remain2FAIL with later operationsUNMEASURED. Current30K dependency
cold is executing; firsttrial/three-trial/Photos2h completion still not asserted.

### IDX-V1-SCALE-002: serious generated30K dependency tail, existing active-work boundary

Firstordinary30K dependency reopen-definition id16 took22480.45ms, exact result/normalclose; parentadmission-to-send
19245.20ms(85.61%), residual3235.25ms includesunmeasuredWorker/IPC. Alreadydispatcheddiagnose23 occupiesordinary
active slot beforedefine24 arrives; codepumpactiveguard and matchingepoch1/revision5 events establishthis wait.
Not eightqueueddiagnostics bypassingpendingFG. ADR0027Proposed decision2 explicitlydoesnotpreemptactivecompile;
no claimthisisnewimplementationregression orNativeGCwriteproblem. InternalProgram/checker/IO splitUNMEASURED.
[Precise operation/timeline/source/ADR limits](../reports/2026-11-08-30k-dependency-definition-tail.md).
Repeatedmulti-second/20s-classlatencies remainanOPEN experienceproblem, not500mshardfailure. Nobaselinespeedup
ratiofromold4096refusals. Readonlyanalysisdidnotaddload/changecandidate;threeordinarytrials/profile/Photos2h pending.

### 2026-11-08 awake continuation / IDX-V1-ENV-004

Final post-GC whole check remains2406/2406 and Rust416PASS/1existing ignored,2384 frozen inputs unchanged.
Round10 completed all96 ordinary comparison sessions (66PASS/18functional-gap/12known baseline refusalFAIL).
Ten profile cells completed before a baseline20K initialization observation overlapped confirmed Clamshell Sleep;
zero query actions in that interrupted case, NORMAL shutdown/integrity, no evidence of productOOM/deadlock.
User confirmed awake; exact isolated cold/warm retries bothPASS17 and NORMALclose (initialization27137/24940ms).
OriginalFAIL retained. [Environment evidence and continuation](../reports/2026-11-08-index-acceptance-sleep-interruption.md).
Round11 verifies unchanged gate/source/runtime/SDK/driver identity, reuses completed cells, runs remaining20profile
cells, then originalPhotos30K7200s single-session protocol soak. No claim of completion/UI/Windows yet.
Generatedtrue20K cold edit-first references median9488ms(max9517,3trials) remains slow; true30K reopen-definition
median22480ms(max24217,3trials).30K global refusals remainfunctional gaps, never successful fast responses.
No new product source, build, commit, deployment or published release.

### IDX-V1-SCALE-003 / round11 stopped on a real completion deadline

Actual30K dependency profile-warm first completion LSPid4/Workerid5 failed-32603 after30132ms;
parentwatchdog execution-deadline30000ms, not external45s cutoff, notOOM or systemSleep.
Admission/send0.486ms and Workerdispatch0.433ms: distinct from SCALE002 activeBGqueue wait.
Program/checker returns4/4, sync19/19, phase=request/terminalnone; exact hot substageUNMEASURED.
NORMALshutdown/no protective termination and integrityPASS; originalFAIL kept. Two bounded same-input ordinary/trace
controls started, ordinary firstcompletionPASS23948ms sofar; not yet completed or proof of trace-only cause.
Main24433 and waiter51394 terminatedFAIL; Photos7200s/density notstarted. Only control51588 live.
[Timeline/source/remaining uncertainty](../reports/2026-11-08-30k-profile-completion-deadline.md).

### SCALE003 paired controls have now terminated (no product change)

Same30K/SDK/runtime/cache/query sequence: ordinary17actions completed with8 known full-reference/rename gaps,
firstcompletion23948msPASS, NORMALclose/integrity. Trace control failed firstdefinition at~30.13s,
execution-deadline phase=program (3starts/2returns), whereas originalcompletionfailure was phase=request/allreturns.
Trace Nodepeak1394MiB, NORMALclose/integrity. Different observed phases cannot be unified without stack evidence;
a single pair cannot prove tracing is the only cause. Raw `warm-completion-deadline-20261108`.
Main24433, postflight51394, control51588 are all terminal; no active pressure load. Photos7200s NOT_STARTED.
Next narrow diagnosis must distinguish mandatory compiler work from optional Program-stats synchronization,
without threshold changes or speculative product fixes. Final2406/416 remains source-specific, not full acceptance.

### SCALE003 call-stack diagnostic (separate modified bundle, 2026-11-08)

Two exact wrappers instrument only compiler.getProgram and synchronizeHostData in a copied semantic bundle.
Original79-asset runtime and2384 frozen product sources unchanged. Injection guard tests2PASS; initial incorrect
absolute/relative runtime-copy input refused before load, then corrected. No product patch/rebuild/threshold change.
Context7 TypeScript resolve again failed transport; actual installed4.9.5-r10 and its bundled source are authoritative.
One protected run52680 failed firstdefinition~30015ms/NORMALclose/integrityPASS, not a new formal sample.
Required getDefinitionAtPosition preflight: getProgram27028ms includes sync27027ms. Later getProgram1.58ms
from definitionCandidates, residentcapture0.79ms, programStats0.995ms. No extra slow Program build fromstats here.
Compiler query callback28777.898ms includes groupedcreateProgram26408.986ms; these nested values MUST NOT sum.
Trace eventdefinitioncomplete at15:00:24.012Z and certification at.013; parentexecutiondeadline at.423 with all
Program/checker returns. Last statsgetProgram returned23.331Z, so remaining observation/event span~681ms, not27s.
Do not assign the remaining public-result interval to a specific finalfence/IPC stage without direct measurement.
`scale003-stack-probe/causal-evidence.json` retains full call stacks/inclusive timings and modified-bundle identity.
The slow extra-statistics-Program hypothesis is falsified in this sample; required real30K dependency compilation
is a major measured cost. It does not prove the exact same hot stage in earlier uninstrumented failures.

Independent original Photos30K slice14799 was then started on the UNMODIFIED79-asset runtime, exact preserved
30060 input identities and full original scenario matrix; it calibrates44targets before its own7200s formal phase.
SCALE003 staysOPEN, original profile/whole acceptance remainsFAILED/incomplete. This independent slice doesnot
turn a failed gate green or omit failing Photos scenarios; no realZedUI/Windows claim. Density/finalCargo stillpending.

### IDX-V1-INIT-002 OPEN: originalPhotos cold validation silence (2026-11-08)

Independent Photos14799 terminalFAIL:30000 staged sources, thenexact30s no progress and parentdegraded;
zero useractions/formalSeconds, originalinput30060 restored, NORMALshutdown. NOT a7200s success.
NativeRSSpeak81.6MiB/Node740MiB. Privatecandidate1.83GB, manifesthead1/publishedgroup1/sealedversions30000/
qualification1 but user_version0 and control stilllegacy: private data logically sealed, physicalactivationnotcomplete.
ActualcodeCatalogMigration.try_activate writesprivatequalification then prepare_catalog validates quick/FK/FTS,
then setsformat andsourcefences/publishescontrol. State bounds locate failure within pre-format validation, notquerySDK.
PostflightCLI integrity_check timedout60s; this isUNPROVEN integrity, NOT observed corruption. Other2DB checksPASS.
Original raw resultpostflightFAIL preserved. Separate readonlystate/schema/count receipts inphotos-soak-20261108-awake.
Same bundledSQLite3.53.2 onAPFScloned DB:quick_check executes60s thencontrolledVMinterrupt; FK21.29s/0violations;
FTSintegrity1.34sPASS; fullintegrity60s interrupted. No original DB writes; diagnostic interruptionsnotchecksuccess.
Currentdefault2MiB pagecache vs legacybulk64MiB is a hypothesis: existingCatalogBuildSession explicitlysets65536KiB;
newversionedbootstrap hasnoequivalent. Independent diagnostic40164 compares exactsamecopy, no product changes.
Do notblindlyraise deadlines, skipvalidation, or claimcachecausebeforemeasurements. Context7rusqliteresolvefailed;
actual0.40.1 hooks/bundled3.53.2 APIsused. Postscan SQLliveness/progressgranularity also requiresdirectevidence.
Photosrepeat/7200/density/Cargo pending; SCALE003 remainsseparateOPEN; wholecandidateacceptanceNOT_COMPLETE.

### 2026-11-09 INIT002 implementation checkpoint

RealPhotos cold failed after30000staging/30s silence, noactions/formal time. SameSQLite3.53.2 copiedDB
quick_check42.6s but actualVM callbackmaxgap282ms; cache64 hypothesis notsupported, no cache/timeoutchange.
Scoped realSQLprogress/cancel+Native relay+strict parent DTO+workspaceaggregation+LSP validationstatus implemented.
PublicRust firstRED->GREEN, cancellation/retry/realFKcorruption2PASS+existingretry3; Native actualNDJSON RED->GREEN1;
realframedLSP RED->aggregationgapRED->GREEN2; publicadapter/lifecycle25PASS; focusedstrictClippyPASS.
Old2406/416 fullgate belongs to preINIT002 source. Fresh integrated full check and original30K/7200s notcomplete.
[Detailed mechanism, evidence and boundaries](../reports/2026-11-09-cold-photos-sql-validation-liveness.md).
Temporaryworktree lost654 baselinefiles aroundmidnight; hashverifiedrestorepreservedchanges, causeUNKNOWN.
No productbudget/V8/timeout/validator/identitypolicy change, no merge/release/deployment. SCALE003 remainsOPEN.

### 2026-11-09 OBS009 fixture isolation repair and fresh full restart

INIT002 firstfull defaultRust419PASS/1existing ignored; strict/release/experimentalretirement/GC/validation/455
correctnessPASS. Experimentalcoldnamespace failedbeforeproductAPI due sharedtesthelper time-key collision.
Publicconstructor actual32x32 RED837/1024; formalSQLiteRED765/1024 andNativeRED776/1024. Atomicsequence+mkdir
fixes bothsamepatternhelpers, no less concurrency/adopt-existing; focusedSQLite15/Native2PASS.
Only failedfullattempt's13ownedprocesses stopped,0remaining; partialNodecheck isNOT PASS, oldsupplementFAILkept.
[Cause/repair/raw evidence](../reports/2026-11-09-test-directory-clock-collisions.md). Newcomplete check required.
No product timeout/cache-size/RSS changes; INIT002 fullchecks/realPhotos7200s/density stillpending; SCALE003 OPEN.


## 2026-11-09：INIT002/OBS009 最终整合候选全量通过，新 Photos 会话启动

实际收据 `.bench/index-versioned-maintenance-20261104/ix10-integrated-final-checks.json`：
Node `pnpm check:fast` **2412/2412**，0 fail/cancel/skip；Rust workspace all-targets
**421 PASS / 0 FAIL / 1 原有 ignored**；workspace release、fmt、严格 Clippy 及全部必需补充检查 exit0。
2397 个冻结输入 before/after 完全一致；UTC 2026-11-08T18:43:35.108004Z 完成。
455 文件正确性通过，冷构建实际 **3381.351775ms**；仅 3s 性能门槛按用户授权豁免，不能写成时延达标。

server SHA256 `d34a69c36cf507d0504de7ab3e56e8003d3fd0dcf42bd7b2758dc64f183df26f`；
Native `9034ad301aaca22c3cb516778c8e044fa4593be50eba674b61efc6f800732dce`。
semantic/reference Worker 与旧 ordinary96 运行产物哈希相同；server/Native 不同，
旧96轮仍保留原包身份和失败，不冒称新包重跑或时延等价。

`final-acceptance-13/execution.json` 已核验最终 gate、完整79资产/SDK与原隔离 Photos 30060输入；
北京时间 **02:44:23** 启动新会话，先冷索引及44目标校准，再独立7200s正式混合负载。
本记录时正式计时尚未开始，不计入等待/旧失败/校准时间。原失败和 SCALE002/003 保留。
这是带 Native 原始协议 tee 的协议驱动，**不是 UI 通过**。SDK/20K成员限制的 degraded 单独记录。
Windows SSH 8s 超时 exit255：`ix10-windows-preflight-20261109.json`，未部署/未实测。
ADR0043/0044 仍 Proposed；ADR索引0043旧 NOT_STARTED 状态只在 canonical 文档纠正，
冻结 W 文档后续再同步；不改审批历史、不提交/推送/合并/日常部署。


### 同会话正式负载进度（2026-11-09 02:59，非最终结果）

实际 `formalStartedAt=2026-11-08T18:51:49.660Z`，即北京时间02:51:49；
44目标校准、Native30000/30000物理发布已完成，正式运行约465s。
139动作/456请求是含校准累计，不是正式阶段数量；原save212动作223ms、close255动作1371ms已通过，
动作耗时不冒充单LSP耗时。早期正式**成功响应**定义中位1167ms/P954240ms，补全/详情约164/180ms；
样本和代码身份在 `analysis/photos13-live-request-observation.json`，不是最终全程分布/多轮中位数。
取消、内容变化拒绝、完整范围拒绝都保留为独立响应，live `knownGaps`未持久化不能当0。
当前未保护停测；一条语义Worker启动记录，暂无error/fatal级日志，不能等同所有请求成功。
Node/Native采样峰分别约1091/212MiB，不相加为进程树峰，不凭八分钟RSS判断泄漏。
候选/阈值/SDK未改；正式7200s、退出/恢复/完整性/睡眠核验尚待完成，协议不代替UI。


### 30K运行中计数审计：不把缺失取消指标当零

`final-acceptance-13/write-metric-scope-audit.json` 核对298d与当前源码：
旧`catalog_build::actual_rows/writtenRows`有每源码1条document；新`versioned_file_writer`的
`factRowsWritten`为八类facts之和，包含binding direct-export provenance、排除文档及manifest/qualification。
两者不直接相除，更不当物理写放大倍数；FTS触发器、SQLite页/WAL/元数据另列。
`Terminal::failed`不携带已写行计数；取消前可能已有sealed/staging工作，缺失为**未测**，
不能加0，也不能把成功terminal合计宣称全体尝试的累计物理写入。
最终分别统计唯一attempt/scope/URI、成功资格、文件发布/免写、取消/未知及提交回调，
并结合store身份、目录/DB/WAL和版本可见性证据判断是否重建；本段不是完整耐久结论。


### 正式运行指标身份审计（非完成声明）

`final-acceptance-13/memory-and-membership-metric-scope.json` 核对源码：
`worker-metrics.ndjson` 的heap是**语义Worker isolate**，RSS是**整个Node进程**；不再次加线程RSS或把heap加到RSS。
其 `projectFiles` 来自工作区membership/文档计数，**不是实际Program文件数**，当前正式会话此项未测。
实际Program/传递依赖需在后续独立诊断中观察，不能回填正式负载；先完成不被干扰的7200s。
当前启用现有内存指标、语义队列trace和Native原始tee，关闭GC/编译器探针；
时延明确为这种插桩协议模式，不是普通无观察器计时或真实UI体验。


### 2026-11-09 03:52：正式一小时中途快照，未完成两小时

`final-acceptance-13/one-hour-checkpoint.json` 实际 `formalSeconds=3636.966`，同一进程/随机序列，
累计638动作/2720请求含校准；无保护停测，语义Worker启动一次，error/fatal级日志0。
这些不等同全部LSP成功：取消、内容变化拒绝、完整范围拒绝及持续定义长尾继续单列。
RSS采样峰 Node1112.17MiB、Native235.70MiB、树1378.31MiB，独立峰不能相加，亦不据此证明无泄漏。
原始日志/Native tee/资源和队列采集继续；完整7200s、正常退出、源恢复、DB完整性及无睡眠核验仍未完成。
协议验收不代表UI；不部署、不改产品阈值或中途重启。


### 正式首小时响应分布：支持功能与完整范围拒绝分开

`analysis/photos13-first-hour-request-distribution.json` 仅统计正式前3600s内发送且收到的2604响应行；
跨窗口请求显式排除，不是三轮独立试验；Native tee/语义队列trace/内存指标模式，不是普通或UI计时。

| 方法 | 成功响应数 | 中位ms | P95ms | 最大ms |
| --- | ---: | ---: | ---: | ---: |
| completion | 216 | 229.27 | 426.63 | 1207.89 |
| resolve | 140 | 213.94 | 379.85 | 517.29 |
| definition | 1497 | 376.02 | 4134.98 | 5589.09 |
| workspace/symbol | 13 | 2758.32 | 5716.04 | 5716.04 |

定义与全局符号长尾未解决。这里未测当前请求的内部组成，不套用旧SCALE002排队比例或猜测是Program。
与早期小样本中位数不同可能有负载/目标/缓存混合变化，不能宣称优化收益。
错误响应另列：definition取消74，references内容变化拒绝80、完整范围拒绝100，rename完整范围拒绝50。
这些304响应不计成功；不能由动作oracle完成宣称100%功能成功，更不能称30K完整引用/重命名已支持。
500ms仍体验目标，不据偶发超标停测；两小时、正常退出及收尾核验仍待完成。


### 90分钟快照及一个原始Native failed终态的取证

`ninety-minute-checkpoint.json`：1个store；workspace有计数终态为首次30000、后233次0文档；
503个file data-updated、155免写、1 failed、其余取消/未取得资格分别保留，不宣称全体维护成功。
该快照采集8.5s只读解析日志，观察开销不为0；不启动额外基准，时延仍标插桩协议模式。

原始 `native-file-...-653` SmartPickerManager.ts 报`maintenance source fence failed`且dataPublished=false。
`native-source-fence-rejection-adjudication.json`及raw/chunk/LSP通知证据表明：
19:36:40.510第二个watch-burst定义完成，随后脚本恢复16文件；40.554 Native拒绝提交；
40.556才发恢复通知，40.575 Native收到rev366。是磁盘变化领先通知的实际窗口，后续同URI669免写、
workspace671对rev366/head244同store重新完整资格，复用30000、0 facts。
结论为已观察到安全拒绝及恢复，未证持久不可用/数据错误；原`failed`仍计数，不改成成功或取消。
具体失配的mtime/长度/SHA/身份字段未测，不能细化推断；未发布也不代表未写staging facts。
**纠正此前措辞**：`currentInput=false`在当前file终态本就如此，只有qualified workspace可true；
不能以此单独证明输入过时。依据是最终源证明拒绝、实际事件与后续完整资格。
已有公开sourcefence/物理store替换/失败后重试回归相关，但本观察不冒充新增独立复现测试。

另一个Native68700为定时cacheGC，正常exit0，活动缓存protected、removedBytes0；
主Native65636与语义Worker未因此换代。实际Native进程创建数与角色、采样资源峰分开统计。
正式会话仍继续，完整7200s及最终正常关闭/恢复/完整性/睡眠核验未完成。


### 2026-11-09 正式121分钟完成，仍非整体验收完成

[完整结果与计数边界](2026-11-09-photos30k-versioned-index-endurance.md)：正式1138动作/5160响应，
成功4577；取消145、旧请求失效141、完整引用/重命名范围拒绝297分别保留，不计成功。
全会话1195动作/5275请求，正常关闭，30060输入及运行后30444树条目对照一致，DB完整性/外键通过；
79资产/SDK及2397冻结源码复核一致。语义Worker仅启动一次；4个Native含探测及两次GC，不是4次主服务重建。
首次workspace30000写后295个有计数终态0文档写；596个Native终态写量未测，不以此称零写或物理写放大比。
定义中位371.67ms/P95 4131.45ms/最大5638.33ms，长尾仍在。

旧电源核验只看Sleep栏目，把运行前Entering DarkWake误判系统休眠；Apple实际logger及CPU状态源码支持区分。
本轮实际日志先RED、9项GREEN（含原4项/真正Sleep仍FAIL/未知格式UNPROVEN），
原FAIL、原电源日志和原控制收据保留；当前正式/会话无已记录系统Sleep重叠，绑定精确收据核验PASS。
不宣称CPU持续满载或UI通过。

Density13校准17断言通过但收尾psEPERM，原FAIL保留；在允许只读进程采样下新建density14串行比较，
不改变产品/时间/内存阈值，不合并会话时长。其他实际Program/当前Native规模/冷索引并发与重开覆盖仍待补齐，
SCALE002/003、SDK/全量语义缺口、Windows/UI限制保留。
