# L03 预算政策与真实 Settings 校准

日期：2026-10-09。选定的实验配置将 resident 保留、成本感知回收和
重任务准入接到同一 Node RSS 政策，同时保留最新诊断及完整结果合同。
本轮不提高 1024 MiB，也不把自动 Worker 替换纳入选定配置：它没有
显示峰值收益，却使稳态重复重新付出约 4.9 秒。所有实验仍默认关闭。
正确性及参数取舍已有直接证据，完整代码回归 1439/1439 PASS；最终内存、
500 ms/P95、长期 soak、PSS/DevEco 和平台验收留在 L08。

## 固定输入与执行范围

产品源码输入 `dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`，
父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。server SHA
`7d2b9d6705eff75d5b1e7ef16858d3bba2d2906f17b98321dfc6c67a83fc0884`，
semantic Worker `34b717cae4e462073a0db867556ac51c61560547119a359df0f47e47210d7ea3`，
diagnostic Worker `d84a40eb5dcf02b56d466f115fe2fc3135180b29125673bad9ba82afae5774ae`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；API24
SDK 6.1.1.125 digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
Node v26.3.0、backend 4.9.5-r10，SDK/lock/sidecar/stdlib/hardware 与原始
清单、报告保留。没有修改真实工程文件，编辑只通过 LSP 未保存 overlay。

每轮独立新进程、串行运行，无重测试并发；全 SDK、indexed-batched、
closure、batch roots 64、R-09/晋升/anchor reuse 关闭，180 s 每请求及
诊断 deadline，外采请求间隔 50 ms，最终诊断后 5 s idle。计数和文件数
不用于估算 Program 字节，未使用强制 GC 或提高 heap/预算。

Trace 轮先查 About 接口 implementation，再查未查过的 Home class
及同快照重复；普通 definition 建立恢复前状态，然后验证冷定位、
驱逐后的全局引用，最后未保存增删引用 9→10→9。计时轮只有首次、
稳态及两次编辑五项，不将 trace-on 恢复时延混入 trace-off 结论。

## 选定政策

| 决策 | 当前实验行为 |
| --- | --- |
| 字节范围 | 同一 Node PID 的 RSS 计一次，包含 resident 与 reference/anchor/diagnostic threads；Worker 存活、处置和 RSS 回落分别观察 |
| 预算和滞回 | 保留 soft budget 1024 MiB，L1 70%、L2 82%、L3 92%，L3 退出目标 85%；不是分配器硬限额 |
| 保留与 trim | 低压力允许 budget-aware retention；L2 按原规则 trim 无 lease 状态，不丢未保存文档权威 |
| 冷驱逐 | L3 优先释放有完整成本样本的便宜候选；每次处置后读实际 RSS，仍高则继续，回落则停止；缺测/并列使用 LRU |
| 重任务 | 原并发一；准入前及 verifier 之间刷新同一 RSS 政策，L3 不另付发现 anchor；只能完整 exact 或显式预算错误，不返回部分 Locations |
| 诊断与恢复 | 最新诊断不能省略；L3 可用独立诊断 Worker。lease/在途工作保护、取消清理、多根与全关闭恢复合同保留 |
| Owner 替换 | 选定配置关闭自动替换；机制仍可独立 opt-in，资格须复核当前 RSS，拒绝事务不提前清引用缓存 |

选定清单开启原 benchmark、成本回收、压力准入和 transient 诊断，
retention 为 budget-aware；自动替换为 0。生产默认和其它阶段机制
没有推广。rollback 为移除这些实验 opt-in、恢复 dispose；原完整
transient fallback、预算和诊断合同保持，不用提高预算掩盖失败。

保留现有参数的依据是：真实重叠在进入线以上确实产生 L3 处置，随后
RSS 可以低于原退出目标；同时成本及恢复价差已观测，低压力复用可
保护热查询。当前样本没有证明更大的预算或更宽的滞回能改善取舍，
故不调高参数。保留的是可核验的 soft policy，不是最终资源毕业。

## 精确结果与恢复归因

选定配置与对照 trace 各 8/8 exact，timing 各 5/5 exact，配对共
26/26；自动替换候选另有 8+5 项 exact，不能合并为一次测试运行。
配对逐场景的 URI/UTF-16 range 集合深比较一致，最新 About v1/Home v3
诊断 payload 相同且为空。各轮 inputUnchanged=true、failure=null，
无 blocked/timeout/partial，产品进程退出 0；所有物理 transient 终态归零。

六份有效 raw report 顶层仍为 FAIL / READINESS_UNSUPPORTED，runner
退出 1；与上述 exact/诊断及产品进程退出 0 分开记账，不伪造整体
semantic-ready。阶段实施完成不把这些产品门禁重标为 PASS。

