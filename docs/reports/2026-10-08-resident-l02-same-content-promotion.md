# L02：同内容脚本晋升的 Settings/API24 干预对照

日期：2026-10-08。结论：**默认关闭实验消除了已观测到的 13 份同内容
晋升导致的 Program 重建；该未查 definition 的完整响应有可重复改善。**
L02 IN_PROGRESS，后续增量/失效边界和真实编辑成本继续推进；最终产品
验证统一在 L08，本切片不批准生产默认推广。

## 固定输入与实现

- Settings clean checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程
  digest `4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`。
  沿用真实工程边界、API24 兼容 SDK 和完整语义 oracle，没有复制工程
  文件或预查询第二个目标。API24 不冒称 matched API23/DevEco 结论。
- Server parent HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，本次 dirty
  source/build 输入 SHA-256
  `3e1b02b2defc2fac2f966c9f803d31f47aea9d959fc470c2608b0d79aca07dcb`，
  semantic Worker SHA-256
  `fc82c9e042398afd44f1c36607e6dcc29358f39abfdbf48e8ec501ae5d08d151`。
  Node `v26.3.0`，backend `ohos-typescript@4.9.5-r10`；SDK declaration
  digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
  其它 server/sidecar/stdlib/lock/memory-gate pins 在四份 manifests 内完整记录。
- [归因：实验 OFF](../../bench/references/manifests/settings-resident-l02-promotion-off-trace-api24.json)、
  [归因：实验 ON](../../bench/references/manifests/settings-resident-l02-promotion-on-trace-api24.json)、
  [计时：实验 OFF](../../bench/references/manifests/settings-resident-l02-promotion-off-timing-api24.json)、
  [计时：实验 ON](../../bench/references/manifests/settings-resident-l02-promotion-on-timing-api24.json)
  使用同一构建。每对仅 benchmark ID 和 `ARKTS_L02_SAME_CONTENT_PROMOTION`
  值不同；均有 `ARKTS_BENCHMARK_CONTROL=1`，1024 MiB 策略预算及正常诊断。
  表中 OFF/ON 指晋升实验，trace 与 timing 分别表示追踪开启/关闭。
- 初始完整 `MenuController` class-declaration references 精确 248 个位置；
  然后在预打开但此前未查的 `HomePageMenuManager.ets` 中 `40:37`
  查询 `HomeInitData` definition，oracle 为声明 `16:13–16:25`，零基 UTF-16。
- 只有当前 membership、有界 lazy 读取证据与相同源码指纹的晋升保持
  原 script version；真实编辑仍推进新版本和 Program。完整语义范围、
  未保存文本权威、正常诊断和原默认路由保留。

## 干预式归因（trace-on，两个独立进程）

| 指标 | OFF | ON |
| --- | ---: | ---: |
| 同指纹 lazy→resident 晋升 | 13/13 | 13/13 |
| host generation | 257→270 | 257→257 |
| refs 后／definition 后 Program 序号 | 1→2 | 1→1 |
| definition 中分组 createProgram | 475.7 ms，1 个事件 | 0 ms，0 个事件 |
| 完整 definition 响应 | 757.5 ms | 253.8 ms |
| 精确 references／definition | 248/248；1/1 | 248/248；1/1 |

这是同构建默认关闭干预，比旧 L01 的同时发生观察更强：消除晋升的
版本变化时，该窗口中的 Program 重建消失。序号仍是查询后的对象观察，
分组事件也不等于任意路径的构建次数；不外推为所有能力零重建。
原始报告为 `.bench/l02-promotion-off-trace-2.json` 和
`.bench/l02-promotion-on-trace-1.json`。受限沙箱的第一次 OFF 尝试在 LSP
initialize 前因 sampler `spawn EPERM` 停止，无请求/采样，单列在
`.bench/l02-promotion-off-trace-1.json`，不进入性能比较。

## 完整响应与资源（trace-off，三对独立进程）

顺序为 OFF1→ON1→ON2→OFF2→OFF3→ON3；使用相同输入、构建、SDK 与
原 deadline，正常自动诊断保持。没有加入诊断屏障或强制 GC。

| 对 | 路径 | definition 完整响应 | 初始完整 refs | Node RSS 采样峰值 | 产品进程树采样峰值 |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | OFF | 662.4 ms | 9,164.2 ms | 827,351,040 B | 1,005,244,416 B |
| 1 | ON | 185.1 ms | 9,591.4 ms | 792,723,456 B | 970,223,616 B |
| 2 | ON | 179.3 ms | 9,206.8 ms | 788,250,624 B | 965,890,048 B |
| 2 | OFF | 704.1 ms | 9,238.0 ms | 830,537,728 B | 1,008,365,568 B |
| 3 | OFF | 663.3 ms | 9,283.6 ms | 821,370,880 B | 998,785,024 B |
| 3 | ON | 193.8 ms | 9,845.2 ms | 794,275,840 B | 972,054,528 B |

