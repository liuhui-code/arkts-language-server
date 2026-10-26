# Windows 编辑后补全约 4 秒：取消恢复与队列阻塞

日期：2026-10-25。范围：解释[真实 Zed UI 验收](2026-10-25-windows-zed-foreground-acceptance.md)中的慢补全，
增加一次隔离的只读观测运行；本轮没有修改产品代码、重新开启缓存优化或合并发布。

**结论：已有 AST/语义组复用确实生效，但没有完成编辑后补全的端到端性能目标。**
诊断复测中，自动补全的真实客户端取消中断了编译器同步；当前安全恢复路径会退役内部 LanguageService。
后续诊断重新准备 Program/checker，整条诊断任务耗时 3074ms；手动补全继续排在诊断、高亮、定义等任务之后。
一条 3999ms 补全约 95% 在父进程调度队列中等待，发往 Worker 后约 197ms 返回。
不能据此声称仅调整优先级就能达标：若补全先运行，它可能承担取消后的重新构建成本。

## 测量合同与身份

原始普通运行 C 与独立诊断运行分开保留，**不是对原始 4019ms 请求追加了事后插桩**。
两次相同产品产物、同 SDK、同 Photos 提交、同六条真实 UI 编辑流程；后台交错顺序与耗时可以不同。
真实键盘输入、F6 弹窗、Enter 接受、F7 跳转均由私有 Zed UI 执行，没有主动 LSP 重放或故障注入。

| 输入 | 固定身份 |
| --- | --- |
| 候选源码 | 父提交 `e35459131366a32c48c10d1d74adef74357cd3dc` 加既有工作树；不是干净提交 |
| server SHA256 | `483b685c63f9e7d7448957fb07990271b3d3ee42dc585a0259f31fecb9cb3ed5` |
| Worker SHA256 | `7d9d8ff20132b443d7cd084fecd1033c8f730f8edf0aebfcd9be3c31907c2e30` |
| 编译器 | `ohos-typescript@4.9.5-r10`，原始 `typescript.js` SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| 平台 | Windows，Zed 1.25.3，Node 20.19.5；不是 Mac 样本 |
| 项目 | Photos `a2c993829c46d965abefc5d2143187fa54fa4604`，288 个项目源码，git archive 隔离副本 |
| SDK | `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`；partial，缺 userFileManager |
| 运行模式 | 产品语义参数默认；没有清 OS 页缓存；首次/重复不等于冷 OS/答案缓存命中 |

诊断额外打开 `ARKTS_SEMANTIC_QUEUE_TRACE=1`、`ARKTS_REFERENCES_TRACE=1`，
并通过 `NODE_OPTIONS=--require=.../worker-counts.cjs` 在父进程被动记录 Worker 的请求发送、响应和已有共享计数器。
preload 不改变请求、结果、产品分支或编译器算法；同步文件日志仍会引入观测开销，不能把复测值当作无开销产品基准。
实际 createProgram/createTypeChecker 的入口、正常返回计数来自候选中已有的固定编译器观测，
不是从 readiness/observed 标志反推构建次数。

## 原始 4018.623ms：能证明什么

普通运行 C，LSP id11，`ThirdDeleteOperation.ts`：
`common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts`。
选择 0 基 UTF-16 `32:9..17` 的 `callback`，逐字符输入 `cal`，产生版本 1、2、3；
查询版本 3 的 `32:12`，即 `this.cal` 后。计时从 relay 读完请求到读完响应，不包含键盘至像素绘制。

| 相对手动补全请求时间 ms | 真实协议事件 |
| ---: | --- |
| -171.477 / -169.518 / -168.180 | 三次 didChange，输入 c / a / l |
| -171.353 / -169.453 / -167.376 | 自动补全 id5 / 6 / 7 |
| -86.380 | documentHighlight id8 |
| -56.454 / -55.970 | definition id9 / typeDefinition id10 |
| 0 | 手动补全 id11 |
| +0.236 | 客户端取消旧的自动补全 id7 |
| +2843.276 | 高亮 id8 返回 |
| +3498.643 / +3802.117 | 定义 id9 / 类型定义 id10 返回 |
| +4018.618 | 补全 id11 响应帧；relay 的请求起点略早，总计 4018.623ms |

初始化终态日志在该补全请求之前，不能把先前约 33 秒初始化等待计入这 4019ms。
server 自身记录该补全 4012.97ms，约 5.65ms 在其计时区间之外。
普通运行没有记录该请求内部独占阶段，**不能把下节复测的精确比例倒填给原始 id11**。

