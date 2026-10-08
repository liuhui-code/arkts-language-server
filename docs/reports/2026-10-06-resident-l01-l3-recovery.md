# L01：真实 Settings/API24 的 L3 驱逐后新符号引用控制

日期：2026-10-06。状态：**单次真实工程恢复精确性 PASS；产品 readiness、500 ms、资源发布门禁未通过或未测**。
本轮仅扩展 prepared-suite 复现工具、公开 CLI 测试和固定回放输入；生产 semantic
策略、worker 数、预算阈值、诊断、合法工程搜索范围和完整性规则均未改变。

## 固定输入与重放

- [manifest](../../bench/references/manifests/settings-resident-l01-l3-recovery-api24.json)
  SHA-256 `a5204e64314b9039d804a3a29411ee51f4156de4c4325b476520757dc0168b20`；
  [原始 JSON（含规范化 Location、日志、外部 RSS 曲线）](../../.bench/semantic-ready-l01/l3-recovery-current-01.json)
  SHA-256 `68217d5b7329e60d7ae5039bee63ec9d8306d599c753ce6e6c6724ed7809ac16`。
- 原工程 `.bench/real-projects/settings-ecc550` clean，commit
  `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程文件 digest
  `4becf56c…b0d40`；显式使用 DevEco SDK API24 `6.1.1.125`，声明 digest
  `8098b8ab…d4c6e4`。这是兼容性测试轨，**不是工程原声明 API23 的 matched-SDK
  或 DevEco 等价性结论**，也未改动 Settings 工程边界。
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，未提交 source
  input digest `c5f961a4…1d430a`；`dist/server.cjs` SHA-256 `99d16dc0…f5b2`，
  semantic worker `3353b595…12b57`，sidecar `84597a63…fd796`；Node
  `v26.3.0`、`ohos-typescript@4.9.5-r10`。本次 runner
  `prepared-query-suite.mjs` SHA-256 `6fd824c0…a2d5128`，入口
  `replay-references.mjs` `3be215bf…1be06`。`pins` 在回放前后相等。
- 实验环境仅使用 `legacy + full SDK` 来观察一个完整 LS 的 L3 恢复；
  `ARKTS_REFERENCES_TRACE=1` 和 `ARKTS_BENCHMARK_CONTROL=1` 仅用于归因及
  现有基准专用控制。生产默认仍是 `indexed-batched + closure + full SDK`。
  **trace-on 的时延不能与 trace-off 产品分布混算。**

当输入 SHA 仍与 manifest 匹配且输出文件尚不存在时，执行：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-l3-recovery-api24.json \
  --out .bench/semantic-ready-l01/l3-recovery-next.json
```

此命令有意以 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED` / exit 1 结束：
catalog `ready` 不是 generation-bound semantic-ready 合同。macOS 外部只读
`ps` RSS 采样需要相应权限。历史 L01 报告固定的是**旧 runner 字节**；
本轮 runner SHA 改变后，不可改写旧 pins、重标旧 raw 或与旧时延合并。

## 公开 LSP 时序与结果

经真实 `dist/server.cjs --stdio` 的 Content-Length LSP，保持普通自动诊断：

| 顺序 | 请求/事件 | 零基 UTF-16 位置 | 结果 |
| --- | --- | --- | --- |
| 1 | `didOpen` 两个真文件；首次 `textDocument/references` | `common/src/main/ets/core/controller/MenuController.ets` 的 declaration `70:13`，`includeDeclaration=true` | 248/248 exact；完整响应 16,090.5 ms |
| 2 | `arkts/benchmark/applyMemoryPressure({level:"level3"})` | 当前已有 context sequence 1 | 响应 `{applied:"level3"}`；之后观察 `semantic.context.evict`，`reason=memory-level3`、sequence 1 |
| 3 | 此前未查询的 `textDocument/references` | `common/src/main/ets/sendable/HomeInitData.ets` 的 declaration `16:13`，`includeDeclaration=true` | 10/10 exact；完整响应 13,797.3 ms |

两次请求均 `COMPLETE`，规范化 URI＋range 的 `missing=[]`、`extra=[]`、
`duplicates=[]`、`invalid=[]`；HomeInitData 的 10 个位置包含 `common/index.ets`
1 个、声明文件 2 个、`HomePageMenuManager.ets` 7 个。两目标正常 v1
诊断均被观察：MenuController 1 条、HomeInitData 0 条；诊断未被关闭。
无超时、OOM、空结果或 partial-success；server 正常 shutdown/exit 0。

控制请求开始于相对时间 43.736 s，2 ms 内确认 applied；约 211 ms 后
观察到驱逐事件，**然后**才发送 HomeInitData 查询。日志依次显示 context
sequence 1 被 L3 驱逐、sequence 2 建立，Home 查询后的 Program sequence 2
有 2,261 个 SourceFiles；trace-only fork `createProgram` 分组事件约 8.206 s。
该事件是分组统计，不是准确的 Program 构造调用次数。此后还观察到
sequence 2、3 的自动 `memory-level3` 驱逐，事件时 Node RSS 分别约
1.043/1.070 GB；它们发生在后续正常诊断/内存策略交错期间。这是**同一次
trace-on 中的重复压力与重建现象**，不能据一个样本断定泄漏，也不能把整个
回放描述为已达到稳定低内存驻留；L01 的资源稳定性门禁仍未通过。

外部采样目标 Node PID 峰值 RSS 为 **1,087,504,384 B**；初次请求完成附近
约 749,899,776 B，L3 控制后约 753,573,888 B，Home 查询完成附近约
1,063,759,872 B。请求的采样间隔为 50 ms，实测 p50/p95 为 171/239 ms，
峰值因而只是采样下界；sampler/harness 单独记账，worker thread RSS
没有重复相加。1024 MiB 是软策略预算，不是进程硬 RSS 上限；本例不是
PSS、DevEco 对照、原始 >3 GB 复现或 50% memory gate。

## TDD 与判定

Parent revision `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`。新增
[公开 CLI 测试](../../tests/prepared-suite-l3-cli.test.mjs) 直接启动真实 LSP 子进程、
使用一个干净的两真符号 fixture 和两个固定逐位置 oracle；先运行
`node --test tests/prepared-suite-l3-cli.test.mjs`。首轮沙箱缺少 macOS
`ps` 权限，不作行为 RED；获准只读采样后 RED 为 exit 1：后一个场景
仍被跳过、报告 correctness `FAIL`。最小 runner 改动仅在显式 benchmark
flag + trace 下发送 level3，等待**新出现的** `memory-level3` 驱逐日志；
缺控制、缺实际驱逐或目标已查询时阻断场景，不冒充完成。

GREEN：同一公开测试 1/1 PASS；
`node --test tests/prepared-suite-cli.test.mjs tests/prepared-suite-l3-cli.test.mjs`
24/24 PASS；`git diff --check` PASS；所改脚本 286 行、新测试 97 行，
均低于 500 行限制。真实 Settings 的一次 replay 2/2 exact 且控制归因
成立，但 `READINESS_UNSUPPORTED` 仍使报告总状态 `FAIL`。

**结论：** L01 的一项 L3 后完整结果恢复控制有了真实工程证据，不能据此
判定 L01 安全门禁整体 GO；真实取消、重复压力/稳定驻留、正式 trace-off
时延、原内存发布门禁仍未完成。恢复查询的 13.797 s 是明显的诊断线索，
不是 ≤500 ms 产品目标的成功样本，也不应拿一个 trace-on 样本估 P95。
