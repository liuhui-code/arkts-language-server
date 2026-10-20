> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

**Mac applications_photos 真机 LSP 测试（2026-10-19）**

三轮默认配置基线共 **477 次操作，功能检查全部通过，224 次超过 500ms**；未通过时延目标。累计超额耗时 288.604s，随机打开补全、跨模块关闭重开补全和随机定义跳转占超额的 98.09%。Mac 数据与已有 Windows 数据完全分列，未合并分位数。

| 项目 | Mac 实际环境 |
| --- | --- |
| 服务器代码 | `3add697043380612efe71cef074e5de292422fe2`，重新构建 Node bundles 与 release Rust 侧车 |
| 工程 | `<local-path>`，`a2c993829c46d965abefc5d2143187fa54fa4604`，288 个 TS/ETS 文件、7 个模块 |
| 系统与硬件 | macOS 26.6.2（25G83），x86_64；i7-9750H @ 2.60GHz，12 个逻辑处理器，16GiB |
| 工具 | Node 20.19.5；锁定 `ohos-typescript@4.9.5-r10`；`cargo build --locked --offline --release -p arkts-index-sidecar` |
| SDK | 本机 DevEco API 24 / 6.1.1.125；复制 1670 项原始声明/配置到独立测试目录，逐项 SHA-256 与原文件及 Windows 测试声明完全一致 |
| SDK 路径 | 原始 `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`；测试 `.bench/mac-photos-v1/sdk/openharmony` |
| 项目配置与压力 | 工程 compileSdkVersion=20；默认 4096MiB；首次初始化豁免压力限制 |

基线为真实子进程与 Content-Length framed stdio。每条 RPC 从请求发送到完整响应解析；诊断从 didChange 到匹配版本通知。500ms 是判定阈值，30s 仅为采集 watchdog；500ms 失败保留，驱动退出码 2。编辑器点击、弹窗和绘制没有测量。基线关闭额外追踪，独立 `trace-1` 不混入基线。

每轮是新进程、新服务端缓存目录；未清理操作系统文件缓存。初始化结束后再发查询，但三轮均为 degraded，不等于 READY。固定 seed=20261019，从与 Windows 相同的 48 个目标文件执行同样次序：12 个未打开查询、36 个打开→补全→关闭，20 次同文件补全、20 次前缀编辑补全及定义行号更新，7 模块×3 轮关闭重开。不是连续保持七个编辑器标签打开的测试。

| 轮次 | 初始化 ms | 状态 | 操作数 | >500ms | 功能失败 |
| --- | ---: | --- | ---: | ---: | ---: |
| baseline-1 | 10467.0 | degraded | 159 | 74 | 0 |
| baseline-2 | 10585.3 | degraded | 159 | 75 | 0 |
| baseline-3 | 10048.6 | degraded | 159 | 75 | 0 |

三轮首个依赖阻断均为 `common/src/main/ets/default/model/browser/AlbumDefine.ts` 的 `@ohos.filemanagement.userFileManager` 无法解析（2307，零基位置 14:28）。没有补造声明或修改项目输入。这里只证实初始化降级原因，不能据此推导所有慢操作的归因。

**基线操作分布**。P50/P95 为 nearest-rank，包含该类全部样本；N=3 仅为三次观察。

