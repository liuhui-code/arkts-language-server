# L01 Settings/API24：references 回调取消与恢复

日期：2026-10-06。状态：**3/3 最终取消及结果完整性 PASS；取消生效耗时约 5.8–6.9 秒；
TypeScript `findReferences` 本体是否中断仍未证明；L01 资源安全仍开放**。
本控制接续[queue-start 取消](2026-10-06-resident-l01-cancel-control.md)，
不把协议层 `-32800` 单独当作 compiler 已停止的证据。

## 固定输入与命令

- 真实 `applications_settings` clean commit
  `ecc550dfaed880e04e38a2477eb7235cd50475b9`，私有本地克隆运行；
  查询 `HomePageMenuManager.ets` 中 `HomeInitData`，零基 UTF-16 `40:37`，
  `includeDeclaration=false`，独立 oracle 共九位置。原工程和私有克隆均未改动。
- 项目声明 compile SDK 23；本机采用 DevEco ETS API24 `6.1.1.125`
  兼容测试轨，声明 digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
  Node `v26.3.0`，`ohos-typescript@4.9.5-r10`；server HEAD `72a2fa8`
  加未提交修改，bundle SHA-256
  `d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`，
  semantic Worker SHA-256
  `3cac0ca7506bcef82bf6c1b5d17e3722cf5d13e2b730548fb85cce557ab2541c`。
  [manifest](../../bench/references/manifests/settings-resident-l01-cancel-compiler-query-api24.json)
  SHA-256 `91d4a8cca73513b8c20c8ff25e59c1e47069c9d38f755ad71570c0041b451576`。
- 保留正常 v1 自动诊断；`legacy + full SDK` 用于 L01 的完整 LS 控制，
  `session-reuse=off`，trace 仅为观测。生产默认 `indexed-batched` 未改变。

```sh
node scripts/bench/replay-settings-cancel-control.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-resident-l01-cancel-compiler-query-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --strategy legacy --cancel-stage compiler-query --session-reuse off \
  --out .bench/semantic-ready-l01/cancel-compiler-query-new.json
```

`--out` 必须是新路径；原始三次证据为
[01](../../.bench/semantic-ready-l01/cancel-compiler-query-current-01.json)、
[02](../../.bench/semantic-ready-l01/cancel-compiler-query-current-02.json)、
[03](../../.bench/semantic-ready-l01/cancel-compiler-query-current-03.json)。
每份保留 Content-Length LSP transcript、默认关闭的查询生命周期事件、
诊断、规范化结果与外部 Node PID RSS 曲线。请求的采样间隔为 50 ms，
实际间隔和进程树开销以各原始文件为准；worker thread RSS 不重复相加。

## 三次独立新进程

| 运行 | 查询开始→发取消 | 发取消→references 回调报取消 | 发取消→LSP 终态 | 终态 / 恢复 | Node PID RSS 峰值 |
| --- | ---: | ---: | ---: | --- | ---: |
| 01 | 9 ms | 6,898 ms | 6,905 ms | 唯一 `-32800`；9/9 refs、definition exact | 697,036,800 B |
| 02 | 10 ms | 6,668 ms | 6,679 ms | 唯一 `-32800`；9/9 refs、definition exact | 737,910,784 B |
| 03 | 7 ms | 5,755 ms | 5,758 ms | 唯一 `-32800`；9/9 refs、definition exact | 750,276,608 B |

独立采样还显示，取消发出后、references 回调抛出取消前，Node PID RSS
仍继续上升。以下是最接近取消时刻的样本与该区间采到的最高值，
不是精确瞬时分配量，也不能把全部增长单独归因于 compiler 查询：

| 运行 | 取消附近 RSS | 取消后、回调报取消前峰值 | 采样增量 |
| --- | ---: | ---: | ---: |
| 01 | 420,909,056 B | 668,184,576 B | +247,275,520 B |
| 02 | 409,415,680 B | 719,015,936 B | +309,600,256 B |
| 03 | 406,745,088 B | 733,917,184 B | +327,172,096 B |

三次均有同一 `traceId` 的 `references.compiler-query.start`，并在取消后
出现 `references.compiler-query.cancelled`，没有该请求的正常 query-complete
事件。该事件名称沿用首次观测实现，实际包围整个 `engine.references()`
回调；它只证明回调抛出 `OperationCanceledException`，**不证明异常由
TypeScript `findReferences` 内部抛出**，也可能来自其后的结果映射检查点。
响应没有 `result`、没有第二终态或部分位置；随后同进程重试九位置
URI＋UTF-16 range 完全一致，definition 精确落在声明 `16:13–16:25`；
正常 v1 诊断 code `2339`、范围 `60:70–60:85` 与固定输入一致。

第一轮中，server 的 `request.completed` 取消日志在发取消约 1 ms 后出现，
而 LSP 终态与 references 回调取消事件都在约 6.9 秒后到达。这只能证明
协议取消意图已被较早识别，**不能**说正在运行的 compiler 被及时抢占。
三次 references 回调从进入到抛出取消分别持续约 6.91/6.68/5.76 秒；
当前观测尚不能把这些时间分摊到 Program 构建、定义查找、
`findReferences` 或它们内部的取消检查点。

后续已用只包围 TypeScript `findReferences` 的观测重新回放三次，
见[更窄的调用级证据](2026-10-06-resident-l01-find-references-cancel.md)。
本页命令和 manifest 锁定的是旧观测 bundle，仅用于解释原始三次数据；
当前构建应使用后续报告中的新 manifest 和命令。

## 判定与后续

首次回放工具在进入 references 回调后发出取消、同一回调抛出取消、
公开 LSP 唯一返回 `-32800` 且完整恢复时才标记此切片 `PASS`。
“协议已取消但回调正常完成”的模拟反例被判 `FAIL`。复核后发现该
条件不足以证明 TypeScript 本体中断；现已增加实际 `findReferences`
调用的 start/complete/throw 默认关闭观测及更严格的回放判定。
这里的 `PASS` 仅是**最终取消与结果完整性**，不是编译器中断、取消时延、500 ms 跳转、
长期内存或 L01 安全继续门禁。下一步应在不改变默认路由/预算/诊断的
前提下定位首次有效 compiler 取消检查点，并独立完成 repeated/edit/pressure
资源曲线；在此之前 L02 与生产接线仍未获准入。
