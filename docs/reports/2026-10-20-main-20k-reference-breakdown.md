> 公开审阅副本：保留数值、方法、失败与限制；原始协议、完整响应/编辑、源码快照及归档不随本副本发布。原件和完整 SHA 清单仅在本地封存，见[证据保留说明](local-performance-evidence.md)。
> 本地完整报告 SHA256：`e2162bb1f6f05bce9563f6b3f469420f6200ecaa8c7cfc0d9fd1a18be286458c`。

**Mac／主分支 740a771：2 万文件编辑后首次查引用耗时诊断（2026-10-20）**

主要瓶颈是全项目 Program 同步时的快照恢复、文件读取和重复输入核验，而不是返回四个引用的位置搜索。新增诊断复现了弱快照命中与丢失两条路径：慢路径重新读取 19616 个未编辑源码，仍复用 19999 个项目 AST 和全部 255 个 SDK AST。另一放大点是单阶段文件身份缓存上限 8192，2 万文件时多轮校验无法充分共享元数据结果。

原始普通计时没有内部阶段日志，**不能把其 7755.929ms 精确分摊为以下诊断阶段，也不能断言原始第二轮 4220.867ms 的原因已经逐轮证实**。本文给出同版本、同夹具、同顺序的独立诊断，以及能够支持和不能支持的结论。本轮未修改产品代码、未推送或发布。

**1. 查询前到底做了什么**

使用独立的20000文件隔离目录；对照目录为2048文件。查询文件均为 `app/src/main/ets/Target.ts`。

13 步顺序固定：磁盘首次补全、磁盘重复补全、磁盘定义、首次打开补全、打开热态重复补全、打开热态定义、第一次关闭重开补全、定义、第二次关闭重开补全、定义、重命名、首次查引用、重复查引用。初始化结束后才开始这些操作；此时为 degraded，而非 READY。每轮新进程、新原生索引缓存；操作之间串行，无主动等待。文件系统页缓存不受控。

勘误：本报告按已封存 session 修正前六步的文字顺序；归档内 `REPORT.md` 保留原始字节，脚本、原始数据及归档 SHA 均未变。

第 11 步是 `textDocument/rename`，在文档 v3、LSP UTF-16 零基位置(3,40)，把成员 `ScaleTarget.value` 改为 `probe`。服务端只返回 WorkspaceEdit。客户端在内存应用四处编辑，随后发送全文 `didChange`，文档变为 v4；**磁盘文件未改动**。四个替换范围为：

| 零基行 | 起止字符（结束不含） | 输入 |
|---|---|---|
| 2 | 2–7 | `value` → `probe` |
| 3 | 39–44 | `value` → `probe` |
| 5 | 14–19 | `value` → `probe` |
| 6 | 14–19 | `value` → `probe` |

编辑前后均为314字节；目标成员及四处范围见上表，原本同名的局部变量未被重命名。完整源码仅本地保留。

完整源码仅在本地封存，见证据保留说明。

第 12 步查成员 `ScaleTarget.probe`，仍在LSP零基位置(3,40)（编辑器显示第 4 行、第 41 列），包含声明，返回上表四个位置。它也是本会话的**首次 references 请求**，并没有一个此前的 references 答案可供复用。第 13 步立即重复完全相同的查询，文档仍为 v4。

原始 2 万文件第一轮的客户端单调时钟（ms）明确分开了三个 RPC：

| 边界 | 时间／耗时 |
|---|---:|
| rename 请求开始 → 响应解码结束 | 32402.171360 → 38064.269827，5662.098467ms |
| 客户端发出 v4 didChange | 38065.615536 |
| 首次 references 开始 → 响应解码结束 | 38066.534479 → 45822.463126，7755.928647ms |
| 重复 references 开始 → 响应解码结束 | 45836.443664 → 45838.135554，1.691890ms |