| 操作 | N | P50 ms | P95 ms | 最大 ms | >500ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首次打开文件补全 | 3 | 564.4 | 668.9 | 668.9 | 3 |
| 成员补全 resolve | 3 | 323.5 | 324.0 | 324.0 | 0 |
| 同文件定义跳转 | 3 | 80.4 | 81.3 | 81.3 | 0 |
| 悬停类型 | 3 | 78.7 | 81.0 | 81.0 | 0 |
| 文档符号 | 3 | 61.8 | 64.7 | 64.7 | 0 |
| 字段引用（精确 4 处） | 3 | 324.0 | 337.5 | 337.5 | 0 |
| 文档高亮 | 3 | 80.4 | 82.6 | 82.6 | 0 |
| 折叠范围 | 3 | 7.4 | 7.9 | 7.9 | 0 |
| 重命名准备 | 3 | 166.3 | 167.0 | 167.0 | 0 |
| 重命名预览（4 处编辑） | 3 | 114.2 | 115.9 | 115.9 | 0 |
| SDK 定义跳转 | 3 | 80.4 | 80.9 | 80.9 | 0 |
| 函数签名 | 3 | 81.7 | 82.3 | 82.3 | 0 |
| 普通标识符补全 | 3 | 659.5 | 685.2 | 685.2 | 3 |
| 同文件连续补全 | 60 | 133.7 | 312.5 | 702.1 | 3 |
| 成员改为前缀后立即补全 | 60 | 474.6 | 513.3 | 603.4 | 5 |
| 增量编辑后定义跳转 | 60 | 296.4 | 313.7 | 368.4 | 0 |
| 插入类型错误 → 诊断 | 3 | 396.6 | 404.0 | 404.0 | 0 |
| 修复类型错误 → 诊断 | 3 | 393.4 | 400.1 | 400.1 | 0 |
| 自动导入补全 | 3 | 593.5 | 628.4 | 628.4 | 3 |
| 自动导入 resolve | 3 | 291.4 | 334.4 | 334.4 | 0 |
| 随机未打开文件补全 | 36 | 232.3 | 1676.8 | 1763.9 | 3 |
| 随机文件定义跳转 | 36 | 1407.3 | 1774.0 | 1882.1 | 36 |
| 随机打开文件补全 | 108 | 1904.9 | 2114.5 | 2236.4 | 105 |
| 跨模块关闭重开后补全 | 63 | 2064.4 | 2277.5 | 2384.0 | 63 |
| 工作区符号搜索 | 3 | 13.8 | 16.2 | 16.2 | 0 |

同时符合所选功能预期和 ≤500ms 的为 253 次。功能检查包括目标补全存在、锚点四处精确引用、更新后的定义行号、SDK 跳转、诊断版本及修复；随机定义验证返回位置的文本为目标成员，未建立每个随机符号的穷举引用/定义 oracle。普通补全 isIncomplete 标志保留。

120 条编辑后 RPC 还单列从 didChange 前至响应的 editToResponseMs：5 条 >500ms，与 RPC 本身分类一致，最大 604.283ms。连续同文件补全的三条超标均为全文恢复后开始连续查询的第一条；其余重复样本同样保留，不删去该状态转换成本。

**慢操作可复现证据**。全量与慢操作 CSV 均逐行记录运行/顺序、路径、光标处符号、目标符号、零基 UTF-16 位置、源行与源码快照 SHA、请求参数、文档版本、open/close 次数、同方法/文件/符号重复序号、之前的编辑事件及输入摘要。完整原始 NDJSON 还保存返回结果和精确 didOpen/didChange 内容；全文替换摘要以快照 SHA 指向原文。completionItem/resolve 不携带光标，CSV 另关联其来源 completion 的顺序和位置；工作区搜索无单文件位置。

下表列出每种慢操作的最慢样本；位置为该请求快照中的一基行:列，具体编辑及前置状态以相同行的 CSV 和原始记录为准。

| 顺序 | 操作 | 文件 | 符号 / 位置 | ms | 前置状态 |
| --- | --- | --- | --- | ---: | --- |
| baseline-1 #130 | 随机打开文件补全 | `feature/browser/src/main/ets/default/view/photo/RotateMenuOperation.ts` | `menuContext` / 34:13 | 2236.4 | first-open；open=1, close=0；同查询第 1 次 |
| baseline-1 #156 | 跨模块关闭重开后补全 | `feature/thirdselect/src/main/ets/default/view/ThirdSelectPhotoBrowserBase.ets` | `onBackPress` / 114:59 | 2384.0 | reopened；open=4, close=3；同查询第 4 次 |
| baseline-2 #104 | 随机文件定义跳转 | `product/phone/src/main/ets/view/TabContentComponent.ets` | `pageStatus` / 39:11 | 1882.1 | first-open；open=1, close=0；同查询第 1 次 |
| baseline-2 #78 | 随机未打开文件补全 | `common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts` | `callback` / 33:13 | 1763.9 | never-opened；open=0, close=0；同查询第 1 次 |
| baseline-2 #14 | 同文件连续补全 | `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets` | `isVisibility` / 58:15 | 702.1 | first-open；open=1, close=0；同查询第 2 次 |
| baseline-2 #13 | 普通标识符补全 | `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets` | `TAG` / 145:33 | 685.2 | first-open；open=1, close=0；同查询第 1 次 |
| baseline-2 #76 | 自动导入补全 | `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets` | `MenuContext` / 145:40 | 628.4 | first-open；open=1, close=0；同查询第 1 次 |
| baseline-3 #34 | 成员改为前缀后立即补全 | `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets` | `isVisibility` / 58:15 | 603.4 | first-open；open=1, close=0；同查询第 1 次 |
| baseline-2 #1 | 首次打开文件补全 | `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets` | `isVisibility` / 58:15 | 668.9 | first-open；open=1, close=0；同查询第 1 次 |

