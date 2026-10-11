# ArkTS 预算约束长驻语义会话：L01–L08 执行计划

2026-10-11 当前默认/交付政策由[ADR 0015](../adr/0015-default-resident-optimization-policy.md)
更新：维护者授权六项组合默认开启，完整回归通过后通过PR先合入main。
下方默认关闭和验收后推广记录为历史状态，L08仍IN_PROGRESS。

初始日期：2026-10-06；推进规则更新：2026-10-08；L03–L05完成审计：2026-10-09；L06–L07完成审计：2026-10-10。状态：**当前实施主线；L01基线继续保留；L03–L07阶段DONE／实验默认关闭；L02 IN_PROGRESS；最终产品验收统一在L08**。
本计划接续 [2026-09-29 semantic-ready 计划](2026-09-29-semantic-ready-execution-plan.md)
的需求与失败证据，不把旧 S-series 的阶段或 S05 候选重标成功。
[ADR 0014](../adr/0014-budgeted-long-lived-semantic-session.md) 仅批准可证伪的
实验实施；生产默认仍是 `indexed-batched + closure + full SDK`、
`dispose` 策略、逐 batch transient verifier。达到 500 ms 尚未证明。

## 路线决策和停止线

S02 compiler-derived facts v1–v6 保留原始反例；**不进行 v7**，除非有
新的独立假说、明确决策及同一反例合同。S03 的 facts 持久化/发布仍
**BLOCKED**，不是 L02 的前置。旧 S05 compatible-disk local-LS 候选
`DECISION_COMPLETE / REJECTED`：曾有 1.600× RSS 峰值和编辑后
definition P95 约 1.6 s 的负面证据。新 L01 是首次完整 LS 准备后
不销毁、测先前未查询符号的**不同机制**，不沿用其毕业结论。

```text
L01 resident-LS 可证伪基线
  → L02 版本化增量刷新
  → L03 预算/压力/滞回准入
  → L04 resident references + exact transient fallback
  → L05 implementations
  → L06 definition/completion/hover 等交互能力
  → L07 rename/call hierarchy
  → L08 soak、跨平台与 release 评审
```

| Stage | 当前状态 | 实施资格与结果 |
| --- | --- | --- |
| L01 | **IN_PROGRESS；真实符号、单次未保存编辑、单次 L3 恢复及 `findReferences` 进行中取消/恢复精确；500 ms 稳定性 NOT_MET，前置准备取消及时性/长期资源门禁未完成** | [首轮](../reports/2026-10-06-resident-l01-baseline.md)：42/42 exact，同文件未查符号 286/1,025/267 ms；[预打开](../reports/2026-10-06-resident-l01-preopen.md)：15/15 exact，跨文件未查符号 166/156/165 ms；[声明位置 A/B/C](../reports/2026-10-06-resident-l01-declarations-ab.md)：默认 indexed 与 legacy 各 2 个新进程、每进程 4/4 exact，indexed 跨文件未查符号 8.061/23.880 s，legacy 同快照 178/225 ms；[未保存编辑](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)：三进程 12/12 exact、9→10 引用及 v2 诊断，编辑后首次 1.371–1.597 s；[L3 恢复](../reports/2026-10-06-resident-l01-l3-recovery.md)：显式驱逐后未查符号 10/10 exact，trace-on 13.797 s，后续又见自动驱逐；[取消控制](../reports/2026-10-06-resident-l01-cancel-control.md)：queue-start 后唯一 `-32800`、无部分结果，随后 9/9 refs 与 definition exact；[调用级取消](../reports/2026-10-06-resident-l01-find-references-cancel.md)：三进程在 TypeScript `findReferences` 内 2–12 ms 抛取消，9/9 exact 恢复；首次进入该调用前仍用约 7.9–9.0 s；[跨模块 definition](../reports/2026-10-06-resident-l01-hot-definition.md)：三进程 6/6 exact，未查符号 1,060/858/777 ms。Program/Checker 身份只在有 trace 的查询后观察，definition 本轮无身份探针；不改变生产路由 |
| L02 | IN_PROGRESS／默认关闭实验 | 同内容晋升干预 A/B 已实现；API/import/create/delete/open-close/SDK/package/target 公开合同通过，修复 target 首次空定位；三对真实编辑 exact、AST 复用，但 >500 ms 且未证明晋升机制收益；更长序列/未知 delta/恢复组合继续验证，最终指标不作为阶段前置 |
| L03 | DONE／阶段实施与校准完成；实验默认关闭 | [完成审计](../reports/2026-10-09-resident-l03-completion-audit.md) A～E PASS：同进程 RSS 预算、成本感知回收、压力准入、最新诊断与恢复合同齐备；[当前公开控制](../tdd/l03-cost-aware-pressure-recovery.md) 20/20、回放器 35/35、完整 check:fast 1439/1439 PASS，终态身份一致；[固定构建校准](../reports/2026-10-09-resident-l03-budget-policy-calibration.md) 选定配置/对照 26/26 exact、诊断一致。保留 1024 MiB 与原滞回，自动 Worker 替换不纳入选定配置；无最终内存收益或 readiness 毕业结论，产品门禁交 L08。历史检查点及失败记录见本阶段正文 |
| L04 | DONE／阶段接线与校准完成；R-09 默认关闭 | [完成审计](../reports/2026-10-09-resident-l04-completion-audit.md) A～E PASS；[选定 L03 政策的公开组合](../tdd/l04-budget-policy-reference-contracts.md) 当前 10/10，完整 check:fast 1449/1449 PASS、终态身份一致。[同构建真实对照](../reports/2026-10-09-resident-l04-budget-policy-integration.md) 两种声明策略 ON/OFF、独立 trace/timing 八进程 52 项 exact，四对集合/诊断一致；首次新符号实际复用完整同一 Program、9/10 refs、零 build/verifier。新引用 timing 915/937 ms，准备更慢、峰值更高，不宣称最终资源收益或 ready；最终指标交 L08。旧 45/48 FAIL、16/16 exact/miss、48/48 及 1.31/1.21 s 热命中检查点保留 |
| L05 | DONE／独立 implementations 接线与校准完成；实验默认关闭 | [完成审计](../reports/2026-10-09-resident-l05-completion-audit.md) A～E PASS；[选定政策公开合同](../tdd/l05-budget-policy-implementation-contracts.md)23项、联合132/132，完整check:fast1467/1467、终态身份一致；[当前真实控制](../reports/2026-10-09-resident-l05-budget-policy-integration.md)四进程22/22 exact、两对最新诊断一致，R-09 OFF仍独立完整语义与真实Program复用。修复根membership丢失、未知范围partial成功和旧配置结果；未查628/677ms、恢复约13s及峰值风险交L08，不推广默认 |
| L06 | DONE／阶段交互接线与校准完成；实验默认关闭 | [完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)A～E PASS；19项公开合同、联合252/252、全新完整check:fast1492/1492及终态身份一致。[第五轮真实对照](../reports/2026-10-10-resident-l06-budget-policy-integration-v5.md)16冷基线、62/62、两对完整payload/最新诊断一致，实际Program复用成立；四轮whole失败及容量RED不重写。慢准备/恢复、>500ms及峰值风险交L08，按用户授权立即继续L07 |
| L07 | DONE／阶段编辑与调用接线、校准和收口完成；实验默认关闭 | [完成审计](../reports/2026-10-10-resident-l07-completion-audit.md)A–E PASS：25生产公开合同、此前157联合/50工具、新caller修复后93联合；[当前真实D](../reports/2026-10-10-resident-l07-budget-policy-integration-v4.md)16同产品冷基线、62/62、两对完整payload/最新诊断/身份一致，实际11源晋升/未查Program复用及OFF重建反事实成立。全新完整check:fast1511/1511、根退出0、无fail/cancel/skip/todo，所有冻结终态身份一致；旧失败/未晋升/88/72历史保留；最终指标在L08 |
| L08 | IN_PROGRESS／release-blocked | [最终执行记录](2026-10-10-l08-final-validation.md)已启动；冻结完整核心能力/场景/平台矩阵并按TDD建立证据入口。soak、分桶P95、原内存与跨平台产品门禁均未通过 |

## 阶段继续与 L08 最终验收（2026-10-08 更新）

用户明确要求：**最后验证放在 L08，不用最终目标阻塞前面的计划。**
L01–L07 按各阶段的功能实现、公开 LSP 回归和可重放证据推进；
500 ms、最终峰值下降、DevEco/PSS、长期 soak、规模与跨平台验收均在
L08 统一判定。上述指标 FAIL/BLOCKED/NOT_RUN 如实保留，作为后续阶段
要解决的问题，不作为进入 L02–L07 的前置，也不把本阶段状态重标成功。

