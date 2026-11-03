# ADR 0043：语义工作集证据与分阶段准入

- 日期：2026-11-03。
- 状态：**Proposed；M1交付前取消清理已实证并有局部GREEN。M2工作集归因、策略、真实内存及产品验收未完成，不宣称 Accepted。**
- 审视基线：`298d65f5d7f796c347fe8be5c739e428066489d8`。该版本 ADR 最大编号为 0042，整合时再次检查编号。
- 执行：[本轮清单](../plans/2026-11-03-semantic-working-set-review.md)；状态只回写既有 [Feature Ledger](../plans/references-feature-ledger.md)。
- 本记录提出证据和分阶段决策合同，不授权改变已有效的初始化、驻留或压力默认策略。

## 问题与已知边界

用户报告运行内存仍高，但尚无对应构建、PID、工作区/SDK、操作序列及进程树内存曲线。
当前代码审视可解释工作集的可能组成，不能定位现场唯一根因，也不能把合法驻留直接判为泄漏。

1. [ADR0019](0019-stable-programs-and-request-inputs.md) 为 Accepted，但实现/性能验收仍 IN_PROGRESS。
   它明确选择当前 product/target 内全部已确定组的主动准备、稳定 LS/Program 复用和串行重型任务。
   公开初始化测试要求五组加完整根 owner 共六个 context，最后组首次查询不得再建 context。
   初始化的 `Infinity` 是遍历已发现组的策略，不是可直接改成 2 的错误容量。
2. 组的 Program/checker 准备之后，现路径还建立完整根 READY owner。
   组准备不是全局 READY；完整成员、SDK/标准库、依赖、配置/输入身份与最终 fence 仍须证明。
   多组共享依赖、完整根 Program 与组 Program 可以形成合法的重叠工作集。
3. [ADR0029](0029-opt-in-rss-memory-budget.md) 文档仍为 Proposed，但维护者已明确决定、授权实施并有验证收据。
   默认主语义 Worker 为 1、`maxResidentContexts:null`、`memoryBudgetBytes:null`。
   默认没有 RSS 驱逐/固定容量/空闲 TTL，不等于没有正常所有权清理，也不承诺总 RSS 封顶。
4. [ADR0038](0038-sdk-component-environment.md) 为 Accepted：每个 retained LS 可拥有独立 SDK-only export Program/checker。
   它与主 Program 共享 Registry 的 SDK 语法，不共享全部绑定状态；不增加 LS/Worker。
   这是已选择的正确性/补全设计成本，不是新增泄漏结论；ADR0038 未认证内存目标。
5. coordinator 的 `projectFiles` 是各 entry 的 membership 长度累计，不是唯一项目文件数，
   更不是所有实际 Program 的文件总数。主 Program 的文件统计也不能代替 SDK export Program 统计。
6. 当前 benchmark Registry probe 的采样会调用 `service.getProgram()`；其他 Program/checker 统计路径也可能触发同步。
   此类探针不能宣称无副作用，更不能把成功返回的主 Program 抽样当成全部所有权图。
7. [ADR0042](0042-bounded-catalog-streaming.md) 的 native catalog 改善是另一所有权域。
   native 子进程采样下降不能直接认证主 Node 进程、各 Worker isolate 或整体 LSP 内存下降。

## 拟议决定

执行顺序为既有状态审计 → 交付前取消清理候选的最小复现/修复 → 按需最小被动观测 → 有证据支持才提出策略修订。
不把长期 telemetry 框架作为小范围生命周期修复的前置条件；以下观测合同按实际缺口逐片补齐。

### 1. 先核对现场，再区分工作集、滞留与泄漏

复用现有 metrics、进程采样与 benchmark runner，不并行建立另一套“总内存”口径。
先固定构建/SDK/运行配置、进程树与操作阶段，明确观测的是启动峰、稳态、编辑临时峰，还是反复操作后的增长。
无现场证据时可继续合成夹具的所有权验证，但必须与用户现场诊断分开标记。

证据按以下层次分别报告，不用某一层代替其余层：

- 所有权：owner/LS/main Program/SDK export Program、请求 lease、Registry keyed lease 的取得、交付、保留、退役和释放。
- JS 堆统计：各 isolate 的 heapUsed/heapTotal，以及 external/arrayBuffers；heapTotal 是已分配堆容量，
  heapUsed 也可能含待 GC 的不可达对象，不证明精确 live 对象大小或一个 owner 的独占字节。
- 物理驻留：整进程树 RSS 按唯一 PID 计一次；同一 Node PID 下 Worker 不能再累加进程 RSS。
  不同 PID 的共享页仍可能重复计算，因此该汇总不是去重物理内存总量。PSS 可得时记录平台/来源，
  以比例分摊共享页；不可得时明确只报告 RSS 进程树汇总，不以 RSS 冒充或补造 PSS。
- native/OS：sidecar 独立进程、SQLite/映射页、分配器保留与共享页分别说明。
  不能用 `RSS - heapUsed` 精确归因某个 native 组件，也不要求 dispose 后 RSS 立即下降。