计时从 `LspSession.request()` 调用前的 `performance.now()` 开始，到完整 Content-Length 响应解码并 await 返回结束。包含传输、服务端等待、Worker、输入核验和发布；不包含编辑器绘制。客户端应用 WorkspaceEdit 和发 didChange 均在首次 references 计时前；异步服务端编辑处理可能落入其等待范围。**7755.929ms 不包含前面 5662.098ms 的 rename RPC**，但重命名会影响随后缓存/Program 的前置状态，两者并非统计独立实验。

独立 `spans-3b` 的跨进程 hrtime 表明：客户端 references 开始到 Worker 收到为 4.709ms，Worker 发响应到客户端结束为 2.045ms；其中 v4 mutation 应用外层仅 0.312ms，发生在 RPC 开始后约 1ms，Worker 请求前已完成。该 0.312ms 已包含在前述边界内，不能再次相加。现有 trace 的诊断静默等待约 0.4ms，references 队列约 0.4–0.9ms，都不支持“排队造成几秒等待”。

原始 source SHA256：`88694c59f29dee98d5d6a74a11d6197bcf39c0fc07c2be58dbc17ca143a38a48`；v4：`7e7ac762b24c765526d9ca50fff8feb774b027997f72c1587826f28c401b4135`。原始 report、responses、client-messages、document-events、snapshots 均保留。

**2. 版本、规模和诊断方法**

