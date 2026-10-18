# 执行摘要

当前 ArkTS 主干已切换为“长期驻留 Language Service 优先”方案，但实际查询路径仍包含多处重复验证与全量检查开销，导致冷查询时延依旧未达标。为避免继续沿错误成本中心投入，建议**对现有路径逐项归因优化**：首先对照 **(A) 纯官方 tsserver、(B) 当前 ArkTS 引擎、(C) 完整 ArkTS LSP、(D) Zed 客户端** 四种方案测量延迟和资源，确认真正瓶颈；然后逐步调整路由优先级和重复检查。规划中应以**500ms P95**为分界，而非当前“秒级”。对比 TypeScript 官方设计（语言服务对象应为“长期 Program/上下文”）和 clangd 索引经验（文件动态索引确保已打开文件的引用可查），修复方案应聚焦**充分复用热上下文而非继续增加侧索引**。若各项优化后仍达不到要求，再重新评估更深层架构。总之：**优先量化问题和减少重复验证，再扩展架构**。

# 仓库基线

- **当前 HEAD：** `a111235b`（含 PR #95 改进驻留查询）。
- **关键 PR：** #93（诊断等待、IO 优化）、#94（资源回收策略）、#95（Resident LS 启用）。
- **生效 ADR：** ADR 0014（Budgeted Long-Lived Session）、ADR 0015（六项默认策略）。目前 **ADR 0003** 仅作为 fallback，不再作为常规路径。
- **Feature Ledger：** 已包括 R-30（长期驻留会话）、R-31（增量刷新）、R-32（成本感知回收）等条目，保持 R-14（持久语义索引）为挂起研究状态。

上述 ADR/Feature Ledger 说明了主流架构方向与门槛：**LRU/事务堆长驻留**、**内存预算约束**、**500ms 目标**，以及严格的正确性回退保障。

# 关键模块审查清单

对照上层逻辑，我们需重点审查以下模块与接口：

- **请求路由（`semantic/semantic-worker-proxy.ts`）：** 检查请求如何在“完整答案缓存 → candidate 规划 → resident 查找 → fallback Worker”之间分流。关注`residentReferences()`调用时机，是否提前绕过了不必要的 candidate 步骤。

- **Resident 签入逻辑（`core/typescript-resident-reference-state.ts`）：** 审核 `admit()` 中的验证规则，包括对`loadedConfiguration`、文件列表的全盘检查，以及对每个`diskIdentity`的 I/O 操作。特别注意文件系统调用（`fs.stat`/`realpath`等）是否过于频繁。

- **ScriptSnapshot 用法（`core/typescript-language-service.ts`等）：** 确认编辑时的增量逻辑。TypeScript 正式文档指出，`ScriptSnapshot.fromString()`仅适用于不做增量解析的情况；否则应提供前后版本差异。检查主机是否实际使用差异 range 而非单纯字符串全量快照。

- **诊断协作（`lsp/register-capabilities.ts` 等）：** 审查 `suspendDiagnostics()/resumeDiagnostics()` 的使用场景。未命中缓存的语义请求会阻塞正在进行的诊断；需量化这种等待对响应的影响，并考虑是否应调整优先级或取消策略。

- **Trim/Evict 实现（`types/language-service/baseSessionCache.ts` 等）：** 检查 L2/L3 阶段的`trim()`逻辑。当前实现通过完全销毁 LanguageService 对象来回收内存（而非仅清理缓存），这意味着**驻留上下文会被迫重建**。确认回收触发条件和回建成本，避免因阈值触及导致完整重建循环。

- **LanguageService 重建路径（`types/language-service/type-engine.ts`）：** 分析何时销毁/创建 LS。检查 `typeContextResetReason` 的触发条件（SDK/编译选项变化、overlay 切换等），以及在普通编辑中上下文是否频繁失效。

- **Worker Fallback 路由（`types/semantic/semantic-worker-proxy.ts`）：** 在所有可复用场景失败后如何切换到多批次 Worker。审视 Worker 的资源预热成本与创建频率，确认 fallback 仅在必要时使用。

- **Semantic Readiness 钩子（`semantic-readiness.ts` 等）：** 检查“根语义准备”状态的更新逻辑。是否将完成准备与可用查询混淆，例如在普通查询后误触发全工程检查，增加额外延迟。