正确性、完整结果、overlay/快照新鲜度、协议、取消及可停止/回收的执行
保护仍逐切片验证。预声明实验停止线、独立进程和默认关闭开关保护运行；
遇到错误结果、丢失编辑、取消失效、OOM 或不能停止/清理时，停止受影响
的实验运行并修复或回退，不把其它独立实现切片一并冻结。
资源超限、驱逐重建和慢 fallback 的原因带入 L02 增量与 L03 预算改进；
最终内存目标未达到本身不等于禁止继续实验。

L04–L07 可在默认关闭开关下逐能力接线；默认推广与产品发布等待 L08。
不为了让结果通过而缩小合法工程边界、提高预算、禁用诊断、改超时
或用已缓存目标替代新符号。后续阶段都是 **provisional**，不是
已获生产准入。最终产品毕业仍要求全部适用性能和原内存门禁通过。

## 固定输入、共同合同

- 使用真实 `applications_settings` checkout，记录精确 commit、dirty 状态、
  已声明依赖与实际安装状态；API24 是已授权兼容测试轨，记录其 SDK
  绝对路径、声明 digest 和 compiler revision。不得把它写成 API23
  matched-DevEco 结论，不改工程边界或复制文件造规模。
- 每次记录 server HEAD/build/flags、Node、macOS 硬件与内存、实际 LSP
  request/response、UTF-16 光标、oracle 的 URI＋range、诊断时间线。
  使用现有 LspSession、Content-Length stdio、外部 Node PID RSS sampler；
  trace-on 只用于归因，trace-off 才作产品时延对照。测试工具自身内存
  单列，不重复计 worker thread RSS。
- 工作树现有改动由原 owner 保护。源码行为以公开 LSP RED 开始，
  最小 GREEN 后跑相关 focused test；请求合并前 `pnpm check:fast`。
  手写 source/test/script ≤500 物理行，既有超限文件不得增长。
- 所有结果必须区分 PASS、FAIL、BLOCKED、NOT_RUN。一个完整响应包括
  排队、更新等待、fallback、结果映射及序列化；错误、超时、OOM、
  空结果和部分成功分别记账，不从分母删除。

## L01 — 一个完整 LS 的真实工程基线

目标是验证因果假说：首次 Program/Checker 准备成本若被有效 LS 支付并
留在同一进程，**另一个此前未查询的真实符号**是否能在预算内完整回答。
第一轮只加默认关闭的实验/观测和复现测试，不改生产默认或 worker 数。

1. 固定真实 Settings/API24 工程、SDK、依赖与准确 UTF-16 目标；先取
   stock/legacy 的完整逐位置 oracle，并保持正常自动诊断。分别选
   未查询的 definition、references（`includeDeclaration` 两种设置）、
   implementations 目标；同名、alias、跨模块不得被合并成一个目标。
2. A/B/C：A 新进程现行生产路由；B 新进程完整 LS 的首次准备及首次查询；
   C 在 B 的同一 LS 不 `dispose` 后，查询**先前未查询**符号。准备
   不是静默预查询目标池。对同快照重复查询另列 cache-control，不能
   计入 C 的新符号桶。
3. 记录首次 `createProgram`、`getTypeChecker`、`findReferences` 等阶段，
   C 的完整 LSP 时延、Program/SourceFile/TypeChecker 身份，外部 50 ms
   RSS 曲线及 heap，准备后 steady、峰值、空闲期和诊断。LS identity
   连续并不能证明 Program 没有重建；每个身份字段注明其可观察范围。
   用独立实验进程及预声明压力停止线保护本机；达到资源停止线、OOM
   或超时均记录为相应 FAIL，绝不当作完整响应或隐藏样本。
4. C 的逐位置 exact set、诊断、快照、新鲜度与取消/显式错误必须正确，
   运行须可停止和清理；缺陷按受影响切片修复或回退。保留内存、时延、
   驱逐/恢复和未测项的实测状态，交给 L02/L03 改进；不要求 L01 先通过
   最终内存或 500 ms 目标。新符号 >500 ms 仍记 `PERFORMANCE_FAIL`。
   L01 提供可重放的机制基线和后续假说，L08 才判定整体产品毕业。

L01 交付：一条可重放命令、固定 manifest、原始响应和规范化 oracle、
时序与 RSS 曲线、Program 身份证据、A/B/C 差分、切片功能与执行保护
结果，以及带入 L02/L03 的未解问题；产品指标保留原状态，L08 最终验收。

## L01 证据快照与当时判定

以下保留各轮原始事实、失败和当时的准入结论。其中“L01 BLOCKED”、
“L02 未获准入”及下一安全切片等历史措辞，均不再作为当前阶段依赖；
当前推进按上面的 2026-10-08 规则执行。原始报告不重写，失败不改标 PASS。

当前声明位置对照进一步隔离了缓存误判：`MenuController` 和
`HomeInitData` 都使用真实 declaration 光标、`includeDeclaration=true`、
预打开两文件、正常自动诊断；先前未查的跨文件 `HomeInitData` 在 legacy
已支付首次全域准备成本后两次低于 500 ms，而生产默认的两次仍为秒级。
重复同符号的约 2 ms 响应是 exact-result cache 对照，**不能**充当新符号
LS 复用证据。四次样本、机器负载和采样抖动不足以宣布 P95 或内存收益；
该报告冻结在较早的 dirty-build digest，源码演进后须新建 pin 重测，
不可直接改旧清单 pin 后合并统计。

当前构建的[未保存编辑控制](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)
已验证真实 Settings `HomeInitData` 新引用的 v2 overlay 权威、结果缓存失效与
正常诊断，三次编辑后首次 refs 均超 500 ms。单独 trace-on 中 context 保持，
Program 在编辑后从序号 1 换为 2；同一个 Program 的查询后 Checker 序号也
曾从 1 换为 2，因此 Checker 序号**不作复用门禁**。分组 `createProgram`
事件约 1.08 s 是编辑后成本线索，不是精确构建调用次数，也不与 trace-off
时延合并。该控制只关闭一个 freshness 用例，不提前判定 L02 增量有效性；
真实 Settings 上的取消、L3 恢复和完整资源安全仍待独立门禁。

[L3 单次恢复控制](../reports/2026-10-06-resident-l01-l3-recovery.md) 已在真实
Settings 上观察到控制响应和 sequence 1 的 `memory-level3` 驱逐，随后
未查的 `HomeInitData` 10/10 exact、诊断正常；但恢复请求 trace-on
13.797 s、外采 Node RSS 峰值下界 1,087,504,384 B，且又发生 sequence
2/3 的 L3 驱逐。它关闭一个结果完整性用例，不关闭重复压力、长期驻留、
trace-off 产品时延或正式内存门禁。

[真实 Settings/API24 queue-start 取消控制](../reports/2026-10-06-resident-l01-cancel-control.md)
在 legacy 全域路径的 `references.queue.start` 后发取消，得到唯一 `-32800`
而非部分结果；同进程恢复 refs 9/9 和 definition 均 exact，诊断正常。
这只关闭一个公开协议的早期取消/恢复用例。已取消 trace 的文档准备仍继续
约 1.2 s，不能据此声称 compiler-in-flight 抢占、长期资源安全或 500 ms。

[早期回调取消复核](../reports/2026-10-06-resident-l01-compiler-cancel.md)
在三个独立 Settings/API24 进程中得到唯一 `-32800`、无部分结果、9/9
精确恢复，但发取消后 **5.76–6.90 秒**才见 references 回调抛异常；
旧事件包围整个回调，不能证明 TypeScript 内部何时停止。
后续[实际 `findReferences` 调用级复核](../reports/2026-10-06-resident-l01-find-references-cancel.md)
在另三个独立新进程中等到该调用进入才发取消：同一调用 12/2/2 ms
后抛取消，公开 LSP 19/4/4 ms 后唯一终态，9/9 refs、definition、正常
诊断均精确。首次进入该调用前仍等待约 7.9–9.0 秒；因此只能说
`findReferences` 本体可及时取消，**不能**把更早的 Program/定义准备、
重复取消资源安全或 L01 安全继续 GO 标成完成，更不是 500 ms 响应。

`textDocument/implementation` 现有一个真实 Settings 目标：[两独立新进程
发现](../reports/2026-10-06-resident-l01-implementation-discovery.md)均将
`IAboutDevicePageCtrl` 精确定位到同一实现类，固定为完整一位置 oracle；
冷请求 12.933/13.042 s。[三新进程预打开、首次全域 references 后的新目标
控制](../reports/2026-10-06-resident-l01-hot-implementation.md)则 6/6 exact，
此前未查 implementation 为 280.4/255.2/350.9 ms，正常诊断和外采 RSS
均保留。这只证明该预打开/已支付首次成本的目标有低于 500 ms 的样本；
未获得 semantic-ready 身份、Program/Checker 查询内部复用证明、可信 P95
或 L05 全能力/内存毕业，生产 implementation 路由保持不变。

