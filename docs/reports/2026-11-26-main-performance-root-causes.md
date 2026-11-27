# 当前 main 遗留性能问题：只读复测与调用链定位

日期：2026-11-26。固定提交 `cc92b50370c0a2471f8315bab2119e59996fd2cb`。
状态：完成本轮定位，性能事项仍 OPEN；未修改产品代码、提交、合并、部署或重启用户进程。
父事项：NAV-REPEAT-001、NAV-HOT-DIGEST-001、IDX-V1-INIT-001 的性能侧。

## 结论

目前最明确的三块成本分别是：

1. **初始化完整源码分类/依赖图准备**。本轮真实 Photos 隔离副本的语义组件无插桩91.40s；
   独立插桩91.93s中，源码事实整理50.97s、依赖图维护27.40s，合计85.25%。
   SDK/编译器准备6.38s，6.94%，不能将整个初始化都归为SDK解析或Native索引。
2. **热查询仍负担全成员输入证明**。当前main只读组件3档×3个Store，热态零源码open，
   但每次分别4158/40062/60062次lstat，对应2048/20000/30000成员，中位67.85/646.48/935.42ms。
   结果/内容摘要复用存在；它们没有取消成员有效性遍历。
3. **引用缓存失效后的项目验证重建与前后证明**。历史W7 Photos编辑后4.80s中，验证器1.51s（31.54%），
   其外3.29s（68.46%）；验证器已经复用物理Worker，但仍创建项目Program。
   不能把全部4.80s说成符号搜索，或以“已增量更新”推定所有调用路径都增量。

本轮前两项是**当前main组件实测**；第三项和W7完整LSP数据是**历史协议证据**，不是新main的整链路复测。
不能将不同时间、输入和插桩条件下的毫秒数拼成同一个请求，或据此认定合并造成回退。

## 输入、身份、实验边界

- 主目录已在main；开始时工作区干净。没有切回旧开发分支，未使用不明来源的dist做性能候选。
- Node20.19.5；脚本在内存中从当前源码bundle，记录全部构建输入SHA、编译器身份及生成字节SHA。
  语义实验使用生产compiler observation transform，`writeMetadata:false`，未改写生产dist或编译器。
- 初始化用既有隔离目录：
  `.bench/index-versioned-maintenance-20261104/final-acceptance-36/harness/project`。
  29995个语义源码成员；原始30K源清单与语义成员口径不同，沿用原证据，不称Program有30K文件。
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，实际选API24/6.1.1.125，项目要求API20；
  两次报告均partial，未伪造ready。组件runtimeStats.projectFiles=29995是Store计数，**不是实际Program文件数**。
  本轮未独立计量初始化Program/SDK SourceFile个数。
- 初始化两独立进程串行：instrumented、control。相同bundle/全部源输入、相同源码名称SHA和完整disk SHA；
  每进程resolutionIdentity本就不同，不能跨owner交换证明。配置/SDK/输入proof合同未改变。
- 当前实验均**不是LSP、真实Zed UI、Windows、正式耐久或完整Native索引验收**。
  没有Native写者，只有只读的真实语义准备/输入证明；排队、LSP调度和索引并行干扰不在此组件里。
- 500ms仍是体验目标；未新增验收硬线、修改产品RSS/V8/截止时间，未清理真实缓存。

## 一、初始化：此前未细分的约76秒属于什么

历史W7 overlay147中，首个`semantic.prepare.complete`后到第二次prepare开始有约78s空白，
该区间混合了SDK同步、源码事实与图构建。当时日志没有内部计时，不能全归给SDK或Program。

本轮直接运行生产`OhosTypeScriptSemanticEngine.semanticReadiness({prepare:true})`，
通过原型方法诊断包装记录同步调用的包含时间与扣除已包装子调用后的self时间。
self只是这个诊断树中未细分的墙钟区间，**不是纯JS独占CPU**；仍可包含文件IO、未包装函数和GC。

| 条件 | 语义准备ms | 随后的热态完整输入证明ms | 次数 |
| --- | ---: | ---: | ---: |
| 插桩 | 91926.28 | 919.44 | 各1 |
| 无方法包装对照 | 91396.30 | 896.76 | 各1 |

两次时长差0.58%；只有一次串行对照，不能将该差全部视为插桩开销，也不形成生产p95或中位数。
它们均正常结束，leaseCount=0；不能用RSS不下降判泄漏。
1s采样Node RSS峰值分别1418.52/1463.23MiB，线程共享进程RSS仅计一次；无Native进程。
不是连续heap峰值、PSS或长期内存稳定证明。

插桩初始化的**互不重叠**分区如下，合计91926.28ms：

| 分区 | ms | 占比 | 解释与未测部分 |
| --- | ---: | ---: | --- |
| SourceRolePool.acquire | 29496.31 | 32.09% | 29995次；内容摘要键生成、分类值复用/首次语法分类；这些内部尚未分别计时，不能把29.50s全称解析CPU |
| ProjectOperationScopes.updateFacts其余部分 | 21475.37 | 23.36% | 从50.97s包含时间中扣除上一行；包括原始输入读取/来源证明、facts维护等，尚未进一步排他归因 |
| ScopeDependencyGraph.update | 27395.07 | 29.80% | 完整roles、模块绑定/依赖与SDK/全局节点维护；边数、负查找数及各自CPU未测 |
| measureCompilerReadiness | 6382.95 | 6.94% | SDK域编译器准备；不是全部初始化Program次数或全部SDK读取耗时 |
| DocumentStore.prepareRoot | 4154.80 | 4.52% | 根成员准备与初始文档预载；不代表初始化所有文件访问都在这里 |
| 其余未细分 | 3021.78 | 3.29% | 其余准备/最终核验及未包装开销 |