- **Zed 客户端接线：** 确认 Zed 启动后是否自动发起 `arkts/semanticReadiness` 等请求来完成语义准备；是否在打开工作区时展示准备进度，避免用户误以为“索引完即就绪”。

# 指标与实验对照

为量化各阶段性能，应设计 A/B/C/D 对比实验，至少包括：**纯 TS Language Service**（纯官方 tsserver 环境，代表理想增量性能）、**ArkTS 驻留引擎**（当前进程内 LS），**完整 ArkTS LSP**（考虑诊断等待与扩展）和**Zed 客户端场景**。关键衡量指标及测试命令示例：

- **响应延迟（Latency）：** 记录请求到完整结果的时间。对比项目同一快照下对新符号（第一次查询）和编辑后的首次查询。建议命令：
  - *A* (TS): 运行 `tsserver` 命令行或 Node 脚本执行 `findReferences`/`findDefinition`；
  - *B* (ArkTS resident): 在 ArkTS IDE 引擎中直接调用对应接口；
  - *C* (ArkTS fallback): 在语义 Worker 模式下执行同样查询（模拟未命中驻留）；
  - *D* (Zed): 在 Zed 编辑器环境中触发相同查询并记录时延。

- **重复查询性能：** 在连续两次同一查询（相同快照）中测量时间，验证缓存效果。对比 ArkTS 完全缓存命中情况的几毫秒响应。

- **内存占用（RSS/Heap）：** 在查询不同阶段采样过程内存（建议 50ms 采样间隔），包括首次准备峰值和 steady-state。命令：`process.memoryUsage()` 或外部 `ps`。

- **磁盘 I/O 操作数：** 统计 `admit()` 或 LS 执行过程中的文件操作调用次数。可注入钩子计数 `fs.stat` 等调用，用于验证重复扫描。

- **编译器准备次数：** 对比开启长期驻留前后 `createProgram()` 触发频率。可使用 ArkTS 日志或增加钩子记录每次 TypeScript Program 构建。

表格示例如下（指标值为示意）：

| 场景            | P95 延迟 (ms) | 内存占用 (MB) | 采样间隔 | 样本数量 |
| --------------- | ------------:| ------------:| --------:| --------:|
| Cold References (ArkTS LSP) | 4,000–5,000 | ~1080    | 50 ms    | 100      |
| Warm References (resident)   |  500–600   | ~980     | 50 ms    | 100      |
| Definitions/Implementations  |  200–300   | ~970     | 50 ms    | 100      |
| Repeated (cache hit)         |    1–5     | ~970     | 50 ms    | 1000     |

具体数值需通过上述对照实验测量。延迟预算建议：**首次准备允许较长延时（记录以供改进）**，但索引完成后新符号或编辑查询应争取 P95 ≤500ms；内存预算沿用现有门限（≈1GB，或视设备环境再调整）。

# 已发现问题清单

基于代码审查和现有回放数据，初步发现的问题包括（按严重度和可重现性排序）：