## 诊断运行：六条逐次结果

操作与原始 C 相同：选择原字段，输入三字符前缀，F6，接受补全还原源码，再 F7。
三文件每轮均打开/关闭，第二轮重开后编辑。全部六条编辑、接受及跳转正确性 PASS。

| 文件/轮次 | LSP id | 原始 C ms | 诊断 RPC ms | 排队 ms | 发给 Worker 至响应 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| ThirdDeleteOperation / 首次 | 9 | 4018.623 | 584.679 | 329.908 | 240.041 |
| PcMainMenuBar / 首次 | 57 | 1200.770 | 1289.843 | 1076.866 | 207.089 |
| RenameMenuOperation / 首次 | 99 | 1249.752 | 3896.608 | 3700.706 | 193.635 |
| ThirdDeleteOperation / 重复 | 137 | 897.435 | 941.559 | 778.242 | 159.285 |
| PcMainMenuBar / 重复 | 184 | 3919.073 | 3999.476 | 3799.583 | 197.404 |
| RenameMenuOperation / 重复 | 226 | 1024.860 | 1080.865 | 889.993 | 188.682 |

两次每项查询目标一致，LSP id 列是诊断运行的 id。原始 C 的逐次 id/参数见其 wire 和 edit-result。
这里排队从 supervisor admission 到父进程调用 Worker.postMessage 前；Worker 区间包含 IPC、Worker 内校验及完整处理，
**不是纯编译器 CPU 时间**。剩余外层处理分别见 `analysis.json`，没有被强行归到解析/磁盘。

重点展开诊断 id184：`feature/editor/src/main/ets/default/view/PcMainMenuBar.ets`，
选择 `36:15..27` 的 `selectedMode`，输入 `sel`，查询版本 7 的 `36:18`。
它是第二轮编辑的手动补全，父进程 traceId184，Worker id92，语义组 contextSequence4。

| 互不重叠区间 | ms | 占 RPC |
| --- | ---: | ---: |
| 入队至调用 postMessage 前 | 3799.583 | 95.002% |
| postMessage 前观测至响应回调观测 | 197.404 | 4.936% |
| 其余外层处理及传输差额，未进一步拆分 | 2.489 | 0.062% |
| 合计 | **3999.476** | **100%** |

现成 queue 日志的 admission-to-sendReturned 是 3799.785ms，结束点在 postMessage 返回之后。
它与 Worker 观测区间重叠 0.202ms，所以上表使用 pre-post 时间点扣除重叠，不直接将两个原始区间相加。
不同进程的 performance.now 起点不混用；队列边界相减均在同一 server 父线程，RPC 时长独立来自 relay。

## 阻塞链：取消后的内部重建被前台请求等待

下面是实际连续执行的 Worker 请求。diagnose 不是客户端发出的独立 LSP 请求，而是编辑触发的后台语义任务。

| Worker id / 操作 | 完整处理 ms | createProgram 开始/正常返回增量 | checker 开始/正常返回增量 |
| --- | ---: | ---: | ---: |
| 86 / 自动补全，client-cancelled | 311.166 | 1 / 0 | 0 / 0 |
| 87 / diagnose | **3074.037** | **1 / 1** | **1 / 1** |
| 88 / documentHighlights | 177.825 | 0 / 0 | 0 / 0 |
| 89 / define | 184.554 | 0 / 0 | 0 / 0 |
| 90 / typeDefinitions | 177.832 | 0 / 0 | 0 / 0 |
| 91 / codeActions | 174.805 | 0 / 0 | 0 / 0 |
| 92 / 手动补全 | 197.404 | 0 / 0 | 0 / 0 |

Worker86 对应同一文件版本 7 的自动补全 LSP157。wire 中有真实 `$/cancelRequest id157`，
先于 -32800 响应；不是把新鲜度错误冒充取消。该任务同步入口增量 1、正常返回 0，Program 入口增量 1、正常返回 0。
这证明同步在构建期间未正常完成；不证明模块解析死循环，也不证明具体哪个 Host 回调耗时。

实际代码在 `recoverable-language-service.ts:65` 的同步 catch 中执行 retire：
失效适配层证据 → dispose 旧 raw LanguageService → 结清 owner 剩余 Registry 租约 → state=empty；
下一次 available 才调用 ts.createLanguageService。**内部 LS 退役由动态失败证据加确定的 catch 调用链确认，
本轮没有另设 raw LS 创建/销毁对象计数器。** 不能把 coordinator 的 newEntry=false 当成 raw LS 未重建。

