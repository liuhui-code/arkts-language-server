# Windows 安装与真实 Zed UI 验证

日期：2026-10-24。已部署当前冻结候选，并通过 Windows 交互桌面操作真实 Zed；未提交、合并或发布。
**这次验证发现实际 UI 错误和慢操作，不能记为“全部通过”。** 本轮未修改产品源码。
前置候选和完整检查见 [Worker 状态合同实施报告](2026-10-24-worker-state-contract-implementation.md)。

后续[跨平台根因与覆盖审计](2026-10-24-zed-cross-platform-causes-and-coverage.md)已在 Mac/Windows 复现补全详情和能力协商问题，
并确认旧 Mac 协议已存在相同源码诊断；同时补正本报告的项目文件计数范围。

## 安装身份与环境

- 分支 `fix/windows-path-identity-20261022`；父提交 `e35459131366a32c48c10d1d74adef74357cd3dc`。
  当前候选含继承的未提交修改，不能用父提交代替实际代码身份。
  冻结 919 项输入清单 SHA256 为 `e634a5662d0d04535744e39da7c7abf0042daad85fc098f16657d5ca0fdb19a9`。
- 实际 Windows Zed：`1.25.3+stable.382.8dd255c3eafb5231056fe4e6f601cedd011f1c93`，来自真实 initialize 帧。
  Windows 10 Home `10.0.19045`、x64、i5-7300HQ、约 15.89GiB 可见内存；Node `20.19.5`。
- Photos：`a2c993829c46d965abefc5d2143187fa54fa4604`，每场从 Git archive 创建隔离副本，原始归档574个项目文件、288个 `.ts/.ets` 源文件。
  原哈希表覆盖573项：一张中文名图片在Windows tar解码后名称改变，未被按Git名称采集；原始清单/归档未改写。
  另生成测试 `.zed/settings.json` 后磁盘共575项。原生索引报告 discovered/indexed/total 均为288；**Program 实际成员数未测**。
  这不是 2 万文件 UI 压测，不能用于宣称大型项目问题已解决。
- SDK：`D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`；1674 项文件、1580 个声明文件。
  compiler `ohos-typescript@4.9.5-r10`，原文件 SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

安装的是已验证产物，未在安装过程中修改或重新构建产品。Windows 候选目录为
`D:/code/arkts-worker-state-contract-20261024-v3`；1001 项传输输入已与 Mac 最终版本核对。
部署 78 项：76 项生产 dist、semantic-runtime 配置、原生索引程序。

| 产物 | SHA256 |
| --- | --- |
| server.cjs | `ade1d78e8240c742595aefecb77bc7bb69f6f29745f70dfa71d3bfc858c543d5` |
| semantic-worker.cjs | `17a806c36eac090e1f66ac7ded6a4ba6a4bb7a33fef6dde8a092ec8ee697d95d` |
| Windows native index | `5d8dcc6b1dbebbfc0aa196f8deae885d62766831e03d4fdbc2a9abbe863c30bc` |

不可变安装目录：
`D:/DevTools/arkts/libexec/arkts-language-server/0.1.0-local-beta.1-00b8ac01530c0a7fd4e49d2e829d7f76a2dffb7554cf67eb2beab0938575b727`。
已更新日常入口 `%LOCALAPPDATA%/Zed/extensions/work/arkts/bin/arkts-language-server.windows`。
真实 Photos 原有项目配置曾指向旧 `D:/DevSetup/diagnostics/worker-runtime/dist/server.cjs`；本次将其参数改为新安装目录，
并移除旧 `ARKTS_REFERENCES_STRATEGY=legacy`。JSONC 定点替换后用解析结果深相等检查其他设置不变。
现有 extension/grammar Wasm 保持原字节，未重装其他扩展或清空用户配置。

