# L01 compiler 查询中取消：TDD 记录

父版本 `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`；已有 dirty L01
工作树保留。范围仅为默认关闭的生命周期观测、回放工具与测试，
未改变语义范围、worker 数、缓存预算、默认路由或正常诊断。

1. 生产 LSP RED：`pnpm build && node --test
   tests/semantic/references-compiler-query-trace.test.mjs` 因缺少
   `references.compiler-query.start` 超时失败。GREEN 后，该真实子进程
   Content-Length 测试验证 start 在响应前可见、同 `traceId` 的 complete、
   323 个精确位置、正常诊断及 trace-off 无事件。取消分支只在
   `ts.OperationCanceledException` 时发 `references.compiler-query.cancelled`，
   观测回调失败不会改变结果或错误。
2. 工具 RED：`node --test --test-name-pattern='requires an interrupted compiler query'
   tests/replay-settings-cancel-control-cli.test.mjs` 因未知
   `--cancel-stage` 退出 1。最小实现增加 compiler-query 模式：只有同一
   trace 的 start→发取消→cancelled 和唯一 `-32800` 才可 PASS。
   mock 协议取消但 query-complete 的反例必须 FAIL。原 scheduled 模式
   不变。随后审查发现该事件包围整个 references 回调，不足以证明
   `findReferences` 本体中断。
3. 调用级 RED：真实 framed-LSP 测试再次因缺少
   `references.find-references.start` 失败；GREEN 后记录同一调用的
   start/complete/throw，正常 323 refs、诊断和 trace-off 保持不变。
   `node --test --test-name-pattern='cancellation after TypeScript findReferences returns'
   tests/replay-settings-cancel-control-cli.test.mjs` RED 时，模拟的“调用
   complete、回调 cancelled、协议 `-32800`”仍被误判 PASS；收紧后判 FAIL。
   `--test-name-pattern='predates client cancel'` RED 时旧工具也误判 PASS；
   现在取消事件早于客户端取消不能通过。`--cancel-stage compiler-query` 现等实际
   `findReferences.start`，并要求同一 callIndex 在取消后抛异常。
4. 回放脚本原为 482 行。新增 compiler 生命周期等待和判定放入
   `reference-compiler-cancellation-evidence.mjs`，原 scheduled 阶段等待
   在初次 GREEN 后作有特征测试保护的同义提取；脚本现 481 行，
   新模块 96 行，CLI 测试 357 行，满足 500 行限制。
5. 首轮三次真实 Settings/API24 在回调开始 7–10 ms 后发取消，
   回调最终取消却又运行约 5.8–6.9 秒；它没有证明 TypeScript
   调用中断。更窄的三次独立新进程回放在实际 `findReferences`
   start 后发取消：该调用分别在 12/2/2 ms 后抛取消，LSP 唯一
   `-32800`，9/9 refs、definition、v1 诊断精确恢复。完整 CLI
   回归 15/15 GREEN。前置约 8–9 秒准备和长期资源安全仍未通过。

本记录把 `PASS` 限定为调用进行中取消和结果完整性，不把调用前
约 8–9 秒等待重新解释为快速响应。完整快速门禁若另行运行，
应记录其最终测试数。本轮最终 `pnpm check:fast` 在无并发基准下
**1304/1304 PASS**；此前一次并发运行因生产 catalog-start 5 秒等待
超时为 1301/1302，独立重跑该项通过。`git diff --check` 通过。
