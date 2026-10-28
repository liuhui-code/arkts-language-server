# 30K 交互可用性、路径工作量与恢复修复清单

父版本：`17e923f0cb8c430b6a10793a0f3d2f9097febfec`。分支：`fix/partial-program-lifecycle-20261026`。
状态：本轮修复、规模对照和最终fast完成，剩余限制逐项保留。不自动提交、发布或合并。原证据：[详细归因](../reports/2026-10-26-main-30k-unavailable-root-cause.md)。

## 用户原问题（原文保留）

> 意思是文件太多导致的？我们不是做了不和文件数成正相关的优化吗？文件数多，理论上只是初始化慢一点，后续其他功能应正常。为何会终止诊断、终止旧 Worker？哪来的旧和新？为何 partial、什么交互 Program？realpath 调用 18 万次怎么回事？请记录这些问题，弄清楚原因，一一优化。

不能以“文件多”代替根因；不能先把“只有初始化随规模变化”当成既成事实。
当前用户已授权与这些问题直接相关的缓存/路径优化；其他缓存 TODO 继续暂停。
455 文件冷目录 3 秒性能门槛沿用既有跳过授权，其他正确性和完整性检查保留。

## 可核验事项与顺序

| 项 | 状态 | 完成依据 |
| --- | --- | --- |
| 1. 审计既有规模优化：对应提交/源码/测试、受益路径、仍依赖总数/入口/实际闭包的路径、缓存前提和缺失覆盖 | DONE | [实施报告第1节](../reports/2026-10-26-30k-optimization-execution.md)：逐提交/范围/缓存对应，旧增长反例保留，未外推跨20K边界 |
| 2. 解释初始化/诊断/查询/Program/partial/Worker 世代，记录完整输入、终态与状态迁移 | DONE（UI内部来源未测） | [报告第2节](../reports/2026-10-26-30k-optimization-execution.md)：第一条线程来历、Zed通知、父端监督和回放；不虚构产生close的UI内部事件 |
| 3. 隔离初始化项目预装与交互入口，保留 SDK 预热；验证首次/热/编辑查询各自承担工作 | DONE（全局范围能力仍有限制） | S1/S1b/S1c/S4公开RED→GREEN；原30K局部Program87项目文件，SDK初始化1633份，失败global后编辑仅更新1份而非87份；[报告8.1/8.2](../reports/2026-10-26-30k-optimization-execution.md) |
| 4. 拆解 186768 realpath：唯一路径、频次、来源/阶段、SDK/项目比例和缓存作用；消除可证明重复工作 | DONE（原探针缺失部分无法追溯） | 相同候选61→1且后建高优先级文件仍拒绝；新完整分布窗口180818次/7515唯一，旧Program176895次到新局部3391次；原186768仅前4096路径，明确未假造全分布 |
| 5. 理顺取消/恢复准入：普通关闭/诊断取消不无谓连累前台，真正不返回仍可中断 | DONE（协议/受控，真实UI未测） | 最终Zed捕获协议1个语义owner世代、0非预期换代；有限活动/无活动/假活动绝对截止、共享预算/租约清算/单终态/物理退出原回归在完整fast通过 |
| 6. 规模对照和最终检查 | DONE（包含失败/未闭环项） | v5九档各三轮，复用固定main三轮；全部逐次数据保存。最终`pnpm check:fast`2050/2050，零fail/cancel/skip/todo；500ms、>20K完整global、真实UI/自然OOM及索引终局内存仍按报告限制处理 |

实施依赖：1/2 → 3 → 4 → 5 → 6。每个行为切片先 RED，再最小实现及相关 GREEN。
第 5 项的准入和取消机制不得依赖第 4 项“碰巧变快”才能正确。
原 30K/SDK/目标/内存与截止时间保持；真实 Zed UI 与协议重放分开，保留未保存编辑，不绕过权限。

## 当前已知事实与待证假设