固定代码 `740a771b868f5cf60831906fac1b5c3a4a52c163`，复用先前封存的 source/dist；Node `v20.19.5`，ohos-typescript `4.9.5-r10`，Mac Intel／16GiB／macOS 26.6.2（25G83）。SDK：本地固定声明包，1670 个输入文件重新核验，全部未变。原生索引 SHA256：`8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。默认压力值 4096MiB，初始化不受该值限制；沿用原实验的 6GiB 进程树 RSS／系统 critical 外部中止条件。

| 规模口径 | 2048 档 | 20000 档 |
|---|---:|---:|
| 项目源码数 | 2048 | 20000 |
| 全部夹具文件 | 2053 | 20005 |
| 固定 app 模块源码 | 19 | 19 |
| 无 import 的独立 noise 源码 | 2029 | 19981 |
| Target 传递项目依赖闭包（含自身） | 18 | 18 |
| 闭包最大边深度／全项目相对 import 边数 | 17／17 | 17／17 |
| 返回引用数 | 4 | 4 |
| 此次完整引用 Program 的项目文件 | 2048 | 20000 |
| SDK／其他声明文件 | 255／52 | 255／52 |
| Program 总 SourceFile／根文件 | 2355／2049 | 20307／20001 |

noise 在业务依赖图中无关，**但在此路径中全部作为 Program 项目根参与完整性保证**，不是仅堆在目录里的未入 Program 文件。进入 Program 也不代表每个文件都做了同等深度的类型检查。此前交互 Program 只有 19 个项目文件；rename 与后续完整引用使用初始化保留的全项目 owner。不能把 18 个有效依赖、20000 个 Program 文件和 255 个共享 SDK 文件混为一谈。

本轮新增 6 次现有 trace、6 次细粒度 spans、2 次 spans＋CPU 采样，全部串行。trace 的顺序为 2048/20000、20000/2048、2048/20000。spans 分为旧探针 v2 和扩展读文件计数 v3；CPU 使用 v4，记录弱快照缺失类别与局部定义边界。所有插桩通过 preload 在内存变换已封存 bundle，未写产品文件。

诊断工具的嵌套计时、重复 IO 与唯一文件数、字节计数及异常清理有 RED/GREEN 自测。保留 4 次无效工具尝试：`2048 spans-1` 的模块匹配失败；两个 `spans-1b` 因探针误把无 id mutation ack 当请求响应，改变了 context 生命周期；`20000 spans-3` 的编译符号匹配失败。它们全部保留，但不用于产品路径结论。修正后 14 次有效运行均走与现有 trace 一致的 retained owner 路径；182/182 个完整公开操作结果与原始基线一致（仅归一化夹具前缀与不透明 completion.data）。工具退出码 2 表示存在超过 500ms 的操作，不是全部达标。

所有有效查询仍受初始化 degraded/2307、缺少 `@ohos.filemanagement.userFileManager` 的限制；不能将本结果推广为 SDK 完整 READY 环境的结论。真实 Photos 源码未改动。

**3. 普通计时与插桩计时分别看**

| 模式／文件数 | 首次查引用三轮（ms） | 中位数／最大（ms） | 重复命中中位数／最大（ms） |
|---|---|---:|---:|
| 原始普通／2048 | 1020.279，554.699，592.259 | 592.259／1020.279 | 1.431／1.639 |
| 原始普通／20000 | 7755.929，4220.867，7896.150 | 7755.929／7896.150 | 1.558／1.692 |
| 新增现有 trace／2048 | 1036.832，1052.034，1141.234 | 1052.034／1141.234 | 1.566／1.652 |
| 新增现有 trace／20000 | 8020.838，8119.206，7882.405 | 8020.838／8119.206 | 1.561／1.687 |
| 细粒度 spans／2048 | 1213.660，729.663，735.040 | 735.040／1213.660 | 1.390／1.547 |
| 细粒度 spans／20000 | 5584.827，10620.434，10424.989 | 10424.989／10620.434 | 1.426／1.678 |

另做 CPU 采样各一轮：2048 为 1209.510ms，20000 为 11560.231ms。它们不是新的普通时延样本。inspector 启动/采样和逐 IO 计数有明显开销：20k profile 中 `recordIO` 自身采样约 1009.8ms，inspector `dispatch` 约 644.4ms；2048 的 dispatch 约 461.1ms。探针也会改变分配与 GC 时机，可能改变弱缓存命中分支，因此不能机械减去一个固定“插桩开销”。新增 trace 中位数比原始普通中位数高约 3.4%（20k）与 77.6%（2048），这不是仅由 trace 导致的受控因果估计。

先前 memory 模式有每操作后主动等待和堆观察器：20k 首次引用 3997–4531ms，createProgram 1069–1255ms；不与上述无等待结果合并。它支持存在较快路径，不能用来按比例拆解原始 7756ms。

**4. 轻量 trace 的主要时间组成**

代表运行为 `main-total-20000-main-740a771-trace-trace-1`，RPC **8020.838ms**。以下主表只相加互不包含的时段；compiler 内部拆项替代其父项，不同时累加父子。

| 不重复计算的组成 | ms | RPC 占比 | 依据 |
|---|---:|---:|---|
| 文档／依赖闭包准备 | 523.096 | 6.52% | document-prepare.complete |
| 已有 engine prepare | 133.257 | 1.66% | newEntry:false，resetReason:null |
| compiler 内 createProgram | 5038.431 | 62.82% | collector；独立实际构建探针验证该请求 1 次 |
| compiler 内 findReferences | 45.390 | 0.57% | 1 次 find-references.complete；发生在该 build 之后 |
| compiler 内其余部分 | 1217.240 | 15.18% | 6301.062 − 5038.431 − 45.390；不是“纯引用搜索” |
| 上述时段之外的全部时间 | 1063.423 | 13.26% | RPC 减去文档准备、engine prepare、compiler 总时长 |
| 合计 | 8020.838 | 100%（舍入） | 不含之前 rename |

最后 1063.423ms 包括 trace 统计、最终输入校验、排队与发布。事件墙钟给出 compiler-query.complete → semantic.references.complete 约 375ms，后者 → context.cost 约 670ms；这些是毫秒分辨率的辅助边界，**不另加入主表**，也不称为“context 驱逐耗时”。细粒度插桩确认前者主要是 `programFileStats()`，后者主要是最终输入 union。统计 getter 只在启用相应 trace 时执行，不能把这 375ms 直接算进原始无 trace 的 7756ms。

同条件 trace 第一轮的 2048 对照：文档准备 285.606ms，prepare 19.165ms，compiler 570.393ms，其中 build 489.768ms、findReferences 13.763ms；统计边界约 45ms，后续边界约 107ms，总 RPC 1036.832ms。20k 的 build、输入观察和最终核验显著放大；引用搜索只增加约 32ms。不能用原始 592ms 的中位数与某一轮 20k 插桩分项直接相减。

文档准备子事件中，20k 成员路径集合访问只约 0.028ms，预加载约 11.38ms（新增 238 个文档，总计 256）；其余主要在 dependency-closure。该阶段会走 18 次相对依赖解析。目录枚举与 package resolver 的各内部子阶段未完整独立计时，不能把整个 closure 时间称为“扫描 2 万文件”或“SDK 解析”。CPU 诊断在 import/export 正则上有约 275ms 的独占采样，属于该诊断运行，未证明它造成原始三轮波动。

**5. 细粒度诊断：重复工作发生在哪里**

以 `20000 spans-3b` 的 **10620.434ms** 为例。此表来自真实嵌套 span，父子相减后只保留一次；IO 与 leaf 计时都嵌在这些行内，不可再相加。

| 互斥组成 | ms | 占该诊断 RPC |
|---|---:|---:|
| 文档准备 | 539.36 | 5.08% |
| engine prepare（现有 trace） | 138.24 | 1.30% |
| createProgram | 6794.32 | 63.97% |
| queryTypeScriptReferences 的其余部分（含 findReferences 44.58ms） | 217.97 | 2.05% |
| captureCurrentProgram／建立并准入引用证明 | 1588.54 | 14.96% |
| programFileStats | 374.03 | 3.52% |
| Workspace 原始源码 fence | 20.67 | 0.19% |
| 独立 final-input-union | 927.13 | 8.73% |
| trace/validation wrapper 的排他余量 | 1.03 | 0.01% |
| 其余未分配（含前后传输、队列与发布） | 19.02 | 0.18% |

1588.54ms 内，`observe()` 为 972.35ms；`admitInputs()` 为 616.06ms，其中 `diskInputsCurrent()` 575.42ms。最终 union 的 927.13ms 内，另一次 `diskInputsCurrent()` 893.30ms。二者分属查询阶段与发布阶段，各自有新鲜度职责，不能直接删去最后一次校验。

CPU 运行另测得局部 `getDefinitionAtPosition` 0.953ms，初次 getProgram 7229.944ms（含 7183.457ms build），末尾 getProgram 0.034ms。它们不属于上表那轮，不能拼接为一个 10620ms 的剖面。

| 实际计数 | 2048 spans-3b | 20000 spans-3b |
|---|---:|---:|
| 该请求实际 createProgram 调用 | 1 | 1 |
| 复用旧 Program 的 SourceFile／新观察到 | 2354／1 | 20306／1 |
| 其中项目 AST 复用／SDK AST 复用 | 2047／255 | 19999／255 |
| parseSourceFile 入口：项目／SDK | 1／0 | 1／0 |
| build 内 readDiskSource：次数／唯一文件 | 0／0 | 19616／19616 |
| 发布 fence 的 readDiskSource：次数／唯一文件 | 255／255 | 255／255 |
| 项目 openSync／readSync 次数 | 255／510 | 19871／39742 |
| readSync 实际返回字节 | 30520 | 501304 |
| 项目 diskIdentity 次数（不是唯一文件数） | 4094 | 83077 |
| SDK diskIdentity 次数 | 510 | 1020 |
| index 候选选择事件／验证 batch 事件 | 0／0 | 0／0 |

readSync 每个小文件有一次内容读取及一次 EOF 读取，不能把 39742 次 syscall 当作 39742 个文件。20k 全部打开的 19871 个项目文件在 build 与 fence 两个不相交文件集合中，各打开一次；实际只读取约 0.48MiB。build 内读取 19616 个文件用 3092.95ms，包括打开、前后身份核验、读取、解码和边界检查；其中真正 readSync 只 132.96ms、openSync 694.03ms。这些都是 build 的子区间，不能加到 6794.32ms 上。

20k 项目 `diskIdentity` 的 83077 次分布：build 39360，observe 11859，admit 11859，final union 19999。常规文件的每次调用包含 lstat、realpath.native、stat。仅 observe/admit 对超出缓存容量的同一批约 1.19 万文件就重复执行了两轮元数据获取；2048 没有触发 8192 上限溢出。SDK 文件也与项目文件竞争该阶段缓存容量。

较快的 `20000 spans-2` 为 5584.827ms，build 1565.35ms，build 内 readDiskSource **0 次**，lazy.compilerOwned 调用 19616 次；仅 fence 读 255 次。它仍有 74809 次项目 diskIdentity，说明去掉内容重读后，输入校验仍是独立的大成本。该探针 v2 尚未统计 open/read syscall，不能把缺少该字段写成 syscall 为 0。

**6. 实际调用链与没有发生的步骤**

代码定位均对应被测主分支内容（本地根目录相关源码与封存版本一致）：

| 步骤 | 关键文件／函数 | 本次证据 |
|---|---|---|
| 编辑同步、结果缓存失效 | `src/semantic/semantic-worker-proxy.ts`：`sync`、`#mutate`（约 469 行）；`reference-result-cache.ts:68`：`invalidateRoot` | mutation revision 6、v4；失效前 cache entries=0 |
| 缓存与路由 | `src/semantic/references/reference-cache-admission.ts`：`cachedReferenceResult`；`reference-query-router.ts:25`：`routeReferenceQuery` | 首次 miss；重复 hit 在主线程直接返回 |
| 排队与编辑应用 | `src/semantic/semantic-worker-runtime.ts:100/211/247`：消息串行、`applyMutation`、`answerRequest` | Worker 队列 <1ms；编辑应用约 0.3ms |
| 完整 owner 准备 | `src/semantic/legacy-semantic-engine.ts:373`；`reference-anchor-preparation.ts:13`：`prepareReferenceSearchWorkspace` | retainedOnly 路径先尝试；member paths=N，prepared docs=256 |
| 依赖解析／成员集合 | `src/core/workspace/document-store.ts`：`collectDependencyClosure`（约 1370 行）、`resolveRelativeImports:1634`、`resolveImportPath:1676` | 18 个闭包来源；没有把 closure 计时全部归为 SDK 或全项目目录扫描 |
| 保留 Program 恢复 | `src/core/types/type-engine.ts:361`：`retainedReferences`；`resident-context-lease.ts`：`queryRetainedReferenceContext` | proof 拒绝 inputs-changed，随后 prepare 已有 entry；未销毁/新建 owner |
| 请求级验证边界 | `type-workspace-entry.ts:72`：`runPreparedSemanticQuery`；`typescript-query-module-resolution.ts`；`src/project/request-input-validation.ts` | 查询内正向共享；发布前清空身份缓存并独立复查 |
| Program 同步和引用 | `typescript-language-service.ts:1320`；`typescript-reference-query.ts:28`：`queryTypeScriptReferences` | getProgram → 定义定位 → findReferences → 映射/去重/覆盖检查 |
| 快照恢复、读取、身份 | `typescript-lazy-snapshots.ts:53/111`；`compiler-source-snapshots.ts`；`src/core/workspace/workspace-disk-source.ts:14`；`src/project/source-file-identity.ts:3` | 弱记录缺失后经过 token/read/身份前后检查；AST 与读取不是同一缓存 |
| 引用证明与最终核验 | `typescript-resident-reference-state.ts:72/133/199`：`captureCurrentProgram`、`observe`、`admitInputs`、`diskInputsCurrent`；`typescript-workspace-source-fence.ts:9` | 检查所有实际输入，查询及 final union 的独立元数据扫描 |
| 观测开销 | `compiler-query-timing.ts:98`：`traceReferenceQuery`；`typescript-language-service.ts:356`：`programFileStats` | trace getter 调用 getProgram 并遍历 SourceFile；在 callback 计时外 |
| 发布和结果缓存 | `reference-query-router.ts:59`：`publishReferenceResult` | 最终响应 4 个位置，存储两种 includeDeclaration 结果变体 |

