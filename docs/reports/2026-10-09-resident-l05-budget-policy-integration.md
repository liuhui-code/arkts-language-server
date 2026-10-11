# L05 预算政策下的真实 implementation 对照

日期：2026-10-09。状态：阶段真实控制 PASS；L05 完成审计 A～E PASS。
当前固定构建的四个串行 Settings/API24 进程共 22 项请求全部 exact，
两对最新诊断一致、输入不变、产品正常退出。implementations 独立使用
完整 compiler 语义，未消费 references 答案或投影。最终性能、内存和
semantic-ready 仍由 L08 判定，实验默认关闭。

## 固定输入与完整 oracle

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；产品输入
`905fca366c83298af4f66c8c89af822fdd124cdb468d482edb90ad382ae384d7`，
server `64be5fa55ccad7a00bf39b3194a3ef8b9b8d083438c4f05f200bac9cae6953ba`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`。
API24 ETS 6.1.1.125，SDK digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`；
Node v26.3.0、backend 4.9.5-r10。全部 Worker/sidecar/stdlib/lock pins
在新清单及 raw report 中，不沿用旧 L01/L04 或本轮修复前的构建。

两个目标各由当前构建的两个独立冷进程完整核验：

- IService：6 处完整位置，冷响应 14,574.3/14,624.3 ms。
- IAboutDevicePageCtrl：1 处完整位置，冷响应 14,216.2/14,145.3 ms。

四个冷进程均正常诊断、inputUnchanged=true、退出 0。验证断言及来源见
`.bench/l05-current-oracle-verification.json`，新 IService oracle 保存完整
六位置和 discovery provenance；原 About oracle 仅在本轮两次深比较一致
后复用，不把手写 class-only 猜测当完整实现集合。

## 公平控制与实际复用

顺序 OFF trace → ON trace → ON timing → OFF timing，独立进程、串行，
无重测试或其它 benchmark 并发。两侧固定 indexed-batched、closure、
full SDK、1024 MiB、budget-aware retention、L03 成本回收/压力准入及
transient 诊断；原 L1/L2/L3 70%/82%/92%、退出目标 85% 不变。
自动/手动 Worker 替换、S05、anchor reuse 与 R-09 references 快捷路由
均 OFF。配对只改变 L02 同内容晋升及各自指标输出路径。

预打开两个接口、不预查询 About，也不设诊断屏障。先查询 IService
支付完整全域准备，再查此前未查 About、稳态重复、方法体编辑及编辑后
稳态；trace 另有实际 L3 驱逐后的完整恢复。编辑仅为 controller v2 LSP
overlay：在 setPageModel 方法体插入 Unicode 注释，不改变接口、类名或
实现关系；完整一位置 oracle 的 identifier range 不变。清单明确记录
derived-inert-comment 来源，不冒称编辑后的新冷 discovery。

两个 trace 的新 About 均与暖机同 Program，createProgramEvents=0，
1496 个工程 SourceFile 全部复用；完整 Program 2261 sources（SDK 652）。
实际 provider 调用和 queryIndex 与请求窗口对应，无 references cache、
batch 或 resident-hit 冒充。OFF 也复用成功，因此不能把新目标复用收益
归因于晋升开关。

编辑时两侧都合法重建 Program，仅编辑文件的 SourceFile 换代，
其余 1495 个工程 SourceFile 与 652 个 SDK SourceFile 保留。随后正常
诊断准备晋升 38 个相同指纹脚本：ON generation 258→258、编辑后稳态
仍是 Program 2；OFF generation 258→296，诊断准备换为 Program 3。
这是真实同内容晋升见证，查询自身零 createProgram 不能抹去此前诊断
已支付的重建成本，也不把 post-query Checker 序号当普适复用证明。

## 完整结果与正常诊断

Trace 各 6、timing 各 5，四进程共 22/22 COMPLETE/exact。两对逐场景
完整 URI/range 集合与最新 `{uri, version, diagnostics}` 深比较一致；
两个接口 v1 及 controller v2 正常诊断均为空，原始版本时间线完整保留。
未改真实工程或 SDK，不静音诊断、增大预算或缩小合法范围。