具体编辑包括将 `this.isVisibility` 的成员区间替换为 `isV` 并立即补全、恢复成员后在首行插入 `// Photos edit <i>\r\n` 再查定义、插入/删除类型错误，以及普通标识符和自动导入的全文替换。实际字符串、范围、版本和发送顺序在 `document-events.ndjson` 与 `client-messages.ndjson`，对应源文在 `snapshots/<sha256>.txt`。`first-open` 表示第一次 didOpen，不代表此前未被初始化访问；实际语义缓存热态在基线标为 UNMEASURED，以交互历史代替猜测。

**内部阶段：独立 trace-1**。只启用现有 `ARKTS_REFERENCES_TRACE=1` 与 `ARKTS_SEMANTIC_QUEUE_TRACE=1`；未修改运行时代码。此轮时延受观察和日志开销影响。157 条 RPC 的服务端 request.completed 与客户端顺序/方法逐项对应；其余内部事件按同一服务端日志中前一条完成至当前完成的顺序窗口关联，可能包括后台诊断，且阶段可能嵌套。不能将它们相加形成互斥百分比。跨 wall-clock/monotonic 的初版关联因末条记录约 28.2ms 偏差被拒绝，失败检查和原始数据保留；不推测时钟偏差原因。

以下阶段统计覆盖整个 trace 会话，含初始化与后台活动；各自作用域不同。

| 已测字段 | 样本数 | P50 ms | 最大 ms |
| --- | ---: | ---: | ---: |
| serverHandler | 157 | 483.580 | 2232.420 |
| enginePrepare | 260 | 6.534 | 52.325 |
| definitionCallback | 34 | 90.064 | 1536.675 |
| definitionGroupedCreateProgram | 34 | 60.178 | 1463.162 |
| compilerBuildCostReceipts | 97 | 1378.028 | 1580.819 |
| queryReadinessCertification | 154 | 0.061 | 0.272 |
| supervisorAdmissionToSendReturn | 260 | 13.454 | 2157.704 |
| workerReceivedToDispatch | 260 | 0.114 | 2.089 |

下面是 trace 的慢操作样例。Program 构建项取同一观察窗口中的真实 compiler-build 成本记录，可能包含后台工作；定义回调的 createProgram 则是该回调内的编译器分组事件。

| trace 顺序 / 操作 | 整体 / 服务端 ms | 编译器构建成本记录 ms | 定义回调 / 其中 createProgram ms |
| --- | ---: | --- | --- |
| #115 / 随机打开文件补全 | 2166.8 / 2165.6 | 1502.4 | 未测 |
| #150 / 跨模块关闭重开后补全 | 2260.3 / 2217.0 | 1560.4 | 未测 |
| #104 / 随机文件定义跳转 | 1704.6 / 1703.9 | 1412.5 | 1478.3 / 1412.5 |

完整窗口事件含 context create/reset、Program 和 SourceFile 身份观察、实际准备、定义回调、认证和队列记录，见阶段 receipts。SDK SourceFile 的复用/首次观察是对象身份观察，不是 parser 调用次数。队列字段只覆盖 supervisor 准入至 send 返回，以及 Worker message 回调收到后至 dispatch；回调收到之前的等待未测。

**明确未测**：SDK 独立解析次数/耗时、SDK 文本读取与相对解析/路径核验各自耗时、重复文件扫描与逐项系统调用耗时、补全编译器回调的独立时长、完整互斥 CPU/I/O/等待分解、GUI 绘制。不把未归属的差值称为 I/O、SDK 重解析或队列等待。

**实际接受返回编辑的额外链路**。独立新进程执行，未混入 477 次基线。

- PASS：accept returned member TextEdit restores exact original bytes
- PASS：accepted member binds to original declaration
- PASS：project alias jumps from browser to common module
- PASS：accept completion and additional import edits; imported symbol resolves
- PASS：apply versioned rename edits and re-query all four renamed references

