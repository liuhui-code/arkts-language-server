# L08 当前构建基线与独立归因 v1

状态：L08 IN_PROGRESS；产品门禁未通过。当前只取得两独立进程的开发
起点数据，不是 release P95/soak/PSS/跨平台验收，也未改变生产源码或默认。
要求见[执行记录](../plans/2026-10-10-l08-final-validation.md)及
[验收协议](../benchmarks/semantic-ready-acceptance.md)。

## 固定输入与可重放命令

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；继承 dirty 状态保留。
重新 `pnpm check && pnpm build` 退出0。Settings 干净 ecc550、API24/ETS
6.1.1.125、Node v26.3.0、backend 4.9.5-r10、完整 SDK 与正常诊断不变。
核心预算1024MiB/原滞回，选定L03组合、晋升ON、自动Worker回收OFF、R-09 OFF。

新配置矩阵纳入产品输入 digest，当前为
`399d808dcc026a14cdb7566789d017e436cfde30274922babd684d7050f482c3`。
server仍为`405b94f3c30c1f9a5666fcf6e8d016820b210f325c43f217193e4462511bfa25`；
源码未改，不能将新增矩阵视为运行时性能改进。全部工具/SDK/Worker/pins
保存在新 manifests；未覆盖或重新标记L07旧证据。

```sh
node scripts/bench/replay-references.mjs --prepared-suite .bench/l08-baseline-on-timing-v1-manifest.json --out .bench/l08-baseline-on-timing-v1.json
node scripts/bench/replay-references.mjs --prepared-suite .bench/l08-baseline-on-trace-v1-manifest.json --out .bench/l08-baseline-on-trace-v1.json
```

两轮 CLI 均退出1、raw FAIL/READINESS_UNSUPPORTED；生产子进程均正常
退出0。各15/15完整exact，配对全部完整payload、最新诊断、目标池及
产品pins相同；前后输入未变。直接复核保存在
`.bench/l08-baseline-v1-analysis.json`，八项checks均true。

## 真实 trace-off 响应与资源

| 场景 | 完整响应 |
| --- | ---: |
| 首次全域implementation暖机 | 16,453 ms |
| 此前未查lazy prepareRename | 577 ms |
| 此前未查rename | 2,781 ms |
| 同快照rename | 924 ms |
| body编辑后rename | 1,831 ms |
| 编辑后同快照rename | 1,408 ms |
| 此前未查incomingCalls | 1,618 ms |
| 同快照incomingCalls | 1,531 ms |

首项是未建立semantic-ready前的暖机成本，不冒充ready后产品桶。
本回放器仍是candidate-ready-control；上述均是单次完整观测，不是稳定P95。
首次新符号/重复/编辑分列，error/timeout不删样本。正常prepare/outgoing
约456–491ms不代表其≥100请求/≥5会话毕业。

候选catalog准备约7,964ms；time-to-semantic-ready仍null。外采Node峰值
835.73MiB，server+sidecar树1005.18MiB；未包含实际Zed，故不是完整产品
PSS比较。请求50ms采样，实际间隔P50/P95/max=125/136/159ms；峰值仅
采样下界。与旧轮数值不同，不计算未受控因果降幅，也不替代DevEco/PSS。

## 独立 trace-on 的可证伪发现

trace只归因、不并入产品分布。本轮没有trim/evict事件，否定“这轮所有
慢请求都由压力驱逐导致”的解释；不外推长期无驱逐。

- 同快照rename compiler包装回调约937ms、零createProgram。
- 同快照incoming包装回调约494ms、零createProgram，但端到端约1570ms；
  还有约1秒位于该回调之外，需继续沿请求准备/校验/调度边界定位。
- body编辑rename包装回调约1834ms，其中createProgram约887ms，新Program2；
  project AST复用1495/1496、SDK652/652，AST复用仍不等于时延毕业。
- 首次rename窗口包含两份正常诊断；编辑后重复窗口也包含正常诊断。
  不把诊断等待排除计时，更不关闭诊断换取达标。
- prepareRename/prepareCallHierarchy/outgoing包装回调约445–467ms且不重建。
  包装含输入核验/结果映射，不是纯compiler API CPU；尚不能断言具体根因。

下一动作按diagnose：定位输入freshness扫描与回调外准备/校验的实际成本，
再以公开stdio反例保护最小优化；并在既有owner内完成generation/input/
coverage绑定的ready合同。不可通过省略新鲜度检查或扩大预算消除症状。

## 最终门禁状态

最终CLI已按TDD建立336格和文件digest/输入分组，当前inventory为BLOCKED。
零exact差分的这30请求只证明本回放范围，不关闭完整正确性矩阵。
ready未实现、正式样本不足、memory/lifecycle/portability及独立匹配SDK/
DevEco门禁仍未通过。实验继续default-off，L08不能DONE。