| 严重度 | 问题描述 | 代码位置 | 修复方向（示例） | 影响/回归测试 |
| :----: | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 高 | **未充分使用驻留会话：** 请求路由在进入 **代候选索引** 后才调用 `residentReferences()`，浪费了在上下文已就绪时本可直接查询的机会。 | `semantic/semantic-worker-proxy.ts`（约 L180-L210） | 交换逻辑：首先检查 `residentReferences()` 命中，再执行 candidate 规划。 | 保证重构后，resident 命中场景结果与旧逻辑一致；验证再次执行 definition/query。 |
| 高 | **文件系统重复扫描：** `TypeScriptResidentReferenceState.admit()` 对每个上下文调用多次 `fs.stat`/`fs.realpath`，且 `residentReferences()` 前后各调用一次 `admit()`，导致 I/O 开销显著。 | `core/typescript-resident-reference-state.ts`（`admit()` 方法，约 L80-L130） | 合并等价检查：缓存已验证的项目配置，避免同一请求内前后重复扫描；只对文件变化的情况触发检查。 | 确认修改后未漏掉配置变更或新增依赖；引入极端文件替换场景测试回归。 |
| 中 | **缺乏增量解析：** Host 使用 `ts.ScriptSnapshot.fromString()`，未提供前后变化范围；编辑时可能重解析整个文件。 | `core/typescript-language-service.ts`（Host `getScriptSnapshot` 实现） | 实现版本化 Snapshot：记录上次版本，调用 `getChangeRange()` 以供增量解析。 | 使用在大型文件中插入/删除代码的用例，检查是否只重解析增量部分；验证解析结果与无增量一致。 |
| 中 | **请求中包含诊断等待：** 未命中缓存的查询在调用语义前会 `await suspendDiagnostics()`，必然等待后台诊断结束，延长响应。 | `lsp/register-reference-capability.ts`（`executeCommand` 或类似，约 L100-L130） | 延迟诊断优先级：仅在特别需要时暂停诊断；或让查询先路由/并发处理。 | 观测诊断静默场景（大量未保存编辑后），验证对诊断内容完整性不影响，仅优化用户感知延迟。 |
| 中 | **编辑后重置过度：** 默认“内容变化”会销毁上下文，导致小改动后也要重新建立 LS。 | `core/typescript-type-engine.ts`（`typeContextResetReason` 逻辑） | 精细区分失效：仅在影响入口签名或模块边界变更时销毁，否则尝试增量更新。 | 验证简单函数体修改后能保持同一 LS；测试变量/类型签名改动的正当失效。 |
| 低 | **Trim 实现不当：** `context.trim()` 实际新建 LS 而非清理缓存，**歪曲“保留上下文”语义**。 | `types/language-service/baseSessionCache.ts`（`recycleOfficialSemanticService`） | 明确 `trim()` 行为：只清除缓存数据，而 LS 保持。仅在内存紧张到无法维持基本数据时才销毁 LS。 | 长时间运行压力测试，确保 trim 后语义结果一致；检查潜在内存泄漏。 |
| 低 | **根语义验证钩子问题：** 在普通查询路径末尾触发的语义准备可能做多余全局检查（如全部文件 `getSemanticDiagnostics`），增加不必要延迟。 | `semantic/semantic-readiness.ts`（`afterQuery` 调用，约 L50-L70） | 分离作用域：将“完整准备”仅绑定到显式准备阶段。普通查询应仅验证当前查询所需依赖，不再强制遍历全项目。 | 增加单文件依赖变更场景，确认不再触发全局检查；通过完整结果 oracle 比对正确性。 |
| 低 | **Zed 启动未触发语义准备：** 编辑器中未开启自动发送 semanticReadiness 请求，可能导致用户误认为索引完成即可查询。 | Zed 扩展代码 (`editors/zed/...`) | 在 `onInitialized` 或 `workspace/didOpen` 回调中加入 `arkts/semanticReadiness` 请求，同时显示进度指示。 | 手动测试：在新环境中打开 Settings 项目，确保等待环节可视化且可取消。 |

每个问题都需通过对比实验验证影响范围，并制定对应的回归测试用例（包括边界输入和失败场景）。上述修复多为局部改动（大部分文件/函数范围），预估实现工时：**高**（多模块、严格验证）或**中**（单一模块重构）不等。

# 修复建议与 ADR 更新

针对以上问题，建议执行以下具体修改，并相应更新架构文档：

- **修复路由优先级**：调整 `semantic-worker-proxy.ts` 中逻辑，使 `residentReferences()` 成为首选路径。此变更实现难度中等，需确保回退路径完全保留。相应 ADR 0003 可更新描述为“只有在无需/无法驻留时才进入多批次 Worker”，确保文档一致。

- **合并重验证**：改造 `TypeScriptResidentReferenceState.admit()`，缓存项目指纹并合并请求中重复校验。增加单元测试模拟配置更改、文件增删场景。该改动难度中等，需要注意不破坏现有的安全性边界（ADR 0005 保持 conservative）。

- **增量解析**：实现支持 `ScriptSnapshot.getChangeRange()` 的增量解析 Host（替换 `fromString()`）。由于涉及 TypeScript 编译器 API，需验证所有编辑场景下的语义等价性。此改动难度偏高，但 TS 官方文档明确鼓励使用增量。

- **调整诊断协同**：修改 LSP 服务注册逻辑，避免每次语义查询前阻塞所有诊断。可按优先级序列化或并行处理。注意测试诊断完整性（语法错误、类型错误）是否受影响，保证仅提升用户感知。

- **改进编辑失效规则**：在 `typeContextResetReason` 中细分失效条件，仅在公共 API 改变时重新生成环境。使用 SourceFile 和 ProjectGraph 的增量映射来支持该功能。变更难度中等，需重新考虑编辑器 overlay 行为。