共 8 条 RPC，>500ms 为 3 条，最大 8710.0ms；失败字段为 `None`。每条请求、实际应用的 TextEdit/additionalTextEdits/versioned WorkspaceEdit 及再查询均留存。

其中 #8 在 PhotoBrowserActionBar.ets 应用重命名后查询 `photosVisibilityProbe` 的四处引用，默认配置为 **8709.956ms**。再用独立新进程 `acceptance-trace-1` 执行同样八条请求和五项断言，全部功能通过；#8 为 **8813.399ms**，服务端 8811.710ms。该额外链路没有混入基线。

| 引用 trace 顶层实测跨度 | ms |
| --- | ---: |
| initialDocumentPreparationMs | 250.650 |
| candidateSelectionIncludingAnchorMs | 3258.140 |
| fallbackDocumentPreparationMs | 21.605 |
| fiveVerifierBatchesMs | 5242.550 |
| mergeMs | 0.190 |
| 未归属差额（仅算术差值） | 40.264 |

候选选择包含锚点定义验证。锚点 verifier 的首次启动 288.217ms，Program 准备 2837.047ms，其中编译器 createProgram 2414.860ms；这是上层跨度内部的数据，不再次相加。五批 Program 准备合计 4721.450ms，真正引用查询合计 277.438ms。

| 验证批次 | 根文件数 | 批次 ms | Program 准备 ms | 其中 createProgram ms | 引用查询 ms | Worker 复用 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 65 | 910.820 | 743.670 | 688.599 | 123.503 | True |
| 1 | 65 | 764.010 | 700.809 | 645.185 | 23.390 | True |
| 2 | 65 | 1034.990 | 949.393 | 875.771 | 36.586 | True |
| 3 | 65 | 1159.430 | 1059.063 | 970.644 | 45.896 | True |
| 4 | 27 | 1373.300 | 1268.516 | 1155.390 | 48.064 | True |

路由证据为 resident proof 三次 `inputs-changed` 拒绝，resident miss 记录 memoryLevel=level0，索引 fallback=`candidate-ineligible`；随后 conservative 计划覆盖 283 个候选文件、5 批。五批均复用 verifier Worker，各批 SDK SourceFile 为已观察对象；不将 Program 重建等同于 SDK 重解析，也不把此次分批直接归因为内存压力。合并前共 20 个位置，去重后返回正确四处。

**完整性及原始证据**。三轮共 477 个完整结果与原始 Content-Length 帧逐一一致；每轮 203 个文档事件重放、73 份快照校验通过。各轮进程均正常退出 0，288 源文件、1670 SDK 输入和运行时/驱动输入前后不变；最终另核对全项目跟踪文件和测试前所有生产源码哈希。工程原有两项未跟踪 .DS_Store 状态保留。

初次 Mac 驱动移植在启动服务端前因 `.exe` 哈希路径失败，0 个时延样本，原始失败保留为 setup-attempt-1。第一轮 measurementBoundary 说明字符串误留 Windows-local，实际平台 darwin、Mac 路径及本机时钟证据一致；第二轮仅将该说明改为 Mac-local。执行过的两版脚本与各自 SHA 均保留，不改写第一轮原始记录。

- [全量逐次 CSV](local-performance-evidence.md) / [仅 >500ms CSV](local-performance-evidence.md)。
- [机器汇总与完整性](local-performance-evidence.md) / [内部阶段原始 receipts](local-performance-evidence.md)。
- [接受编辑逐次 CSV](local-performance-evidence.md) / [重命名后引用阶段明细](local-performance-evidence.md) / [该链路 trace receipts](local-performance-evidence.md)。
- [复现说明与脚本](local-performance-evidence.md)，含固定随机清单、原始驱动、SDK SHA 清单和分析器。
- 全部原始协议、响应、编辑事件、快照和控制台：`.bench/mac-photos-v1/{baseline-1,baseline-2,baseline-3,trace-1,acceptance-1,acceptance-trace-1}/`。
- [原始证据压缩包](../../.bench/mac-photos-v1/evidence.tar.gz)，排除 SDK 副本及可重建索引缓存；压缩包和文件 SHA 见机器汇总。

已有 [Windows 报告](2026-10-19-windows-photos-validation.md) 保留 Windows 的 293/477 超标及工作区搜索失败，不用 Mac 结果覆盖。两台机器硬件、系统和准备状态存在差异，本报告不将性能差异单独归因于操作系统。
