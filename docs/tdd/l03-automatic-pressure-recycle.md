# L03：实际 L3 后的自动 Worker 回收

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
接续 [可取消请求等待](l03-recycle-request-wait.md)，最终验收仍在 L08。

## Characterization 与有效 RED

先将请求计数/取消分派移入既有 recycle owner，重新构建后，原七个
公开 LSP characterization **7/7 PASS**。Worker runtime 未改变。
随后只新增一个自动回收用例：真实 Content-Length 子进程、正常诊断，
以小夹具 64 MiB 策略触发真实 RSS L3，不发送显式 memory-pressure 或
recycle 请求，也不强制 GC。公开 v2 诊断和实际 L3 驱逐先通过，随后
因自动替换事件不存在而 RED；不是夹具/SDK失败。

```sh
node --test --test-name-pattern='automatic post-L3 Worker recycle' \
  tests/semantic/semantic-worker-recycle.test.mjs
```

旧实现 0/1 FAIL，新实现 1/1 PASS；原始 RED
`.bench/l03-auto-recycle-red.log`。小夹具预算仅用于功能干预，不更改
真实工程的原 1024 MiB 预算或把低预算结果当作产品内存门禁。

## 最小实现与边界

- 新双开关：`ARKTS_BENCHMARK_CONTROL=1` 与
  `ARKTS_L03_PRESSURE_WORKER_RECYCLE=1`，默认关闭。L01 显式回收的旧
  开关/公开 benchmark 方法资格不变；自动回收不依赖 L01 flag。
- runtime 仅在自动 RSS sample 的实际 L3 使 resident context 数减少后
  发送私有压力信号；显式压力 control 不触发此自动入口。
- main-thread 保留待回收状态，合并到一次下一事件循环尝试；有请求、
  candidate preparation 或未确认 mutation 时不替换。完成回调再次
  尝试，不用定时强杀正在执行的 compiler。
- 替换仍必须经原 Worker 的真实 L3、零 context、零 lease、无 global
  references 见证以及单一 root 检查。旧 Worker 终止后才创建新 Worker。
  打开文本/版本、最新 project/SDK 选择重放；延迟编辑先冲刷再释放等待。
- witness 阶段的并发变更或不适用见证阻止替换；替换/重放中发生变更
  时物理 Worker 已改变，最新 mutations 冲刷后按原保守合同返回错误，
  因此自动 `skipped` 日志不保证没有替换。shutdown 清除待回收；正常
  请求继续使用前轮可取消等待，不发布 stale/partial 成功。

最初用例 GREEN 后，依次追加 tracing OFF、缺少 benchmark、缺少 opt-in
和 L3 事件前已排队导航的 characterization，均直接 GREEN，未伪造 RED。
两条关闭路径虽有实际 L3 驱逐，但整个协议只启动一个 Worker、无自动
替换；ON 的 old/new threadId 不同。未保存 v2 的三处和 v3 的四处引用、
emoji 前缀后的精确定位及正常版本化 2304 诊断均通过。

## 自动回收首轮构建验证

`pnpm check`、构建 PASS；十文件组合回归 **86/86 PASS**，退出 0，
0 fail/cancel/skip/todo，37,690.497613 ms。包括 production Worker、
supervisor/lanes、reference/project snapshots、workspace freshness、
coalescing、diagnostic scheduling、cancellation scope 与 12 个 recycle 用例。
原始 `.bench/l03-auto-recycle-focused.log`。

