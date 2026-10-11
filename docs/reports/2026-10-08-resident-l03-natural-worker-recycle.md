# L03：自然压力自动 Worker 回收与内存/恢复代价

日期：2026-10-08。结论：**默认关闭的自动回收已实现并保持公开正确性；
真实 Settings 的短序列对照显示峰值下降，也显示更慢的编辑长尾，未整体毕业。**
L03 的成本感知准入继续；这些最终指标不阻塞 L04–L07，统一在 L08 验收。

## 功能切片与固定输入

[公开 TDD](../tdd/l03-automatic-pressure-recycle.md) 先以真实 LSP 复现
自然 RSS L3 后没有自动替换，再用原 quiescent/lease 见证事务最小修复。
正常导航/引用、取消、v2→v3、新旧开关、trace OFF 和已排队导航组合
**86/86 PASS**，类型检查/构建通过。自动双开关默认关闭，不提高预算、
不强制 GC、不强杀执行中的 compiler，不推广生产默认。

固定 server parent `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，源码输入
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`，
semantic Worker `e812e34cd09ef8411cc7650d52294d0c0e05ea71c4c1107545e01dc9e581bb3c`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；
API24 SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
Node v26.3.0、backend 4.9.5-r10；SDK/lock/sidecar/stdlib/hardware 证据
完整保留在 manifest/raw report，不冒称 API23 matched DevEco/PSS。

独立清单：[OFF trace](../../bench/references/manifests/settings-resident-l03-natural-recycle-off-trace-api24.json)、
[ON trace](../../bench/references/manifests/settings-resident-l03-natural-recycle-on-trace-api24.json)、
[OFF timing](../../bench/references/manifests/settings-resident-l03-natural-recycle-off-timing-api24.json)、
[ON timing](../../bench/references/manifests/settings-resident-l03-natural-recycle-on-timing-api24.json)。
旧 L01/L02 pins 不倒改；每对除 benchmarkId/自动回收 flag 外完全相同。

先查 Menu **class** 248/248，再查 Home class 9/9，然后按原 L01 的
20 次未保存引用增删、原 edit hashes/oracles 交替 10↔9；不使用旧
constructor 267 或缩小合法工程边界。正常 Menu v1 与 Home v21 诊断保留。
`legacy + full SDK`、1024 MiB 策略、180 s deadline、50 ms 外采请求保持，
没有诊断屏障或显式 L3/recycle/GC；末尾正常诊断后保留 5 秒 idle。
顺序 OFF trace→ON trace→ON timing→OFF timing，每轮独立进程且不并发。

## 精确结果与机制归因

四轮各 **22/22 COMPLETE**，全部 oracle 逐 URI/UTF-16 range 精确；
每对全部 22 个位置集合和 `{uri, version, diagnostics}` payload 深比较
一致。全部 inputUnchanged=true、failure=null、无 timeout/OOM/partial、
退出 0。Menu v1 原 2307 保留，Home v21 空诊断；合计 88/88 exact。

Trace OFF control（开关 OFF、trace ON）有 10 次 context 创建/实际 L3
驱逐、1 个物理 Worker。ON trace 有 6/6 次创建/驱逐、4 个物理 Worker；
只有两次事务发布 `pressure-recycle.complete`，但实际替换为三次。
并发变更在 witness 前会阻止替换；在替换/重放中发生时，新 Worker 已
建立、最新 mutations 已冲刷，但原保守事务仍返回 `changed during recycle`。
因此 `pressure-recycle.skipped` **不保证没有物理替换**，不能仅用 complete
事件统计机制调用。此轮另有两次 witness 变更与一次 no-L3 witness。

Trace-off ON 有 3 个物理 Worker、两次实际替换，却没有 complete 事件，
有一次 witness 变更与两次替换中变更；OFF 始终只有一个 Worker。
所有正常请求和诊断仍正确，L01 显式 flag 为 0 且未发 benchmark 控制，
故实际替换属于本轮自动入口，而不是未调用的开关差异。trace OFF 不
记录 coordinator 创建/驱逐，零条 trace 不等于没有压力事件。

## 资源与样本内编辑时延

| 轮 | Node RSS 采样峰值 | 产品树采样峰值 | 最后正值 Node RSS | 编辑 P50 / P95 / max |
| --- | ---: | ---: | ---: | ---: |
| OFF trace | 2,141,597,696 B | 2,318,778,368 B | 1,461,399,552 B | 581.3 / 6,945.7 / 6,991.6 ms |
| ON trace | 1,862,914,048 B | 2,040,582,144 B | 1,324,625,920 B | 574.4 / 7,056.5 / 8,834.4 ms |
| ON timing | 1,523,224,576 B | 1,701,330,944 B | 798,883,840 B | 556.8 / 8,473.5 / 8,685.8 ms |
| OFF timing | 2,120,351,744 B | 2,297,864,192 B | 753,917,952 B | 579.0 / 6,798.3 / 6,799.4 ms |

一次 trace-off 对照的 Node/产品树峰值分别降低 **28.2% / 26.0%**，
但编辑样本 P95 增加 **24.6%**；ON 最后正值还比 OFF 高约 6.0%。
Trace-on 配对只用于归因，不与 timing 合并。四轮各 20 次编辑均 >500 ms；
20 个相关序列样本的 P95 不是独立进程统计毕业，也不宣称稳定收益、
即时 RSS 归还、无单调增长或最终 no-regression。

外采实际 P50 112–114 ms、P95 122–123 ms、最大间隔 151–216 ms；
峰值是采样下界，Mac RSS 不是 PSS，Worker thread RSS 不重复相加。
最后正值不是硬性同秒 steady heap/PSS 对照，尾值方向不稳定。
原始 `.bench/l03-natural-recycle-{off,on}-{trace,timing}-1.json`；深比较与
摘要 `.bench/l03-natural-recycle-pair-analysis.json`。

## 判定与继续

四个 suite 顶层均 **FAIL / READINESS_UNSUPPORTED**，与 88/88 exact
分别记账；没有伪造 semantic-ready 或最终性能 PASS。实测支持继续研究
Worker 生命周期的峰值控制，也暴露冷恢复/并发编辑成本。自动资格仍
只覆盖单根且有打开文档；成本感知准入、其它 root/关闭状态和更长压力
序列继续作为 L03 工作，不把这一个候选等同整个 L03 完成。

L04 可在已验证的完整 scope/快照/取消合同下默认关闭接线，保留 exact
transient fallback；本轮内存/500 ms 未达标不冻结它。L08 才统一 P95、
原 >3 GB/50% 内存、DevEco/PSS、soak/规模/跨平台与默认推广评审。
新源码 whole 未重跑；请求合并前须 fresh `pnpm check:fast`，不沿用 L02
固定构建的 1338/1338。仍有 source migration debt：proxy 563、type engine
3576、legacy engine 1068 行；新增 owner 179、runtime 482、host 204、测试
368 行，未继续扩大上述超限文件。
