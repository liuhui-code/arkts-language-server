# 30K真实依赖夹具：22.48秒跳转长尾的现有证据

状态：**IDX-V1-SCALE-002，OPEN / 性能边界，尚未完成三轮与独立profile归因**。本片只读取已完成会话日志，不插入请求、不修改冻结产品/驱动，也不暂停正在运行的规模矩阵。

这是生成的30K依赖图夹具，**不是原Photos项目或Zed UI**。SDK实际选择及partial报告、parent298d、当前完整源码快照、四个核心运行产物和编译器字节哈希都保存在证据JSON中。完整79资产包，Native6553ab87。静态源码/Native索引30000；本普通轮次的实际Program文件数未测，不用30000替代它。

## 精确操作与状态

首轮ordinary cold会话：cold指会话起始为空应用索引的新进程；该慢操作本身发生在多次查询、编辑及撤销之后，不能称冷启动跳转。

1. 打开夹具 `Main.ets` v1，依次执行定义/补全/引用/重命名查询及重复查询。重命名只读取编辑集，没有应用重命名。
2. didChange v2：原文末尾加 `\n// incremental input\n`，执行编辑后引用和定义及重复查询。
3. didChange v3：恢复原始字节，查询undo-definition；没有保存或修改磁盘。
4. didClose Main；didOpen同原始文本v4；先执行reopen-completion，再立即执行reopen-definition。
5. 慢请求是LSP **id16**，textDocument/definition，Main第1行第29个UTF-16单元（零基），`new Counter`标识符处。开始 `2026-11-08T12:10:05.181Z`，结束 `12:10:27.662Z`；客户端单调钟耗时 **22480.449757ms**。精确位置/返回范围oracle通过。

服务端同时有文档v4/appliedRevision5的自动诊断。它由打开/更新文档触发，是内部Worker请求，不是客户端另发的LSP诊断请求。Worker request23为diagnose，request24为define；二者epoch1、实际Worker thread1。不要混同LSP id16、traceId24和Worker requestId24。

原始会话：`.bench/index-versioned-maintenance-20261104/final-acceptance-10/scale-runs/dependencies-30000-candidate-0-ordinary-cold/`。
小型证据摘录：`.bench/index-versioned-maintenance-20261104/scale-tail-evidence-20261108/reopen-definition-30k-first-ordinary.json`。

## 不重叠的已测分解

| 区间 | ms | 占客户端总耗时 | 能证明什么 |
| --- | ---: | ---: | --- |
| 客户端总请求 |22480.450|100%|发送到实际响应 |
| 父端admission至Worker send返回 |19245.204|85.61%|入队/调度/发送区间；不是Worker内计算 |
| 总耗时减去以上区间 |3235.246|14.39%|含入队前、IPC、Worker操作和回包；不能全称compiler时间 |

Worker内部收到至dispatch为0.146404ms，属于最后一行内的嵌套观测，不能再相加。父端同一单调钟上，diagnose23 send返回至define24 send返回为19247.614ms，覆盖define等待的几乎整个区间；不跨时钟原点相减，也不把它当作精确checker CPU时间。

关键日志顺序：

- `12:10:05.179` 父端send diagnose23；
- `12:10:05.180` 前一个reopen-completion完成；
- `12:10:05.181` Worker dispatch diagnose23；客户端发送define；
- `12:10:05.182` 父端define trace24入队；
- `12:10:24.427` 父端终于send define24；
- `12:10:24.428` Worker dispatch define24；
- `12:10:27.661` 服务端记录definition完成，客户端27.662收到。

## 调用链与直接等待原因

固定候选源码及SHA见摘录JSON：

- `src/lsp/register-navigation.ts:6` → SemanticRequestRunner → `SemanticWorkerEngine.define`（semantic-worker-proxy.ts:264）；
- `semantic-worker-document-request.ts:8` → WorkerProjectPreparation.request → Supervisor.request（semantic-worker-supervisor.ts:232）；
- Supervisor.request入队并记录trace（:263），调用pump；
- **pump:299–300只要有active就返回**。诊断和define都使用普通active槽（:338–339），references才有既有detached槽；
- 收到有效终态后，settleRequest:632–655清active，receive:376–377再pump后继；
- `semantic-request-lanes.ts:6–30/38–65`的优先级只选择待派发请求，不能中断已经发送的诊断。

因此，本次主要是**已经在途的后台诊断占用父端串行槽，前台等待其终态**。不是“8个排队诊断继续越过已经排队的详情”的旧M003精确反例；这里未来的define请求尚未到达，后台已派发。也不能从这一样本归因于索引重复写、OOM或Worker重建。该会话正常关闭、无保护清场；本窗口前后台保持同一epoch/thread。

Worker内部这19秒究竟包含多少Program更新、checker、路径/输入证明、读取或结果映射，普通日志无法分解，**未测**。剩余3.235秒也不能全部归给Program。后续独立profile能覆盖多少必须据真实记录判断，不因缺少细分而推测。

## ADR映射与边界

[ADR0027](../adr/0027-completion-details-diagnostic-priority.md)“拟议决定”第2条明确保留“不抢占已经运行的原地编译；不新建Worker/Program并行处理详情”，第3条只规定待发队列的有限绕过；状态仍Proposed，不追认Accepted。当前代码和本样本与此边界一致，**不是仅凭长尾就证明调度实现违反ADR**。但有限队列优先不保证在途单任务很长时的交互低延迟。

[ADR0040](../adr/0040-client-context-request-backpressure.md)限制编辑器生产端自动请求，不能中断已运行的服务端诊断；本例仅一个顺序等待的LSP前台请求，也不是无界UI突发。[ADR0043](../adr/0043-versioned-file-index-maintenance.md)解决Native事实写入与维护所有权，不宣称让语义Worker同步任务可抢占。不要把Native GC-005的SQL扫描原因强行套用本例。

后续若要消除这类主导等待，需单独验证后台计算的切分/可取消边界或隔离策略，并显式审视0027的单AST owner/非抢占/公平性与0020故障恢复约束；仅调高队列优先级无法抢占active任务。不能通过延长超时、前台一来就强杀重建、跳过新鲜度检查或给本用例插sleep掩盖问题。本轮不提前采用新架构，不启动已暂缓的通用缓存优化。

## 性能判断与未完成事项

该会话的正确定义请求仍有：首次22145ms、重复6477ms、编辑后19389ms、重复6610ms、撤销12008ms、重开22480ms；补全首次19966ms、重复3543ms、重开19367ms。不能因为结果正确、未超过保护线，就称体验正常。500ms仍是体验目标，不新增硬阈值；这些持续多秒及20秒级响应明确作为未解决性能问题记录。

旧版同条件30K真正依赖图在4096条证明容量处拒绝，缺少成功操作耗时，不能拿旧失败响应时间算提速/回退倍数。当前只是首轮，三轮分布/频率、独立profile以及原Photos拓扑结果尚未完成。全量引用/重命名限制另外保留；局部正确结果的PASS不将这些缺口转为成功。
