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

SDK ambient-root spike 结果：reference-verifier-only `common.d.ts` profile 在公开 LSP case 中
保持 references/diagnostics exact；Photos 三次均返回五个 reference，正常诊断仍发布 119 条。
verifier 从 632 个 SDK files / 18,915,581 code units / 约 269 MiB prepared heap 降到 502 /
13,876,398 / 约 201 MiB。但外部 product peak 为 559,480,832 / 789,028,864 / 777,347,072 bytes，
中位只比 indexed baseline 低约 7.7%，未达到 30% gate，且仍高于 legacy。profile 实现已撤销。

重语义生命周期隔离 slice 已完成：显式 references 在 LSP 入口暂停自动诊断，取消并等待已开始的
诊断安静退出；references 完成后按当前文档版本重新排队。公开子进程测试证明 diagnostics 不丢失，
并且 references 期间编辑文档时只发布最新版本。Photos 三个独立新进程均返回 legacy oracle 的
五个 exact Location，随后发布 version 1 的 119 条正常诊断。外部 peak 为 562,184,192 /
571,596,800 / 578,387,968 bytes，中位 571,596,800，相对 indexed baseline 842,514,432 降低
32.16%，通过 30% prototype gate；请求时间为 10.720 / 11.537 / 11.253 秒。

这一 slice 可以合并，但不单独把 `indexed-batched` 切成默认策略：其三次请求中位仍约为 legacy
单次 5.303 秒的 2.12 倍，略高于 production 2× latency 目标。下一 slice 应缩短 anchor/index
planning 时间并扩充不同 symbol kind 的真实 exact differential；不得通过提前恢复诊断、并发多个
verifier 或缩小结果集换取延迟。

SQLite candidate lookup 的首个延迟 slice 已完成。Photos 数据库有 1,096,191 条 reference
occurrence；原 SQL 因 `ORDER BY document_uri` 选择主键 URI 顺序并扫描 occurrence 表，真实直接
查询耗时 5.06 秒。强制使用既有 `reference_occurrences_name` 索引后，同库同结果为 0.11 秒。
端到端三次新进程 request 为 7.800 / 6.775 / 6.575 秒，中位 6.775 秒，较上一版中位降低
39.79%，为 legacy 单次基线的 1.28×；peak 中位 575,754,240 bytes，仍较原 indexed baseline
降低 31.66%。五个 Location 与 119 条 diagnostics 保持不变，延迟和内存 prototype gate 均通过。

不同 symbol kind 的真实检查同时暴露了下一项约束：`export const` 函数
`getMutuallyExclusiveDesc` 尚无 index declaration identity，因而安全回退为 20 个 conservative
batches。结果与 legacy 三个 Location exact，但耗时 63.279 秒，诊断因回放工具 20 秒观察窗而未
被记录。后续 slice 已对顶层具名 `export const` 箭头函数增加保守 candidate 支持，同时保持普通
导出值 unsupported。三次新进程均从 index 得到两个 candidate files，仅运行一个 verifier batch，
精确返回 legacy 的三个 Location；request 为 7.609 / 7.345 / 7.357 秒，中位 7.357 秒，较回退
降低 88.37%。peak 中位 579,092,480 bytes，三次均在 references 后发布 version 1 的 107 条
diagnostics。该 symbol kind 的正确性、诊断和延迟 gate 通过；其他导出种类仍须逐类以真实 RED
case 扩展，在更广泛 exact differential 完成前不得切默认。

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

2026-09-11 `export enum` slice：Photos 6.1 的 `ConflictFunc` 在 main 上因没有 declaration
identity 安全回退为 20 个 conservative batches，虽然与 legacy 六个 Location exact equality，
请求仍耗时 63.101 秒。新增显式 `Enum` 索引类型并仅支持顶层具名导出枚举后，三次独立进程均由
两个 candidate files 形成一个 verifier batch，六个 Location 与 107 条 version-1 diagnostics
完全一致。请求中位 7.655 秒，peak 中位 566,480,896 bytes；相对 legacy 834,555,904-byte peak
下降 32.12%。该 slice 达到当前 symbol-kind 门禁，但默认继续为 `legacy`；下一步仍按真实 RED
逐类扩展 export/alias/member 形态，未知类型必须 fail closed。

2026-09-11 `export interface` slice：Photos 的 `ConflictContent` 在支持前 exact 返回三个
Location，但需 20 个 conservative batches 和 65.470 秒。显式 `Interface` 索引类型加入后，
三次新进程均只使用两个 candidate files 和一个 714-SourceFile verifier，返回同样三个 Location
并发布 107 条 diagnostics；请求中位 7.900 秒，下降 87.93%。peak 中位 570,470,400 bytes，
相对该符号 legacy 只下降 26.99%，未达到单用例 30% prototype memory gate。因此该声明类型可
作为 opt-in R2 的正确候选扩展合并，但不能据此切换默认策略或宣布内存目标完成。

2026-09-11 `export type` slice：新增独立 `TypeAlias` 索引类型，只接受顶层具名导出类型别名；
`import type`、type re-export、非导出 alias、default export、普通值和 member 继续 fail closed。
Photos 6.1 的真实业务符号 `AlbumChangeData` 三次新进程均与 legacy 三个 Location 和 20 条
diagnostics exact equality，只使用三个 name candidates、两个 batch roots、一个 278-SourceFile
verifier。请求中位 5.609 秒，峰值中位 529,199,104 bytes；相对该符号 legacy 7.538 秒 /
822,280,192 bytes，分别下降 25.59% 和 35.64%，通过单用例 correctness/latency/memory 门。
但同工程常见名 `PhotoAsset` 仍保守召回 1,154 个文件、需要 11 批，证明 name-only index 对高
碰撞符号尚未解决；下一 slice 应以真实 RED 验证 module/declaration identity narrowing，未知或
歧义 identity 必须继续保守扩张。默认仍为 `legacy`。

2026-09-11 binding-source 基础切片：索引现已把具名 `import`、`import type`、ArkTS
`import lazy` 与具名 re-export 解析为带 `sourceSpecifier` 的方向性 binding，而不再只能看到
全局无来源的 `A as B` 名称边。SQLite schema v5 在同一数据库中持久化
`importedName/localName/sourceSpecifier/kind/documentUri`，v4 数据库原地迁移；迁移后的旧 generation
没有伪造 binding，需正常 refresh/catalog 才会补齐。`references/candidates` 通过 sidecar 和
TypeScript adapter 暴露确定顺序的 binding chain。此切片**没有**据此排除任何 URI，既有 name-only
候选及 compiler proof 完全不变；它只关闭 identity narrowing 所需的首个数据缺口。下一 RED 必须
证明模块说明符能唯一解析到目标 declaration，且 alias/re-export 链完整，才允许减少 `PhotoAsset`
候选。无法解析、非相对模块、缺边或 generation 不完整时继续使用当前保守集合。

2026-09-11 binding-resolution 切片：`references/candidates` 现在会在 committed catalog 内解析
方向性 binding 的相对 source specifier。显式扩展名以及 ArkTS/TS 文件和 `index` façade 候选只有
唯一命中时才标为 `unique` 并返回 `resolvedSourceUri`；零命中标为 `unresolved`，多命中标为
`ambiguous`，包名/非相对 specifier 标为 `unsupported`。内存 store、SQLite 重启、Rust sidecar
和 TypeScript adapter 使用同一状态契约。此切片仍不排除任何 candidate URI，也不改变
`indexed-batched` planner 或默认 `legacy` 策略，因此没有新的性能结论。下一 RED 是以唯一解析边
从目标 declaration 向外证明完整 alias/re-export 可达链；任一候选 occurrence 无法归属时必须
回退现有保守集合。

2026-09-11 binding-chain proof 切片：索引以 declaration URI/name 为锚，只沿 `unique` 的方向性
binding 扩张，并要求所有相关 binding 和 occurrence 均能归属到这条链。证明成功时返回
`identityComplete=true` 与确定顺序的 `identityUris`；出现同名碰撞、歧义、包名边或任何未归属
occurrence 时返回 `identityComplete=false` 和空 URI 集。该 proof 已贯通内存 store、SQLite、
sidecar 与 TypeScript adapter，但 planner 尚不消费它，所以 candidate roots 与默认策略不变。
下一 RED 应分类“具有独立 declaration identity 的同名文档”，只有排除后剩余 occurrence 全部
属于目标链时，才把 `identityUris` 用作 indexed batch 输入。

2026-09-12 独立 declaration collision 切片：索引现在可将带不同稳定 declaration identity 的
顶层同名导出归入其自身声明，而不再让它破坏目标的相对 import/re-export chain。occurrence 同时
记录点号限定状态；若出现 `Namespace.Thing` 之类可能指向目标的 qualified occurrence，proof 保持
incomplete。SQLite schema v6 在同一数据库持久化该状态；v5 迁移数据保持 unknown，只有正常
refresh 后才可参与排除。`indexed-batched` 仅在 `identityComplete=true` 且 `identityUris` 非空时
使用证明集合，否则继续使用原保守 `uris`。公开 LSP 差分验证了同名独立文件从 compiler roots
排除、open overlay 仍固定加入、最终 Location set 不变。