- **明确 SessionCache 语义**：将 `trim()` 实现改为“清理缓存数据”而非销毁 LS，或如有 bug 必重建则在注释中明确。更新 ADR/Feature Ledger 中对“长期驻留”条目的描述，区别“清理内存”与“销毁会话”。新增 ADR 提案：**ADR 0016：驻留会话优先**、**ADR 0017：请求内核验复用**、**ADR 0018：准备与查询分离**，分别记录上述决策要点和限制条件。

每项修改完成后，都需进行与旧逻辑的**差分验证**：即使性能提升也不能破坏正确性，可使用下面提到的“三进程 diff”脚本框架对照原生结果。

# 执行计划

## 短期（OP-00..OP-06）

首先分切片逐步验证并修复，避免一次性大改：

- **OP-00：基线归因实验。** 对比 A/B/C/D 四种环境下的延迟和内存：纯 tsserver、ArkTS 驻留、ArkTS 完整 LSP、Zed。定位主耗时阶段。**验收**：完整数据表明热路径与候选路径的耗时占比，为下一步定向提供依据。

- **OP-01：路由优先优化。** 按上文修复路由逻辑，将 `residentReferences()` 提前。**验收**：在含有完整热 LS 的场景中，新符号查询 P95 明显下降（目标如 <300ms），结果仍与老逻辑一致。若问题未改善，则回退。

- **OP-02：合并重复核验。** 调整 `admit()` 减少同一请求的重复 I/O 调用。**验收**：监控每次查询的文件 I/O 调用数应显著降低，内存占用曲线更平滑，无误报漏报。

- **OP-03：完善就绪与诊断流程。** 确保编辑器启动时自动调用语义准备，不让普通查询等待全局检查。尝试改进诊断 suspend 策略。**验收**：新打开后首次查询不再卡在“等待索引完成”，普通定义查询延迟减少且诊断输出正确。

- **OP-04：增量更新测试。**  实现版本化 `ScriptSnapshot`，在多次编辑链路上衡量效果。**验收**：小范围编辑后查询延迟相比重启之前有合理提升；检测更新正确性。

- **OP-05：资源承载分析。** 在开发机规格下连续运行热查询，记录稳定 RSS。评估是否需要调整预算。**验收**：确认常驻上下文峰值内存及回收后的恢复成本，若必需，提出项目拆分或声明边界方案。

- **OP-06：验收测试与迭代**。在真实 Settings 等用例上进行循环问答测试（≥100 次），综合评估 P95/超时率和正确性。**验收**：测试结果需满足各场景 P95 ≤550ms，正确率100%，内存在门限内。否则根据观察继续回退优化。

每个阶段完成一个 PR，同时更新对应 ADR/Feature 条目状态。禁止**一次性大规模 PR**；每一小修都应回归测试并打版本标签以便可回退。

## 中期（L01..L04）

在短期优化稳定后，继续更系统的改进：

- **L01：常驻 LS 基线稳定。** 确立长期驻留方案的可行性。衡量在多次查询后驻留上下文是否保持、响应是否持续稳定。

- **L02：增量维护和并发。** 全面支持多种编辑场景的局部失效和语义增量更新，避免全工程重建。实现增量 DocumentAuthority 和 ProjectGraph 失效传播。

- **L03：内存/生命周期策略。** 制定成熟的冷/暖 LRU 策略，让真正“冷”掉的上下文可回收，热上下文保留。调整内存门槛以容纳目标项目，或明确项目边界。

- **L04：能耗与并行。** 分析是否需引入后台索引或多线程等机制，在保持内存预算下进一步加速候选选择。**注意：** 此阶段不盲目实施复杂索引策略，优先保证已有路径的延迟可控。

以上中期任务同样需拆成可测 PR。**优先级由验收测试结果驱动**；若 L01/L02 改善有限，再评估是否启动更深入的方案（例如项目拆分）。

# 模型执行入口与自动化脚本

交由自动化模型执行时，请按以下指导操作：

- **环境准备：** 准备 Settings 真实工程源码（同平台、SDK、依赖）。
- **对照测试脚本：** 以下是示例脚本模板，用于三进程结果比对（仅示意，需结合实际启动方式修改）：

