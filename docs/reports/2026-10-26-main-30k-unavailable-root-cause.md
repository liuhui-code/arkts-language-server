# main 30K Photos：“Semantic worker unavailable”详细归因

日期：2026-10-26。对应 [main 30K 复测报告](2026-10-26-main-30k-oom-reproduction.md)。
旧证据根记为 **A**：`.bench/zed-30k-main-repro-20261026/`；本次补证根记为 **B**：`.bench/zed-30k-unavailable-cause-20261026/`。
时间线全部为 UTC；本机时间为 UTC+8。本文没有实施产品修复、修改截止时间/堆限制、提交、发布或合并。

## 结论与证据强度

**三类失败的直接触发者不同，不能统一写成 OOM 或死循环。**

| 原运行 | 最先触发的终态原因 | 后续结果 | 不能据此断言 |
| --- | --- | --- | --- |
| 普通协议，definition 30120.812ms | 产品监督器的 30000ms execution-deadline | 旧 Worker 退役，请求返回 -32603；随后外部 RSS 保护终止整组语言进程 | 构建抛异常、OOM、已经恢复成功 |
| 33 次序列，第 1 次 28089.706ms 中断 | 外部诊断 Node RSS >1536MiB，driver 发 SIGTERM | 无该请求的 LSP 响应；其余 32 次定义、references 未发送 | 产品 30s 截止时间已触发、LSP 返回不可用、33 次均失败 |
| 真实 Zed 自动请求，换代 1 次 | 活跃 diagnose 被关闭文档的 mutation 取消，1s 内未结清，触发 cancellation-deadline | 旧世代排队的高亮/codeAction 被退役流程拒绝；随后创建新 Worker | 两条错误发生在重建后、熔断、真实连续跳转已复现 |

底层已确认的放大路径是：**30K 超过 20K membership 上限 → partial 时语义组没有被选用 → 初始化预装留下的复制 barrel 成为根级交互 Program 入口 → 大量依赖解析、路径身份核验和 AST 解析。**
成员上限本身产生 `degraded / project-membership-incomplete`，并不直接产生本次 `worker-unavailable`。
在随后长时间同步构建中，适配层按 ADR 0023 暂缓协作取消，父线程监督器仍按截止时间退役 Worker。新前台请求若已归属旧 supervisor，则一起被拒绝。

必须修正“真实 Zed 重建后仍不可用”的表述：原始两条错误均早于新 Worker 启动，没有原始 UI 换代后重试样本。
本次另用真实 child-process framed LSP **协议重放**复现同样的错误，再实际发送同目标重试：4803.219ms 成功、重复 50.296ms 成功。它证明该补测会话可以恢复局部定义能力，仍不证明 UI 连续点击通过、全项目 READY 或 500ms 目标已达成。

## 固定输入与运行身份

