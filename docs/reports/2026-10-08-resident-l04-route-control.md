# L04：真实 Settings 两种声明策略的 resident 路由对照

日期：2026-10-08。结论：**组合功能合同通过，真实工程 16/16 exact，
但此次 R-09 ON 没有取得 resident hit，也没有证明提速或资源收益。**
没有关闭 L3、提高预算、改变默认路由或冻结 L05；最终验收仍在 L08。

## 固定输入与公开合同

[L04 characterization](../tdd/l04-promoted-resident-reference-contracts.md)
覆盖晋升后完整范围、两种声明策略、未保存增删、alias/re-export 与独立
legacy 对照、显式压力 exact fallback、自然压力 Worker 恢复，以及
未打开 native ArkTS struct 调用点。组合 53/53 PASS 后，第六个合同
单独 1/1 PASS；本报告不将这些相加冒称一次 54/54 组合。
本切片复用既有 R-09，没有新增生产代码或第二个语义 owner。
后续包含 L05 的当前八文件组合 59/59 PASS、退出 0、
71,849.89502 ms；原始 `.bench/l04-l05-contracts-focused-59.log`。

parent `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；源码输入
`62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`，
server `b4e41f3598b38ad5ce24da52d41fa37e020da433a9b4b7f2204000b7e879e2a0`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`、digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；
API24 SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
Node v26.3.0、backend 4.9.5-r10，完整 Worker/sidecar/stdlib/lock/hardware
身份在八个独立 manifest/raw report；不倒改旧 L01–L03 pins。

先查 `IAboutDevicePageCtrl` implementation（1/1），通过原完整工程
prepare 路径支付首次成本，再查从未查过的 `HomeInitData` class 引用。
两文件预打开，正常诊断不关闭、无诊断屏障；未预跑 Home、未命中答案
cache。两种 policy 各使用独立进程，避免把第二种 policy 伪称未查符号。
保留 `indexed-batched + closure + full SDK + dispose`、batch 64、1024 MiB、
180 s deadline 与请求 50 ms 外采。L02 promotion 固定 ON、L03 自动回收
固定 OFF，仅切换 R-09，trace/timing 分开。无显式压力或 GC。

独立清单（各 118 行）：

| policy | trace OFF/ON | timing OFF/ON |
| --- | --- | --- |
| 不含声明 | [OFF](../../bench/references/manifests/settings-resident-l04-route-no-declaration-off-trace-api24.json) / [ON](../../bench/references/manifests/settings-resident-l04-route-no-declaration-on-trace-api24.json) | [OFF](../../bench/references/manifests/settings-resident-l04-route-no-declaration-off-timing-api24.json) / [ON](../../bench/references/manifests/settings-resident-l04-route-no-declaration-on-timing-api24.json) |
| 含声明 | [OFF](../../bench/references/manifests/settings-resident-l04-route-with-declaration-off-trace-api24.json) / [ON](../../bench/references/manifests/settings-resident-l04-route-with-declaration-on-trace-api24.json) | [OFF](../../bench/references/manifests/settings-resident-l04-route-with-declaration-off-timing-api24.json) / [ON](../../bench/references/manifests/settings-resident-l04-route-with-declaration-on-timing-api24.json) |

每个 policy 按 OFF trace→ON trace→ON timing→OFF timing 顺序运行，
所有进程独立、没有并发 benchmark/重测试。示例：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l04-route-no-declaration-on-trace-api24.json \
  --out .bench/l04-route-no-declaration-on-trace-1.json
```

输出已存在时用新编号，不能覆盖历史证据。

## 完整响应与机制

八轮各 2/2 COMPLETE/exact：implementation 1/1，引用不含声明 9/9、
含声明 10/10。四个 OFF/ON 配对的全部位置集合及完整
`{uri, version, diagnostics}` 深比较相同；两份正常 v1 诊断均为空。
全部 inputUnchanged=true、failure=null、无 timeout/OOM/partial，退出 0。
每个 trace 轮只有一次引用 cache miss、零 cache hit。

两个 trace ON 均记录 **resident miss，memoryLevel=level1**，并执行一个
完整 batch；两个 OFF 也为一个 batch。不能把后续诊断的 L3 驱逐反推为
此次 miss 的原因，也不能由“有长驻 LS”推断完整输入/覆盖 proof 已成立。
本轮没有 admission 原因分解，原因仍未归因；不得跳过完整 scope/配置
见证强行命中。trace OFF 的零条 batch/hit trace 是关闭观察，不是零工作。

## 单次 timing 结果

| policy / variant | 首次 implementation | 新 Home 引用 | Node RSS 峰值 | 产品树 RSS 峰值 |
| --- | ---: | ---: | ---: | ---: |
| 不含声明 OFF | 9,027.7 ms | 3,544.3 ms | 1,169,641,472 B | 1,348,317,184 B |
| 不含声明 ON | 13,708.0 ms | 3,551.1 ms | 1,175,965,696 B | 1,353,969,664 B |
| 含声明 OFF | 8,958.4 ms | 3,642.6 ms | 1,163,911,168 B | 1,342,291,968 B |
| 含声明 ON | 13,748.4 ms | 3,394.3 ms | 1,181,671,424 B | 1,359,486,976 B |

ON 的首次 implementation 本轮慢约 4.7–4.8 s；没有 compiler/见证阶段
分解，不把全部差值归因到某个内部调用。引用 timing 差值方向不一致，
且 trace control 未命中 resident，所以不宣称热路径或 L02 晋升机制收益。
每组只有一个 timing 进程，不计算产品 P95 或稳定 no-regression。
全部新引用仍 >500 ms；Node 峰值未降低。实际外采 P50 110–114 ms、
P95 121–125 ms、max 137–229 ms；RSS 是采样下界，不是 PSS。

原始 `.bench/l04-route-{no-declaration,with-declaration}-{off,on}-{trace,timing}-1.json`；
深比较摘要 `.bench/l04-route-pair-analysis.json`。
八轮顶层均 **FAIL / READINESS_UNSUPPORTED**，不能由 16/16 exact 宣称
semantic-ready。L04 的真实 admission/其它组合继续；L05–L07 按自身
公开合同推进，最终内存/时延/readiness/soak/平台评审留在 L08。
新源码 whole 仍 NOT_RUN，合并前须 fresh `pnpm check:fast`。