[跨模块 definition 控制](../reports/2026-10-06-resident-l01-hot-definition.md)
在三个新进程中先完成 `MenuController` 248/248 全域 references，再对
预打开但此前未查询的 `HomePageMenuManager.ets` 中 `HomeInitData` 发
`textDocument/definition`：三次均精确落在声明 `16:13–16:25`，正常诊断
保留，但完整响应分别为 1,060/858/777 ms，0/3 低于 500 ms。
该 trace-off 控制明确反驳“首个完整 Program 建好后，所有跨模块新符号
都会小于 500 ms”；它不证明同一 Program/Checker 复用，也不因
`READINESS_UNSUPPORTED` 而把结果精确性改写成失败。

同输入的[单次 trace-on 归因](../reports/2026-10-06-resident-l01-hot-definition-trace.md)
显示 definition 完整协议 1,309.4 ms，而已插桩的 compiler definition 回调
仅 2.56 ms、该回调无分组 `createProgram` 记录。请求窗口中两个预打开
文件的自动诊断先后完成，第二个诊断完成后才出现 definition 回调；
Program/Checker 的后置序号在第二个诊断处由 1 换为 2。此时间顺序支持
“诊断/队列重叠”假说，但缺少 definition queue 与完整 document/project
准备边界，**不能**从一次 trace 算出各阶段占比。下一控制应保持诊断正常，
仅等待两个 v1 诊断都完成后再发送同一个未查询 definition，独立比较
trace-off 完整响应；不能把等待时间藏进 semantic-ready 声明。

该[诊断屏障 A/B](../reports/2026-10-06-resident-l01-diagnostic-barrier-ab.md)
现已完成：三次独立新进程的先前未查跨模块 definition 均精确，等待两份
正常 v1 诊断后响应为 11.6/8.8/12.2 ms；追加的无屏障新进程仍为
747.7 ms。屏障在发送第二请求**之前**额外等待 792.6–923.4 ms，首次
references 响应到第二 definition 响应的总间隔未明显降低。故这是归因
实验：支持诊断恢复/预热与请求重叠，却不证明任意点击时刻的跳转已达到
500 ms，也不能把 FIFO 与诊断预热的贡献唯一分开。随后[排队优先级
切片](../reports/2026-10-06-resident-l01-diagnostic-priority.md)用真实子进程
LSP 先得到稳定 RED，再允许 `define`/`hover` 有限越过尚未执行的自动
诊断，同时保证变更优先、旧请求新鲜度、v2 诊断和精确跳转。真实
Settings/API24 三个新进程均在第二份 v1 诊断前精确返回 definition，
但完整时延仍为 **824.4/703.9/691.0 ms，0/3≤500 ms**；正常诊断未关闭，
READINESS_UNSUPPORTED 和资源门禁也未改变。接下来须分辨已执行诊断
的剩余等待与未预热目标的 compiler 准备，不能将修复排队顺序等同于 L01
或产品时延毕业。

[脚本晋升追踪](../reports/2026-10-06-resident-l01-script-admission.md)现将此
剩余成本定位得更细：三个独立 trace-on Settings 进程的未查跨模块
definition 为 1,043/1,030/1,040 ms，其中 `createProgram` 为
748/762/782 ms，结果均 exact；另一次默认关闭观测点的真工程回放记录
第二文件准备新增 13 条 resident script，13 条此前经 lazy host 读取且
源码指纹完全相同，host generation `257→270`，紧随 Program `1→2`
和约 710 ms 重建。最终构建通过 `pnpm check:fast` 1299/1299 后的独立
新进程复测仍见 13/13 同指纹晋升、Program `1→2`，`createProgram`
749.4 ms、完整 definition 1,004.7 ms，248/248 references 与 definition
1/1 exact；输入 pin 前后不变，自动诊断正常。没有编辑、context 驱逐
或 SDK/root 数增加。这是
**强观察证据，不是“保留 host version 即安全”的因果证明**。L02 仅在
L01 安全继续门禁后，以默认关闭的同输入 A/B 检验同指纹 lazy→resident
晋升是否可保持 host version；任意真实内容/工程/SDK 变化仍必须失效。
本轮不改生产语义加载/默认路由，500 ms 和长期资源门禁保持开放。

[100 次未保存引用增删的资源回放](../reports/2026-10-07-resident-l01-resource-soak.md)
在真实 Settings/API24 的三个独立新进程完成。带初始诊断屏障的 trace-off
轮 102/102 URI＋UTF-16 位置精确、正常 v1/v101 诊断通过，但 100 个编辑后
references 的 P50/P95 为 2.484/4.437 s，外采 Node RSS 峰值下界
1,452,896,256 B。trace-on 轮 107/107 精确且五次显式 L3 均恢复，
同时观察到 104 次 context 创建和 104 次 `memory-level3` 驱逐，不能称为
稳定长驻。另一无诊断屏障 trace-off 轮虽 102/102 精确，但 `MenuController`
v1 诊断超时，必须保留 FAIL。此切片仅关闭单一符号的 100-edit 精确性；
资源准入仍 BLOCKED，不能推进 L02 生产变更、提高预算或改默认路由。
Mac RSS 不是原 PSS 门禁；原始 >3 GB／50% 目标也未关闭。

[短诊断回放](../reports/2026-10-07-resident-l01-pressure-attribution.md)又在两个
独立真实 Settings 进程中，以 20 次未保存编辑、**不发送显式 L3 控制**
观察到 13/13 和 14/14 次 context 创建/驱逐，22/22 exact 且正常诊断
通过。原 100-edit 的 104 次驱逐均发生在 RSS 高于 92% 进入阈值时；
第二个短回放仅 1 次驱逐低于该阈值但高于 85% 滞回目标。因而主要
已证实的是高 RSS 下的创建→驱逐反馈循环，不是滞回本身造成全部驱逐，
也**不是**已证明的 compiler/registry 对象泄漏。L01 资源准入继续
BLOCKED；先完成同输入生产默认对照与 post-eviction live-heap/PSS
归属，不能据此提高预算或改生产路由。

[同输入生产默认对照](../reports/2026-10-07-resident-l01-production-comparator.md)
已完成第一项：两个独立 Settings/API24 进程只切换 `legacy` 与
`indexed-batched`，22/22 位置集合逐请求完全相同，正常诊断均通过。默认
策略的 `HomeInitData` 基线与 20 次未保存编辑均实际走 indexed 单 batch，
并非编辑后持续 fallback legacy；其编辑 P50/P95 3.693/4.145 s，较 legacy
的 2.422/2.524 s 更慢，外采 Node RSS 峰值下界从 1.245 GB 降至
0.843 GB。首次 `MenuController` 因候选身份不完整进入 24 个保守批次，
111.220 s 中 93.275 s 为累计 Program-ready，不能误归因于最终引用
查询。该对照仅是 trace-on 诊断样本，非统计 release gate；post-eviction
live-heap/PSS 归属尚未完成，L01 资源准入仍 **BLOCKED**。

[两次新进程 Registry 所有权探针](../reports/2026-10-07-resident-l01-registry-ownership.md)
进一步在相同 Settings/API24、正常诊断及无显式压力的 20 次编辑中复现
L2 trim→重建→L3 dispose：两轮都是 22/22 exact，初次采样的 2261 个
路径的 registry 引用计数均为 `trim 2261→2261`、重建后
`dispose 4522→2261`；后续新 context 的 dispose 只临时加减一份。
这与上游 `cleanupSemanticCache()` 丢弃 Program 而不释放 registry 引用的
源码行为吻合，是具体的 backend 生命周期缺陷候选。refcount 不能换算为
保留字节；探针会调用 `getProgram()`，故其 RSS/时延仅用于归因。
下一步先以 real-LSP RED 锁定 trim→重建→dispose 的零残余要求，再做最小
backend 修复和同输入复核；L01 资源安全仍 **BLOCKED**。

