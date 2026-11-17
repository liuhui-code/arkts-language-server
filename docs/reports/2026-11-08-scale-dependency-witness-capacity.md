# IDX-V1-SCALE-001：真实依赖扩大后，输入证明容量使定义不可用

日期：2026-11-08。严重度：P1 功能不可用。状态：**已定位、已最小化，未修复**。这是旧 298d 与当前候选均存在的边界，不是仅新候选出现的索引回归。当前规模轮次已保留失败停止，不能写成完整通过。

## 复现与对照

第三轮串行规模实验完成了 26 个会话记录：21 PASS、4 个带全量功能缺口、1 FAIL。失败发生在真实依赖闭包扩大的 20000 源码夹具：静态 import 图覆盖全部文件，扇出最多 32。相同总数但目标静态闭包只有两个文件的对照已通过。**不能只用“项目文件多”解释。**

失败请求：`textDocument/definition`，ID 2，文件 `Main.ets`，符号 `Counter`，零基位置 `{line:1, character:29}`。返回：

```json
{"code":-32803,"message":"Semantic query requires current workspace inputs"}
```

| 独立运行 | 初始化/准备 | 首次定义 | 结果 | Node/native 采样 RSS 峰值 MiB |
| --- | ---: | ---: | --- | ---: |
| 候选普通轮 | 22371.51 ms | 785.46 ms | FAIL | 1300.98 / 44.34 |
| 固定旧版普通诊断 | 22871.22 ms | 931.61 ms | 同错误 FAIL | 1216.52 / 101.73 |
| 候选独立 profile | 22471.67 ms | 732.92 ms | 同错误 FAIL | 1273.46 / 44.04 |

三行是独立单样本，profile 有额外观测，不能混成多轮中位数或据此推断速度提升。三次均没有资源保护 stopReason，最终正常退出 code 0 / signal null，数据库后检通过。未观察到 OOM、Worker 崩溃或换代；不能把不可用归因于它们。

进一步使用实际最终 server/Native、隔离最小 SDK 夹具做公开 framed LSP 回归，**128 源码正对照 PASS，4608 源码依赖图 FAIL**，两项总计 6.53 秒。失败日志再次记录同一容量原因。因此它不是 20K 项目成员上限，也不需要接近 4 GiB 才发生。实际进入 Program 的成员数在此次失败路径未测，不把静态闭包数量当实测成员数。

## 直接原因与调用链

候选独立 profile 在 `04:27:14.164Z` 输出：

```json
{"event":"references.resident.proof.rejected","stage":"configuration","reason":"configuration-witness-capacity","retainedPaths":4096,"sourcePath":".../lib/deps/n5141.ets"}
```

`retainedPaths` 是 `identities.size + pathIdentities.size`，**不是 4096 个不同源码文件**：同一路径可能有两种事实，还有 SDK、配置和命名空间输入。本轮没有把它进一步拆成去重路径/输入类别计数；`n5141` 也不是实际读取顺序的序号。

下列位置对应隔离候选源快照，完整文件已另存 `dependency-failure-20261108/source-at-failure`，避免后续修改使证据漂移：

| 层/代码位置 | 实际机制 |
| --- | --- |
| `typescript-resolution-witness.ts:14`，`witnessedFileExists` | 编译器真实文件查找交给 load-owned witness；源码查找标记 source namespace。 |
| `loaded-configuration-witness.ts:41,80,126` | `observeSourceNamespace` 进入对应加载观测；两类事实合计达到 `MAX_WITNESS_PATHS=4096` 后 `markUnprovable("witness-capacity")`。 |
| `loaded-configuration-witness.ts:133` | capacity 不属于允许源码恢复的三个原因；将 `sourceResetOnlyFailure`、`namespaceOnlyFailure` 置为保守失败状态，设置 `unprovable`。 |
| `loaded-configuration-witness.ts:260`，`freshness` | 该状态直接返回 undefined，不会以实际当前配置/源码重新取戳将它伪装成有效。 |
| `typescript-query-inputs.ts:20,37` | `loadedConfigurationIsCurrent` 无法获得有效 compiler proof；`assertCurrentQueryInputs` 抛 `SemanticInputUnavailableError`。 |
| `typescript-language-service.ts:724,731` | `define` 的输入终检调用 `assertCurrentInputs`，不能发布未证明当前的定义结果。 |
| `semantic-worker-request-error.ts` | 异常分类为 `workspace-incomplete`；不是 client cancellation 或致命 Worker 错误。 |
| `semantic-request-runner.ts:171` | 公开适配为 `-32803` 与上述 message。 |