```bash
#!/bin/bash
WORKSPACE="/path/to/Settings"
SYMBOL="DialogPage"  # 测试符号
OUTPUT_DIR="./output"
mkdir -p "$OUTPUT_DIR"

# 提取语义事实（extractor）
node extractor.mjs --workspace "$WORKSPACE" --symbol "$SYMBOL" --out "$OUTPUT_DIR/facts.json"

# Consumer 使用持久化事实查询 (无 LS 启动)
node consumer.mjs --workspace "$WORKSPACE" --facts "$OUTPUT_DIR/facts.json" --symbol "$SYMBOL" > "$OUTPUT_DIR/arkts-result.json"

# Oracle: 官方 LS 完整查询 (或 ArkTS 现有 LSP)
node arkts-oracle.mjs --workspace "$WORKSPACE" --symbol "$SYMBOL" > "$OUTPUT_DIR/oracle-result.json"

# 对比结果
diff <(jq -S . "$OUTPUT_DIR/arkts-result.json") <(jq -S . "$OUTPUT_DIR/oracle-result.json") > "$OUTPUT_DIR/diff.txt" || true
```

或可使用 Node 脚本：

```js
// diff-runner.js
const { execSync } = require('child_process');
const WORKSPACE = "/path/to/Settings";
const SYMBOL = "DialogPage";

function run(cmd) { console.log(cmd); execSync(cmd, { stdio: 'inherit' }); }

run(`node extractor.mjs --workspace "${WORKSPACE}" --symbol "${SYMBOL}" --out facts.json`);
run(`node consumer.mjs --workspace "${WORKSPACE}" --facts facts.json --symbol "${SYMBOL}" > arkts-result.json`);
run(`tsserver --project "${WORKSPACE}" --query findReferences "${SYMBOL}" > oracle-result.json`);
run(`diff <(jq -S . arkts-result.json) <(jq -S . oracle-result.json) > diff.txt || true`);
```

- **分层延迟对照：** 类似地，分别在各环境下运行 `findReferences`、`findDefinition`、`getCompletionsAtPosition` 等，记录延时。可使用 `time` 或内置时间测量，并收集内存峰值。

完成后请将结果输出至指定位置，模型可对 `arkts-result.json` 与 `oracle-result.json` 做精确位置比对。

```mermaid
gantt
    title ArkTS 查询性能优化计划
    dateFormat YYYY-MM-DD
    section 基线与归因
    S01: 初始基线测试            :done,    des1, 2026-10-01, 7d
    section 短期迭代
    OP-00: 差异归因实验           :active,  des2, after des1, 3d
    OP-01: 优先使用驻留查询       :         des3, after des2, 5d
    OP-02: 合并重复配置核验       :         des4, after des3, 4d
    OP-03: 完善准备与诊断流程     :         des5, after des4, 5d
    OP-04: 增量解析能力测试       :         des6, after des5, 7d
    OP-05: 内存承载与策略分析     :         des7, after des6, 7d
    OP-06: 验收测试               :         des8, after des7, 4d
    section 中期规划
    L01: 驻留方案稳定性验证       :         des9, 2026-11-15, 14d
    L02: 增量刷新与失效控制       :         des10, 2026-12-01, 21d
    L03: 内存回收与会话管理       :         des11, 2026-12-22, 21d
    L04: 额外优化评估            :         des12, 2027-01-12, 14d
```

## 关键指标预算

下表列出了各阶段应满足的预算要求（示例）：

| 阶段                | P95 延迟门限  | 内存预算  | 采样间隔 | 测试样本量 |
| ------------------- | ------------:| --------:| --------:| ----------:|
| **准备阶段**        | （无硬时限，仅限内存） | ≤1.2 GB | 100 ms   | 1 次全量 |
| **驻留热查询**      | ≤ 500 ms    | **≤1.0 GB** | 50 ms    | ≥100 次 |
| **编辑后首次查询**  | ≤ 500 ms    | ≤1.1 GB | 50 ms    | ≥100 次 |
| **重复查询（缓存）**| ≤ 50 ms     | ≤1.0 GB | 50 ms    | ≥500 次 |
| **诊断并行**        | —           | ≤1.2 GB | —        | —          |

以上预算针对**整体 ArkTS 进程**（含 Worker 子进程）而非单个线程；采样频率和样本量由现有测试框架（如`replay-references.mjs`）统计，确保结果稳定可靠。任何超出预算的测试都视为未达标。

**参考文献：** ArkTS 相关代码库、ADR 及 S02 性能报告，TypeScript 官方语言服务设计，clangd 索引策略等均作为决策依据。模型执行任务入口和脚本模板见上文示例。