本次 retained owner 恢复后直接返回完整结果，因此**没有外部索引候选选择、隔离 SDK 锚点 Worker 启动、1024 文件分批验证或多批合并**。日志中这些事件都为 0；不能把这 8 秒归因于几百批。局部定义定位、四个结果的映射/排序确实发生，但映射/排序本身未独立计时；包含在 query 的排他余量中。全项目目录枚举、原生索引进程内部时间、操作系统磁盘等待以及原始普通轮的 GC 暂停均未完整测量。

**7. 编辑失效什么，为什么重复仅 1.56ms**

`ReferenceResultCache` 的 key 包括根 generation、URI、文档版本、文本 SHA、位置和 includeDeclaration；`#mutate` 会对已知相关根 invalidateRoot。本例编辑时缓存原本为空，所以“删掉了上一次引用答案”不是慢的解释。编辑改变 overlay 内容/版本与输入 signature，使 resident proof 报 `inputs-changed`，不能继续证明旧 Program 对新查询完整有效。准备阶段保留同一个 engine/LanguageService；同步一次新 Program，更新被编辑文件，重建/核验引用证明。

重复请求则命中的是**最终结果缓存**。打开文档路径的 `cachedReferenceResult` 直接发布已存结果，不再发 references 给 Worker，不运行 Program 同步、19k 快照恢复、搜索或完整输入 union。它没有测量“保留 Program 再搜索一次”的耗时。磁盘文档缓存还有独立 readiness proof 合约，不能推广成所有磁盘查询都只要 1.56ms。