`loaded-configuration-witness.ts` 与父提交 298d 逐字节相同，SHA256 `7af6a4b7a7245c54b03f6165059f9e81297e0b04aa8542efc07d7c5a9f55624e`。新旧公开失败对照支持“既存容量边界”，不是仅凭静态代码推断。

容量失败不会因为同输入再校验就消失；丢掉旧事实再给缓存值重盖戳是不合法修复。同样输入重新建 owner 也会重新触限。是否哪些具体编辑/配置事件会换 owner，此次未逐项测量，不以此报告声称重启或重建能解决。

## 普通失败时间线（UTC）

| 时间 | 观察 |
| --- | --- |
| 04:04:10.379 | 一个语义 Worker 启动。 |
| 04:04:22.942 | Native 索引 20000/20000 ready。 |
| 04:04:32.676 | 语义准备 complete，report 为 SDK partial。 |
| 04:04:32.740 | 客户端发送首次定义。 |
| 04:04:32.745–.747 | 父端入队、转发，Worker 开始 dispatch；各已测调度区间不足 1 ms。 |
| 04:04:32.821 | 后台 diagnose 入队。 |
| 04:04:33.524 | diagnose 才转发，等待约 703 ms；它在定义之后，不能反过来归因为后台诊断阻塞首次定义。 |
| 04:04:33.525–.526 | 定义失败完成并返回，公开耗时 785.46 ms。 |
| 04:04:35.644 | 测试正常关闭语言服务。 |

Native 完整索引已在定义前约十秒结束。编译器回调、输入终检及未观测区间尚不能按该总耗时拆出独立占比，不将剩余时间全称作 Program 构建。普通/profile 都存在 SDK 缺声明，但 SDK partial 同样出现在成功小规模和无关文件对照中；不是此次具体拒绝分支的充分解释。

## ADR 审计与修复边界

| ADR | 约束与本次判断 |
| --- | --- |
| [0036](../adr/0036-compiler-source-namespace-recovery.md) 决策3/6 | 明确容量失败不能冒充安全源码恢复，来源事实受 4096 界限约束。当前代码符合既有决定；暴露的是该容量设计对合法大依赖图的适用边界，不应伪称违反 ADR。调整它必须明确修订对应决策，不能偷偷调高常量。 |
| [0037](../adr/0037-navigation-work-and-input-validation.md) B | 项目枚举的 path-count/path-byte capacity 是另一层；不能把它与本次 4096 witness 事实混同，也不能以失败证明认证完整结果。 |
| [0029](../adr/0029-opt-in-rss-memory-budget.md) | 默认 RSS 预算显式启用政策独立；本次无 4 GiB 触发。必要状态与缓存、内存增长与泄漏要区分。 |
| [0039](../adr/0039-validation-directory-observations.md) | 状态是 **Rejected**。不能借本次问题悄悄恢复其跨请求目录内容缓存或弱化文件/符号链接/最终校验。 |
| [0043](../adr/0043-versioned-file-index-maintenance.md) | Native 文件版本、完整资格与语义输入/Program 状态不同；索引 20000 ready 不代表所有前台操作可用，不能用完整索引结果掩盖此失败。 |

最小完整修复方向：区分必须随实际消费图保留的权威加载证据与可限额、可淘汰的优化缓存，明确证明 owner/有效代次/退休边界；容量不足时必须有完整可验证路径，不能清证据、重盖缓存戳、吞错或反复建同样必败的 Program。若改变 0036 的数值界限或证明存储模型，需明确记录取代段落、内存代价及生命周期验证，不能只把 4096 改大。

已在隔离 next 副本建立真实 LSP 最小 RED；尚未实施产品修复、改变阈值或声明问题解决。原 2393 完整回归只覆盖未修改的最终候选，不覆盖未来修复。

## 证据与后续

证据根：`.bench/index-versioned-maintenance-20261104`。

