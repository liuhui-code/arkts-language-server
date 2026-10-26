# Windows Zed 现场报错：日志核对、真实取消复现与 Program 状态

日期：2026-10-24，Asia/Shanghai。证据内 `ts` 为 UTC；例如 03:20:33Z 对应本地 11:20:33。
本轮只诊断，未修改产品、部署、重启 Zed/当前语言服务器、提交或合并。
缓存性能 TODO 和 455 文件冷目录三秒门槛保持此前范围。

## 结论与证据边界

1. 用户报告的错误真实存在。当前 PID 6724 的结构化日志有 **624 次完成请求、94 次 error**，
   不能将它们归为正常取消。另有 cancelled 324 次、superseded 117 次、ok 89 次。
2. 使用 **Zed 正在启动的原始运行包**、相同 SDK 路径和真实 Photos 的隔离副本，
   **没有注入编译异常**，仅通过公开 `$/cancelRequest` 即复现：取消之后未取消的 definition
   报 `Could not find source file`，随后同输入的两次 definition 仍报内部错误。
3. 在单独的观测副本中确认：目标文件磁盘存在、精确包含在 Host roots，旧 Program 却没有它；
   compiler 在构建前提交了版本，构建被真实取消打断；同版本重试跳过同步，继续使用旧 Program。
   **这是失败构建后的同步状态问题，本复现不是盘符/大小写不一致，也不是文件被删除。**
4. `client-cancelled` 在复现中是正常响应 `-32800`。现场运行包的额外调试语句却将取消也经
   `console.error` 打印为 `worker failure`。这解释部分红色输出，不能解释后续 `-32603`。
5. Zed 实际配置覆盖了默认安装，启动 `D:\DevSetup\diagnostics\worker-runtime`，并显式使用
   `ARKTS_REFERENCES_STRATEGY=legacy`。四个运行包均与上一轮 v8 候选不同。
   已有 v8 候选在同一两文件最小序列中收到真实取消后，后续 definition 正确，无内部错误；
   **本轮未替换现场运行包，不能称当前 Zed 已修好。**

原现场的 `Server Logs` 内存面板内容没有完整导出；磁盘 NDJSON 不含 URI、请求 ID 或异常栈。
因此不能把原现场 94 次错误逐条确定为同一个原因。以下严格分开原日志与独立复现。

## 日志入口与实际启动身份

