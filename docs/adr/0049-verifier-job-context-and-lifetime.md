# ADR 0049：复用验证 Worker 的逐任务上下文与生命周期

- 日期：2026-11-24。
- 状态：**Proposed；已授权实施，本地最终 check:fast 2807/2807，独立审阅及平台CI待完成，不追认 Accepted。**
- 范围：PR119 暴露的 verifier 回调上下文串扰，以及与之直接相关的 job 终态、复用和退出责任。
- 依据：[根因与历史核对](../reports/2026-11-24-pr119-merge-gate-root-causes.md)、[详细转换表与实施边界](../plans/2026-11-24-verifier-job-ownership-state-machine.md)。
- 固定候选：`c869ade983006c700c49e883d02340e120c0ea9d`。诊断原始数据：`.bench/pr119-diagnosis-20261123/`。

## 问题及历史

一次 references 请求可以依次产生 anchor、batch 和 fallback 等多个验证 job。
SDK 缓存 Worker 的生命周期跨越这些 job，也跨越不同请求与 workspace root。
请求、job 与物理 Worker 因而不能共用一个生命周期或一个“当前取消”变量。

历史 `f4ddfe4` 将共享 activeCell 改为 AsyncLocalStorage，隔离独立请求的 Promise 链。
`3add697` 引入常驻 verifier 后，没有补齐跨任务消息回调的上下文绑定。
该 client 文件在上述提交、main `1e3886d` 与 PR119 的 SHA256 相同；不是本轮把旧修复回退。
本轮词法回退检查点暴露的具体序列为：A 的验证 job 已完成，A 外层回退才取消，B 复用空闲 Worker。
回调在 A 创建的异步资源上下文执行，动态 Host token 读取 A 的单元，而不是 B。

实测 `context-1.jsonl`：B 注册监听时读取 cell2/active，消息回调读取 cell1/cancelled，
异常映射时 B 自己的 cell2 仍 active。由此抛出的普通取消 Error 被映射成 -32603。
这说明单元状态正确但所有权读取错误；单一终态、串行队列或增加 enum 均不能单独修复它。
现有取消回归没有固定“verifier 已空闲、外层才取消”的窗口，过去单轮 GREEN 不能排除此路径。

记录时 Linux parent-retarget 的具体拒绝证明未定位；后续已在 Mac 控制诊断顺序复现同型故障，
定位为目录资格撤销传播，按 ADR0044 独立修复。它与本 ADR 不同源，Linux 实机/CI 复验仍待完成。

## 决定

### 1. 延续已有架构，分清三层所有权

- 父层 LSP/supervisor 继续拥有请求取消首因、root epoch、revision/version、新鲜度、公开终态和恢复准入。
- registry/verifier client 继续拥有单个串行物理验证 Worker、SDK 缓存、job 队列、退出和关闭责任。
- 单 job 拥有不可复用身份、所属请求执行上下文、输入引用、任务回调/监听/计时器及自己的结果和清算。

不另建全局调度器、证明版本系统、状态机依赖库或第二套恢复预算。
现有 supervisor、watchdog、retirement、failure recovery 仍为各自层级的唯一权威。
对外 LSP 合同不因本 ADR 改变；内部 verifier envelope 可以增加必要的 job 身份。

### 2. 上下文必须按 job 显式绑定

入队时在调用者请求域捕获任务执行上下文；消息、error/exit、取消及队列续作的 job 入口恢复该上下文。
采用运行版本支持的 AsyncResource/runInAsyncScope 等明确机制，动态检查本请求的真实取消单元；
不能缓存一次 false，不能使用共享可变 currentCell，也不能清零已取消请求的单元。

绑定应同时覆盖依赖执行上下文的取消、证明观察和 trace，不只包装一个取消谓词。
长期 Worker 与持久监听在无请求的 owner 装配域创建，不永久继承首次请求的上下文。
把在 A 域中新建的资源取名 owner 并不产生中性上下文。
job 完成后移除监听、清除计时器、释放输入/上下文引用，任务异步资源销毁一次。

### 3. 显式 job 与物理 slot 状态

物理 slot 使用 `absent | live | retiring | closed`，live 的 idle/busy 从 activeJob 派生。
retiring 保留原 handle 和唯一退出 Promise；实际退出前不能变 absent 或创建替代者。
closed 为 owner 终态，不能由后续排队续作重新激活。

job 使用 `queued | running | cancel-pending | settling | settled`：

| 事件 | 合法转换与责任 |
| --- | --- |
| 准入、slot 可用 | queued→running；入队分配 jobId，派发时一次绑定 `{verifierGeneration, jobId}` |
| 排队取消/旧配置失效 | queued→settling→settled；不实际发送，不终止其他 active job |
| 匹配正常终态 | running→settling→settled；原 runtime 先 dispose 项目 LS，再发送结果 |
| 运行取消 | running→cancel-pending→settling→settled；撤销成功资格，继续持有实际清算责任 |
| 异常、exit、发送失败 | 未结清 job 选择失败或保留已有取消首因，清算一次；资源故障独立上报 |
| 重复终态或迟到取消 | 不重选结果、不再次清算；不从 settled 返回 running |
| 外层 A 在其 job 结束后取消 | 只撤销 A 外层结果；不得取消或销毁 B 的 job/Worker |
| owner close | 停止准入，结清队列/active，物理退出后 closed |

