# 30K 混合操作三项问题：根因与 ADR 审计

日期：2026-10-27。范围：问题登记、调用链审计、受保护的最小诊断与 proposed ADR；**未修产品、未合并/发布**。
稳定待办见[既有跟进计划](../plans/2026-10-11-query-performance-follow-up-plan.md#2026-10-27-30k-混合操作问题待办)。
原[耐久报告](2026-10-27-30k-mixed-endurance.md)及 `.bench/30k-mixed-soak-20261027/issues.json` 保留原样。
两个7200s目标会话提前失败，验收仍 **FAIL**；局部对照不替代真实 Zed UI 或2h耐久验收。

## 结论及证据强度

| 问题 | 直接触发 | 底层缺口 | 证据与未闭环边界 |
|---|---|---|---|
| SOAK-30K-M001 / P1 | 恢复依赖后删除曾探测的空目录 | Worker resolver 的历史负向路径证明随域保留；源码变更没有重载这个域，旧证明反复否决新查询 | 强：同制品保留/删除目录对照、实际身份不匹配栈、配置重载恢复。未定位引入提交 |
| SOAK-30K-M002 / P1 | 已取消诊断结束同步，但父端尚未收到终态 | watchdog 离开同步 phase 时回退取消参考时间；根级 pending 前台随 Worker 退役失败 | 强：受控有限图两次复现及一次决策观测；三个对照通过。原自然30K事件没有终态 produced/post/取消时刻，不能认定其精确窗口已闭环 |
| SOAK-30K-M003 / P1 | 详情请求排在多份自动诊断之后 | 父端普通队列的有限优先名单不包含 resolveCompletion，虽另一个分类称其 interactive | 强：原请求/准入/派发/修订号/无mutation证据，以及只改前台方法的独立对照；不是详情本身解析5秒 |

三者是**不同的具体缺口**，不能统一成一次“缓存全部失效”或“文件多/OOM”。
M002/M003 共享单个可变编译 owner、父端调度和取消域，因此会相互放大；M001 是另一个证明域的生命周期问题。
下文把已证实机制、原现场推断与拟议修改分开。

## 身份、输入与方法

父提交 `17e923f0cb8c430b6a10793a0f3d2f9097febfec`，分支 `fix/partial-program-lifecycle-20261026`。
实测对象是其上包含最新取消修复的**未提交工作树**，不能称为纯 main。
760项源码/测试/配置指纹在原 `identity.json`、`final-product-identity.json` 和本轮
`.bench/30k-cause-20261027/plan-and-identity.json` 中固定；源码行号指这个工作树。

| 产物 | SHA256 |
|---|---|
| dist/server.cjs | `118d7575dfbb6cbd65ae87037e64a95fee03fad9d69d759cd785684643270b81` |
| dist/semantic-worker.cjs | `6c583128f7b395053deff52a15d133e0f847bb20ae8d148d9a6bba979ec8efe3` |
| config/semantic-runtime.json | `8b3c7a53194fdf67b326d761f40d26c6d4a86ac46f7c9b3344fe2f3b6a6c36d3` |
| native index sidecar | `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016` |

Mac，Node26.3.0、固定 ohos-typescript4.9.5-r10；原30K使用
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24/component6.1.1.125，dialect unverified。
原项目 `/Users/liuhui/Documents/code/applications_photos_30k` 的隔离副本含30000源码（13900 ETS/16100 TS）。
初始化因超过20000成员上限为 degraded；局部查询独立认证，全范围 references/rename 拒绝是另一个已知缺口。

本轮复用 M001 既有30K对照；M002 新增2源码/有限私有SDK图，M003 新增10源码/私有SDK的公开 framed-stdio LSP 对照。
小夹具从 READY 开始，可证机制无需30K或degraded才能触发；**不能代表真实SDK/30K吞吐或UI验收**。
驱动没有改产品文件、原项目、已安装编译器或用户Zed，未保存编辑未触碰。所有新原始证据在
`.bench/30k-cause-20261027/`；`controlled-summary.json` 汇总逐轮，不修改原失败样本。

<a id="m001"></a>
## M001：移回依赖后，为什么仍不能跳转

用户能看到的过程是：移动一个依赖、让编辑器分析过它、再撤销移动并清理空目录。
源码/import已经正确，服务却还在要求一个**历史上存在的目录**保持旧身份。
旧证明失效时拒绝答案合理；缺的是重新加载当前解析域的恢复过程。

### 实际/预期与时间线

目标 `product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，
`SelectParams.defaultParam`，零基70:46；声明位于
`feature/thirdselect/src/main/ets/default/utils/ThirdSelectConstants.ts`。
移动到新建 `utils/soak_moved`，修改import、查询，再恢复原文件/import并删该空目录。

| 原证据 | 公开请求/结果 | 状态 |
|---|---|---|
| normal-2h-v2 第6动作 | #29，03:20:35.998Z→03:20:37.666Z，1668.358ms，v3/inputRevision55 | -32803 `Semantic query requires current workspace inputs` |
| move-minimal-v1，无长前缀 | #4，03:23:38.672Z→03:23:39.855Z，1182.961ms，v3/revision5 | 同错误 |
| move-keep-dir-control-v1，无GC observer | 恢复后#5 140.898ms，后续46.369/41.484ms | 精确定义通过；配置/其他符号也通过 |
| move-remove-dir-no-gc-control-v1，同制品 | 恢复后#5 82.300ms；0/1/3s重试、新版本相同文本、关闭重开及其他文件仍失败 | 配置roundtrip恢复；Worker仅thread1，没有换代 |

原#29对应pid75050/thread1/epoch1，父trace411、内部define63、requiredRevision55；
server.log行598/600/601分别为准入/send/dispatch，父端准入15.621ms，Worker接收至dispatch0.111ms。
本轮复用该证据，没有把无法测得的其余1652ms拆成臆测的Program/证明CPU占比。
两种目录对照不是“保留目录就永远安全”的普遍证明；它们隔离了本次失效条件。
各轮完整 URI/范围、输入编辑和单次响应在原 `requests.ndjson`、`actions.ndjson`、`wire.ndjson.gz`。

### 因果链与责任

1. 文件移动/恢复由 watched-files 与文档事件进入。父端
   [SemanticWorkerProxy.workspaceFilesChanged](../../src/semantic/semantic-worker-proxy.ts):200–213
   **确实会清父端 resolver**，再发送有序 mutation。不能因此认为 Worker 内实例也已清掉。
2. Worker [LegacySemanticEngine.workspaceFilesChanged](../../src/semantic/legacy-semantic-engine.ts):148
   将源码变化交给 [DocumentStore.workspaceFilesChanged](../../src/core/workspace/document-store.ts):404。
   407–408仅 `rootDirty` 调用 Worker `packageResolver.invalidate()`；468起普通源码 delta
   更新磁盘文档、成员/内容及依赖缓存，没有对应解析证明域重载。
3. 分析移动后的依赖时，其非相对import经
   [resolveTypeScriptModule](../../src/core/types/typescript-module-resolution.ts):27–35，进入
   [LocalPackageResolver.resolve/ownerDirectory/readManifest](../../src/core/sdk/local-package-resolver.ts):92/403/430。
   ownerDirectory向上找 `oh-package.json5`；430–438缓存正/负结果。
   [readHarmonyProfile](../../src/project/harmony-profile-reader.ts):37将实际读取交给 witness。
4. [LoadedConfigurationWitness.observe](../../src/project/loaded-configuration-witness.ts):27–51
   保存当时真实的存在/缺失及其已有祖先身份。`utils/soak_moved/oh-package.json5` 从未存在，
   但先前其最近已有祖先为 `soak_moved`（inode204949283）；删目录后变成 `utils`（inode204928208）。
   `lookupIdentity`:199–225重新取得的身份因此不同；**不是文件名大小写或Windows盘符错误**。
5. 证明集合按 resolver 域保留，不随删除import/移回文件自动移除。
   `freshness`:166–194会核验所有当前保留事实；179返回false，没有在该扫描分支自动reset。
   再建一个LS也不必清掉共享的 Worker resolver：
   [TypeEngine.prepare](../../src/core/types/type-engine.ts):198–207只有特定canonical-owner变更触及model失效。
6. 公开定义经 [onDefinition](../../src/lsp/run-language-server.ts):389、
   [workerDocumentRequest](../../src/semantic/semantic-worker-document-request.ts):8、Worker `invoke`、
   `TypeEngine`、[TypeScriptLanguageServiceEngine.define/assertCurrentInputs](../../src/core/types/typescript-language-service.ts):725/280，
   到 [loadedConfigurationIsCurrent/assertCurrentQueryInputs](../../src/core/types/typescript-query-inputs.ts):20–40。
   compiler witness与package resolver/model证明联合检查，旧负向事实拒绝当前查询。
7. [workerRequestErrorCode](../../src/semantic/semantic-worker-request-error.ts):7–13
   映射为 `workspace-incomplete`；[SemanticRequestRunner](../../src/lsp/semantic-request-runner.ts):175–177
   发公开-32803，没有成功Location，也没有OOM/致命退出。配置重载走
   `LocalPackageResolver.invalidate`:207–218，将缓存、model与witness一起清理，后继新加载可恢复。

具体 mismatch 与栈：原 `move-fence-v5/witness-mismatch.ndjson`，以及
`move-diagnostic-v2/input-failure-stacks.ndjson`。这是已观察到的 resolver 证明残留，
不等于所有 compiler/索引缓存都失效。受影响root的多个符号已实测；跨root影响未实测。

<a id="m002"></a>
## M002：后台取消为什么拖累当前跳转

### 原自然现场：能证明到哪里

探索阶段已跳过M001移动场景，仍在第103动作发生本项。原时间均UTC，pid75606/thread1/epoch1：

| 时间/证据 | 事件 |
|---|---|
| 03:49:17.053Z send，17.054Z dispatch | 内部diagnose #1394，AbsDataSource.ts v80，requiredRevision952，trace4172 |
| 03:49:17.134Z起 | 继续关闭ServiceExtAbility.ts等标签；这是#1394之后首个已记录close mutation，足以触发根级失效 |
| 03:49:17.690Z，wire4866/4867 | 重开Picker copy_003，v80；立即公开definition #512，filterMediaType，零基76:15 |
| 03:49:18.453Z，server.log行8131 | 父端 watchdog 判 `cancellation-deadline`；elapsed1399.734ms是**send至检查**，不是已测取消年龄 |
| 同一失败日志 | command epoch1/id1394，phase=idle，Program489/489、checker489/489、sync2205/2205，activity412172 |
| 03:49:18.458Z，wire4872 | #512在768.388ms后-32603，`Request textDocument/definition failed with message: Semantic worker unavailable`，无data |
| 03:49:19.119Z→19.429Z | thread2启动并重放18份overlay，recovery.complete；后续又有epoch2 diagnose |

新摘录 `m002-original-window.json` 保留原文件行号。#512是在父端等待，未取得内部Worker请求ID/派发记录。
没有证据显示它先执行/触发超时，也没有客户端取消#512的消息。
原现场未记录 cancelCell首次变化、terminal产生/投递/父端接收、实际决策参考点；
累计配对计数和idle不能单独证明“编译死循环”或“终态已交付”。原窗口复放与108动作内部观测前缀均未重现，
不将一次自然事件或静态代码当作稳定复现；原驱动停测后也没有真实前台重试恢复证据。

### 编辑器到退役的调用链

1. [document-diagnostics.update](../../src/lsp/document-diagnostics.ts):55–82按每文档debounce，
   用自己的AbortController调用 `semantic.diagnose`，并不经前台 `RequestFreshness` runner。
   较新文本或本文件close在46–52取消它；发布还受83–89文档/版本/任务身份围栏。
2. [run-language-server onDidClose](../../src/lsp/run-language-server.ts):271–277同时撤销前台新鲜度、
   调用proxy.close和本文件diagnostics.close。**别的文件关闭也能使当前诊断contentModified**：
   proxy.close189–197→#mutate479–484→
   [RootSemanticWorkerSupervisor.mutate](../../src/semantic/semantic-worker-supervisor.ts):209–210→
   `#invalidateRequests`:514–529，给活跃诊断cell写contentModified并拒绝旧pending。
   不能把这一链简化为“freshness.cancelWorkspace直接取消所有诊断”。
3. 新前台在mutation后准入。supervisor `#pump`:303–349有active时不send；必须等旧命令终态，
   再应用mutation、获得新revision。这保护单一可变owner及最新overlay，代价是共享等待域。
4. Worker [answerRequest](../../src/semantic/semantic-worker-runtime.ts):248–280在请求cell作用域执行引擎。
   [ADR0023](../adr/0023-completion-cancellation-and-synchronization.md#决定)要求原地getProgram同步安全完成，
   随后旧请求返回取消而非旧成功值。`runWorkerCommand`的finally
   [semantic-worker-progress.ts](../../src/semantic/semantic-worker-progress.ts):24–35将phase设idle；
   这是执行阶段，不等于父端已经处理响应。runtime本来先调用postMessage，再退出run。
5. [watchdog.check](../../src/semantic/semantic-worker-watchdog.ts):75–108由未阻塞的父线程检查cell/阶段。
   86–87记首次观测到的取消时间；89–94只有匹配epoch/id且在同步phase时采纳活动。
   **97–98在phase离开后改回entry.cancelled，丢弃已采纳的activityAt。**
6. [SemanticWorkerHost](../../src/semantic/semantic-worker-host.ts):208–210把判超时交给
   [failureRecovery.workerFailed/recover](../../src/semantic/semantic-worker-failure-recovery.ts):76/101。
   [recycle.recover](../../src/semantic/semantic-worker-recycle.ts):127–153先invalidate，等待旧物理Worker退出、退避，
   再重放最新root/config/SDK/文档。具体是Host.replaceWorker158–174调用各root supervisor.dispose272–300，
   287–296以worker-unavailable拒绝pending；#512因此不可用。不要把它与endpoint致命异常的`#fail`分支混为一谈。
   Host238与supervisor648起仍核验合法终态/epoch/revision；旧响应不能变为新请求答案。

这里“旧Worker”是最初启动的thread1；“新Worker”是监督失败后才建立的thread2。
程序内存/Program/checker不迁移，只重放权威输入。普通degraded、成员上限或后台任务本身不是重启理由；
本次直接退役理由是父端取消截止。没有OOM、无限重建或恢复熔断的实测证据。

### 本轮最小可控实验

公开Content-Length子进程LSP，固定当前产物；初始READY、2项目源码。
私有SDK图含N个真实声明文件，每次实际Host snapshot读取有限延迟40ms；没有伪造同步heartbeat。
打开Main v0让自动诊断进入图；早期Edge0或晚期Edge55时close/reopen同数字v0，立即请求精确定义。
只把旧诊断的postMessage**包原样延迟0或50ms**，不改cell、结果、阈值或产品源码。
这是模拟终态交付调度窗口；不声称原30K存在人为50ms延迟。每case20s保护、最多一次恢复，串行执行。

| case目录 | N / 取消 / 终态延迟 | 前台定义 | Worker启动/新请求恢复 |
|---|---|---|---|
| m002-long-zero-v3 | 60 / 早 / 0ms | 精确通过6143ms | 1 / 无需恢复 |
| m002-long-delay50-a | 60 / 早 / 50ms | -32603，3036ms | 2 / 新请求精确通过 |
| m002-short-delay50 | 3 / 早 / 50ms | 精确通过468ms | 1 / 无需恢复 |
| m002-long-delay50-late | 60 / 晚 / 50ms | 精确通过3448ms | 1 / 无需恢复 |
| m002-long-delay50-b | 60 / 早 / 50ms | -32603，2986ms | 2 / 新请求精确通过 |
| m002-decision-observation | 60 / 早 / 50ms，额外只读决策观测 | -32603，3001ms | 2 / 新请求精确通过 |

例a：terminal-produced在05:48:03.336Z，父端判失败03.356Z，原包实际post03.386Z。
同步Program/checker均2/2，phaseidle。决策观测轮记录同一父端时钟：

```text
now=3967.363766ms; cancelled=989.363422; activityAt=3941.247
committing=false; cancelledSince=989.363422
取消年龄2978.000344ms；最近实际活动年龄26.116766ms；取消阈值1000ms
epoch1 / diagnose2 / phaseidle / Program2:2 / checker2:2 / sync2:2
```

因此**计时参考点回退确实能杀掉刚完成有限工作的Worker**，并非静态猜测。
三个时序对照隔离了“早取消+长同步+短交付间隙”；不意味着任何长图或任何取消都失败。
三次失败后独立新请求均精确恢复；不是自动重放旧请求。8个有效case公开响应均无重复ID，全部正常shutdown/进程exit0。
这轮未采资源峰值、未做Registry余额审计；不能用这些结果证明泄漏或全面资源正确。

`decision.ndjson`是实际决策快照，区别于产品logger105再次读取的快照。
探针记录每个执行Worker的原始/变换SHA；决策轮主包只在内存增只读记录，
执行SHA `7fc53d3f72937ae8f68bd2ad00eb10bab8035d09c789150b733335ba941b5473`，原磁盘SHA未变。
前两次复现没有该主线程观测，避免把观测轮独自当反例。

<a id="m003"></a>
## M003：补全详情的5.3秒实际等在哪里

原探索action14，公开#70 `completionItem/resolve`，AlbumSetPageActionBar.ets v35/inputRevision197，
服务端签发的 `createHorizontalActionBar`，textEdit零基57:32–57；epoch1/thread1/pid75606。
03:42:21.066Z发出，26.395Z收到正确详情；不是过期句柄错误。

| 区间 | 实测 | 口径 |
|---|---|---|
| 客户端槽位等待 | 0.001813ms | 没有用请求并发槽堵住5秒 |
| 完整公开往返 | 5328.783ms | 含父端准入/排队、执行、传输 |
| 父端trace1282准入→send返回 | 5266.325ms，完整往返98.8279% | 同一父线程时钟，尚未发给Worker |
| 其余全部阶段 | 至多62.458ms | 上一行从完整往返相减；不是独立精准CPU段 |
| Worker221接收→dispatch | 0.193849ms | Worker内部时钟；包含在其余阶段，不能再相加 |
| 查询认证 | 0.028401ms | 嵌套阶段，不能再相加或当详情全部执行 |

新 `m003-original-audit.json` 按原日志行1865–1886、wire1225–1256复核：
212已在03:42:21.034Z发出；213–220在详情之后依次派发，全部requiredAppliedRevision187；
221直到26.333Z才send。没有中途client mutation或新的前台请求。
next didChange wire1257虽与response1256同一墙钟毫秒，却在响应之后；必须按wire序列/单调时钟分开。

下列父端区间互不重叠，共5266.325ms；它们包含诊断执行、消息交付和父端handoff，**不是已测编译器独占时间**。

| 活跃诊断→下一send | 详情已入队后的区间ms |
|---|---:|
| 212 MainAbility→213 | 1122.386 |
| 213 ThirdSelectPhotoGridBase→214 | 1147.433 |
| 214 SmartPickerPhotosDataImpl→215 | 191.607 |
| 215 TimelinePage→216 | 1253.414 |
| 216 AlbumGridItemNewStyle→217 | 189.132 |
| 217 AlbumDataImpl→218 | 65.596 |
| 218 ServiceExtAbility→219 | 159.080 |
| 219 CropShow→220 | 1033.487 |
| 220 AlbumSetPage→221详情 | 104.190 |

### 调度来源与独立对照

入口 [register-completion.onCompletionResolve](../../src/lsp/register-completion.ts):60–95核验句柄/文档后，
73交runner、84交proxy.resolveCompletion234–259；workerDocumentRequest8→
[WorkerProjectPreparation.request](../../src/semantic/worker-project-preparation.ts):58–65等待初始化/恢复后，
经recycle.request45进入supervisor。原trace已到supervisor，排除前面初始化/恢复admission作为5266ms主体。

**实际等待容器是父线程 `RootSemanticWorkerSupervisor.#pendingRequests`（110/266）**。
`#pump`304先等active结束，305优先mutation，307才调用
[takeNextSemanticWorkerRequest](../../src/semantic/semantic-request-lanes.ts):25。
3–17的INTERACTIVE_METHODS含resolveCompletion，但用于detached-reference分支以及识别可跨越的读取；
普通连续diagnose分支55–56只准define/hover/complete绕过，详情落到60的FIFO。
Worker本身的runtime95–101也串行，但本例详情尚未send；不能说它已经在Worker内排了五秒。
没有global请求、无需suspendDiagnostics barrier来解释这段等待。

受控10文件、八诊断A–H、A有限hold1800ms（现有default-off测试hook，可合作），
先获取真实issued completion item，等八任务都准入后只发一个前台请求，期间不发mutation：

| case | 前台完整/父端准入ms | 在A之后实际派发顺序 | 最终正确性 |
|---|---|---|---|
| m003-resolve-queue | 1917 / 1853.315 | B,C,D,E,F,G,H,resolve12 | 详情正确，8份最新v1诊断含2322 |
| m003-list-queue-control | 1862 / 1803.816 | complete5,B,C,D,E,F,G,H | 补全含neverQueried，同8份诊断 |

两组所有后续命令revision9不变、Worker仅1、无取消/恢复；接收→dispatch均亚毫秒。
这证明父端选择策略不同，**不是在此小夹具重现5.3s自然时延**。已运行的A两者均不能抢占。
30K诊断执行成本更高会放大积压；原各诊断内部解析/证明/编译细分未测，不据此指定其CPU热点。

## 是否共同根因

| 假设 | 证据/反证 | 判定 |
|---|---|---|
| 一次全局缓存失效导致三项 | M001无退役/队列压力仍失败；M002在READY两文件无移动；M003同输入无mutation/取消仍发生调度差异 | 不支持同一缓存根因 |
| 证明生命周期缺口 | M001历史解析事实未随域重载；M002的activityAt是另一种命令生命周期状态 | 两个具体缺口，不能用“生命周期”一词代替因果证明 |
| 前后台共享owner/取消域 | M002关闭别文件触发active诊断取消，pending前台受退役牵连；M003等后台串行执行 | 共享机制与故障放大器已证；触发分支不同 |
| 30K/degraded是必要原因 | 小READY夹具分别触发M002/M003；M003在action14早于M002 action103；排除M001仍有M002 | 不是必要条件。大依赖闭包/多标签积压延长窗口，尚无新规模复杂度结论 |
| 同一OOM或编译器挂起 | M001仅输入证明错误；M002有限图正常返回且恢复；M003成功详情 | 没有支持证据；本轮不归因OOM/泄漏/真实无限循环 |

## ADR逐项映射与设计缺口

已审计[ADR索引](../adr/README.md)及相关正文；下表的“拟补”均为新草案，不是既有决策。

| 问题 | 既有ADR与具体段落 | 原约束/代码关系 | 需要补充 |
|---|---|---|---|
| M001 | [0005 Index proof and fallback boundary](../adr/0005-index-proof-trust-boundary.md#captured-open-source-presence-checkpoint-2026-09-28)，§Captured open-source presence/§Decision；[0019 稳定语义组、长期Program与请求输入复用](../adr/0019-stable-programs-and-request-inputs.md#决定)决定5/7、§合并前跨平台恢复约束 | 身份/负证据拒绝旧答案正确；0019明确祖先namespace ABA未覆盖。源码delta恢复owner与解析证明owner不对齐；是恢复设计缺口，不能删终检 | [Proposed0025](../adr/0025-namespace-proof-domain-recovery.md)缓存和证明一起废弃/重载，有界同会话恢复 |
| M001旁证 | [0017 Reuse verifier library inputs, SDK lookups and classified reference searches](../adr/0017-reference-shared-inputs-and-search.md#decision)决定2 | 实际load-owned正负证明、变化撤销reuse；限定verifier/SDK，不能冒充项目resolver现有恢复规范 | 只借鉴所有权规则，范围扩展明确写0025 |
| M002 | [0020 失败语义构建的恢复与资源所有权](../adr/0020-failed-semantic-build-recovery.md#决定)决定4/5及2026-10-24监督修订；[0023 补全取消与Program同步的完成边界](../adr/0023-completion-cancellation-and-synchronization.md#决定)决定1–4/6 | 单终态、健康同步不因普通取消销毁，硬截止/共享预算保留。下层同步已正确完成，上层仍可能误退役，端到端保障未成立；没有本轮租约泄漏证据 | 保留物理监督/预算，不靠延时或吞错修补 |
| M002核心 | [0024 partial初始化范围与同步取消活动见证](../adr/0024-partial-initialization-and-progressing-synchronization.md#决定)决定3/4及§必须验证 | 更新活动仅限匹配同步phase合理；没有明确phase退出至父端结清的参考点合同，实现发生回退 | [Proposed0026](../adr/0026-cancellation-grace-terminal-handoff.md)参考点单调、只限定活动采纳条件，绝对截止不延长 |
| M003 | [0006 Interactive/global semantic scheduling](../adr/0006-semantic-request-scheduling.md#queued-automatic-diagnostics-and-interactive-navigation-2026-10-06)同名段；[0023](../adr/0023-completion-cancellation-and-synchronization.md#决定)决定5 | 明确只给define/hover/complete有限绕过；当前代码符合旧名单，未覆盖详情。INTERACTIVE标签不代表统一优先级 | [Proposed0027](../adr/0027-completion-details-diagnostic-priority.md)仅补已证明的连续诊断详情绕过，保留公平性/屏障 |
| M003边界 | [0022 Completion details outlive their compiler context](../adr/0022-completion-resolution-lifecycle.md#decision)Decision/Boundaries；[0007 首次语义准备与就绪后500ms目标/550ms验收](../adr/0007-semantic-readiness-and-500ms-slo.md#decision) | 0022保护issued item生命周期/防伪，明确不改调度/性能；本次正确详情也可能很慢。0007要求完整计时含排队；当前用户按500ms观察，保留历史550ms口径 | 不能用原item fallback或扣掉排队伪装性能达标 |
| 三项共同边界 | [0019](../adr/0019-stable-programs-and-request-inputs.md#决定)决定2/3；[0004 Exact reference result cache validity](../adr/0004-reference-result-cache-validity.md#decision)Decision | 稳定组/长期LS仍需串行可变owner；0004管完整引用答案缓存，不是这些局部证明/详情队列；暂停TODO不恢复 | 不另造并行编译权威，不清空Registry，不改引用缓存新鲜度合同 |
| 状态/发布边界 | [0009 语义generation、身份与原子发布](../adr/0009-semantic-generation-and-publication.md#proposed-decision)§Proposed decision/§Gate and failure policy；[0014 预算约束下的长驻ArkTS Language Service](../adr/0014-budgeted-long-lived-semantic-session.md)§Decision/ownership | 0009是被S02前提阻挡的事实发布提案，并非当前全部状态机已实现；0014沿用官方LS/owner、lease和输入证明。Worker epoch、Program版本、能力READY和索引generation是不同状态 | 本轮无事实数据库损坏/原子发布失败证据；只在具体owner与命令终态边界修复，不重启事实/索引路线 |

[0010 增量失效与overlay](../adr/0010-incremental-invalidation-and-overlays.md)和
[0013 证据与发布门槛](../adr/0013-evidence-and-release-gates.md)均仍是Proposed，不假称Accepted。
0010为overlay/未知变更提供背景，不能给目录重载自动授权；0013区分局部证据与产品验收，原FAIL保留。
ADR0021的SDK输入质量分层不解释这些分支，根degraded也不能掩盖局部功能故障。

索引含历史“not merged/2039/2050”等收据：0020–0023正文至少已存在于HEAD（最近对应提交8def69d），
但工作树又含未提交修订；0024尚未跟踪。**文件存在不代表当前修订或产品验收已合并**。
README新增本次审计说明/Proposed行，保留旧正文与收据，不改写成最新已接受方案。

## 最小修复方向、优先级与回归边界（未实施）

1. P1 M001：使Worker内namespace变化撤销解析缓存与其证明的同一owner；实际重载后再认证。
   当前旧请求继续fail closed，后继显式查询可有界恢复；不以父resolver清理代替Worker处理。
   测移入/移回/删目录、保留目录、同目录rename、负候选后来创建、未通知变化、symlink/别名及配置；普通body编辑不能全域重建。
2. P1 M002：使尚未结清命令已采纳的取消参考点单调，phase退出不倒退；只有匹配真实同步活动能更新。
   保留无活动退役、绝对截止、共享恢复预算和单终态。测0/50ms交付、早/晚取消、长/短图、真实抛错、同步不返回、假活动、旧世代终态和关闭/恢复并发。
3. P1 M003：将有效详情加入普通连续诊断的有限绕过；不扩大所有interactive、不开第二Worker。
   测在途不可抢占、其余队列优先、队首最多一次绕过、全诊断最新版本发布、mutation/global屏障、过期/伪造句柄和连续详情公平性。

三项各自公开RED→最小实现→相关回归、独立提交/回滚，避免一个大“状态机重写”掩盖因果。
收益预期：M001去除永久错误并减少无效重试，非保证更小正常查询成本；M002去除已证窗口的误退役/冷重建；
M003可免除排队诊断的等待，但已在途重同步仍可能超过500ms。没有实现后数据，不给虚构百分比收益。
下一轮实现完成再跑最终相关检查与完整fast，并重做真实30K混合长测；不得拿本轮八个小case当毕业。

## 复现、探针校验与证据完整性

从仓库根执行；tag必须新建，先核对上方SHA。M001命令仅操作既有隔离副本：

```sh
SOAK_NO_GC_OBSERVER=1 SOAK_KEEP_MOVE_DIR=1 node .bench/30k-mixed-soak-20261027/move-repro.mjs move-review-keep
SOAK_NO_GC_OBSERVER=1 node .bench/30k-mixed-soak-20261027/move-repro.mjs move-review-remove
node --test .bench/30k-cause-20261027/probe-contract.test.mjs
node .bench/30k-cause-20261027/commit-terminal-case.mjs m002-review-zero 60 0 early
node .bench/30k-cause-20261027/commit-terminal-case.mjs m002-review-long 60 50 early
node .bench/30k-cause-20261027/commit-terminal-case.mjs m002-review-short 3 50 early
node .bench/30k-cause-20261027/commit-terminal-case.mjs m002-review-late 60 50 late
CAUSE_DECISION_TRACE=1 node .bench/30k-cause-20261027/commit-terminal-case.mjs m002-review-decision 60 50 early
node .bench/30k-cause-20261027/queue-case.mjs m003-review-resolve resolve
node .bench/30k-cause-20261027/queue-case.mjs m003-review-list complete
```

新证据每case含driver.ndjson、原始stdout.frames、stderr.raw、server.log、result.json、ownership.json；
M002另含实际读取/终态/变换SHA的probe文件，M003含父端/Worker内部收发headers。
失败公开请求仍保存为失败，当前M002驱动RED退出1；早期驱动以JSON状态为准，不因其退出0抹去失败。

探针首轮错误使用MessagePort不支持的prependListener，造成构建外初始化异常；
`m002-long-no-delay`无效，不能算产品M002。真实Worker自测先RED（probe-red.log），改用官方支持的on后GREEN（probe-green.log），
之后才取得六个有效M002结果。另 `m002-long-zero-v2` 因驱动读取尚未创建日志ENOENT无有效结果，已保留；不计产品失败。
一次队列实验启动的自动审批超时没有创建进程，随后相同有限实验成功执行，不计产品行为。
原始M003摘录按墙钟毫秒选边界会纳入响应后的didChange，已按wire序列校正并在audit文件留下注记。

Context7 resolver本轮传输失败，不能声称已取得该服务文档；探针API核对以
[Node26.3官方Worker/MessagePort文档](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html)为回退。
on-message、postMessage、exit分别是接收/交付/生命周期边界，不保证与父端watchdog定时器的业务结清顺序；
库文档不是原自然竞态根因的替代证据。

`final-product-identity.json`确认760项输入与四项产物前后全同；`verification.json`记录脚本/文档检查。
`process-audit.json`确认8个有效case及首轮探针错误的已知driver/server PID均不在运行，未终止用户进程。
启动日志ENOENT的无效case遗留的私有输入夹具仍保留，未把它当Program/Worker常驻；它没有有效测试结果。
原 `.bench/30k-mixed-soak-20261027` 文件未改写，新增证据有独立清单和封存包。
本轮仅探针自测/脚本语法、数据断言、文档链接及身份/关闭审计；未重新运行产品完整fast，
此前2052/2052仅是候选历史回归收据，不能宣称本次全量或2h通过。
455冷目录3秒门槛继续按用户授权排除，OP-04无关缓存TODO暂缓。
未新增真实UI点击；辅助功能权限缺口保持原记录。原自然M002终态窗口、真实SDK下新修复收益、
长期资源斜率/Registry余额、完整30K全范围能力及2h混合稳定性均未闭环。