- 扩展 LSP 输出入口：Zed `dev: open language server logs` → `arkts-language-server` →
  `Server Logs`；这是服务输出/协议日志视图，不能用 Zed 总日志代替。
  [Zed 官方日志视图说明](https://zed.dev/docs/languages/python#resolve-language-server-startup-issues)。
- 本服务默认结构化日志：
  `C:\Users\liu xun yuan\AppData\Local\ArkTSLanguageServer\logs\server.log`。
  实现：`src/observability/log-path.ts:8`、`src/observability/logger.ts:50`。
  当前请求完成日志只记录 method/outcome/duration/memory，不记录原始异常。
- Zed 总日志：`C:\Users\liu xun yuan\AppData\Local\Zed\logs\Zed.log`。
  它记录泛化 LSP 错误及部分光标行列，没有本次请求的文件 URI。
- `D:\DevSetup\diagnostics\zed-lsp-trace.jsonl`、`zed-lsp-stderr.log` 的**内部时间戳**是
  10 月 18 日，不是本次现场。Zed.log 的文件修改时间也滞后，但其**内容确实包含 10 月 24 日**。
  先前仅凭修改时间判断 Zed.log 不属于本次现场是错误的，已改为按内部时间戳和 PID 核对。
- Zed 1.24.2，完整版本 `1.24.2+stable.373.fb69067729cb16a7f6135e2c1600c26a28c59659`。
  PID 17308 → Node 6724 → native index 11944。
- 实际 Node：`D:\DevTools\node-v20.19.5-win-x64\node.exe`，启动参数：
  `D:\DevSetup\diagnostics\worker-runtime\dist\server.cjs --stdio`。
- Photos `.zed/settings.json:9–16` 覆盖了 binary 和 legacy 策略，扩展默认 `.windows` launcher
  指向另一安装目录。扩展按 binary 设置优先，见 `editors/zed/src/lib.rs:16`。
  只提取了相关配置行，没有转移完整用户设置；完整进程环境未读取。

| 产物 | Zed 现场 SHA256 | 已有 v8 候选 SHA256 |
| --- | --- | --- |
| server.cjs | `6fb963761e7e106f09eac80796954f0a1a4bc3159bcda7d97fdcb21358285bd8` | `9b6bc5babc2196d80e1e12191240fbe1d37841478c87af772bdf018a66b9eb67` |
| semantic-worker.cjs | `01cf0f1ce70b66a88b9ccb5d113c47b7ffc18abd1518599119bd65c996e60010` | `1a751730f41463e46a028c5d8b54220f04fbc675b7af3b57ad74250457c73635` |
| reference-verifier-worker.cjs | `a04a09accf8ad4040e2124d084ab7f4d5b12dc4e143cdee4c83938907edc9737` | `a1919154e3c05b9404468bd8ffa0f1c9ef916f350fd3e857c8db5190f9dc2545` |
| diagnostic-verifier-worker.cjs | `ad9c19eb1113284c5ff6f761b18d5a736222133b811216c53cfede5bf14b7aa1` | `98b876e1fd1b2441fa574b5d6ac4719798701bf04adbc2217de24ee4de96719d` |

现场目录没有源码提交元数据，不能将其标成当前 checkout 的提交。
v8 对照的两主包 SHA 与上一轮最终候选逐字节一致；该候选基于
`e35459131366a32c48c10d1d74adef74357cd3dc` 加未提交修改，不能只用父提交代表内容。
现场 bundle 内嵌 compiler 输入身份为 `ohos-typescript 4.9.5-r10`，compiler SHA256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

SDK：`D:\DevTools\sdk-declarations\openharmony-api24-6.1.1.125`，API24 声明快照。
原现场 SDK selected.ready=true 表示 SDK 发现成功，不等于语义 READY。
native catalog 日志 ready，discovered/indexed=288；**288 不是实际进入 Program 的数量**。

## 原现场完成请求

取 PID 6724，从 `2026-10-24T03:19:19.549Z` 到 `03:37:00.968Z`；
错误集中于本地 11:20:33–11:24:09。按服务完成事件计数，避免将 Zed WARN/ERROR 重复行计作两次请求。

| error 操作 | 次数 | 完成耗时中位数 ms | 最大 ms |
| --- | ---: | ---: | ---: |
| definition | 32 | 66.585 | 311.37 |
| hover | 26 | 38.535 | 98.14 |
| references | 10 | 172.55 | 377.70 |
| documentHighlight | 13 | 70.91 | 306.18 |
| codeAction | 13 | 35.55 | 394.74 |

这些 error 是快速失败，不能将其称为有效操作通过 500ms。
完成日志不能覆盖没有终态的请求，也不能据此排除另外的长时间卡死。
Zed 总日志可见 definition 光标如 `(77,4)`、`(32,16)`、`(56,22)` 等；
本次原始 URI 和符号未被磁盘日志保存，不能借用 10 月 18 日 trace 中的文件名补全。

## 隔离复现、对照和实际执行内容

Photos HEAD `a2c993829c46d965abefc5d2143187fa54fa4604`，通过 `git archive HEAD` 解包到每场独立目录，
不操作真实项目源文件。使用同一 Node20.19.5、SDK 路径、legacy 策略，顺序运行各场。
仅独立日志与索引目录有写入；没有 didChange、重命名或磁盘编辑。
脚本清除继承的 ARKTS 等实验变量，再明确设置 SDK/log/index/native/legacy；
这不能证明完整环境与原 Zed 进程逐项相同。

| 独立场次 | 文件 / 请求数 | 实际客户端取消响应 | 非取消内部错误 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 现场原包 serial | 12 / 36 | 0 | 0 | 固定串行无错误 |
| 现场原包 cancel | 12 / 54 | 12 | 2 | 两个文件在取消后首次 definition 失败 |
| 现场原包 minimal，无插桩 | 2 / 10 | 1 | 3 | 首次重试和两次不变输入重试均失败 |
| 原包的观测副本 minimal | 2 / 10 | 1 | 3 | 同样失败，记录到版本与 Program 状态 |
| 已有 v8 候选 minimal | 2 / 7 | 1 | 0 | 取消后查询与关闭重开成功 |

“场次完成”只表示驱动走完，失败样本没有剔除。5 场共 117 次请求，完整逐次结果见 `operations.csv`。
离线根据 didOpen 的原始文本验证每个成功 definition 的返回范围文字匹配固定计划符号；
全部成功 definition 的文本 oracle 为真，所有测试源文件 SHA 与固定计划一致。
串行不主动发送客户端取消，后台 diagnose 仍可能因新输入被 content-modified 取消。

12 文件 cancel 场中：

- 第 17 次：`feature/thirdselect/src/main/ets/default/common/SmartPickerRecommendTabInfo.ts`，
  `recommendType`，LSP `(34,17)`，在 `return this.recommendType;`，发送真实客户端取消；
  响应 `-32800`，418.943ms。第 18 次同位置**不取消**，18.582ms 报 `-32603`。
- 第 40 次：`feature/editor/src/main/ets/default/utils/EditStack.ts`，`currentPosition`，
  LSP `(20,18)`，发送真实取消；313.082ms 响应 `-32800`。
  第 41 次同位置不取消，11.417ms 报 `-32603`。
- 两次都有 background diagnose 与 definition 的原始 `Could not find source file` 栈。
  本场的 hover 先于后续重试，不能用其证明“完全不变状态下持续失败”，因此另做下面的最小场。

两文件 minimal 顺序固定为：

1. 打开 `common/.../ThirdDeleteOperation.ts`，查 `callback`，LSP `(32,10)`，
   hover、关闭重开并再次查定义，得到旧 Program。
2. 打开 `feature/thirdselect/.../SmartPickerRecommendTabInfo.ts`，查 `recommendType`，LSP `(34,17)`；
   定时发送该请求的 `$/cancelRequest`，无编译异常/阻塞注入。
3. 同位置不取消，立刻查定义；若失败，再连续查两次，不插入 hover/编辑/配置事件。
4. 发送 SDK 路径不变的 didChangeConfiguration，然后重查；最后 hover、关闭重开查询。

| 最小场步骤 | 原包无插桩 ms / 结果 | 观测副本 ms / 结果 | v8 对照 ms / 结果 |
| --- | --- | --- | --- |
| 取消活动 definition | 482.523 / -32800 | 530.615 / -32800 | 316.578 / -32800 |
| 取消后首次未取消 definition | 413.507 / -32603 | 372.015 / -32603 | 255.358 / 正确定义 |
| 不变输入重试 1 | 33.243 / -32603 | 15.881 / -32603 | 不适用，前项成功 |
| 不变输入重试 2 | 32.072 / -32603 | 9.933 / -32603 | 不适用，前项成功 |
| 配置刷新后 definition | 见逐次 CSV，成功 | 5984.114 / 成功 | 不适用，未触发失败分支 |

插桩和普通运行的耗时不合并，不将差值当作精确插桩开销。
v8 此次冷首查 **37687.702ms**，包含等待初始化准备；首次 hover **510.399ms**，
关闭重开 373.794ms；取消后 hover/重开分别 268.899/282.035ms。
这不是所有操作低于 500ms 的证明。v8 公共准备报告仍是 degraded/dependency-inputs-incomplete，
缺 `@ohos.filemanagement.userFileManager`，位置 AlbumDefine.ts LSP `(14,28)`；没有补 stub 伪造 READY。

## 状态顺序与详细原因

观测仅修改独立复制的 compiler bundle，添加 `[DEBUG-win-live-20261024]` 读状态日志；
没有修改当前安装包，没有注入抛错。调用真实 LSP 取消的效果是自然传播到模块解析 checkpoint。
证据：`observed-minimal-1792815113251/stderr.raw` 与 `compiler-observations.jsonl`。

| UTC 时刻 / stderr 行 | 可观察状态 |
| --- | --- |
| 04:12:07.552 / 38–40 | LS owner 2，旧版本 `39:none:0:1`；Host 变为 `41:none:0:1`。compiler 先提交 lastProjectVersion，再进入 createProgram，roots=42 |
| 04:12:08.008 / 41 | createProgram 抛 `Error: Semantic request cancelled`；没有该次 program-return；lastProjectVersion 仍是 `41:none:0:1` |
| 04:12:08.012 / 53–54 | 后台诊断同版本同步检查；Host=lastProjectVersion，旧 Program 仍有 360 个 SourceFile，报 missing-source |
| 04:12:08.383 / 70–71 | 未取消 definition 同版本同步检查，然后缺同一目标文件 |
| 04:12:08.400、.409 / 83–99 | 两次不变输入 definition 重试仍同版本、同 owner、旧 Program，仍缺文件 |
| 配置刷新后 / 113 起 | owner 变为 LS 3，重新同步构建；请求成功 |

每次 missing-source 都观测到：

- `existsOnDisk=true`；`exactHostRoot=true`，Host 根文件精确包含查询的原始路径。
- `hostRootCount=42`；旧 Program `programCount=360`，其中项目 39、SDK 269、其他标准库 52。
  Host roots、Program SourceFiles 和磁盘项目 288 是三种不同口径。
- `programCaseInsensitiveMatch=false`：旧 Program 甚至没有同路径的大小写变体。
  此字段只用于诊断比对，没有将产品身份规则改成全路径小写。

compiler 的 `program = createProgram(options)` 只有 RHS 正常返回才赋值。
本次 RHS 抛错，LHS 留着上一次 Program；但 lastProjectVersion 已提前写成新版本。
后续 `synchronizeHostData` 判断版本相同直接 return，`getValidSourceFile(fileName)`
于是从旧 Program 查新文件并抛错。这里“找不到”指 **Program 中没有 SourceFile**，不能等同于磁盘 ENOENT。

失败后继续共享该 LS，background diagnose、definition 都会命中这个不一致状态。
改变准备范围/版本或配置刷新可能绕出，因而呈现“有时换个动作又恢复”；
12 文件场的 hover 后恢复是观测事实，具体 Host 版本改变只在最小观测场有记录，不能混为逐次证明。

## 与实际安装编译器对应的调用链

下列行号来自已取回、SHA 固定的**现场 bundle**，不是用当前工作区行号冒充部署源码。
完整原文件保存在证据目录 `active-runtime/`；bundle 内源文件注释提供模块名称。

| 边界 | 实际 bundle 文件 / 函数 / 行 |
| --- | --- |
| 公开 LSP definition | server.cjs:20574 onDefinition → :19129 SemanticRequestRunner.run |
| 父端转发 / 错误返回 | server.cjs:16989 SemanticWorkerProxy.define；:15109 将 Worker 错误码构造成 SemanticWorkerSupervisorError |
| Worker 执行与取消分类 | semantic-worker.cjs:192918 answerRequest；:192946 按共享取消 cell 分类；:192947 对所有异常 console.error；:193097 postError |
| definition 的准备与执行 | semantic-worker.cjs:190871 LegacySemanticEngine.define → :185363 TypeScriptLanguageServiceEngine.define → :185799 definitionCandidates |
| 已准备查询的异常边界 | semantic-worker.cjs:183298 runPreparedSemanticQuery，未建立失败同步后的 LS 丢弃/重建边界 |
| compiler 查询入口 | semantic-worker.cjs:135326 getDefinitionAtPosition2，先 synchronizeHostData 再 getValidSourceFile |
| 同步版本提前提交 | semantic-worker.cjs:134938 synchronizeHostData；:134947 同版本早返回；:134950 提交 lastProjectVersion |
| 构建与缺文件抛错 | semantic-worker.cjs:135050 program=createProgram(options)；:134929 getValidSourceFile；:134932 抛错 |
| 真实取消的抛出链 | stderr 中 relativeResolutionCheckpoint → LocalPackageResolver.installedSourcePath/ownerDirectory → resolveModule → Host.resolveModuleNames → compiler module resolution |

相同 compiler 原输入文件在当前依赖中是 `node_modules/typescript/lib/typescript.js:124351`，
版本判断/提交在 :124357/:124360。部署 bundle 偏移不同，不混用行号。
适配层直接创建 LS 的现场实现位于 bundle :184909；没有当前候选的 recoverable owner 封装。

## 为什么取消看起来也是 error，及既有修复的对应位置

现场 `answerRequest` 的 catch 调试语句固定为：

```js
console.error("[DEBUG-winrefs] worker failure", request.method, code, error?.stack ?? error);
postError(request, code);
```

因此正常客户端取消、后台 content-modified、实际内部错误都打印成相同前缀和堆栈。
12 文件取消场的输出实际包含：define/client-cancelled 4 条、diagnose/content-modified 23 条、
define/internal-error 2 条、diagnose/internal-error 2 条。
另有客户端取消在队列/父端结束，不一定产生 Worker catch 日志，不能据 4 条推成只有 4 次取消。
`client-cancelled` 并不代表 Worker 已死亡或发生物理重建。

失败同步状态属于 [ADR0020](../adr/0020-failed-semantic-build-recovery.md) 已识别的同版本失败恢复问题，
真实取消同样能触发，不限首次初始化故障注入。
当前候选的对应实现是 `src/semantic/backends/ohos-typescript/recoverable-language-service.ts:46`：
先对同步建立独立异常边界，异常后退休该 LS owner，清理租约；下一请求按真实输入重新同步。
正常在同步之外被取消的请求，不应仅凭取消标记全局重启 Worker。
此次候选的公开对照验证了这条两文件序列，不能扩大为所有 Zed 场景通过。

后续修复/验证重点应为：

1. 确保实际被 Zed binary override 启动的包包含已经验证的失败同步边界，安装/启动身份可核验。
2. 将本次真实取消、切换文件、后台诊断与同版本重试序列固化为公开 stdio 回归；
   固定串行查询和单纯抛错测试不能替代它。
3. 原始异常应落盘并带 request/URI/position/epoch/阶段，预期取消与非预期异常分级，
   不能再将两者都打印成 worker failure，也不能吞掉实际内部错误。

本轮没有实施这些新变更或修改新鲜度合同。当前代码已有恢复实现的对照结果也不等于部署完成。
此前测试没有覆盖实际 Zed 的安装 override、legacy 策略与此交互序列，这是验证缺口。

## 复现、原始数据和剩余限制

本地证据根：[.bench/windows-zed-errors-20261024](../../.bench/windows-zed-errors-20261024)。
Windows 对应根 `D:\DevSetup\diagnostics\zed-errors-20261024`。

- 原现场：`Zed.log`、`server.log`、`server-pid-6724.jsonl`、`live-session-summary.json`。
- 身份：`windows-log-inventory.raw`、`windows-runtime-inventory.raw`、`launch-config-minimal.raw`、
  `active-runtime/`、`windows-postflight.json`。
- 每场目录：原始 `report.json`、Content-Length stdio 收发还原的 `wire.jsonl`、
  `stderr.raw`、`server.log`。原始错误、取消和成功都保留。
- 汇总：`analysis-summary.json`、`operations.csv`、`cancel-replay-diagnostics.json`。
- 驱动：`replay-scene-v1.mjs` 是最初 12 文件场脚本；`replay-scene.mjs` 是两文件最小场脚本；
  `prepare-observed-runtime.cjs` 只创建独立观测副本；`analyze-evidence.py` 只离线读证据。
- 采集期间两次长清单命令超时保留为 `launch-and-log-locations*.raw`；随后改用短、字段限定的
  `launch-config-minimal.raw` 成功。完整配置和整个测试项目的复制被自动审查拒绝，
  已改为仅相关字段和 report/wire/stderr/log 的安全提取，没有遗留待授权传输。

在已有 Windows 目录布局上，使用全新诊断目录放置脚本/计划，避免覆盖既有观测副本：

```powershell
$diagNode = 'D:/DevTools/node-v20.19.5-win-x64/node.exe'
$diagRoot = 'D:/DevSetup/diagnostics/zed-errors-20261024'
& $diagNode "$diagRoot/replay-scene.mjs" minimal installed
& $diagNode "$diagRoot/replay-scene.mjs" minimal candidate
# 观测副本仅首次创建；已有副本时脚本主动拒绝覆盖。
& $diagNode "$diagRoot/prepare-observed-runtime.cjs"
& $diagNode "$diagRoot/replay-scene.mjs" minimal observed
```

脚本固定使用原现场运行目录、v8 候选/support 目录、Photos HEAD 和 SDK；
换机器需修改这些显式路径。生成目录带时间戳，每次使用独立 archive 解包。
本地汇总：`python3 .bench/windows-zed-errors-20261024/analyze-evidence.py`。

收尾：五个独立服务进程均退出 0，后验查询均不存在；真实 Photos git status 仍为空；
Zed 17308、原服务 6724 和 native 11944 的 PID/启动时间未变，现场四包 SHA 初末一致。
进程 WorkingSet 与 PrivateMemory 在前后清单中保留，但未做连续采样，不作为内存峰值/泄漏判断。
现场仅一个 `semantic.worker.started` 事件不等于物理 Worker 生命周期完整计数，未采集其线程创建序列。
同步永久不返回、无限 Worker 重建、OOM、两万文件与长期压力不在本轮复现结论内。
未重新运行 pnpm check:fast；本轮产品无修改，不拿前轮全量通过替代这次现场诊断。
Context7 Zed 文档查询传输失败，保留 `context7-zed-resolve.json`；日志视图说明采用上述官方文档，
具体故障结论来自固定包、公开 LSP 复现及观测状态，不来自通用文档推断。
