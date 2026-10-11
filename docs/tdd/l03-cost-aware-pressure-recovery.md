# L03 按实际 RSS 与准备成本回收

日期：2026-10-09。既有成本感知实验现在把成功 compiler 准备耗时用于
L3 冷上下文排序，每次实际处置后重新读取全进程 RSS，通过原滞回
判断是否继续。回收 Worker 的资格也须复核当前压力，拒绝替换不再
提前清掉正确引用缓存。当前联合控制 20/20 PASS、真实配对 26/26
exact，完整回归 1439/1439 PASS；L03 阶段完成审计通过，最终资源
和时延验收仍在 L08。

## 公开失败与逐步实现

父 HEAD 为 `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，已有工作树
修改保留。首次 RED 前源码输入为
`76b1996e487f5ee67eb86611a4bb889b28704190b3aaf32ea9f14cc9dadf4b55`，
semantic Worker 为
`9905a36a443553af69ee3d98bd0afc1cd5aab78e3df6af56fbfd5e1ac8328465`。

真实 Content-Length stdio 子进程注册两个根，正常诊断分别观测到
正 compiler 准备成本。按实际耗时选出较昂贵根，并通过普通 definition
使它更旧，排除 LRU 恰好选择正确对象的伪证据。实际 RSS 始终低于
1024 MiB 的 85% 目标，再通过既有 benchmark 控制施加 L3 等级。
这属于功能干预，不是自然高压力下 RSS 下降的证明。

```sh
node --test --test-name-pattern='opt-in L3 pressure recovery' \
  tests/semantic/semantic-l2-rearm-witness.test.mjs
```

原实现驱逐两个 context，公开断言要求一个，RED 为 0/1 FAIL，
1,028.078472 ms。最小实现后首次 1/1 PASS，1,074.491934 ms；昂贵
上下文没有重新创建，定位精确，较便宜根的 v2 未保存文本、完整引用
以及正常诊断也通过。初次测试和后续扩展计数分别记录。

`SemanticCoordinator.applyMemoryPressure` 在 L3 使用最近观测的
准备成本排序；所有候选均有正成本且有差异时优先释放便宜状态。
缺测或并列仍按 LRU，leased context 不进入候选。每次处置后由
runtime 回调读取 `process.memoryUsage().rss`，通过同一个
`SemanticMemoryPolicy` 的 92% 进入线、85% 退出目标计算有效等级。
实际仍为 L3 就继续，即使剩余 context 很昂贵；低于退出目标则停止。
不按 context 数、文件数或推测的 Program 字节扣账，不强制 GC。

Registry 保存返回的有效等级，runtime 同步更新等级；已发生的 L3
在途准入见证仍有效，压力回落不能使同一查询继续支付后续 verifier。
真实成本不等于每个 Program 的独占字节或未来冷恢复的保证。

## Worker 资格与引用缓存

首轮 Settings 候选出现一次自动 Worker 替换和慢稳态重复。该构建
输入为 `95ba3e46cf901148b38fadb6d36fa638376c9423aa4e61120a966650f9252ad3`。
最近 verifier 退出 RSS 为 1,125,728,256 B，仍高于原 L3 目标；因此
不能把这次真实替换归因于压力已经恢复，也不能宣称后续保护改善了
这个具体慢样本。当前资格只依赖历史 L3 驱逐的缺口另经公开干预验证。

```sh
node --test --test-name-pattern='cost-aware Worker recycle rejects' \
  tests/semantic/semantic-worker-recycle.test.mjs
