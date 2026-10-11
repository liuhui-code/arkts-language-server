# L03 全部文档关闭后的压力回收

日期 2026-10-08。接续 [多根自动回收](l03-automatic-pressure-recycle.md)
与 [成本感知容量驱逐](l03-cost-aware-capacity-eviction.md)，本切片允许
已注册 roots 在全部文档关闭后，继续通过既有实际 L3 与静默见证
替换 Worker。实验仍默认关闭；这补齐一个回收资格，不代表统一字节
预算、内存收益或 L03 全阶段完成，最终产品验收仍在 L08。

## 生命周期保护与有效 RED

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，父源码输入
`b15bd9dac4975ed6052e8d7df0dade07a6e6f3f8e20eca80b281551aac54fc72`。
先在 GREEN 下把已有 navigation、UTF-16 Location、正常诊断和
生命周期事件等待提取到一个公开 LSP 测试 helper。原十三个用例
重新串行运行 **13/13 PASS**，41,367.853465 ms；没有改 Worker 行为。
完整转录 `.bench/l03-idle-recycle-characterization.log`。

随后新增真实 Content-Length LSP 用例：两个独立根先发布正常 v2
诊断，batched references 进入 verifier 后，另一个精确 definition
建立 resident context 并触发实际 RSS L3。此时 references 仍在途，
不能替换 Worker。关闭两根的全部文档使 references 返回 `-32801`，
没有 Locations；待请求与 mutations 清理后才检查自动回收资格。

旧实现以 `requires quiescent registered roots` 跳过回收，身份断言
RED，**0/1 FAIL**，1,474.123534 ms。正常诊断、引用在途、真实 L3、
精确定位和关闭后的 ContentModified 都已先通过，不是 SDK 或夹具失败。
原始 `.bench/l03-idle-recycle-red.log`，命令如下：

```sh
node --test --test-name-pattern='remains available after every registered root closes' \
  tests/semantic/semantic-worker-recycle.test.mjs
```

最小修复后首次 **1/1 PASS**，12,650.945021 ms；完整首次 GREEN
`.bench/l03-idle-recycle-first-green.log`。既有 verifier delay 1,500 ms
只用于控制在途阶段，不据此比较响应性能。

## 自动入口与手动入口的边界

只把非空文档要求限定到手动入口。自动入口仍要求至少一个已注册
root、main-thread 请求/preparation/mutation 静默，以及原 Worker 的
实际 L3、零 resident context、零 lease、无 global references 见证。
零根仍拒绝，未知 root snapshot 检查、配置/文档变更 fence、延迟
mutation 冲刷、可取消等待和替换失败的保守处理均未改变。

沿用 `ARKTS_BENCHMARK_CONTROL=1` 与
`ARKTS_L03_PRESSURE_WORKER_RECYCLE=1`，没有新增开关。手动 L01
入口仍要求单根且有打开文档，新的公开空文档检查仍明确拒绝。
旧 Worker 终止后才创建新 Worker，并先恢复全部 root 注册；空文档
时不重放已关闭的旧 overlay，不新增 checker、缓存 owner 或并发额度。

## 重新打开与关闭对照

开启实验、关闭 benchmark、关闭回收 opt-in 和手动入口四组合同
**4/4 PASS**，29,266.816429 ms。两个关闭路径虽观察到实际 L3，仍
只启动原 Worker，没有自动替换；全部用例 shutdown 退出 0，无 fatal。
首次 GREEN 后追加两个关闭路径和手动空文档检查，四组合同直接
GREEN，未伪造额外 RED。

两根重新打开时沿用原 v2 版本号，但各有新的未保存引用，精确返回
四处和五处 Locations，而不是原三处/四处或磁盘两处。第一根随后
编辑到 v3，精确返回五处引用并发布正常 2304 诊断；第二根的 v2
五处引用保持不变。definition 的 URI 与 emoji 后 UTF-16 range
始终精确。组合回归还明确检查在途 references 阻止替换。

64 MiB 只用于小夹具的自然压力干预，没有显式 L3 或强制 GC。真实
工程 1024 MiB 策略和两个 resident context 容量不变。夹具 SDK version
为 `test`，属于未验证的 plain-TypeScript-compatible 合同，不冒称
原生 API24 产品资格。

## 当前验证与后续实施

`pnpm check` 与 `pnpm build` PASS；十三文件串行 focused
**126/126 PASS**，0 fail/cancel/skip/todo，退出 0，130,154.54444 ms。
包括十六个回收用例、production Worker、supervisor/协议、project/
reference 快照、跨根新鲜度、合并取消、正常诊断调度、resident
references、L2/cost witness 与 Coordinator lease/压力。
`.bench/l03-idle-recycle-focused-partial.log` 保留可用转录；一个工具
输出块被截断，完整最终汇总和退出码已捕获，不称其为完整原始转录。
构建身份、逐步命令、计数和测试哈希在 `.bench/l03-idle-recycle-summary.json`。

当前源码输入
`aac45b734d1ce30284130d3e86a94f37457b101e4730e41b35e0551d549b7a98`，
server `392e27f80f172ed0dfc4af54336ddcbbf0fc67a3864e00bb8beeeb41b6bdb204`。
行为改变在 main-thread 回收资格；semantic Worker 产物未变。
focused 前后源码、产物、Settings 输入与 SDK 指纹一致。recycle owner
183 行、测试 470 行、测试 helper 45 行；本切片未修改既有超限文件。

当前源码 whole **NOT_RUN**，不沿用旧多根检查点 1380/1380；合并前
仍须 fresh `pnpm check:fast`。真实工程的闭文档回收 A/B 尚未运行，
不宣称内存或时延收益。统一 resident/transient 字节核算、soft budget、
single-batch/anchor/诊断重叠、其它关闭/配置组合和长期压力继续在
L03 实施；默认关闭的 L04–L07 照常推进，最终门禁仍留在 L08。
