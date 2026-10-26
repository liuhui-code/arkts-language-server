# Worker 恢复状态合同与修复切片

日期：2026-10-24。状态：S1/S2/S3 已实施并完成本轮验收；最终完整 check:fast 2016/2016、Windows 补验 116/116 GREEN，未合并或发布。
依据：[ADR 0020](../adr/0020-failed-semantic-build-recovery.md)、[第一轮自审](../reports/2026-10-24-state-machine-completeness-and-tdd-audit.md)、[边界验证](../reports/2026-10-24-state-machine-boundary-validation.md)。

## 范围与验收原则

修复对象是重放输入丢失、清算自身失败、物理退休结果不确定三处边界。
不重写全部调度器，不新增公共 LSP 配置/能力，不优化缓存，不改变 SDK/路径身份、完整答案和输入新鲜度合同。
普通缺声明的 degraded、可正常结算的取消、普通构建失败清算成功，继续沿用现有局部恢复路径。

一次 READY、一个非空定义或一个存活 Worker 都不足以验收。必须分别证明：

1. 父端每个已接受的打开文档最终文本/版本与重放者一致，关闭后正确回到磁盘权威。
2. 当前结果对应本次权威输入；依赖文档同样不能被省略。旧 epoch 不发布结果。
3. 每份资源都有 owner，清算失败后仍能找到其退休责任；不能把指针置空视为已释放。
4. 旧 Worker 实际退出前不分配下一者；请求取消不解除物理资源责任。
5. 每个请求只有一个终态；资源故障独立通知监督端，不能被该终态掩盖。
6. query、mutation、初始化异常及清算故障共用原有恢复预算，不另设旁路。

## 状态和所有权

保留现有模块边界，避免把所有组合展开为一个巨型 enum。五个 owner 通过受检查的转移衔接。

| owner | 必须持有的事实 | 何时才可解除责任 |
| --- | --- | --- |
| 父端文档/配置 owner | 最新文档文本、版本、打开/关闭状态、项目与 SDK 配置 | 新输入替换旧输入或会话结束；失败不丢权威输入 |
| LS 适配层 | 当前 service/owner、同步证明，以及退休失败的 service/owner 和原因 | 租约明确结清，或所属 isolate 实际销毁 |
| 物理 Worker Host | 运行句柄，或退休句柄、退出见证、退休任务/错误 | 确认 exit；Promise 报错不等于退出 |
| 恢复监督者 | 同一事故、频率/累计预算、熔断输入修订、恢复任务 | 受约束成功或关闭；同输入成功/ACK不自行补充累计预算 |
| 请求 owner | 调用方终态与底层命令终态 | 各自实际结算；调用方取消不提前释放底层占用 |

LS 至少要表达 `live / empty / retiring / quarantined / disposed` 的区别。
`retiring`、`quarantined` 必须携带待结算的旧 owner，不能先丢掉对象再用 boolean 记录失败。
同步中/Program 返回/checker 返回是阶段事实，不拿观测计数代替所有权状态。

Worker 至少区分 `running / retiring / retirement-failed / exited / closed`。
退避、重放、熔断和半开仍归现有恢复监督者管理；SDK 输入变化不代表一个旧 Worker 已退出。
degraded/READY 继续表示输入覆盖与语义资格，不编码物理资源是否已结清。

## S1：恢复日志保留每个文档

最小修复点：`SemanticWorkerRecycle.defer`。

- 仅合并同 root、同规范 URI 的相邻全文更新；保留现有 open/change 类型限制。
- close、后续 open、配置/文件事件保持顺序边界，不能跨边界合并。
- 当前顺序日志保留 close/open 即可保护打开生命周期，先不额外引入一套文档世代计数器；若后续反例证明不足，再独立补充。
- 保留 32 条/4MiB 边界及溢出失败行为，不靠错误跨文件合并压低记录数。
- `recovery.complete` 仍仅代表恢复输入重放完成，不代表 Program 已准备或 READY。

恢复结束必须覆盖父端最新的打开/关闭文档集合和配置；验收不能只看 mutation ACK 或根 revision 递增。
如实现需要重放后对账，范围限定为该恢复事务的打开文档/配置及已有版本/指纹，不向每次普通查询增加全项目读取。
不因本切片直接引入新的 SDK 扫描、全局 Program 或文件系统缓存。