```

开启原成本和显式回收实验，单根低 RSS 的 L3 处置后，原实现仍替换
Worker。RED 0/1 FAIL，1,218.523861 ms；增加当前 RSS 复核后首次
1/1 PASS，1,297.2544 ms。成本开关开启且无 context/lease/全局在途
工作时，资格通过前重读原压力政策；已回落则报告 `pressure-recovered`。
原成本关闭的显式低 RSS 回收功能保留。

随后验证拒绝事务不能清引用缓存。首个断言错误地跨越了显式压力
控制本身的清缓存边界，失败记录保留，不作为产品 RED。修正 seam
为尚无 L3 见证的回收拒绝：之前完成的同快照引用应继续命中。
恢复原清缓存时机后，正确 RED 为 0/1 FAIL，932.213671 ms，源码
输入 `7142685035a8370f1beec3cd6b7cdcc934e004381cda8569d98ef555725a230b`。
只把事务的 invalidate 移到资格成功、实际替换前，首次 GREEN 为
1/1 PASS，1,274.553203 ms。显式压力控制仍按原合同清缓存，不改变
其预算保护；未保存文本和 v3 普通错误诊断保持精确。

## 联合合同与开关

沿用 `ARKTS_BENCHMARK_CONTROL=1` 与
`ARKTS_L03_COST_AWARE_EVICTION=1`，没有新增外部开关、LSP capability
或预算。默认关闭路径不读取此回收回调，仍按原 L3 处置所有冷状态。
准备成本独立于 L2 rearm 和 optional telemetry；容量排序与压力排序
在已有 characterization GREEN 后共享同一规则。

当前六文件串行控制 20/20 PASS，0 fail/cancel/skip/todo、退出 0，
61,766.777597 ms，覆盖真实 RSS 恢复、持续压力与 lease、滞回目标
边界、缺测/并列/关闭路径，以及压力准入、retention、transient 诊断
和自动回收组合。公开 LSP 场景包含低/高压力、完整单批、多批显式
拒绝、in-flight L3 后回落、取消恢复、trace OFF、多根及全部关闭。
引用仅完整 exact 或显式错误，最新 overlay 和正常诊断继续工作。
策略单元样本的 RSS 数值为受控系统边界输入，不宣称真实内存收益。

## 恢复回放器的已有驱逐见证

关闭自动替换的真实候选保住了约 1.3 ms 稳态重复，但自然 L3 可先于
人工控制处置上下文；原回放器只等待控制之后的新事件，两个恢复
场景因此没有执行，不能将它们记为 PASS。公开 CLI 用真实 LSP、
1 MiB 功能压力及 1500 ms verifier hold 重现已处置状态，第二次 RED
为 0/1 FAIL，11,475.474458 ms；输入不变、无运行异常，却有
`EVICTION_NOT_OBSERVED`。不把测试压力或 hold 纳入产品计时。

新清单可在恢复场景显式指定 `acceptObservedEviction=true`。仍要求
benchmark 和 tracing 有效，存在开始查询后的 L3 `residentContextCount=0`
事件，之后没有新建 context 或启动新 owner；否则继续等待新驱逐，
无见证仍 BLOCKED。报告区分 `already-observed` 与 `after-control`，
保留原事件时间，不伪称自然事件由本次控制引起。识别处置只允许继续
实际查询，完整 oracle、正常诊断、输入 pins 和 readiness 门禁不变。

原显式回收与已处置恢复两种 CLI 合同 2/2 PASS；已空上下文不要求
伪造第二次 resident disposal，原路径的注册表清理断言不减弱。
字段类型或非恢复场景的非法使用另经 RED 0/1 FAIL，4,912.319482 ms，
再增加参数校验。六文件回放器组合最终 35/35 PASS，0 fail/cancel/
skip/todo、退出 0，44,492.301515 ms，完整输出保留在
`.bench/l03-pressure-cost-runner-controls.log`。runner 为 363 行，输入
校验 222 行，修改 CLI 测试 170 行；未修改原 491 行的 CLI 测试。

当前 runner SHA 为 `c975d85a91ca708a599ff232f8c52c30a5378cecd1e36a90cd527ed1f4d8fc0f`，
输入校验 SHA 为 `dcd723e509c6bc317df4b93823fa3e3a589a5656e97ca4044344b912f31b4292`。
这两个 benchmark 脚本不包含在 serverInput digest 中，单独记录其
身份；产品源码和构建未因此变化。新 v3 trace 清单实际重测恢复，
旧未执行结果保留，trace-off 数据仍独立。

## 固定构建与剩余验收

当前源码输入为
`dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`，
server 为 `7d2b9d6705eff75d5b1e7ef16858d3bba2d2906f17b98321dfc6c67a83fc0884`，
semantic Worker 为 `34b717cae4e462073a0db867556ac51c61560547119a359df0f47e47210d7ea3`，
diagnostic Worker 为 `d84a40eb5dcf02b56d466f115fe2fc3135180b29125673bad9ba82afae5774ae`。
修改源文件最大为 type engine 495 行、runtime 482 行；修改测试最大
495 行，均不超过 500。既有超限债务未修改：Legacy 1058、proxy 563、
TS language service 3504、references batching 测试 1517 行。

原始证据为 `.bench/l03-pressure-cost-*.log`。首轮真实 trace 的恢复
控制发出时没有 resident，`EVICTION_NOT_OBSERVED`；对照清单还多带
未启用的诊断产物 pin，导致 inputUnchanged=false。二者均不作为有效
完整 A/B。新 v2 清单保留旧结果，在编辑前先用普通 definition 建立
可回收状态，并按各自启用路径精确记录 pins；恢复归因与 trace-off
计时分开、逐进程串行执行。

当前完整 `pnpm check:fast` 1439/1439 PASS、退出 0、无 skip/todo/cancel，
1,739,863.013768 ms，完整分段输出保留；终态后源码/构建、十四个
修改文件、测试入口和工程/SDK 输入身份一致。
[新构建真实校准](../reports/2026-10-09-resident-l03-budget-policy-calibration.md)
的选定配置及对照 26/26 exact、最新诊断一致，保留 1024 MiB 和原
92%/85% 滞回，不选择自动 Worker 替换。
[L03 完成审计](../reports/2026-10-09-resident-l03-completion-audit.md) 通过，
不由短样本宣称资源收益。PSS、DevEco、长期
soak、最终内存降幅和 500 ms/P95、规模及跨平台评审留在 L08。
