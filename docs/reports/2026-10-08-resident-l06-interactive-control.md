# L06：公开交互合同与当前构建的真实跨模块 definition 控制

日期：2026-10-08。结论：**L06 八个独立公开合同及相关回归 57/57 PASS；
当前 Settings 单对新 definition 样本有晋升机制的实际收益，但整体未毕业。**
不新建语义 owner/缓存，不改变 capability advertisement 或生产默认。
L07 按自身合同继续，最终验收仍在 L08。

## 功能合同与固定输入

[公开 TDD](../tdd/l06-resident-interactive-contracts.md) 通过真实 stdio 覆盖
完整 definition/typeDefinition/hover/signature，member completion 的完整
edit/sort/list/resolve，同名 auto-import 与应用后校验、snippet 客户端差异，
API/调用文件编辑、真实 L3 Worker 恢复、早期取消和 refs 在途交互/旧代 fence。
组合 57/57 PASS、退出 0、0 fail/cancel/skip/todo，37,916.227635 ms；
原始 `.bench/l06-interactive-focused-57.log`，不是整体性能或 ready 证明。

当前 parent `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，源码输入
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`，
semantic Worker `e812e34cd09ef8411cc7650d52294d0c0e05ea71c4c1107545e01dc9e581bb3c`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`，
API24 SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
Node v26.3.0、backend 4.9.5-r10；完整 SDK/lock/sidecar/stdlib/Worker/hardware
身份在新 manifest/raw report，不把此前 L02 旧 pins 倒改为当前构建。

独立清单：[OFF trace](../../bench/references/manifests/settings-resident-l06-definition-off-trace-api24.json)、
[ON trace](../../bench/references/manifests/settings-resident-l06-definition-on-trace-api24.json)、
[ON timing](../../bench/references/manifests/settings-resident-l06-definition-on-timing-api24.json)、
[OFF timing](../../bench/references/manifests/settings-resident-l06-definition-off-timing-api24.json)。
每对除 benchmarkId/同内容晋升 flag 外相同；四进程依该顺序串行，
无并发重测试。先查 Menu **class** 248/248，再查此前未查询的
HomeInitData 跨模块 definition 1/1。两目标预打开；不缓存或预查询 Home，
无诊断屏障、显式压力、recycle 或 GC。保留 legacy/full SDK、1024 MiB、
180 s deadline、请求 50 ms 外采；旧 S05 与 R-09/L03 shortcut 均 OFF。

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l06-definition-on-trace-api24.json \
  --out .bench/l06-definition-on-trace-1.json
```

## 精确结果与机制归因

四轮各 2/2 COMPLETE/exact，合计 **8/8 exact**，正常退出 0。
两对全部 URI/UTF-16 range 集合及完整 `{uri, version, diagnostics}`
深比较一致；原 Menu v1 **2307**、Home consumer v1 **2339** 诊断保留，
没有关闭诊断或把兼容 SDK 轨写成零错误/匹配 DevEco 语义环境。
全部 inputUnchanged=true、failure=null，无 timeout/OOM/partial。

Trace OFF control 确有 13 个 compiler-loaded、原文指纹相同的脚本晋升，
generation **257→270**，warm refs Program sequence **1** 到 definition
**2**，definition 有一次 `createProgram`、477.4 ms。ON 同样晋升 13 个，
generation **257→257**，Program/Checker sequence **1→1**，definition
`createProgramEvents=0/createProgramMs=0`、compiler callback 1.93 ms。
两边均 1496 project/652 SDK source；均无 context 驱逐。
这次实际调用了晋升机制，不像此前真实编辑控制零 matching promotion。
身份是已有查询后的观察，不能据此保证其它能力/输入的热路由。

## 单对时延与资源

| 轮 | Menu 首次准备及 refs | 新跨模块 definition | Node RSS 峰值 | 产品树 RSS 峰值 |
| --- | ---: | ---: | ---: | ---: |
| OFF trace | 9,190.3 ms | 754.5 ms | 835,805,184 B | 1,013,420,032 B |
| ON trace | 9,206.9 ms | 249.8 ms | 799,600,640 B | 977,211,392 B |
| ON timing | 9,168.2 ms | 165.1 ms | 796,344,320 B | 974,209,024 B |
| OFF timing | 9,253.1 ms | 686.1 ms | 844,922,880 B | 1,022,627,840 B |

一次 trace-off 新 definition 完整响应降低 **75.9%**，Node/产品树采样
峰值降低 **5.7% / 4.7%**；ON 本次 <500 ms，OFF >500 ms。
只有一个 timing 进程对，不声称稳定 P95、全能力/新模块/编辑/压力恢复
达标、最终 50% 内存收益或长期无增长。Trace 只用于归因，不与 timing
合并算统计门禁；暖机/正常诊断成本没有从完整时延和峰值中删掉。
实际外采 P50 114–116 ms、P95 121–124 ms、max 126–137 ms；RSS 是
采样下界，不是 PSS，也不是硬内存上限或原 >3 GB 用例的等价对照。

原始 `.bench/l06-definition-{off,on}-{trace,timing}-1.json`，
深比较/摘要 `.bench/l06-definition-pair-analysis.json`。
四轮顶层仍 **FAIL / READINESS_UNSUPPORTED**；候选 catalog-ready、
单例快速答案及一个有效 Program 都不等于 overall semantic-ready。
L06 继续其它真实能力/输入组合，L02/L03/L04 未解成本/admission 保留；
新源码 whole 仍 NOT_RUN，合并前 fresh `pnpm check:fast`。
L08 才统一时延/原内存/PSS/ready/soak/规模/跨平台和默认推广评审。
