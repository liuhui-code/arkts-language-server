# 大型 ArkTS references 有界语义验证执行计划

状态：当前 `textDocument/references` 内存专项权威计划。R1 正确性原型已实现；真实工程
correctness gate 通过，memory/latency product gate 未通过，默认仍为 `legacy`。它接续
[官方语义后端与超大型工程低内存计划](2026-09-09-official-arkts-semantic-backend-execution-plan.md)，
不改变其中已完成的 backend、single-worker、Coordinator、Rust discovery 与 SDK 配置合同。

计划父版本：`b70367964bf7b32e66524b08b4aeb1acde6bd8ff`。

## 1. 已确认问题与证据边界

macOS 上对 Gramony、ChatCube、RemoteDesk 三个固定真实工程进行了 9 次独立冷 references、
9 次 completion/definition 预热后的 references，以及原产物/观测关闭/CPU profile 对照。
冷请求中 `createProgram + getTypeChecker` 占总延迟中位数 85.9%–91.5%，实际
`findReferences` 仅约 33–51 ms。实际 Program 分别包含 701、940、1,557 个 SourceFile。

这证明当前一阶成本来自 compiler working set 初始化，不证明：

- 已稳定复现用户观察到的约 5 GB 峰值；
- Program SourceFile、AST、Symbol、Type 各自的精确内存占比；
- 工程规模与内存存在线性、可外推的每文件系数；
- 任意文件切片都能保持 ArkTS 全局声明、alias/re-export、member 与 structural semantics。

因此本计划把正确性置于内存之前，并以可回滚差分实施，而不是直接以 index 结果排除文件。

## 2. 最终目标架构

```text
DocumentAuthority + ProjectGraph snapshot
                  │
                  ▼
ReferenceSearchPlanner
  Gen1: 全部合法 roots，保守分批
  Gen2: Rust occurrence/alias/re-export index 缩小候选
                  │
                  ▼
Operation-scoped ReferenceVerifier（并发固定 1）
  query/open overlays + candidate roots + compiler-followed imports + SDK
                  │
                  ▼
ohos-typescript exact proof → merge/dedupe/sort → Location[]
```

固定所有权：

| 能力 | 唯一 owner |
|---|---|
| 当前文本、未保存 overlay、版本 | `DocumentAuthority` |
| module/target/合法 membership | `ProjectGraph` / `SemanticDocumentStore` |
| ArkTS AST、symbol identity、最终引用证明 | `ohos-typescript` |
| batching、operation lifetime、取消边界 | references executor |
| 全局 occurrence/alias 候选（Gen2） | 现有 Rust sidecar / SQLite generation |
| 长期 interactive context 的 lease/trim/dispose | `SemanticCoordinator` |

不变量：

- 全工程被发现，不等于全工程同时进入一个活跃 Program；
- batch 之间不得传递 `ts.Symbol`，只传稳定路径、位置、snapshot identity；
- Rust index 永远不能在 partial/stale/unknown 状态下排除候选；
- open overlay 必须参加有效候选并覆盖磁盘；
- 任一 batch incomplete、快照变化或取消时不得返回部分 references；
- first generation `maxConcurrentReferenceSessions = 1`；
- Location 的 URI/range/includeDeclaration 与 legacy exact differential 一致。

## 3. Phase R1：保守 sequential batching（当前实施阶段）

目标：不依赖 Rust reference index，把 compiler 的 root working set 从完整 membership 改为串行
有界 batches；以真实 LSP transcript 验证结果完整性，以实际 Program SourceFile 计数验证工作集。

### R1.1 RED：公开 LSP 差分合同

新增真实 child-process / Content-Length stdio 测试：

1. 同一 workspace、符号和 UTF-16 位置分别用 `legacy`、`batched` 新进程查询；
2. normalized Location set 必须 exact equality；
3. `includeDeclaration=false/true` 均保持；
4. 引用分布在多个 root batch，含 unopened file、import alias、re-export、同名负对照和 overlay；
5. opt-in trace 证明 `batchCount > 1`、每批 root 数受限，且实际 Program SourceFile 少于 legacy；
6. partial membership、source unavailable、取消和 snapshot 改变 fail closed。