现有 `same-document-coalescing` 隔离包仅增加 URI 相等，13 项重放回归/模型 GREEN，是可实施的最小因果依据，不是完成资格。
正常产品修复还需按仓库流程补进正式快测、相关回归和最终检查。

## S2：清算失败须隔离，并独立于调用方取消升级

最小适配点：`recoverable-language-service` 保留退休对象；错误携带 `cleanup-ownership-uncertain` 这类内部原因。
该错误不推断“release 没发生”：本轮已验证 release 生效后仍可抛错。
不能重置失败标记继续用同域新 LS，也不能盲目重试 shared.release，避免双 release。

正常清算成功：撤销旧证明、结清旧 owner，进入 empty，后续同版本重试只创建干净 LS。
清算失败：进入 quarantined，保留未结责任，停止该 Worker 的后续编译准入，转入现有物理恢复约束。
SDK Registry 在同一 isolate 内共享，最小安全隔离边界采用整个语义 Worker；不直接清空共享 Registry，也不把其他 owner/pin 当作失败 owner 的余额结算。
恢复后的 roots、配置和未保存文档由父端重新交付。

**不能只把请求错误改成 restart-required。**
当前 `RootSemanticWorkerSupervisor.#settleRequest` 在读取 response.error 前先处理 cancelCell；
已取消的请求会优先结算为 cancellationError。清算故障仍可能被吞进请求终态而未进入物理恢复。
`mutationFailed` 的 restart-required 分支也不能代表请求侧已经接入监督。

因此需要一个有界、可验证的内部 Worker 故障事件，独立于请求响应：

1. Worker 先进入失败准入状态，阻止后续请求继续使用污染域，仍允许 shutdown 收尾。
2. 发送版本化、原因白名单的内部故障事件；只携带原因/阶段/相关标识，不跨线程传 LS、AST 或任意 Error 对象。
3. Host 验证事件确实来自当前物理 Worker，转发到现有 `workerFailed` 入口；旧实例事件直接隔离。
4. 原请求按既有取消/失败合同结算一次；客户端已取消仍可收到 -32800，监督责任同时存在。
5. 相同事故的事件、error、exit、watchdog 不能分别启动多条恢复或重复消费预算。

这里扩展的是已有物理故障通知，不新增公共 LSP 方法，也不引入第二套重启预算。
不要靠抛出未经管理的异常或直接 process.exit 来绕过嵌套验证 Worker 的正常收尾。
故障后初始化压力豁免的已消费状态、原始查询终态和旧 epoch 围栏继续保留。

## S3：退出不确定时保留旧 Worker 句柄

最小修复点：`SemanticWorkerHost.replaceWorker` 和 shutdown 收尾。
退休上下文至少保留旧 handle、退出监听、共享 Promise、最终错误；不能在任意 finally 中无条件解除退出围栏。

| 事件 | 合法转移与后续准入 |
| --- | --- |
| terminate Promise 未完成，旧 Worker 未退出 | 保持 retiring；调用方可取消等待；不创建替代者 |
| 明确退出，terminate 正常完成 | 标记 exited、解除旧句柄责任；现有预算与关闭检查允许后再重放 |
| terminate 报错，已收到 exit | 记录错误和退出事实；后续受预算约束的探测可以继续 |
| terminate 报错，未收到 exit | retirement-failed，保留句柄和监听；新输入/配置不能绕过退出条件 |
| 迟到 exit | 仅结算原句柄责任；是否再建仍服从预算、当前输入和关闭状态 |
| shutdown 与退休并发 | 共享同一物理退休任务；关闭优先，关闭后不再重建 |

退出未知不应成为丢句柄后的永久死锁。允许对**同一个旧句柄**进行受现有预算和退避约束的退休重试，
或在符合既有半开条件的前台操作中先重试退休；只有确认 exit 后才继续创建。
一次失败恢复后的退休重试仍须计入共享尝试约束，不在恢复事务里另开无限重试循环。
预算耗尽时保留句柄和退出监听，迟到 exit 只结算责任，不自动补充预算。
补充验收：移除一次 pre-effect 故障后，应能受约束地停止原 Worker 并恢复精确查询，且始终不重叠；真实无 exit 时明确失败。

