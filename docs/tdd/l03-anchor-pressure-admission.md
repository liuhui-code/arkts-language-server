# L03 高压力下跳过独立 anchor 准备

日期：2026-10-09。引用候选定位中的独立 anchor Worker 现在遵循现有
压力准入：原双开关开启、实际 Node RSS 为 L3 时，跳过该次发现优化，
交回完整 scope 验证。单批完整结果、显式多批拒绝、取消恢复、最新
overlay 与正常诊断合同通过。此为执行保护，不是统一字节预算或
内存收益毕业；最终资源评审仍在 L08，不阻塞 L04–L07。

## 公开 RED 与最小修复

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，RED 前源码输入
`732279696995b0b40854dca9d380bb672155bae413e564a0c8802beddf2561be`，semantic Worker
`e845e7648fb2af0eefdb32055ad1f0dd9bb77b33e10415ceea2886c55c9ed5b2`。已有脏工作树保留，未倒改真实工程
历史 benchmark 的 pins。

真实 Content-Length stdio 子进程使用五个合法文件，包含 alias、
re-export、同名无关类以及 emoji 后 UTF-16 光标；测试 SDK metadata
version 为 `test`，候选 sidecar 为既有 scripted fixture。正常 v1
诊断通过，实际进程 RSS 超过 1 MiB 功能停止线。现有公开 benchmark
control 把记录等级暂改为 L2，不改变 RSS，然后立即从 alias 使用
位置查询引用，检查两次定时采样间的陈旧等级。

旧代码先启动独立 compiler anchor，再进入 references 的预算准入。
完整七处引用断言已通过，但物理 anchor 零启动断言得到 **0/1 FAIL**，
1,959.231723 ms。缺口是多支付一次发现阶段的 compiler 准备，不是
错误引用、部分响应或实际 OOM；这个控制也不证明真实 Settings 已
出现同一陈旧等级竞态。

```sh
node --test --test-name-pattern='high RSS skips discovery-only anchor' \
  tests/semantic/semantic-reference-pressure-sampling.test.mjs
```

最小实现只在 `SemanticTypeEngineRegistry.referenceAnchor` 增加 11 行。
已有 resident proof 或 validated memo 仍先按其原资格检查；确需独立
Worker 时先做取消 checkpoint，再调用现有 `refreshMemoryPressure`，
由原 `SemanticMemoryPolicy` 刷新整个 Node PID RSS、阈值和滞回。
若为 L3，记录 `references.pressure.anchor-skipped` 并返回无发现 anchor。

“无发现 anchor”仅是内部候选优化结果，不是向用户发布空 references：
原候选选择交回 conservative 完整 scope，继续经过既有 references
准入和 compiler exact 验证。无法完整完成的多批计划仍显式
`-32803`、无 Locations；单批只有在完整范围已证明时才能成功。
不会直接信任 index、缩小合法范围或删除原 freshness 检查。
首次同一公开用例 **1/1 PASS**，1,438.666443 ms。

## 开关与恢复控制

沿用 `ARKTS_BENCHMARK_CONTROL=1` 和
`ARKTS_L01_PRESSURE_ADMISSION=1`，没有新增 flag、预算、协议或
LSP capability。生产默认不变，普通 definition 与自动诊断不经过
此发现阶段限制。

七个新增控制验证：高 RSS 的完整单批、完整范围多批拒绝、trace OFF、
缺少任一开关的两条路径、低 RSS（1024 MiB 配置）以及客户端取消后
同进程精确恢复。高压力启用路径没有物理 anchor；成功路径仍启动
完整 references verifier，多批拒绝为零 verifier、零部分结果。
低压力和关闭路径保留原独立 anchor，不能把 tracing 关闭当成零工作。

各控制保留 v2 未保存新增调用，普通 TS2304 诊断及导航精确；
两种声明策略的成功路径分别有 7/8 处精确引用，与同名无关类隔离。
多批仍预算拒绝且不留下部分成功缓存。取消控制返回 `-32800`，
等待真实 verifier 退出归零，再用同一进程完整恢复。最后 transient
计数为 0，正常 shutdown 退出 0，无 Worker fatal。

新增控制与原七个 RSS 准入控制、四个测试清单检查串行 **18/18 PASS**，
50,472.157953 ms。初次 RED/GREEN 是扩展前的一个用例，历史计数
不倒改为后来全部用例。现有 test entry 仍为 170，文件已归属 bundle-e2e。

1 MiB、scripted 候选、测试 SDK、batch roots 1 与取消中的 1000 ms
verifier delay 都是功能干预，不是产品预算或时延测量。SDK 合同仅为
未验证的 plain-TypeScript-compatible 范围，不冒称原生 API24 毕业。
上轮 [真实 Settings 生命周期对照](../reports/2026-10-09-resident-l03-transient-occupancy.md)
采用声明光标，未触发本独立 anchor；不能将其资源数据归为此次收益。

## 当前验证与后续工作

`pnpm check` 和 `pnpm build` PASS。十五文件串行 focused
**160/160 PASS**，0 fail/cancel/skip/todo、退出 0，
677,867.206269 ms，完整 transcript。覆盖 anchor/memo/种子、完整范围、
批次与 recursive fallback、取消合并/调度、resident 引用、诊断、
压力/lease、production Worker 和自动回收。具体命令、hashes 与逐步
结果在 [.bench 校验摘要](../../.bench/l03-anchor-pressure-summary.json)；
原始 [RED](../../.bench/l03-anchor-pressure-red.log)、
[首次 GREEN](../../.bench/l03-anchor-pressure-first-green.log)、
[控制组](../../.bench/l03-anchor-pressure-controls.log) 和
[组合回归](../../.bench/l03-anchor-pressure-focused.log) 分别保留。

源码输入 `76b1996e487f5ee67eb86611a4bb889b28704190b3aaf32ea9f14cc9dadf4b55`，
semantic Worker `9905a36a443553af69ee3d98bd0afc1cd5aab78e3df6af56fbfd5e1ac8328465`；
diagnostic Worker `367e665b190be2130d62bb4e33f57a9fd8e7f3c160db281838579f23d1464c91`。
server 与 reference verifier 主产物未变。focused 前后源码、构建、
测试与真实 Settings/SDK 指纹一致。修改的类型引擎 494 行、测试
292 行，均不超过 500；没有修改既有超限文件，迁移债务仍保留。

当前完整 check:fast **NOT_RUN**，旧 whole 1380/1380 不覆盖此源码。
新构建真实工程 A/B、字节成本与收益仍 **NOT_RUN**；回到完整 scope
可能增加单批成本，不能由少一个 Worker 宣称 RSS 或时延降低。
统一 resident/transient 字节预算、soft budget 校准、已启动单批的
峰值、anchor/诊断重叠和其它压力配置继续在 L03 实施。RSS 按 Node
PID 只计一次，不能按文件数、源码长度或对象清零伪造字节归还。
最终内存、500 ms/P95、长期 soak、PSS/DevEco 与平台评审留在 L08。