记录首个失败命令和父 revision；一次只关闭一个 RED。

### R1.2 GREEN：operation-scoped verifier

生产开关：

```text
ARKTS_REFERENCES_STRATEGY=legacy|batched   # 第一阶段默认 legacy
ARKTS_REFERENCES_BATCH_ROOTS=64            # 1..512，仅限制 candidate roots
ARKTS_REFERENCES_TRACE=1                   # 默认关闭，仅输出 bounded structured fields
```

实现语义：

1. `SemanticDocumentStore.prepare(..., true)` 冻结完整 membership、overlay 和 content revision；
2. batched executor 在查询前 dispose 同 root 长期 context；已预热的 V8 对象不保证立即回收，
   因此 benchmark 仍按整个进程 RSS 计数；
3. 固定 query root 与所有 open overlays；其余合法 membership roots 按稳定路径顺序分批；
4. 每个 batch 在一个一次性 verifier worker 中创建 `TypeScriptLanguageServiceEngine`；结果返回后
   立即终止该 isolate，batch concurrency 固定为 1。长期 semantic worker 仍只有一个；
   完整 membership 仍负责文件准入、stale 检查和结果映射；
5. compiler 可从 scoped roots 跟随 imports，故 batch-root limit 不是绝对 SourceFile 上限；每批
   必须记录实际 `program.getSourceFiles()` 计数，超大 closure 作为下一阶段输入；
6. 每批运行官方 `getDefinitionAtPosition/findReferences`，结果合并、去重、排序；任意 incomplete
   立即使整个请求 incomplete；
7. finally dispose batch LS 并终止 verifier worker；不把 verifier 注册为 resident context；
8. batch 边界检查 cancellation；请求取消时终止当前 verifier worker，且不创建下一批。

trace 只记录 strategy、batch index/count、membership/root/Program/SDK 文件数、结果数、耗时与
`process.memoryUsage()` 数字；不记录源码、完整路径或 AST。

### R1.3 退出条件

- 新 LSP batching 差分测试 GREEN；
- 现有 references completeness/depth、overlay、project boundary、cancellation 全绿；
- batch trace 证明测试 fixture `batchCount > 1` 且实际 project SourceFiles 小于 legacy；
- 相同请求连续执行不产生缺失、重复或顺序漂移；
- 三个固定真实工程 A/B/C 的 legacy/batched normalized Location set 全等；
- 至少 3 个独立 batched 新进程记录外部 RSS；不把单次结果包装成统计结论；
- `pnpm check:fast` 通过；工作树中无临时 profile、工程 checkout 或原始用户源码；
- 未取得 >3 GB 真实复现时，报告只能写“现有工程验证”，不能宣称 5 GB 已修复。

若 root batching 后任一实际 Program closure 接近 full membership，R1 仍可完成 correctness
prototype，但不得声称该工程峰值已受硬上界约束；进入 R2 前先补 dependency/semantic-unit graph。

### R1 实测判定（2026-09-11）

三个固定真实工程的 A/B/C 共 39 个 batched responses 均与 legacy A1 normalized Location set
逐项全等；隔离版重复 11 次也无结果漂移。一次性 verifier 消除了同-isolate版本中 RemoteDesk
重复峰值升到约 1.98 GB 的跨请求保留，但冷峰值没有显著低于 legacy，耗时显著上升：Gramony
约 6.1 s、ChatCube 约 16.4 s、RemoteDesk 最终复核约 51.6 s。

实际最大 project SourceFile 由 membership 的 77/263/829 降至 72/201/643；RemoteDesk 单批
依赖闭包仍达到完整 membership 的约 77.6%。因此结论是：