这是 ADR0020 为避免失败同步提交 lastProjectVersion、Registry 租约残留而加入的安全恢复边界。
不应通过保留已损坏实例、忽略异常或跳过释放来换取速度。
但普通取消也会进入这条恢复路径，其语义状态丢失成本尚未被消除。

Worker87 在手动补全到达约 9ms 后开始，占据约 3074ms；随后四项任务合计约 715ms，才轮到补全。
本轮只有 **1 个 semantic Worker 启动**，没有 Worker 重建、context4 驱逐或内存压力淘汰。
这里的内部 LS 重建与操作系统 Worker 重启是两种不同生命周期。

## 复用到底生效在哪里

| 观测点 | Program 源文件 | 项目 SourceFile 复用 / 首见 | SDK SourceFile 复用 / 首见 | Program/checker |
| --- | ---: | ---: | ---: | --- |
| 取消后的 diagnose87 | 505 | 172 / 2 | 279 / 0 | 新建并正常返回各 1 次 |
| 手动补全92 | 505 | **174 / 0** | **279 / 0** | 沿用上一步，无新增构建 |
| 后续接受补全的版本8诊断 | 505 | 173 / 1 | 279 / 0 | 正常编辑更新 |

505 = 174 个项目文件 + 279 个 SDK 文件 + 52 个其他文件；不是整个 Photos 的 288 个项目源码都进入当前 Program。
rootNames 共 174，其中项目根 173、SDK 根 1；Program 项目文件数与 rootNames 数不能混用。
SourceFile 复用/首见是现有对象身份观测，不是磁盘 readFile 次数，也不是严格的解析调用次数。
它证明共享 AST 复用，不能证明 checker/绑定缓存仍在，也不能把两个首见对象简单等同于只解析两次。

context4 的 grouped compiler-build 指标在取消前为 102.410ms、取消后诊断为 2817.448ms，
随后版本8正常编辑为 102.823ms。该对照支持取消恢复放大成本，但不是严格控制其他条件的多轮因果基准。
**2817.448ms 已包含在 3074.037ms diagnose 整体内，不能相加。**
它来自 fork PerformanceDotting 中名为 createProgram 的 grouped events；不能把整个数值解释为实际 createProgram 函数独占时间，
也不能再与 checker、同步或解析相加。实际函数计数与 grouped 计时分开使用。

补全92自身 `semantic.prepare.complete` 为 6.460ms，newEntry=false、resetReason=null；
readiness certification 为 0.063ms，均包含在 Worker 整体处理内。
不据此断言全部输入校验、读取或文件扫描只有 0.063ms；前后其他 guard 与 I/O 未完整分段。
该样本没有证明答案缓存命中；返回复用 Program 的语义查询与命中最终答案缓存是不同事情。

## 调用链和调度缺口

| 文件 / 当前行 | 函数与相关行为 |
| --- | --- |
| `src/lsp/register-completion.ts:29` | registerCompletionHandlers 的 onCompletion → requests.run → semantic.complete |
| `src/semantic/semantic-worker-supervisor.ts:303` | #pump；常规请求仅一个 active，前一条响应后才派发下一条 |
| `src/semantic/semantic-request-lanes.ts:39` | takeNextSemanticWorkerRequest；diagnose 只能被紧邻的下一项 define/hover/complete 越过一次 |
| `src/semantic/semantic-worker-runtime.ts:95` | message Promise 队列 → dispatch → runWorkerCommand → answerRequest |
| `src/core/types/type-engine.ts:199` | prepare，复用 coordinator context，应用输入增量 |
| `src/core/types/type-engine.ts:239` | withLease → current.engine.complete，并观测 Program 身份/文件数 |
| `src/semantic/backends/ohos-typescript/recoverable-language-service.ts:65` | synchronize → raw service.getProgram；同步异常退役内部服务 |
| 同文件 `:33` / `:51` | retire 释放旧 owner；available 在 empty 后创建新 raw LS |
| `src/semantic/semantic-worker-progress.ts:36` | observeCompilerPhase，分别记录真实 Program/checker/同步调用和正常返回 |
| `scripts/compiler-observation-plugin.mjs:29` | 固定编译器 createProgram/createTypeChecker 入口包装，不改其算法 |
| `src/core/types/compiler-query-timing.ts:29` | grouped compiler 事件采集；与真实函数计数不是同一指标 |

