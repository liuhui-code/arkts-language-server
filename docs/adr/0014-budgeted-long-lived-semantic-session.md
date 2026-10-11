# ADR 0014: 预算约束下的长驻 ArkTS Language Service

日期：2026-10-06。状态：**Accepted for experimental implementation；未获生产准入**。

2026-10-11 当前默认策略由[ADR 0015](0015-default-resident-optimization-policy.md)
更新：维护者授权六项组合默认开启，在新完整回归通过后先通过PR合入main。
下方default-off及等待L08的措辞保留为历史决定，不改写原失败数据或
宣称L08最终验收通过。

2026-10-08 用户确认更新：最终产品验证统一放在 L08，最终目标不阻塞
L01–L07 实现。下方 Context 保留当时观察与准入判定；旧的 L01/L02
阻塞措辞由本次 Decision 和当前执行计划的阶段继续规则替代。

2026-10-09 [L03 完成审计](../reports/2026-10-09-resident-l03-completion-audit.md)
A～E PASS，预算/准入/成本回收与恢复阶段实施及校准完成；完整
check:fast 1439/1439 PASS，终态身份一致。实验仍默认关闭，自动 Worker
替换不纳入当前选定配置；本 ADR 的实验资格不等于 L08 产品或生产准入。

同日 [L04 完成审计](../reports/2026-10-09-resident-l04-completion-audit.md)
A～E PASS，选定 L03 政策下的 references 接线与校准完成；当前完整
check:fast 1449/1449 PASS、终态身份一致。两种声明策略的八轮真实
ON/OFF 对照共 52 项 exact，正常诊断一致，首次新符号实际复用完整
同一 Program；更慢准备/冷恢复与更高峰值如实保留。R-09 仍默认关闭，
L05–L07 自身合同继续，最终性能、内存及 ready 门禁统一留在 L08。

随后同日 [L05 完成审计](../reports/2026-10-09-resident-l05-completion-audit.md)
A～E PASS、阶段DONE：23项公开implementation合同、联合132/132和完整
check:fast1467/1467，源码/产物/测试/工具及工程/SDK等终态身份一致。
四个当前固定构建真实进程22/22 exact、两对最新诊断一致，R-09 OFF下
独立完整Program复用及配置新鲜度保护成立；ON的38个同内容晋升保持generation。
正常1024MiB/原滞回/lease保留，实验默认关闭；未查628/677ms、冷恢复约13s
及更高恢复峰值只作L08风险，不改变实验资格为生产准入。L06–L07继续。