- R1 机制与 correctness prototype 完成；
- `maxConcurrentReferenceBatches = 1` 和 isolate 生命周期成立；
- 30% peak reduction、3× latency 与 warm latency gate 均失败；
- 默认策略不得切换为 `batched`，也不得据此宣称约 5 GB 问题已修复；
- R2 的 candidate narrowing / semantic-unit graph 成为进入生产评审的前置条件。

详细数据见 [R1 实测报告](../reports/2026-09-11-bounded-references-r1.md)。

## 4. Phase R2：Semantic Unit 与 Rust reference candidates

进度（2026-09-11）：Rust/SQLite candidate narrowing 与 ProjectGraph dependency-closure admission
纵向切片均已实现并通过公开 exactness 测试。ProjectGraph 暴露 immutable
project/product/module/target unit、显式本地依赖和反向依赖边；planner 按 whole units 分批，只向
verifier 准入 batch/pinned/open units 的正向依赖闭包。graph incomplete/unavailable 时直接退回
R1；限制闭包若仍造成 source-unavailable，则丢弃部分结果并用同一 indexed candidates 保守重试。

真实配置完整的 Gramony 三次新进程均返回八个 exact locations，project SourceFiles 降至 32，
峰值为 478.8/489.1/487.7 MiB，相对固定 R1 峰值的中位改善约 11.9%，未达到 30% gate。
RemoteDesk 从 829 membership 缩到 8 candidates、13 批缩到 1 批，但 checkout 没有有效根
profile，semantic-unit mode 不能启用；后两次稳定峰值仍约 932/930 MiB。Settings 的 `LogUtil`
legacy 结果本身漏跨模块引用，且配置含未声明的本地 module dependency，不能作为正确性 oracle
或裁剪依据。Photos 6.1 虽有 1,794 个 ArkTS/TS 文件和 18 个声明模块，但当前锁定 backend 对
`import lazy` 返回 declaration-only references，同样不能成为 correctness oracle。因此 R2 尚未退出，默认仍为 legacy。详细证据见
`docs/reports/2026-09-11-bounded-references-r2-candidates.md`。下一项必须找到更大的、配置完整且
legacy-complete 的真实多模块用例；若没有，则按停止条件进入 R3 declaration-façade/partitioning
spike，不得用样例拼接或放宽 memory gate。

补充 A/B：FilePicker 6.1 的 ordinary-import `StartModeOptions` 在三次 indexed 新进程中均与
legacy 的 49 个 Location exact equality，且 project files 从 membership 80 降到 Program 56；但
median peak 从 424.1 MiB 升到 664.6 MiB，median request 从 2.820 s 升到 4.562 s。这个结果证明
“working set 变小”本身还不足以保证产品进程峰值变小；当可裁剪 project state 较小时，transient
verifier 与 576 个 SDK SourceFiles 的固定成本会占主导。未经更多跨规模数据，不提交猜测性的
文件数阈值。

2026-09-11 Photos 补充：DevEco 允许 root module 省略 `targets`，也允许 module profile
省略 target list 并使用隐式 `default` target。ProjectGraph 已保守支持这两种形式，使固定 Photos
checkout 从 unavailable 变为 complete 18-unit graph，同时继续拒绝多 target 歧义。ordinary-import
`PersistInfoUtils` 在单个 indexed batch 中返回与 legacy 完全相同的五个 Location，并把 1,246 个
membership 文件收缩为 716 个 admitted project files。但产品 gate 仍失败：indexed peak 为
842,514,432 bytes、11.769 s，legacy 为 728,735,744 bytes、5.303 s。usage-site indexed 路径为
锚点解析与引用验证分别构造了一次等价的 710-SourceFile Program。下一 R2 slice 因而是消除重复
compiler-anchor 工作，同时保留 compiler proof；禁止从 name-only index 猜测 import identity，
歧义或不完整锚点继续 fail closed。默认仍为 `legacy`。

