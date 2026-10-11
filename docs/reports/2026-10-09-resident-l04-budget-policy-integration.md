# L04 预算政策下的真实引用路由对照

日期：2026-10-09。状态：阶段真实控制 PASS，L04 完成审计 A～E PASS。
当前固定构建在 L03 选定政策下，两种 declaration policy 的 R-09 ON/OFF
共八个独立进程、52 项请求全部 exact，配对最新诊断一致。两份 ON trace
对此前未查符号实际复用完整 Program。实验仍默认关闭，最终时延、内存
和 semantic-ready 判定在 L08；本报告不宣称产品毕业。

## 固定输入与公平范围

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；产品源码输入
`dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`，server
`7d2b9d6705eff75d5b1e7ef16858d3bba2d2906f17b98321dfc6c67a83fc0884`。Settings clean
`ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；API24 ETS 6.1.1.125 SDK digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。Node v26.3.0、
backend 4.9.5-r10，Worker/sidecar/stdlib/lock pins 见各清单和原始报告。

保留 indexed-batched、closure、full SDK、batch 64、1024 MiB，L1/L2/L3
为 70%/82%/92%，退出目标 85%。两侧均为 budget-aware retention、
成本回收、压力准入、transient 诊断与同内容晋升 ON；自动 owner 替换、
S05、anchor reuse 和其它 scope 优化 OFF。每对只改变 R-09 开关及
各自指标文件路径，不提高预算，不强制 GC，不改变正常诊断。

各进程独立、串行，无重测试或其它 benchmark 并发。每种 policy 的顺序
为 OFF trace → ON trace → ON timing → OFF timing。先用不相关 About
implementation 支付准备，再查此前未查的 HomeInitData 引用；两文件
预打开，不预跑引用目标，不设诊断屏障。Trace 各 8 项包含稳态重复、
普通 definition、已证明驱逐的冷定位/global query 和未保存增删；
timing 各 5 项，不混入 trace-on 恢复时延。请求/诊断 deadline 180 s，
外采请求间隔 50 ms，正常诊断后 idle 5 s；未改真实工程或 SDK，编辑仅
为 LSP overlay。

## 完整结果与实际路由

不含声明为 9→10→9，含声明为 10→11→10；About implementation 和
definition 各有完整 oracle。四对逐场景位置集合与最新
`{uri, version, diagnostics}` 深比较一致，所有请求 COMPLETE/exact、
inputUnchanged=true、failure=null、blockedScenarios=[]，产品进程
shutdown/exit 0，物理 transient 终态归零。含声明编辑预期由已验证
编译器引用集及未变化声明合成；原始资产明确 derived provenance，
本轮完整 fallback 实际再次核对十一位置，不冒称新的 discovery。

两份 ON trace 的第一次引用队列分别见一次 resident hit，9/10 个位置，
sameProgram/completeScope=true，programBuilds/verifierWorkerStarts=0，
命中时 RSS 806,178,816 / 805,916,672 B，低于原 L3 进入线。按首次
queue traceId 验证它不是后续编辑命中或答案 cache；稳态重复另走正确
答案缓存，不纳入新符号性能结论。两份 OFF trace 无 resident hit。

真实 trace 最多一个 resident、一个 transient、owner 加 transient 为二；
reference 物理 episode ON 各三次、OFF 各四次。引用全局验证前暂停并
等待诊断、结束后恢复最新版本；没有要求或虚构三类 verifier 同时存活。
Worker RSS 按同一 Node PID 只计一次，heap 仍只描述 owner isolate。

## 完整响应与 RSS

以下为每种配置单进程样本，不是产品 P95 或稳定 no-regression。

| policy / R-09 | 首次准备 ms | 新引用 ms | 同快照重复 ms | 编辑增加/移除 ms | Node 峰值 B | 产品树峰值 B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 不含声明 OFF | 10542.4 | 3927.2 | 1.3 | 3375.3/3349.4 | 1168273408 | 1346437120 |
| 不含声明 ON | 14610.6 | 915.2 | 1.0 | 3441.5/3721.4 | 1198907392 | 1377312768 |
| 含声明 OFF | 8065.2 | 3226.7 | 1.4 | 3305.9/3162.1 | 1165950976 | 1343074304 |
| 含声明 ON | 15345.9 | 936.5 | 0.9 | 3773.1/3327.6 | 1207652352 | 1385693184 |

不含/含声明 ON 的新引用为 915.2/936.5 ms，对照 3927.2/3226.7 ms；
首次准备却增加约 4.1/7.3 s。Node 峰值 ON 比 OFF 高 2.62%/3.58%，
产品树高 2.29%/3.17%。编辑后仍完整 fallback 且约 3.2–3.8 s；
这些短样本不证明总成本或内存改善，非 cache 请求仍未达 500 ms。

| policy / R-09 trace | resident hit | 物理 reference episode | 冷定位完整响应 ms | Node 峰值 B | 产品树峰值 B |
| --- | ---: | ---: | ---: | ---: | ---: |
| 不含声明 OFF | 0 | 4 | 3591.3 | 1173880832 | 1352159232 |
| 不含声明 ON | 1 | 3 | 6164.0 | 1497849856 | 1675427840 |
| 含声明 OFF | 0 | 4 | 3752.3 | 1182187520 | 1360060416 |
| 含声明 ON | 1 | 3 | 6766.4 | 1489768448 | 1667244032 |

ON trace 的冷定位约 6.16/6.77 s，对照约 3.59/3.75 s，采样 Node 峰值
约高 27.6%/26.0%，不是资源收益。其冷定位 grouped createProgram
约 2905.5/3144.8 ms；OFF 约 1240.7/1350.3 ms。普通恢复前 definition
在 ON 已有完整 2261-source Program 上未再 createProgram，OFF 新建
371-source Program；驱逐见证顺序也不同，不能把不同工序误作同成本因果对照。

ON 两次恢复 origin 为 after-control / already-observed，OFF 为
already-observed / after-control；各次控制仍实际发送，随后查询执行
完整 oracle。全局 fallback 的新 verifier Program 各含 676 sources，
project 153、SDK 410，grouped createProgram 约 2.26–2.76 s。
计数归零或 context 处置不等于即时 RSS 归还，单个已启动 Program 可
超过 soft budget；准入、lease、取消和清理边界由公开合同保护。

实际采样 P50 116–128 ms、P95 130–142 ms，最大 146–288 ms；
外采峰值为下界，少数内部边界 RSS 高于最近外采值。Mac RSS 不代替 PSS。
每种配置仅一个进程，固定顺序、不同恢复工序及 trace overhead 限制
外推；不将采样峰值写成精确 allocator 硬上限或长期泄漏结论。

## 证据与回滚

八份新清单为 `bench/references/manifests/settings-resident-l04-policy-*`，
原始 `.bench/l04-policy-*-1.json` 与独立 `.metrics.jsonl` 保留；
配对断言及有限阶段控制摘要见 `.bench/l04-policy-integration-analysis.json`。
八份 raw report 顶层仍 FAIL / READINESS_UNSUPPORTED、runner 退出 1；
与正确性/诊断 PASS、产品进程退出 0 分开，不伪造整体 ready。

回滚为关闭 R-09，继续当前完整 indexed-batched/transient 路径；
可独立移除 L02/L03 实验 flags，恢复生产 dispose 默认。没有新 capability、
预算或生产默认推广。当前配置是一组可核验的实验组合，不是生产推荐。

[公开合同](../tdd/l04-budget-policy-reference-contracts.md) 当前选定政策
10/10 PASS；首轮七文件 83/83 属于热取消扩展前的测试检查点。冻结后
完整 `pnpm check:fast` 1449/1449 PASS、退出 0、无 fail/cancel/skip/todo，
终态源码/构建、冻结测试及工程/SDK 等输入身份一致，见
[完成审计](2026-10-09-resident-l04-completion-audit.md)；未以 focused 或
52 项回放替代完整回归。
最终 500 ms/P95、ready、内存降幅、长期 soak、PSS/DevEco、规模和
跨平台产品门禁均交 L08，慢冷恢复与更高峰值作为保留风险。