[L2 backend recycle 回归与两轮真实回放](../reports/2026-10-07-resident-l01-registry-recycle.md)
已补齐该切片：真实 LSP 子进程在旧实现中 L2 后首次查询报 `-32603`，
改为旧 LS 持有 Program 时由其自身 dispose、随后用同一 host/registry
建立空 LS 后，精确 references/definition 与诊断通过；真实 Settings 两轮
各 22/22 exact，采样的 L2/L3 registry 残余引用为 0。但固定构建 A/B 的
编辑最大时延达 28.227/27.004 s，冷 `createProgram` 可达约 21–24 s；
RSS 峰值下界分别为 1.518/1.030 GB，差异很大。故只关闭具体所有权
缺陷，**不**把 L01 资源/时延门禁改为 GO，也不据此进入 L02 生产接线。
[`L2 → 查询重建 → 再次 L2` 控制](../reports/2026-10-07-resident-l01-l2-rearm.md)
已补：真实 LSP RED/GREEN 区分第二次真实 trim 与无查询的连续 L2，
Registry 每次归零；但 Settings 固定构建 20 次编辑虽 22/22 exact、诊断
正常，仍有四次自动 L3 驱逐、七次 >20 s 响应及至少 1.969 GB Node RSS
峰值。故 re-arm **仅 `ARKTS_BENCHMARK_CONTROL=1` 加显式实验 flag 生效**，
生产默认保留一次 L2 行为；该功能正确性不能替代资源准入。
[后续公开 LSP RED/GREEN](../tdd/l01-l2-program-witness.md) 已收紧实验性
re-arm：无效 rename 不再触发第二次 trim，只有本次查询观测到正的 compiler
`createProgram` 事件才 re-arm。该信号不证明严格的 resident Program 身份，
更不使真实 Settings 资源门禁转绿。下一安全切片仍须在持续 L3 时阻止 full resident
LS 反复再准入，保持完整 transient 兜底或显式资源错误。不能只延迟/跳过
L3 驱逐掩盖预算超限，也不能据此进入 L02 生产接线。
[持续 L3 准入实验](../reports/2026-10-07-resident-l01-pressure-admission.md)
已用公开 LSP RED/GREEN 证明：自动 L3 下若 legacy refs 照常运行，会把
resident context 从一次创建变成三次；双重基准开关可令小夹具精确地走
conservative transient verifier，不再重复准入。但相同真实 Settings/API24
的 20-edit 回放只有 20/22 完整精确响应，另外两次在 24-batch 计划的
第 14 批前达到 180 s 超时，虽外采 Node RSS 峰值下界为 1.410 GB，
仍判 **NO-GO**。该标志保持默认关闭；“遍历全部文件”不等于可接受延迟，
也不自动证明所有跨 batch 语义等价。下一步仍在 L01：必须找到不重复
构建完整 resident Program、也不为陈旧索引重建二十余个冷 Program 的
完整语义路径；否则应明确资源错误，不能返回部分引用或宣称资源门禁通过。
上述 L2 阶段曾有固定 3–5 s 冷查询在本机超时；该历史失败保留在原报告。
本轮隔离 alias/barrel 公共 LSP 测试后，使用 fixture SDK 和允许 macOS 外部
RSS 采样的环境完整重跑 `pnpm check:fast`：**1322/1322 PASS，0 FAIL**。
这关闭当前源码的测试门禁，不改变真实 Settings 资源或产品时延判定。
[同构建 Settings indexed 控制](../reports/2026-10-07-resident-l01-indexed-pressure-control.md)
进一步区分了两类真实符号：`HomeInitData` 的三次请求均被当前代 index proof
收敛为一批且结果 exact，但耗时 11.088–13.624 s；`MenuController` 的
proof 不适用，仍走 24 批并在 180.011 s 超时。两次拟执行的 L3 控制因
`EVICTION_NOT_OBSERVED` 未运行，诊断/整体状态失败。故 index 缩小不是
所有符号的资源安全兜底，更没有取得 L3 准入；L01 仍 BLOCKED。
[同构建 legacy 对照](../reports/2026-10-07-resident-l01-matched-strategy-ab.md)
六次请求全部精确，但首个构造器查询 60.734 s、两次 L3 恢复 26.990/
23.468 s，外采 Node RSS 峰值下界 1.537 GB。indexed 只完成四次中的
三次，两次 L3 控制未执行，故两边峰值不能当作等量工作因果收益。
[L3 多批次准入保护](../tdd/l01-pressure-multibatch-rejection.md) 已以公开
LSP RED/GREEN 增加默认关闭实验的 fail-closed 边界：压力下计划超过一批
则在启动 verifier 前显式报资源错误，不返回部分位置，也不重试 seeded
anchor。小夹具的单批精确仍通过；这不限制单批 RSS，更不是 Settings 或
原始 >3 GB 用例的资源门禁通过。L01 仍 BLOCKED、L02 未获准入。
[真实 Settings 两次 L3 复核](../reports/2026-10-07-resident-l01-pressure-guard-settings.md)
进一步确认：六次请求四次完整精确，两次 24-batch 计划在 verifier 启动前
84.5/96.9 ms 返回明确 `-32803`，诊断正常；整体仍 **FAIL**，不能把拒绝
请求计入完整语义成功，亦未证明 1,024 MiB 的硬上限或 500 ms 产品目标。
[两次独立新进程的 L3 后所有权复核](../reports/2026-10-07-resident-l01-post-eviction-ownership.md)
又确认：每轮四次 references 精确、一次 L3 后显式资源错误；第一次驱逐后
正常自动诊断重新创建 resident context，使 Node RSS 再增加约 173/156 MB。
第二次驱逐后两轮 Registry 引用均归零，但 30 秒空闲终点仍约 1.024/1.008 GB
Node RSS。该结果证明诊断重建与 RSS 平台，**不证明**存活 AST 泄漏；
post-GC live heap 与 PSS 归属仍未取得。下一 L01 安全切片须在不关闭或
漏报诊断的前提下，阻止持续 L3 下诊断反复准入重 resident Program，
并用公开 LSP、真实 Settings 与独立内存观测验证；在此之前 L02 不获准入。
[同构建诊断准入级别复核](../reports/2026-10-07-resident-l01-diagnostic-admission-level.md)
纠正了“L3 驱逐之后”等于“诊断在 L3 准入”的推断：显式控制后的 v3
诊断虽创建 context 2，完成时实际为 `level1`；无显式压力的 20-edit
回放 22/22 exact、诊断通过，四次自动 L3 驱逐，最终 v21 诊断的
423-file Program 在完成时实测 `level3`。只对该最终诊断有直接见证，不归因
全部四次创建。下一安全切片先用公开 LSP 锁定**实际处于 L3** 的自动
诊断准入与版本发布，再复核真实 Settings 和独立内存；正常诊断须保留，
L01 资源准入仍 BLOCKED，L02 未获准入。

[L3 transient diagnosis 真实 Settings A/B](../reports/2026-10-07-resident-l01-transient-diagnostic-ab.md)
完成了下一项默认关闭的机制检验。真实子进程 LSP RED→GREEN 保持未保存
v2 诊断并避免在实际 L3 再准入 resident context；但固定 API24 工程的
1,024 MiB、20-edit 自然压力对照中 ON 路径 **0 次调用**，峰值差异不能
归因于该机制。另一个单次 512 MiB 人为 L3、2-edit A/B 确实有 3/3 次
transient 诊断，references 4/4 exact、诊断 payload 相同、resident
创建/驱逐从 7/7 降为 4/4，却使 Node/process-tree RSS 峰值分别增加
20.2%/19.8%，空闲尾值也更高。因此本轮**资源 no-regression FAIL**；
实验双开关保持 default-off，不批准生产推广、预算提高或 L02 准入。
两组 `READINESS_UNSUPPORTED` 与已执行语义/诊断检查分列；Mac RSS 是
外采下界，不替代 PSS/post-GC 归属，也不能据此断言泄漏。下一 L01
安全工作必须同时核算 resident 与 transient compiler state 的总成本。
[后续两组反序、同构建的诊断阶段归因](../reports/2026-10-07-resident-l01-transient-diagnostic-phase-attribution.md)
均保持 4/4 exact 引用和完整诊断，但 ON 峰值相对 OFF 分别为 +17.0%
与 −19.6%；连同首次 +20.2%，**差值方向不稳定**。最后 v3 诊断启动前
两个 ON 进程已分别占 1.460 GB 与 0.809 GB Node RSS，单次实验不能区分
GC 时机、父线程保留状态与 Worker 成本。第一次 no-regression FAIL 是该
次运行的真实结果，但不是可重复回归结论；同样没有证明收益。路径保持
default-off，下一步取得受控 post-GC live-heap/object 归属和可用平台的
PSS，再作更多独立样本。L01 资源准入仍 BLOCKED，L02 未获准入。
[同构建三对真实 Settings L3 后 GC 归因](../reports/2026-10-07-resident-l01-post-eviction-gc-attribution.md)
已取得这一切片的受控存活堆证据：六个新进程各有四次 exact references
和完整自动诊断，末次压力请求均为明确 `-32803`，所以整体仍 FAIL；三次仅在
benchmark 双开关下的 Worker GC 使已淘汰 context 后 `heapUsed` 从
638–646 MB 降至约 33 MB，但即时 Node RSS 只降 29–31 MB。Registry
采样引用均归零。这反对**该已淘汰 context**存在持续强引用，却不证明
生产 RSS/PSS 达标，也不能把强制 GC 设为产品策略。下一 L01 安全切片应
防止可回收的旧 compiler heap 与正常诊断重新准入发生重叠，同时保留
完整诊断、精确全局响应和预算边界；真实 PSS、原始 >3 GB 案例及 500 ms
门禁继续开放。L01 资源准入仍 BLOCKED，L02 未获准入。
该 GC 控制显式使用 `legacy` 和默认关闭的压力准入保护；24 批请求的
`-32803` 是完整性拒绝，不代表生产默认 indexed 路径也必然拒绝。
[随后三次独立 Settings indexed-after-L3 控制](../reports/2026-10-07-resident-l01-indexed-after-l3.md)
确认同一固定 SDK 下实际发生 context sequence 1 的 L3 驱逐后，
`HomeInitData` 的 ready/identity-complete proof 收敛到一批，三次均
10/10 exact、正常诊断通过；完整响应 4.557/4.564/4.586 秒。
这仅证明该符号的精确恢复，不覆盖索引不支持的构造器：后者即使
generation ready，仍须保守验证 1,496 个文件／24 批，不能用类名导出
冒充构造器身份。prepared-suite 的 semantic readiness 仍
`READINESS_UNSUPPORTED`，资源稳定性与 500 ms 门禁均未通过。
[L3 后显式 Worker 回收三对反序 Settings 对照](../reports/2026-10-08-resident-l01-semantic-worker-recycle-ab.md)
进一步在默认关闭的 benchmark 双开关下，以固定修复后构建、正常诊断和
等长 10 秒观察窗口证明控制可安全替换已驱逐且静默的 semantic Worker：
六轮 definition 1/1、未查 refs 10/10 全部精确，三对采样 Node 峰值相对
对照低 31.3%／31.6%／29.3%，但 refs 中位仍为 4.524→4.574 秒。
独立公开 LSP RED/GREEN 还修复了 witness 超时与并发未保存编辑导致的
stale-overlay 缺陷。该结果不是自动回收许可：查询前 RSS 没有同比即时
回落，100-edit/保守多批/原始 >3 GB/PSS/跨平台与 ready-state 门禁未过；
L01 资源准入继续 BLOCKED，L02 不进入生产接线。

