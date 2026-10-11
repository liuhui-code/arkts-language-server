# L03 阶段完成审计

日期：2026-10-09。状态：PASS，L03 阶段实施与校准完成。预算政策、
代表性联合控制、当前固定构建校准与完整 `pnpm check:fast` 均已核验；
全回归 1439/1439 PASS，退出 0，终态后源码、构建、测试及工程/SDK
身份复核一致。阶段范围是预算、准入、回收和恢复的实现及校准，
不包含 L08 的产品毕业或默认推广。

## 要求与当前证据

要求来自[原 L03 计划及完成清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)、
[ADR 0011](../adr/0011-budgeted-preparation-and-session-reuse.md) 与用户将
最终验收放在 L08 的推进规则。没有将阶段范围缩为单个保护分支。

| 要求 | 可核验的当前证据 | 审计状态 |
| --- | --- | --- |
| L03-A 同进程字节政策与生命周期 | runtime 与 memory-policy 只读同一 Node RSS；metrics 明确 node-process/owner-isolate 范围；reference、anchor、diagnostic 都由真实 exit 释放物理计数。公开组合观察三类生命周期，真实 Settings 测到 resident/reference/diagnostic 与退出后仍高 RSS | PASS，源代码、公开观测与当前全回归一致 |
| L03-B 统一决策与安全回退 | 低压力 retention、L2 trim、L3 成本排序和每次处置后的实际 RSS、当前 Worker 资格共用原压力 owner；lease 和在途工作保留。完整单批 exact、多批显式错误、压力回落后不重启旧查询后续批、拒绝事务保留已验证引用缓存 | PASS，联合控制与当前全回归通过 |
| L03-C 公开功能矩阵 | 当前六文件控制 20/20，覆盖低/高/回落、成本未知/并列、lease、两根/全关闭、trace/开关关闭、取消/编辑/恢复和正常诊断；当前全回归包含完整范围、alias、SDK/package/target 及调度合同 | PASS，164 个 fast 入口的 1439/1439 通过，不用 20 例替代全回归 |
| L03-D 固定构建校准与参数选择 | 当前 Settings/API24 选定配置/对照 trace 各 8 项、timing 各 5 项，26/26 exact，最新诊断深比较一致、输入不变、产品进程退出 0；raw readiness 为 FAIL / READINESS_UNSUPPORTED、runner 退出 1，保留为 L08 门禁。初始/稳态/编辑/global/recovery 的 RSS 与准备成本有原始记录 | PASS，本阶段校准已核对，不代表产品资源或 readiness 毕业 |
| L03-E 冻结全回归与交接 | `pnpm check:fast` 1439/1439 PASS、退出 0、无 skip/todo/cancel；终态后产品/工程/SDK pins、十四个修改文件与测试入口身份一致。参数、决策、回滚、风险和 L08 接收项已记录 | PASS，完成报告与直接证据齐备 |

## 机制边界

`semantic-worker-runtime` 是压力 owner，预算单位为字节；Worker threads
的 RSS 不另加一遍，owner heap 也不冒称 verifier heap。物理计数用于
解释存活和重叠，不用于从 RSS 减去虚构的 Program 字节。指标关闭不
关闭政策，也不构造额外 Program。准备成本是实际成功调用的 grouped
compiler 耗时；缺测、并列或旧实例没有排名资格。

公开入口在未命中的全局引用开始前暂停并等待诊断，结束后恢复最新
版本；缓存命中则允许诊断继续。anchor 和 batch 是顺序阶段，resident
可以与任一 transient 共存。阶段验收既核对实际可发生的重叠，也核对
调度排除的重叠；不虚构三类 verifier 同时运行的证明。低优先候选准备
在 L3 跳过，仍交回完整范围，不能用空数组冒充全局查询成功。

L3 回收后的等级由实际 RSS 和原滞回重新计算，持续高压不因某个根
重建昂贵而豁免；全 leased 时不强杀语义状态。已启动单个 Program
可以越过 soft budget，峰值及可停止/清理边界分别记录，不声称硬
allocator 上限。当前公共取消测试等待实际 verifier 退出后完整恢复。