原设置和 launcher 备份仅在 Windows：
`D:/DevSetup/diagnostics/zed-ui-state-contract-20261024/installation-backup-1792838933273`。
同目录 `rollback.cjs` 仅在入口和设置仍等于本次安装后指纹时恢复原文件，不删除不可变版本。
安装、结束后指纹和原项目干净状态见 `installation.json`、`final-installed-check.stdout`。

## 真实 UI 方法与边界

使用 SSH 到 `windows-pc`，在已登录 Session 2 创建限定用户、限定窗口的交互任务。
输入通过真实鼠标、Windows SendInput/SendKeys；截图通过该 Zed 窗口的 PrintWindow。
所有 LSP 请求均由真实 Zed 产生，没有用测试 LSP 客户端代替 UI。
自动化前核对前台窗口/PID；没有操作其他应用窗口。结束后关闭自有窗口并删除本次计划任务。

使用隔离 Zed profile 和项目副本保护真实源码。SDK/log/index 路径、`.ts` 的 ArkTS 关联显式配置；
产品语义参数使用默认值，没有故障注入、放宽校验或延长产品截止时间。
plain 场使用正常快捷键、右键菜单和命令面板；trace2 为真实 Zed action 绑定 F6 补全、F7 定义、F8 引用、F9 重命名。
被动 stdio relay 原样转发，只记录实际帧；其开销与 plain 分开，不将两场混成一组统计。

plain 时间来自产品 `request.completed.durationMs`；trace2 时间从 relay 收到完整请求到收到完整响应，使用单调时钟。
两种口径均**不包含完整 UI 绘制时间**，键盘到像素时延未测。
trace2 按真实输入时间、方法、URI、位置、relay PID、JSON-RPC id 关联；25 条选定请求均只匹配到一个同目标请求。
3 个文件的统计 n=3 是不同目标的合并，3 次编辑是同会话连续编辑；不是 3 个独立冷进程样本。
未清 OS 页缓存；first 指该流程该目标首次显式操作，不保证其 AST/Program 全冷。

目标和 0 基 UTF-16 查询位置：

| 序号 | 相对文件路径 | 符号 | 定义/引用位置 | 补全位置 |
| --- | --- | --- | --- | --- |
| 0 | `common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts` | callback | 32:10 | 32:9 |
| 1 | `feature/editor/src/main/ets/default/view/PcMainMenuBar.ets` | selectedMode | 36:16 | 36:15 |
| 2 | `feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts` | menuContext | 33:10 | 33:9 |

依次覆盖冷启动时定义并切换文件、三文件首次/重复定义、补全、关闭重开补全和定义、编辑前引用、
局部编辑后首次和重复引用，以及重命名入口。编辑只改 ThirdDeleteOperation 的 0 基第 28 行 `private isTrash` 布尔值，保存后查询 callback。
resume 三轮实际为 false→true、true→false、false→true；每轮检查整份标准化换行后的代码只有这处预期变化。
完整输入、保存产生的 didChange 分片、didOpen/didClose、版本和顺序均在 wire/scenario/UI events。

## 测量结果

plain 实际右键 Go to Definition 从 UI 33:11 跳到 UI 71:3；补全列表显示 callback 并实际鼠标接受；
Find All References 显示真实多文件结果视图。对应服务时长：定义 **207.57ms**、补全 **237.29ms**、
首次引用 **1101.24ms**、局部编辑后引用 **882.14ms**、重复引用 **1112.97ms**。
20 次后续 completion resolve 为 145.60–206.88ms，不能把它们相加称作 UI 首屏时间。

trace2 共关联 **25 条前台响应：25 条无协议错误，18 条超过 500ms**。
10 条定义返回范围内文本等于目标成员名，6 条补全包含目标成员；9 条引用均返回 52 个位置。
引用的全工程绑定正确性和完整性未做独立 oracle，不将“返回 52 个”当作这两项已经通过。