- `final-acceptance-03/scale-runs/dependencies-20000-candidate-0-ordinary-cold`：普通失败全量结果、wire、资源、数据库后检。
- `dependency-failure-20261108/execution.json`：旧版普通/候选 profile 串行对照；编排退出 0 仅表示诊断跑完，两个样本均 FAIL。
- `dependency-failure-20261108/cases/candidate-profile/stderr.raw`：4096 容量实际触发证据。
- `dependency-failure-20261108/minimal-public-red.log`、`minimal-public-red/source-proof-4608`：128 PASS / 4608 FAIL、真实 transcript 与同一容量日志。
- `dependency-failure-20261108/issue-and-evidence.json`：源码/产物身份、稳定问题编号及快照哈希。

后续仍须完成剩余规模样本、持久化保存/重复 watch 的大规模写入计数及原 30K 两小时单会话。现有规模驱动的编辑是未保存 overlay，不能据它声称大规模磁盘更新只写一个文件已验证。保持本轮失败，不剔除后宣称通过；真实 UI、Windows、SDK 及完整引用/重命名缺口分别列出。

## 2026-11-08 complete load-proof repair candidate (IN_PROGRESS)

[ADR0044](../adr/0044-load-owned-input-proof-lifetime.md) explicitly revises ADR0036's healthy-fact quota.
Only the two witness Maps and provenance retention change. Failure details still have their original4096 bound;
actual lost-proof/capacity, SDK mutation, read-window drift and obsolete owner still reject. No final fence is removed.
Real framed LSP128/4608 plus original source/SDK read-window regressions:26/26 PASS.
New lifetime regression RED1/7 PASS,6 FAIL; final8 tests plus manifest4 =12/12 PASS.
Includes9216 mixed-map facts, first/middle/last mutation rejection, complete non-source capsule,
repeat-load stabilization, namespace retirement/reset and obsolete-owner rejection.

The initial repaired20K ordinary run returned correct results for all17 actions and exited0,
but sandbox /bin/ps EPERM broke resource and postflight proof. It remains FAIL:
`dependency-failure-20261108/repaired-20k`. A separate approved-sampling run is recorded under
`repaired-20k-approved`; ordinary cold/warm each17 actions PASS including DB/observed-process closure.
Sampled Node RSS peaks approximately1971/1984MiB include Worker threads once.
Multi-second latency and edit-first-references up to11s remain; availability recovery is not latency completion.
Trace cold/warm and fresh full checkfast for the new source identity remain in progress;
previous2393 PASS applies only to the previous frozen source, not this repair.
No deployment, commit, merge or original user-project/cache mutation.

## Integrated repair validation and environment correction (2026-11-08)

**Incomplete runtime mirror: see IDX-V1-OBS-004 below. The following diagnostic timing/resource table is retained, not full-package acceptance.**

Four independent repaired20K diagnostic sessions completed PASS: ordinary cold/warm and trace cold/warm,
17 exact-result operations each, total68, normal server exit0, sampled owned-process closure and DB integrity PASS.
This is one ordinary sample per cold/warm state, not multi-round median evidence.

| State | Initialization/preparation ms | First definition ms | Edit-first references ms | Repeated edited references ms | Node RSS peak MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| ordinary cold | 26447.31 | 3929.63 | 7914.53 | 2.04 | 1971.41 |
| ordinary warm/new process | 26583.83 | 3562.16 | 7890.68 | 2.45 | 1984.45 |
| trace cold | 26594.89 | 4409.73 | 9012.50 | 2.45 | 1630.16 |
| trace warm/new process | 26475.54 | 4242.23 | 8955.07 | 3.22 | 1679.73 |

Trace is independent instrumentation; its times are not combined into the ordinary distribution.
The baseline first-definition931.61ms returned-32803: it is not a faster correct-result comparison.
Only one semantic Worker start/context creation was observed per repaired session, not a rebuild/recovery fix claim.
The trace diagnostic/completion Program snapshots contain20317 sources:20000 project,256 SDK,61 other.
These snapshots are not first-definition file counts or compiler build counts; `programSequence` is object observation.
SDK remains partial, not READY. RSS includes Worker threads once; sampled isolate heap is separate in the summary.