- 源码：`17e923f0cb8c430b6a10793a0f3d2f9097febfec`，main；包名版本 `0.1.0-local-beta.1`。
- 复用 A 的不可变安装 release `runtime/libexec/arkts-language-server/0.1.0-local-beta.1-5b4eda43ade994771151d1426fc62bb70b5cbb2583e097b1c795f561ed34dbdf/`。
- server SHA-256：`88797005140b102fd0120dbfc65ae540415ee94f0bd64011f682386b62fd2058`。
- Worker SHA-256：`302a6fbe24a803378c9b3eea2982e94e79f1cc259db2b8bff549084b04c0d077`。
- 原生索引 SHA-256：`8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。
- macOS 26.6.2 / 25G83，x86_64，16GiB；Node `/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node`；ohos-typescript 4.9.5-r10、vscode-jsonrpc 8.2.0、vscode-languageserver 9.0.1。
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API 24 / component 6.1.1.125，metadata identified；没有认证完整声明树。
- 原项目 `/Users/liuhui/Documents/code/applications_photos_30k`，30000 个 `.ts/.ets`，173645329 bytes。运行前逐个核对 A 的 30000 个源码 SHA，全部相同；收尾再核对，见 B `input-and-process-closeout.json`。
- 目标固定 `product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_002.ets`，`filterMediaType`，LSP `{line:76,character:20}`，0-based UTF-16；实际行为 `params.filterMediaType = wantParam?.filterMediaType as string;`。

每个补测使用新的语言进程、Worker、索引缓存目录，串行执行。没有提高默认 4192MiB heap limit，没有改变任何产品 deadline；沿用 400ms RSS 采样、Node RSS 1536MiB / 总运行 90s 的外部保护。
这些是语义会话冷态；OS 页缓存未清空，且输入哈希检查已读过源码，不能称 OS 冷缓存。
真实项目、SDK、产品文件未写入；Zed 测试窗口及用户编辑保持原状。本次没有尝试绕过辅助功能权限，也没有执行真实 UI 点击。
收尾 `git ls-remote origin refs/heads/main` 仍为同一完整提交，系统 `memory_pressure -Q` 显示 16GiB、free percentage 68%；原始命令输出转录保存在 B `environment-closeout.json`。

## 原始错误与逐请求时间线

### 普通协议：产品截止时间先发生

证据 A `protocol-baseline-plain/actions.ndjson`、`server-stdout.raw`、`logs/server.log`。

| UTC | 事件 |
| --- | --- |
| 04:22:01.659 | PID 47653，物理 Worker thread 1 启动 |
| 04:22:04.415 | 初始化完成，2765.093ms，degraded；之后 didOpen、发送 LSP id 2 definition |
| 04:22:34.432 | watchdog：`execution-deadline, method=define, epoch=1, commandId=2, elapsedMs=30005.450175, limitMs=30000` |
| 04:22:34.536–.537 | 服务记录 request.completed error；driver 收到 id 2 错误，总耗时 30120.812ms |
| 04:22:34.537 | driver 另外发送 id 3 references；它不是 definition 内部的嵌套请求 |
| 04:22:34.836 | driver 的外部 RSS 保护发 SIGTERM |
| 04:22:35.000–.001 | 进程退出；id 3 在 463.499ms 时运输中断，没有 LSP 响应 |

id 2 的完整错误正文如下，**没有 `data` 字段**：

```json
{"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"Request textDocument/definition failed with message: Semantic worker unavailable"}}
```

watchdog 同时记录 `phase=program, Program starts/returns=1/0, checker=0/0, synchronization=1/0`。
该原运行只观察到一个 Worker 启动，外部停止早于完成旧 Worker 退役/新 Worker 建立；不能说已经换代成功。

### 33 次序列：外部保护先发生

证据 A `protocol-sequence-observed/actions.ndjson`、`observations-*.ndjson`、`resources.ndjson`。

- PID 47774 / Worker thread 1，epoch 1；initialize 后立即 didOpen、发送 id 2 definition，因此与初始化存在重叠。
- 04:24:16.064，RSS 采样超过界限，driver 记录 `external-diagnostic-rss-limit` 并发 SIGTERM；04:24:16.194 记录退出和 request interruption。
- id 2 的 28089.706ms 是**到运输中断**，没有 error code/message/data 响应。该运行没有在停止前记录产品 watchdog 触发。
- 最后观测：282 个 Program 总入口，280 项目入口；完成至少 8900 次 parse，8761 个不同项目文件、139 个项目外文件；Program 未返回。剩余 32 个定义及 references 未发送。

### 真实 Zed：自动请求与一次恢复

证据 A `zed-ui-trusted-restart/wire.ndjson`、双向 `.raw`、`logs/server.log`。真实 Zed PID 48679，tee proxy 48714，LSP 49140，原生索引 49168。原始 frame 中 server.spawned 已确认上述 server 字节身份。

| UTC | 客户端/内部事件 | 世代或结果 |
| --- | --- | --- |
| 04:42:58.993 | Worker 启动 | thread 1 |
| 04:42:59.017 | didOpen，目标 v0 | 文本与磁盘一致 |
| 04:42:59.182 | id 2 documentHighlight，76:20 | 与初始化重叠 |
| 04:42:59.349 | id 3 codeAction，空 diagnostics、range 起止均为 76:20 | 与初始化重叠 |
| 04:43:01.187 | 初始化 degraded，2198.772ms | 原因 project-membership-incomplete |
| 04:43:04.315 / .316 | 同 URI didClose → didOpen v0 | 无 didChange，两次文本相同；Zed 内部为何重开未测 |
| 04:43:04.319 / .320 | id 2 / 3 返回 [] | superseded；5136.925 / 4970.653ms，不是语义成功 |
| 04:43:04.350 | 两条 $/cancelRequest，id 2 / 3 | 晚于其响应，不是本次最早取消来源 |
| 04:43:04.482 / .650 | id 4 highlight / id 5 codeAction | 归属旧世代等待队列，内部归属由下节补证 |
| 04:43:05.363 | watchdog cancellation-deadline | 活跃命令 `diagnose, epoch 1, commandId 3`；elapsed 4174.124ms、cancel limit 1000ms |
| 04:43:05.366 | id 4 / 5 错误 | 883.633 / 716.352ms；发生在新 Worker 启动之前 |
| 04:43:06.734 | 第二个 Worker 启动 | thread 2，一次换代 |
| 04:43:07.220 | recovery.complete，回放 1 文档 | 不等于完整 READY 或 Program/checker 已准备 |

真实 Zed 收到的两份完整错误，**两者均无 `data`**：

```json
{"jsonrpc":"2.0","id":4,"error":{"code":-32603,"message":"Request textDocument/documentHighlight failed with message: Semantic worker unavailable"}}
{"jsonrpc":"2.0","id":5,"error":{"code":-32603,"message":"Request textDocument/codeAction failed with message: Semantic worker unavailable"}}
```

原 UI 只观测到旧 epoch 1 及物理 thread 1→2；新 root epoch 的直接记录在下面的协议补测中为 2，不冒充原 UI 已捕获该字段。
真实 UI 没有 definition/references、没有换代后新请求；约 86s 终点后的 cannot read LSP headers 来自诊断主动停止语言进程，不能归入自然 OOM。
watchdog 的 elapsedMs 从命令发送算起，取消阈值则从首次观测到 cancel 算起；因此日志中的 4174ms 不表示 1s 取消阈值拖延了 4s。这个运行触发的是 cancellation-deadline，没有触发 execution/queue deadline。

## 取消、队列与恢复：补测拿到的内部证据

B `lifecycle-retry/` 用原真实 Zed 捕获的 initialize capabilities、配置、文档文本、请求位置及相对发送节奏重放公开 LSP。只替换 initialize.processId 为 driver PID，管理类服务端请求正常回复；并非原生 UI。
没有注入编译器故障，且重现 id 4/5 同样的 -32603。

| UTC，2026-10-26 | 实际观察 |
| --- | --- |
| 06:48:40.891 | 物理 thread 1 创建；registerRoot epoch 1、initialPreparationConsumed=false |
| 06:48:40.905 | 首次 didOpen 使正在准备的 semanticReadiness command 1 首先被标记 contentModified；共享初始化正常重试 command 2，不换代 |
| 06:48:43.352 / .354 | 内部 diagnose command 3 发送/dispatch，epoch 1/thread 1；后面的 highlight、codeAction 仅入队 |
| 06:48:43.456 | diagnose 的 createProgram 开始，282 总入口、280 项目入口 |
| 06:48:46.180 | didClose 的 semantic.close → mutate → invalidateRequests 赢得活跃 command 3 的取消 CAS，state=2/contentModified |
| 06:48:46.183 | 旧前台 id 2/3 返回 superseded []；后来的客户端 cancel 已无对应活跃前台请求 |
| 06:48:46.369 / .514 | id 4/5 入 epoch 1 队列，traceId 7/8；无 workerRequestId、无 send/dispatch，尚未进入 Worker/编译器 |
| 06:48:47.218–.222 | cancellation-deadline → recovery → 旧 supervisor.dispose 拒绝队列；id 4/5 返回错误 |
| 06:48:48.320 / .329 | 产品显式调用 thread 1 terminate；exit=1，确认实际退出 |
| 06:48:48.612 | thread 2 创建，registerRoot epoch 2、initialPreparationConsumed=true；从权威状态回放 1 个打开文档 |
| 06:48:49.142–.143 | recovery.complete，pending 清除 |
| 06:48:49.179 | 显式发送新 definition id 100；实际 Worker command 1、epoch 2/thread 2 |
| 06:48:53.982 | id 100 成功，4803.219ms，返回 1 个正确位置 |
| 06:48:53.984–54.033 | 重复 id 101，Worker command 2，同一位置，50.296ms |

正确位置为 `feature/thirdselect/src/main/ets/default/utils/ThirdSelectConstants.ts`，range `30:2–30:17`（0-based），磁盘该行 `filterMediaType: string;`。
这不是把空结果、superseded 或重启完成计为成功。新 Worker 的 createProgram 只有一次，返回 421 个 SourceFile（87 项目 +334 外部）；重复请求没有再次调用 createProgram，支持该次 Program/AST 复用，**没有单独证明某个结果缓存命中**。

`parent.ndjson` 保存取消 CAS 调用栈：`run-language-server didClose → SemanticWorkerEngine.close → SemanticWorkerMutationTracker.mutate → RootSemanticWorkerSupervisor.mutate → #invalidateRequests → cancelSemanticWorkerRequest`。
active diagnose 的 CAS 在 `diagnostics.close` 触发 AbortController 及客户端两条 cancel 之前已被 close mutation 赢得，因此不能写成“Zed cancel 了 diagnose”。

恢复状态快照显示 inputRevision=5、failedInputRevision=5、restarts=[一次时间戳]、automaticRestarts=1、probing=false、failure 未设置；完成后 pending=false。
**没有耗尽恢复预算、没有进入熔断/半开、没有连续无限重建。** 相同输入的健康查询没有重置累计预算，符合现有防止间歇失败无限恢复的约束。
物理 Worker 同时存活峰值为 1，旧 exit 早于新构造；没有捕获旧命令 3 的结果，更没有旧世代结果发布为新请求结果。
thread 2 最后 exit=1 也是 shutdown 时显式 terminate 的结果；两代均没有 `worker.error / ERR_WORKER_OUT_OF_MEMORY`。

前台 id 2/3 的约 5.1/5.0 秒包含等待初始化和等待活跃诊断，不是高亮/codeAction 自身执行了 5 秒。id 4/5 也没有进编译器，错误来自它们所属队列被销毁。
这是**多个并发 LSP 请求排队于一个语义 Worker**，不是 definition 在 Worker 内重入调用 highlight/codeAction，也没有观察到嵌套 verifier Worker；文件 import 递归另属编译器依赖遍历。
原 UI 还有反向 RPC：04:42:59.000 服务端发 client/registerCapability id 0、window/workDoneProgress/create id 1，客户端分别于 .084/.116 回复 null。它们是文件监听注册/进度创建，不是语义查询嵌套，也没有一直等待到 04:43:05；双向 LSP id、内部 Worker command id 属于不同命名空间。
恢复完成只证明根注册、最新打开文档回放与 mutation 屏障恢复；恢复过程没有自动重新执行已终结的前台请求。原真实 UI 是否会自行重试，本次没有 UI 权限，仍未验证。

## 从 LSP 到实际安装编译器的调用链

以下源码位置固定于 17e923f；产物行号对应上述 SHA，避免用另一个版本的 TypeScript 源码归因。

| 层与函数 | 关键位置 | 本次作用/分支 |
| --- | --- | --- |
| LSP definition / highlight / codeAction | `src/lsp/run-language-server.ts:389,279`；`src/lsp/register-semantic-capabilities.ts:242` | 通过 requests.run 建立文档版本和取消围栏 |
| 自动诊断 | `src/lsp/run-language-server.ts:197`；`src/lsp/document-diagnostics.ts:8,68,79` | didOpen 后正常 75ms debounce，调用 semantic.diagnose；不是客户端 LSP request id 3 |
| 文档关闭 | `src/lsp/run-language-server.ts:271–277` | 先 freshness 取消旧前台，再 semantic.close，再 diagnostics.close |
| Worker proxy | `src/semantic/semantic-worker-proxy.ts:174,189,392,460,479`；`semantic-worker-document-request.ts:8` | 同步快照、关闭 mutation、请求准备；authoritative documents 留在未阻塞父线程 |
| 共享初始化/恢复准入 | `src/semantic/worker-project-preparation.ts:45–68`；`semantic-worker-recycle.ts:45–57` | 等共享准备/恢复；已经入旧队列的请求不因之后开始恢复而自动迁移 |
| supervisor mutation / dispatch | `src/semantic/semantic-worker-supervisor.ts:209,303,514` | mutation 失效活跃请求和旧等待请求；同根活跃命令串行 |
| watchdog | `src/semantic/semantic-worker-watchdog.ts:11–21,75–96` | 普通 define 30s；取消后 1s；记录 progress 并调用 host onFailure |
| 退役与队列终态 | `semantic-worker-host.ts:158`；`semantic-worker-supervisor.ts:271–300` | 切换到 draining；dispose 立即用 worker-unavailable 拒绝尚在旧队列的请求 |
| 物理退出与重建 | `semantic-worker-retirement.ts:23`；`semantic-worker-shutdown.ts:4`；`semantic-worker-recycle.ts:126–151` | 等 drain，shutdown 等待上限 1s，必要时 terminate；确认旧 exit，再退避、创建新 Worker、回放权威状态 |
| 恢复预算 | `semantic-worker-failure-recovery.ts:76–109` | 共享三次上限/180s 速率窗，首轮退避 250ms；本次只使用一次 |
| 旧响应围栏 | `semantic-worker-host.ts:211–218`；`semantic-worker-supervisor.ts:648–669` | epoch、command id、appliedRevision、documentVersion 校验，draining 响应只用于旧终态 |
| Worker runtime | `src/semantic/semantic-worker-runtime.ts:106,177,249,283` | 根注册、mutation 应用、取消作用域、按方法 invoke |
| 语义实现 | `src/semantic/legacy-semantic-engine.ts:315,605`；`src/core/types/type-engine.ts:185` | define/diagnose 准备交互工作区；没有合法 group 时走根上下文 |
| 查询租约与具体编译器查询 | `src/core/types/type-engine.ts:230,284,307`；`type-workspace-entry.ts:72`；`typescript-language-service.ts:725,1214,1372` | withLease → runPreparedSemanticQuery → define/definitionCandidates → getDefinitionAtPosition；diagnostics → getSyntacticDiagnostics/getSemanticDiagnostics，进入下述可恢复 service facade |
| Host | `src/core/types/typescript-language-service.ts:1650,1666,1669,1710,1728` | getScriptFileNames、getScriptSnapshot、resolveModuleNames/resolveModule 回调 |
| 可恢复编译器适配 | `src/semantic/backends/ohos-typescript/recoverable-language-service.ts:63–80` | checkpoint → 同步提交屏障内 raw service.getProgram → checkpoint；真正同步抛错才 retire owner/结清租约 |
| 取消提交屏障 | `src/semantic/semantic-cancellation-scope.ts:13,35–41` | synchronize 期间 Host token 暂返 false，保留 cell，父线程 watchdog 不受此屏障限制 |
| 实装编译器 | `node_modules/.pnpm/ohos-typescript@4.9.5-r10/node_modules/ohos-typescript/lib/typescript.js:124527,124351,124460,124465` | getProgram → synchronizeHostData → createProgram → **返回后** getTypeChecker |

上述编译器文件的 createProgram 定义在 107890、createTypeChecker 在 45964、bindSourceFile 在 42257。
实际 Worker bundle 对应：synchronizeHostData 135021、getProgram 135204、createProgram 117983、createTypeChecker 50903、bindSourceFile 46760、processImportedModules 119920。
本次观察点区分的是实际 `createProgram` 返回、checker 执行及外围 synchronize 返回，不能把 `Program returns=0` 解释成“createProgram 尚未开始”。

普通/补测两条长定义均没有 compiler exception 事件，未走“编译器真正抛错后 owner 重建”的分支；当前活性终态是父线程 deadline 退役。
此前 lastProjectVersion 提前提交缺陷属于另一个已处理的异常场景；虽然实装编译器仍在 124360 提前写版本，但本次没有同版本异常重试提前返回的证据，不能套用旧根因。

错误变成 -32603 的末段为：`SemanticWorkerSupervisorError("worker-unavailable")` 是带字符串 code 的普通 Error（`semantic-worker-supervisor-errors.ts:10`）；
`semantic-request-runner.ts:161–179` 只专门处理取消、过期、workspace-incomplete 等分支，当前 id 4/5 不满足这些分支，直接抛出；
vscode-jsonrpc 8.2.0 `lib/common/connection.js:514,532` 将它包装成 InternalError，使用 `Request … failed with message: …`，没有转成含内部 code/cause 的 data。
实际 server bundle 对应 3181/3195。**线上 payload 丢失了可恢复/退役原因，内部日志才区分 execution-deadline 与 cancellation-deadline。**

## Program 未返回：热点与文件数

### 入口为什么被放大

| 路径 | 代码证据 | 运行证据 |
| --- | --- | --- |
| membership 不完整 | `document-store.ts:32,1122`，默认 20000 路径上限 | 本次补测 membership=20000、2457452 path bytes，partial/path-count-limit |
| 初始化预装先发生 | `document-store.ts:820–831` prepareRoot 取首成员，includeWorkspaceFiles=true；`project-readiness.ts:30`；`type-engine.ts:441–445`；`type-workspace-entry.ts:67` | 首成员为 common/CommonComponents.ets；初始化入口预装在 readiness 拒绝前发生 |
| degraded 返回晚于 engine 准备 | `typescript-semantic-readiness.ts:143` | 局部未知没有主动抛整个进程；但已留下根 engine scripts |
| partial 不分组 | `semantic-groups.ts:60–64`；`type-engine.ts:185–189` | all()=[]，交互请求退回根 engine |
| 驻留文本进入根集合 | `typescript-host-file-names.ts:9–13,17–20` | 无显式 semantic roots 时，resident scripts 作为 extras，交给 Host |

B `root-comparison.json` 逐项由保存的 roots 列表生成：

| 补测 | 总入口 | 项目入口 | 复制文件入口 | CommonComponents / index 入口 | Program 返回 |
| --- | ---: | ---: | ---: | --- | --- |
| program-profile / io-detail 的首次 definition | 283 | 281 | 143 | 109 / 35 | 否 |
| lifecycle-retry 旧 diagnose | 282 | 280 | 142 | 109 / 34 | 否 |
| 同会话换代后新 definition | 89 | 87 | 1 | 0 / 1 | 是，421 个 SourceFile |

新入口集合完全是旧集合的子集，少了 193 个入口。复制 barrel 的相对 export 也被复制重写，例如 `CommonComponents__copy_002.ets:15,17` 导向 `TabItem__copy_002`、`ActionBar__copy_002`；它们是多份有效依赖闭包，不是 29712 个全部未引用的空文件。
新代 registerRoot 的 `initialPreparationConsumed=true` 保留初始化生命周期事实，恢复只回放打开文档，没有重做全根初始化预装；随后目标局部依赖得到 87 个项目入口。该字段不等于 READY，也不等于 Program/AST 已暖好。
因此成功重试同时改变了**驻留入口历史**，不能把 30s→4.8s 全部解释成 OS 缓存或一般性的“重启就修好”。
此前 [OOM 诊断报告](2026-10-26-macos-zed-30k-oom.md) 的 `counterfactual-no-partial-root-preload/` 单变量诊断也支持这条机制；它改变了预装时机和低堆条件，不能拿其 3892ms 直接与本轮计收益，亦不是本次修改产品的授权。

### 不重叠的构建前缀耗时

B `io-detail/` 是独立受保护运行：无 CPU profiler，细化 FS API 观察；definition 仍在 30143.609ms 返回同一 -32603，没有触及外部 RSS 保护。
请求起点 06:59:32.360 → createProgram 开始 06:59:32.518（约 158.6ms）；最后完整检查点 07:00:01.999；watchdog 07:00:02.393；错误响应 07:00:02.502。
初始化 membership 扫描约 1636.6ms，已在该查询开始前完成，**不加进这 30.14 秒查询区间**。
此处比例仅对应 io-detail 的 definition，不能转用为原真实 Zed diagnose 的独占耗时分布；后者没有 CPU/细 FS 观测。

下面只分解 Program 起点到最后检查点的 **29481ms**，使用同步嵌套计时栈，子调用从父调用扣除，不重复累计：

| 独占计时标签 | ms | 前缀占比 |
| --- | ---: | ---: |
| fs.realpathSync.native | 8552.50 | 29.01% |
| SourceFile parse | 6666.89 | 22.61% |
| Host resolveModuleNames 自身，已扣 FS 子调用 | 4878.68 | 16.55% |
| fs.statSync | 2807.00 | 9.52% |
| fs.lstatSync | 2265.04 | 7.68% |
| Program 其余自身工作 | 1719.67 | 5.83% |
| fs.readSync | 1397.53 | 4.74% |
| fs.openSync | 629.86 | 2.14% |
| Host snapshot 自身，已扣 FS | 359.17 | 1.22% |
| fstat / close / exists / JS realpath 等剩余项 | 205.76 | 0.70% |

全部 FS 标签合计约 **15857.7ms / 53.79%**。标签是插桩运行的墙钟归属，包含该帧内 GC、调度等待和观测成本，不是纯 CPU 或真实磁盘等待时间。
Program 最后检查点到 watchdog 的 **394ms 未细分**；watchdog 到错误响应约 109ms 是终态传播区间，也未细分。未把它们按已测比例补齐；没有将之后 drain 期间还在进行的解析混入此前表格。

同一前缀的关键计数如下，原始字段在 `stages-1.ndjson`，计算在 `diagnosis-summary.json`、`io-detail/stage-summary.json`：

| 计数口径 | 数值 |
| --- | ---: |
| 完成 parse / 不同项目 / 不同项目外 SourceFile | 7600 / 7467 / 133 |
| Host getScriptSnapshot 次数 | 7600 |
| 交给 Host resolveModuleNames 的 module name 总数 | 38191 |
| native realpath / JS realpath 调用 | 186768 / 154 |
| lstat / stat / exists 调用 | 295958 / 214261 / 4408 |
| open / fstat / read / close 调用 | 7422 / 14844 / 14844 / 7422 |
| readSync 实际返回 bytes | 50058352 |
| createProgram 开始 / 返回；checker 开始；bind hook 计数 | 1 / 0；0；0 |

readSync 通常含数据读取及 EOF 探测，不能把 14844 次 API 调用写成 14844 个文件；上述 bytes 也不等于物理磁盘读量。
前缀 parse 总数与项目/外部不同路径之和相等（7600=7467+133），本样本没有证明同一源码被反复 parse；已直接证明的是**很多不同依赖的展开，以及相同路径身份的重复核验**。
statSync 抛出次数 30713，没有采集错误码分布，不能全部当成损坏文件/权限错误，更不能与 LSP -32603 数量等同。
路径频次观测每个 API 最多保留最早 4096 个不同路径，只是截取范围内的频次；其中 utils 目录被 native realpath 17044 次、model/common 16772 次、model/browser/photo 7422 次，不能宣称完整全局排序。

### 真实 CPU 栈与身份核验热点

B `program-profile/worker-1.cpuprofile` 使用 Node 26.3.0 的父线程 Worker.startCpuProfile，在同步编译器仍忙时由未阻塞父线程停止采样。API 边界见 [对应 Node 官方文档](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html#workerstartcpuprofile)。
先用有限 3s 同步工作验证该观测能力，采样停止调用约 506.6ms 返回；没有向实际 LSP 注入无限循环。
正式窗口 18044.689ms，14444 samples、22738 nodes，按 timeDeltas 加权 18044.582ms；包含 Worker 启动/初始化，不是完整 30s 请求的无开销剖析。
V8 self 栈权重：native realpath 4121.019ms（22.84%），lstat 1781.046ms（9.87%），read 1000.505ms（5.54%），GC 668.067ms（3.70%）。这些来自另一运行，不能与上表相加。

实际高权重栈（省略观测 wrapper，调用方向从入口到叶子）：

```text
createProgram → findSourceFile / processImportedModules
  → resolveModuleNames → resolveTypeScriptModule → relativeModuleCandidate
  → verifierSdkFileExists → witnessedFileExists
  → LoadedConfigurationWitness.observe → lookupIdentity → fs.realpathSync.native
```

原始栈中的 Worker bundle 行：processImportedModules 119920，resolveModuleNames 188103，resolveTypeScriptModule 186291，relativeModuleCandidate 186274，witnessedFileExists 180954，observe 180742，lookupIdentity 180899；另一条实际热点来自 installedSourcePath 184279。
源码对应 `typescript-module-resolution.ts:27,51–64`、`typescript-relative-module-candidate.ts:9–23`、`typescript-resolution-witness.ts:12–16`、`loaded-configuration-witness.ts:27–34,199–245`。
每次 witness.observe 都在 load 前后各 lookupIdentity；候选缺失会沿父目录找存在的祖先，执行 lstat/realpath/stat。Map 留存证明不意味着后续 observe 跳过实际核验。这解释了读 7422 个文件却出现数十万路径 API 调用。
当前已有请求内模块解析缓存（`typescript-query-module-resolution.ts:6–8,16–45`），默认启用；其 resolve 路径只在最早 32 次调用使用模块缓存，第 33 次清空，目录 presence 也最多保留 32 项。相对候选的 witness/installedSourcePath 仍有自己的实际核验路径；没有采集缓存命中计数，不能宣称完全没有缓存或把全部重复探测归于该上限。
源码读取还经过 `workspace-disk-source.ts:20–88` 的 open/read/fstat 前后校验，所以只计 readFileSync 会漏掉真实读取；前两次补测的 readFileSync=3 **不是只读了三个源码文件**。

到检查点，解析计数及不同文件数持续前进，支持“在展开大量不同依赖并做重复身份核验”，没有证据将全区间写成阻塞不前的死循环。
checker/bind 尚未进入，故当前已测长区间不能归因于类型检查、绑定或引用结果合并；后续若允许全构建结束，仍可能有额外成本，本次未测。

CPU 原始导出中 20 个 `RegExp:` functionName 元数据字符串含未转义反斜杠，原文件原样保留；`analyze.py` 仅重新 JSON 编码这些完整字符串后生成 normalized.cpuprofile，没有改节点、栈关系或时间权重。变换位置和双份 SHA 见 `profile-json-normalization.json`，派生统计见 `cpu-summary.json`。

## Node 与原生索引资源

每个 PID 的 RSS 只记一次，Node 值包括主线程和 Worker 共享进程内存；不把各 isolate RSS 再相加。不同进程的 RSS 和仍可能含共享映射页，不是物理独占内存。

| 本次补测 | Node PID / RSS 采样峰值 MiB | 原生 PID / 独立峰值 MiB | 同一次采样两者合计峰值 MiB | 终点 |
| --- | --- | --- | ---: | --- |
| program-profile | 51729 / 1370.313 | 51731 / 2922.559 | 4277.445 | 产品 deadline 错误后正常 shutdown，进程 exit 0 |
| io-detail | 51977 / 1162.609 | 51979 / 3033.566 | 4145.738 | 产品 deadline 错误后正常 shutdown，进程 exit 0 |
| lifecycle-retry | 51901 / 542.379 | 51903 / 2746.715 | 3166.223 | 保留前两个错误，后续重试成功，正常 shutdown/exit 0 |

独立峰值不保证同时发生，不能直接相加替代第四列。所有补测均未触及外部 RSS/runtime 界限，未发现 fatal OOM；失败样本仍标记 contains-rpc-errors，没有把进程正常退出记为全操作通过。
RSS 趋势在 B `resource-trends.json`：例如 program-profile 首采样后 4.826s、14.838s、24.868s，Node 分别 399.094、603.316、1004.258MiB；原生分别 918.074、1595.746、2922.523MiB。
资源采样 400ms，未承诺捕获瞬时绝对峰值；没有完整 heap/retainer/原生分配归属分析，不能以 RSS 未即时下降证明泄漏。

`program-profile/native-index.sample.txt` 对**独立原生进程**做了 1s/1ms sample，命中 `catalog::scan_workspace → parse_document_batch → document_metadata::parse_document_symbols`。
源码 `crates/index-sidecar/src/catalog.rs:38,178,198,522,561` 显示最多 4 个 Rust 解析线程，分批解析后将 DocumentSymbols 累积在 Vec，稍后激活 catalog。该批处理不同于语义 Program 分组，也不共享 Node AST。
该快照的 physical footprint=2.4G 与 RSS 不是同一统计口径；没有用它代替内存表。采样和源码证明索引在独立扫描/解析并积累结果，不能精确把其约 3GiB 全归给 Vec 或 SQLite。
自动 workspace 索引在 `run-language-server.ts:193` 启动；本次没有发现 definition 的 Program 构建等待原生索引完成的调用关系。两者并发占用同机 CPU/内存，但没有禁用索引的单变量对照，不能量化其对 30s 的贡献或宣称索引是超时直接触发者。

## 最小修复建议与验证边界

1. **首先隔离 partial 初始化预装与交互 Program 根。** 从 prepareProjectReadiness / queryWorkspaceReadiness 的初始化准备边界处理，保留共享 SDK 提前初始化；项目预装文档不能因驻留而全部成为后续交互入口。用本例入口 281→87、依赖展开差异检验，不直接提高 20K 常量或延长 deadline。partial/readiness 和完整引用合同仍必须诚实保留。
2. **随后明确恢复中请求的队列归属与公开错误合同。** 本例未 dispatch 的当前前台请求因旧 supervisor 退役得到通用 -32603，用户看不到是恢复中。最小候选是准确的可恢复错误分类/结构化原因；如希望保留等待中的新请求，应在恢复稳定的准入层持有，迁移时重验文档版本/取消/预算，仅限尚未执行的请求。ADR 0020 的不自动重放已执行请求、单一终态及旧世代隔离不得被绕过。需要单独审阅合同，不能简单 catch 后无限 retry。
3. **记录身份证明调用放大，缓存性能 TODO 继续暂缓。** 数据支持后续评估请求内相同路径/目录证明的复用，但不能删 freshness/路径身份核验或全路径小写绕过。此轮没有实施缓存、Host version、Program 增量或索引路线优化。

后续产品修复应先有公开 framed-stdio LSP RED 回归：partial 初始化仍完成 SDK 共享准备；打开→自动诊断→close/open→前台请求→恢复→新查询；旧结果不发布、请求只终结一次；取消提交屏障与同步不返回；连续/间歇失败预算；配置/文档回放与关闭回收；完整 references 在 partial 下仍遵守完整性错误。原生索引的内存归属只能另行测量，不能顺带重启暂停路线。
本次只做诊断私有脚本和报告，不跑产品修复的 RED→GREEN 或宣称全量 pnpm 检查通过；无合并候选、无发布。

尚未证实：原用户 4GiB OOM 的精确请求归属、当前 main 在无保护条件下是否最终 OOM、是否有长期泄漏、完整构建最终文件数与后续 checker 成本、OS 物理读量、原生精确保留对象分布，以及真实 UI 换代后连续点击是否恢复。
原 UI 内部 close/open 的生成原因也未观测；本次保留未保存编辑且不绕过系统权限，没有把协议重放等同于 UI 操作。

## 复现命令、证据与观测限制

从仓库根执行，tag 必须新建，不覆盖任何失败数据；命令会正常请求固定的真实 30K 目录，并沿上述资源界限清理自己启动的进程。

```sh
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node .bench/zed-30k-unavailable-cause-20261026/run.mjs profile fresh-profile
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node .bench/zed-30k-unavailable-cause-20261026/run.mjs io fresh-io
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node .bench/zed-30k-unavailable-cause-20261026/run.mjs ui-replay fresh-lifecycle
python3 .bench/zed-30k-unavailable-cause-20261026/analyze.py
python3 .bench/zed-30k-unavailable-cause-20261026/closeout.py
```

三个 fresh tag 命令复现新的独立会话；analyze.py / closeout.py 则重算本次归档的 program-profile、io-detail、lifecycle-retry 证据，不会自动把新 tag 数据混入旧报告。新运行的逐次输出在各自 tag 目录，需按其自身身份和终点另行分析。
前两次 profile / lifecycle-retry 的 FS 观察只有 readFileSync/stat/lstat/exists/readdir；发现真实源码使用 open/read 后，在 io-detail 前扩展 FS 观察。当前 observer 文件为扩展版；重跑 profile/ui-replay 将带扩展计数，不能据此要求与旧样本时间逐字一致。完整产品字节始终相同，原阶段日志与 CPU profile 保留旧观测覆盖。
观测通过私有 preload 在加载内存中包裹原函数，保留实参、返回、异常和原取消状态；不修改磁盘产品。但 JSON 日志/FS wrapper/CPU sampler 有开销，**不能把普通 30120.812ms 与插桩 30135.048 / 30143.609ms 的差当成已量化插桩开销**，三者均主要受同一 30s 产品 deadline 截断。
`parent.ndjson` 的早期 sent/received 行中 `id` 被 protocol command id 覆盖；构造/exit 行 id 才是物理 thread id。分析使用 protocol epoch 加结构化 queue 的 workerThreadId，不把两者混算；该限制也写入 diagnosis-summary.json。

证据入口：

- A `zed-ui-trusted-restart/wire.ndjson`：原真实 Zed 完整错误、输入顺序和时间；A `protocol-*/actions.ndjson`：协议定义错误或运输中断。
- B `original-timelines.json`：从原日志派生的三场景时间线，普通协议错误正文仍以 actions/raw 为准。
- B `lifecycle-retry/actions.ndjson`、`parent.ndjson`、`logs/server.log`、`stages-1/2.ndjson`：请求、取消栈、预算、物理退出、epoch 及正确重试。
- B `program-profile/worker-1.cpuprofile`、`worker-1.normalized.cpuprofile`、`profile-json-normalization.json`、`cpu-summary.json`：CPU 原始证据与有审计的派生统计；`native-index.sample.txt`：原生真实栈。
- B `io-detail/stages-1.ndjson`、`stage-summary.json`、`diagnosis-summary.json`：截止前不重叠耗时及 FS/解析计数；`root-comparison.json`：入口身份对照。
- B 各运行 `stdout.raw`、`stderr.raw`、`result.json`、`resources.ndjson`，及 `resource-trends.json`：完整响应、失败、资源和终点；不排除失败样本。
- B `input-before.json`、`input-and-process-closeout.json`、`evidence-manifest.json`：源码/SDK metadata/产物一致性、1938 项原有跟踪输入、6 个本次 Node/原生 PID 退出及证据 SHA。保留原测试 Zed 和不属于本次的 PID 71918。

收尾断言通过：30000/30000 源码内容、路径和总 bytes 与运行前一致，1938 项原有跟踪输入无变化，所验 SDK metadata 与三份产品产物 SHA 一致，6 个本次 PID 均已退出。此次没有执行产品源码修改或合并。

2026-10-27后续：本报告保留17e923f基准与原窗口结论。相关修复、公开RED/GREEN、最终2050/2050 fast、
规模对照及仍未闭环项见[实施报告](2026-10-26-30k-optimization-execution.md)和[逐项清单](../plans/2026-10-26-30k-interactive-recovery-checklist.md)。
本轮未把协议重放当真实点击，也未将自然OOM或>20K完整global能力宣称已解决。