源码输入 SHA-256
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`，
semantic Worker `e812e34cd09ef8411cc7650d52294d0c0e05ea71c4c1107545e01dc9e581bb3c`。
新自然压力 Settings A/B 使用独立 L03 manifests；不改旧 L01/L02 pins。
随后 [四轮实际回放](../reports/2026-10-08-resident-l03-natural-worker-recycle.md)
各 22/22 exact、配对诊断一致；一次 trace-off Node 峰值降低 28.2%，
编辑样本 P95 增加 24.6%，不宣布整体性能或长期资源收益。
该检查点源码 whole 尚未重跑，不能沿用 L02 的 1338/1338 作为其完整门禁。

手写新 recycle owner 179 行、runtime 482、host 204、扩展测试 368 行。
既有 proxy 563 行未增长，并已提取请求执行责任；最初 613 行的迁移
债务继续向 500 行收敛。type engine 3576、legacy engine 1068 行债务保留。
该检查点仅允许单根且有打开文档，资格仍有限；功能通过不等于真实工程
内存/P95/soak 收益。成本感知准入、其它 root 状态和长期压力继续推进。

## 多根自动回收与最新 overlay 恢复

2026-10-08 接续切片，父 HEAD 仍为
`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。先新增一个真实双根 LSP
用例，两根的正常 v2 诊断与实际 RSS L3 驱逐均通过，旧实现随后明确
返回 `pressure-recycle.skipped`，理由为 `requires one quiescent root`。
这是回收资格限制的有效 RED，不是 SDK 或夹具初始化失败。

```sh
node --test --test-name-pattern='replays independent latest overlays' \
  tests/semantic/semantic-worker-recycle.test.mjs
```

原始 RED `.bench/l03-multi-root-recycle-red.log`，0/1 FAIL；修复后
1/1 PASS（2,883.252716 ms）。随后追加只编辑第一根的 characterization，
直接 GREEN（5,064.57735 ms），未伪造第二个 RED。
RED 前源码输入为
`8ff3938baaf6d4b9fa8f4b32d00f359fb28d5eda51317456c92443cddffb53ac`。

自动入口从既有 host 捕获已注册 root URI，确认每份打开 snapshot 的
workspaceId 属于它们；替换后先重新注册所有 root，再按所属 root
重放文本与版本。仍只使用一个物理 Worker，并沿用零 context/零 lease/
无 global references 的真实 L3 见证、全局静默、并发变更和取消保护。
手动 L01 回收仍要求单根及非空打开文档；自动入口也仍拒绝零根或全部
文档关闭的状态。没有新增 checker、缓存 owner、并发额度或实验开关。

两根磁盘内容相同但 URI 和未保存文本独立：第一根三处引用，第二根
四处引用。回收后 definition 和完整 references 均逐 URI/UTF-16 range
精确；emoji 前缀不改变定位合同。只编辑第一根到 v3 后，正常版本化
2304 诊断和四处引用通过，第二根原 v2 的四处引用不变，shutdown 退出 0。
64 MiB 仅用于小夹具的自然压力干预；夹具 SDK metadata 为 `test`，属于
未验证、plain-TypeScript-compatible 合同，不是原生 API24 产品验收。
真实工程预算仍为 1024 MiB，两个实验开关仍默认关闭。

当前 `pnpm check`、构建 PASS；十二文件串行组合回归 **117/117 PASS**，
0 fail/cancel/skip/todo，退出 0，83,870.428696 ms。包括十三个 recycle
用例及 production Worker、supervisor、协议、project/reference snapshot、
跨 workspace 新鲜度、取消、诊断调度、合并与 coordinator lease/压力合同。
`.bench/l03-multi-root-focused-partial.log` 保留可用转录及完整最终汇总；
其中一个工具输出块被截断，不将其称作完整原始转录。

同一源码随后独立 `pnpm check:fast` **1380/1380 PASS**，退出 0，
0 fail/cancel/skip/todo，1,680,241.840221 ms。类型检查、重新构建和
完整 fast 层均通过；新增多根用例在其中再次 PASS（5,418.811481 ms）。
`.bench/l03-multi-root-check-fast-partial.log` 的可用转录有工具截断，
完整最终汇总和退出码仍已捕获；结构化结果及构建身份保留在
`.bench/l03-multi-root-summary.json`。这清除当前代码回归门禁，不
改写此前 sandbox 中断或并行失败，也不代表 L08 资源/时延验收。

本切片源码输入为
`02e07c902bc97434d62a9b95f26c016cdca05919a03d5abeb0bec4f12e7474e1`，
server 为 `05659b46aba47c3649fb08ec2b1b62606c93fad5641f975739f9d039f8667297`。
host 201 行、recycle owner 182 行、测试 460 行；本切片未增长既有
超限文件。多根功能通过不等于成本感知准入、统一资源预算或长期压力
已经完成，这些仍属于 L03，最终内存/P95/soak 与发布验收仍在 L08。
