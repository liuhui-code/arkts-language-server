# 30K初始化、首次与重复导航：一手实现调研及方案评审

日期：2026-11-18。状态：**Review draft，仅调研和建议，不是新批准的架构决策**。
本轮不修改产品、不执行新的压测、不合并、发布、部署或操作日常Zed。
实施分解与验证矩阵见[执行方案](../plans/2026-11-18-navigation-performance-implementation-plan.md)。

## 1. 结论与研究边界

项目已有版本化输入快照、增量交付、长期Program和版本化索引；不能把“引入快照”作为新方案。
当前差距是：输入事实的失效传播、作用域派生数据及消费者核验，尚未完整复用这些已有能力。
初始化有全成员角色/依赖准备成本，首次有组发现/全局影响派生及新查询上下文成本，热态仍有大范围磁盘证明。
三者不是一个热点，不能预设只减少核验就解决87秒初始化和9.2秒首次查询。

推荐：在现有owner/Host/Registry/DocumentStore/Native存储上，依次补齐可观测性、派生数据维护、
有类型的证明依赖和最终核验调度。先保持现有新鲜度边界，性能仍不足时再单独评审一致性合同。
不新增第二套VFS、Salsa运行时、全局AST缓存，不改变稳定语义组、产品阈值或取消监督机制。

研究源码为main父提交`1e3886df3c4d27755a53c073462f1456b0a3de7e`上的独立候选，
工作树`/private/tmp/arkts-repeat-query-20261117`，最终Worker SHA256：
`5b638a7bb36ca2c7a724086490157861280bfc0715b006fc82098303d2140b22`。
Native为`800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c`。
本报告不代表用户日常安装、Windows或之后其他分支的运行身份。