`updateFacts`包含时间50971.68ms是前两行之和，**不可再加一次**。
`ProjectOperationScopes.ensure`78692.42ms、`prepareInitialGroups`85974.75ms是更外层包含区间，同样不可叠加。

实际代码链：

1. `src/semantic/legacy-semantic-engine.ts:115`：进入根的ProjectReadinessLifecycle。
2. `src/semantic/project-readiness.ts:24`：prepareRoot、prepareInitialGroups、最终readiness报告。
3. `src/core/types/initial-semantic-contexts.ts:9`：SDK原始owner准备；SDK不完整时仍构建保守的全项目操作范围facts，报告partial。
4. `src/core/types/semantic-groups.ts:33`：preparePartialWorkspace调用ProjectOperationScopes.create。
5. `src/core/types/project-operation-scopes.ts:120,209`：ensure/updateFacts遍历membership.paths，读取输入、更新role与来源证明。
6. `src/core/types/source-role-pool.ts:12`：已经存在按文件模式+内容SHA的分类值池，不能再提议“首次加一个缓存”冒充新方案。
7. `src/core/types/scope-dependency-graph.ts:63`：update以全部roles及SDK/global根构建队列，维护解析边、绑定和当前输入证据。

因此初始化成本与**需要分类的成员/内容、不同语法内容、依赖结构、绑定证明**有关，不仅是实际交互Program闭包。
本轮固定真实拓扑一次，未形成初始化复杂度阶数证据；不得断言整个初始化O(N²)。

## 二、热查询：没重新读内容，为何还有近一秒

当前源码的输入证明只读实验复用既有生成夹具，规模2048/20000/30000；
每档3个新Store，每Store先prepare、首次namespace、3次热namespace、再次prepare及namespace核对。
源目录和内容不编辑；每次返回的名称/完整内容SHA与本Store首份证据相同。
夹具原有计划是固定依赖闭包16，但本实验不建Program，**不把计划16当成本轮观测Program个数**。

| 成员N | 热样本 | 中位/最大ms | 每次lstat | 每次openSync | 每次native realpath |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2048 | 9 | 67.85 / 77.18 | 4158 | 0 | 61 |
| 20000 | 9 | 646.48 / 713.07 | 40062 | 0 | 61 |
| 30000 | 9 | 935.42 / 952.93 | 60062 | 0 | 61 |

这是组件墙钟与FS调用计数；没有独立纯系统调用耗时分区，不能说935ms全部花在内核lstat。
枚举比较、Map/Set/字符串/Buffer/摘要拼接与回调也包含在总时长里。
FS调用数明确是本夹具`2N+62`，与代码两次全叶子检查一致；三档结果支持该路径有随N增长的工作，
不证明所有LSP操作同一种复杂度。native realpath固定61，不能沿用旧18万次realpath解释当前热路径。

原始首次namespace尚未完成全输入digest预种植，因此需要打开N份输入；该组件阶段不等价于完整初始化之后的首个LSP查询。
再次prepareRoot独立中位54.49/261.62/354.45ms也不能与上表相加冒充同一请求；生产同阶段可以复用部分观察。
当前真实Photos热readiness组件实际896.76/919.44ms，正是同类路径；不是再次SDK解析。

代码链：

- `src/semantic/references/reference-cache-admission.ts:11`：缓存有结果后，仍readDiskAdmission取得当前证明；
  `:41`经readiness(prepare:false,captureSourceInputs:true)进入Worker。
- `src/semantic/project-readiness.ts:24`及`src/semantic/project-source-namespace.ts:16`：根准备、强成员证明、每成员digest组合、结束时成员对账。
- `src/project/source-content-digests.ts:29`：派生digest确实复用；当前身份不符才回原始读取。
- `src/core/workspace/complete-membership-proof.ts:97`：成员证明current内逐叶子lstat，验证文件身份和目录边界。
- `src/project/request-input-validation.ts:381`：独立final union清空阶段身份观察，再执行生产者义务，形成另一轮当前叶子检查。

正确性目的分别是发现未通知的改动/新增删除、路径替换与符号链接、证明查询全过程没有输入变化。
ADR0047/0048首版**明确保留全命名空间、根级失效和独立最终核验**，并未承诺缓存命中O(1)。
本轮证实的是剩余工作，不是证明历史摘要优化被删除。

## 三、首次与编辑后引用：复用Worker仍构建项目Program

这里复用W7 `photos-overlay147-r1`原始逐请求/服务日志，**不是本轮main LSP测量**。
串行请求以sentEpochMs、probe start、probe duration、响应完成分为不重叠外部区间；端点毫秒取整，存在约1ms误差。