实际待执行队列是 diagnose 后紧跟 documentHighlights，后面还有定义、类型定义、codeActions、手动 complete。
当前调度只看 diagnose 后的第一条非诊断项；遇到 documentHighlights 不继续寻找后面的 complete。
因此“存在 interactive 分类”不等于普通补全始终优先，正在运行的同步编译工作也不会被这个选取函数抢占。
一些预取请求已被 supersede，表中只列实际执行项，不能把全部入队数当作编译执行次数。

## 优先级、未测部分与验收限制

1. 首先处理取消与共享准备工作的生命周期关系：客户端不再需要旧响应，不必天然等同于销毁仍对当前相同输入有用的准备工作。
   应用可恢复同步/受控完成与请求取消分离的方案前，必须保留旧版本结果隔离、失败状态安全恢复和 Registry 租约正确性。
   本报告确认缺口，不在本轮实现，也不建议直接移除现有 catch/retire。
2. 再补前台优先级、重复任务合并与后台任务等待上界。该样本约 715ms 的其他任务等待有调度优化空间，
   但仅换序不能保证消除约 3 秒语义重新准备；需要验证成本是否转移给补全。
3. 对约 197ms Worker 剩余成本，只有在准备/排队主因处理后再细分输入 guard、读取、语义查询及返回。
   本轮没有独占 parse/module resolution/checker CPU 或磁盘读取次数，未测部分不猜测归因。

此前两轮证明的是部分增量复用与恢复正确性，**没有形成这条真实 UI 编辑交错路径在 500ms 内的性能验收**。
已有优化不能据此宣称无效，之前“增量问题已解决”的完成表述也不能覆盖这些残留。
本轮不修改新鲜度合同、不恢复暂停的缓存/索引优化，不将 partial 环境外推到完整 SDK READY 或大规模项目。

后续用户授权实施后，按[ADR0023](../adr/0023-completion-cancellation-and-synchronization.md)修复同步取消与补全调度。
代码、独立Windows UI和最终检查状态见[实施报告](2026-10-25-completion-shared-preparation-and-priority.md)；
本报告的原始4019ms及3999ms拆解仍保留为修复前证据，不追改为新候选结果。

## 原始证据和复现

本地根：`.bench/edit-completion-cause-20261025/`。

- `original-request-11-window.json`：原始普通 C 的协议时间窗；完整原件在 `.bench/zed-ui-acceptance-20261025/run-c-final/`。
- `run/wire.ndjson`：本次真实 Zed 请求/响应、逐字符编辑及真实取消。
- `run/logs/server.log`：queue trace、Program 对象统计、prepare/certification、grouped cost。
- `run/worker-16356.ndjson`：父进程实际发送/响应与共享计数器快照。
- `run/edit-result.json`、`edit-scenario.ndjson`、`ui-events.ndjson`：六条流程、精确输入、顺序与截图。
- `analysis.json`：逐条连接 LSP id、traceId、Worker id，互不重叠计时、计数与原始证据 SHA256。
- `worker-counts.cjs`、`ui-tools/`、`start.ps1`、`remote.py`：原样诊断和真实 UI 执行脚本。
- `diagnostic-ui.receipt.json`：执行退出0；`cleanup.*`、`final-audit.*`：限定自有进程/任务收尾及只读身份核验。

最终只读核验：测试server/Worker哈希与上表一致，私有诊断进程0、私有任务0，真实Photos工作树干净。

重新分析已有数据，无需连接 Windows：

```sh
python3 .bench/edit-completion-cause-20261025/analyze.py
```

重新执行 UI 需已有相同产物、SDK 和登录桌面；`start.ps1` 拒绝覆盖既有证据，先改为新的目录/任务后缀，
并上传对应 `edit-completion-cause-tools.tar.gz` 至候选目录，再运行：

```sh
python3 .bench/edit-completion-cause-20261025/remote.py NEW_START_SCRIPT.ps1 NEW_LABEL 300
```

本轮740项产品/测试/构建输入仍与最终冻结清单一致。沿用此前 `pnpm check:fast` **2035/2035** 结果，
没有声称本轮又运行了全量检查。455文件冷目录3秒门槛仍按原授权排除；本轮未推送、合并或替换日常安装。