### 2. 优先确认清理缺陷，不能借机改驻留策略

该静态候选现已由真实 framed-stdio LSP 的最终原token门确认并最小修复，见[本片TDD](../tdd/2026-11-03-sdk-construction-cleanup.md)。
SDK export Program/checker完整返回后，`index.current()` 的原Host取消checkpoint抛错，落在 `buildProgram` catch之外。
LS的dispose已安装，但factory尚未交付、coordinator未注册新entry；基线SDK refs在串行清算屏障后仍为2，而正常pin基线为1。
这是被观察Registry键的所有权缺口；refs差1不证明整份SDK Program/checker滞留或RSS收益。
projectRefs0不是请求lease0的证明，交付前位置另由context-create未增加确认。

生产仅在initial warmup增加失败回滚，安全清理后保留原错误；清理失败保留AggregateError及原quarantine/Worker退役。
三新增例GREEN，九完整相关文件101/101、0fail/skip/cancel/todo，Node20check/build与diffcheck通过；2216/2216输入一致。
原始baseline20/21未知超时、错误前置夹具和无效握手失败均保留，不能用后续通过覆盖。
不销毁已交付的健康稳定owner，不改驻留/压力/取消deadline。此结果只认证该异常路径的局部资源结清，
不证明它解释用户正常工作流高内存、实际RSS下降、M2观测完成或完整产品通过。

### 3. 按需沿真实生命周期补齐无副作用收据

确有归因缺口时，只补当前切片缺失的信息，保留已存在的 `node-process` RSS、`semantic-worker-isolate` heap、worker/cache/job 指标。
新增收据至少能关联 PID、worker epoch/threadId、配置代次、context/LS 身份和准备阶段。

- owner role 区分 group、root-ready、scan、verifier；同一实体可以承担多个用途，不按角色重复计 owner。
- Program role 区分 main 与 sdk-export，记录实际已经返回的 Program 身份、根数、成员分类和文本 code units。
  当前已观察 Program 清单不是 live heap 中全部 Program 的清单；未观察、未交付或旧代残留不能据此排除。
  项目/SDK/stdlib/ambient/其他分类需给出不重叠计数规则或明确交集；root count 不冒充完整依赖闭包。
- LS/Program 身份变化与 create/dispose、请求 lease、Registry acquire/release 分开记。
  同一 SourceFile 被多个 owner 借用时，只能证明语法共享，不能据此声称绑定/Checker 共享。
- 初始化收据区分 SDK syntax prewarm、各组准备、完整根 READY 核验，以及成功、degraded、失败、取消。
  阶段内存差与时间相关，但不是该阶段或 owner 的独占内存分配证明。
- 计数必须包含 factory 尚未交付的对象及 SDK export 所有权边界，不能只从 coordinator 已注册 entry 反推全部资源。

观察只消费实际创建/返回/交付/释放边界的事实；不为采样额外调用 `getProgram()`、`getTypeChecker()`、prepare 或查询。
不改变既有同步先后、抛错/取消分类、初始化豁免和 deadline。若某路径无法被动观察，报告 unavailable，不偷偷构建。
对象身份使用弱引用映射或既有生命周期 token，不强持有 Program/SourceFile/源码/完整路径副本；活动计数随 owner 结清，历史输出有界。
观测 sink 失败或背压不得改变语义结果，不向 stdout 写非协议日志。
正常运行默认不启用重探针；trace/probe-on 用于归因，trace/probe-off 才用于产品性能对照。
强制 GC、heap snapshot 等诊断单列，不混入正常性能或当作生产清理策略。

### 4. 取得证据后，分开决定优化候选

以下都是后续候选，不在本 ADR 或“谨慎推进”下直接改默认：

| 候选 | 必须另行说明的决策与证明 |
| --- | --- |
| 延迟冷组准备 | 明确修订 ADR0019 的全组主动准备、首次准备/首查代价；保留完整根 owner 时可能仅降启动峰，访问全部组后驻留可恢复原量 |
| 有限交互热集合 | 明确修订 ADR0019/0029 的保留策略；真实依据决定容量、回收条件及 lease 保护，不先拍定组数、TTL 或默认 MB |
| SDK export 数据复用 | 明确审视并修订 ADR0038 的 per-LS 语义与所有权合同；先证明兼容身份、输入证明和 compiler-native completion/details/actions 等价，不跨 owner 共享可变 checker/binder |
| 迁移完整根 READY owner | 单独迁移全局输入/覆盖证明及消费者，不能作为延迟组准备的附带删除；组 READY 布尔值与局部位置并集均不够 |

新候选只在完整语义正确性和完整工作流成本都可解释后讨论采用。
不以 hot-only 命中率、较小 root 数、单个 RSS 数字或 native catalog 结果决定默认策略。
延迟准备可能把启动成本转移到首查，有限驻留可能造成切组重建，SDK 数据缓存可能新增另一份证明/内存，均须计入成本。