definition 中位数 **663.3→185.1 ms，降低 72.1%**；三次 ON 均小于
500 ms，而三个 OFF 均大于 500 ms。Node 采样峰值中位数
**827,351,040→792,723,456 B，降低 4.2%**；三对下降 4.2%/5.1%/3.3%。
初始完整 refs 仍约 9.2–9.8 秒，没有从本切片获得可证明的冷准备加速。

每对两个请求的完整规范化 Location 集逐项相同，六轮各为 248/248 和
1/1 exact；两份 v1 自动诊断 payload 逐项相同，原有代码 `[2307]` 与
`[2339]` 保留。所有有效回放 `inputUnchanged=true`，无请求 timeout、
空定义、部分结果或 OOM。原始报告为
`.bench/l02-promotion-{off,on}-timing-{1,2,3}.json`。

外采请求 50 ms，实测各轮 P50 110–117 ms、P95 116–128 ms，最大间隔
120–167 ms；上述峰值为采样下界。macOS RSS 不是 PSS，Worker thread
内存已包含在 Node PID，未重复相加。小样本未证明 release P95、长期
稳定性、原 >3 GB/50% 内存门禁或所有恢复/编辑场景。

## 切片验证与后续

公开 LSP RED/GREEN 和版本/源码身份观察见
[TDD 记录](../tdd/l02-same-content-promotion.md)。开启双开关后的 focused
回归 **59/59 PASS**，覆盖晋升、立即未保存编辑、精确引用增删、类型
诊断、磁盘通知、删除/partial membership、SDK 切换、配置与 root 别名、
生命周期/驱逐及 observer 失败隔离。测试注册合同同步为 164 条目。

本轮完整 `pnpm check:fast` 为 **1330/1331 PASS、1 FAIL、exit1**，
0 cancel/skip/todo，总 duration `1670694.545076 ms`。失败是
`references-completeness.test.mjs:60` 的 403-file struct 用例：首个
references 请求 2 在原 `20_000 ms` deadline 超时；日志先记录 index
尚未打开的保守 fallback，随后 catalog 为 403/403 ready。没有得到该
请求的完整 Location 集，不能记 exact PASS，也不能以 focused 代替全量。
收集日志在 `.bench/l02-check-fast-2026-10-08.log`（初始构建输出未收集）。
同一公开用例曾见于 [S05 全量失败记录](2026-09-29-semantic-ready-s05-context-lifecycle.md)
及 [更早的隔离超时记录](../tdd/references-settings-usage-anchor-baseline.md)；
这只证明该失败模式不是首次出现，不证明本轮无回归。

唯一失败的 Diagnose 复核保留原 403 文件、两种 declaration policy、
UTF-16 oracle、SDK 发现与每请求 20 秒 deadline。首先在受限沙箱中两次
原用例和一次父版本均 PASS，但追踪发现该环境的 catalog 降级，不能
用这组结果关闭权限正常、403/403 ready 的 whole 失败。之后两次有
时间重叠的同权限运行均在请求 4 超时，单列为并发负载样本，排除出
单进程对照；没有据此归因晋升实现或宿主。

在与 whole 相同的权限环境、**无并发**、默认关闭晋升的条件下，原
公开用例单独复跑 **1/1 PASS**，总 duration `31930.477742 ms`；随后
固定父版本对照亦 **1/1 PASS**，总 duration `31067.546793 ms`。
父版本只读替换唯一改动的 engine 并独立打包，测试复制只更改 transport
的 server 路径，SDK/sidecar/stdlib 与所有原断言不变，不覆盖当前 dist。
两轮均 0 fail/cancel/skip/todo。单对时序样本不证明无回归或性能差值；
全量 **FAIL 仍未关闭**，本轮没有为该超时实施缺陷修复。

另一个顺序、同权限 trace-on 探针 **1/1 PASS**，catalog 实测 403/403
ready、无降级。请求 2/4 分别为 15.514/17.766 s，3/5 为 cache-control。
两次 miss 都完整验证 403 文件、7 个 transient batch，累计
Program-ready 为 12.576/13.109 s，而 compiler query 仅 126/123 ms。
请求 4 之前的 isolated anchor 耗 2.125 s、返回 0 definition，随后仍
完整 fallback；没有遗漏窗口之外的 struct 声明和使用。这支持“冷构建
主导且逼近 deadline”的成本解释，不唯一证明 whole 波动的原因。
trace-on 不并入产品计时。日志在 `.bench/l02-struct-diagnosis-{interim,solo}.log`、
`.bench/l02-struct-trace-current-escalated-1.log` 和
`.bench/l02-struct-trace-escalated-result.log`；受限探针另留
`.bench/l02-struct-trace-current-1.log`。临时诊断脚本/测试和父版本产物
已清理，正式测试、golden、deadline、默认路由没有改动。

八个有效 benchmark suite 的顶层状态仍为 `FAIL`，因为
`READINESS_UNSUPPORTED`；这与已执行的精确性及机制实验结果分列，
不伪造 semantic-ready，也不阻塞 L02 后续实现。实验双开关保持默认关闭。
L02 继续完成公开 API/import/create/delete/package/SDK 的独立失效合同
和真实编辑成本；L03 继续预算/回收，L08 最后统一产品验收。