## L02 — 增量刷新与语义新鲜度（使用 L01 可重放基线）

先对函数体普通编辑做 real-LSP RED/GREEN：未保存 overlay、文件版本和
compiler snapshots 必须指向同一最新输入；记录 Program 是否换代、
未变更 SourceFile/SDK AST 的真实复用、重建阶段和 complete answer。
**Program 换代本身不等于增量失败，也不应要求编辑后保持同一个 Program；**
L02 要证明的是正确的新代际能避免不必要的全域重做，并测量完整响应与
资源成本；未达到最终指标带入 L03/L08，不阻止本阶段实验。
L01 trace 已见编辑后 1495/1496 个 project
SourceFile 和 652/652 个 SDK SourceFile 被复用，但分组 Program 构建仍
约 1.08 s，故仅 AST 复用远不足以判 L02 通过。之后分别验证 public API、import、文件
创建/删除、package 和 SDK/target 变化，按失效范围重建而非复用旧状态。
任何未知依赖、版本跳跃或不可验证 delta 均保守重建；若结果滞后，
停用该快路径。S05 rejected compatible-disk flag 不作为 L02 已通过证据。

当前切片见 [L02 同内容晋升报告](../reports/2026-10-08-resident-l02-same-content-promotion.md)
与 [公开 LSP TDD](../tdd/l02-same-content-promotion.md)：只在 benchmark 双开关下
对有界、当前 membership 的同指纹 lazy 读取保留 script version；
真实内容变更、删除/通知及 membership 变化仍失效。Program 本体、文本
权威和生产路由不另建；API/import/create/delete/package/SDK 各边界及
真实编辑资源/时延继续作为 L02 工作，整体产品验收留在 L08。

后续 [独立失效与真实编辑报告](../reports/2026-10-08-resident-l02-invalidation-and-edit.md)
和 [TDD](../tdd/l02-promotion-invalidation.md) 已覆盖上述七类公开失效合同，
并修复配置重建后 definition 只含局部依赖、把新全局类误作空结果的问题。
正常有效定位保留原路径，缺失结果用完整合法范围复核；这不是晋升 flag
的生产推广。真实 Settings 的六次未保存引用编辑均 exact，Program
换代时复用 1495/1496 project、652/652 SDK SourceFiles，但完整编辑仍
556–595 ms；该控制没有发生 matching 晋升，不能归因性能差值。
新源码独立 `pnpm check:fast` 1338/1338 PASS、退出 0，无失败/取消/跳过；
前轮 whole timeout 保留历史失败且原因未定，不以新 GREEN 倒改旧账。
更长序列、未知 delta/根别名与压力恢复继续推进；冷 miss 和编辑成本
作为 L03 输入，不把最终内存/500 ms 指标重新设为阶段前置。

## L03 — 统一预算与成本感知回收（使用 L01/L02 实测证据）

先实测 initial、steady、编辑、global query 和 recovery RSS/PSS，
再确定 soft budget、pressure target、hysteresis、lease 与冷上下文
驱逐顺序；一个进程内 resident LS 和 transient verifier 的内存合算。
不盲增现有 1024 MiB 策略值，不把它当硬限额。压力下优先停后台/
低优先任务与回收 unleased 状态；未保存文本和执行中语义状态不能
因节省内存丢失。本阶段验证准入/回收与 L3 恢复的功能，记录切换和
编辑的资源趋势；长期 soak 与最终资源、时延判定统一交给 L08。

### L03 完成审计

2026-10-09 用户目标为推进 L03 计划完成。以下清单将本阶段原有预算、
准入、回收、校准和正确性要求收敛为可核验交付，不把已完成的护栏
替代统一政策，也不把 L08 产品目标提前。全部项目须有固定构建的
直接证据后才能将 L03 标为完成。当前 [A～E 完成审计](../reports/2026-10-09-resident-l03-completion-audit.md)
均为 PASS，阶段实施与校准 DONE；不授予生产默认推广或发布资格。

| 编号 | 完成交付与判定 | 完成证据 |
| --- | --- | --- |
| L03-A | 同一 Node PID 的 RSS 字节政策涵盖 resident 与 reference/anchor/diagnostic Worker；存活、lease、准备成本和释放分别可观察，不重复相加、不由计数虚构字节 | PASS；RSS owner、物理计数与公开生命周期控制齐备；真实校准记录 resident/reference/diagnostic，anchor 由当前公开矩阵核验 |
| L03-B | 在同一政策下明确保留、trim、成本感知冷驱逐、重任务准入/拒绝和恢复的决策；以实际 RSS 再判断压力目标，保护 leased 工作和最新诊断，保留全 scope exact 或显式错误 | PASS；[成本与实际压力回收](../tdd/l03-cost-aware-pressure-recovery.md) 实现逐个 RSS 复核、Worker 当前资格与拒绝后缓存保留；校准保留原预算与滞回，不选择自动替换 |
| L03-C | 代表性公开 LSP 矩阵通过：低/高压力及回落、resident 与单批 verifier/诊断、取消、编辑、两根和全关闭、lease/静默、默认关闭路径；未知输入仍安全回退 | PASS；当前六文件联合控制 20/20，完整 fast 的 164 个入口、1439/1439 通过；不以旧 160/160 或当前 20 例代替完整回归 |
| L03-D | 最新同构建真实 Settings/API24 对照覆盖 initial、steady、编辑、global query 和 recovery，记录 RSS、重建/冷恢复代价、正常诊断、exact oracle 与输入 pins；据此确定保留或修改 soft budget/target/hysteresis，并记录取舍 | PASS；[当前真实校准](../reports/2026-10-09-resident-l03-budget-policy-calibration.md) 选定配置/对照 26/26 exact、诊断一致；参数、实际成本、自动替换慢样本与回滚已记录；raw readiness 失败仍归 L08 |
| L03-E | 冻结实现后的 pnpm check:fast GREEN，源码/构建/测试身份可复核；完成报告给出参数、实际决策、回滚边界、剩余风险及 L08 接收项 | PASS；当前完整回归 1439/1439、退出 0、无 skip/todo/cancel；终态后源码、构建、十四个修改文件、测试入口及工程/SDK pins 一致，完成审计与 L08 交接齐备 |

统一字节政策可以用真实全进程 RSS，而不要求猜测每个 Program 的独占
字节。1024 MiB 是现有策略值，不是分配器硬上限；单个已启动 Program
的峰值与可取消/清理边界须实测并如实记录，不以新增文件数硬限制冒充
内存预算。长期 soak、最终内存降幅、500 ms/P95、PSS/DevEco、规模与
跨平台毕业明确交给 L08；不因此无限追加本阶段配置组合或阻塞 L04–L07。