Node 20.19.5 的正常 terminate Promise 在 exit 时兑现，内置 JS 没有普通 reject 分支。
pre-effect/after-effect reject 是本轮的防御性故障模型，尚无自然发生证据。
不据此延长超时或切换全部语言服务到子进程。
不可中断 native 导致长期无 exit 时，应明确服务不可用并保留责任；Node Worker 无法提供的强制退出保证不能伪装为已实现。
进程级隔离/外部监督若必要，应作为有真实证据的独立方案评估。

## 实施补充：半开探测的真正准入点

扩大回归证明：恢复完成唤醒的后台 diagnose 可能先于发起半开的 foreground prepare 进入 Worker。
此时根枚举的同步卡点属于 diagnose，prepare 仍未发送，其执行截止尚未开始；不能把这个等待误归因给 prepare 的 compiler。
probing 期间非显式请求不得取得语义执行权。入口先检查一次，共享恢复等待结束、真正发送命令前再次检查，
覆盖较早通过入口的后台任务。普通 READY 状态的诊断调度不变；前台取消/失败仍按原合同结算，预算不增加。
该修复由既有公开失败半开用例 RED→GREEN 驱动，详见 [本轮 TDD](../tdd/worker-state-contract-20261024.md)。

故障协议必须保持纯协议依赖，compiler-aware 错误分类限定在 Worker。实施时的父进程编译器加载回归已由公开初始化/定义测试 RED→GREEN 修复，避免增加父进程常驻编译器开销。

## 已有效的转移保留

- 快照前后 close/reopen、版本重置、关闭回磁盘的精确查询已通过，不为生命周期再引入无证据的全量重写。
- 准备中 SDK 变化已通过现有 mutation 取消单元拒绝旧请求 -32801；顺序请求看到 degraded，修复后 READY。
- 恢复中切 SDK 能定位到新 SDK 声明的精确文件和范围，不补第二套配置重放。
- terminate 尚未完成时等待者可真实取消，之后恢复正确，物理 Worker 峰值 1。
- 原 3/180 秒、累计 3 次、退避、半开和关闭的既有合同保持；缓存性能 TODO 不启动。

## TDD、提交与回滚边界

1. S1 先迁入跨文件 RED，再实现 URI 边界；加入 A→B→A 和 8 种长度 3 的独立模型。不能删精确范围、退化为仅 URI/非空断言。
2. S2 先迁入 release before/after 与真实取消叠加的 RED，再实现有 owner 的隔离和监督事件。
   补预算耗尽、重复故障事件、多个共享 owner、恢复中配置、失败后直接关闭和嵌套 Worker 的回收。
3. S3 先迁入退出未知的 RED，再实现保留句柄；保留退出后错误和 pending 取消的 GREEN，补迟到 exit、并发关闭、无 exit 的明确终态。
4. 三个切片分别审查和提交；S2 的隔离、资源责任及监督升级是一个完整行为切片，不能只上线其中一个标记。
5. 每片受影响公开回归 GREEN 后，最终同一候选运行完整 pnpm check:fast、相关检查及 Mac/可用 Windows 真机。不能把本轮的已知 RED 诊断计为通过。

修改 500 行以上旧文件仍需表征与内聚提取；优先把修改留在现有小型适配器/Host 内，避免顺手重构整个 732 行 supervisor。
失败切片回滚应恢复其内部事件/状态/测试为一致版本，不绕过校验或开启新的默认开关。
本轮无合并/发布；455 文件冷目录 3 秒门槛继续按用户授权排除。

最终执行结果和逐次证据见 [实施报告](../reports/2026-10-24-worker-state-contract-implementation.md)：
Node20 下完整 `pnpm check:fast` 正常退出 0，2016/2016，零 fail/cancel/skip/todo；Mac 焦点 84/84、Windows 最终 116/116。
Mac/Windows Photos 普通操作及受控同步不返回、真实取消已验证，物理语义 Worker 峰值 1、关闭后 0；
919 项源码、4 项配置、1 项构建配置和 76 项生产产物在全量检查前后相同。
这不等于原 Windows 自然现场复现，也不解决已暂停的缓存性能和规模成本；真实项目 degraded 及超过 500ms 的操作仍保留。

## 完备度仍有边界

8 种模型只穷举两文件、三次全文编辑，并非任意事件序列的形式化证明。
时钟回拨、terminate 自然失败、任意 SDK/scriptKind/node-format 切换、native/OOM、长期压力和大规模 Windows 原现场未由本轮证明。
实施下一切片时按反例扩展，记录每个转移的证据与未测项，不能由测试数推导状态机完备。
