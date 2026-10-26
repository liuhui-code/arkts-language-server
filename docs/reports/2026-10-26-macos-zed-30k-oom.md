# Mac Zed 30K Photos：OOM 现场与隔离诊断

日期：2026-10-26。现场发生于 2026-10-25 22:30–22:32（UTC+08）。

用户场景：Zed 的 ArkTS 扩展打开 `/Users/liuhui/Documents/code/applications_photos_30k`，连续点击跳转，随后卡住并出现 JavaScript heap OOM。

本轮完成现场日志保存、实际安装包核对、隔离副本上的真实 stdio LSP 对照和一个运行时假设验证。**未修改产品代码、SDK、真实项目或日常 Zed 安装；没有提交、合并或发布。** 缓存性能 TODO 保持暂停。455 文件冷目录 3 秒门槛与本轮无关，未重启该优化路线。

证据根目录：`.bench/zed-30k-oom-20261025/`。下文证据路径均相对此目录；逐次结构化汇总为 `analysis-summary.json`，小型证据文件校验和为 `evidence-manifest.json`。

## 结论与证明范围

1. **现场是语言服务器 PID 61048 的 V8 堆 OOM。** 用户提供的 GC 记录显示约 4088 MB 使用量，最后一次 Mark-Compact 用时 1779.89ms，仅回收到约 4081.8 MB，随后 fatal。它不是 Zed 自身 113MiB RSS 的记录。最后一条 `definition=2.33ms, outcome=ok` 不能证明后续查询、返回位置或内存状态正常。
2. **该现场运行的是旧的主线程 LegacySemanticEngine 包。** 实际安装的 bundle 直接创建 LegacySemanticEngine，没有 semantic-worker.cjs。不能将这一次现场直接解释为新版本反复创建 Semantic Worker。
3. **已复现一个与现场相符的 OOM 机制：空定义结果后，查引用把入口扩大并触发宽范围 Program 构建。** 匹配文件/位置连续 33 次定义都返回空数组；之后一次 references 将项目入口从 1 个扩大到 4333 个，在 Program 尚未返回时发生 SIGABRT / heap OOM。现场日志确实有未完成的 references id 71，但没有原始完整 LSP 请求和 heap snapshot，不能声称已经唯一证明原现场的全部保留对象及触发请求。
4. **当前工作区候选同样没有通过这个 30K 项目。** 初始化因 20,000 文件成员上限而 degraded；随后跳转会带上不完整初始化留下的入口。在带观察的默认堆运行中，30 秒监督截止时间生效；无观察插桩运行则在跳转返回前达到外部诊断 RSS 上限。不能宣称升级候选即可解决。
5. **候选的一个具体放大点得到隔离对照支持。** 仅在诊断子进程内绕开“不完整 membership 的初始化根上下文预装载”，同一跳转入口从 281 个项目文件降到 87 个，Program 正常返回，定义有 1 个位置，3892.139ms，采样 Node RSS 峰值 416.551MiB。此运行仍因成员不完整而不能返回完整 references，**不是正式修复或 30K 验收通过**。

没有在 4GiB 上限下再次强行重现现场崩溃。旧包的故障复现使用 512MiB old-space；候选默认堆实验由外部父进程限制 Node RSS 和运行时长。这些限制及故障样本均保留，不能与生产默认条件下的成功性能数据混用。

## 环境、代码和项目口径

环境详情与 SHA-256：`environment.json`、`installed-artifact.json`、`capture.json`。