选定 trace 的第一次恢复使用已观测 L3 空上下文见证，第二次为控制后
驱逐；没有把自然事件写成由人工控制引起。随后两次查询实际执行、
完整 oracle 通过。普通 definition 观察到新上下文及 grouped compiler
准备 1,326.7 ms，完整恢复响应为 3,788.8 ms。对照恢复 definition 的
查询内 createProgram 为 0，正常诊断已在新上下文支付准备；其响应
1,572.6 ms 不代表零冷恢复成本，也不与前者当作同工序构建提速比较。

各次全局 verifier 为新 Program，676 个 source，其中 project 153、
SDK 410；选定 trace 的 grouped createProgram 为 2,482.9–2,589.2 ms。
稳态重复命中已验证结果，选定/对照各四次物理 reference episode；自动
替换候选五次，多付一次。R-09 固定关闭，不据此否定后续 Program 复用。
本工程采用声明光标，物理 anchor 为 0；anchor 高/低压力及 fallback
在当前公开组合中验证，不能由本轮宣称真实 anchor 内存收益。

选定 trace 有一次物理 diagnostic episode；当前观测最多一个 transient，
owner 加 transient 为两个，resident 最多一个。首个 verifier 退出且
context/transient 均为 0 时 RSS 仍为 1,140,129,792 B，证明对象和线程
释放不等于即时字节归还。单根实测不代替两根容量排序的公开合同。

## RSS 与响应取舍

以下是单进程样本，不是产品 P95、稳定 no-regression 或最终收益。

| 配置 | Node 峰值 B | 产品树峰值 B | 最后指标 RSS B | 稳态重复 ms |
| --- | ---: | ---: | ---: | ---: |
| 对照 trace | 1,179,054,080 | 1,357,873,152 | 532,697,088 | 1.10 |
| 自动替换 trace | 1,163,046,912 | 1,341,001,728 | 717,885,440 | 4,825.17 |
| 选定 trace | 1,188,569,088 | 1,366,302,720 | 498,380,800 | 1.56 |
| 对照 timing | 1,159,041,024 | 1,336,750,080 | 793,686,016 | 1.17 |
| 自动替换 timing | 1,169,252,352 | 1,347,538,944 | 621,506,560 | 4,886.14 |
| 选定 timing | 1,167,937,536 | 1,346,031,616 | 762,761,216 | 1.17 |

选定 timing 的 Node/产品树峰值分别为对照的 +0.77%/+0.69%，不能
宣布内存降低。首次 Home 引用为 3,563.4 vs 3,596.8 ms，两次编辑为
3,418.0/3,485.1 vs 3,398.0/3,488.3 ms；只有两个相关编辑样本，不
报告为产品 P95。除 cache 重复外仍超过 500 ms，留给 L08。

自动替换 timing 的峰值 +0.88%，稳态重复约 4.9 s；候选在相同产品
构建的 trace 和 timing 都表现出重付准备。因此本序列不选择自动
替换，保留独立实验及历史长序列证据，不宣称它在所有场景无效。

外采实际 P50 121–122 ms、P95 127–130 ms、最大 135–146 ms；峰值
为采样下界。Node RSS 不能和同 PID Worker RSS 再相加，owner heap
不代表每个 verifier heap；Mac RSS 不代替 PSS。恢复 trace 首次见证
方式不同、每配置只一个进程、选定 trace 重跑较晚，限制因果比较。

## 证据与 L08 交接

新清单为 `bench/references/manifests/settings-resident-l03-policy-*`：
有效对照使用 baseline trace/timing v2，自动替换使用 policy v2，选定
配置使用 selected trace v3 与 selected timing。原始 `.bench/l03-policy-*-1.json`
及独立 `.metrics.jsonl` 均保留，逐项深比较见
`.bench/l03-policy-calibration-analysis.json`。较早恢复未执行、错误
额外 pin 和已修正的回放器断言不混入有效配对。

[公开 TDD](../tdd/l03-cost-aware-pressure-recovery.md) 给出三个产品
RED/GREEN、当前联合控制 20/20、回放器控制 35/35 和 runner 单独 SHA。
完整 `pnpm check:fast` 已在此固定构建上 1439/1439 PASS、退出 0，
无 skip/todo/cancel；终态后源码/产物、测试和输入身份一致。
[L03-A～E 完成审计](2026-10-09-resident-l03-completion-audit.md) 通过，
仅判定阶段实施与校准完成。最终内存降幅、ready、500 ms/P95、长期稳定性、DevEco/PSS、
100k 与跨平台评审均交给 L08，不能由这些短样本或 cache hit 代替。