真实 Photos `PhotoAsset` 复核仍未越过下一边界：固定 commit/API 24 用例精确返回 legacy 的九个
Location，但 index proof 因包级/无法唯一解析的 binding 保持 incomplete，compiler 仍接收 1,154
个候选并运行 11 批；本次请求 45.339 秒、进程树 RSS 峰值 779,599,872 bytes。此数据不构成性能
成功。下一 RED 必须为 bare package/SDK import 建立由 ProjectGraph/SDK identity 支持的唯一解析，
或继续 fail closed；禁止把字符串相同的 package import 当作同一 declaration。

2026-09-12 本地包 binding-resolution 切片：`references/candidates` 新增有界
`sourceResolutions` 输入。该输入不是索引自行猜测的模块真值；它只能由已有
`LocalPackageResolver` 根据当前 ProjectGraph、声明依赖、包 manifest 和 containing file 产生。
sidecar 只接受非空、受大小限制的 URI/specifier 三元组，且 resolved URI 必须存在于同一 committed
catalog；同一 binding 的冲突覆盖、未知目标或未覆盖边继续使 identity proof incomplete。

`indexed-batched` 先读取 bindings；当 generation ready、declaration identity 有效而 proof 尚不完整时，
只解析非 unique source，再以同一 declaration/position 和 resolution overlay 请求第二次 proof。真实
LSP 子进程合同覆盖 `entry -> shared: file:../shared` 的裸包名 re-export：identity candidates 从五个
收窄为四个，最终 Location set 与 conservative batching 完全一致。默认仍为 `legacy`；这一切片只
支持 ProjectGraph 内的声明本地包，不把 `@ohos.*` 等 SDK specifier 误当作本地包。下一 RED 先支持
manifest 已声明的本地包子路径（例如 `@ohos/common/src/...`）：仍由 `LocalPackageResolver`/
ProjectGraph 唯一解析且必须限制在目标包目录内；之后才单独验证由已锁定 SDK identity 提供 SDK
module declaration URI。任何一步无法唯一匹配时都继续使用 conservative `uris`。

ProjectGraph admission 实现后，固定 Photos `PhotoAsset` 再次 exact 返回九个 Location。scope 内
source proof 为 238 resolved / 231 unresolved；剩余是 SDK 229、relative 2、package/other 0。
index conservative candidates 从 1,586 降为 1,154，但这正是 compiler membership 原本已接纳的
集合，因此仍需 11 批，尚无 working-set 性能收益。请求 151.596 秒，进程树峰值
717,840,384 bytes；测试盘接近满载，时间/RSS 只作环境记录。下一 RED 已收敛为锁定 SDK identity，
不能把此次 catalog-scope 收缩当作最终 candidate narrowing。

真实回放同时补上 catalog liveness 门禁：`activating` 阶段只要 sidecar 持续发送单调合法心跳，
Node watchdog 必须保活；完全无心跳仍按既有 30 秒阈值失败。默认阈值不放宽。

同日固定 Photos 6.1 `PhotoAsset` 再回放确认了该边界：九个 Location 与 legacy oracle exact，
请求 46.002 秒、进程树 RSS 峰值 784,023,552 bytes；index 返回 1,586 个 conservative URI，
membership 过滤后仍有 1,154 个 compiler candidates 和 11 批。日志没有
`references.index.source-resolutions`。工程中的相关导入是 manifest 已声明的本地包子路径，而当前
resolver 只支持裸包名和 self-subpath；因此该结果首先证明的是 declared local-package subpath 边界，
SDK module identity 是之后的独立边界。该结果是正确性与 fail-conservative 证据，不是性能改善；原始报告为
`/private/tmp/arkts-photos-photoasset-local-package-retry.json`。

2026-09-12 声明本地包子路径切片：`LocalPackageResolver` 在完整 specifier 不是精确 dependency key
时，按 scoped/unscoped package 语法拆出 dependency name 与 subpath；只有 containing package manifest
声明该 dependency、目标 package manifest 的 `name` 精确匹配、候选扩展属于
`.ets/.ts/.d.ets/.d.ts`，且 lexical/physical path 均留在目标包目录内时才返回 source URI。安装包、
file dependency 与未保存 overlay 共用该约束；未声明、名称不匹配、路径穿越、包外 symlink 均 fail
closed。真实 LSP 子进程合同证明 `@ohos/shared/src/main/ets/Target` 可使第二次 index proof 从五个
conservative candidates 收窄到四个 identity candidates，Location set 与 conservative batching exact。

固定 Photos 6.1 `PhotoAsset` 成功回放解析了 310 条 source binding，但另有 292 条仍未解析，因此
identity proof 正确保持 incomplete：index 仍返回 1,586 个 conservative URI，membership 后为 1,154
个 candidates/11 批。九个 Location 与 legacy oracle exact；请求 47.677 秒，进程树 RSS 峰值
730,562,560 bytes。单次峰值差异不作为性能结论；该 slice 证明本地包子路径已接通，也证明下一 RED
必须分类并由锁定 SDK identity 解析剩余 SDK module edge，无法唯一解析时继续 conservative。
原始报告：`/private/tmp/arkts-photos-photoasset-package-subpath-run1.json`。

2026-09-12 未解析 source binding 分类切片：新增默认不记录源码、specifier 或完整路径的计数型
观测，将第二次 proof 后仍未解析的 binding 分为 `sdk/package/relative/other`。公开 LSP 差分先要求
四类各出现一次时仍保持 `compiler-definition` 保守模式、五个 candidates 和完全相同的 Location
集合；本地包已成功解析的既有用例同时要求四类未解析计数均为零。该切片不改变 source resolution、
candidate selection、worker、预算或默认 `legacy` 策略。

固定 Photos 6.1 `PhotoAsset` 回放仍精确返回 legacy 的九个 Location；310 条 binding 已解析，292 条
未解析中 SDK 275、相对路径 17、package 0、other 0。请求耗时 51.313 秒，进程树 RSS 峰值
733,020,160 bytes，仍为 1,586 个 index candidates、membership 后 1,154 个 compiler candidates/
11 批。该结果仅确定下一调查顺序：先解释 committed catalog 中 17 条相对路径为何未唯一解析，再为
锁定 SDK 设计 catalog 外部 terminal identity；不得直接放宽 workspace URI 边界或宣称性能改善。
原始报告：`/private/tmp/arkts-photos-photoasset-source-classification.json`。

2026-09-12 relative-source 诊断：固定 Photos 工程的 17 条未解析相对 binding 均没有可解析的
磁盘/catalog 目标，不是 resolver 漏扩展名。15 条位于根 `build-profile.json5` 未声明的
`demo/picker_demo/application1`，另 2 条位于 `common` 内复制的 SDK 声明并指向缺失的
`./@ohos.base`。因此下一 slice 不修补路径解析，而是让完整 ProjectGraph 的 source roots 成为
index identity proof 的显式 admission boundary。graph 不完整时禁止排除；admitted root 内的缺边
仍须使 proof incomplete。随后再单独处理 2 条工程内复制 SDK 声明和 275 条锁定 SDK module edge。

2026-09-12 锁定 SDK external-terminal 切片：`indexed-batched` 现在只通过现有
`discoverProjectSdk()` 选择 SDK，因而继续支持 Zed `initializationOptions.sdk.path`、项目
`local.properties`、环境回退和平台默认路径的既有优先级。只有 SDK metadata 已识别、官方模块解析
找到声明、且 canonical declaration 仍位于 canonical SDK root 内时，Node 才向 Rust 发送不含路径的
`sdk:<sha256>` 外部终点。Rust 将该 binding 及其 alias/re-export 传播链标为与 workspace target
不相交，不把 SDK URI 放进 workspace catalog 或 target `identityUris`。无 SDK、无效 metadata、模块
不存在、包外 symlink、畸形/冲突 identity 均保持 conservative。

公开 LSP 差分用编辑器配置 SDK、故意使环境 SDK 无效，仍把五个 compiler candidates 安全收窄为
四个并保持 Location exact equality；Rust sidecar 及 memory/SQLite 合同全绿。固定 Photos 6.1
`PhotoAsset` 的三次独立新进程实测均在**第一次、尚未附加 SDK resolution 的** candidate 查询处超过
未改变的 15 秒 timeout，随后保守回退并在 180 秒 harness 上限内未完成 20 批。因此本切片的单元/
协议/LSP correctness GREEN，但 Photos 大型工程 gate 状态为“前置索引时限阻断”，不是性能 PASS；
不提高 timeout、不缩短结果、不切换默认策略。下一纵向切片应先让 1M occurrence 级 identity proof
在产品 timeout 内稳定完成，再复跑同一 Photos oracle，之后才能量化 229 个 SDK binding 的候选降幅。

2026-09-13 occurrence-proof query 切片：固定 Photos SQLite 数据库包含 1,096,191 条 occurrence。
阶段计时证明旧 scoped proof 冷查询的 16.543 秒中有 15.340 秒用于读取和解码 95,541 条 occurrence
rows；proof 实际只消费 name、URI 与 qualification，不消费每个 UTF-16 range。SQLite schema v7
在同一数据库和 generation lifecycle 内增加去重 proof identity 投影，保留原始 occurrence/range；
全库 1,096,191 条位置对应 200,319 个 identity classes。scoped SQL 同时复用已按 admission boundary
证明的 203 个名称，不再三次重建全局 alias CTE。最终真实缓存为 448 MiB。