实施顺序为按实际压力目标接入已有观测成本、完成联合公开合同、冻结
构建跑真实工程校准、选择并记录政策参数，最后完整代码回归与逐项审计。
若真实证据反驳候选政策，修改或回退该候选；不得将失败改写为收益。

以下保留各实施检查点，旧 whole、focused 与 NOT_RUN 仅属于当时源码，
不替代当前固定实现的 1439/1439 完整回归，也不倒改历史失败。

首个 [请求等待切片](../tdd/l03-recycle-request-wait.md) 已完成三个公开
RED/GREEN 与 v2→v3 characterization，focused 81/81 PASS。只对显式双开关
回收生效；无回收的正常请求不增加等待，该先行构建尚未接自动压力事件。
L02 源码固定构建的 1338/1338 whole 保留为上一检查点，本切片仅有
新源码 focused/类型/构建 GREEN，不冒称当前完整 whole 或资源收益。
后续 [自动回收切片](../tdd/l03-automatic-pressure-recycle.md) 已用真实 LSP
RED/GREEN 接入自然 RSS L3 驱逐和 quiescent/lease 见证，独立双开关默认关闭。
组合回归 86/86 PASS；trace OFF、缺少任一开关、已排队导航、未保存
v2/v3 的精确结果和正常诊断通过。[真实 Settings 同构建对照](../reports/2026-10-08-resident-l03-natural-worker-recycle.md)
无显式 L3/GC、无诊断屏障，四轮各 22/22 exact、配对诊断一致；一次
trace-off 的 Node 峰值 -28.2%，编辑样本 P95 +24.6%，全部编辑仍 >500 ms。
后续多根切片先用正常诊断及实际 L3 的公开 RED 定位单根资格限制，再
扩展默认关闭的自动入口：重新注册所有已知 root，按各 root 重放最新
未保存文本。独立 v2/v3 的精确定位、完整引用和正常诊断通过，当前
串行组合 117/117 PASS；手动单根资格、零 lease 见证、全局静默及
并发变更保护保留。全部文档关闭、统一预算和成本感知准入继续作为
L03 实施工作，不把最终资源/时延目标恢复成前序阶段门槛。
不把功能 GREEN 改写成资源收益，也不以旧 whole 冒称新源码完整 GREEN。
多根源码随后独立 `pnpm check:fast` 1380/1380 PASS、退出 0，无失败/
取消/跳过/todo；新增多根用例再次通过。该完整代码回归不替代 L08 的
资源、时延、长期 soak 或跨平台验收，先前失败/中断的历史账保留。
随后 [references 压力准入切片](../tdd/l03-reference-pressure-admission.md)
以公开 RED 修复 indexed/batched 未携带 legacy 既有 L3 限批资格的缺口。
默认关闭双开关不变，多批显式资源错误、单批完整响应、关闭路径和
最新 overlay/导航/诊断恢复通过，该切片串行 focused 50/50 PASS；当时新源码
whole NOT_RUN，不沿用上面的 1380/1380。本切片不把批数当作实际成本。
随后 [成本感知容量驱逐](../tdd/l03-cost-aware-capacity-eviction.md) 先通过
真实 LSP RED/GREEN 把成功 compiler 准备耗时记录到 leased resident 实例，
再在既有两个 context 容量内，默认关闭地优先驱逐较低观测成本的无 lease 根。
缺测、同成本和关闭路径保留 LRU；成本不等于字节或未来冷恢复保证，
不单独开启 L2 rearm，也不豁免 L3 释放。三根最新编辑、完整引用和
正常诊断通过，该检查点十文件 focused 67/67 PASS，源码 whole NOT_RUN。
随后 [全部文档关闭后的压力回收](../tdd/l03-closed-document-pressure-recycle.md)
以真实 LSP RED/GREEN 把非空文档要求限定到手动入口；自动入口在
已有 registered roots、实际 L3、静默和零 context/lease 见证下允许
零打开文档。引用在途仍阻止替换，关闭后显式 ContentModified，
两根重新打开的独立新文本、相同版本号与后续编辑/正常诊断精确。
两个关闭开关和手动入口资格保留，该检查点十三文件 focused 126/126 PASS，
源码 whole NOT_RUN，实验及真实工程 1024 MiB 策略均不变。
随后 [在途压力与 verifier 准入](../tdd/l03-midflight-reference-admission.md)
以公开 RED/GREEN 补上只在请求开始判断 L3 的缺口：已启动 verifier
可完成和清理，但请求内遇到 L3 后不再追加验证；尚未证明完整范围时
显式预算错误，不返回部分 Locations。请求内见证跨扩展/递归 fallback
保留，新请求重新判断；客户端取消与已证明完整的单批成功不被误拒绝。
关闭路径、最新编辑和两种声明策略通过，该检查点十一文件 focused
103/103 PASS，该源码 whole NOT_RUN；无新增开关、预算或生产默认变更。
随后 [准入前 RSS 刷新](../tdd/l03-reference-pressure-sampling.md) 用公开 RED
锁定实际 RSS 已高、记录等级仍低时多启动一批 verifier 的缺口；在
document preparation 后与各 verifier 资格检查前刷新现有 RSS/滞回 owner。
仍由原双开关控制，不相加 Worker RSS，不调高预算；取消优先、请求内
L3 见证、单批完整成功和正常诊断保留。三路、tracing 关闭与两个开关
关闭路径通过，该检查点十四文件 focused 120/120 PASS，源码 whole NOT_RUN。
运行配置接口先经 characterization 抽取，Legacy 文件减至 1058 行，
超限迁移债务仍保留。1 MiB 夹具停止线不是产品预算或资源收益。
随后 [transient Worker 生命周期核算](../tdd/l03-transient-worker-occupancy.md)
逐项公开 RED/GREEN 补齐 reference、anchor、诊断 verifier 的实际存活
计数与带时钟快照；真实 `exit` 才释放，RSS 按 Node PID 只计一次，
heap 字段明确为 owner isolate 观测。沿用指标文件 opt-in，未配置时
不安装额外 exit listener；边界观测不更新压力政策，不构造 Program。
取消与同进程恢复、tracing 关闭和正常 v2 诊断通过，该检查点十五文件
focused 153/153 PASS，源码 whole NOT_RUN；runtime 减至 470 行，
本切片未修改超限文件。物理计数不是 Program 字节或 RSS 回落证明。

2026-10-09 [真实 Settings 生命周期对照](../reports/2026-10-09-resident-l03-transient-occupancy.md)
在同一新构建、1024 MiB 与正常诊断下串行比较 dispose/budget-aware，
两轮各 4/4 exact，逐位置集合与最终诊断一致。保留 context 在首次引用
与 verifier 重叠，随后自然 L3 驱逐；两轮三次引用仍各新建 Program，
R-09 固定关闭，不能据此否定其复用机制。trace-on 峰值差异仅 -0.38%，
单进程归因样本不证明资源收益；移除 context 或 verifier 退出不等于
RSS 立即归还。产品源码未变，重放器 24/24 PASS，语义 focused 仍属
上述 153/153 检查点，whole NOT_RUN。下一切片以全进程 RSS、实际重叠
和成功准备成本校准准入，不按 context 数、文件数或单次 RSS 差造字节。

随后 [高压力 anchor 准入](../tdd/l03-anchor-pressure-admission.md) 的公开
RED 锁定候选定位在批次准入前多启动一次 compiler anchor 的缺口。
原双开关开启时，独立准备前先检查取消、刷新同一 RSS/滞回 owner；
L3 跳过发现优化，交回完整 scope，不向用户发布空引用。完整单批仍
精确完成，多批仍显式预算错误、无部分结果；关闭路径、低压力、
trace OFF、取消同进程恢复和最新 v2 普通诊断/导航通过。该检查点十五文件
串行 focused 160/160 PASS，源码 whole NOT_RUN。没有新增开关、
字节估算或生产默认；完整 scope 回退可能增加单批成本，新构建真实
工程 A/B 未测，不把少一个 Worker 改写成内存或时延收益。

当前 [按实际 RSS 与成本回收](../tdd/l03-cost-aware-pressure-recovery.md)
已完成逐次压力复核、成本排序、准入与恢复组合，联合控制 20/20、
回放器 35/35 及完整 check:fast 1439/1439 PASS，终态身份一致。
[固定构建真实校准](../reports/2026-10-09-resident-l03-budget-policy-calibration.md)
选定配置/对照 26/26 exact、正常诊断一致，保留 1024 MiB 与原滞回；
自动替换没有峰值优势且增加重复准备，不纳入本序列选定配置。
[完成审计](../reports/2026-10-09-resident-l03-completion-audit.md) A～E 均通过，
L03 阶段无剩余必需工作。单批峰值、慢冷恢复、其它规模/平台组合及
长期压力风险交 L08；不宣称最终资源收益，不阻断默认关闭的 L04–L07。