## 不可削弱的合同

- 官方编译器保持最终权威；真实模块/target/依赖闭包及所有合法 ambient 声明不因内存目标被裁剪，不能拆伪项目。
- 引用覆盖未打开/未预热组、反向依赖、别名/重导出、继承、ambient、overlay；rename 保留官方语义及完整事务编辑。
  不能将部分结果、组内结果并集或“已准备部分全部完成”标为完整成功。
- SDK/compiler/product/target/配置身份、负解析、物理边界、文档权威、输入代次和最终联合 freshness fence 保留。
  缓存命中、旧 stat、watcher 或 SDK 语法共享都不替代当前证明。
- 初始化正常结束（含 degraded/partial）消费初次豁免；恢复不重新豁免。
  取消结清请求 lease 不意味着必须销毁健康稳定组。旧 owner 有活动 lease 时不越过它并行重建消费者。
- 遵循 [ADR0031](0031-cancelled-read-compiler-synchronization.md)：旧响应立即失去发布资格，
  已进入的可变 compiler 同步按原绝对截止清算；不以省内存为由立即强杀、不重置 deadline/恢复预算。
- 正常配置/SDK替换、失败/取消、owner/session dispose、临时 verifier job 和既有有界 memo 的清理仍独立生效。
- 不更改 ADR0029 默认 null、ADR0042 native 发布/校验合同、455 豁免及历史失败。
  500ms 按 ADR0007 的后续修订是体验目标，不新设硬线或用旧历史 FAIL 自动否定本轮功能。

## 验证与阶段准入

所有实现遵循 AGENTS：公开接口先 RED，记录父版本和真实命令；一片一 GREEN。
LSP 采用真实子进程 Content-Length stdio。新源码/测试/脚本不超过 500 物理行；修改超限旧文件不增行并提取内聚职责。
已存在的测试只作 characterization 候选，不把“读过测试”写成 PASS。

1. 观测片：完整 off/on payload、READY identity/coverage、Program/LS 创建及 SDK 语法复用一致；
   五组加根 owner、最后组首次复用仍成立；status/被动采样不创建编译对象；sink 失败不改变结果。
2. 生命周期片：初始化取消/失败、交付前后、SDK/target切换、清理失败与恢复各自证明；
   没有多终态、旧 READY 或残留借用。活动稳定组的合法保留不被错误要求每请求归零。
3. 策略实验：分开测单模块大闭包与多组共享依赖；固定同源同 SDK/配置/运行时，保留全部结果与失败。
   至少分别报告 cold、first、unseen-group、hot、edit、group-switch、close/reopen、configuration/recovery。
   完整引用/rename、SDK首次自动导入、取消和长期反复切组要同时看正确性、延迟分布、峰值、稳态与重建计数。
4. 产品对照正常 runs 与 probe runs 分离，预先固定顺序/样本/观察窗口并保留原始时间曲线。
   单对/小样本只报告观察值；不靠有利重跑覆盖失败，不用受控 RSS 当真实内存压测。
5. 最终候选重新运行相关 focused/full gates 与 `pnpm check:fast`；发布后若授权，再核对目标 HEAD 完整 CI。
   scoped GREEN、机制成立、资源观察、真实项目/SDK、Windows/UI、最终产品资格分别标状态。
   本草案不新增 L08 之外的前置最终产品门禁，也不凭文档批准提升现有毕业状态。

## 当前证据缺口与退出状态

**M1已有确定性RED→最小回滚GREEN及九完整文件101/101局部回归；M2/M3、真实内存与产品准入未完成。**
缺用户现场的进程树/PID和版本、实际SDK/选定target、复现序列及峰值/稳态RSS/heap/PSS来源；
缺整个主/附属Program工作集的被动归因与同输入trace-off对照。完整check:fast/目标HEAD CI未跑；本地缺WASM。
因此不能写“用户现场泄漏已定位”“已节省内存”“整体方案已验证”或“默认应改为按需”。

M1只退出交付前取消清理小片；当前默认不变，已确认缺陷、合法驻留与仍未知现场原因必须继续分开。
证据不足时停止策略升级，给出缺失条件；证据支持的下一候选另立或明确修订对应ADR后再实施。

## 固定版本核对入口

- [初始化五组加根 owner 公开断言](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/tests/semantic/project-initialization.test.mjs#L138-L171)。
- [初始化准备链](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/project-readiness.ts)、[稳定组发现/准备](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/core/types/semantic-groups.ts)。
- [coordinator 注册/统计](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/coordinator/semantic-coordinator.ts)。
- [SDK export LS 交付边界](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/backends/ohos-typescript/sdk-export-language-service.ts)、[SDK export Program](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/backends/ohos-typescript/sdk-export-index.ts)。

- [既有进程/isolate metrics](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/coordinator/metrics.ts)、[现有 Registry probe 及其采样边界](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/src/semantic/backends/ohos-typescript/registry-pool.ts)。