两个 trace 均实际发送 L3 控制，见 context sequence 1、leaseCount=0、
memory-level3 驱逐后完整一位置恢复；origin 均 after-control。所有报告
failure=null、blockedScenarios=[]、inputUnchanged=true，产品 shutdown/
exit 0。外采与内部指标最多一个 resident/owner、零物理 transient；
此负载没有启动 verifier，不虚构同时存活的诊断/reference Worker。
同一 Node PID RSS 只计一次，heap 仅描述 owner isolate。

## 完整响应与 RSS

每种配置仅单进程，不是稳定 no-regression 或产品 P95。

| trace-OFF 配置 | 索引候选准备 ms | 首次全域查询 ms | 未查 About ms | 稳态 ms | body edit ms | 编辑后稳态 ms | Node 峰值 B | 产品树峰值 B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 晋升 OFF | 7295.3 | 15285.1 | 677.2 | 609.5 | 1087.4 | 1476.8 | 875237376 | 1052987392 |
| 晋升 ON | 6843.9 | 13896.4 | 627.8 | 573.4 | 1016.6 | 768.2 | 847740928 | 1025519616 |

晋升 ON 的编辑后稳态样本较低，但初始化、机器负载、固定顺序和小样本
限制因果外推；不宣称稳定提速或最终资源收益。未查目标两侧都 >500 ms，
即使复用完整 Program，compiler 查询及输入新鲜度核验仍有成本。

| trace 配置 | 首次全域 ms | 未查 About ms | 编辑后稳态 ms | 驱逐恢复 ms | 恢复 grouped createProgram ms | Node 峰值 B | 产品树峰值 B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 晋升 OFF | 15964.2 | 819.9 | 1544.7 | 13209.7 | 11467.3 | 1256869888 | 1434890240 |
| 晋升 ON | 15455.7 | 795.4 | 900.2 | 13170.2 | 11449.5 | 1249705984 | 1427222528 |

恢复重付完整 Program 成本，峰值可超过 1024 MiB soft budget；ON 的请求
结束 RSS 曾回落，外采峰值仍保留，不能只选最终低值。执行中的 lease
保护与可驱逐 context 不等于 allocator 硬限额或即时 RSS 归还。
实际采样 P50 115–124 ms、P95 130–134 ms、最大 139–150 ms；请求间隔
配置为 50 ms，但执行采样更慢，峰值是下界。macOS RSS 不代替 PSS。

## 证据、回滚和交接

四份新清单为 `bench/references/manifests/settings-resident-l05-policy-*`；
原始 `.bench/l05-policy-*-1.json` 与各自 `.metrics.jsonl` 保留，
配对完整断言和阶段摘要在 `.bench/l05-policy-integration-analysis.json`。
四份 raw 顶层仍 FAIL / READINESS_UNSUPPORTED、runner 退出 1，与本阶段
正确性 PASS、产品退出 0 分开。索引候选 ready 不冒充 semantic-ready。

回滚关闭 L02 晋升及 L03 实验 flags，恢复原 dispose 配置；R-09 和 S05
仍保持关闭。完整 compiler 路径及未知输入的显式错误保护保留，没有
新 capability、公共语义 owner 或生产默认推广，也未提交、推送、合并。

[当前公开合同](../tdd/l05-budget-policy-implementation-contracts.md) 23 项全部
GREEN、十文件 132/132 PASS。冻结后完整 `pnpm check:fast` 1467/1467、
退出0、无 fail/cancel/skip/todo，终态源码/产物/测试/工具和工程/SDK等
身份一致，四份清单/oracle也保持不变，见[完成审计](2026-10-09-resident-l05-completion-audit.md)。
focused 和 22 项真实回放未代替whole。最终 500 ms/P95、内存降幅、
semantic-ready、长期 soak、PSS/DevEco、100k 与跨平台统一交 L08。
