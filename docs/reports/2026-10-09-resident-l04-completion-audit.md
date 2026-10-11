# L04 阶段完成审计

日期：2026-10-09。状态：DONE，阶段 A～E PASS。公开功能、预算组合、
当前固定构建真实对照及完整 check:fast 1449/1449 均通过；回归退出 0，
终态后源码、构建、冻结测试与工程/SDK 等输入身份复核一致。
最终时延、内存、semantic-ready 和长期/平台产品毕业仍在 L08。

## 要求与当前证据

要求来自[原 L04 计划与完成清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)、
[ADR 0012](../adr/0012-query-routing-and-fallback.md) 与用户确认的阶段范围。
缓存 → 有完整覆盖及版本见证的预算内热 LS → 完整 transient fallback
保持；没有把范围缩为单个保护分支或仅有 fixture 热命中。

| 要求 | 当前直接证据 | 状态 |
| --- | --- | --- |
| L04-A 完整结果与真实复用 | 两种 declaration policy、alias/re-export、未打开/native caller、同名排除及 independent legacy oracle；当前两种 policy 的真实 ON trace 首次队列命中完整同一 Program，9/10 refs、零 Program build/Worker start/答案 cache 冒充 | PASS，当前公开与真实证据齐备 |
| L04-B 新鲜度与诊断 | 选定政策下 v2/v3 overlay 增删、诊断 code/range/version，以及未通知 package entry A→B 拒绝旧 proof 并完整回退；原 source/package/link/SDK/options/target/unknown 输入合同保留，在当前完整回归中通过 | PASS；不以旧配置时间戳或旧文本证明新输入 |
| L04-C 预算、取消与恢复 | 原 1024 MiB/滞回与 L03 RSS/成本 owner；低/高压力、trace OFF、完整单批/多批显式错误、物理 verifier 和 resident 请求取消后恢复、refs 进行时导航及编辑失效，最新诊断不丢失 | PASS，四文件当前 10/10；默认关闭与原完整 fallback 保留 |
| L04-D 同构建真实对照 | 两种 policy 的 ON/OFF，trace各8、timing各5，共八个新进程52项exact；四对完整集合/最新诊断一致、输入不变、产品退出0。真实RSS、准备/编辑/冷恢复代价与实际路由已记录 | PASS，仅有限阶段控制；raw ready FAIL、最终资源不毕业 |
| L04-E 完整回归与交接 | 冻结测试后的 pnpm check:fast 1449/1449、退出 0、无 fail/cancel/skip/todo；五个修改测试/夹具、164 个 fast 入口、源码/产物及工程/SDK/backend/lock/sidecar/stdlib 终态身份一致；配置、回滚及 L08 风险交接齐备 | PASS，当前完整回归，未由旧 1439/1439 或 focused 替代 |

## 机制与边界

生产源码/产物未改变，源码输入
`dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`；原 R-09 路由已有公共
RED/GREEN。本轮九条联合功能 characterization 直接 GREEN，唯一
RED/GREEN 为测试回放 runtimeEnv 未传入子进程的工具缺口，不伪造
生产缺陷。五个修改手写测试/夹具均不超过 500 行；旧超限源码债务未修改。

[公开 TDD](../tdd/l04-budget-policy-reference-contracts.md) 保存父 revision、
失败命令、工具 RED/first GREEN、单独 characterization、旧测试检查点
83/83 和当前选定政策 10/10。源代码中的覆盖/版本/配置/磁盘 guard 未
绕过，alias/compiler 是最终语义权威；不建立新 cache 或语义 owner。

同一 Node PID 的 RSS 包含 owner 与 transient，不能按 Worker 数加
第二遍或从物理计数推测 Program 字节。命中发生在原进入线以下；
持续高压仍拒绝无证明的重任务或完整 fallback。已启动单个 Program
的峰值、lease/执行保护和 cleanup 分开记录，不把 soft policy 当硬限额。

## 校准与风险交接

[当前真实对照](2026-10-09-resident-l04-budget-policy-integration.md) 说明
同构建新符号热复用、两种声明策略、编辑/恢复 exact 与正常诊断。
新引用 timing 915.2/936.5 ms 对照3927.2/3226.7 ms；首次准备增加，
timing Node峰值+2.62%/+3.58%，恢复 trace峰值和冷代价更高，不宣布
内存收益、稳定提速或500ms达标。不同恢复工序不作同成本因果比较。

R-09和其它机制保持独立default-off，可关闭实验回到完整fallback；
没有新的capability、生产默认、提交、推送或合并。最终ready、P95、
原内存降幅、PSS/DevEco、长期repeated/edit/pressure、100k和跨平台
均由L08统一判定；API24不冒称API23 matched-SDK/DevEco结论。

## 完整回归与交接

当前 `pnpm check:fast` 的类型检查、构建及 release sidecar 前置均通过；
根测试终态为 1449/1449 PASS，退出 0，2,034,653.968483 ms。
原始输出保留在 `.bench/l04-completion-full.part-001.log` 至
`part-010.log`；嵌套测试工具的故意 skip/todo/失败夹具不计作根回归失败。
终态复核见 `.bench/l04-completion-post-full-identity.json`，164 个入口
SHA 映射摘要为 `26f47670df1e4251a1153202736cb2129fc31f04581daf1b8fa6fba91187315e`。
五个修改测试/夹具分别为 409、309、133、402、155 行，均未超限。

`.bench/l04-completion-summary.json` 保存逐项状态及证据路径；主计划、
Ledger、ADR 与 semantic-ready 入口同步为 L04 阶段 DONE。原 L03 的
1439/1439、首轮 83/83 和旧构建控制仍作为历史检查点，不混成当前分母。
本阶段无剩余实施验收项；L05–L07 自身合同和 L08 最终产品门禁仍开放。
既有未修改超限手写文件债务保留：LegacySemanticEngine 1058 行、proxy
563 行、TypeScript service 3504 行、references batching 测试 1517 行。