| trace2 操作 | n | 中位数 ms | 最大 ms | >500ms |
| --- | ---: | ---: | ---: | ---: |
| 初始化中切换文件后的定义 | 1 | 34523.123 | 34523.123 | 1 |
| 初始化终态后三目标首次显式定义 | 3 | 943.153 | 1075.177 | 2 |
| 重复定义 | 3 | 442.215 | 692.587 | 1 |
| 关闭重开定义 | 3 | 488.641 | 731.818 | 1 |
| 三目标首次显式补全 | 3 | 459.012 | 641.003 | 1 |
| 关闭重开补全 | 3 | 1014.681 | 1223.645 | 3 |
| 编辑前引用 | 1 | 1524.468 | 1524.468 | 1 |
| 三次新编辑后首次引用 | 3 | 4146.941 | 4620.979 | 3 |
| 三次编辑后的重复引用 | 3 | 3877.543 | 4307.388 | 3 |

新编辑后首次三轮分别为 **1265.153 / 4146.941 / 4620.979ms**；重复分别为 **4307.388 / 856.858 / 3877.543ms**。
工具中断后相隔约 4 分钟才继续的两条引用为 905.814 / 1480.050ms，单列 deferred，不混入即时编辑后三轮。
冷启动旧目标 id=3 同样成功但耗时 **33828.323ms**，与新目标 id=6、初始化时间重叠，不相加。
plain/trace/trace2 初始化分别 **33561.983 / 33694.502 / 33706.009ms**。

三场初始化通知 phase=complete，但 report.semanticState 均为 **degraded**，不是全工程 READY：
2307，缺失 `@ohos.filemanagement.userFileManager` 声明。语义资格、普通查询成功、Worker 活性分别判断。
trace2 九次引用都记录 `references.cache.miss/store`，没有 hit；反复打开/关闭引用视图会产生实际文档事件，
因此“重复”不能称作结果缓存命中。Program/AST 复用、实际构建次数、内部互斥阶段耗时均未插桩测量，不猜测归因。

## 实际错误与未通过项

### 补全详情在关闭/切换期间报 ERROR

trace2 的 68 次 `completionItem/resolve` 中，27 次成功，**41 次 -32602**：
`Completion item is unknown or stale`。Zed 自己的日志对应 **41 条 ERROR**，不是仅从测试控制器推断。
6 份补全列表共 88 个句柄，低于存储上限 512；全部失败请求的 data 与原列表完全相同。

- 29 次：目标文件在 resolve 请求前已经 didClose。
- 3 次：目标文件在 resolve 执行期间 didClose。
- 9 次：目标文件在列表至响应之间没有 open/close/change，但执行期间其他文件有真实 mutation；
  对应服务时间附近有 resolve outcome=stale。未测内部命中的具体拒绝分支，不能把这 9 次也归为目标文件关闭。

例如 relay PID 3740、列表 id=23、MAX_PROGRESS resolve id=26：
11:29:48.717Z 请求 → 11:29:48.775Z 目标 didClose → 11:29:48.787Z -32602。
同一列表随后 callback 等句柄继续被 Zed resolve。另一例 id=102：目标仍为 version=0、保持打开；
期间 PcMainMenuBar didOpen，返回 stale 错误。这些是实际 UI 证据，未故障注入。