2026-09-11 anchor-reuse 结果：公开 LSP exact differential 和 under-declared dependency 的
fail-conservative 回退均通过；Photos 三个新进程也都返回相同五个 Location，并确认 anchor 与首批
共用同一个 710-SourceFile context。外部峰值为 818,987,008 / 883,437,568 / 885,207,040 bytes，
中位 883,437,568 bytes，比此前 indexed 单次峰值高约 4.9%；中位请求时间降至 7.439 s。结论是
重复构造主要影响延迟，不是这个 workload 的 peak 主因。该实现已撤销，不进入 main。下一 slice
必须先把 78 个 project SourceFiles、632 个 SDK SourceFiles 和 checker 派生状态的贡献分开测量，
再决定缩小 project closure 还是 SDK declaration roots；不得通过延长同一 Program 生命周期冒充
低内存改进。

同日 phase trace 已完成这个拆分：Photos verifier 在 `prepare()` 后为 268,754,608-byte heap，
`findReferences` 仅增加 9,139,288 bytes；anchor definition 仅在 270,729,512-byte prepared heap
上增加 5,955,792 bytes。Program 输入中 78 个 project files 共 797,335 UTF-16 code units，632 个
SDK declarations 共 18,915,581 code units，SDK 占约 96.0%。因此下一实验限定为“reference verifier
的 SDK ambient root profile”，默认仍使用 `index-full.d.ts`；只有 full/common profile 的
references Location、diagnostics code/category/range 全部 exact，且真实 peak 过门，才允许考虑接线。
任何 diagnostic 缺失都立即停止，不以 low memory 为由降级语义。

前置：R1 exact differential 全绿，并已用实际 Program 计数识别不能仅靠固定 root 数约束的
dependency closure。若连 Program cardinality 都不能下降，应停止而不是用索引掩盖问题；当前
三个工程的 cardinality 已下降，但峰值/延迟未过门，因此 R2 只以实验策略继续，不切生产默认。

- `SemanticUnitId = workspace + product + module + target + sdkIdentity`；
- ProjectGraph 增加 dependency/reverse-dependency edges；
- 现有 SQLite schema 增加 declaration、occurrence、import/export/re-export/alias、module/target 与
  generation；禁止第二数据库；
- `ready + matching generation + known declaration identity` 才允许 narrowing；其余状态退回全部
  semantic units 的保守 batching；
- Rust 只召回候选，官方 compiler 逐候选做最终 identity proof；
- open overlays 与 generation freshness 继续由 DocumentAuthority/worker request revision 保证。

退出条件：alias/re-export/member/同名隔离/overlay goldens 0 failure；候选召回无已知 false
negative；相对 R1 batch 数和延迟下降；真实压力工程峰值不回归。

## 5. Phase R3：长期 project partitioning

只有 R2 数据表明单个正确 dependency closure 仍然过大时启动：

- 验证 `.d.ets` façade 对 struct/component/decorator/generic/ArkUI/source mapping 的 fidelity；
- 评估 project-reference-like dependency consumption；
- 必要时将 verifier 移至独立 child process，以进程生命周期提供硬隔离；
- 企业 monorepo 再评估 CI/static/remote index。

任一 façade semantic golden 失败即停止该路线，不用近似声明换内存。

### R3.1 声明 façade fidelity spike（2026-09-11）

已新增 production composition 之外的公开 runner，使用锁定的
`ohos-typescript@4.9.5-r4` 在内存中 emit `.d.ets` 与 `.d.ets.map`。child-process 合同现已覆盖：

- exported class；
- 跨文件 generic dependency；
- SDK `ets.emitDecorators` 控制的 `struct`、`@Component`、`@State`；
- public signature 中的 ArkUI/SDK module type；
- generated declaration identifier 到原始 `.ets` identifier 的精确 source-map 回指；
- 失败诊断的 bounded、相对路径输出。

真实 DevEco API 24 / ETS 6.1.1.125 验证也通过两个 case：ArkUI builder fixture 保留
`@Entry/@Component/@State` 并以 399 个 Program SourceFiles、0 error emit；FilePicker 6.1
`AudioPickerViewData.ets` 沿四个相对依赖和 `@ohos.multimedia.image` emit 五份 façade/map，以
403 个 Program SourceFiles、0 error 完成。runner 的 SDK ambient roots 与生产一致，只准入
`index-full.d.ts/common.d.ts/arkui.d.ts` 的第一个存在项，其他 SDK module 按 import on-demand
解析；禁止把整套 SDK API 文件枚举成 roots。