证据基址E：主仓库`.bench/repeated-query-proof-plan-20261117/`；
历史基址B：`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。
本轮检索及分析输出：E`research-20261118/`。记录了官方源码字节SHA256、提交、日期和下载失败。
Context7先对TypeScript、rust-analyzer、Salsa调用resolve_library_id，三次均为transport失败；
未获得library ID或正文，不虚构query-docs结果；随后使用官方源码和设计文档。

## 2. 已有架构及ADR约束

| 记录 | 已有能力/约束 | 本轮关系 |
| --- | --- | --- |
| [0009](../adr/0009-semantic-generation-and-publication.md) / [0010](../adr/0010-incremental-invalidation-and-overlays.md)，Proposed | 固定输入generation、原子发布、增量覆盖、操作中变更撤销；不把全工程哈希放回查询 | 保留，不把它们误称尚未设计；这不自动禁止所有stat |
| [0019](../adr/0019-stable-programs-and-request-inputs.md)，Accepted、性能验收另列 | 决定1/2/5：稳定组与长期LS、delta；决定7及实施约束：原始输入证明和独立最终核验，不假设watch必达 | 复用已有owner和版本；不同请求不能仅凭内存revision认定磁盘没变 |
| [0035](../adr/0035-unchanged-source-authority-transitions.md)，Proposed、有实施收据 | 接收版本、真实编译输入版本分开；同内容权威切换可保留Program | 扩展派生元数据复用，不能固定Host版本或保留已关闭overlay |
| [0036](../adr/0036-compiler-source-namespace-recovery.md)，Proposed、有实施收据 | 源码命名空间恢复、非源码/SDK/config原证明、实际权威读取与终检 | 正负解析事实必须有namespace owner/epoch；不能用新观察重盖旧答案的章 |
| [0037](../adr/0037-navigation-work-and-input-validation.md) §C，Proposed、有实施收据 | 同步准备交接证明；最终清空观察并独立核验；actual-load guards不共享 | 同阶段共享可以扩展；跨阶段/终检顺序变化必须逐项证明，不直接删第三轮 |
| [0039](../adr/0039-validation-directory-observations.md)，Rejected | 跨请求目录内容复用实验，收益不足且卷精度证明负担大 | 不复活“目录mtime证明所有叶子不变”，不全路径小写 |
| [0043](../adr/0043-versioned-file-index-maintenance.md)，Proposed、有实施收据 | 文件facts增量、qualification、同data事务读快照 | Native提交/DB快照不是当前源码或语义证明，不重写已落地索引 |
| [0044](../adr/0044-load-owned-input-proof-lifetime.md) 决定2/4/6，Proposed、有实施收据 | 必需read set随真实输入增长，按owner释放，终检仍遍历；不承诺常量内存/时间 | 不用LRU丢必需证明，不因大read set直接认定泄漏 |
| [0045](../adr/0045-complete-membership-and-source-resource-budgets.md) 决定3/7及后续补充，Proposed | 成员完整性、路径/字节/独立终检；性能收益需普通计时验证 | 明确区分必需观察与多层重复；不能默认每个现有调用都是不可修改的合同 |
| [0020](../adr/0020-failed-semantic-build-recovery.md)、[0026](../adr/0026-cancellation-grace-terminal-handoff.md)、[0027](../adr/0027-completion-details-diagnostic-priority.md)、[0029](../adr/0029-opt-in-rss-memory-budget.md)、[0033](../adr/0033-client-navigation-ownership-and-ui-input-context.md) | 失败恢复、单终态/取消、调度、公平、默认无RSS预算、客户端导航所有权 | 全部保留；不以新Worker、提高截止或并发checker解决性能 |

ADR0005的[availability capture段](../adr/0005-index-proof-trust-boundary.md#prior-caller-owned-availability-capture-checkpoint-2026-09-28)
明确是受管revision加best-effort物理stat见证，不是原子/内容哈希文件系统快照。
“保留当前观察与拒绝能力”不等于“任何未通知修改都能在下一次查询前无条件发现”。
反过来，版本一致也不证明尚未观测的磁盘没变。这两个界限均不能含混。

已有优化也不能忽略：ProjectOperationScopes对相同key直接跳过角色解析，body-only delta可复用相同角色对象；
ScopeDependencyGraph.update有早退、bindings有自己的缓存、roots有WeakMap派生缓存；
request-input-validation已有同请求组合memo及原始观察复用。后续方案是补齐这些路径的
输入关联、结构失效和最终调度，**不是宣称当前每次都重解析/重建图，也不是重新实现上述缓存**。

## 3. 三段耗时的证据账本

### 3.1 普通计时、输入与并行关系

最终第二组为main-c/stamp-a/main-d/stamp-b串行四个独立会话；每版本两会话、六个热查询样本。
Node20.19.5/x64、ohos-typescript4.9.5-r10、相同原Photos隔离副本/目标/SDK/已关闭56索引缓存。
30,000物理源码；语义成员29995；SDK API24/项目20，语义partial，不能宣称真实Photos全量引用/重命名可用。
3955个SDK声明/metadata是身份快照数量，不是解析量或Program文件数；最新实际Program参与文件数尚未逐阶段统计。
进程冷启动、Native缓存暖；不是新磁盘冷索引、真实UI或耐久。

| 候选会话 | 初始化通知等待ms | 首次定义ms | 三次热定义ms |
| --- | ---: | ---: | --- |
| stamp-a | 87492 | 9189.14 | 3588.21 / 3568.32 / 3930.42 |
| stamp-b | 87690 | 9242.09 | 3596.52 / 3595.36 / 3974.57 |

首次中位9215.62ms；热中位3595.94ms/max3974.57ms；对应main热3974.69/max4331.03ms。
已测表示优化收益9.53%，不是结构性方案的预估收益。4会话精确结果、Native ready、SQLite及关闭均PASS。
第一组main-a原SQLite60秒后检失败保留，不能用本组覆盖。见E`stamp-matched-series.json`、`stamp-ordinary-summary.json`。

stamp-a：18:16:11.297Z驱动开始，initialize响应7.35ms；Native ready18:16:23.295Z，约12秒。
18:16:24.346Z收到Program/checker starts/returns均1/1的Worker快照；语义准备约87.5秒才终结。
stamp-b有相同先后关系。进度快照是采样/消息观察，不是Program精确退出计时；
但足以否定“87秒全是Native索引”以及“只有createProgram在耗时”。Native并行时间不能与语义87秒相加。
最新初始化缺少角色、解析器、SDK加载、目录核验及排队的完整互斥span；**不能给87秒编造百分比**。
SDKpartial说明能力边界，并不能据此将87秒归因于SDK版本差异。

历史49（不同候选）准备113355ms：ensure97627.22ms包含图update48389.14ms，
差额49238.08ms含角色及其读取/检查；projectSourceRole32878.76ms又包含在前者中。
历史50有realpath/语法访问/读取热点。仅用于确定测量方向，不能按比例套到当前87秒。
见B`post-gate-initialization-stage-summary.json`、`initialization-cpu50-summary.json`及[历史报告](2026-11-16-final-gate-closure.md)。

### 3.2 首次查询：已证明存在独立的派生数据成本

E`plan-cpu/worker-causes.ndjson.define-2.cpuprofile`属于上一表示切片641655，不是最终5b638a的精确分解。
独立剖析请求10710.97ms；采样10685.04ms含inspector dispatch1540.81ms、GC1016.07ms及1.85ms其他外层。
产品调用栈8126.31ms；prepareInteractiveContext5555.21ms、runPreparedSemanticQuery2569.61ms是兄弟区间，
还有约1.49ms其他产品调用栈。诊断GC也可能受剖析分配影响，不能作为普通查询的固定GC成本。

首次select5224.97ms包含project2894.36ms、ensure1536.79ms；roots1181.66ms包含
independentMandatoryGlobals512.58ms、effects499.51ms。上述均为inclusive，**不能相加**。
resolvedPathIdentity在discover→containsResolvedPath调用链的self约1149.32ms，证明首次组发现存在真实路径计算成本。
定义算法getDefinitionAtPosition约18.40ms，仅是产品阶段的一小部分；首次监控Program/checker计数1/1→2/2。
新Program的实际解析/复用数、配置/组身份、roots缓存未命中原因尚未精确对应，不能只凭计数称全Program重建。
当前`initial-semantic-contexts.ts` L23–28在SDK coverage不完整时，只同步SDK owner并调用
preparePartialWorkspace，然后return；不会走后面的groups.prepareInitial。preparePartialWorkspace创建角色/依赖scope，
并不调用SemanticGroups.all来构建组目录。首次profile实际进入discover，与该延后派生路径吻合；
这解释了为什么“初始化已经做了大量工作”仍不等于“首次组选择已经预热”。
还需记录graph对象/membership/config缓存键，区分这个已知冷入口与额外的身份失配，不能一概归因SDK。
可预备纯组目录，不应因此启动已知SDK不完整的全项目Program或伪造完整就绪。
分析输出E`research-20261118/profile-id2-attribution.json`，保留原profile。

### 3.3 热查询：互斥归属及未归因部分

同一诊断id3产品调用栈3523.35ms，以下按outermost责任祖先互斥分配：

| 责任 | ms | 产品栈占比 | 不包含/限制 |
| --- | ---: | ---: | --- |
| LoadedConfigurationWitness.scan | 1550.87 | 44.02% | 不是56964次全为实际读盘的证明 |
| sameMembership | 626.13 | 17.77% | 含其子调用，不再加Native scan |
| overlaysCurrent | 181.57 | 5.15% | 仍检查所有member，不能全部归为内容hash |
| 实际定义查找 | 1.45 | 0.04% | 非最新普通查询精确墙钟 |
| 其他产品调用栈 | 1163.33 | 33.02% | 未逐项拆净，不全称排队、同步或可删除成本 |

prepare1642.06/query1881.29ms是同一产品栈的另一种分法，不能加到上表。
lstat self1259.1ms已分布在上表；inspector dispatch1035.10ms不属于产品；GC167.25ms另列、不分摊。
来源E`query-cost-exclusive-breakdown.json`、`research-20261118/profile-id3-attribution.json`。
采样归属含同步IO等待，不等同于精确CPU周期；上面比例不能直接乘最新3595.94ms冒充其阶段测量。

### 3.4 次数口径

历史64冻结b19f诊断，同一Native proof owner1/revision2每请求：
准备ensure→sameMembership一轮；最终union直接validate一轮；scope.current→sameMembership又一轮。
29995×3=89985次历史诊断所称的**Native成员证明叶子lstat**，不是所有进程/所有证明的总lstat。
实际调用点是Node/语义Worker中的CompleteMembershipProof.current→fs.lstatSync；
这里的“Native proof”是该成员证明的历史名称，**不能把89985次归给独立Rust索引进程或Native RPC**。
Rust索引的ready时间与这条Node验证路径分别记账。
热configurationSourceIdentity56964次是函数调用数，既不是不同文件数，也不能直接乘2当实际lstat总数：
目录命中、regular fast path、弱ID/链接/缺失路径fallback和同阶段观察复用会改变实际IO。
这份计数来自历史64，不是最终四个普通会话新加的计数探针；相关产品调用路径未被本次表示优化修改。
见B`membership-phase-count-summary.json`与`photos-membership-phase-count-64/worker-causes.ndjson`。

本项目Host已在`typescript-language-service.ts` L1648提供getProjectVersion（generation、membership status、content revision），
不是尚未接入TypeScript版本早退。最新热查询Program/checker计数保持2/2，但每查询仍约3个同步入口；
入口数不等于新Program数或同步主体耗时。
必须分别统计synchronize入口、project-version早退、实际Host同步、Program/SourceFile新建和checker工作。
400源码公开回归0重读/0重建不代表这次真实30K每种文件IO也已计数为0。

## 4. 固定版本的一手实现及适配边界

完整提交与文件SHA见E`research-20261118/upstream-{refs,sources,extra-sources}.json`。
TS/LLVM采用明确历史版本验证机制，不声称最新版；RA/Salsa的master在检索时解析为以下固定提交，后文不引用漂移HEAD。
下载失败的Salsa verify/memo候选路径保留404；结论使用实际下载成功的maybe_changed_after/backdate等文件。

| 来源 | 版本/提交 | 核对位置和机制 |
| --- | --- | --- |
| TypeScript | v5.7.3，`a5e123d9e0690fcea92878ea8a0a382922009fc9` | [services.ts L1702](https://github.com/microsoft/TypeScript/blob/a5e123d9e0690fcea92878ea8a0a382922009fc9/src/services/services.ts#L1702)：projectVersion及类型指令条件满足才早退；否则仍可能检查Program |
| tsserver | 同上 | [project.ts L1358](https://github.com/microsoft/TypeScript/blob/a5e123d9e0690fcea92878ea8a0a382922009fc9/src/server/project.ts#L1358)：dirty首次推进stateVersion；[editorServices.ts L1896](https://github.com/microsoft/TypeScript/blob/a5e123d9e0690fcea92878ea8a0a382922009fc9/src/server/editorServices.ts#L1896)：变化传播到包含该文件的项目 |
| tsserver路径缓存 | 同上 | [watchUtilities.ts L164](https://github.com/microsoft/TypeScript/blob/a5e123d9e0690fcea92878ea8a0a382922009fc9/src/compiler/watchUtilities.ts#L164)：真实目录缓存，symlink目录不缓存；异常回原Host；不是目录mtime替代叶子内容 |
| rust-analyzer | `ff7105dd728897503481c79727cd6ead881d80a6`，2026-11-17 | [VFS L216](https://github.com/rust-lang/rust-analyzer/blob/ff7105dd728897503481c79727cd6ead881d80a6/crates/vfs/src/lib.rs#L216)：内容hash/no-op和同周期变化合并；[global_state L338](https://github.com/rust-lang/rust-analyzer/blob/ff7105dd728897503481c79727cd6ead881d80a6/crates/rust-analyzer/src/global_state.rs#L338)：take_changes，创建/删除才触发相应根结构更新，然后apply_change |
| Salsa | `52b12a418909c9d982a842691c6eaacfc6d62936`，2026-11-13 | [fetch L76](https://github.com/salsa-rs/salsa/blob/52b12a418909c9d982a842691c6eaacfc6d62936/src/function/fetch.rs#L76)、[maybe_changed_after L340](https://github.com/salsa-rs/salsa/blob/52b12a418909c9d982a842691c6eaacfc6d62936/src/function/maybe_changed_after.rs#L340)：同revision/适用durability快速验证，否则验证依赖；[backdate L15](https://github.com/salsa-rs/salsa/blob/52b12a418909c9d982a842691c6eaacfc6d62936/src/function/backdate.rs#L15)：结果相等且满足约束才保留changed_at |
| clangd | llvmorg-19.1.7，`cd708029e0b2869e80abe31ddb175f7c35361f90` | [TUScheduler L859](https://github.com/llvm/llvm-project/blob/cd708029e0b2869e80abe31ddb175f7c35361f90/clang-tools-extra/clangd/TUScheduler.cpp#L859)：比较内容/命令、更新AST；[L970](https://github.com/llvm/llvm-project/blob/cd708029e0b2869e80abe31ddb175f7c35361f90/clang-tools-extra/clangd/TUScheduler.cpp#L970)：读队列借用AST或必要时构建 |
| clangd观察共用 | 同上 | [FS.cpp L45](https://github.com/llvm/llvm-project/blob/cd708029e0b2869e80abe31ddb175f7c35361f90/clang-tools-extra/clangd/FS.cpp#L45)：preamble生产者记录实际status，后续消费者通过代理FS复用；不是原子磁盘证明 |

RA与Salsa是分别固定的研究对象，本轮没有核验RA Cargo.lock是否依赖表中这一Salsa提交，不能把二者当作一套实测组合。
这些机制的共同点是“变更与依赖的归属明确”，不是另建一个版本计数器。
Salsa的verified_at与changed_at职责不同：本轮检查过并不意味着派生值改变；派生值相同可阻断向下游的无谓失效。
HIGH durability允许在相应高稳定输入没有变化时不遍历依赖；它不是“SDK路径不变，所以SDK永久有效”。
Salsa当前源码还专门限制provisional/cycle情况下backdate；不能把循环图一概按结果相等剪枝。
tsserver版本早退也不能机械照搬：本项目ADR0020已处理失败构建后的同版本重试，
仅成功构建且仍有有效输入/租约的状态才能授权复用，不能把“已尝试版本”当“成功版本”。
其算法只覆盖已建模输入，任意未登记磁盘IO/全局变量不是自动跟踪的依赖。
[算法说明](https://salsa-rs.github.io/salsa/reference/algorithm.html)、[durability说明](https://salsa-rs.github.io/salsa/reference/durability.html)为动态文档，以固定源码为准。

RA语义查询面向已应用的数据库/世界快照；外部文件必须先经过VFS输入路径。
该提交[vfs-notify L200](https://github.com/rust-lang/rust-analyzer/blob/ff7105dd728897503481c79727cd6ead881d80a6/crates/vfs-notify/src/lib.rs#L200)
只消费所选择事件、读取相关文件，并在notify错误时记录警告；不能据此宣称它无条件恢复所有漏事件。
它的hash去重也不能直接替代我们同内容的物理身份/权威切换检查。

clangd源码头部明确某些read可用stale preamble，要求compatible的read才等待。
我们不能照搬此容忍度到完整引用、重命名或现有严格SDK/config/路径证明。
它的AST共享也不意味着可以并发操作同一个ohos-typescript checker。

## 5. 问题—成熟机制—本项目改进映射

| 问题/证据 | 业界机制 | 当前对应位置 | 建议与边界 |
| --- | --- | --- | --- |
| 初始化87秒中Program返回后仍长时间准备，当前互斥阶段缺失 | TS按需阶段、RA输入/结构变更分离，clangd可复用预备结构 | initial-semantic-contexts.ts、ProjectOperationScopes.ensure、project-source-role.ts、ScopeDependencyGraph.update | 先测角色提取/SDK语法/绑定/证据各阶段；复用同原文/选项/语法kind的合法AST或角色摘要，未知仍解析；不跳过ambient分类 |
| 首次discover及路径判定热点 | tsserver项目归属及RA source-root分区 | SemanticGroups.all/discover、containsResolvedPath | 复用现有roots缓存；按真实graph/成员/配置更新索引，一次分类文件归属；重叠根/共享声明允许多归属，不硬切伪项目 |
| 首次roots/effects冷派生；热仍Map复制和比较 | Salsa输出未变不传播、RA body与全局派生分离 | ProjectOperationScopes.ensure L105–135；ScopeDependencyGraph.update/roots/effects | 保留不可变role snapshot，变化集更新反向边/SCC及影响集合；不变摘要不触发全图effects；opaque/ambient扩大影响 |
| overlay检查扫全member并hash | tsserver ScriptInfo版本快照 | ProjectOperationScopes.overlaysCurrent及DocumentStore | 用已有权威事件维护打开/关闭/重开集合和摘要，final比较所用文档生命周期/版本；不是只检查当前查询文件 |
| 56964配置身份调用与嵌套owner遍历 | Salsa依赖memo/同revision验证，clangd生产者/消费者FS | LoadedConfigurationWitness、ScopeModuleBindings、request-input-validation.ts | 按事实类型和原owner注册依赖；同阶段同物理观察可共用，但每消费者仍比原始事实；不能用bare valid=true跨请求 |
| 同Native owner终检两次 | 请求依赖与最终发布顺序显式化 | CompleteMembershipProof.current、OperationScopeProof.current、withRequestInputValidation | 先记录原始偏序，统一终检计划，禁止pure消费者隐式重进完整扫描；不能无证明把三轮改两轮 |
| 同步入口多但Program不增长 | TS projectVersion早退与Program实际更新分开 | TypeScriptContentVersions、runPreparedSemanticQuery、安装编译器synchronizeHostData | 计数入口/早退/实际同步/新Program/新SourceFile，只有证明重复且无新输入才消除入口 |
| SDK/配置稀变，普通编辑却可能扩大失效 | Salsa durability、tsserver分离state/program版本 | sdk-registry-cache、configuration witnesses、resolver.generation | 沿用SDK域，分开正文/导出拓扑/路径namespace/config epoch；SDK变化仍撤销旧域，不以内容缓存命中认证 |
| 结果缓存未消除3.6秒 | TS/RA缓存派生计算的依赖，非只缓存位置数组 | reference cache、navigation in-flight、scope proofs | 先优化证明消费；缓存答案仍需有效证明，本次编译器查找约1ms，不是优先新增导航结果缓存 |
| 内存/取消/恢复 | owner和memo生命周期、串行变更/不可变读视图 | 既有lease、Registry、Worker supervisor及显式预算 | 可选派生缓存可退休，必需原证明随消费者释放；取消不发布，不无限重建，不复制RA线程模型 |

`SemanticGroups.discover`现有代码每unit过滤N个member，再对闭包根做包含判断；
结构工作量随unit数、根数和成员数共同增长，不能凭一个30K项目宣称总复杂度O(N²)。
`ProjectOperationScopes.ensure`即使没有角色变化仍构造全量role Map；Graph.update虽有早退，
仍比较roles并执行currentNodes。当前并非每次全图重建：400源码回归热graphRebuilds=0，遍历却仍存在。
冷角色提取与依赖图有真实O(N+E)起点成本；优化不能假装所有未打开文件都没有全局影响。

## 6. 一致性、磁盘与平台边界

三类快照不可混淆：语义输入快照保证已准入输入一致；SQLite读事务保证DB版本一致；
两者都不自动证明任意时刻磁盘上的字节。Node20.19.5的[fs.watch caveats](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html#caveats)
说明跨平台差异、inode替换和网络文件系统等限制。目录mtime不能证明已有文件正文没改。

[Windows ReadDirectoryChangesW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)
明确缓冲信息丢失时可能返回成功但0字节，或ERROR_NOTIFY_ENUM_DIR，要求枚举目录/子树重算变化；
也不监测所打开目录本身的变化。Node层未必暴露这些原始原因，不能把“没有error”当完整事件流证明。
[Linux inotify](https://man7.org/linux/man-pages/man7/inotify.7.html)明确overflow和缓存不一致后的对账需要。
这些是平台恢复依据，不是已在本项目实现的新watch保证；Windows文档检索日2026-11-18，页面标注更新2022-09-15。

建议统一输入消费中的uncertainty epoch：收到已知overflow/error、目录重绑、卷不可达/重连、
监听重新安装或可观察的事件缺口时撤销受影响域资格，执行有界合并重扫，完成后发布新收据。
watch先安装再初扫/重扫，记录开始代次，回放期间delta并终检；出现新gap不能把旧扫描标成current。
路径不存在不能直接解释为永久删除；离线卷/权限错误沿现有不可用路径。静默漏事件本身可能无信号，
因此即使watch状态healthy也不能跳过现有磁盘证明；后台对账只能缩短发现延迟，不能证明无延迟。

文件名保持原大小写，仅使用既有Windows盘符规则；物理路径、链接链及真实父目录身份必须校验。
delete/create同路径、case-only rename、symlink/junction换目标及close/reopen同数字版本必须有不同生命周期身份。
正解析依赖内容和身份；负解析依赖具体候选命名空间，目录变化只撤销有关负事实，不永久积累历史探测路径。
SDK覆盖不足是能力局部状态，不能因核验/对账把整个服务器长期degraded或伪造READY。

## 7. 备选方案与推荐

| 方案 | 收益与代价 | 合同/结论 |
| --- | --- | --- |
| A：已有架构上增量维护派生数据、统一事实/同阶段观察/最终偏序 | 冷/首/热均有具体优化点；新增O(N+E+F)必需/派生元数据，保留严格路径；热态仍可能O(F)磁盘核验 | **当前推荐**，先等价证明再替换重复检查，不保证500ms |
| B：以已应用的输入快照为日常查询一致性边界，watch/后台对账推进输入 | 无变化查询可避免全局磁盘证明；可能有未通知变化发现窗口，后台IO仍存在 | 若A仍不足可另议；改变0019§7、0037§C、0045相关合同，**本轮不默认采用**；不能称与原磁盘保证等价 |
| C：依赖OS完整变更日志/卷快照免逐次扫描 | 若确有完整覆盖可获得更强界限；NTFS/FSEvents/网络卷权限和重绑/截断差异复杂 | 不是现阶段跨平台最小方案，不以Node watch模拟完整日志 |
| D：Rust批量核验/压缩证明传输 | 可能减少JS与桥接成本；不减少必要IO，增加协议/取消/子进程所有权开销 | 只有剩余成本已测到该边界再做；禁止每查询spawnSync新进程的临时捷径 |
| E：放宽阈值、更多Worker、TTL/目录mtime有效缓存、只扩大批次 | 可能转移/掩盖成本，破坏现有边界或加重内存/排队 | 不采用；稳定语义组已有，真实依赖不会因固定文件批次消失 |

A保留所有现有历史反例的拒绝能力。原实现中重复检查不是天然不可动，但每次合并须证明
事实种类、原输入身份、owner/epoch、观察区间和发布顺序等价；无法证明就保留那条检查。
B必须明确“观察到的最新快照”与“未通知磁盘变更的发现延迟”，完整引用/重命名也不能冒充磁盘原子事务。
当前best-effort边界不等于已经批准B；不得在A实现中悄悄混入B。

## 8. 推荐设计的具体责任

1. 沿用DocumentStore权威输入和现有received/applied/compiler版本；补上派生状态的verifiedAt/changedAt语义，
   不再把任何root事件都当作所有派生值改变。内容/成员/解析namespace/配置/SDK分别有原owner代次。
2. ChangedSet携带created/removed/content/authority/namespace/config及不确定范围。用现有磁盘权威读核对内容，
   相同正文也可能是新inode/文档生命周期，不能只hash去重。先消费全部文件版本，再按证明排除无关组。
3. 角色/导出/全局摘要按已有摘要定义，不仅比较import字符串。只在摘要变化时传播反向依赖；
   inferred exports、ambient/augmentation、opaque、SDK/config等保守扩大。SCC先按整体更新，避免循环误剪枝。
4. 图/成员输入不变时保留不可变roles/根集合及派生结果；跨请求的派生快路径仍须有本请求成功的
   实际成员证明及原角色输入关联，外加overlay/config/resolver代次和必要加载事实，而非只看root revision。
   拒绝以“可变Map同对象”推定内容没变。
   组目录使用现有graph身份+membership revision+config epoch；按根索引一次分类，保留共享声明及重叠根多归属。
5. 现有SDK/Program中确有同原文/语法kind/选项的AST才可提取角色，取已有load provenance；
   生成TS投影不能默认等同原ETS，未入Program的成员仍需适当解析。保留角色而不另建AST/text owner。
6. 仅在既有request-input-validation中显式表示Native/witness/scope/overlay这几类关系，
   不建立任意回调依赖DSL或第二个全局协调器。登记typed facts与消费者依赖：source bytes、regular metadata、physical path、
   positive/negative candidate、directory namespace、SDK/config。观察与原事实分离；新事实加入实际最终read set。
7. 同阶段观察key含物理域/路径规则/事实类型/阶段/epoch；仅成功完成且仍同owner的生产者可借用。
   两个消费者分别与自己的旧事实比较；失败/取消/重置/预算不足走原raw fallback。实际load前后守卫不借用。
8. 最终计划分离“需要IO的叶子观察”和“纯粹组合子证明的消费者”。记录原始依赖偏序，
   不允许一个纯scope predicate隐式调用全成员扫描。需要更晚观察的边保留新观察屏障。
   把同Native两次终检归并，必须先证明末尾namespace/成员fence覆盖所有使用者及中途变更反例；
   无法迁移的owner保留旧路径，**三轮变两轮只是待证目标，不是预设正确或固定门禁**。
9. raw fence发现的静默变化也作为带来源的StaleFact进入既有输入协调：当前旧请求拒绝，
   后续通过真正的磁盘权威读取/目录重建形成新delta和代次，再消费新事实。不能在验证回调里
   把expected改成observed并继续发布旧答案；重试仍受原预算，已有未覆盖自动恢复必须列为功能缺口。
10. 请求捕获的文档生命周期、managed revision、配置和Worker generation在最终/发送前仍核对。
   编译器可变同步串行；已进入同步的取消服从既有有界同步/监督，旧结果只结算一次，旧世代不发布。
11. 可选派生数据以owner/当前拓扑拥有；reset/退休清理，依赖边变化移除反向边，快照借用结束解除引用。
    事实证明按0044保留，不用LRU丢资格；不新增默认RSS预算，不保留历史所有版本/路径/Stats对象。
12. 导航结果缓存目前不是优先项；将来若采用，必须绑定方法/精确位置/文档生命周期/依赖与配置资格，
    同内容重开也不复活旧请求或补全句柄。缓存失败/空答案同样有负命名空间依赖。

## 9. 复杂度、收益及未完成事项

用N=eligible成员，U=语义单元，R=根条目，E=边，F=实际证明事实，C=变更文件，A=受影响派生节点，P=Program文件。
组归属目前含N×各unit闭包根的包含判定；建议根索引的分类目标O(N log R +实际归属输出)，
但共享声明/大量重叠根仍有输出下界，单元闭包和SCC另计，不能统一承诺O(N)。
派生图冷构造仍需读取/分类N及E；稳定后的派生快路径以已验证代次检查为目标，编辑目标O(C+A及变化边)，
签名/global/config变化可能A接近全图；跨请求磁盘核验在A方案下仍可能O(F+N)。
内存增加反向边、角色/namespace索引和消费者关系，目标O(N+E+F)，不用每组再复制一份全工程Map。
P、F、N不能混为一谈。保持必需证明的回收，不宣称常量内存或仅RSS不下降就认定泄漏。

只证实本轮表示优化普通热中位改善9.53%；本方案其他收益均为**待测预期**，不把18ms定义算法当作可达端到端耗时。
500ms是允许波动的体验目标；不编造新的硬门禁，不延长现有产品/单用例截止，不排除失败样本。
本轮完成检索、已有profile复算和方案；未实施A/B、未重跑性能/全量检查、未做Windows/UI。
最小测量、各阶段依赖、功能/性能/资源矩阵及停止条件详见配套执行方案。