本次成功的 AST/SDK 复用是真实的：20k 请求只在 parseSourceFile 入口解析一次修改文件，255 个 SDK AST 全部复用。但懒加载强缓存只有 128 个，另用 WeakRef／WeakMap 记录快照。CPU 诊断确认 19616 次缺失属于 **owned-snapshot-collected**，不是 admission token mismatch；随后读取未改源码取得快照，官方 DocumentRegistry 仍复用了已有 AST。因此，编辑并未要求重读全部源码；未改文件的弱快照存活/归属没有被可靠维持，造成额外恢复成本。该弱记录为何未与当前 Program 实际持有的快照保持一致，尚需后续修复时进一步验证身份关系。

必须重做：处理 v4 overlay、使查询对新内容生效、更新受影响的 Program 状态/语义事实、重新产生引用答案，并在发布前证明使用的输入仍有效。不是正确性必然要求的工作：未改文件快照丢失后的重读、同一阶段对同一物理文件重复 stat/realpath、可从已有 Program 获取却再次触发 getter/全量统计的观测工作。独立发布 fence 不能因耗时就直接去掉。

**8. 规模增长与 4.2–7.9 秒波动能证明到哪一步**

原始普通中位数增长约 13.10 倍，项目文件数增长约 9.77 倍；新 trace 中位数增长约 7.62 倍。只有两个规模、不同缓存分支及 degraded 环境，不能据此宣称 O(N²) 或固定超线性。源码中有按 Program roots/SourceFiles、observed disk identities、最终 input union 遍历的循环，给出多次随 N 增长的工作量依据；8192 容量阈值和弱缓存回收又带来分支成本变化。