| 历史场景 | 总ms | probe前ms/占比 | verifier ms/占比 | probe后ms/占比 |
| --- | ---: | ---: | ---: | ---: |
| 打开后首次 | 8069.84 | 2695 / 33.40% | 4264.04 / 52.84% | 1110.80 / 13.76% |
| 编辑后首次 | 4800.95 | 2213 / 46.10% | 1514.08 / 31.54% | 1073.87 / 22.37% |
| 撤销后首次 | 4837.44 | 2177 / 45.00% | 1658.76 / 34.29% | 1001.67 / 20.71% |
| 保存后 | 4702.63 | 2168 / 46.10% | 1479.24 / 31.46% | 1055.39 / 22.44% |
| 关闭后磁盘查询 | 4824.94 | 2205 / 45.70% | 1618.82 / 33.55% | 1001.11 / 20.75% |
| 重开后 | 4623.80 | 2195 / 47.47% | 1434.19 / 31.02% | 994.61 / 21.51% |

查询同一picker文件extensionWindow，零基43:9；编辑新增`void extensionWindow;`使位置数3→4，撤销回3。
两次实际结果缓存命中分别1113.42/1026.58ms，没有新的probe；不能再说结果缓存“没启用”。
原文件、完整编辑和通知顺序见overlay147/actions.ndjson及历史报告。

首次verifier内getProgram3343.37ms，query27.35ms；编辑后verifier内getProgram1082.90ms，query11.49ms。
这些是**嵌套**区间，不能与整verifier再次相加；query还含锚点核验，不是纯符号搜索CPU。
实际旧Program为87项目+282SDK+113其他=482，不能把30K目录计数混作编译器解析30K。
首个物理verifier Worker冷；后5次workerReused=true，但每次仍有createProgram事件。

`reference-verifier-worker-runtime.ts:49`每job新建resolver/LS，`:75`prepare/measureCompilerReadiness，
`:137`dispose后才发布。ADR0016保留SDK语法/物理Worker，却明确逐job释放项目LS/Program。
初始语义Worker和另一个verifier Worker也不是同一个JS堆，前者预热不自动让后者持有已暖Program。
`projectSourceFilesReused`等同次前后统计不能单独证明跨job项目AST复用。

外部区间还包含输入admission、准备/锚点/候选、最终核验、父线程及传输；尚没有该W7样本内部排他CPU分区。
不得将probe前全部称队列等待，或将probe后全部称SQLite/磁盘IO。重命名/全局引用缺口仍另列功能事项。

## 历史修复审计与优先级

W7 source-freeze134的1068份输入与main对照：1051相同、17不同，清单在w7-to-main-source-audit.json。
关键source-digest/namespace/role-pool/依赖图代码保留；PR119还改过membership/type-engine/verifier等，
因此历史协议时延不能直接盖章为最新main时延。旧8.46s和当前近1s证明也不是同一个接口/阶段。

推荐按以下依赖顺序推进，**本轮只定位，尚未实施**：

1. **输入证明路径优先**：它影响重复/首次/编辑后的共同底座。先分开观测成员遍历、派生Map构造、配置见证和final义务，
   合并同阶段同producer重复观察/派生计算；保留独立最终检查。不能直接删第二轮检查或以watcher当磁盘权威。
   跨请求有效性/范围合同若要调整，需要明确修订ADR0037/0044/0045/0047/0048及等价回归；不能宣称现有合同保证常数时间。
2. **初始化facts/图准备**：继续细分51s原始读/内容hash/池命中/实际parse、27s解析边/负查找/配置验证；
   验证已有SourceRolePool的实际命中，再决定可复用派生facts/解析观察及必要失效域。不可机械再加缓存或跳过未知文件来伪造ready。
3. **项目verifier生命周期**：共同证明成本下降后，评估局部项目Program是否可长期保留、逐job显式上下文切换与增量更新；
   ADR0018/0019已明确修订ADR0016、授权合法驻留组保留LS/Program；应先完成这条未迁移路线的消费者迁移，
   并保持ADR0049取消/终态/租约约束，不能只缓存对象绕过生命周期。新的覆盖证明/新鲜度范围仍须单独记录实质变化。
4. **前台真实体验与长尾**：完成磁盘安全余量后，用当前冻结main做完整LSP/实际Zed重测，覆盖WUI003突发请求、后台诊断混合；
   客户端补丁是否真实部署仍须独立确认。500ms只作分布/频率观察目标，不制造硬门槛。

本轮没有测量这些方案的收益，不承诺500ms或消除全部文件数相关性。

## 限制、资源与证据

开始时磁盘约1.4GiB，结束前只剩约353MiB；本轮目录约数MiB，未启Native写者，
磁盘总余量变化的外部来源未定位，不能归给某个进程或索引任务。
因此未新建30K索引/运行完整LSP负载，没有清理缓存或停止用户Zed/现存语言服务；
只读组件观察不替代原定完整协议/UI/耐久条件。低磁盘状态、OS页缓存未控制也限制跨日期耗时比较。

证据根 `.bench/performance-diagnosis-main-20261126/`：

- `input-proof-probe.mjs`、`input-proof-result.json`、日志：9Store/63阶段值、每次FS计数和当前构建输入SHA。
- `semantic-init-probe.mjs`、controller、instrumented/control.json及events/resources：各一次实际语义准备、状态/资源/方法包含与self时间。
- `summary.json`、`summarize.py`：已验证不重叠分区、跨进程实际名称/内容一致、真实旧请求边界、零open和2N+62断言。
- `summarize-initial.py`/summary-driver-correction.md：初次分析错误比较随机owner身份；修正为同内容/不同owner的精确对照，未放宽产品断言。
- `w7-to-main-source-audit.json`：历史与当前源码差异，不能把旧运行改标为main。