全新 schema/cache 上的直接 `PhotoAsset` candidate query 从旧冷 14.206 秒降至 0.864 秒，热查询
从 3.334 秒降至 0.270 秒，稳定进入未改变的 15 秒产品 timeout。最终真实 LSP 新进程完整执行
11 个顺序 verifier batches，九个 Location 与 legacy oracle exact，峰值 659,488,768 bytes；但请求
仍耗时 201.304 秒。SDK 275/229 类 edge 已全部由锁定 SDK terminal 分类，剩余仅 2 条位于工程内
SDK mirror 且指向缺失 `./@ohos.base` 的 relative binding；proof 因此正确保持 incomplete，compiler
候选仍为 1,154。该切片通过 candidate-query、correctness 与 bounded-memory gate，但 production
latency gate 仍失败，默认保持 `legacy`。下一 RED 只能从权威工程/SDK 边界处理这两条 mirror edge
或进一步收紧 declaration identity；不得按路径猜测、提高 timeout 或漏掉 candidates。详细证据见
[occurrence-proof query 报告](../reports/2026-09-13-references-occurrence-proof-query.md)。

PR release gate 随后揭示 identity projection 的首次写入曾使固定 455-file fixture 冷 catalog 达到
3.350 秒并越过既有 3 秒上限，本机可重复为 3.51--3.59 秒。门限未放宽：全量 transaction 改为批量
写 identity、事务末尾一次建立 covering index；所有 name-only reference discovery 改读该 projection，
原始 range 表不再维护重复 name index。固定 fixture 随后连续三次通过原门限，故该修复属于当前
occurrence-proof slice 的 release-gate 收口，不改变下一 RED 或默认 references 策略。

2026-09-13 binding-name narrowing 切片：对剩余两条工程内 SDK mirror edge 的调查证明，问题并非
mirror 路径本身，而是 index 把任意 `identifier as identifier` 类型断言当成跨文件 alias，使
`PhotoAsset` 从一个名称扩张到 203 个名称并误连 `BusinessError`。Memory/SQLite 现在只使用具备
source specifier 的 named import/re-export `ReferenceBinding` 扩展跨文件名称；不添加 SDK 路径特判。
固定 Photos candidate 从 1,154 文件/824 bindings 收缩为 124 文件/87 bindings，冷查询约 42 ms；
三次独立 LSP 新进程均精确返回 legacy 的九个 Location，请求为 14.492/14.085/13.668 秒，3 批、
每批 61..288 project files，峰值 736,722,944..748,146,688 bytes。相对 legacy 7.996 秒的中位
延迟约 1.76x，通过既定 `<=2x` gate；默认仍保持 `legacy`，下一步需在其他真实工程和 symbol kind
复核后才讨论切换。详细证据见
[binding-name narrowing 报告](../reports/2026-09-13-reference-binding-name-narrowing.md)。

2026-09-13 direct-import anchor 切片：index 现在只在查询位置是未限定具名 import、source 唯一解析、
目标文件恰有一个可搜索导出时，直接返回该 declaration identity；多 binding、歧义路径、仅 re-export
目标、default、namespace 和未知形态仍走 compiler anchor。公开 LSP 差分证明只发出一次 candidate
请求、不再出现 `references.anchor.complete`，最终 Location set 不变。固定 Photos `PhotoAsset`
三次新进程均精确返回 legacy 的九个 Location，保留 3 个 verifier batches 和 288/110/61 个 project
SourceFiles；请求为 11.784/11.760/11.553 秒，中位较上一版降低 16.5%，为 legacy 的 1.47x；peak
中位 724,774,912 bytes。将 124 candidates 合为一批虽降到 9.297 秒，却使 peak 升至
775,344,128 bytes，故不采用增大 batch 换延迟。默认仍为 `legacy`；绝对延迟和最终 50% memory gate
继续 OPEN。详见 [direct import anchor 报告](../reports/2026-09-13-reference-direct-import-anchor.md)。

2026-09-13 跨工程复核与 process-isolation 停止判定：FilePicker 6.1 的真实导出 class
`StartModeOptions` 从直接 import 使用点发起三次独立请求，均走 indexed declaration identity、单个
56-project/576-SDK SourceFile verifier，精确返回 legacy 的 49 个 Location 并发布 4 条诊断；请求
中位 4.738 秒，为 legacy 的 1.68x，peak 中位 493,121,536 bytes，仍比 legacy 高 10.9%。因此
direct-import anchor 的跨项目/class correctness GREEN，但小工程禁止无条件切默认。

同一轮把 Photos 的每个 transient verifier 改为独立 child process 并等待退出，三次仍精确返回九个
Location，但 peak 中位 767,680,512 bytes，比当前 worker 中位高 5.9%、几乎等于 legacy；请求中位
11.683 秒也无实质改善。该实现按 30% prototype 停止条件撤销，不进入生产。下一实验必须直接减少
最大正确 batch 的 project closure 或其 675 个 SDK SourceFiles；不得继续用 worker/process 容器
变化替代 working-set reduction。详见
[跨工程与 process isolation 报告](../reports/2026-09-13-reference-cross-project-and-process-isolation.md)。

2026-09-13 conservative identity narrowing 切片：固定 Photos `PhotoAsset` 的剩余 proof 缺口来自
qualified occurrence 未保留 qualifier，以及相对 source URI 未按 catalog 规则编码 `@`。索引投影
现在持久化 qualifier、识别 default/lazy import，并将 URI 统一编码；SQLite schema v8 对 v7 旧行
保留 unknown 语义，正常 refresh 前不得据此排除。proof 新增独立的 `narrowedUris`：只删除已经证明
属于独立 declaration chain 或锁定 SDK qualifier 的 occurrence，所有 unknown/ambiguous/stale 仍送入
compiler，最终语义 owner 不变。

三次独立 Photos 新进程均与 legacy 的九个 Location exact equality，candidate 从 124 降至 8，
3 batches 降至 1 batch，Program project files 降至 36；请求为 4.281/3.953/3.981 秒，峰值为
560,824,320/554,364,928/555,728,896 bytes。中位 3.981 秒是 legacy 7.996 秒的 0.50x；中位峰值
555,728,896 bytes 比 legacy 降低 27.7%、比上一 indexed 中位降低 23.3%。另一个保留 124 candidates
而仅把 root cap 改为 32 的实验需要 4 batches、15.399 秒、703,180,800 bytes，只换来约 3% 峰值
下降且延迟增加 31%，按停止条件不采用。

这证明 compiler project working set 缩小会同时改善此真实 workload 的延迟和峰值，但最终 50%
memory gate 仍未通过，默认继续保持 `legacy`。剩余 Program 由 36 个 project files 和 351 个 SDK
declarations 组成，SDK 文本约 15.4M UTF-16 units、project 文本约 1.86M。下一实验边界因此是 SDK
declaration closure/不可约运行时底座，不再调 candidate root cap；任何 SDK 缩减必须同时保持
references 与 diagnostics exact。详细证据见
[conservative narrowing 报告](../reports/2026-09-13-reference-conservative-narrowing.md)。

2026-09-13 SDK working-set 复核：新增仅作用于 transient reference verifier 的默认关闭
`common.d.ts` ambient profile；常驻交互 engine 继续使用完整 `index-full.d.ts`。公开真实 LSP 合同中，
`full/common` 的 Location set 与自动 diagnostics 完全一致，且测试 verifier 的 SDK root 确实减少。
固定 Photos `PhotoAsset` 三次独立 `common` 新进程仍精确返回九个 Location、发布 27 条 diagnostics；
verifier 从 351 SDK SourceFiles / 15,397,526 code units 降为 218 / 9,915,017，请求中位 3.288 秒。

阶段对齐的外部 RSS A/B 显示 references 区间从 `full` 560,152,576 bytes 降为 `common`
487,247,872 bytes，降幅 13.0%；但请求返回后正常 diagnostics 重建完整 interactive Program，峰值又从
487,247,872 升至 568,356,864 bytes，与 `full` 的 571,219,968 bytes 基本相同。三次 `common`
全工作流峰值中位 563,097,600 bytes，只比同提交单次 `full` 低 1.5%，并高于上一轮 `full` 三次中位
1.3%，不能宣称产品内存改善。profile 因此只保留为 default-off 差分实验，不允许切换默认；下一 RED
转向 diagnostics interactive Program 的 working-set/cardinality，必须保持 diagnostic code/category/
range exact，不重试 process isolation、root-cap、强制 GC 或已停止的 declaration façade。详见
[SDK working-set 报告](../reports/2026-09-13-reference-sdk-working-set.md)。

2026-09-13 diagnostics SDK cardinality 切片：新增复用既有 default-off trace 的
`diagnostics.program.complete` 事件，只记录 Program project/SDK/other 文件数、UTF-16 code units、诊断数、
RSS 与 heapUsed，不记录源码或完整路径。公开真实 LSP 合同证明 verifier-only `common` profile 不会改变
interactive diagnostics 的完整 SDK Program。