三条有证据的结论：

- 相同目标、相同 18 文件闭包、相同 4 个引用，N 个文件进入 Program 后，Program 同步与完整输入核验仍随规模增加；共享 SDK 数量没变，也没发生 SDK 全量重解析。
- 补测的慢/快路径分别出现 build 内 19616/0 次源码读取，build 约 6.79/1.57 秒（插桩）；CPU 诊断将慢路径的弱记录缺失进一步定位为回收。这个机制能造成明显波动。
- 原始普通三轮没有逐文件读数、弱快照命中、GC、CPU/IO 等证据。不能逐轮确认 4220ms 那轮就是全部弱命中，也不能断言 7756/7896ms 差异来自 GC、系统压力、磁盘或调度。CPU profile 的 `(garbage collector)` 独占采样约 336ms 仅属于 11560ms 诊断轮，不是原始几秒差值的解释。PerformanceObserver 的查询期 GC 事件未及时落盘，分析中的空列表不代表没有 GC；精确暂停总时长未测。

**9. 优化优先级（本轮只诊断）**

| 优先级 | 建议与依据 | 预期收益及边界 |
|---|---|---|
| P0 | 验证并修正 project lazy cache 与当前 compiler-owned snapshot/SourceFile 的身份关联；弱记录缺失时优先利用实际持有的不可变快照/文本，并保留 token 与当前磁盘身份验证 | 目标消除未改文件的 19616 次 open、39232 次 read 和恢复开销；不需要重新做“SDK 永久解析缓存”。不能承诺直接降至 500ms |
| P0 | 让单次查询的正向身份事实覆盖实际工作集，避免 8192 个条目后退化为重复 syscall；以字节/请求寿命控制临时 metadata，查询与 final union 仍使用独立新鲜扫描 | observe/admit 各约 11859 次溢出元数据访问是明确优化空间；必须保持磁盘编辑、路径身份变化、SDK/config 变化的拒绝测试 |
| P1 | 合并同阶段的重复 input proof 遍历与路径规范化，保留独立最终 fence；避免只提升某个条目上限掩盖多轮全量检查 | 即使不重读源码，20k 快路径还有 74809 次项目 diskIdentity，降本后仍需复测 |
| P1 | trace 从已经取得的 Program 取统计，避免观测 getter 的再次同步与无条件全量统计 | 20k trace 中约 370–375ms，主要改善诊断可比性；不能当作无 trace 原始时延的同额收益 |
| P2 | 按稳定语义组／真实依赖边界保留 owner 与覆盖证明，进一步缩小编辑后必需重新证明的范围；完整引用查询仍须有范围完整性依据 | 当前噪声与目标无依赖却全入引用 Program，是后续规模成本来源；本轮未验证新的分组方案，不能跳过完整性保障 |