1. checkpoint-23 已明确完整引用/rename 随真实输入增长，热定义不是冷定义，最大规模 2048；没有证明全功能规模无关。
2. 增量输入优化测过 20000，但没有跨 20000→20001 的 membership 分支；本次 30K 的复制 barrel 依赖图也不同。
3. 若 partial 初始化不再把项目预装传入交互根，首次局部查询入口应从 280/281 缩到目标实际闭包；SDK 仍须在初始化提前解析。
4. 若路径身份工作量来自同次同步中的重复实际父目录解析，安全复用应减少 realpath，而独立终检仍能拒绝变更/符号链接替换；不能仅以新鲜度 Map 存在推断命中。
5. 若取消发生在安全提交边界内，监督端应区分可结清的同步准备与永久不返回；不能让关闭文档为无关新请求制造通用内部错误，也不能靠延长截止时间掩盖不返回。

## 执行记录

- 2026-10-26：保留两份既有未提交报告，创建独立修复分支；产品父版本未改。
- Context7 TypeScript 文档查询连接失败；后续采用官方 TypeScript/Node 源码核验，并记录适用边界。
- RED/GREEN 命令、检查结果及前后实测在后续条目持续追加，失败样本不删除。
- S1 RED，父版本 17e923f：`node --test tests/semantic/partial-project-initialization.test.mjs`，1 FAIL、0 skip/cancel；真实 20005 源文件跨过 20K 后 SDK API 初始化解析次数为 0（预期 1），证据 `.bench/30k-optimization-20261026/s1-red.log`。先实现 partial SDK-only 初始化，再验证局部根隔离，未改变成员上限。
- S1 GREEN：公开 partial 回归及原初始化整文件 10/10 PASS，证据 `s1-green.log`。SDK-only 初始上下文不接收项目预装 documents，实际 SDK/标准库提前解析；partial 仍如实报告。共享 SDK、配置恢复、即时编辑和初始化压力豁免的原回归同时通过。
- S2 RED：`node --test tests/semantic/relative-candidate-reuse.test.mjs`，60 个 SDK 声明导入相同相对模块，针对同一缺失 `.ets` 优先候选实际 stat 61 次，预期最多 2。证据 `s2-red.log`。本切片仅复用同次同步查询已见证的候选，仍逐 importer 做物理边界核验，并保留独立终检；不跨请求保存路径资格。
- S2 GREEN：上述候选回归及目录、输入终检、已知源码读取窗口合计 21/21 PASS，含 8250 文件、后续候选创建、namespace/read-window 变更拒绝，证据 `s2-green.log`；候选缓存按 1MiB 字符串记账，溢出普通解析，同步查询结束清空。
- S3 RED：`node --test tests/semantic/progressing-synchronization.test.mjs`，真实 child LSP 的后台诊断逐个读取 60 份 SDK 声明（每个有限 40ms），期间 close/reopen 后前台 definition 得到同样 -32603；证据 `s3-red.log`。采用匹配 command/epoch 的同步检查点活动见证，绝对执行截止仍不变；无活动仍执行原取消宽限，不能用活动绕过卡死保护。
- S3 初版观测不足：只在 Host cancellation token 上计活动，未覆盖这份 SDK 图真实读取点，回归仍 FAIL；活动 hook 初次放置错误的失败运行也保留为 `s3-green-v2.log`。改在实际固定编译器 SourceFile/绑定入口补活动观察后，原取消/恢复与新有限构建用例 16/16 PASS（`s3-green-v3.log`）。持续假活动＋绝对截止的额外公开验证 2/2 PASS（`s3-absolute-boundary.log`）；配置值未提高。
- S1b 新 RED：局部定义成功后请求完整 references、rename，再局部定义，拒绝的全局请求仍把无关源码装入交互 Program。`s1b-red.log` 保留；这证明只修初始化还不完整。修复在完整范围准入边界先拒绝 membership partial，既有索引 planner 本来也要求 complete（`reference-search-planner.ts:38–39`），不截断结果或删除索引功能。
- S1b GREEN：全局失败后局部查询及原 readiness 生命周期/准入共 20/20 PASS（`s1b-green.log`）。随后 S1c RED 揭示 Node 仍为注定无法完整的预装读取 252 份无关 noise 正文（预期 0），证据 `s1c-red.log`。因此仅跳过 partial 的无关正文预装，保留原 membership 枚举、目录/输入资格和后续完整性错误；同时提取初始化锚点选择职责，现存超限 DocumentStore 行数下降。
- S1c GREEN：与原初始化、相对候选、有限活动和绝对截止共 13/13 PASS（`s1c-green.log`）；无关 Node 正文读取 252→0，stat 相对候选 61→1。DocStore 1773→1765 行；TypeEngine 500→499 行，剩余超限债如实保留。
- 冻结候选 v2：`candidate-v2-manifest.json`，源码摘要 `9f03c7d7bc96773150ed0db5ed30580c522cb24a4c16982aec60c6d3abfad0d5`，server SHA `4f7ab7766367bd28f30a33800c178d31d51e64c0a93baf8846639042471044cb`。复用原规模夹具的13操作试跑，两版64文件全部正确；pilot单列，不混入三轮统计。
- 首次完整检查的3项兼容性失败、原错误合同恢复和正文/清单测试拆分见[详细TDD记录](../tdd/30k-partial-initialization-20261026.md)。旧检查退出130，保留原始失败；不能写成通过。
- 冻结候选 v3：`candidate-v3-manifest.json`，源码摘要 `92c14fb388c62075c0a83e679021dea32c756e182332b866c3005eba14a283fa`，Worker SHA `8350b7acf13de88b5f6d8ee4bcd607fc0f60dcf03fafad979c6ddc13127a6047`。两版17操作pilot通过，正式多轮原始结果在 `runs/*-normal-r*/`，含实际应用rename的编辑后查询；失败全保留。
- v3矩阵54会话已尝试，2项外部RSS保护中断保留。真实30K编辑诊断继续发现打开文档的partial rename会伪造rootDirty，下一次局部查询重解析87份项目源码；新RED证明未变依赖解析2而非1。S4改为既有membership实扫、没有真实变化就不伪造失效；33/33及额外4/4通过，真实磁盘修改仍返回新行号。
- 最终候选v4：源码摘要 `9bb486753cb394636a464c8c724321e5e4cd5c66108bfeb6375e045af2d71fb0`；Worker SHA `d600e3c40ac2acdeab70c8521b87ba6c80af75c39aad492aab57fe1531595462`。重新测九档候选各三轮，旧main控制制品和输入不变，v3数据不混算；v3完整检查已因该新增缺口中止并保留，不宣称通过。
- v4完整2050项中2049通过、1项引用能力文案不兼容；S5恢复结构化workspace-incomplete的原能力文案，13/13相关回归通过。冻结v5，源码摘要`328cccff06061a673878e283290427314e5dc5290f5c264f3687c308bbed81c9`；重测九档三轮与真实输入，最终fast **2050/2050 PASS，退出0，零cancel/skip/todo**。760项输入、实际编译器及5项生产制品检查前后SHA相同，server/Worker匹配冻结v5。
- 补充83.474s资源观察：无OOM/保护中断，Node峰735.039MiB、原生峰2958.582MiB，末尾定义82.669ms正确；75s等待预算内仍未见catalog终态，不宣称完整索引稳态已测。真实UI、自然OOM、完整>20K global与所有操作500ms继续未闭环。
- 最终原项目身份核验如实FAIL：copy_003.ets的EOF增加换行，mtime16:26:49 UTC晚于v5主测、早于补充资源运行；其他29999源码及2859 SDK输入一致。来源未核实，保留现文件与差异，不恢复用户项目、不归一化哈希；补充资源观察不当作严格原始字节对照。隔离规模夹具逐轮身份仍全部一致。

## 2026-10-27 新增：编辑撤销后连续跳转失效

- [x] 保留用户 08:00 左右真实 Mac Zed 证据，确认 copy_003、PID92778、v5 制品身份。
- [x] 确认 8 次取消宽限退役和最终恢复熔断；后续请求仍到服务端，但返回 Semantic worker unavailable。
- [x] 公开 LSP RED 复现有限依赖准备忽略取消、继而使后继导航失败；原始命令和两轮失败不删除。
- [x] 将已有 DocumentStore 检查点接入同一请求取消域；不扩大同步免取消区，不改变截止或恢复预算。
- [x] 覆盖 definition/completion 被取消、undo、后继另一文件 overlay mutation、连续正确行号及单终态。
- [x] 最终完整fast2052/2052通过、零fail/cancel/skip/todo，冻结输入/制品SHA不变；普通 30K 重放结果见[本轮报告](../reports/2026-10-27-edit-undo-definition-unavailable.md)。
- [ ] 现场精确编辑文本/节奏与每次内部阻塞点未捕获；实际 Zed 点击验收继续单列，不能用协议替代。