| 项目 | 实际值 |
| --- | --- |
| Mac | macOS 26.6.2 / 25G83，x86_64，物理内存 16GiB |
| Zed | 1.23.3，bundle version 20261012.135353 |
| 原现场 Node | 原进程已退出；启动器使用 PATH 上的 node，精确版本未测 |
| 本轮隔离 Node | v26.3.0，`/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node` |
| 现场 SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`；API 24，component 6.1.1.125，metadata identified |
| SDK 声明完整性 | 本轮未认证；metadata identified 不等于所有声明可用 |
| 现场安装包 | `~/.local/libexec/arkts-language-server/0.1.0-local-beta.1-9a63187c155725582906a2be2466eaba11e462a6a9d7c4505ae11de5365cb777/`；后缀是制品标识，不能当成 Git revision |
| 现场 server.cjs | 10,804,709 bytes；SHA `aec84852a95e933c7069a01c5c88fedac48f286b78742ca688bf5017d12594e0`；bundled TypeScript 5.9.2 |
| 候选源码 | branch `fix/windows-path-identity-20261022`；parent `e35459131366a32c48c10d1d74adef74357cd3dc`，包含原有未提交工作 |
| 候选 server.cjs | SHA `88797005140b102fd0120dbfc65ae540415ee94f0bd64011f682386b62fd2058` |
| 候选 semantic-worker.cjs | SHA `302a6fbe24a803378c9b3eea2982e94e79f1cc259db2b8bff549084b04c0d077`；bundled ohos-typescript 4.9.5-r10 |

Zed 原始启动记录在 `zed.log:3518`：扩展启动器为 `~/Library/Application Support/Zed/extensions/work/arkts/bin/arkts-language-server`，cwd 为真实 30K 项目，参数 `--stdio`。启动器最终指向上表旧包。本轮没有覆盖这个启动器。

真实夹具共有 **30,000 个 .ts/.ets 文件，173,645,329 UTF-8 bytes（约 165.6MiB）**：原始 288 文件占 1,602,713 bytes，29,712 个复制文件占 172,042,616 bytes；不是 30K 空文件。生成清单记录 Photos revision `a2c993829c46d965abefc5d2143187fa54fa4604`，复制时重写相对 import，保留包 import。大量独立 barrel 入口也被复制，因此它不能等同于任意真实 30K 项目的依赖结构。

`project-size.json`、`isolated-projects.json` 保存规模信息。APFS 克隆位于 `project-30k/`；`project-288/` 仅去掉 `__copy_NNN` 源码。诊断完成后逐文件 SHA 对比，30,000 个源码与真实项目内容一致，mismatch=0，见 `project-source-integrity.json`、`project-source-sha256.txt`。真实项目和 SDK 未被编辑。

**磁盘源码数、Program 入口数、实际 SourceFile 数分别记录。** 4333、281、87 是项目入口数；构建未返回时，不将这些数字当成最终 Program 文件数。

## 现场时间线与目标位置

`pid-61048.ndjson` 从保存的 server.log 提取，共 72 条记录。

| UTC | 现场证据 |
| --- | --- |
| 14:30:42.300 | server.started，PID 61048 |
| 14:30:42.316 | lsp.initialized |
| 14:30:42.412 | sdk.selected，实际 DevEco SDK |
| 截至 14:30:50.550 | 69 条 request.completed，最后一条 definition 2.33ms |
| 14:32:36 左右 | Zed 记录不能读取 LSP headers、连接重置、Broken pipe；秒级时间来自 Zed 日志 |

69 条完成记录包括：definition 33 次（中位数 2.03ms、最大 4.01ms）、typeDefinition 23 次、hover 7 次、documentHighlight 3 次、codeAction 3 次。原日志没有记录每次返回的 locations，不能把 outcome=ok 当成正确跳转验证。

连接断开时，Zed 记录未完成的 references id 71、definition ids 80/118，以及 highlight/codeAction 请求。`zed.log:3533–3540` 还记录 `GetReferences { row:76,column:20 }` 和 `GetDefinitions { row:76,column:18 }` 等位置。

只读查询 Zed SQLite 状态找到匹配文件：

```text
product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_002.ets
LSP position = { line: 76, character: 20 }  // 0-based UTF-16
params.filterMediaType = wantParam?.filterMediaType as string;
```

保存状态的时间为 14:59:27 UTC，晚于事故；所以这是**结合文件内容和行列匹配的复现目标**，不是原始 id 71 URI 的直接抓包。证据为 `zed-open-editors.json`。

Zed 1.23.3 的[默认设置源码第 444–448 行](https://github.com/zed-industries/zed/blob/v1.23.3/assets/settings/default.json#L444-L448)明确规定：定义无结果时默认 `go_to_definition_fallback: find_all_references`。检查当前用户 settings.json 没有该项覆盖，项目没有 `.zed/settings.json`。这说明“只点击跳转”也能产生 references；不能据此声称用户主动点过查引用。原始完整 UI 动作与协议对应关系未被录制。

## 旧安装包：真实 LSP 故障对照

以下均显式使用现场 DevEco SDK、Node 26.3.0、独立索引/日志目录、串行请求和 512MiB old-space。原包在主线程执行编译；V8 报告的总 heap limit 包含额外空间，不能把 old-space 参数等同于 RSS 或总堆大小。

| 证据目录 | 操作/结果 | Program 观察 |
| --- | --- | --- |
| `old-real-288-references/` | 288 文件 callback 目标；references 3522.616ms，返回 -32803 不完整，不能称通过 | 86 项目入口；构建返回，观测堆约 330MiB |
| `old-real-30k-open/` | 同 callback 文件打开后观察 12 秒，无查询；正常结束 | 39 项目入口；1 次 Program/1 次 checker 返回；观测堆约 251MiB |
| `old-real-30k-definitions/` | callback 目标 33 次 definition 都有 1 个位置；首次 2030.989ms，重复中位数约 2ms | 同一小 Program，未见每次点击重建 |
| `old-real-30k-references/` | callback 目标一次 references；约 7.318 秒进程 SIGABRT，无结果 | 4372 项目入口的新 Program 未返回 |
| `old-real-picker-references/` | 匹配 Picker 目标一次 references；约 7.207 秒进程 SIGABRT，无结果 | 4333 项目入口，Program 未返回 |
| `old-real-picker-sequence/` | 匹配 Picker 目标先 33 次 definition（全为空），随后一次 references；约 7.011 秒进程 SIGABRT | 初始 1 项目入口 Program 返回；宽范围 4333 项目入口 Program 未返回 |

以上“约 7 秒”是整个子进程实验时长，包括初始化和先行请求，**不是 references 的成功响应时间**。这组是诊断控制，不是多个规模的性能曲线，不能据此推断线性或平方复杂度。

最相关的 `old-real-picker-sequence/`：

- 首次 definition 1882.144ms，后续 32 次都正常返回空数组；没有可用的定义位置。
- 第二次 createProgram 开始时，4334 总入口 = 4333 项目入口 + 1 外部入口；第一份小 Program 已经正常返回。
- 最后记录到 2400 次 Host getScriptSnapshot 调用、2287 个不同请求路径；**这是快照请求数，不是磁盘 read 次数**。
- 截至最后观察，累计完成不同项目 SourceFile 解析 1930 个、项目外 340 个；项目外包括 SDK 和标准库，不能全部称 SDK。集合含第一份小 Program 的解析。
- 最后回调采样 heapUsed=528,928,856 bytes、RSS=649,043,968 bytes；最后可见 parse/snapshot 观察不保证等于崩溃前绝对峰值。
- 第二份 Program 从开始到最后观察已约 3042ms，没有正常返回，也没有进入它的新 checker。不能将其中所有时间拆成已测的“解析百分比”。

`allocation-phases.ndjson`、`program-roots-*.json`、`actions.ndjson`、`protocol.json` 和 `stderr.raw` 保留阶段、入口、完整响应及 fatal 证据。原现场没有 heap snapshot，因此未测 4GiB 中 AST、symbol、字符串、索引候选等各自的保留大小。

早期四个 `old-288-*` / `old-30k-*` 实验继承了测试 helper 的夹具 SDK；发现后已按上述 `old-real-*` 全部重测。早期数据原样保留，**不纳入实际 SDK 结论**。初始 runner 另存为 `run-case-initial-fixture-sdk.mjs`。

## 旧安装包的实际调用链

源码版本以上述旧 server.cjs SHA 为准；这里列的是**已安装制品行号**，不能套用当前源码行号。摘录保存在 `installed-callchain.txt`。

| 安装包位置 | 实际工作 |
| --- | --- |
| server.cjs:230490，runLanguageServer | 直接创建 LegacySemanticEngine，在 LSP 主线程内执行 |
| server.cjs:229737，connection.onReferences | workspace 请求，经 semantic.references 执行 |
| server.cjs:227618，LegacySemanticEngine.references | sync 文档，然后 prepare(..., true)，即包含 workspace 文件 |
| server.cjs:227873，LegacySemanticEngine.prepare | documents.prepare → engines.prepare |
| server.cjs:226739，SemanticDocumentStore.prepareFromCurrent | 收集依赖闭包和项目 membership；文本预装有预算，但 membership 入口另行保留 |
| server.cjs:224016 / 225103–225147 | engine.prepare / updateProjectMembership，将完整 membership 与 SDK roots 组成 Host 文件集合 |
| server.cjs:224984 / 224062 | getScriptFileNames / scriptFileNames 返回这些入口和其他驻留脚本 |
| server.cjs:224635 | engine.references 先调用 service.getDefinitionAtPosition；此时才会同步宽入口 Program，再决定是否有有效锚点 |

因此，定义查不到也可能先为查引用构建大 Program，再返回空结果或失败。文本快照缓存数量上限不约束已经由编译器持有的全部 AST。单次宽 Program 构建就能增长；本次复现不需要“每次点击创建一个新 Worker”的假设。

同步构建占用 LSP 主线程期间，新的点击、取消或 shutdown 不能使正在运行的 JavaScript 自动抢占退出；原现场后续请求没有完成日志与此机制相符，但未逐条量出原现场排队时间。[Node 官方线程文档](https://nodejs.org/api/worker_threads.html)说明了 Worker 的隔离与终止能力；它不是任意项目自动降低编译内存的保证。

## 当前候选：仍然失败，具体放大点可复现

默认堆运行继续使用产品默认截止时间；父进程每 400ms 采样 Node RSS，超过 1536MiB 或 90 秒则终止自己启动的子进程。**外部保护值不是新的产品配置，也不是通过阈值。**

| 证据目录 | 条件 | 真实结果 |
| --- | --- | --- |
| `current-real-30k-guarded/` | 默认堆，Program 观察钩子 | 初始化 2253.915ms，degraded；definition 30122.178ms，-32603；监督器记录 execution-deadline，Worker 重建 1 次；references 3638.857ms，-32803；Node 采样 RSS 峰值 1272.227MiB |
| `current-real-30k-plain-guarded/` | 默认堆，无 compiler/Module 插桩，保留已有 metrics 输出 | 初始化 degraded；definition 尚未返回，约 30.983 秒实验总时长时 Node RSS 1553.398MiB，外部保护 SIGTERM；结果记 diagnostic-stopped，不能记通过，也不是生产 OOM 证明 |
| `current-real-30k-detail-512/` | 512MiB old-space，成员/快照/解析计数 | definition 11839.785ms，-32603；Worker 换代；references -32803；Program 没有正常返回 |
| `current-real-30k-lifetime-512/` | 同上，加父线程 Worker error/exit 记录 | definition 11554.025ms，-32603；明确记录 `ERR_WORKER_OUT_OF_MEMORY`，旧 Worker exit=1；随后受控创建第二代，references -32803；Node 主进程 shutdown/exit=0 |

`run-current.mjs` 最初的 `status=completed` 只表示驱动流程结束；上表前一运行实际有 RPC error。`summarize.py` 按真实响应另列 `semanticStatus=semantic-failed`，没有把失败样本剔除。

默认堆带观察运行中的监督器状态为：phase=program，programStarts=1、programReturns=0、checkerStarts=0、checkerReturns=0、synchronizationStarts=1、synchronizationReturns=0。它提供了真正的阶段证据，不能把未返回解释成已经证明死循环。低堆实验记录到不断解析不同文件，支持输入展开造成的工作量和内存增长。

成员扫描实际留下 20,000 paths、3,217,452 路径 bytes，status=partial，reason=path-count-limit。不是 SDK metadata 失败，也不是恰好达到路径字节预算。已有 Worker metrics 同样记录 projectFiles=20000；这个数字是 store membership，**不是实际 Program SourceFile 数**。

候选相关调用链，以本报告 parent 和工作区制品 SHA 为准：

| 当前源文件/行号 | 作用 |
| --- | --- |
| `src/core/workspace/document-store.ts:32`、`:1122` | 默认 20,000 成员上限；超过后 partial/path-count-limit |
| `src/core/workspace/document-store.ts:820` | prepareRoot 选排序首个项目文件，以 includeWorkspaceFiles=true 预装文本 |
| `src/semantic/project-readiness.ts:30` | prepareRoot 后仍进入 engines.semanticReadiness |
| `src/core/types/type-engine.ts:441` | queryWorkspaceReadiness 的 prepare 回调调用 this.prepare(workspace) |
| `src/core/types/typescript-language-service.ts:285` | prepare 将初始化 workspace.documents 装进根级 engine.scripts |
| `src/core/types/typescript-semantic-readiness.ts:143` | membership 不完整才返回 degraded；返回点晚于上述 engine 预装 |
| `src/core/types/semantic-groups.ts:64` | membership 不完整时 all() 不产生语义组 |
| `src/core/types/type-engine.ts:185` | select 没有合法 group 时交互请求回退根级上下文 |
| `src/core/types/typescript-host-file-names.ts:9`、`:19` | 无显式 semantic roots 且 membership 不完整时，驻留脚本成为 Host extras |
| `src/core/types/typescript-language-service.ts:372`、`:1666` | scriptFileNames / getScriptFileNames 把上述入口交给编译器 |

在同一跳转中实际观测：283 总入口 = 281 项目入口 + 2 外部入口；项目入口含 109 个 CommonComponents、35 个 index，大多是初始化预装留下的复制 barrel。低堆构建返回前已完成至少 2767 个不同项目 SourceFile、133 个项目外 SourceFile 的解析，快照请求至少 2900 次。剩余依赖和最终 Program 文件数未测。

这揭示的是**不完整初始化的入口集合进入了交互 Program**；“有文档缓存上限”或“有 Worker”均不能自行保证依赖展开后的构建规模有界。

## 单变量假设验证：只绕开不完整初始化的根上下文预装

证据目录 `counterfactual-no-partial-root-preload/`。相同隔离项目、SDK、目标位置、Node、512MiB old-space 和观察钩子；唯一语义变化是在**诊断加载副本**的 prepareProjectReadiness 内，当 workspace membership 不完整时提前返回同一 `project-membership-incomplete`，不调用 engine 初始化。没有删除 membership 校验，也没有把 degraded 改成 READY。

| 观察 | 原候选低堆运行 | 诊断对照 |
| --- | --- | --- |
| 成员集合 | partial，20000 | partial，20000 |
| 项目入口 | 281 | 87 |
| Program | 开始 1 次，返回 0 次 | 开始 1 次，返回 1 次 |
| 实际 SourceFile | 未返回；已解析至少 2767 项目 + 133 项目外 | getSourceFiles 返回 482；独立解析计数为 87 项目 + 395 项目外，未另存返回列表的分类 |
| 同一 definition | Worker 不可用，失败 | 3892.139ms，返回 1 个定义 |
| Program 区间 | 未完成 | 3315ms；与 definition 总时间重叠，不能重复相加 |
| 采样 Node RSS 峰值 | lifetime 运行 719.414MiB，且 Worker OOM | 416.551MiB |
| references | -32803 | 63.966ms，仍为 -32803；没有完整引用结果 |

这是单轮诊断因果对照，未做多轮性能验收，不能将上述比值推广成优化收益承诺。提前返回也改变了 SDK owner 创建和预解析的时机，因此该改动只用于验证入口放大假设；不能直接作为满足 SDK 初始化要求的完整修复。它定位了修复方向，**没有把诊断钩子当成产品补丁**。

## 内存、资源和未测项

Node 的 RSS 统计包含同进程的主线程与 Worker 共享进程内存，取单个进程值一次；不能按 Worker 数再次求和。heapUsed 在 Worker 内采样时属于该 isolate，在主线程 request.completed 中则属于主 isolate；所以日志中的主线程约 11MiB heapUsed 不能用来反驳 Worker OOM。[Node 官方文档](https://nodejs.org/api/worker_threads.html)给出了 Worker 内存统计口径。

本轮当前候选的外部峰值是 **Node 进程 RSS 的 400ms 采样最大值**，不含原生索引进程，也不保证捕获采样间瞬时峰值。旧包数据是函数/定时器内观察，主线程被同步工作阻塞时定时器不能持续采样。这些值不能充当“整个语言服务器进程组内存峰值”。原生索引内存、原现场分阶段内存、真实磁盘读次数、4GiB 堆保留对象分布、全部请求的独占阶段百分比均未测。

`process-cleanup-audit.json` 显示本轮 15 个诊断 Node PID 均已退出，未发现 cwd 属于隔离夹具的遗留原生索引进程。用户 Zed 和其他服务没有被终止。低堆 lifetime 运行的第二代 Worker 在会话正常关闭时 exit=1，不与第一代的 `ERR_WORKER_OUT_OF_MEMORY` 混为一个失败。

## 修复优先级与必要回归

1. **先隔离 partial 初始化上下文与交互 Program 根集合。** 保留 SDK 的共享预解析职责，不把预装的无关项目 barrel 转成交互入口；保留成员完整性与 SDK 校验，仍如实报告 degraded。上面的运行时对照给出具体修复位置，但正式产品修改需要新增公开 framed-stdio LSP 的 RED→GREEN 回归，覆盖 SDK 初始化仍执行、初始化 partial、后续同会话定义、编辑、配置恢复及完整引用失败合同。当前 3892ms 仍超过 500ms，不能称性能目标已达成。
2. **单独处理 30K 成员表示与实际语义组规模。** 20,000 硬上限导致完整 references 不可用；简单提高常量可能使完整初始化构建更多 Program。需要在依赖闭包、有效 Program 文件数和 AST 内存预算上验证，不能只按物理文件数或 1024 入口个数推断有界。本轮不扩展成缓存性能优化，也不移除完整性合同。
3. **将本现场的 Zed 请求组合加入真实验收。** 覆盖 definition 空结果→Zed fallback references→用户继续点击→取消/超时/关闭，记录实际安装制品 SHA、响应 payload、Worker 代际和原生索引独立内存。验证完候选后再安装，不能只依赖此前 288 文件 Windows Photos 或仓库 fixture 通过。

未宣称已经排除全部内存泄漏；本次有可观察的单次 Program 依赖展开机制和候选初始化入口放大机制，无需假设无限重建即可产生失败。原现场精确请求归属、4GiB heap retainers 和完整 UI 点击重放仍是证据边界。

## 复现与证据入口

从仓库根目录执行；使用新的 tag，runner 拒绝覆盖已有证据。旧包实验有意使用小堆，会以非零退出保存故障。

```sh
node .bench/zed-30k-oom-20261025/run-case.mjs 30k sequence fresh-old-picker picker
node .bench/zed-30k-oom-20261025/run-case.mjs 30k definitions fresh-old-callback callback
python3 .bench/zed-30k-oom-20261025/summarize.py
```

候选各 runner 的输出目录固定；重跑前复制 runner 并换一个新的输出目录，不删除原始目录：

- `run-current.mjs` / `current-probe.cjs`：默认堆、Program 观察、外部保护。
- `run-current-plain.mjs`：同条件无 compiler/Module 观察插桩。
- `run-current-detail.mjs` / `current-detailed-probe.cjs`：低堆、成员和解析计数。
- `run-current-lifetime.mjs` / `current-lifetime-probe.cjs`：低堆并记录真实 Worker error/exit。
- `run-counterfactual.mjs` / `counterfactual-no-partial-root-preload.cjs`：假设验证；禁止作为生产修复或验收运行。

所有 probe 只在独立子进程中修改被加载模块的内存副本，保留返回值；安装包和 dist 文件没有被覆盖。观测插桩的时延不得替代普通计时。对照结果也说明不同运行的 CPU/GC/索引并发会影响耗时，未用单轮时差作精确归因。

原始现场：`capture.json`、`server.log`、`server.log.1`、`zed.log`、`pid-61048.ndjson`、`user-oom-excerpt.txt`。逐次 LSP：每个运行目录下的 `protocol.json`、`actions.ndjson`、`result.json`、`stderr.raw`。字段解释和错误状态归一化：`summarize.py`、`analysis-summary.json`。

本轮产品输入与上一轮完整检查时的 747 文件冻结清单仍一致（changed=0）；没有为诊断文档重跑 55 分钟的 pnpm check:fast，也没有把此前 2039/2039 的结果当成当前 30K 场景通过。
