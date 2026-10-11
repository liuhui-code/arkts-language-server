# L03 references 准入前的 RSS 刷新

日期 2026-10-08。接续 [在途压力保护](l03-midflight-reference-admission.md)，
本切片在 references 入口与 verifier 准入前刷新现有进程 RSS/滞回
owner，避免同步准备之后仍用旧压力等级开始更多重工作。默认关闭、
正常诊断和完整结果合同不变；统一字节预算继续实施，最终验收在 L08。

## 先保护现有运行配置

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，起始源码输入
`979ac4f5aab5a9fec794f8d4dd1e0ebb239e96e3ef8adf84225cd4bb7965be2c`。
先跑既有三路 L3 公开 characterization，3/3 PASS，
2,886.010745 ms。为遵守超限文件不增长的约束，将 Legacy engine
运行配置接口抽到独立模块，原导出保留；重构后连同 production Worker
4/4 PASS，7,717.042154 ms。此次类型抽取的 runtime 产物哈希未变，
不是行为修复；Legacy 文件由 1068 缩至 1058 行，仍是待迁移债务。

## 公开 RED 与最小修复

RED 前源码输入
`4ffe4c4ba965dc7cbcc550061eb2978892a6bc3cee6366f7cf42899305cd8b39`。
真实 Content-Length LSP 子进程使用三个合法文件、正常 Query v1
诊断和 1 MiB 功能停止线；实际 Node RSS 已超过该值。通过现有
公开 benchmark control 暂时把记录等级改为 L2，不改变实际内存，
随即发多批 references，模拟两次定时采样之间的陈旧等级。

旧代码启动一批 verifier 后才因下一次 RSS 采样返回预算错误；
零启动断言得到 **0/1 FAIL**，2,761.415806 ms。这是多付一次
准备成本的执行保护缺口，不是错误引用、部分结果或实际 OOM。
控制造成的陈旧等级不证明真实 Settings 同步准备已经出现这一竞态。

```sh
node --test tests/semantic/semantic-reference-pressure-sampling.test.mjs
```

最小修复只添加内部 `refreshMemoryPressure` 回调，由现有 runtime
`sampleMemory` 实现，仍使用同一个 `SemanticMemoryPolicy`、预算、
L3 target 和 hysteresis。入口位于 document preparation 之后、选择
resident/legacy/transient 路由之前；每次 verifier 资格检查前也刷新。
不是第二预算 owner，不按 batch 数换算字节，不相加 Worker thread RSS。

取消 checkpoint 仍先执行；已有请求内 L3 见证跨后续低等级采样保留，
扩展及递归 fallback 不重置资格。初始 L3 多批计划显式 `-32803`、
无 Locations、零 batch 启动；单批已证明完整范围仍可成功。
已启动 Program 仍由原生命周期完成或取消、清理，本切片不承诺
抢占其内部分配或硬 RSS 上限。首次单用例 **1/1 PASS**，
1,157.699167 ms；该命令后来扩为七用例，历史 RED/GREEN 不重标。

## 关闭路径和完整结果

沿用 `ARKTS_BENCHMARK_CONTROL=1` 与
`ARKTS_L01_PRESSURE_ADMISSION=1`，没有新增实验 flag。
三路开启控制在真实高 RSS 下刷新并拒绝多批；关闭 reference tracing
的 legacy 控制同样显式拒绝。两个开关关闭路径及单批许可都返回
精确六处引用，v2 新增调用后 `includeDeclaration=false` 返回
六处使用位置。正常 v2 TS2304 诊断与 emoji 后 UTF-16 definition
精确，进程 shutdown 退出 0，无 Worker fatal。单个 semantic owner
与不超过两个 resident contexts 的指标合同保留。

七个公开控制及四个测试清单检查串行 **11/11 PASS**，
28,222.967559 ms。测试清单先因新文件未分类得到真实 FAIL，随后
加入 bundle-e2e 并同步数量。首轮扩展控制的 8 PASS/3 FAIL 保留：
两条关闭路径完整结果已正确，但测试误要求执行全部三个计划批次；
既有完整 scope 证明允许两批结束。修正为完整精确 Locations 加有界
启动数，同时补齐清单 layer count；没有修改生产算法让错误断言通过。

1 MiB、batch roots 1 与既有 1500 ms verifier delay 都是功能干预，
不是产品预算、字节分配预测或时延测量。SDK metadata version 为
`test`，仅属未验证的 plain-TypeScript-compatible 合同，
不冒称原生 API24 或真实工程毕业；现行 1024 MiB、默认路由、
worker 并发、compiler AST 所有权与普通诊断均不改。

## 当前验证与剩余工作

`pnpm check` 和 `pnpm build` PASS；十四文件串行 focused
**120/120 PASS**，0 fail/cancel/skip/todo，退出 0，493,746.395566 ms。
覆盖压力及诊断、批次/完整范围/保守 semantic units、constructor
排除、取消合并与调度、resident 引用、成本/lease、十六个回收合同
与 production Worker。完整转录 `.bench/l03-admission-sample-focused.log`，
逐步命令、计数、构建身份和测试哈希见
`.bench/l03-admission-sample-summary.json`。

当前源码输入
`8222df6560f09e8ffb1cf33d94b73287340b69505656ec8599035f4cccea063a`，
semantic Worker
`e3244e5b305053b5a2e4c0f51dfdb5e9d0efb52d0b38f305a47ac7c9a3903a6f`。
server 与 reference verifier 主产物未变。focused 前后源码、构建、真实
Settings 输入与 SDK 指纹一致。
类型引擎 479 行、runtime 483 行、配置模块 16 行、新公开测试
146 行，均不超过 500；Legacy engine 1058 行超限债务仍在。

源码 whole **NOT_RUN**，旧多根检查点的 1380/1380 不覆盖本构建；
合并前仍须 fresh `pnpm check:fast`。真实 Settings 同构建采样
A/B 尚未运行，不宣称内存或时延收益。RSS 是整个 Node PID 的
观测，不是每个 LS/Program 的独占字节归属，也不包含独立 sidecar
或测试工具。统一 resident/transient 字节成本、soft budget 校准、
candidate/anchor 准备和诊断重叠、单个已启动 Program 峰值与
真实工程压力组合继续在 L03 实施；默认关闭的 L04–L07 可继续，
最终内存、时延、soak 与平台验收统一放在 L08。
