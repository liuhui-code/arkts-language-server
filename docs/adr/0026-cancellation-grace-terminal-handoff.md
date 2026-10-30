# ADR 0026：同步完成至终态交付的取消宽限

- 日期：2026-10-27。
- 状态：**Proposed；维护者已授权实现，candidate11受控回归及7204.609秒协议混合验证完成；原自然30K精确窗口未闭环，未记录独立评审，不追认Accepted。**
- 问题：[SOAK-30K-M002](../plans/2026-10-11-query-performance-follow-up-plan.md#soak-30k-m002)。
- 依据：[原现场与受控对照](../reports/2026-10-27-30k-issues-root-causes-and-adrs.md#m002)。

## 背景与现有合同

[ADR0023 §决定1/2](0023-completion-cancellation-and-synchronization.md)保护原地同步，
[ADR0024 §决定3/4](0024-partial-initialization-and-progressing-synchronization.md)
只允许匹配请求的实际同步活动续取消宽限，保留绝对截止。

当前 watchdog 在离开同步 phase 后，舍弃已记录的最近活动时间，改用原取消时间。
受控有限 SDK 图在安全同步完成、终态延迟交付 50ms 时，两次普通插桩及一次
决策观测均导致后台诊断取消截止，排队定义一起失败。无延迟、短图或晚取消通过。
实际决策距最近活动仅26.117ms，却采用2978.000ms前的取消时间。
这证明边界缺陷存在，尚不能证明原 30K 自然竞态的精确终态交付时序。

## 拟议决定

1. 对同一个尚未结清命令，已采纳的取消宽限参考点保持单调。离开同步
   phase 不应退回较早时间；参考点取原取消时间与最后合格活动时间的较大值。
2. 只有 epoch/id 匹配且 phase 为 synchronize/program/checker 的实际活动
   才能更新活动时间。request/idle、排队、异步心跳、别的请求或旧世代不能续期。
   本条不是为 idle 新增活动豁免。
3. 绝对执行/准备截止继续从原 started 计算；没有新活动仍在原取消宽限内
   退役。连续假活动也不能突破绝对截止，不提高任何截止或恢复预算。
4. Worker 函数返回、phase=idle、已 postMessage、父端收到合法终态是不同边界。
   在父端合法结清前继续保有命令所有权；正确的取消响应只结算旧请求一次，
   再应用最新 mutation。不能把旧成功答案发布给新文档。
5. 真正挂起或清算失败仍沿 [ADR0020](0020-failed-semantic-build-recovery.md)
   的物理退出、共享预算、退避/熔断和最新 overlay 重放；不自动重放旧请求。

## 状态与时间合同

| 边界 | 状态拥有者与证据 | 可以改变什么 |
|---|---|---|
| sent→executing | 父端waiting条目、匹配epoch/id的started事件 | started固定原绝对执行起点 |
| executing→cancel-pending | 父端首次观测取消cell；客户端LSP取消响应与后台命令结清分开 | 撤销旧结果发布资格，固定cancelObservedAt |
| cancel-pending中的有限同步 | 匹配命令且处于synchronize/program/checker的真实activity序列 | 仅推进lastAcceptedActivityAt |
| terminal-produced→terminal-sent | Worker在实际终态postMessage调用前/成功返回后记录共享里程碑 | 只观测，不续宽限；sent不等于父端received |
| received→settled | 父端验证protocol/epoch/id/revision/documentVersion，结清等待条目；监督器完成单终态 | 可以释放命令所有权，再应用mutation；不自动重放旧请求 |
| 未结清→retiring→replacement/circuit | 未被阻塞的父端监督、实际exit、共享预算和权威输入重放 | 回收旧世代，晚到结果不得发布为新请求 |

`cancelReference=max(cancelObservedAt,lastAcceptedActivityAt)`在同一未结清命令内单调不退。
activity只在匹配同步区被采纳，离开phase既不新续期也不丢掉已采纳时间；无活动仍原1000ms退役，绝对执行截止不变。
worker phase与父端命令状态独立；phase=idle不是任务已结清，也不是“编译未完成/死循环”的证明。
失败日志使用实际决策同一快照，记录取消静默时长、参考点与terminalState，避免第二次采样误述判定。

## 成熟实现参考与取舍

[TS4.9.5 services](https://raw.githubusercontent.com/microsoft/TypeScript/v4.9.5/src/services/services.ts)
的原地增量同步可能修改共享SourceFile，因此沿用ADR0023的安全提交区，不复制
[rust-analyzer/Salsa](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)
依赖不可变Analysis/revision与安全unwind的取消方式。
[clangd TUScheduler](https://clangd.llvm.org/design/threads)区分更新/读取及失效请求；借鉴单owner与版本顺序，不照搬可用过期preamble的答案合同。
[Node26.3 Worker](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html)
明确postMessage、message与最终exit的区别，terminate是等待exit的异步操作；它不替应用实现单终态或资源清算。

选择在现有watchdog/Host/retirement监督域落实单调规则，新增最小里程碑观测；
不另造恢复监督器，不用Worker内部timer守护同步JS，不增加sleep、永久idle豁免、超时或恢复预算。
Context7连接失败已记录，资料核验使用官方来源；本次受控窗口不追认原自然30K精确竞态已被证明。

## 回归与验收

- 公开 LSP 的长/短有限图、早/晚取消、0/50ms终态延迟对照，并断言精确后继定义。
- 无新活动、无检查点及同步不返回仍退役；持续活动仍受绝对截止约束。
- 同步抛错、post-sync取消、旧 epoch/乱序/重复终态、边界时刻及关闭并发。
- mutation 优先、18份等多文档重放、请求单终态、物理 Worker 峰值和共享预算。
- 先保证同一请求的计时参考点，再补生产观测；不能用诊断延迟通过宣称真实2h稳定。

## 边界与回滚

单独提交最小 watchdog 参考点修复及公开回归；不合并 M001 解析域或 M003 优先级变更。
单独回滚该切片，保留 ADR0020 的硬性监督。现有 Accepted 历史不改写；收据见[本轮TDD](../tdd/2026-10-27-three-soak-defects.md)。

## 2026-10-28最终验证收据

candidate11完整fast2085/2085，包含有限同步＋终态交付、丢失终态、真正同步不返回、版本重放和共享恢复预算回归。
独立7204.609s混合会话1Worker、0运行期退役/恢复，172条公开cancel通知（171条在终态接收前、1条合法晚到）。
171条in-flight取消至终态最大3.117ms，170取消错误、1成功竞态；全部单终态，关闭exit0且本轮进程已退出。
两小时不误退役是补充证据，**不把原自然30K精确交付窗口或全部故障路径宣称已在该会话复现**。
原宽限/绝对截止/恢复预算不变；[最终报告](../reports/2026-10-28-three-soak-defects-final-verification.md)保留尚未证实范围。

## 2026-10-30后续缺口：保存通知与已有同步

Windows真实UI的WUI-002仍出现phase=program、1026ms无检查点后被旧取消静默规则退役，
不同于本ADR先前修复的交接计时倒退。有限实际Program的公开反例也会换代，不能用旧两小时收据否认新反例。
[ADR0030](0030-completion-scope-and-navigation-liveness.md#保存取消与同步清算)提出原因限定的一次清算许可：
仅同根open-overlay源码changed通知可等待匹配的已有同步，立即撤销旧响应发布资格，
原绝对截止仍生效；同步结束后原1000ms交付宽限单调计时，真实编辑/客户端取消可硬撤销。
这是明确的取消政策补充，尚为Proposed候选，不改写本ADR原决策/验收历史。
