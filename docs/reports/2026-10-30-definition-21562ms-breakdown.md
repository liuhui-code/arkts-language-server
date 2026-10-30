# Windows 真实 Zed 会话 21.562 秒 definition 的耗时组成

本次仅复核已有原始记录，没有重新启动 Zed、实施产品修复或执行新 UI 测试。
结论：总耗时 21562.433ms 中，父端准入至发送 Worker 为 21292.850ms（98.750%）；
本条定义查询阶段为 62.081ms（0.288%），没有重建 Program。主要问题是请求积压。

## 请求身份与口径纠正

- 原始公开请求 ID `570`，`textDocument/definition`。
- 发送 `2026-10-30T04:43:06.421Z`，响应 `04:43:27.983Z`；北京时间 12:43:06.421–27.983。
- 文件为隔离 30K 项目的
  `D:/DevSetup/diagnostics/zed-ui-remediation-20261030/project/product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`。
- 零基位置 `42:2`，人类位置 `43:3`，符号 `onSessionCreate`。返回同文件该符号定义。
- **这条最大值是实际 Zed 自动发出的请求，不能称为已确认的一次手动 F12 耗时。**
  邻近 UI 轨迹正在通过 Ctrl+P 输入 ScreenManager 的路径，没有配对的 F12。
  被动 relay 只转发 stdin/stdout 并记录帧，没有注入查询。
- 真实 F12 也存在严重慢响应：公开请求 `1467`，UI 键事件 `05:15:30.636Z`，
  请求 `05:15:30.638Z`，响应 `05:15:47.066Z`，耗时 `16427.801ms`。
  Picker 的 `destroyMainWindow` 正确定义至 `ScreenManager.ts` 人类位置 `245:3`，UI 可见目标正确。
  不能用自动请求与 F12 的区别否认前台体验问题，也不能将二者的耗时明细混用。

分析的运行产物仍是原 C4 候选 `78a3158+working-tree-8fff8d3afe576134`：
server SHA256 `dd3feefdb5e2011739046c58080858ca0aeb426950b00ec07487435644a1b82d`；
Worker SHA256 `bf8433e77e53a280afca48eaa8cb62d9a20ab20a2596a4353e50a09deda78afa`。
安装的 Zed 为 `1.25.3 stable382`，源码身份 `8dd255c3eafb5231056fe4e6f601cedd011f1c93`。
复核时仓库 main 已为 `1194399`，不将这份历史 UI 记录冒充该提交的新一轮 UI 验证。

## 不重叠的耗时拆解

| 区间 | 毫秒 | 总耗时占比 | 可观察证据 |
| --- | ---: | ---: | --- |
| 父端准入至发送 Worker | 21292.850 | 98.750% | trace546 enqueue → send.returned，Worker request458 |
| 本条定义查询 | 62.081 | 0.288% | semantic.definition.complete，Program18/checker18 |
| 其余未逐项归因区间 | 207.502 | 0.962% | 总耗时减前两项，含准入前、传输、准备及最终响应等 |
| 合计 | 21562.433 | 100% | 公开 wire 请求至响应 |

Worker 收到至 dispatch 为 0.155ms，prepare 为 2.026ms，readiness certification 为 0.034ms；
这些位于第三项内部，不再次相加。父端第一项是准入到 send 返回的区间，包含少量调度/发送开销，
并非对操作系统队列 CPU 时间的测量。

公开 ID 没有直接透传到 Worker trace。`570 → trace546 → workerRequest458` 的关联依据为：
同 URI、文档版本68、同批32条 definition 的顺序、同类稳定 FIFO，以及唯一活动请求与终态时间。
不能按最近时间戳误配为 trace492。

## 为什么会排队 21 秒

1. Zed 在约 12ms 内发送了 64 条自动查询：32 条 definition 和32条 typeDefinition，
   涉及同一 Picker 文件的多个位置。请求570位于这批 definition 尾部。