命令（保留原结果，复跑须换全新输出目录并相应调整脚本；固定SDK/夹具路径见配置）：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node .bench/performance-diagnosis-main-20261126/input-proof-probe.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node .bench/performance-diagnosis-main-20261126/semantic-init-probe.mjs
python3 .bench/performance-diagnosis-main-20261126/summarize.py
```

无产品更改，未运行新check:fast或完整release gate；不覆盖main现有CI-GC-001失败记录。
正式LSP最新时延/队列尾部、Windows UI、完整30K引用/重命名、长期资源趋势及初始化内部边数/读次数仍未测闭环。

## 补充：编辑后引用的详细原因与官方成熟机制（同日调研）

Context7先执行TypeScript/rust-analyzer的resolve-library-id，两次均HTTP transport失败；随后检索官方设计/源码，
原始固定源码与SHA封存在证据目录research/official-source-provenance.json。没有因此安装库、改产品或重跑负载。

### 原始编辑样本的因果链

W7 overlay147公开request3，2026-11-22T23:28:42.671Z发出、23:28:47.472Z收到，4800.953ms。
前一动作是didChange v2，新增一处`void extensionWindow;`；结果从3处变为4处，计时不包括前一个查询。
文件为picker/PickerUIExtensionAbility__copy_003.ets，光标零基43:9。不是重命名耗时，也不是本轮最新main的LSP测量。

1. `SemanticWorkerProxy.sync→#mutate→ReferenceInputState.changed→ReferenceResultCache.invalidateRoot`：
   文档版本和根输入代次推进；旧答案撤销。cache key也含文档version/textSHA，因此编辑/撤销均不能直接拿旧版本Locations。
   **答案需要失效，不等于Host、SDK树、项目LS/Program和全部派生事实都需要销毁。**
2. 诊断quiescence等待1.145ms。Worker #7 semanticReadiness在42.675分派，到43.702 cache.miss，边界约1027ms。
   源码对应reference-cache-admission的前置readDiskAdmission；它覆盖全命名空间和内部最终义务。
3. 43.702进入retained-only references探测，之后Native候选direct-proof unsupported，候选选取17.96ms，安全回退。
   搜索文档准备457.519ms，内含依赖闭包110.296ms、预载11.071ms；其余成员/围栏开销没有同层细分，不能相加后猜归因。
   原日志resident proof明确拒绝`stage=admit,reason=program-unobserved`，不是RSS压力；当时memoryLevel=level0。
4. `program-unobserved`只表示该owner没有可用于当前输入的已观察证明，**不证明整个进程从未创建任何Program**。
   当前resident-context-lease的消费者既要求已准备compiler state，又用completeReferenceScope要求完整成员覆盖，
   其资格与已存在的局部query proof并非同一种；不能以“partial”统一判定所有局部查询不可用。
5. 完整搜索plan记录29995成员/候选、30批，规划169.16ms。随后先执行1-root lexical probe，取得完整局部4处结果，
   没有执行30个大批次；但全局计划及隔离输入工作已经做过。这个先后顺序留下了可避免的派生工作。
6. 44.884→46.398的verifier1514.082ms：物理Worker复用，getProgram1082.903ms（其中createProgram984.813ms），
   真正锚点核验+引用查询11.487ms。各者包含关系不能叠加。项目LS依旧按job新建、完成前dispose。
7. #10 semanticReadiness在46.400分派，到47.471 cache.store，边界约1071ms；然后才响应。
   最终fence有正确性目的，但再次覆盖整个根的代价没有被小范围局部查询消除。

不重叠宏观分区：前置cache.miss前1031ms（21.47%）；随后到probe1182ms（24.62%）；
verifier1514.08ms（31.54%）；最后1073.87ms（22.37%）。
第二段包含候选17.96、文档准备457.52、规划169.16ms，剩余约537ms尚未细分；
withProjectFileIdentities/准备围栏等代码在这条链上，但没有独立打点，不能将537ms全标给某个函数。
两次references Worker内部queueWait约0.33–0.34ms；不能把前置2.2s叫父线程队列拥堵。
完整筛选时间线见edited-reference-detailed-timeline.json，原始全部日志保持不变。

### 一手资料与适用边界