Actual Native trace: cold maintenance/start once, qualified20000 documents, written20000,361263 logical fact rows;
warm restart maintenance/start once, reused20000, written0, factRowsWritten0, same head1.
There are no maintenance/changes in these sessions because edits are unsaved overlays.
Do not infer persisted-save write scaling, physical IO bytes or exact filesystem calls from these results.
Raw streams, complete qualification and resource records: `dependency-failure-20261108/repaired-20k-approved`;
summary and limitations: `dependency-failure-20261108/repaired-20k-summary.json`.

### IDX-V1-ENV-003: incomplete staging chosen for whole-repository check

N is a partial staging directory. Its attempted full check exposed missing `bin/arkts-language-server`,
Zed configuration and benchmark fixtures (actual ENOENT failures). The earlier freeze guard covered source/test directories
but not those required repository inputs. That was a validation setup omission, not evidence of a product regression.
Its FAIL/interruption and exact owned process tree are retained in `final-checks-approved.json`,
`final-checkfast-approved.log`, and `environment-intervention.json`; ten owned processes were stopped, none remained
at the graceful check, and no unrelated or daily Zed process was targeted.

The five repair inputs were integrated into the complete W checkout that previously passed2393 tests.
One already characterized test trailing blank line was removed before the new freeze; no behavioral assertion changed.
The integration receipt proves exactly those six legacy-input deltas. The new gate freezes2375 tracked/unignored
inputs, including launcher, editor and bench fixtures. New full checkfast is running; no new full PASS yet.
Rust/build inputs and Native409b are unchanged and their previous actual checks are explicitly reused.

Staging/integrated JS hashes differ because the linked node_modules dependency labels are relative to different roots.
Replacing only that label prefix makes server and both worker bytes exactly equal, recorded in
`integrated-runtime-path-label-audit.json`; exact running hashes remain separately recorded, never called identical.
The integrated four-artifact identity and full receipt govern subsequent acceptance, not the staging receipt.
Round04 was correctly stopped by its failed prerequisite and never started load; round05 is separately queued.

The next sequence is new full check, real persisted-save/watch Native1/0 counters at128/2048/20K/30K,
three-trial two-factor scale comparisons, original30K7200s single-session protocol endurance, then byte/reference-density
supplement. Old baseline errors remain FAIL with later operations UNMEASURED, never converted to successes.
500ms remains soft; Node RSS-only guard stays waived, other protections retained. UI/Windows not verified.
No commit/push/deployment or real project/cache deletion occurred. Original unrelated40 files rehashed40/40 unchanged.

## IDX-V1-OBS-004: runtime-mirror completeness audit (2026-11-08)

**Qualification correction:** the four20K repaired diagnostic sessions above used a mirror with only
server/semantic/reference JS plus Native and a node_modules link. They did not copy the70 standard-library files,
diagnostic Worker, launcher/configuration and observation metadata from the built runtime.
Their17 exact Counter/index result checks per session and integrity/normal-close observations remain real;
they are not complete-package product acceptance or a controlled performance comparison to the installed baseline.
The direct N128/4608 public regression used its full built dist and remains valid scoped evidence.
Whether an omitted asset was actually consumed, or contributed to SDK partial/latency, is UNMEASURED;
no causal attribution is inferred merely from absence. All four-session timing/memory data and the failed sandbox run remain.

A test-first complete runtime copier now validates every standard-library manifest entry, required Workers,
regular-file identity, launcher/configuration, gate hash, destination non-overwrite and copied/source identity.
Seven new Python tests pass after retained missing-library/legacy-layout/runtime-metadata REDs.
The built candidate has79 selected runtime assets; historical installed baseline has77, with the same70 library names.
Only candidate-only files are diagnostic-verifier-worker.cjs and compiler-observation metadata.
The baseline installed layout is retained as-is and hashed in full; absence alone does not prove a baseline product defect.
Installer tools and generated test drivers are outside the selected executable-runtime scope.

Waiting round05/density05 were stopped before load (runs=[], no workload children), with exact PID/start/command proof;
full checkfast in complete W was not stopped. `runtime-package-intervention-20261108.json` records this.
Round06 now waits for that same full gate and additionally rechecks legacy source/compiler identities before making
an immutable complete runtime. Candidate79 and baseline77 runtime assets are hashed in every session.
Its15 Python controller/package controls and8 density controls pass; these are driver checks, not scale or endurance results.
Next: persisted-save scaling, full ordinary/trace scale matrix and original30K2h under the corrected deployment.
No new large workload has started, no product source/threshold was changed for this deployment correction.