## 校准与选定配置

此前 L01 的初始/steady/驱逐恢复和 L02 的编辑/晋升资源记录作为输入
保留，不倒改旧构建 pins，不把旧失败变成当前收益。最新同构建
[校准报告](2026-10-09-resident-l03-budget-policy-calibration.md) 接续这些
输入，给出 RSS、重建/恢复、正常诊断、完整 oracle 与输入指纹。

保留 1024 MiB soft budget、L1/L2/L3 为 70%/82%/92%、退出目标 85%、
owner 一个、resident 上限两个和全局重任务并发一。选定实验开启
budget-aware retention、成本回收、压力准入和 L3 transient 诊断，
不纳入自动 owner 替换：相同构建的替换候选没有峰值优势，却使稳态
重复约 4.9 s；不替换的选定 timing 和对照重复都约 1.17 ms。

选定 timing Node 峰值比对照高 0.77%，不是内存下降证明。真实冷恢复
仍慢；对照和选定的准备工序不同，不将 query 内零 createProgram
解释为无冷准备。参数保留是保守的阶段决策，不能用单进程短序列
外推稳定性。回滚为去掉本阶段 opt-in、恢复 dispose 与完整 transient
路径；自动回收机制保留为独立、默认关闭的实验，不作整体否决。

## 身份与完整回归

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，源码输入
`dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`。
当前源码/产物、十四个手写文件的 SHA/行数、三个产品 RED/GREEN、
联合 20/20、回放器 35/35 及全回归状态见
`.bench/l03-pressure-cost-summary.json`；全回归分段输出为
`.bench/l03-pressure-cost-full.part-001.log` 至 `part-015.log`，完整保存，
没有输出截断。终态为 1439/1439 PASS，0 fail/cancel/skip/todo，
退出 0，1,739,863.013768 ms。不能将另行 20/20、35/35 或 26/26
加到这次命令的测试数量上。

终态后复核见 `.bench/l03-pressure-cost-post-full-identity.json`：产品
源码/四个构建产物、Settings clean 状态/文件 digest、SDK、backend、
lock、sidecar 与 stdlib pins 均保持，十四个修改文件的 SHA/行数一致。
fast 层为 unit-contract 82、protocol 8、bundle-e2e 74，共 164 个
入口；清单 SHA `29beb7d76983aff706888d458b66c3899ba246fab7f97ddeccb1ecfd59d13bfe`，
入口文件 digest `a6538590c96308f9b9079f42bef75f1e81028890e4c7738adc97813eb6ed368e`，
与回归期间核对的身份一致。

`check:fast` 执行类型检查、构建及 fast layers 的全部入口，Node 测试
串行；其运行时汇总拒绝 skip/todo/cancel。这是代码回归，不代替发布
层的 real-SDK、artifact、规模或平台毕业。没有新的 LSP capability、
生产默认推广、提交、推送或合并。

## L08 交接与保留风险

最终 semantic-ready、分桶 500 ms/P95、原 >3 GB/50% 内存目标、长期
repeated/edit/pressure soak、PSS/DevEco、100k 和跨平台均留在 L08。
当前慢冷准备、恢复峰值与单批过大风险保留，不因最终指标未达标
阻塞本阶段或默认关闭的 L04–L07。API24 兼容轨不冒称工程原 API23
matched-SDK/DevEco 结论；缓存命中不稀释未查符号或恢复的 P95。

本轮十四个手写源码/测试/脚本均不超过 500 行，现有超限债务未在
本轮修改：Legacy 1058、proxy 563、TS language service 3504、
references batching 测试 1517 行。完整回归与终态身份复核均已完成；
L03-A～E 均通过，阶段无剩余必需工作。
这些迁移债务及 L08 产品风险仍保留，不把阶段完成写成项目或发布完成。