2. 它入队时另有一条 define 正在执行。随后在它之前又 dispatch 了75条：
   31条 define、31条 typeDefinitions、7条 documentHighlights、6条 codeActions。
   这76个连续占用区间恰好覆盖 21292.850ms，没有另加一份“排队时间”。本窗口没有 diagnose。
3. 单个语义 Worker 串行处理；`semantic-request-lanes.ts:6–31` 将 definition/typeDefinition
   都放在 foreground。`:37–60` 同类 FIFO，并允许高优先级有限越过后执行旧队首，以免其他类别饿死。
   实际用户导航和编辑器自动查询在标准 LSP 中使用同一个方法；当前没有它们的用户意图区分。
4. 原始完整帧中没有任何 definition/typeDefinition 的 `$/cancelRequest`。
   服务端保留这些独立且未取消的请求。不能恢复此前“同方法+同URI后到覆盖”的错误规则，
   那会再次取消真正的 F12。也不能把未认证为等价的不同位置请求合并成一个结果。

因此 Program 复用解决了构建成本，但没有让每条请求的输入验证、查询、结果验证和串行服务成本消失。
本条实际 Program 有443个 SourceFile：项目108、SDK283、其他52；项目与SDK均为复用，首次观察为0。
等待窗口内32份定义 trace 全部为 Program18、createProgramEvents=0，合计定义阶段1981.505ms；
这些时间已包含在等待占用区间内，不能再与21.293秒相加。
`context.reuse.rebuildCostMs≈1013ms` 是该上下文的历史构建成本，不是本条又花了1秒重建。

## 前方 4.058 秒慢请求及尚未测清部分

最长前序占用区间为 Worker request446 的 define：`04:43:21.271Z → 25.329Z`，4057.663ms。
对应公开请求558，Picker零基 `44:14`，即 `session.getUIExtensionHostWindowProxy()` 一行。
公开终态为 `-32803: Semantic query requires current workspace inputs`；它的公开总耗时为18912.127ms，
其中已含更早排队，不能把这个18.9秒再加到请求570上。
该区间内只测到本地定义查询57.300ms，Program重建为0。余下部分没有完整细分。

代码中的相关待测路径：`legacy-semantic-engine.ts:278–294` 在本地定义为空后，
会 `prepare(..., true)` 尝试完整作用域；`interactive-workspace.ts:83–109`
在 partial membership 下先刷新项目成员，再要求完整性。
这是一条需要继续测量的扩域/成员刷新热点，**现有日志没有单独证明4秒全部发生在这里**，
更没有其读取、枚举或 realpath 次数。不能将其全部归为编译、扫描、OOM或Worker重建。
本条请求及其等待窗口均为 epoch1，没有换代证据。

后续修复应分别处理可认证的重复请求共享/客户端过期意图取消、串行请求的重复服务成本、
以及空结果扩域失败路径；保留独立请求终态、mutation屏障、结果新鲜度与后台有限公平。
不能仅提高并发/队列上限、删除校验或丢弃未取消请求来隐藏长尾。本次没有实施这些修复。

## 证据

- 总报告：[Windows UI 补全与导航修复实施记录](2026-10-30-ui-remediation.md)。
- 原始封存：`.bench/windows-ui-remediation-20261030/final-ui-lifecycle-sealed-7/`，
  `wire.ndjson`、`server.stderr.raw`、`ui-events.ndjson`、`symbol-tour-separate-events.ndjson`。
- 本次逐帧提取：`.bench/windows-ui-remediation-20261030/definition-570-21562ms-evidence.json`，
  包含原始请求/响应、关联事件、75条前序请求及76个非重叠区间、UI轨迹、原始文件SHA256和测量限制。
- 原封存ZIP SHA256：`66d7bbbab237f7f3dbdd6d9348e1fc1c4841ecc0ebf70f667cdb27df6c388297`。

本次没有重跑产品测试。既有正式UI验收失败状态保持；协议或局部回归通过不替代整体UI通过。