固定 Photos 文件的独立 diagnostics-only 新进程在 14.494 秒发布预期 27 条诊断，产品峰值
544,686,080 bytes。Program 共 813 个 SourceFiles，其中 project 206 / 2,335,577 code units，SDK
607 / 18,622,997；SDK 占 Program 文本 88.9%。这证明 references 返回后的约 545--558 MB floor 可由
正常 diagnostics 单独建立，不是 transient verifier retention 或 sidecar 重复计数。

一次临时、默认关闭的 interactive `common.d.ts` 因果实验把 SDK 降为 476 files / 13,276,760 code
units，产品峰值降至 498,991,104 bytes（8.4%），但 diagnostics 从 27 增至 32：新增五个 `TS2304`，
分别把三个 `AppStorage` 和两个 `Resource` 使用点误报为未定义。正确性 gate 首次即失败，因此不做三次
性能复核，实验环境开关已从产品代码撤除。下一 RED 必须保守发现 SDK declaration closure 并显式保留
全局 ArkUI/runtime ambient declarations；证据 missing/ambiguous/stale 时退回 full SDK。不得以静态
`common` profile、隐藏诊断或关闭自动 diagnostics 换内存。详见
[diagnostics SDK working-set 报告](../reports/2026-09-13-diagnostics-sdk-working-set.md)。

2026-09-13 current-artifact 跨工程 gate：重新构建当前 Rust sidecar 后，Gramony、ChatCube、
RemoteDesk 的 `indexed-batched` 均分别与 8/33/71-location legacy oracle exact；此前混用当前 Node
bundle 与旧 sidecar 的运行已明确作废。同提交单进程 A/B 中，`indexed/full` 相对 legacy 的峰值变化
为 +19.7%/-12.2%/-2.5%，延迟为 1.02x/1.05x/1.52x，故仍不能切默认。verifier-only `common`
把三者 SDK SourceFiles 分别降至 495/423/595，并在随后正式回放中于 2.982/2.960/5.670 秒返回
exact 结果；但小工程 Gramony 的固定双 context 成本仍高于 legacy，且运行间 wall-time 方差很大。

仓库现已提供 `scripts/bench/replay-references.mjs`：复用真实 LSP session、记录明确协议方法和 UTF-16
位置、保留自动诊断、由目标进程之外采样 Node+sidecar process-tree RSS、校验可跨 checkout 路径的
normalized Location oracle，并锁定 repo/workspace revision、server/sidecar SHA-256。三份 raw curve
已提交。该工具完成不改变产品策略；`indexed-batched` 与 `common` 均继续 opt-in，>3 GB release gate
仍 OPEN。详见
[current-artifact 跨工程报告](../reports/2026-09-13-reference-cross-project-current-gate.md)。

2026-09-13 interactive SDK core-closure 切片：在上一轮 `common.d.ts` 的五个 false TS2304 反例上，
新增默认关闭的 `ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core` 因果实验。它以
`common.d.ts`、`units.d.ts`、`common_ts_ets_api.d.ts` 为保守 seed，由 compiler 继续跟随声明依赖；
任一 seed 缺失即退回既有 full prelude。公开真实 LSP 合同证明完整 seed 时 references/diagnostics
exact 且测试 SDK Program 5->3，缺失 seed 时 fail closed 到与 full 相同的 3 个 SDK files。

固定 Photos commit/文件的 full/core 各三个独立 diagnostics-only 新进程全部发布 exact 的 27 条
diagnostics。core 将 Program SDK files 从 607 降到 478、SDK text 从 18,622,997 降到 13,428,629，
但产品进程树 peak 中位仅从 531,693,568 降到 497,037,312 bytes（6.5%），时间中位从 14.395 降到
13.522 秒（6.1%）。第二对运行的 peak 方向反转；Gramony/ChatCube/RemoteDesk 的单次跨工程复核也
分别为 -5.1%/-1.2%/+11.0%。因此 30% memory gate 明确失败，默认继续使用 full，core 只保留为
default-off 差分工具。下一实验不得继续堆静态 SDK seed，而应测 checker/Program 生命周期与最大正确
interactive project closure；仍须保持自动 diagnostics 和 exact semantic output。详见
[interactive SDK core-closure 报告](../reports/2026-09-13-interactive-sdk-core-spike.md)。

2026-09-13 interactive project-root cardinality 切片：新增默认关闭的
`ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current` 因果实验。它只作用于
`includeWorkspaceFiles=false` 的交互语义查询，以当前文档和全部 open overlays 为 compiler roots，
由 compiler 跟随真实 imports；references、rename 和当前 workspace-global completion 路径继续保留完整
membership。公开 child-process LSP 合同证明 current/closure 的稳定 completion 字段、definition、
references 与 diagnostics exact，并确认 open overlay 被固定为 root。

固定 Photos diagnostics-only 各三个独立新进程中，27 条 diagnostics 按 code/severity/source/message/
UTF-16 range 完全一致。Program 从 813 files（206 project + 607 SDK）、207 roots 缩到 380 files
（29 project + 351 SDK）、2 roots；峰值中位从 546,734,080 降到 463,196,160 bytes（-15.3%），
耗时中位从 14.472 降到 13.469 秒（-6.9%）。同产物 `PhotoAsset` mode-A references 仍 exact 返回
九个 Location，peak 从 567,291,904 降到 504,631,296 bytes（-11.0%）。Gramony、ChatCube、
RemoteDesk 的 diagnostic Program 原本就只有一个 project root，三者 exact references 复核没有稳定
收益。

更重要的是，Photos 的 completion→definition→references mode-B 因 completion 仍调用
`prepare(..., true)`，在两种 profile 下 completion response 时产品 RSS 均约 800 MiB；最终 peak 只从
1,106,702,336 降到 1,055,588,352 bytes（-4.6%）。因此 30% memory gate 明确失败，默认继续使用
`closure`，current 只保留为 default-off 差分工具。下一 RED 转向区分 local/member completion 与
global module-export discovery：Rust index 只召回候选，compiler 继续最终验证；partial/stale/ambiguous
必须 fail closed。不得缩短 completion 结果、关闭自动诊断或在公开 exact contract 通过前切默认。
详见 [interactive project-root cardinality 报告](../reports/2026-09-13-interactive-project-root-cardinality.md)。

2026-09-13 member completion working-set 切片：公开 child-process LSP 合同现在用同一套 UTF-16
identifier 规则区分 member access 与普通 completion。只有 default-off
`ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current` 下的 member completion 使用当前文档和 open
overlays 作为 roots，由 compiler 跟随真实 imports；默认 `closure` 与 ordinary/module-export
completion 继续使用完整 membership。fixture 中 member completion 的稳定结果 exact，project roots
从 3 降到 1、实际 project Program 为 2 files；同一 current profile 下的普通 `PublicThing`
completion 仍使用 3 roots，防止误裁 workspace discovery。

固定 Photos 6.1 `onOperationEnd`（UTF-16 `70:24`）的 closure/current 各三次独立新进程均返回
3 个 completion items、同一 12 个验证后的 reference Locations 和 27 条 diagnostics。Program 从
1,928 files（1,246 project roots）缩到 380 files（29 project、1 project root）；completion response
product RSS 中位从 751,624,192 降至 473,157,632 bytes（-37.05%），completion latency 中位从
8.037 降至 2.991 秒（-62.78%），两项 prototype gate GREEN。

但后续 legacy references 按正确性要求重新扩展完整 Program，整条
completion→definition→references workflow 的 peak 中位只下降 8.09%，且 current 单次峰值存在反向
波动。因此本切片只证明 member completion working set 可安全缩小，不改变 production default，也不
宣称整条工作流过门。下一步先跨其他真实工程/member kind 做 exact 复核，再把 member-only 策略与广义
current profile 解耦；ordinary/global completion 必须等待 Rust module-export candidate recall + compiler
proof 的独立合同，partial/stale/ambiguous 时 fail closed。详见
[member completion working-set 报告](../reports/2026-09-13-member-completion-working-set.md)。

2026-09-13 member-only policy 收口：Gramony 静态方法 `sameDay`、ChatCube 实例字段
`requestMap`、RemoteDesk 对象字段 `passwordConfigured` 的真实 mode-B 回放均保持 completion item
count、reference identity 与正常 diagnostics。三者 Program files 分别从 701/940/1,557 降到
256/304/258，completion response RSS 分别从 461,864,960/502,554,624/801,681,408 降到
352,301,056/379,633,664/360,361,984 bytes；completion latency 均下降。后续 legacy references
仍会扩张 full Program，因此不得将 final workflow peak 当作此切片的成员补全指标。

新增独立、默认关闭的 `ARKTS_MEMBER_COMPLETION_PROJECT_ROOT_PROFILE=current`；默认值为
`workspace`。它只改变 member completion 的 roots，不再要求同时启用广义
`ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current`。公开 LSP 合同证明 member-only 配置保持
completion/definition/diagnostics exact，普通 module-export completion 仍使用完整 roots。真实 Photos
复核在 broad profile=`closure` 时仍得到 380-file/1-project-root member Program，随后 diagnostics 按原
策略恢复完整 813-file/206-project-root Program并发布 27 条，references 返回 12 个 exact Locations。