后续 fresh-verifier tracer 已让 consumer 只消费生成 façade，并将 definition/reference Location
通过 `.d.ets.map` 回指源文件。测试同时发现并固定一个必要架构修正：façade-only 会遗漏符号 owner
源码实现体内的引用，所以最终执行模型必须是 `consumer façade batch + owner source batch + exact
merge`，不能只查询声明文件。两批合并后，generic dependency fixture 与 FilePicker 真实 consumer
均和 source-closure exact equality，且 consumer façade Program 未加载被替换的源文件。

FilePicker 这条真实闭包的最大 Program 文本仅下降约 1.26%，AST node 下降约 2.8%；该结构计数
本身不证明 memory gate 通过，也未接入 production references。详细证据见
[R3 declaration façade spike](../reports/2026-09-11-references-r3-declaration-facade.md)。

### R3.2 独立进程 RSS A/B 与停止决定（2026-09-11）

已增加 source 与 façade 两种独立 child-process 模式，以及外部 process-tree RSS sampler。固定
FilePicker commit、API 24 SDK、目标文件、符号和 UTF-16 位置运行三次后：五个 reference Location
每次都 exact equality；source 最大 peak 为 167,919,616 bytes、中位 604 ms；on-demand façade
最大 peak 为 526,540,800 bytes、中位 3,270 ms，peak ratio 为 3.1357。所提交的 30% 降幅 gate
要求 ratio `<= 0.70`，因此 semantic gate PASS、memory gate FAIL。

按本计划“收益不足即停止”的规则，**R3 on-demand declaration-façade 路线停止，不进入 production**。
只有构建工具链未来提供可信、预生成的 `.d.ets`，并重新通过同一 exact semantic/RSS harness，才允许
重开 R3。当前后续工作回到 R1/R2：在真实大型、多模块且 legacy-complete 的工程上验证 conservative
batching 与 index-assisted candidate narrowing；没有 >3 GB reproducer 时 release memory gate 保持未验收。

## 6. Benchmark 与发布门

每个策略固定 cold、completion/definition warmed、references×10+未保存注释三种工作流；Node PID
由外部 sampler 采 RSS，worker RSS 不重复相加。CPU profile、heap snapshot、强制 GC 均使用独立
进程，不与基线混算。

R1 prototype go/no-go（项目建议值，非行业标准）：

| 指标 | 门槛 |
|---|---:|
| legacy/batched Location set | 100% exact equality |
| OOM/crash/partial success | 0 |
| 可拆工程 peak RSS | 至少下降 30% 才进入生产默认评审 |
| cold/warm references latency | 分别不高于 legacy 3× / 3× |
| repeated references | 第 10 次后不持续线性增长 |
| 取消 | batch 边界后不再创建下一批 |

最终 production 目标仍是：正确性 0 failure；当前 >3 GB 真实案例稳定低于 3 GB；peak 不高于
legacy 50%；cold references 不高于 legacy 2×。没有真实 >3 GB reproducer 时这些门保持
“未验收”，不得降低或伪造 PASS。

## 7. 回退与停止条件

第一阶段默认 `legacy`，因此删除开关即可回退。以下情况自动 fail closed 或留在 legacy：

- project membership partial；
- query/open overlay 不在稳定 membership；
- batch 中源文件 unavailable/unmappable；
- workspace/document/SDK identity 在请求中改变；
- cancellation；
- differential contract 不一致；
- 单一正确 semantic closure 已接近全工程，batching 无实质内存收益。

不允许通过减少 references、只返回前 N 条、忽略未安装但声明必需的依赖、关闭诊断、静默返回
stale 结果或 OOM 自动重启来通过内存门。