2026-10-10 [L06完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS、阶段DONE：19交互公开case、联合252/252、当前完整1492/1492
及冻结终态身份一致；16冷基线、四真实进程62/62，完整payload/最新诊断
配对相同，实际未查Program复用。正常1024MiB/原滞回/lease、完整SDK/
安全路径和默认关闭保持；四轮whole失败及目录容量兼容RED不重写。
慢准备/恢复、>500ms和trace软预算峰值交L08。按用户授权接续L07至完成，
不等L08产品毕业、不改变现行生产准入。

当前[L07审计](../reports/2026-10-10-resident-l07-completion-audit.md)A–E
直接证据通过：25公开编辑/调用case及当前62完整真实请求，输入/诊断/
完整payload一致，真实11源同内容晋升保持generation/Program，OFF重建。
319测试/工具及全部输入冻结，全新完整1511/1511、根退出0、终态身份
全部相同；L07阶段DONE。正常1024MiB/
原滞回/lease、默认关闭和原完整安全fallback保持，资源/ready发布仍在L08。

## Context

现行生产 references 使用 `indexed-batched + closure + full SDK` 与逐 batch
transient verifier。它保持 compiler 最终语义权威，但真实 Settings/API24 冷查询
会重复支付 Program/Checker 准备成本。S02 v1–v6 的 compiler-derived facts
实验没有取得完整语义等价和真实工程资源门禁，S03 因而 BLOCKED。S05 的
`ARKTS_SEMANTIC_SESSION_REUSE=experimental` 是**另一种**相容磁盘 delta 候选：
100 操作对照曾有 1.600× RSS 峰值，反序对照编辑后 definition P95 约
1.6 s，对照关闭时约 0.27 s，故已 REJECTED。不能将它改名为本 ADR 的成功证据。

问题仍是：首次准备已支付后，未查询过的真实符号是否可以在内存门禁内，
由同一个有效的官方 `ohos-typescript` Language Service 稳定、快速取得
完整结果？[L01 首轮 Settings 控制](../reports/2026-10-06-resident-l01-baseline.md)
的同文件新查询三次为 286/1,025/267 ms，42/42 exact；
[预打开双文件控制](../reports/2026-10-06-resident-l01-preopen.md) 则在三个独立
进程中得到跨文件未查符号 166/156/165 ms、15/15 exact。两组结果说明
单次可低于 500 ms，却**没有**证明稳定达标或完整资源准入。缓存命中、候选索引 ready
和重复已查询符号均不能代替新符号实验。
[真实声明位置 A/B/C](../reports/2026-10-06-resident-l01-declarations-ab.md)
又将这一区分落到生产默认与完整 LS：两策略各两个新进程、每进程
4/4 exact；同快照跨文件未查符号在默认 indexed-batched 为 8.061/23.880 s，
在已支付首次全域成本的 legacy 为 178/225 ms。后者支持预算内复用的研究
方向，却不证明当前生产已具备热路由，也不构成 P95 或内存毕业。trace-only
的 Program/Checker 身份只在查询后观察，不能反推查询内部零重建。
[未保存引用编辑控制](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)
在三个新进程中保持 9→10 个精确 Location 和 v2 诊断，但编辑后首次响应
为 1.371–1.597 s；归因 trace 显示同一 context 下 Program 换代。
同一 Program 的 post-query Checker 对象序号甚至可能变化，故该探针
不作为热 TypeChecker 证明。L01 新鲜度的一例通过，L02 增量和资源门禁未通过。
[真实 Settings L3 单次恢复](../reports/2026-10-06-resident-l01-l3-recovery.md)
在显式 `memory-level3` 驱逐后仍返回 10/10 完整位置，说明 exact fallback
的一个控制通过；恢复 trace-on 约 13.8 s、后续重复自动驱逐和约 1.09 GB
外采 Node RSS 下界不支持长驻内存或响应时延毕业。
[真实 implementation oracle](../reports/2026-10-06-resident-l01-implementation-discovery.md)
经两个新进程验证；在三个另起进程中先完成全域 references，再查先前未查的
interface implementation，均 exact 且分别为 280.4/255.2/350.9 ms
（[热态控制](../reports/2026-10-06-resident-l01-hot-implementation.md)）。
它支持实验机制，但没有证明 semantic-ready、稳定 P95、全能力或内存准入。
[真实 Settings/API24 queue-start 取消控制](../reports/2026-10-06-resident-l01-cancel-control.md)
得到唯一 `-32800`、无部分结果，后续同进程九个 refs 与 definition
精确恢复；但取消 trace 的文档准备仍延续约 1.2 s。这是早期取消的
单次安全样本，不证明 compiler-in-flight 抢占或完整 L01 安全门禁。
[三次回调取消控制](../reports/2026-10-06-resident-l01-compiler-cancel.md)
证明公开响应唯一且恢复精确；但回调发取消后仍运行 5.76–6.90 秒，
旧观测不能区分 compiler 调用与后续检查点。
[三次 TypeScript 调用级控制](../reports/2026-10-06-resident-l01-find-references-cancel.md)
在真正 `findReferences` 进入后取消，该调用 12/2/2 ms 内抛异常，
公开 LSP 19/4/4 ms 后唯一取消终态并精确恢复。首次到达该调用仍需
约 7.9–9.0 秒；其前置阶段的取消及时性和长期资源安全未验证，
L01 安全继续门禁仍未毕业。
[跨模块 definition 控制](../reports/2026-10-06-resident-l01-hot-definition.md)
在三个独立 Settings/API24 进程中先精确完成 248 个 references，再查询
此前未查的 `HomeInitData` 用法；definition 三次均 exact，却分别耗时
1,060/858/777 ms（0/3 低于 500 ms）。这否定“首次完整准备后所有新
跨模块目标自然达到 500 ms”的推断，不否定预算约束 LS 实验本身；
本轮未取该请求的 Program/Checker 身份，不作内部重建归因。
[单次 trace-on 复核](../reports/2026-10-06-resident-l01-hot-definition-trace.md)
将 1,309.4 ms 完整 definition 响应与 2.56 ms 的 compiler definition
回调分开；两个预打开文件的自动诊断落在请求窗口内，第二个诊断后才有
definition 回调。它提示交互请求受后台诊断/队列影响，但尚缺直接队列
等待计量；不据此关闭诊断或改变默认调度。
[三进程 trace-off 诊断屏障 A/B](../reports/2026-10-06-resident-l01-diagnostic-barrier-ab.md)
进一步验证：两份正常 v1 诊断都发布后才发送先前未查的跨模块 definition，
完整响应为 11.6/8.8/12.2 ms；追加无屏障对照为 747.7 ms，全部 exact。
但屏障把 792.6–923.4 ms 移至请求前；首次 references 响应到 definition
响应的总间隔并未降低。这既不批准生产使用屏障，也不证明已有 semantic-ready
契约。交互请求与正常诊断的安全调度仍是独立待验问题。
[排队优先级后的脚本晋升追踪](../reports/2026-10-06-resident-l01-script-admission.md)
在正常诊断、同一 context 的真实 Settings/API24 控制中发现：新的
definition 准备把 13 个此前由 lazy host 读取、源码指纹相同的脚本
晋升为 resident，host generation `257→270`，随后 Program 换代且
`createProgram` 约 710 ms；三次独立 trace-on 旧构建也都在 definition
中花 748–782 ms 重建。这把关注点从“诊断必须禁用”移到“无内容变更的
脚本驻留是否不应使 host 版本失效”，但仍须 L02 默认关闭的干预式 A/B
和完整语义/资源门禁，不授权直接跳过任何真实变更后的 Program 更新。

[100-edit Settings/API24 资源控制](../reports/2026-10-07-resident-l01-resource-soak.md)
将相同真实 `HomeInitData` 符号在未保存 overlay 中交替 9↔10 引用。
带正常初始诊断屏障的 trace-off 轮 102/102 精确、v1/v101 诊断正常，
但编辑后 references P50/P95 仍为 2.484/4.437 s，Node 外采 RSS 峰值下界
1.45 GB。另一个 trace-on＋五次显式 L3 轮 107/107 精确，却观察到
104 次 context 创建与 104 次 `memory-level3` 驱逐。故目前只有单一符号
长期结果完整性的证据，**没有**稳定驻留或内存准入；Mac RSS 也不能替代
原 PSS 门禁。此结果触发 L01 的资源调查/停止线，不批准 L02 生产接线。
[无显式压力的两轮短回放](../reports/2026-10-07-resident-l01-pressure-attribution.md)
又观察到 13/13 与 14/14 次创建/驱逐，证实高 RSS 下自动 L3 循环；
其中一次驱逐低于 92% 进入值但高于 85% 退出目标，表明滞回可贡献
个别事件，不能解释全部。`service.dispose()` 后未强制 GC 的瞬时堆值
不能证明 compiler/registry 强引用泄漏；本 ADR 继续只批准实验。
[同输入生产默认对照](../reports/2026-10-07-resident-l01-production-comparator.md)
又确认：20 次未保存编辑没有迫使 indexed-batched 永久退化为 legacy；
两策略逐请求 22/22 位置集合相同，正常诊断通过，但 indexed 编辑
P50/P95 3.693/4.145 s（legacy 为 2.422/2.524 s），外采 Node RSS
峰值下界 0.843 GB（legacy 为 1.245 GB）。另一个候选证明不完整的
`MenuController` 请求转入 24 个保守 batch，耗时 111.220 s，其中
Program-ready 累计 93.275 s。这是低内存与严重冷准备时延并存的证据，
不是提高预算、设 resident 默认或放行 L02 的理由。
[后续 Registry 所有权探针](../reports/2026-10-07-resident-l01-registry-ownership.md)
在两次新的真实 Settings 进程中观察到同一 2261 路径集合的引用计数
`trim 2261→2261`、重建后 `dispose 4522→2261`，后续直接 dispose
仅释放其自身的一份。fork 源码中 `cleanupSemanticCache()` 丢掉 Program
而不释放 registry 引用，与这一序列吻合。它确认了具体生命周期缺陷
候选，但不是保留字节数或整个 RSS 的归因；先加 real-LSP 回归、修复并复核，
本 ADR 的 L01 停止线不变。
[L2 recycle 后续实测](../reports/2026-10-07-resident-l01-registry-recycle.md)
说明这一风险已实际出现：公开 LSP 回归和两轮 Settings 的 refcount
归零且完整语义/诊断保持，但重新构建完整 Program 可花约 21–24 s，
编辑最大请求 27–28 s，RSS 峰值未稳定下降。故 backend 所有权修复
不是 resident-session 性能门禁；L01 仍 BLOCKED，L02 生产接线未获批准。
[重复 L2 控制](../reports/2026-10-07-resident-l01-l2-rearm.md) 在公开 LSP
中证明“查询重建后再次 trim”可释放 Registry 引用，但真实 Settings
固定构建仍有四次自动 L3 驱逐、七次 >20 s 编辑请求和至少 1.969 GB
Node RSS 峰值。因此 re-arm 只允许双重基准开关显式启用，默认关闭；
L01 资源安全与时延停止线不变。持续 L3 下禁止反复再准入完整 resident
Program 是后续待证假说，不能用跳过 L3 或提高预算替代。
[L2 build-witness 回归](../tdd/l01-l2-program-witness.md) 进一步去掉了
“任意查询结束即可 re-arm”的错误条件：无效 rename 不重建 Program，
因此不能再次 trim。实验开关现在只在观测到正的 compiler `createProgram`
事件后 re-arm；事件不证明严格的 resident Program 身份，资源门禁未变。
[随后 L3 准入实验](../reports/2026-10-07-resident-l01-pressure-admission.md)
将此假说直接证伪到真实工程：自动 L3 的小型公开 LSP 测试通过完整
conservative batch 避免 context 再创建，并在索引失效、未保存 overlay
及两种声明策略下保持其夹具结果精确；但 Settings 的 22 次请求中两次
在 180 s 超时，均卡在 24 个冷 batch 的第 14 批前。该候选 **NO-GO**，
双重基准开关不准进入生产。单次峰值 RSS 较低不能压过结果完整性和
可用时延；本 ADR 对 L01/L02 的准入状态不变。
[同构建 indexed Settings 控制](../reports/2026-10-07-resident-l01-indexed-pressure-control.md)
又表明 index 只能在当前代完整 proof 可用时缩小计划：`HomeInitData`
三次请求各一批且 exact，但仍需 11–14 s；`MenuController` proof 不适用，
24 批在 180 s 超时。L3 控制未见驱逐而阻断，不可据此批准压力恢复。
[同构建 legacy/indexed 对照](../reports/2026-10-07-resident-l01-matched-strategy-ab.md)
证明两端都有未过门禁的代价：legacy 六次精确但首个构造器查询约
60.7 s、采样 Node RSS 峰值约 1.54 GB；indexed 的该查询超时且两次
L3 控制未执行，不能由不同请求集合的 RSS 计算因果节省。
[默认关闭的压力保护](../tdd/l01-pressure-multibatch-rejection.md) 在 L3
保守计划超过一批时于 verifier 启动前返回明确资源错误，避免重演已观测
的多批次超时；它可能拒绝本可提前完成的搜索，且单批无硬内存上限，
所以不改变本 ADR 的实验批准范围、生产默认或 L01/L02 准入判定。
[两次真实 Settings L3 控制](../reports/2026-10-07-resident-l01-pressure-guard-settings.md)
虽将多批超时改为 84.5/96.9 ms 的显式 `-32803`，但六请求只四次完整
精确，外采 Node RSS 峰值下界仍为 1.226 GB；整体 FAIL，准入结论不变。
[两次独立新进程的 post-eviction 控制](../reports/2026-10-07-resident-l01-post-eviction-ownership.md)
进一步指出另一个所有权边界：显式 L3 使首次 context/Registry 引用归零后，
正常自动诊断又建立一个 resident context；其后再驱逐虽将 Registry 引用
再次归零，Node RSS 在 30 秒空闲期仍保持约 1.01–1.02 GB。没有强制 GC
或 PSS 归属测量，不能把 RSS 平台断言成 live compiler 对象泄漏；也不能
为降内存停用诊断。L01 停止线、实验批准范围和 L02 禁止生产接线均不变。
[同构建诊断准入级别复核](../reports/2026-10-07-resident-l01-diagnostic-admission-level.md)
用默认关闭的完成 trace 区分了驱逐与准入时的状态：显式 L3 后创建的
v3 诊断 Program 实测为 `level1`，无显式压力的 20-edit 回放最终 v21
诊断才实测为 `level3`；后者 22/22 引用精确且诊断正常，但仍有四次
自动 L3 驱逐和 1.745 GB 外采 Node RSS 峰值下界。只对 v21 的诊断建
Program 有直接见证，不把全部创建归因给诊断。下一 L01 实验先以
公开 LSP 锁定实际 L3 时的诊断准入与版本发布，再做压力感知准入和
真实 Settings 资源复核；正常诊断、预算及生产默认保持，L02 未获准入。

[同构建 transient diagnosis A/B](../reports/2026-10-07-resident-l01-transient-diagnostic-ab.md)
把持续 L3 的自动诊断改成双重基准开关下的一次性完整语义 Worker：真实
LSP 小夹具 RED→GREEN，真实 Settings/API24 的 512 MiB 人为 L3 对照
3/3 次执行 transient、诊断 payload 与 4/4 references 位置完整相同，
resident 创建/驱逐从 7/7 降至 4/4。然而 Node 与 product-tree RSS
峰值分别比同输入 OFF 高 **20.2%/19.8%**，空闲尾值也更高，资源
no-regression 判 **FAIL**。1,024 MiB 自然压力 20-edit 对照的 ON
路径未被调用，不能把其峰值差异算作该方案的收益。两组顶层
`READINESS_UNSUPPORTED` 独立记录；Mac RSS 下界也不证明泄漏或满足
PSS 门禁。故 transient diagnosis 仅保留默认关闭的实验/反例，
不改变诊断生产默认、L01 BLOCKED 或 L02 未准入。后续须核算 resident
与 transient Program 在同一 Node PID 的峰值重叠，而非仅数创建次数。
[阶段追踪与反序复核](../reports/2026-10-07-resident-l01-transient-diagnostic-phase-attribution.md)
进一步限制了上述单次结论：相同构建的两组反序 A/B 峰值差分别是
+17.0% 和 −19.6%，且 ON 最后一次诊断启动前 RSS 已有约 651 MB
差异。Worker 的完整诊断会临时增加 RSS，但当前外采与时序不能证明
其造成稳定产品峰值回归，更不能证明降低峰值；不因反序结果放行实验。
本 ADR 的安全门禁、默认关闭状态和 L02 未准入保持不变。

## Decision and ownership

- 以 [L01–L08 计划](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
  作为新的实施主线；先在固定真实 Settings/API24 上验证**一个 LS、首次完整
  Program 准备后不销毁、随后查询先前未查的符号**。L01 是可证伪实验，
  不是默认启用长驻 LS 的批准。
- ArkTS AST、Symbol、TypeChecker、`findReferences` 和各能力的最终语义仍由
  锁定的官方 compiler 拥有。Rust/SQLite 保留发现和候选职责，不产生第二
  TypeChecker，也不把 S02 的失败事实格式接入生产。
- `DocumentAuthority` 的打开文本/版本高于磁盘与索引。LS 的 snapshot、
  Program 和 SourceFile 生命周期由后端管理；coordinator 只管理 lease、
  有效输入身份、压力准入与 `trim()/dispose()`，不清理 compiler 内部节点。
- **全工程合法语义范围完整，compiler 驻留受预算约束。** 一个复用中的
  LS 不等于有权回答全局 references；必须证明其 Program 覆盖该请求的完整
  搜索范围，否则继续使用现行 exact transient 路径。
- 改造顺序是 L01 基线 → L02 增量新鲜度 → L03 预算/滞回/成本感知驱逐 →
  L04–L07 按能力接线及 exact fallback → L08 soak/release。L01–L07 验证
  各切片功能、公开 LSP 合同和执行保护；最终内存、500 ms、长期 soak、
  PSS/DevEco、规模与跨平台门禁统一在 L08 验收，未达标不阻塞前序实验。

## L01 falsification gate

同一固定 Settings checkout、API24 SDK、compiler revision 和原始工程边界下，
记录完整 LS 的首次 `createProgram`/Checker 准备、随后未查询符号的 definition、
references（含两种 `includeDeclaration`）、implementations 与正常诊断。
对 references 保留 A/B/C 对照：现行生产路径、完整 LS 首次查询、该 LS
准备后另一未查询符号。分别测完整响应时延、外部采样 Node PID RSS、
heap、Program/SourceFile/TypeChecker 身份及 exact URI＋UTF-16 Location 集。
正常自动诊断、未保存 overlay 和合法工程边界不得为了速度而关闭。

L01 提供固定输入、可重放的机制证据和后续假说。L02 可带着未达标的
时延、内存和恢复问题继续增量实验，L03 负责预算与回收改进；不要求
L01 先通过最终产品资源门禁。完整精确性、有效快照、取消及可停止/回收
的执行保护仍逐切片验证，缺陷停止受影响运行并修复或回退。
产品指标 FAIL/BLOCKED/NOT_RUN 保留原始状态，最终完整矩阵在 L08
判定。L04–L07 可默认关闭接线，默认推广、发布和 ready 目标毕业等待 L08。

## Admission, fallback and rollback

2026-10-08 L02 同内容晋升切片已按默认关闭的 benchmark 双开关实施：
仅当前 membership、有 lazy 读取证据且源码指纹相同的晋升保留版本。
公开 LSP 与真实 Settings 的干预结果见 [L02 报告](../reports/2026-10-08-resident-l02-same-content-promotion.md)；
它不豁免真实编辑和配置失效，也不代表 L02 全阶段或 L08 产品验收通过。

随后 [L02 独立失效与编辑控制](../reports/2026-10-08-resident-l02-invalidation-and-edit.md)
补充了 API/import/create/delete/open-close/SDK/package/target 的公开合同。
配置切换后的既有 definition 空结果缺口经 TDD 修复为完整合法范围复核，
已有有效局部结果不改变；不扩大合法工程边界或默认启用晋升。真实编辑
换代且复用未变 AST，但本控制未发生 matching 晋升，不宣称编辑提速。

L02 要证明函数体普通编辑后正确增量复用，并将 public API/import、
创建/删除、package 和 SDK 边界分别验证。L03 才在实测 steady RSS 上引入
soft budget、pressure target、hysteresis 和按成本驱逐；不得盲目把 1 GiB
策略预算提高或把它声称为硬 RSS 上限。L04 以后按能力证明 scope coverage，
热路由 miss、未知、旧代、超预算或 compiler 不完整时返回现有完整安全路径
或显式错误，绝不以空数组或部分结果冒充完成。global 重任务默认并发一；
整个 Node PID 的 RSS 只计一次，不把 worker thread RSS 相加。

L02 不把“编辑后同一个 Program 对象”设为不变量：合法编辑可使 Program
换代。它必须证明新代际、未变更 SourceFile 的复用、编译阶段成本与最新
exact 结果。L01 未保存编辑 trace 已观察到 1495/1496 个 project 和
652/652 个 SDK SourceFile 复用，却仍有约 1.08 s 的分组 Program 构建；
不能以 AST 复用数量代替完整请求时延门禁。

任一 exact diff、stale/partial 响应、取消失效或无法停止/清理的运行，
停止受影响实验并修复或回退，保留现有完整路径、cache 与诊断。
预声明资源停止线保护实验进程；内存回归和增长趋势记录为 L03/L08
待解问题，不要求前序阶段先通过最终产品指标。既有 >3 GB 复现、50%
references 内存、DevEco/PSS、post-eviction、跨平台及分桶 P95≤500 ms
门禁阈值保留，全部在 L08 最终验收。

L01 的[三对 Settings post-L3 GC 归因](../reports/2026-10-07-resident-l01-post-eviction-gc-attribution.md)
表明该已淘汰 semantic context 的数百 MB Worker heap 在诊断重新准入前
可被收集，而进程 RSS 即时回落很小。这将下一安全问题具体化为“旧的可
回收 compiler state 与新诊断 Program 重叠”，**不是**已证实的 AST 强引用
泄漏。强制 GC 仅是默认关闭的归因工具，不是本 ADR 接受的生产回收策略；
该六次控制显式使用 `legacy` 与实验性压力保护，不能外推到生产默认。
[独立的三次 indexed-after-L3 回放](../reports/2026-10-07-resident-l01-indexed-after-l3.md)
在已证明单批的 `HomeInitData` 上均得到 10/10 完整精确位置和正常诊断，
但耗时约 4.56 秒；构造器仍是索引无法完整证明的保守多批边界。
L01 整体资源、PSS、所有目标的完整 L3 响应和 500 ms 门禁仍未通过。
[后续三对 Settings L3 后显式 Worker 回收对照](../reports/2026-10-08-resident-l01-semantic-worker-recycle-ab.md)
仅在 benchmark 双开关、实际 L3 驱逐和单根静默条件下，将修复后构建的
采样 Node 峰值降低 29.3%–31.6%，精确引用与诊断保持完整，时延仍约
4.5–4.7 秒。回收资格检查超时期间的未保存编辑曾被遗漏；真实 LSP
RED/GREEN 已修为替换前拒绝时冲刷延迟变更，失败则 fail-closed。
这批准继续**观察** Worker isolate 生命周期，不批准生产自动回收：
RSS 未在替换时同比即时下降，PSS、长期压力、未知多批范围及原始内存
门禁未证明。这些问题带入 L02/L03，最终产品验收在 L08；默认路由不变。

2026-10-08 后续 [L03 公开自动回收切片](../tdd/l03-automatic-pressure-recycle.md)
已将实验扩展到自然 RSS sample 的真实 L3 驱逐后，由 main-thread 在请求/
preparation/mutation 静止及原 Worker 零 lease/零 context 见证下替换。
它使用独立 benchmark 双开关、默认关闭，不依赖 trace 或 L01 显式开关；
组合 86/86 PASS；[真实 Settings 四轮](../reports/2026-10-08-resident-l03-natural-worker-recycle.md)
88/88 exact，一次 timing 峰值降低但编辑长尾更慢。这是实验接线，
不是生产自动回收或整体资源/时延毕业的批准，也不阻断 L04 的默认关闭实验。
后续同一自动入口已通过公开 RED/GREEN 扩展到多根 workspace：替换前
捕获已注册 roots，替换后先恢复 root 注册、再按所属 root 重放最新
overlay；独立 v2/v3 定位、完整引用和正常诊断在 117/117 组合中通过。
手动单根资格及原零 lease/静默/并发变更保护不变，实验仍默认关闭。
这不完成统一预算、成本感知或全部文档关闭的资格，也不替代 L08 验收。

后续 [L03 全部文档关闭后的压力回收](../tdd/l03-closed-document-pressure-recycle.md)
已通过公开 RED/GREEN 补上空文档的自动资格：保留已注册 roots，原
实际 L3/零 context/lease/静默见证通过后替换，不重放已关闭 overlay。
引用在途仍阻止替换，关闭后 ContentModified，重新打开时两根即使
沿用原版本号也按各自最新文本精确回答；手动单根/非空文档资格保留。
该检查点 126/126 focused PASS、源码 whole NOT_RUN，默认关闭和预算不变；
其后统一政策与代表性关闭/配置控制已完成，当前证据见上述 L03 审计；
最终资源收益仍待 L08 验收。

后续 [L04 公开组合合同](../tdd/l04-promoted-resident-reference-contracts.md)
覆盖晋升、两种声明策略、alias/未打开 native caller、编辑、压力与恢复。
[历史八轮 Settings 对照](../reports/2026-10-08-resident-l04-route-control.md)
16/16 exact，但两个 trace ON 都在 level1 miss 并完整 fallback；没有
证明当时的真实热 admission 或性能/资源收益，不绕过输入/覆盖见证强行命中。
后续配置见证共享解除容量拒绝；当前选定预算政策的
[独立真实控制](../reports/2026-10-09-resident-l04-budget-policy-integration.md)
52 项 exact、两种策略实际热命中，完整回归及阶段审计通过。旧 miss/失败
记录不重标为命中，当前阶段完成也不宣称最终时延或资源毕业。
[L05 选定政策独立合同](../tdd/l05-budget-policy-implementation-contracts.md)
及[当前真实控制](../reports/2026-10-09-resident-l05-budget-policy-integration.md)
已完成阶段A～E审计；早期五项合同保留为历史起点。固定compiler的alias
implementation链保留，不能按手写class-only假说删结果；输入不明明确失败，
不发布旧子集。阶段DONE不代表overall ready或L08毕业。
随后 [L06 八个交互合同](../tdd/l06-resident-interactive-contracts.md) 与相关
回归 57/57 PASS，覆盖完整导航/hover/signature、completion/auto-import/
resolve/snippet、API 编辑、真实 Worker 恢复、早期取消和 refs 在途交互。
继续复用原 owner/lanes，不改变 capability advertisement 或生产默认；
最终指标仍留在 L08，不阻断 L07 自身合同。
[当前构建 Settings 四轮](../reports/2026-10-08-resident-l06-interactive-control.md)
8/8 exact、原 2307/2339 诊断配对一致，13 个同内容晋升实际避免重建；
单 timing 新 definition 686→165 ms。单对控制不等于整体 ready/P95/
内存或原 >3 GB 门禁通过，仍不是生产推广批准。

随后 [L07 独立合同](../tdd/l07-resident-edit-and-call-contracts.md) 推进完整
版本化 rename 编辑及应用、三层 alias 与独立 incoming/outgoing/fromRanges。
公开 RED/GREEN 修复本地显式 alias 冲突漏检，以及未打开 follow-up 的
临时 source staging 失效后正常诊断不再发布的问题。最新诊断仍经原
debounce 和快照保护，不关闭诊断、不取消 revision fence；当前 focused
88/88、并行 72/72 PASS是2026-10-08历史起点；当前公开组合、真实工程/
预算政策控制和冻结E进度以上方L07审计为准。全部冲突/方言/平台矩阵与
整体readiness仍在L08，不改变生产默认。

## Relation to earlier decisions

- [ADR 0003](0003-reference-verifier-worker-lifecycle.md) 的 per-batch verifier
  **仍是当前生产默认及 exact fallback**。只有 L04–L08 逐能力通过后，另行
  审查具体 supersession 范围；本 ADR 不立即替代它。
- [ADR 0011](0011-budgeted-preparation-and-session-reuse.md) 管内存预算、压力、
  滞回和驱逐；本 ADR 管 LS 的长驻/增量/路由生命周期。S05 相容磁盘候选
  仍 REJECTED，不能挪用其实验 flag 或“LS sequence”代替 Program 复用证明。
- [ADR 0008](0008-compiler-derived-semantic-facts.md) 的 S02 路线暂停研究，
  S03 仍 BLOCKED；不删除 v1–v6 反例，也不未经新决策启动 v7。
- [ADR 0012](0012-query-routing-and-fallback.md) 只在 L04–L07 的独立能力
  门禁通过后接线。现有缓存、调度和 compiler 权威不变。