该策略暂不切默认：真实样本不能证明 unopened project-global augmentation 可安全省略。下一阶段转向
global/ambient contribution discovery 与 ordinary module-export completion candidate recall；Rust 只做
保守召回，compiler 最终证明，unknown/partial/stale 必须保留完整 workspace fallback。详细数据见
[member completion working-set 报告](../reports/2026-09-13-member-completion-working-set.md)。

2026-09-13 ordinary auto-import discovery-root 切片：新增默认关闭的
`ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE=discovery`。只有 Rust export discovery 返回 ready、非空且
全部可准入当前 workspace 的候选时，ordinary/module-export completion 才以当前/open documents 与
候选声明文件作为 compiler roots；compiler 仍生成 completion entry 并通过
`getCompletionEntryDetails()` 做最终证明。missing/empty/partial/stale/outside-workspace 均保留完整
workspace fallback。公开 5,000-export LSP 合同中 ready roots 从 25 降至 2，stale case 仍为 25，
两者都返回并 resolve 同一 `ExactNeedleExport`。

固定 Photos `ConflictContent` 一次 fresh-process A/B 中，completion Program 从 1,928/1,246 project
files/1,246 roots 降至 772/107/2；completion boundary worker RSS 从 767,074,304 降至
481,456,128 bytes，响应从 8.766 s 降至 4.184 s。completion、resolve import edit 与 90 条
diagnostics 指纹完全相同。但完整 workflow peak 只下降 6.57%，因为 resolve/diagnostics 后续仍恢复
更广语义状态。这只是单次因果证据，不是统计 release 结论；默认继续为 `workspace`。下一 RED 是让
discovered completion 的 resolve 保留同一官方 entry identity 与精确 import edit，同时避免无必要的
full-workspace roots；ambient/global contribution discovery 仍是默认启用前置门。
[报告](../reports/2026-09-13-auto-import-discovery-roots.md)。

2026-09-13 ordinary auto-import resolve-root 切片：ready export discovery 现在把与返回补全项匹配的
workspace 内声明 URI 保存在 server-owned resolution record；LSP 客户端仍只看到不可伪造的
`arktsCompletionId`。`completionItem/resolve` 复用当前文档、open overlays 和这些声明 roots，由
`ohos-typescript getCompletionEntryDetails()` 继续生成最终 detail/import edit。metadata
missing/empty/malformed/outside-workspace、profile disabled 或 discovery 非 ready 时均恢复完整 workspace。

公开 5,000-export child-process 合同中，ready completion/resolve 都保持 2 project roots 并返回同一
`ManyExports` edit；stale completion/resolve 都保持 25 roots 并返回同一 edit。固定 Photos
`ConflictContent` fresh-process A/B 在 completion/resolve 结果和 90 条 diagnostics 指纹完全一致时，
resolve Program 从 1,928 files/1,246 project roots 降至 772/2，resolve worker RSS 从
743,264,256 降至 489,156,608 bytes（-34.19%），外部采样的 product peak 从
780,128,256 降至 547,852,288 bytes（-29.77%）。但单次 resolve latency 从 1.715 s 增至
7.039 s（4.10x），明确不通过 latency gate；默认继续为 `workspace`。下一步先查明同一 two-root
resolve 的重建成本并做跨真实工程与重复运行复核，ambient/global contribution completeness 仍是默认
启用前置门。详见
[resolve-root 报告](../reports/2026-09-13-auto-import-resolve-roots.md)。

2026-09-13 pre-resolved completion details 切片：上一轮 Photos discovery resolve 4.10x 回归已定位为
重复工作，而非 two-root Program 固有成本。completion 的 indexed candidate 验证已经调用官方
`getCompletionEntryDetails()`，但曾丢弃其结果；正常 diagnostics 还可能在 completion/resolve 之间
改变 active Program，随后 resolve 再次准备 compiler state。现在只有 default-off discovery profile
下、ready candidate 的纯数据 detail/documentation/current-document edits 会保存在 server-owned
resolution record；不保留 `Program`、AST 或 `ts.Symbol`。客户端仍只收到 opaque UUID。

公开 5,000-export transcript 中 ready resolve 保持 exact edit 且 compiler event 从 1 降至 0；stale
case 不记录 pre-resolved value，仍走 25-root full fallback。固定 Photos exact A/B 中 discovery resolve
从 1.266 s 降至 4.09 ms 且没有第二个 Program，completion RSS -37.03%，整个产品进程树 peak
-28.09%。原 4.10x latency blocker 在该 reproducer 上关闭，但 30% memory threshold 仍差 1.91 个百分点，
且只有单次运行；默认继续为 `workspace`。下一 gate 是 Gramony/ChatCube/RemoteDesk 的真实 auto-import
exact 复核与 Photos 独立重复运行，之后才处理 diagnostics peak 和 ambient/global contributor
completeness。详见
[pre-resolved details 报告](../reports/2026-09-13-auto-import-pre-resolved-details.md)。

2026-09-13 cross-project auto-import gate：Gramony `Chat`、ChatCube `PreferencesService`、
RemoteDesk `TerminalCoreBridge` 均从真实现存 import/use 关系构造仅内存 overlay；每个
workspace/discovery profile 都使用 fresh server/cache，并严格等待 Rust catalog ready。三组 completion
label/kind/range、resolved class detail、import edit 与正常 diagnostics 指纹逐项一致，ready discovery
resolve 均为 0 compiler events，证明 pre-resolved 机制跨工程成立。

工作集收益取决于候选宽度。ChatCube 从 940 files/263 roots 降至 514/2，product peak -20.67%；
RemoteDesk 从 1,557/829 降至 259/2，peak -53.56%。Gramony 的短前缀 `Cha` 召回 12 个匹配 export、
13 roots，Program 仅从 701 降至 690，peak +0.11%，completion latency +25.43%，明确失败。不得通过
截断 completion items 修复；下一 RED 必须保留全部同前缀 completion identity/import source，同时把
多个 declaration roots 按 semantic unit 或 bounded sequential groups 验证，避免所有候选同时进入一个
Program。默认继续为 `workspace`。详见
[cross-project auto-import 报告](../reports/2026-09-13-cross-project-auto-import-gate.md)。

2026-09-14 auto-import discovery-root batching 切片：公开 child-process LSP RED 先证明五个 ready
候选仍同时进入一个 6-project-root Program；实现按稳定声明路径顺序分批后得到三个 `3/3/2` root
Program，并保留全部候选、同名不同 module source、精确 import edit 和零 discovery-backed resolve
Program。第二个 RED 证明前批 import closure 可能提前暴露后批候选；merge 现在以
`name + entrySource` 为 identity，并让后续官方 `getCompletionEntryDetails()` 已证明的版本替换较弱
版本。partial/stale/outside-workspace 仍 fail closed 到完整 workspace。

固定 Gramony `Cha` 回放在 root limit 128/8/2 下均返回相同 16 个可见 completion identity/edit，
其中 12 个 discovery-backed item 全部 pre-resolved，31 条 diagnostics 指纹一致。但峰值分别为
487,632,896 / 518,311,936 / 572,743,680 bytes，耗时 3.829 / 3.900 / 5.740 秒；两种分批都未
改善内存。最后一个 two-root batch 仍通过 imports 到达 65/77 个 project files，且长期 worker 中
顺序 Program 的 compiler state 有保留。故新 root-limit 默认保持 128，较小值只作显式实验；此切片
correctness GREEN、memory gate FAILED。下一 RED 必须按实际 dependency closure/cardinality 和
operation lifetime 建模，禁止继续调 root 常数、截断候选或弱化 diagnostics。详见
[auto-import root batching 报告](../reports/2026-09-14-auto-import-root-batching.md)。

2026-09-14 transient worker spike：为验证上一切片的 compiler-state retention，曾将多批 completion
分别放入一次性 Node worker thread；实现未提交，测量后已撤回。固定 Gramony `Cha` 的候选、精确
import edits 与 31 条 diagnostics 保持一致，但 root limit 8 的 latency/peak 相对 resident baseline
增加 76.97%/8.44%，root limit 2 增加 365.16%/10.66%。worker thread 退出没有在下一批前令产品进程
RSS 回落，且每批重复支付 compiler/worker 启动成本。因此该方向 correctness GREEN、memory/latency
FAILED，禁止合入或继续增加 worker 数。下一 RED 是用稳定、隐私安全的 candidate/root identity 将每批
输入与实际 dependency closure、Program project-file cardinality 关联，先解释最后一批为何仍达到
65 files，再决定可证明的 semantic boundary。详见
[transient worker spike 报告](../reports/2026-09-14-auto-import-transient-worker-spike.md)。

2026-09-14 dependency-closure correlation：default-off trace 现在以 batch index/count、root/candidate
count 和 workspace-relative path 的短 SHA-256 指纹关联每个 completion Program；不记录源码或绝对
候选路径。公开 child-process LSP 测试独立计算并验证精确指纹。固定 Gramony 逐 root 回放证明
`ChatList.ets` 单独达到 65 project files，而 `ChatItem.ets` 只有 29；前一轮末批膨胀不是两个 roots
叠加，而是 `ChatList` 通过 `Index/Home` 等真实 imports 形成的合法 dependency closure。由此排除继续
缩小 root-count 作为 working-set 解法。下一 RED 应在批次之间调用 backend 已有的 semantic cleanup，
验证 checker/Program 派生状态是否可回收，且必须保留这个合法 65-file closure。详见
[closure correlation 报告](../reports/2026-09-14-auto-import-closure-correlation.md)。