相关调用链：
[生成并保存句柄](../../src/lsp/run-language-server.ts#L307) →
[CompletionResolutionStore](../../src/lsp/completion-resolution-store.ts#L19) →
[resolve 的前置文档检查](../../src/lsp/run-language-server.ts#L343) →
[SemanticRequestRunner 的 stale/superseded fallback](../../src/lsp/semantic-request-runner.ts#L150) →
[空 resolve 转 InvalidParams](../../src/lsp/run-language-server.ts#L366) →
[错误映射](../../src/lsp/completion-mapper.ts#L106)。
[关闭/内容更新](../../src/lsp/run-language-server.ts#L288)会删除该文档句柄；
[root mutation 对请求的失效](../../src/semantic/semantic-worker-supervisor.ts#L514)也可使在途结果失效。
已证明普通关闭/切换与错误有关；尚未对每条错误的内部路径加独立见证，不宣称 9 条全由某一具体 guard 产生。
此处保留为真实 UI 兼容缺口，不改校验或吞错来把结果记绿。

### 真取消、源码诊断和 Zed 自身错误分开记录

trace2 另有 **107 条 -32800**：completion 74、codeAction 16、documentHighlight 17。
每条都能匹配其终态前真实 `$/cancelRequest`，没有把无客户端取消的失败改名为正常取消。
未观察到 -32603、无法找到源文件异常、监督超时或 Worker 自动恢复；这不是所有 RPC 均成功。
结构化服务日志均为 info，但上述 41 条在 resolve 外层被拒绝，不由日志级别推导“没有错误”。

实际 publishDiagnostics 有 4 种不同诊断：PcMainMenuBar 的 1005/1128/2304（`';' expected`、statement expected、height 未找到），
RenameMenuOperation 的 2307（缺失 userFileManager）。这是编译/源码诊断，未证明本轮引入；
也不能将界面红色诊断数量当作 Worker 故障数量。细节见 `ui-trace2-unique-diagnostics.json`。

Zed.log 的其他错误也保留：plain 一条 command palette SendError，关闭时 window not found 等 4 条；
不完整 trace 关闭时一条 window not found；trace2 关闭时另有一条 window not found。
没有将它们归因成 ArkTS compiler 故障。plain 未被动捕获原始 stderr；trace/trace2 原始 stderr 无非 JSON 附加异常栈。

### 重命名未启用，不能记为通过

实际 client 声明 documentChanges、prepareSupport，但 workspaceEdit **没有 failureHandling**；
[当前能力协商](../../src/lsp/register-semantic-capabilities.ts#L587)要求 transactional 或 textOnlyTransactional。
实际 initialize response 不含 renameProvider；F2/F9 没有重命名输入框，未产生 prepareRename/rename RPC。
因此是 **当前 Zed 与当前服务合同下 UI 功能不可用**，不是 rename 已成功或因超时失败；未强行发送协议绕过协商。

### 关闭清理与协议握手不是同一结论

trace2 所有 466 条已响应请求均无重复 id/重复终态；第 467 条 shutdown 没有在 relay 中捕获响应，
其后实际服务进程 exit code=0，pending 仅此 shutdown。最初不完整 trace 的 shutdown 同样未捕获响应。
所以**进程清理完成，但不能宣称实际 UI 的完整 LSP shutdown 握手通过**；未据此直接判定产品泄漏。
最终现场校验：本次计划任务为 0、已知 Zed/relay/服务/原生进程为 0；真实 Photos Git 干净。

## 内存与重建观察

约 1 秒采样 Windows WorkingSet / PrivateMemorySize64，每个 PID 每次只计一次。
Node 的数值包含语义和 verifier 等所有 Worker 线程，不再按线程相加；Private bytes 不是 RSS，
WorkingSet 的跨进程共享页未经 PSS 去重。Zed/崩溃处理器、被动 relay 与产品进程分列。

| 场景 | 服务 WorkingSet 峰值 MiB | 原生索引峰值 MiB | 产品同一采样时刻合计峰值 MiB |
| --- | ---: | ---: | ---: |
| plain | 676.582 | 46.188 | 687.082 |
| trace2 | 725.668 | 46.289 | 769.258 |

trace2 产品同时 Private bytes 峰值 803.480MiB；relay 自身 WorkingSet 峰值 30.148MiB，Zed UI 为 178.281MiB，未加入产品合计。
结束关闭前最后样本服务/原生分别 698.641 / 9.801MiB；这不是 dispose 后占用。关闭后按实际进程不存在确认回收。
采样会漏掉瞬时峰值；只有一个成功 trace2 交互会话，不能由此断言长期内存稳定或不存在泄漏。

每场实际各一条 `semantic.worker.started`，同一服务 PID，没有观察到恢复/重建事件；
trace2 约 13 分钟交互中没有复现此前每次 definition 无限重建的现场。
未单独观测全部嵌套 Worker 的创建/退出或 Program 构建次数，不能把一个 Node PID 等同于只有一个 Worker。

## 原始证据、工具失败与复现

本地证据根：[.bench/windows-zed-ui-20261024](../../.bench/windows-zed-ui-20261024/)。
Windows 现场根：`D:/DevSetup/diagnostics/zed-ui-state-contract-20261024`。

- [逐次前台请求](../../.bench/windows-zed-ui-20261024/selected-ui-operations.csv)、`selected-slow-ui-operations.json`；
  `ui-trace2/wire.ndjson`、`ui-trace2/scenario.ndjson` 和 `ui-trace2/ui-events.ndjson` 保留完整顺序与输入。
- `ui-trace2-all-rpc.csv` 包含全部响应和取消对应关系；`ui-trace2-completion-resolve-errors.json` 包含 41 次错误的句柄、文档状态和 mutation。
  `ui-plain/logs/server.log`、各场 Zed.log、memory-samples.csv 保留后台请求和资源数据。
- [真实定义截图](../../.bench/windows-zed-ui-20261024/plain-callback-definition.png)、
  [真实引用结果视图](../../.bench/windows-zed-ui-20261024/plain-references-result.png)、
  [真实 .ets 补全](../../.bench/windows-zed-ui-20261024/ui-trace2/snapshots/trace-file-1-completion.png)、
  [Zed 自己的 ArkTS Server Logs 面板](../../.bench/windows-zed-ui-20261024/ui-trace2/snapshots/actual-zed-language-server-logs.png)。
  trace2 的 reference-results 截图仍显示 Finding references，只证明当时状态，不作为该结果已经绘制的证据。
- `analysis-summary.json` 是可重算汇总；[复现说明](../../.bench/windows-zed-ui-20261024/REPRODUCE.md)列出命令、输入和清理方法。

最初 trace 控制器进程消失，没有请求场景完成证据；其前台操作样本为空，不算产品卡死或成功测试。
trace2 首段因控制器预期行尾遗漏 CR 而退出 1；实际 UI 已正确改动布尔值，另保存时将一处末尾 LF 统一为 CRLF。
原 `driver-result.json`、初版脚本和失败场景均保留。仅修正工具的行尾比较，另用整份标准化代码相等检查限制编辑范围。
resume 的两条延迟查询单列，随后另做三次即时编辑；`driver-resume-result.json` 为 exit 0。
该 exit 0 仅指 25 条选定前台请求完成，不覆盖 41 条后台详情错误、重命名或 shutdown 握手。
plain 控制器曾误选关闭重开时一条 49.18ms 的 superseded 后台定义日志；保留该原始行，不作为该点击成功时延。

三个原包 SHA256：plain `0d26435218c66519f84e64357a4352a3b4b880fd2033cfcb873554ae44656f1f`；
不完整 trace `b39b176257e3639ac3f121f7757bec7d852ec1ae4b67447f1776b8f3888339c8`；
trace2 `c85f872b92780ec0958b22d9305955b53b841acf8209162014b3a685ddd6179f`。
解包后逐项核对 90/27/145 份证据指纹；不传输真实用户设置备份、完整项目归档和索引数据库。

本轮复用同字节候选已经完成的 `pnpm check:fast` **2016/2016、exit 0**、Windows **116/116** 及 Rust 路径合同 **1/1**，
没有把 UI 后新跑一次完整检查作为事实。结束再次核对 919/4/1/76 项冻结输入并运行 diff 检查；未用文档/测试工具改动替换产品。
455 文件冷目录 3 秒性能门槛仍按用户授权排除；缓存性能 TODO 仍暂缓。500ms 目标、规模增长、degraded 完整性和上述实际 UI 问题均未闭环。