调用方 result 与资源 drained 必须分开：先回复取消不代表物理工作已经结束，也不代表槽位可复用。
settled 表示该 job 的结果已选定且资源责任完成；成功、取消、失败是 outcome，不以额外布尔字段复制状态。
runtime-ready、Program 返回、语义 READY、postMessage 返回和父端接收亦不能互相替代。

### 4. 身份与终态不变量

先匹配实际 handle、verifier generation、jobId 和允许阶段，再进入 job 上下文。
不在 callback 中猜测当前请求；旧 generation 的消息/exit 不得清空新 handle。
已结束 job 的迟到消息不得结算 B，畸形/未知未来 ticket 按协议故障处理，不转成成功或无限重试。
迟到观测有界，不建立无界终态历史集合。

每 client 最多一个未退役 verifier，每 slot 最多一个 active job。
result 选择、监听卸载、任务异步资源销毁、租约结清、termination 与物理计数各由明确 owner 幂等执行。
重复 error+exit、reset+close 或 cancel+message 不得产生第二个 result 或第二次 release。
原请求已取消时不自动重放；新的显式操作分配新 job，并通过既有输入/恢复准入。

### 5. reset、close、故障恢复各自保留边界

当前 dispose 混用 SDK/config reset 和最终关闭，实施时局部拆清：reset 退休旧输入/Worker后可准入新 job，
close 永久停止准入。旧配置排队 job 不得在新 Worker 上继续执行旧 payload。
releaseWhenIdle 是明确的释放意图，不能被下一次 run 清掉；只在显式政策启用时生效。
全局 stopReferenceVerifierWorkers 必须走同一退休 owner/Promise，不能另起旁路 terminate。
同步 dispose 入口可以先关准入，但原异步 shutdown 必须持有并等待其 drain。

普通排队取消不影响 active job。运行 job 的取消继续采用既有验证器退休策略，
不能将每次 Escape 或 A 已完成 job 的迟到取消升级为整个语义 Worker 的致命故障。
普通输入/查询错误不改变原完整结果、清算及缓存退休合同。

真正的验证器致命异常、意外退出、协议/所有权或清算故障，必须进入既有受控故障恢复域，
不得在 client 通过下一请求惰性重建无限绕过预算。设计时 client 没有调用父层预算；本轮候选通过 verifierFault 明确事件接入原 Host/FailureRecovery，本地完整fast层已通过，平台验收另列。
若原事件不足，只补携带故障 generation/job 的明确事件，不能伪装成 Registry 故障或新建 client 恢复计数器。
具体桥接须单独回归证明故障只报告一次，原预算/退避/半开资格不变；不自动重放失败 job。

同步编译不返回时，此状态机和协作取消都不能中断它；继续由未被阻塞的父端监督原截止并承担物理退出责任。
不增宽限、不增加并发编译 owner、不用 worker 内部 timer 冒充同步卡死的监督端。

## 与历史决策的关系

| 历史 ADR | 关系及边界 |
| --- | --- |
| [0006](0006-semantic-request-scheduling.md) | 细化逐请求上下文保证，覆盖复用事件边界；保留 detached lane/mutation 顺序 |
| [0016](0016-reference-verifier-sdk-cache.md)、[0017](0017-reference-shared-inputs-and-search.md) | 保留串行 SDK/标准库缓存；明确未完成 job 取消与已完成 job 的外层迟到取消不同；不改变兼容键或完整覆盖 |
| [0020](0020-failed-semantic-build-recovery.md) | 复用故障预算、物理退出及租约原则；新增 nested fatal 接线要求，候选实现及验证记录见 TDD，不更改原恢复政策 |
| [0023](0023-completion-cancellation-and-synchronization.md)、[0024](0024-partial-initialization-and-progressing-synchronization.md) | 保留原地同步安全提交和准备检查点；不把 job 取消当成计算已停止 |
| [0026](0026-cancellation-grace-terminal-handoff.md) | 细化 nested 结果与资源边界，保留单调时间与原绝对截止 |
| [0027](0027-completion-details-diagnostic-priority.md) | 不改变有限优先、公平性、mutation/global 屏障 |
| [0029](0029-opt-in-rss-memory-budget.md)、[0007](0007-semantic-readiness-and-500ms-slo.md) | 不恢复默认固定 RSS 预算；500ms 继续是允许波动的体验目标，不新增硬门禁 |

本 ADR 是必要补充和语义澄清，不重写这些文件的历史状态、失败证据或验收收据。
如实施证明必须改变同步/恢复政策而非接线，应另列实质差异评审，不能借本 ADR 隐含扩大授权。