2026-09-14 batch semantic cleanup：新增 default-off
`ARKTS_AUTO_IMPORT_TRIM_BETWEEN_BATCHES=1`，只在 discovery-root 多批 completion 的非末批纯数据结果
完成后调用 backend 官方 `cleanupSemanticCache()`；末批继续常驻，cleanup 后不调用 `getProgram()`，避免
观测动作触发重建。公开 LSP 合同要求三批之间正好两次 cleanup，同时保持五个候选、同名不同 source、
精确 import edits 和零 discovery-backed resolve Programs。

固定 Gramony limit=2 的三次独立新进程 A/B 中，cleanup off/on completion 中位为 5.830/5.325 秒，
product peak 中位为 563,261,440/518,946,816 bytes；分别改善 8.67%/7.87%，六次候选与 diagnostics
identity 全部一致。这证明 compiler semantic state 存在可清理的批间累积，但总体收益低于 30% prototype
gate，且没有缩小 `ChatList.ets` 合法的 65-file closure；默认不得开启。下一阶段应对该大闭包验证
declaration façade consumer，或在需要生命周期隔离时使用真正 child process，而不是继续调 cleanup/root
常数。详见
[batch semantic-cleanup 报告](../reports/2026-09-14-auto-import-batch-semantic-cleanup.md)。

2026-09-14 Gramony `ChatList` declaration-façade gate：使用真实 consumer `pages/Index.ets` 的
`ChatList` import 运行 source/façade 独立进程 A/B。初次 `r4` 运行暴露 API 24 annotation parser
覆盖缺口；生产升级到精确锁定的 `ohos-typescript@4.9.5-r10` 并按 SDK metadata 启用官方
`etsAnnotationsEnable` 后，两个真实 annotation declaration 文件均为 0 syntax diagnostics。
同一真实 façade emit 从 807 files/145 errors 变为 545 files/71 errors，仍生成 45 个 `.d.ets`；
剩余错误来自未闭合的 native/三方 declarations 与依赖类型，因此 zero-error fidelity gate 仍停止
A/B，状态保持 `ENVIRONMENT_BLOCKED`。不能把 parser gate 通过误写成 façade 可用。详见
[Gramony ChatList façade gate](../reports/2026-09-14-gramony-chatlist-declaration-facade-gate.md)。

2026-09-14 auto-import true child-process spike：公开 LSP RED 要求三个 batches 分别由三个顺序 child
process 验证，并保留五个 candidate、同名不同 source、精确 import edit 和完整 diagnostics。原型修复
了大 IPC response 在 send callback 前 disconnect 会丢响应的竞态后通过合同。Gramony `Cha` 的
resident/process 各三次新进程均返回相同 16 个 completion identity/edit 和相同 31 条 diagnostics；
process 退出也确实让批间进程树 RSS 回落。

但总产品门禁明确失败：process 中位 completion 为 19.990 秒，是 resident 5.857 秒的 3.41x；中位
peak 为 602,046,464 bytes，比 resident 530,018,304 bytes 高 13.59%。因此所有 child-process 产品
代码、开关与 process-only 测试已撤销，不合入，也不通过隐藏 child RSS 重试。façade 与硬生命周期
隔离两条候选均关闭后，backend compatibility gate 已补齐并通过：生产 `r10` artifact 和锁定 source
revision 都必须解析真实 API 24 annotations，任一失败都会使 spike FAIL；因此不触发 `ets2panda`
fallback，也未增加 regex workaround。升级后同一 Gramony `DateHelper` 真实 references 在 common/full
SDK profile 下均精确返回 8/8，耗时 2.552/3.125 秒，产品进程树峰值
389,828,608/433,258,496 bytes，批处理 Program 保持 32 个工程文件。下一 working-set 工作不再继续
调 worker/cleanup/root 常数：只有取得依赖完整、zero-error 的 façade closure 后才重开 façade A/B；
否则优先扩展 Rust reference candidate coverage 与多 module sequential batch 的真实门禁。详见
[auto-import child-process spike](../reports/2026-09-14-auto-import-child-process-spike.md)。

2026-09-14 r10 跨工程与真实多批门禁：Gramony、ChatCube、RemoteDesk 与 Photos 四个固定真实工程
均用合并后的 `ohos-typescript@4.9.5-r10` 产物执行独立 legacy/indexed 新进程回放，8/33/71/15 个
Location 与各自 r10 legacy oracle exact equality，正常 diagnostics 保留。Photos 原 r4 九位置 oracle
已被因果复核为旧 backend 漏结果：r10 legacy 与 indexed 都包含同样新增的六个真实 usage，不能继续
把九位置结果当正确性基准。

同产物单次 indexed common 相对 legacy 的峰值变化依次为 +0.01%/-26.96%/-16.14%/-21.69%，四组
延迟均下降；但这不是重复统计，且未达到最终 50% memory gate，所以默认仍为 `legacy`。Photos 使用
`batch-roots=2` 时，ProjectGraph 第二 semantic-unit batch因 `source-unavailable` 按合同丢弃部分结果，
随后四个 conservative batches 顺序完成，仍返回 15/15；最大 batch 为 394 project SourceFiles，
后续为 208/209/209，低于 1,246-file membership。该强制多批请求耗时 21.622 秒（legacy 2.19x），
峰值 626,348,032 bytes，没有优于默认 root limit 的单 batch，因此只关闭真实多批 correctness gate，
不改 root limit。下一 RED 是补齐导致 semantic-unit fallback 的权威 dependency edge，或继续扩展其他
真实 symbol kind 的 identity coverage；不得把 forced small batches 产品化。详见
[r10 跨工程 references 报告](../reports/2026-09-14-r10-cross-project-references-gate.md)。

2026-09-14 adaptive semantic closure：Photos 的 `source-unavailable` 已定位为工程内真实、但未出现在
`oh-package.json5` dependency edge 中的跨 module 相对 import。新公开 LSP RED 先要求 underdeclared
import 不得丢弃已完成批次并全量重启；实现只在 verifier 实际请求到“完整 membership 内、当前 admission
外”的路径时，按该路径所属 semantic unit 及其声明依赖扩展当前批次并重试。每轮 admission 必须严格
增长，重试数受 graph unit 数约束；不能映射、graph 不完整、文件快照变化等情况仍保留 conservative
fallback。路径只在 worker/executor 内传递，trace 仅输出 unit/file 数量。

固定 Photos `PhotoAsset`、`batch-roots=2` 的三个独立新进程均返回 r10 legacy 的 15/15 Locations；每次
都是两个最终 semantic-unit batches、一次扩展（3 units / 229 files）、零 conservative restart，最大
Program 为 393 project SourceFiles，对比 membership 1,246。请求中位 15.446 秒、产品进程树峰值中位
576,552,960 bytes；相对上一条单次 21.622 秒 / 626,348,032 bytes 的强制多批记录方向性改善
28.56% / 7.95%，但不是配对统计，`indexed-batched`、common SDK profile 与小 root limit 仍默认关闭。
这关闭了 compiler-followed undeclared import 的批次恢复 correctness/performance gate；下一阶段应继续
提高 index ready 稳定性和候选 coverage，而不是放宽 fallback 或把路径写入日志。详见
[adaptive semantic-closure 报告](../reports/2026-09-14-references-adaptive-semantic-closure.md)。

2026-09-14 普通导出值 candidate coverage：此前只有顶层具名 `export const` 箭头函数会获得
reference declaration identity，普通 `export const value = ...` 必须退回保守路径。新 RED 先要求无分号
导出值可搜索，同时不能把下一条本地箭头函数误认成该导出；实现将普通值持久化为独立 `variable`
symbol kind，箭头函数继续保持 `function`。Memory/SQLite（含 reopen）和 sidecar NDJSON 公共协议均覆盖
该合同。

固定 Photos 6.1 `BUNDLE_NAMES` 的 legacy/indexed 两个独立新进程均返回相同 14 个 Location、相同
Location hash 和 6 条正常 diagnostics。indexed 路径以 `indexed-declaration` 接受 7 个 candidate files，
零 fallback，顺序运行三个 batches；最大 Program 只有 346 个 project SourceFiles，对比完整 membership
1,246。单次峰值从 legacy 798,949,376 降到 584,744,960 bytes（-26.81%），但耗时从 10.624 秒升到
21.121 秒（1.99x），仅擦线通过原型 `<=2x` 门禁，不能据此切换默认策略。下一项继续选择真实高频、
当前 unsupported 的 symbol kind 做 exact differential；同时要降低多批 setup 成本，而不是增加并发或
放宽 Location 完整性。详见
[exported-value candidate 报告](../reports/2026-09-14-references-exported-value-candidates.md)。