先后顺序依据可测的重复读取和元数据次数。结果映射/四条结果排序、排队及单次 findReferences 都不应成为首要优化对象。500ms 目标仍未达到，规模增长成本和 READY SDK 环境验证仍未闭环。

**10. 可复现证据**

本轮本地实验：`.bench/main-20k-breakdown-20261020/`。每个 run 下保存 report、完整响应、客户端消息、编辑事件、原始 LSP stdout/stderr、server.log、RSS、输入哈希；有效详细诊断另含 `probe-*-request.json` 与 CPU profile。汇总：`analysis/timings.json`、`timings.csv`、`statistics.json`、`diagnostics.json`、`functional-comparisons.json`；CPU 独占采样：`cpu-analysis.json`；失败尝试：`analysis/attempts.json`。

本地封存包及摘要（不随本副本发布），包括复现说明、manifest、诊断脚本、逐次原始结果与上述汇总。复现说明及 seal 原件均仅在本地保留。首次实验的 sealed archive 保持原 SHA256 `ce4e927c618c8916168405318463b6aca37ee619e8eab367ac8e4d745701e516`，未覆盖旧数据。新归档需与原归档配套恢复原 runtime/夹具/SDK 路径；没有把 SDK 或第三方依赖另行复制发布。

基础复现方法与原始命令保留本地（Node版本固定；标签必须未使用）：

完整复现命令仅在本地封存，见证据保留说明。

严格串行执行，勿复用已存在输出目录。本轮有效新运行为 **14 次／182 个操作**；另有 **4 次工具失败或受污染尝试**。所有 18 个启动的实验均已结束，进程表核验无残留语言服务器/索引进程；逐次输入与 runtime 未改变，SDK 1670 文件哈希未变。没有根据失败样本宣称性能通过。
