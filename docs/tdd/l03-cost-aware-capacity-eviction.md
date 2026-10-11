# L03 成本感知容量驱逐

日期 2026-10-08。接续 [references 压力准入](l03-reference-pressure-admission.md)，
本切片在既有两个 resident context 的容量内，用实际观测到的 compiler
准备耗时选择无 lease 驱逐对象。双开关默认关闭，生产 LRU、1024 MiB
策略和 L3 释放规则保留。L03 继续 IN_PROGRESS；统一字节预算和实际
资源收益尚未完成，最终内存、时延、soak 与跨平台验收仍在 L08。

## 先保护生命周期再记录成本

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。先在已有公开
characterization 的 GREEN 下，把 workspace entry 的创建、trim、dispose
和 stats 提取成一个生命周期模块，保持 ArkUI 与 project 的初始化顺序。
重新构建后的五文件串行 characterization **30/30 PASS**，退出 0，
60,224.895874 ms；type engine 从 499 降到 462 行，新模块 49 行。
完整转录 `.bench/l03-cost-entry-characterization.log`。

成本观测 RED 的父源码输入
`b9d147670e4359d3b819ad87e21e4cf55b4bf95249a8940f43bad7b63e172fb8`。
真实 Content-Length LSP 子进程先得到正常 v1 诊断，但没有 compiler
成本记录，0/1 FAIL，737.217666 ms；失败不是初始化、
SDK 或目标未命中。命令与原始转录如下：

```sh
node --test --test-name-pattern='observed compiler rebuild costs' \
  tests/semantic/semantic-l2-rearm-witness.test.mjs
```

`.bench/l03-rebuild-cost-red.log`；最小修复首次 **1/1 PASS**，992.220737 ms。
已有 compiler collector 的 grouped `createProgram` duration 在嵌套查询
清理 collector 前累计，lease 释放前把有限正值记录到当前 resident 实例。
热查询没有新 build 就不制造零成本；collector 缺测时保留未知。相同根
被 L3 驱逐后，新实例不继承旧样本，旧实例不能更新新实例的成本。

`rebuildCostMs` 是成功查询期间观测的 grouped compiler 准备耗时，
不是总请求时延、独占 CPU 时间、Program 创建次数、分配字节数，
也不保证下一次冷恢复的代价。每个 resident 只保留一个最近正样本，
不新增缓存 owner、历史序列或 compiler 私有字段。成本观测不依赖
生命周期日志回调，日志失败不能改变查询结果或 lease 释放。

## 容量驱逐的公开 RED 与最小修复

成本记录 GREEN 后，父源码输入
`0ea996a791f2d47190122259f7059ab00220eaefb2191298f430eddb1dfadfe3`。
三根独立工作区各有 emoji 与未保存文本。先用正常诊断实测两个根的
正成本，再按实际样本确定高低；通过精确热 definition 把高成本根变旧。
打开第三根时，旧 LRU 驱逐了高成本根，身份断言 RED，0/1 FAIL，
1,063.239014 ms。没有以文件数或假定项目大小替代成本排名。

```sh
node --test --test-name-pattern='opt-in capacity eviction' \
  tests/semantic/semantic-l2-rearm-witness.test.mjs
```

`.bench/l03-cost-eviction-red.log`；首次修复 **1/1 PASS**，1,131.518695 ms。
只有 `ARKTS_BENCHMARK_CONTROL=1` 且 `ARKTS_L03_COST_AWARE_EVICTION=1`
才启用成本感知驱逐，并可独立于 L01 rearm 观测成本；已有 L01 build
witness 同样可记录成本，但没有成本 opt-in 时不会排序。容量满时
仍只选择无 lease 候选；全部候选都有
正样本且成本有差异，才按成本升序、LRU 次序打破并列，原因记作
`capacity-cost`。缺测、全部同成本或仅一个候选时保留原 LRU 和
`capacity-lru`；没有候选时仍明确拒绝，不驱逐执行中的上下文。

同成本的原因字段另有 Coordinator 公开接口 RED：父源码输入
`fccaeba6f18df9ccd6454546926d2b5d5803de0986b44b5d737dc7007009e984`，
旧实现选择了 LRU 对象但错误标为成本决策，0/1 FAIL，207.75218 ms。
修复后 1/1 PASS，197.125316 ms，原始 `.bench/l03-cost-tie-red.log`。

```sh
node --test --test-name-pattern='equal measured rebuild costs' \
  tests/semantic/semantic-coordinator.test.mjs
```

## 关闭路径与最新文本合同

公开 LSP 六用例 **6/6 PASS**，6,437.990208 ms。覆盖原 L2 rearm witness、
成本证据以及四组容量控制：开启、关闭成本 opt-in、关闭 benchmark、
开启成本但关闭 L2 rearm。三根的精确 UTF-16 定位、完整引用集合、
独立未保存文本和 v2 新增引用均通过；保留实例可直接复用，容量始终
不超过两个。正常版本化诊断通过，shutdown 退出 0，无 Worker fatal。
成本观测本身不重新开启 L2 rearm；L3 仍释放全部无 lease 上下文，
不因恢复成本高而免除回收。

Coordinator 公开接口 characterization **10/10 PASS**，296.673883 ms，
另覆盖无效值、缺测、旧实例、同成本、无 observer、全 leased 拒绝和
L3 释放。它保护通用容量算法，不替代真实 LSP 的六个公开用例。
夹具 SDK version 为 `test`，属于未验证、plain-TypeScript-compatible
合同，不冒称原生 API24 产品资格。

## 当前验证与后续实施

`pnpm check` 与 `pnpm build` PASS。十文件串行 focused **67/67 PASS**，
0 fail/cancel/skip/todo，退出 0，118,588.360417 ms；包含生命周期、
compiler trace、resident references、三路 L3 停止线、L2 rearm、
回收等待/取消/多根重放、Coordinator lease 和 production Worker。
完整转录 `.bench/l03-cost-eviction-focused.log`；逐步 RED/GREEN、
构建身份与测试哈希见 `.bench/l03-cost-eviction-summary.json`。

当前源码输入
`b15bd9dac4975ed6052e8d7df0dade07a6e6f3f8e20eca80b281551aac54fc72`，
semantic Worker
`71630bf4f875b6f5720f4104004e84801f2290d9cefd4612fc8727381f156301`。
本切片修改的源码/测试均不超过 500 行；既有超限的 language service、
Worker proxy 和 legacy engine 未在本切片修改，仍属迁移债务。

当前源码 whole **NOT_RUN**；旧多根检查点 1380/1380 PASS 不属于本构建。
合并前仍须 fresh `pnpm check:fast`。本切片没有真实工程成本排序 A/B
或资源收益结论；后续继续核算 resident 与 transient 的统一字节成本、
single-batch/anchor/诊断重叠、soft budget 和全部文档关闭状态。
既有默认关闭的 L04–L07 能力切片照常推进，不用 L08 最终指标阻塞。