## L04–L07 — 逐能力接线，逐能力回退

| 阶段 | 实施切片 | 不可省略的门禁 |
| --- | --- | --- |
| L04 | Resident references，缓存 → 已证明完整覆盖的热 LS → 现行 indexed-batched/transient exact fallback | 两种 declaration policy、alias/re-export、overlay、全合法 scope 与 legacy exact set；miss/旧代/内存压力仍完整，不能冒充空结果 |
| L05 | Implementations 独立路由 | interface/override/generic/继承/同名与编辑后结果分别 exact；references 的投影不替代 implementation proof |
| L06 | Definition/typeDefinition、completion/auto-import、hover/signature 与正常诊断 | 精确 URI/range、补全 edit/sort/snippet/isIncomplete、当前 overlay 和诊断 code/range/version；references 进行时交互不被阻塞 |
| L07 | PrepareRename/rename 与 call hierarchy | 完整 WorkspaceEdit/冲突/版本及应用后验证；incoming/outgoing 方向与 `fromRanges` 单独对照 |

每阶段独立完成公开 transcript 并验证正确性、快照、取消与执行保护后
可试验路由；最终资源/时延未达标带入 L08，逐能力 feature flag 可回滚。
现行 transient
verifier 仍为兜底，不能因长驻 LS 存在就推断它的全局 scope 足够。
超预算/unknown 走完整安全 fallback 或显式错误。逐能力默认切换需
单独审查，ADR 0003 不被本计划自动 supersede。

### L04 完成审计

2026-10-09 L04 阶段 DONE。以下交付沿用本阶段 references 路由和
用户确认的阶段验收范围；当前 [完成审计](../reports/2026-10-09-resident-l04-completion-audit.md)
A～E PASS，完整回归与终态身份复核完成。不把功能合同
缩为单个热命中，也不把最终内存、500 ms/P95 或 semantic-ready 提前。

| 编号 | 完成交付与判定 | 当前完成证据 |
| --- | --- | --- |
| L04-A | 两种声明策略、alias/re-export、未打开/native 调用点、同名排除和完整合法范围，与独立完整 oracle 零差异；未查符号实际命中有完整覆盖及版本见证的 resident LS，不由答案 cache 冒充，命中不重建 Program/启动 verifier | 当前公开与真实控制 PASS；[选定政策组合](../tdd/l04-budget-policy-reference-contracts.md) 和当前两份 ON trace 首次引用队列实际同 Program/完整覆盖、9/10 refs、零 build/verifier |
| L04-B | overlay 增删、版本变化、配置/磁盘/SDK/package/target 身份失效后不使用旧 proof；返回最新完整结果，正常版本化诊断精确 | PASS：选定政策下 overlay/正常诊断、未通知 package retarget 拒绝旧 proof；原 SDK/options/target/link/source/unknown 独立合同保留并在当前完整 1449/1449 中通过 |
| L04-C | 共用 L03 字节预算、压力/成本政策，lease 与执行保护不绕过；取消、编辑、驱逐和恢复安全，miss/unknown 为完整 fallback 或显式错误，零 partial-success；默认关闭及 tracing 关闭保持正确 | 当前四文件选定政策 10/10 PASS，含低/高压力、完整/拒绝、物理 verifier 与 resident 请求取消恢复、交互调度和 trace OFF；默认关闭及原完整 fallback 保留 |
| L04-D | 同一当前固定构建 Settings/API24 的 R-09 ON/OFF 对照，两种 declaration policy 均完整 exact/诊断一致；首次未查、稳态、编辑、global query 和恢复有实际路由及 RSS/准备成本/完整响应记录，trace 与 timing 分开，输入 pins 不变 | [真实阶段控制 PASS](../reports/2026-10-09-resident-l04-budget-policy-integration.md)：八进程 52 项 exact、四对位置/诊断相同，inputs 不变、产品退出 0；热查询、准备/恢复成本与更高峰值如实记录，raw readiness FAIL 仍归 L08 |
| L04-E | 冻结实现后的完整 pnpm check:fast GREEN，源码/产物/测试及工程/SDK 身份一致；逐项完成审计、实验配置、回滚、失败记录和 L08 风险交接齐备 | PASS；类型/构建/release sidecar 前置通过，根回归 1449/1449、退出 0、无 fail/cancel/skip/todo；五个修改测试/夹具、164 个入口及源码/产物和工程/SDK 等终态身份一致，完成审计与交接齐备；旧 L03 1439/1439 和 focused 不冒充当前 whole |

实施顺序为先完成现有路径 characterization，再逐个补联合公开合同，
必要修复用 RED/GREEN；冻结构建后串行真实工程对照，最后完整回归与
逐项审计。不新建公共语义层、cache owner 或 capability，不提高预算、
缩小合法 scope、静音诊断或改变生产默认；R-09 opt-in 可独立关闭回退。

### L05 完成审计

2026-10-09 目标为完成 L05，沿用 implementations 独立语义及用户确认的
五项阶段验收；不将 references 的热命中投影为 implementation proof。
当前阶段 DONE，[完成审计](../reports/2026-10-09-resident-l05-completion-audit.md) A～E PASS；
[选定政策公开合同](../tdd/l05-budget-policy-implementation-contracts.md)
已扩展至 23 项，当前十文件联合 132/132 PASS。真实 Settings/API24
完整 oracle 已由当前构建各两个独立冷进程重新核验；[四轮 ON/OFF 控制](../reports/2026-10-09-resident-l05-budget-policy-integration.md)
22/22 exact、配对正常诊断一致，冻结后的完整回归1467/1467、终态身份复核通过。
未以公开 focused、既有五类合同或 L04 whole 代替冻结后的完整回归和完成审计。

| 编号 | 完成交付与判定 | 当前进度 |
| --- | --- | --- |
| L05-A | interface/generic/alias、继承/override/成员、未打开实现及同名排除，与独立完整 oracle 零差异；有效完整 LS 对未查目标有实际复用见证，不以缓存或 references 投影冒充 | 当前公开 PASS：277-source 未查目标同 Program、零 createProgram，compiler alias 完整保留；真实当前 oracle 为 IService 6 处/About 1 处 |
| L05-B | overlay 增删及 UTF-16 变化、配置/磁盘/SDK/package 等代表性输入失效后使用最新完整结果，正常诊断 code/range/version 正确；未知输入不沿用旧 proof | 当前公开 PASS：配置/SDK/package、overlay/UTF-16、未知范围拒绝及恢复、多根 close/reopen；R-09 OFF 同样独立保护，不发布旧子集 |
| L05-C | 接入选定 L03 RSS/成本/压力政策，保持 1024 MiB、原滞回及 lease/执行保护；实际执行中取消无 partial-success/第二终态，驱逐/Worker 恢复后精确，trace OFF 同样正确，默认与完整安全路径保留 | 当前公开 PASS：compiler-in-flight 唯一取消、完整 4003 处恢复、压力/成本/lease、实际 Worker 替换及 trace OFF；64 MiB Worker 恢复仅功能 qualification，未提高正常预算 |
| L05-D | 当前固定构建 Settings/API24 实验 ON/OFF 对照；未查目标、稳态、编辑及恢复完整 exact/诊断一致，trace 与 timing 分开；记录实际复用、准备/完整响应/RSS 及不变输入 pins | 当前阶段控制 PASS：四进程 22/22 exact、两对集合/最新诊断相同，输入不变、产品退出 0；两侧实际完整 Program 复用、ON 38 个晋升保持 generation，完整响应/RSS 与慢恢复如实记录，raw ready FAIL 留给 L08 |
| L05-E | 冻结后完整 pnpm check:fast GREEN、终态源码/产物/测试/工程/SDK 身份一致；逐项审计、配置回滚、失败记录与 L08 风险交接齐备，生产默认不变 | PASS：类型/构建/release sidecar前置通过，根回归1467/1467、退出0、无fail/cancel/skip/todo；13份修改文件、164入口、310测试/脚本和源码/产物/工程/SDK等终态身份一致，清单/oracle未变；审计交接齐备，不以旧1449或focused替代whole |

先保留现有 characterization，再按公开行为逐个补合同，必要修复用
RED/GREEN；真实工程串行控制完成后运行完整回归。500 ms/P95、最终
内存下降、semantic-ready、长期 soak、规模及平台毕业均留在 L08，
失败如实交接，不作为 L05 阶段完成的前置。

### L06 完成清单