2026-09-14 默认导出 candidate coverage：索引现在把声明本地名称与 module export slot 分开，具名
`export default class/function/struct/interface` 使用稳定 declaration identity，并沿来源已证明的
default import / 显式 re-export 链传播。普通 import 只证明当前文件 occurrence，不能把目标透传为该
文件自己的 default export；未解析 default package import 继续进入保守集合。SQLite schema v9 在同一
数据库新增 `reference_export_name`，v8 原地迁移并回填既有具名导出，不建立第二数据库。

固定 Photos 6.1 `ExifUtil` 的四个独立 indexed 新进程均返回 legacy oracle 的 30/30 Location、同一
Location hash 与 70 条正常 diagnostics。候选从早期通用 `default` 名称闭包的 113 个收缩为声明文件、
`MediaSaveManager.ets`、`BaseEditor.ets` 三个真实文件，只运行一个 658-SourceFile / 287-project-file
verifier batch。四次 request 中位 10.754 秒，为已验证 legacy 9.012 秒的 1.19x，通过 `<=2x` 原型
延迟门禁。

内存发布门仍未通过：两次有效 legacy 外部采样在 367,546,368--799,596,544 bytes 间波动，indexed
四次为 577,175,552--643,448,832 bytes，无法从这组数据得出方向性内存收益。默认继续为 `legacy`，
用户报告的 >3 GB 真实复现与最终 50% peak reduction gate 仍保持未验收。下一项应继续选择真实高频且
当前 unsupported 的 declaration/member 形态做 exact differential，或取得原始 >3 GB 工程；不得用
`default` 全局词法同名、未确认 SDK edge 或缩减 Location 集换性能。详见
[default-export candidate 报告](../reports/2026-09-14-references-default-export-candidates.md)。

2026-09-14 顶层 export modifier coverage：Rust index 现在只按 declaration-kind allowlist 识别
`export` 与声明关键字之间的 `abstract`、`async`、`declare`，同时覆盖
`export default abstract class`；nested declaration/namespace member 不因此成为全局 declaration。
公开 sidecar RED 在 parent `957fab8` 首先证明 `export abstract class` 为 unsupported，GREEN 后同时
固定 abstract class、async function、declare interface 与 default abstract class 的 identity 和来源隔离。

真实 Photos 6.1 `LogExtender` 使用 3 个 legacy 与 3 个 indexed 独立新进程。六次均返回声明、import、
`extends` 三个 exact Location，同一 hash，0 diagnostic。indexed 只召回声明与真实 consumer 两个文件，
运行一个 batch；一次 source-unavailable closure expansion 后实际 Program 为 565 SourceFiles，其中 206
project + 359 SDK，对比完整 project membership 1,246。中位耗时 9.737 秒降至 7.331 秒（0.75x），
产品进程树 RSS 中位 798,138,368 降至 576,307,200 bytes（0.72x，下降 27.8%）。

该结果通过 correctness/latency slice gate，但低于最终 50% peak reduction，且仍不是用户报告的 >3 GB
工程，所以默认保持 `legacy`。本样本的下一工作集边界已经从 candidate name recall 转为 semantic-unit
source-unavailable expansion 与剩余 359-file SDK profile；下一 RED 应优先处理真实 namespace/member
identity 或证明 expansion 所需依赖边，而不是继续扩充词法同名集合。详见
[top-level export modifier 报告](../reports/2026-09-14-references-export-modifiers.md)。

2026-09-14 namespace candidate coverage：Rust index 新增独立 `Namespace` kind，SQLite 使用向后兼容
kind 9，sidecar 复用现有 wire kind `module`；只给顶层 `export namespace` 建 declaration identity，
namespace member 仍由 compiler 证明。公开 sidecar RED/GREEN 同时证明两个同名 namespace 通过来源绑定
保持隔离。

真实 Photos `Routers` 使用 3 个 legacy 与 3 个 indexed 新进程，六次均返回 19 个 exact Location、
同一 hash 与 1 条正常 diagnostic。indexed 召回 3 个真实文件、一个 batch，实际 Program 577 files
（218 project + 359 SDK），对比 project membership 1,246。耗时中位 12.393 秒降至 9.914 秒（0.80x），
RSS 中位 777,011,200 降至 562,438,144 bytes（0.72x，下降 27.6%）。正确性/延迟通过，但仍低于
50% peak release gate，默认保持 `legacy`。下一步不再扩展简单顶层声明关键词；应转向真实 member
identity 或修复 source-unavailable semantic-unit expansion。详见
[namespace candidate 报告](../reports/2026-09-14-references-namespace-candidates.md)。

2026-09-14 identity-bounded dependency profile：默认关闭的新实验只在 Rust index 已完成 declaration
identity proof、且全部 identity candidate 能放入同一个 batch 时启用。该 verifier 同时装入 query/open
documents 与全部 identity candidate，但不再沿 candidate consumer 的无关工程 import 扩张；最终 Location
仍由 `ohos-typescript` 证明。identity 不完整或候选跨多个 batch 时继续使用现有 conservative closure。

公开 LSP RED 证明单纯把 identity candidates 拆成一文件一批会丢失 consumer reference，因此这一版明确
禁止 multi-batch identity profile。加入无关六文件依赖链的 GREEN case 返回与 closure 完全相同的 Location，
同时把 project Program 从 9 个文件降到 3 个；另一个 incomplete-proof case 明确证明请求 identity 仍会
fail closed 到 closure。

固定 Photos `LogExtender` 与 `Routers` 各三次新进程均保留 3/3、19/19 exact Locations 和正常 diagnostics。
Program 分别从 206/218 个 project SourceFiles 降到 2/3，产品进程树 RSS 中位下降 34.61%/29.70%；请求
中位耗时则上升 99.53%/38.51%，其中 `LogExtender` 14.628 秒仅擦线满足原型 2x 上限。该结果证明无关
import closure 是 working-set 的主要放大器，但仍未达到最终 50% peak gate，也不是用户报告的 >3 GB
工程，生产默认保持 `legacy`，dependency profile 默认保持 `closure`。下一 Phase R2 RED 必须在每个
Program 内稳定重建 anchor，才允许 multi-batch identity verification；在此之前不得减小 root limit、
并发多个 verifier 或容忍 incomplete identity。详见
[identity-bounded dependency 报告](../reports/2026-09-14-references-identity-bounded-dependencies.md)。

2026-09-15 multi-batch identity anchor：上一 slice 已证明把 declaration 与 consumer 分到不同 Program
会漏引用，因此新公共 LSP RED 把 direct-import identity root limit 从 64 降到 1，并固定复现两批退回
closure、consumer batch 加载 9 个 project files。实现没有解析 opaque declaration identity，而是在 Rust
memory/SQLite result 与 sidecar wire 中显式增加 `declarationUri`；该 URI 必须属于完整 identity candidate
set，并固定进入每个 batch。每个新 Program 因此能重新解析 query symbol，再由 compiler 精确验证该批。

真实 Photos 门禁从 declaration 改到 `AgreementConfig.ets` 的 `Routers` import 使用点。3×legacy 与
3×identity 均返回 19/19 exact Locations 和相同 8 条 diagnostics。identity 强制 root limit 1 后顺序完成
两个 batch、零 expansion，最大 Program 127 files（3 project + 124 SDK）；中位请求从 8.953 秒降到
6.542 秒，中位产品 RSS 从 807,149,568 降到 425,357,312 bytes（-47.30%）。这关闭真实 usage-site
multi-batch correctness gate，但 0.527 ratio 仍高于最终 0.50，且不是用户报告的 >3 GB 工程，所以生产
继续 `legacy`、dependency profile 继续默认 `closure`。下一步不再缩 project roots；应 profile 剩余
124 SDK roots / verifier setup，或取得原始 >3 GB reproducer。详见
[multi-batch identity anchor 报告](../reports/2026-09-15-references-multibatch-identity-anchor.md)。

### R2b — alias/re-export support chain (completed 2026-09-16)

The identity-bounded verifier now carries an explicit, bounded support URI set
for unique re-export bindings. Every identity batch includes the declaration
anchor plus the barrel/source files required to reconstruct the binding chain.
Malformed, unresolved, out-of-candidate, or over-64-file support chains fall
back to conservative closure; no result is narrowed on incomplete proof.

Evidence:

- RED: `batchRoots=1` omitted three `Use.ets` references in the scripted
  `Target → Barrel → Query/Use` chain.
- GREEN: exact public LSP Location equality, two identity batches, and two
  pinned support files; focused tests `4/4`, full references-batching suite
  `11/11`.
- Real Photos replay: environment-blocked because the previously used
  `/private/tmp/applications_photos-6.1-lts` directory no longer exists. This
  slice therefore has no promoted real-project memory or latency claim.

Production defaults remain `legacy` strategy and `closure` dependency profile.
The next slice may profile SDK support roots or restore a fixed real-project
fixture; it must not weaken the support-chain fallback or reduce Location
completeness.

### R2c — package entry scope correctness (completed 2026-09-19)

The restored Photos project exposed a correctness blocker in the default-off
identity profile: `EditorController` returned 9/17 legacy Locations because
`browserCommonPhone/index.ets` is the declared package entry outside the
module's `src/main` source roots. Rust memory and SQLite now reject identity
proof when a scoped binding resolves to a catalog-owned source outside the
admitted scope. The worker admits each selected module's validated, exact
package entry file in addition to its ProjectGraph source roots.