| 官方实现/版本 | 已核验机制 | 本项目如何适配 / 边界 |
| --- | --- | --- |
| [TypeScript LanguageService设计](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)，文档修订2020-05-21；[TS v5.9.3 services源码](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/services.ts) | 长期LS，Host项目/文件版本，旧Program传入新同步；ScriptSnapshot变化范围与Registry可共享语法。同步存在不能中途取消的安全提交段 | 复用现有组LS/Host，不每次创建新实例。新Program对象仍可能合法产生，不以“createProgram次数必须0”为目标。上游参考不意味着本项目ohos4.9.5-r10可直接升级/具有完全相同内部行为 |
| [tsserver v5.9.3 ScriptInfo](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/server/scriptInfo.ts)、[ProjectService](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/server/editorServices.ts) | 编辑更新文本存储，标记所属项目dirty；关闭文件有watch/重载流程，输入管理在编译器外部 | 对齐连续delta、所属组版本和真实文件权威；不能照抄项目version快路后省略我们的未通知变更/链接替换合同 |
| [rust-analyzer架构](https://rust-analyzer.github.io/book/contributing/architecture.html)；[search.rs固定9c74e78](https://github.com/rust-lang/rust-analyzer/blob/9c74e78e01d7cd31663f4ecf71e65b1cc4b9ccb8/crates/ide-db/src/search.rs)，commit2026-11-23 | VFS/输入变更与语义分析分层，增量派生值；SearchScope按可见性/局部范围缩小候选，再文本预筛、语义核验 | 复用现有Store/作用域图和查询证明；不是引入Salsa重写编译器。正依赖之外必须记录负解析、目录/配置、全局/ambient和被排除范围 |
| [clangd调度设计](https://clangd.llvm.org/design/threads)、[索引设计](https://clangd.llvm.org/design/indexing)、[llvmorg-20.1.8 TUScheduler](https://github.com/llvm/llvm-project/blob/llvmorg-20.1.8/clang-tools-extra/clangd/TUScheduler.cpp) | 保留AST/兼容preamble；版本化写入与读顺序；合并没有读者的过期写；动态文件索引叠加后台索引 | 保留已有mutation barrier/串行重型owner；开放文档overlay覆盖磁盘index。不能照搬C++每文件线程、某些允许stale preamble的completion策略到严格完整引用 |

rust-analyzer的2019 find-usages博文包含“尚未实现trigram”的历史说明；本结论不把它当当前实现状态。
参考其当前固定search源码，而非以博文宣称今天用了某个具体倒排索引。

### 推荐方案：完成已有架构的引用消费者迁移

**不把保留旧答案当作编辑优化主方案。** 编辑后4处引用应重新计算，关键是重用合法输入和语义状态。

A. 以现有稳定语义组/coordinator为唯一项目owner，引用和该文件交互功能使用兼容LS/Host与SDK域。
连续delta推进相关ScriptRecord/Host版本；未改SourceFile、解析和派生数据复用。组身份不含光标/版本/临时候选。
保留操作作用域的真实依赖投影，不把30K成员自动提升成Program入口。全局未知范围继续完整回退。
每请求借用/归还lease；项目关闭、不兼容配置或故障域退役再dispose。按ADR0049绑定job身份/取消/结果与drain，
不保留上一请求闭包，不用“永不销毁Worker”替代安全生命周期。

B. 引用执行顺序改为“当前owner与输入准入→证明实际搜索范围→最小候选/语义核验→最终联合fence”。
优先使用已证明的词法/模块范围；局部probe完成即无需创建30批全局plan。
未知外部可见性、别名、继承、ambient或负解析等不能靠文本猜范围；索引候选只是上界，最终仍由编译器核验。
resident消费者应接受合格的局部覆盖证明，不能强制局部变量拥有全根Program证明，也不能直接放宽任意complete布尔值。

C. 统一一次逻辑请求的输入观察与最终义务。先在现有合同内共用同phase同producer的实际观察/派生集合，
保留独立最终检查，不重复新开完整readiness作为通用前置/后置万能证明。
若希望局部引用核验成本真正不随所有无关成员增长，则须明确把proof范围收敛到查询实际语义输入加完整排除/负依赖证据。
这实质细化ADR0047/0048的“全命名空间”第一阶段约束，应单独记录并用反例证明，不假称现合同已经允许。
任意无通知磁盘修改仍要求马上全局可见、又不检查任何相关输入/名称变化，无法靠epoch或watch-only保证。
watch缺失/溢出/不明目录变化进入原保守重扫/资格撤销；发现变化前不能用旧epoch自动宣布磁盘一致。

D. 已有Native索引及overlay以文件变更更新候选、派生facts/图；配置/解析环境变化按真实影响扩散。
当前这个样本Native候选仅18ms，重写索引不是修复4.8s的首要条件。
连续输入可合并没有请求依赖的中间准备；前台请求看到它之前的写，不能跳过读者对应版本或返回旧位置。
无关组Host版本不应无条件推进，但输入日志仍记录所有真实变更；类型推导/API或全局变化不能只靠“函数体编辑”字面判断无影响。

### ADR关系、更正与验证标准

ADR0018/0019已授权稳定组、长期LS和请求输入共用，并明确修订0016逐job销毁。
本报告初版“长期Program需要重新推翻0016”的表述已更正：**当前是未覆盖路径的迁移欠账**。
ADR0049已解决job上下文/取消生命周期，是可复用的正确性基础，不提供Program复用收益。
ADR0047已经分离全局READY与局部答案资格，但其现有缓存前后仍要求全命名空间。
本方案是研究建议，不伪造新的Accepted ADR或审阅记录。

先建公开LSP回归证明：同文件编辑3→4、撤销4→3、保存/关闭重开；正确最新版本/单一终态；
记录owner/LS、Program及SourceFile身份、编译同步、实际candidate/批次数、输入证明次数与各阶段时长。
不要要求编辑后Program对象不变，也不能只以Worker没重建作为通过。
再覆盖无关组编辑、实际import/类型/API/ambient/config/SDK变化、未通知同大小/mtime恢复写入、负解析恢复、
目录移动/恢复/删除、链接替换、真实取消A后B复用、连续编辑与不同查询交错，保持完整结果和故障预算。
同条件固定真实依赖闭包增加无关文件、以及实际闭包增长分开测；恢复磁盘余量后才补最新main LSP/Windows Zed/UI。
仅保留Program若能省掉整个本样本getProgram，算术上也只是约1.08s，尚有3.7s；
这是上界拆解，不是测得收益。两轮证明若能收敛，另有约2.1s可研究，但不能直接删fence或承诺全部可消除。

## 自审：上述方案尚不能直接作为实现规格

自审日期2026-11-26；仅设计/code review，不是独立评审、实现授权或Accepted ADR。
结论：方向可采用，但须先补齐owner、覆盖与新鲜度、编译同步三个边界；不接受只改缓存/开关/guard。

### 阻塞性问题与反例

1. **program-unobserved的形成过程尚未闭环。** 现有日志证明了拒绝及回退，不唯一证明选错owner、
   未完成同步或证明被撤销中的哪一种。代码里引用按root peek，交互可用module group键；这是真实路由差异，
   但尚未证明它就是这份历史样本唯一成因。实施前观察选定contextId、创建/同步/撤销顺序、
   appliedContentRevision、Host版本、根集合与observation拒绝原因，不能直接放开hasPreparedCompilerState守卫。
2. **覆盖证明不等于输入证明。** `lexical-reference-coverage.ts:11`明确只证明有限引用范围；
   LexicalReferenceQueryProof没有SDK/config/目录/负解析facts，现靠外层全namespace合同补足新鲜度。
   不能拿其scopeStart/end或返回的4个Locations直接替代两次readiness。
   若缩小输入范围，必须由实际compiler/输入owner共同产生可验证资格，包含所用解析/转换配置、
   原始加载证据及必要排除/负依赖；生成最小Program投影时依赖的图/排除证明也在范围内。
   只把核验数组改成Program的87项目文件或482总文件并不自动安全。
3. **共享长期LS不是共享不可变Program。** `semantic-worker-runtime.ts:145`让references异步挂起时继续服务消息；
   LS、SourceFile及checker在后续同步中可能被修改，不能让同一活LS/AST跨await供A、B同时使用。
   保留现有串行编译turn/lease和mutation barrier；异步候选发现只携带不可变输入/DTO，重新进入编译前核对世代/版本。
   不用整个RPC大锁阻塞新编辑/取消。同步安全提交段遵循ADR0023/0031；请求失效只撤销发布资格，
   不在编译器不安全点中断，更不将已有过期LS重新包装成当前状态。
4. **稳定组不代表Program入口应该覆盖整个模块。** 30K复制文件可能在同一个模块。
   保留module owner但把全部模块成员设为roots，会重新引入巨型Program；把每次点击都建成新owner也不正确。
   必须同时保留ProjectOperationScopes的真实闭包投影和完整排除证明，分别记录组身份、实际roots、
   Program真实成员。不能无限累加历史查询roots造成工作集增长；不兼容配置/SDK/根身份更换应退休旧域。
5. **先局部后全局不能把hint当资格。** 词法producer目前只准许函数体内单一直接block-scoped变量，
   排除属性、shorthand关联、解构、export、解析恢复及转换文本等。编辑可将let查询变成属性/别名/未知范围，
   旧scope即使位置近似也必须失效。普通资格不满足可完整回退；已进入查询后的新鲜度失败是旧请求终态，
   不能回退重签把它变成功。早试局部只能减少169ms等计划工作，尚无证据其能独自省掉全部1.18s准备。
6. **两轮全盘核验不能用epoch或watcher自动替代。** 已有代码对同phase观察做了复用，
   最新只读热态已经0源码open；剩余2N叶子有独立当前/最终语义。先证明仍重复的具体producer/阶段，
   再做等价消除。若每次完整根新鲜度要求不变，全局导出符号仍可能有N相关成本。
   局部输入资格迁移与“只相信已收到的事件”的一致性合同是两件事；后者不是本方案默认选择。
   离线watch丢失、注册未完成、路径替换/同字节retarget和目录恢复须保留保守拒绝/重新取证。
7. **开已有实验开关不能算完成迁移。** 当前prepare已经以residentFastPath或sessionReuse授权连续delta，
   不能只因sessionReuse默认off就断言没有增量复用。VersionedSnapshot已有实现但overlay变化范围开关默认不启用；
   它只能改善合法快照祖先的局部解析，无法让每job新LS保住旧Program，也没有本样本独立收益计时。
   不捆绑启用未经本候选验证的开关，不以Program对象永远不变作为增量正确性标准。

### 收敛后的最小实施顺序（建议，尚未实施）

- **S0：先把驻留失配变成可控公开反例。** 使用默认配置、SDK partial、真实模块拓扑和局部变量，
  记录owner/Host/根/observed状态，复现open→edit→引用→undo→引用，解释每次实际落到verifier的具体原因。
  优先复用现有阶段日志，只补无法分辨的必要观测，避免为了指标创建另一套状态机。
- **S1：完成既有owner的消费者迁移。** 沿用coordinator、组选择、连续delta及原输入fence，
  引用进入与当前文件操作范围兼容的owner。peek资格检查不隐式构建；正常准备入口可显式创建/同步一次，
  成功后保留LS。取消先撤销发布资格；实际编译工作结束并完成drain清算后才归还lease，
  不把取消响应视为资源已经可复用。配置/故障/关闭按原owner退休。未覆盖范围继续原完整回退。
  此步独立验收复用正确性，不宣称消除了两轮全namespace成本或已达500ms。
- **S2：局部证明消费者与规划顺序。** 使用当前合法输入生产新的局部覆盖证明，先执行局部路径；
  它完整成功后不创建全局batch plan。覆盖不足走原全局路线；失效/取消/致命故障保持原分类和单一终态。
- **S3：单独规格化查询输入资格并迁移前后readiness。** 明确producer、实际读/排除事实、配置/转换/负解析、
  所有权和独立最终union；先只覆盖现有严格lexical子集，未知继续原合同。需要细化ADR0047/0048；
  保持ADR0004根级结果缓存失效，不同时启动全局细粒度结果缓存重写。

初始化91s的facts/图成本仍独立OPEN。把更多Program强塞初始化不算本问题解决，
也不能用改成后台/延迟发终态来隐藏等待。采用哪一步都必须分别记录初始化、首查、编辑后首查和热查询。

### TDD/验收补强

已有references-batch-search-coverage覆盖完整驻留Program，references-query-cache-proof覆盖SDK partial缓存，
references-lexical-probe-lifetime覆盖取消/旧overlay，references-verifier-ownership覆盖A终态后取消与B复用。
这些是有用基础，但都不能单独证明“partial+模块owner+编辑后驻留增量+局部覆盖+减少全项目工作”这个组合。

新增组合回归须通过真实child LSP，显式判定：

| 场景 | 正确性/机制验收 |
| --- | --- |
| 默认配置partial下open→edit→undo→保存→关闭重开 | 原始范围3→4→3；版本/源映射正确；owner/LS连续且不反复建verifier；允许合法增量Program换代 |
| 无关文件/模块编辑 vs 真正依赖/API/全局/SDK改变 | 旧请求仍失效；新请求按真实影响更新；未知负依赖/ambient不得用无关组理由漏掉 |
| local改property/export/shorthand/解构，解析错误再修复 | 旧lexical资格立即失效；完整回退结果准确，不能把相同拼写当相同符号 |
| 未通知写入、same-size/restored-mtime、配置/SDK替换 | 与当前磁盘/overlay权威一致；捕获原加载证据，不能新stat授权旧AST |
| A等待候选时编辑、A已结算后取消、B复用；中途取消/异常 | 单终态、无旧结果/取消串扰；lease/drain/物理退出清算，恢复共用原预算 |
| moved依赖恢复、删除历史空目录、symlink/根别名retarget | 旧producer撤销单调；失败请求不重签；下一显式新请求可恢复，无worker重建风暴 |
| 同模块轮换大量文件、跨组/跨root重复与长空闲后恢复 | 不累计所有历史roots，不互用owner证明；LS/Registry/回调随生命周期释放，RSS不降本身不是泄漏 |
| 固定真实闭包增无关N、增真实依赖闭包两类规模 | 分别数FS/证明/plan/Program/SourceFile复用及准确结果；不把Worker复用或单个大项目成功当规模通过 |

每片先RED再最小实现，使用已有正确性断言；候选最终完整检查、实际30K冷/热/编辑流程及Windows UI另列。
性能比较须冻结源码/SDK/产物、串行多轮；磁盘保护解除前不执行新的大索引负载。
该自审未新增产品修改、运行测试、变更ADR状态、接受审阅、合并或发布。

## 第二轮自审：资格耦合的机制证据与方案收敛

本轮仍为设计自审，未修改产品。补了一个小型只读组件实验，未跑新30K/LSP/UI负载。

### 新证据：已有Program不等于readiness允许消费的Program

`readiness-gate-self-review.mjs/json/log`固定main cc92b50、Node20.19.5、真实ohos-typescript4.9.5-r10。
真实LS使用一个内存源文件，先实际构建Program；SDK输入是与现场mismatch同型的合成元数据，不冒充真实SDK实测。
两个条件使用同一真实LS/Program、相同文本和生产OfficialReadinessState实现：

| SDK条件 | prepare内getProgram次数 | hasPreparedProgram | 全球报告 | 底层Program仍相同 / 实际局部引用 |
| --- | ---: | --- | --- | --- |
| target mismatch | 0 | false | partial/sdk-inputs-incomplete | 是 / 3 |
| compatible | 1 | true | degraded/compiler-inputs-incomplete | 是 / 3 |

compatible对照的内存fixture故意没有标准库，code2318缺Array，所以并未产生READY；只证明到达实际Program观察阶段。
两次onPreparedProof均收到undefined，既有Program未被dispose；实验断言的是资格状态和实际对象存在的分离。
不是公开LSP成功、Photos精确现场复现、SDK兼容性或修复回归，不将此PASS计入完整测试数量。

生产链条已用源码和该组件实测确认：
`OfficialReadinessState.prepare→clear→onPreparedProof(undefined)`，随后
`prepareOfficialReadiness→sdkReadinessCoverage=false→partial`在getProgram/onProgramPrepared之前返回。
`TypeScriptResidentReferenceState.adoptValidatedProof(undefined)`又撤销resident observation；
`hasPreparedCompilerState`只看readiness标记或resident observation，因此可以在真实Program仍存在时为false。
现有Photos日志的API20/24 mismatch具备此短路条件。这收敛了一个可实际触发的耦合机制，
仍未捕获原30K请求每一步owner/Host/observation，不能宣布该样本全部因果均唯一归因于此分支。

**禁止的捷径**：删SDK gate、把false改true、只因service里有Program就准入，或强行构建整个30K根。
SDK gate原本用于避免已知全局资格失败仍做巨大完整准备，继续有合理作用。
应分离全局SDK资格、特定owner的实际编译观察、具体查询的输入/覆盖资格；
后两者须来自原owner成功同步及有效证明，不从全球READY布尔派生，也不与全球报告争用一个状态。
这是ADR0019/0047方向的消费者迁移；沿用现有coordinator/Host/观察器，不再添加总控状态机。

### 第二轮识别的设计遗漏

1. **局部路径必须贯穿全部消费者。** 当前query-entry:42在路由前调用完整cacheAdmission；
   cache-admission:14/29/31命中和未命中均会取全namespace；query-cache-proof的namespace key要求全根diskSHA；
   resident-reference-query:86附近还要求searched覆盖全部membership；resident-state.inputsFor本身也规范化/签名全部成员。
   仅把probe移到batch plan前，或去掉某一个readiness调用，不能移除这些隐含全范围成本。
   后续迁移规格须逐一覆盖入口准入、缓存验证、owner准入、覆盖验证、输入生产者注册和最终union，
   并以实际FS/遍历/分配证明没有在更深一层重新执行N相关工作。
2. **全局导出引用有明确反例。** 不改变当前查询文件/已知依赖，只在原本无关Noise.ts中无通知写入
   `import { Target } from './Target'; new Target();`，旧反向图与旧索引都可能漏掉新引用。
   因此“只核验旧Program的已读文件”不能保证完整全局引用。对原严格lexical子集，可由语言绑定证明外部文件
   无论如何改变也无法合并进此局部声明；这才是无需遍历外部文件的依据，不是watch没报变化。
3. **不能把语义复用强制等同搬回同一Worker。** 在前台语义Worker增加不可中断编译可能恶化补全/跳转尾延迟；
   现有隔离verifier本来就承担隔离重型工作的作用。优先复用兼容热owner的局部执行，重型完整回退保留隔离；
   若实测要求在既有verifier中保留项目上下文，须显式设计其lease/配置/取消drain，不能另建隐藏缓存或跨isolate搬AST。
   此处执行位置要用混合请求结果决定，不能只看单条references变快。
4. **取消响应与lease可复用必须分离。** 已修正上一轮S1“取消只归还lease”的模糊措辞：
   先撤销发布资格，实际同步结束/安全提交或失败清算且drained之后才归还；B不能在A仍使用Program时改Host。
   同版本构建失败后还必须能重试，不能因长期保留LS重新引入lastProjectVersion卡住及Registry租约残留。
5. **账面省时不是收益承诺。** 即使把历史getProgram约1.083s、前后readiness约2.098s、plan0.169s都当成可完全消除，
   账面仍余约1.45s；这是拆解练习，不是未来耗时下界或测得收益。增量同步本身仍可产生新Program/checker/绑定成本。
   未细分的准备区间和验证器其它部分必须保留为待测，不能靠新架构名承诺500ms。
6. **局部案例通过不关闭全部引用性能。** 首片限定现有严格lexical子集；类、属性、导出、继承、ambient/跨模块
   必须有独立完整性与性能证据。30K完整引用/重命名缺口仍OPEN，不用只跑局部变量的绿色代替。

### 对实施规格的最小约束

- 明确两类查询准入：保持现有完整根路线；为已证明lexical子集增加独立输入/覆盖资格路线。
  新路线仍绑定当前原始文件物理身份、overlay版本/文本及源映射、compiler/parser配置和原owner观察；
  未取得语言独立性/所需输入证明时回原完整路线。已失败的输入/fence不可改成普通miss重新签发。
- 同时更新相应消费者，保持旧根级结果缓存失效；不把全局partial改READY。
  Program存在、资格合格和生命周期仍由各自现有owner/证明决定，不用新增可任意赋值的valid布尔。
- 先以当前main公开SDK-partial编辑用例分辨上述短路/owner路径，再交付有限且完整的一条局部链；
  采用S0→原围栏下驻留迁移→局部规划/输入资格迁移的纵向片，每片明确已消除与仍保留的全局工作。

额外必测反例：旧无关文件无通知新增引用；local改property/shorthand；取消已回复但编译未drain时B排队；
同版本同步抛错后重试与租约结清；同模块轮换文件不累计所有历史roots；引用同时触发补全/定义不恶化排队与取消。
验收观测不能只要求“0执行batch”，还要数“0无必要全局plan”、当前owner/LS/实际SourceFile复用、
隐藏membership/raw union及Map构造成本；每次最终位置/版本仍为硬正确性要求。

本轮只执行上述组件机制对照与文档自审；未运行新公开LSP回归、check:fast、UI或性能改善实验。