2026-10-09目标为完成L06，沿用用户确认的A～E范围；
[本轮公开合同](../tdd/l06-budget-policy-interactive-contracts.md)接续原八项交互合同。
当前阶段DONE，[完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS；19公开case/联合252、当前多能力真实62和全新whole1492全部通过，
终态冻结身份一致。旧57/57、definition8/8和四轮whole失败均为历史，
不替代当前证据，不改变生产默认或宣称L08最终产品毕业。

| 编号 | 完成交付与判定 | 当前进度 |
| --- | --- | --- |
| L06-A | definition/typeDefinition、hover/signature及completion/resolve/auto-import完整payload与独立oracle或完整基线一致；保留URI/UTF-16、参数/激活位置、edit/sort/snippet/isIncomplete和来源；新目标实际复用有效LS，不以cache冒充 | 当前19项交互公开case及联合252/252 PASS，原八项及struct坐标合同保留；第五轮真实控制完整多能力payload一致，未查definition ON同Program/零create，OFF独立重建；不由答案缓存推断 |
| L06-B | overlay/API、配置、SDK/package等代表性变化后使用当前输入，诊断code/range/version正确；旧resolve句柄不能应用，未知输入安全回退/明确错误，合法截断补全如实标记 | 当前252/252含API三配置、六类package/同版本resolve、SDK配置、最新v2诊断及补全配额；新false目录变化可完成、true瞬时读取必须拒绝并通知恢复，owner/target/负路径容量兼容通过；第五轮真实v2完整hover/最新诊断一致 |
| L06-C | 选定L03 RSS/成本/压力政策、正常1024MiB/原滞回/lease保持；取消无partial-success/重复终态、编辑拒绝旧代、驱逐/Worker恢复精确；references实际在途时交互完成，trace OFF及默认完整路径正确 | 当前252/252含三配置member/resolve/snippet/auto-import及取消、refs实际在途、共享RSS/lease、物理Worker恢复和诊断保护；64MiB仅功能qualification；第五轮真实选定1024MiB政策及trace OFF路径通过，默认不变 |
| L06-D | 当前固定构建Settings/API24代表性多能力ON/OFF对照，覆盖未查、稳态、编辑和恢复；完整payload及最新诊断相同，trace/timing分开，实际复用/准备/完整响应/RSS和不变pins齐备 | 当前第五轮阶段PASS：[真实对照](../reports/2026-10-10-resident-l06-budget-policy-integration-v5.md)16独立冷基线、四进程62/62、两对完整payload/最新诊断/池/pins一致；实际Program复用、准备/完整响应/RSS齐备，产品退出0/raw readiness FAIL保留给L08；旧四轮身份不重写 |
| L06-E | 阶段冻结后完整pnpm check:fast GREEN、终态源码/产物/测试/工程/SDK等身份一致；逐项审计、配置回滚、失败记录和L08交接齐备，生产默认不变 | PASS：全新完整1492/1492、退出0、无fail/cancel/skip/todo，2039816.131497ms；316测试/工具、172登记/166 fast入口、100基准输入、42修改文件及全产品/工程/SDK身份一致，四份D初始/postflight pins实际核对相同。完成审计/回滚/失败/L08交接齐备；输出截断和一次观察缺口明确保留，不冒称逐字完整日志 |

先公开characterization，再逐项RED/GREEN或现有组合验证；冻结后串行
真实工程控制，最后完整回归及身份审计。最终500ms/P95、内存收益、
semantic-ready、soak/规模/跨平台留在L08，不作为L06阶段完成前置。

用户2026-10-10确认：L06完成后继续推进L07至完成；L07按自身功能、
公开合同、当前真实对照和冻结审计验收，不等待L08最终产品指标。

以下段落保留2026-10-08历史起点；当前进度以随后L07完成清单为准。
L07 的 [rename/call hierarchy 合同](../tdd/l07-resident-edit-and-call-contracts.md)
已取得完整 WorkspaceEdit 应用后验证、三层 alias 边界、双向 fromRanges、
未打开 follow-up、v2/v3 overlay 与实际 Worker 替换/早期取消的功能证据。
消费端本地 alias 与同模块 class 的冲突漏检经公开 RED/GREEN 修复；
未打开 follow-up 的临时 source staging 使 root snapshot 失效后，正常
诊断不再永久丢失，而经原 debounce 按最新文档重调度。并行 69/71 的
失败保留，固定时序复现后修复为当前并行 72/72 与 focused 88/88 PASS，
不靠提高超时。该历史检查点L07仍IN_PROGRESS，不冒称一般成员/嵌套捕获/所有冲突、
真实工程或 semantic-ready 已完成；后续预算准入与 L08 产品验收继续。

### L07 完成清单（2026-10-10 接续）

当前基线为L06完成后的固定实现及完整1492/1492；L07既有11项公开合同
在这次whole中也通过，但不能替代L07新组合、当前真实控制和收口审计。
先保留characterization，按公开stdio逐切片RED/GREEN；不无限追加
所有冲突/方言/平台矩阵，那是L08最终验收，不改变1024MiB/原滞回/默认。

| 编号 | 完成交付与判定 | 当前进度 |
| --- | --- | --- |
| L07-A | prepareRename及完整版本化WorkspaceEdit、实际应用后源码/定位/诊断；alias层次、代表性冲突原子拒绝；prepare/incoming/outgoing完整item/方向/UTF-16 fromRanges；未查目标实际复用有效完整LS，不以references/cache投影冒充 | 当前25生产公开case，完整编辑应用、class/alias/同owner成员冲突、双向调用/整文件module及follow-up/伪造项拒绝通过；当前D实际11源晋升、未查prepare同暖机Program/零create，OFF重建反事实成立；不冒称所有冲突矩阵 |
| L07-B | overlay及配置/SDK/package等代表性输入变化后使用当前完整结果，诊断code/range/version正确；旧item/旧编辑不得应用，未知输入安全回退或显式错误 | 五类实际package陈旧编辑/item/边RED→加载见证保护和通知后完整冷oracle恢复；SDK project配置五类拒绝/最新v2完整payload及2322诊断通过，旧item/移除caller及版本化编辑保留 |
| L07-C | 接入选定L03 RSS/成本/压力政策，正常1024MiB/原滞回/lease；取消唯一终态无partial-edit/partial-call，编辑旧代拒绝，驱逐/物理Worker恢复；trace OFF和默认完整安全路径保持 | 四配置rename应用/calls编辑全payload与诊断一致，五类唯一早期取消及完整恢复通过；选定政策物理Worker恢复仅64MiB功能qualification，正常1024MiB不改，不冒称compiler-in-flight或物理RSS下降 |
| L07-D | 当前固定构建Settings/API24实验ON/OFF，未查/稳态/代表性编辑和恢复完整编辑/调用payload及最新诊断一致；trace/timing分开，实际复用/准备/完整响应/RSS和不可变pins齐备 | [当前D](../reports/2026-10-10-resident-l07-budget-policy-integration-v4.md)PASS：16同产品独立冷进程、四控制62/62、两对完整payload/最新诊断/pins一致，11源真实晋升及未查Program复用有实际反事实；所有慢查询/高RSS/raw readiness FAIL保留至L08 |
| L07-E | L07冻结后新完整pnpm check:fast GREEN及终态源码/产物/测试/工具/工程/SDK身份一致；逐项审计、配置回滚、失败记录和L08交接齐备，实验默认关闭 | [完成审计](../reports/2026-10-10-resident-l07-completion-audit.md)PASS：全新完整1511/1511、根退出0，无fail/cancel/skip/todo；319测试/工具、207产品输入、173登记/167fast、301benchmark/41tracked修改与新增全向量终态全部相同；四D/16cold前后pins实际一致，失败记录/配置回滚/L08交接齐备，不借用旧whole或focused |

## L08 — Soak、性能与发布评审

L08 是整体最终验收阶段，统一执行完整能力/场景矩阵、semantic-ready、
500 ms 优化目标 / 550 ms 验收上限、原内存、长期资源稳定性与跨平台门禁。前面阶段持续记录数据和
修复切片缺陷；这些最终目标及不足样本不阻塞 L01–L07 的实现顺序。

Settings 真实工程的冷准备、未查询符号、未打开模块、普通编辑、驱逐
和重启恢复分桶报告完整响应 P95；目标为适用能力各桶≤500 ms，
2026-10-10 用户明确确认正式验收上限为≤550 ms，仅调整这一时延上限；
≥100请求/≥5会话、336格及下述其它门槛不变。历史500ms失败保持原判定，
不能用 cache hits 稀释。保留旧 references >3 GB 复现/50% 目标、
DevEco 对照 PSS、100k 工作区缩放、post-eviction 与 Windows/macOS/Linux
可移植性门禁；Node RSS 不代替 Linux PSS。长时 repeated/edit/pressure
soak 不得单调增长，0 exact diff、0 partial-success、0 OOM。

任一发布必需门禁 FAIL/BLOCKED/NOT_RUN，则当前实验能力保持 default-off，
不宣称项目计划或 500 ms 产品目标完成。只有明确验证的 release review
才可逐能力毕业；旧 S02/S03/S05 失败记录永久保留。