## 替代方案与取舍

- 只绑定回调：可修直接串扰，但不能单独覆盖迟到响应、dispose 混义和物理清算；可作为第一片，不能宣称全部完成。
- 只增加 enum 或 busy 标记：不能改变 callback 执行上下文，拒绝作为解决方案。
- 禁止复用、每 job 重启：回避所有权问题并损失 SDK 热态，重新引入已有解析/初始化成本，不采用。
- 把 nested jobs 全部搬到父层：父层没有 LS/SDK/回调资源，扩大跨 isolate 管理和重构范围，当前不采用。
- 共享可变 currentCell、清零 A、吞掉 -32603：破坏并发取消或掩盖结果资格，禁止。

长期代价是每个 active/queued job 少量身份和上下文元数据，以及局部内部消息 envelope；
资源随 job/queue 生命周期释放，不保存历史输入全文、AST 或无界回调链。
保留单串行队列与 SDK 热态，目标是正确复用，尚无本 ADR 修复后的性能收益测量。

## 后续演进的审查要求

任何把资源从逐请求创建改为跨请求复用的改动，应同时说明资源 owner、job 上下文捕获点、
回调入口、结果/drain/exit 边界、reset/close 和故障恢复归属，并提供跨前后任务的交错回归。
改变上述生命周期需要重新核对原不变量，不能只证明命中率、解析次数或热态耗时改善。
状态只能有一个权威来源；新增管理字段前先确认是否应从现有 job/slot 派生或删除分散旧条件。
回归应固定曾遗漏的分支，同时保留正常复用对照；单轮全绿或状态字段增加不构成此合同的证明。

## 验证与完成标准

实现遵循 RED→GREEN：通过真实 child-LSP/Content-Length stdio 固定原 A→B 失败窗口。
状态转换/模型测试补充公开协议结果，不以私有 state 断言代替用户可见正确性。

必须覆盖：

1. A 验证已完成→回退 gate→真实取消 A→B 复用同 generation，A 单取消终态，B 精确结果且无额外换代。
2. 排队 B 取消不杀 active A；跨 root、多个 batch/fallback 的独立身份。
3. B 真取消、迟到 A 消息/取消/exit、结果与取消两种顺序、重复 error+exit；单终态与物理计数正确。
4. 初始 workerData job/复用 postMessage、trace ON/OFF；phase 不作为完成标志。
5. SDK/config reset、队列旧 payload、close 后无复活、终止未完成时无 replacement。
6. 真实 fatal、连续/间歇故障、正常取消对照；原恢复预算生效且不自动重放原请求。
7. dispose/所有权清算失败、同步不返回、终态丢失；取消不能掩盖资源故障或放弃父层监督。
8. 清理后无任务上下文/监听/计时器/项目租约残留，SDK 仅合法保留；不以 RSS 未即时下降判定泄漏。

关键交错以 gate/事件控制，不插 sleep 猜窗口；保留正常非注入对照。
每条记录 request/epoch/revision、jobId、verifier generation/threadId、单元匿名编号、转换原因与单调时间。
最终候选运行适用完整 check:fast、release/CI，资源采样须在允许采样的环境执行。
Linux 目录恢复、真实 Zed UI、Windows、30K 引用/重命名完整能力及长期耐久另行记录，不借机制回归关闭。

## 采用顺序、回滚与当前状态

先固定公开 RED，再实施 job 上下文绑定，随后完成 ticket/转换/清算/恢复接线和整体回归。
每片保留父 revision 与实际产物身份；局部 GREEN 不替代整项完成。
重构只收敛 verifier 的分散条件，不机械拆分或重写全局状态机。
回滚按内聚切片连同内部协议双方与回归一起处理，不留下 runtime/client ticket 不匹配的半版本。
不得通过回滚保护性回归或关闭输入检查恢复绿色。

当前已有候选实现和逐片公开 RED→GREEN，详见[实施记录](../tdd/2026-11-24-verifier-job-ownership.md)。
最终本地 check:fast 2807/2807、退出码0，2694输入未变；见实施记录与原始final5日志。目录恢复的 Mac 同型机制已有独立 RED→GREEN，Linux/Windows复验、UI及原性能限制仍保留。

## 一手参考

Context7 在前轮/本轮评审查询中 transport 失败；使用实际运行版本的
[Node20.19.5 Worker pool](https://nodejs.org/download/release/v20.19.5/docs/api/async_context.html#using-asyncresource-for-a-worker-thread-pool)
及 [EventEmitter 上下文](https://nodejs.org/download/release/v20.19.5/docs/api/async_context.html#integrating-asyncresource-with-eventemitter)
官方文档核验逐任务 AsyncResource；只采用上下文机制，不照搬示例的自动重建策略。
实际取消单元及独立 Node 最小对照见关联根因报告，官方描述不能代替本项目回归。