The public LSP RED/GREEN and Rust store contract cover this boundary. Three
fresh Photos runs now return 17/17 exact Locations and identical diagnostics,
but all use conservative closure and take 22.516 s median versus one 9.928 s
legacy validation (2.27×). The final performance gate remains open. The next
slice must prove the package-root barrel/alias identity chain or safely retain
the conservative result; no release default change is authorized by this
correctness fix. See the
[package-entry scope report](../reports/2026-09-19-references-package-entry-scope.md).

### R2d — disjoint re-export support (completed 2026-09-19)

The package-entry Photos replay showed that Rust had already proved a seven-file
`EditorController` identity set, but Node's support-chain guard rejected it
because the unrelated `browserCommonPC/index.ets` re-export was outside that
set. The guard now skips re-exports whose binding file is outside the *complete*
identity set; a re-export inside the set still requires a unique source within
the set. A public child-process RED/GREEN case covers both the independent
same-name barrel and a broken target-chain fail-conservative control.

On the fixed Photos checkout, three fresh legacy and three fresh identity runs
each returned the same 17 Locations and 59 diagnostics. Identity ran three
sequential batches with at most 211 SourceFiles. Median latency was 5.246 s
versus legacy 7.711 s; median product peak RSS was 650,092,544 versus
890,122,240 bytes, a 27.0% reduction. Latency passes the `<=2×` prototype
gate, but memory fails both the 30% prototype and 50% final gate. Production
defaults remain `legacy`/`closure`; the user-reported >3 GB case remains
unverified. See the [disjoint re-export report](../reports/2026-09-19-references-disjoint-reexport-support.md).

### R2e — diagnostic SDK root probe (2026-09-19; opt-in only)

The `EditorController` product RSS peak occurred after the references response
while normal diagnostics built an 889-SourceFile Program (368 project, 521 SDK),
not inside the at-most-211-SourceFile identity verifier. Reducing diagnostic
project roots from 256 to one left the same 368 project SourceFiles reachable
through imports. The existing default-off `core` SDK profile reduced SDK files
but generated a false `Curve` diagnostic because it omitted `enums.d.ts`.

A public LSP RED/GREEN case now fixes that specific profile omission. On the
fixed Photos checkout, three independent core+enums identity runs returned the
same 17 Locations and exact 59 diagnostics as full-profile legacy. Diagnostic
SDK SourceFiles fell from 521 to 394. Median product peak was 578,654,208
versus 890,122,240 bytes (35.0% lower), and median request latency was
5.345 versus 7.711 seconds. This one workload passes the 30% prototype gate,
but still fails the final 50% gate. `core` remains opt-in: the test does not
prove all SDK globals and files correct, and the user's >3 GB reproducer remains
unverified. Before considering any default change, validate full-vs-core
diagnostics and navigation across multiple real files/SDKs; any difference
requires full-profile fallback, not silent omission. See the
[diagnostic SDK probe](../reports/2026-09-19-references-diagnostics-core-enums.md).

### R2f — multi-file diagnostic correctness gate (2026-09-19)

The opt-in `core` SDK profile passed exact references and diagnostics in a
second real Photos file (`Routers`: 19 Locations, 8 diagnostics), but failed in
ArkUI-heavy `BottomToolbar`: references remained exact (3 Locations) while
diagnostics grew from 62 to 132, with 70 false unresolved-global errors. The
full profile was independently replayed twice with the same result. The 125
SDK SourceFiles removed by `core` are therefore not safely removable across
these real documents. Production stays `full`; the prior EditorController
35% result is a single-workload observation, not a release gate. Do not expand
`core` by adding only the missing names from this file. The next admissible
implementation needs a conservative SDK-global closure or exact fail-closed
fallback and a wider public LSP differential. See the
[multi-file gate](../reports/2026-09-19-interactive-sdk-core-multifile-gate.md).

### R2g — strict replay differential gate (2026-09-20)

The replay tool's existing `PASS` meant exact references only, so the
`BottomToolbar` 70-error diagnostic regression could appear beside a passing
request. A separate report-level CLI now requires two successful, comparable
real LSP replays and checks both normalized Location arrays and versioned
automatic diagnostics. Missing diagnostics or mismatched workspace/SDK/target
identity fail closed. The fixed real EditorController pair passes both gates;
the fixed BottomToolbar pair passes references but fails diagnostics (62 vs
132). This is a test gate, not a reduced SDK closure or a production default
change. Before any interactive SDK root reduction is promoted, it must pass
this gate across the required real-file/SDK matrix and the final memory gate.

### R2h — static SDK `core` no-go on current main (2026-09-20)

Fresh-process full/core Photos `BottomToolbar` replays on current `main`
`3938181` reproduced the exact 3-reference result but 62 versus 132 normal
diagnostics; the strict gate passed Locations and failed diagnostics. The
125-file diagnostic SDK reduction lowered product peak only from 887,308,288
to 841,830,400 bytes (about 5.1%). All 70 false TS2304 diagnostics name 27
globals provided by 13 omitted component declaration files. A direct SDK AST
inventory found at least 1,353 top-level names present in the installed full
component entry but absent from the four `core` roots. That inventory is a
negative safety check, not a complete dependency analysis or a proposed list
of files to add. The fixed static `core` profile therefore remains **NO-GO**
for production. Next RED must establish a complete, SDK-versioned provider and
semantic-closure boundary with fail-closed `full` fallback; exact public LSP
multi-capability/overlay differentials and the product memory/latency gates
remain mandatory. The original >3 GB reproducer and final 50% gate are still
open. See the [current-main no-go report](../reports/2026-09-20-interactive-sdk-static-core-no-go.md).

### R2i — fail-closed static SDK wrapper equivalence (2026-09-20)

A public LSP RED with all four `core` files present and an extra full-index
global provider reproduced a false TS2304; previously, existence of the four
files alone enabled the reduced profile. The interactive engine now selects
those four files only when `index-full.d.ts` is a declaration-free wrapper
whose complete path-reference set is exactly those four files. All other
shapes fall back to `full`. Public LSP tests cover the extra provider,
equivalent wrapper, unsupported pragma, and missing core file. Fixed Photos
`BottomToolbar` now passes the strict 3-Location/62-diagnostic differential;
its diagnostic SDK Program returns to 573 SourceFiles and product peak to
888,885,248 bytes. This is a correctness guard, **not** the promised memory
optimization. The next working-set RED remains a versioned, semantically
complete *per-project or per-document* SDK provider closure with fail-closed
fallback; the real >3 GB reproducer and final 50% peak gate remain open. See
the [equivalence-guard report](../reports/2026-09-20-interactive-sdk-core-equivalence-guard.md).

### R2j — paired Photos identity working-set result (2026-09-20)

Three fresh-process legacy/identity pairs on the fixed Photos
`BottomToolbar` exported arrow-function use returned the same three exact
Locations and 62 normal diagnostics. Keeping the verifier SDK full and batch
size at default, the opt-in identity dependency profile reduced verifier
project files from the default closure's 323 to 2 (302 SDK files). Legacy
versus identity median product peak was 885,018,624 versus 587,530,240 bytes
(-33.6%), and request time was 7.539 versus 2.966 seconds. A ten-repeat plus
unsaved-edit control returned identical Locations and version-2 diagnostics
without observed linear accumulation. A separate current-document diagnostic
root trial shrank the diagnostic Program from 1,819 to 826 files but left the
legacy references peak near 889 MB: one enlarged references Program had
already paid the cost. This real symbol passes the 30% prototype gate but
fails the final 50% peak gate and is not the user's >3 GB reproducer.
Production remains `legacy`/`closure`/full SDK. Next work should bound the
remaining 323-project/503-SDK normal diagnostic context with a complete
semantic closure proof, not just shrink explicit roots. See the
[matched real-project report](../reports/2026-09-20-photos-bottomtoolbar-identity-working-set.md).

### R2k — interactive roots with identity: transitive-closure no-go (2026-09-20)

Three paired fresh-process Photos `BottomToolbar` identity replays changed only
the experimental interactive project-root profile. Explicit diagnostic project
roots fell from 256 to one, but compiler-followed imports rebuilt exactly the
same 323-project/503-SDK SourceFile Program. Median product peak was
584,921,088 bytes at default roots versus 581,857,280 bytes at current roots
(a 0.52% difference, within run variation). All six runs returned three exact
Locations and 62 exact versioned automatic diagnostics. The reference interval
itself peaked at a 491,417,600-byte median before the later diagnostic peak;
this is already above half of the matched legacy median (442,509,312 bytes).
Consequently, diagnostic-root-only work cannot meet this case's final 50%
memory gate, even if its later peak were removed. The next RED must quantify
and bound both verifier SDK/setup cost and the interactive document's complete
transitive project/SDK closure; merely reducing `getScriptFileNames()` roots
or adding file-specific SDK globals is not an admissible production fix.
Production defaults remain unchanged; the original >3 GB reproducer and final
release gate remain open. See the [root-profile no-go report](../reports/2026-09-20-photos-interactive-roots-with-identity-no-go.md).
