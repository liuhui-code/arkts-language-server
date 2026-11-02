# WUI-003 输入核验：RED / GREEN 收据

**本文件仅记录已拒绝的服务器辅助实验，不是最终产品改动的通过收据。**
三轮收益约10%，保留原服务器核验；取舍见[ADR0039](../adr/0039-validation-directory-observations.md)。
源码与bundle已独立归档，原始日志不删除；实验全量检查与正式客户端验证分开标注。

父版本 `b57ad075a80fdc2169189ba7da17fc6bb98a0866`。实现隔离在
`.bench/wui003-burst-20261102/worktree`，原 WUI-009 改动未覆盖。
所有新增行为测试使用真实子进程、Content-Length stdio；观察器只有私有临时夹具才能运行。

## RED

- 原 main 加新测试，Node 26.3.0：
  `node --test --test-name-pattern='independent LSP reads amortize' tests/semantic/request-directory-validation.test.mjs`。
  完整真实 SDK 文件检查仍在；24 个常规声明的一次热查询执行 96 次完整叶路径解析，断言失败。
  证据 `red-main-node26.log`。首次探测 `red-directory-validation.log` 用系统 Node21.6.2，
  未混入 Node26 的性能对比；两次失败都保留。
- 首个阶段目录复用候选每个查询仍做 4 次同目录枚举，新的目录内容复用测试失败：
  `red-directory-content-reuse.log`。该候选 30K 重放反而更慢，`candidate-pilot-1/` 未计作优化成功。
- 可选目录读取故障：实际公开定义仍正确，但加速器对 24 个成员重复尝试 96 次，
  `node --test --test-name-pattern='optional directory-content failure' tests/semantic/request-directory-validation.test.mjs`。
  `red-directory-fallback.log`。修复只在当前阶段记住“不选加速器”，每个文件仍走 native 核验。

## GREEN 与必要的反例

- 新增 7 项公开 LSP 回归：24/96 SDK 成员、独立光标、目录内容热命中、无通知目录换向、大小写变化、
  无关成员、配置后恢复、最终文件观测之后目录换向、元数据预算耗尽及可选目录读取失败。
  真实目录换向的替代声明提前 hard-link，使 inode/字节/时间戳不变；只有路径归属改变。
- `green-directory-final.log`：7/7，无 skip；`green-navigation-4.log`：21/21，无 skip；
  `green-input-fences-3.log`：14/14，包含原本未打开源码、SDK 字节及大范围引用的最终新鲜度回归。
  这些是不同收据、有重叠，不能相加宣称独立完整用例数。
- 去掉候选的目录 closing fence，仅限测试观察器，运行：
  `ARKTS_TEST_DIRECTORY_DISABLE_CLOSE=1 node --test --test-name-pattern='namespace retarget after the final' tests/semantic/request-directory-validation.test.mjs`。
  公开接口错误地返回旧位置，断言失败；`negative-control-directory-closure.log`。
  证明最终目录核验不能为性能删除；这不是真实用户现场的受控故障复现声明。
- `pnpm check`：`typecheck-1.log`，当时通过。最终完整检查另行记录，不用这份收据替代。

## 性能与证据边界

原始记录根 `.bench/wui003-burst-20261102/`。`protocol-replay.mjs` 从真实旧 UI 64 条请求和 7 份
原始 overlay 复放；Mac SDK、Node、native、源项目、请求目标固定。baseline 重建 bundle 与原 main
第一次基线 SHA 完全一致。最终普通对比基线/候选各 3 轮串行，另做一对相同观察器的插桩运行。
每轮保留 69 份完整请求响应、初始化报告、取消/退出、资源与阶段日志。

这是协议短测，不是真实 Zed UI 或两小时耐久验收。Windows SSH 本轮 8 秒连接超时。
30K 初始化 membership cap 造成 degraded、完整范围错误、尾延迟与元数据精度限制均独立报告。
没有调整 RSS、V8、超时、文件上限或最终结果正确性断言；没有清理用户真实缓存。
