# Zed 问题的跨平台根因与验证覆盖审计

日期：2026-10-24。已完成证据复核、Mac/Windows 最小复现及 Mac Photos 控制对照。
本轮只诊断、记录问题，不修改产品行为，不合并、发布或推进暂停的缓存优化。
前置：[真实 Windows UI 报告](2026-10-24-windows-zed-ui-validation.md)、
[冻结候选及此前完整检查](2026-10-24-worker-state-contract-implementation.md)。

## 结论：不是 Mac 没有问题

此前验证有两类缺口：真实客户端场景没有覆盖，以及已有协议诊断没有被完整汇总。
恢复状态合同的局部回归通过，不能作为整个编辑器体验通过的依据。

| 问题 | 原 Mac 证据及遗漏 | 本次结论 |
| --- | --- | --- |
| ZUI-01 补全详情 stale ERROR | 最新普通 Photos 三轮没有 completion/resolve；既有负向测试还要求过期句柄返回 -32602 | Mac、Windows 均复现；关闭后的句柄删除与无关 mutation 的在途取消是两条不同路径，被统一映射为 InvalidParams |
| ZUI-02 重命名入口不可用 | Photos 三轮没有 rename；功能测试使用人工声明 transactional 的客户端，负向测试把缺少该字段时不广告记为 PASS | 实际 Zed 缺少 failureHandling，被服务额外的能力前提挡住；不是 Windows 路径或重命名算法超时 |
| ZUI-03 编辑/引用视图后的慢引用 | 最新普通三轮没有 references；此前 Mac 大规模慢引用早已记录并暂停优化 | 同快照约 2ms，另一个文档 open/close 后约 744ms 且 miss；Windows 实际 UI 反复打开/关闭结果文件，九次全是 miss |
| ZUI-04 冷初始化时查询等待 | Mac 初始化中位数 19.402s 已记录；普通计时先等待初始化终态，之后才发定义 | Windows 34.5s 包含初始化等待；新 Mac 控制场同样出现 23.223s 冷定义 |
| ZUI-05 degraded、源码诊断及 SDK 资格 | Mac 原三轮均 degraded，且每轮已经收到与 Windows 相同的四类源码诊断；此前只汇总了日志级别及 RPC error | 有真实输入缺口及 ETS 配置缺口；这些诊断不是 Windows 新出现，也不是 Worker 恢复状态失败 |

特别是 ZUI-05，不能说“Mac 没测出来”：原始协议已经记录，之前的审阅漏列了 `publishDiagnostics`。
普通查询结果的局部成员范围正确、RPC 没有 error、日志没有 error/warn，都不能证明没有源码诊断或全项目 READY。

## 版本、执行入口与实验范围

分支 `fix/windows-path-identity-20261022`；父提交 `e35459131366a32c48c10d1d74adef74357cd3dc`，保留继承的未提交修改。
候选由 919 项输入清单 SHA256 `e634a5662d0d04535744e39da7c7abf0042daad85fc098f16657d5ca0fdb19a9` 绑定，不能仅用父提交命名。
server SHA256 `ade1d78e8240c742595aefecb77bc7bb69f6f29745f70dfa71d3bfc858c543d5`；
Worker SHA256 `17a806c36eac090e1f66ac7ded6a4ba6a4bb7a33fef6dde8a092ec8ee697d95d`。
Node 两端均 20.19.5；固定 `ohos-typescript@4.9.5-r10` 原文件 SHA256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

最小复现通过真实子进程、Content-Length stdio 和生产 Worker 执行，只有 Alpha、Unrelated 两个文件。
使用从真实 Windows Zed 1.25.3 捕获的完整 capabilities；这属于协议对照，**不是 Mac Zed UI 验收**。
夹具 SDK 的 preparation 是 sdk-coverage-unproven；该夹具用于隔离文档事件和 resolve，不能认证全 SDK 语义。
Mac/Windows 各一轮普通、一轮只读观测；每轮 12 条公开查询，共 48 条逐次记录，另外各有能力协商对照会话。
没有编译故障注入、延时注入或扩大产品截止时间。普通与观测数据分开，未用小夹具时延评估 Photos 性能。

观测器只在内存中对固定 server bundle 的六处已知接缝追加日志，校验原 SHA 后才运行；
不更改结果、条件、返回值或磁盘 bundle。原始未插桩轮也复现相同症状，故结论不依赖插桩制造失败。
每轮正常 shutdown/exit 均完成、服务退出 0。Windows 串行命令 exit=0/0；这是“复现和健康对照成立”，不是问题已修复。

## ZUI-01：两类失效被混成“未知或过期补全项”

公开调用链：
[onCompletion 保存句柄](../../src/lsp/run-language-server.ts#L307) →
[CompletionResolutionStore](../../src/lsp/completion-resolution-store.ts#L19) →
[onCompletionResolve 前置检查](../../src/lsp/run-language-server.ts#L343) →
[SemanticWorkerEngine.resolveCompletion](../../src/semantic/semantic-worker-proxy.ts#L234) →
[workerDocumentRequest](../../src/semantic/semantic-worker-document-request.ts#L8) → root supervisor → Worker/编译器。

**路径 A：目标文档关闭，句柄确实删除。**
[onDidClose](../../src/lsp/run-language-server.ts#L298) 调用 forgetDocument，并取消该文档/工作区请求。
关闭后再 resolve 原列表，find 返回 undefined，前置检查抛 -32602。
即使随后同 URI、同 version=0 重开，旧句柄也不会重新出现；获取新列表后 resolve 正常。
这与客户端伪造 data 是不同的业务情形，目前错误类别和文案没有区分。

**路径 B：目标文档没变，句柄还有效，但同根其他文件 mutation 使在途请求失效。**
两端都观察到：Alpha version=0、同一个句柄 preflight found=true → Unrelated didOpen 或 didClose →
[supervisor.invalidateRequests](../../src/semantic/semantic-worker-supervisor.ts#L514)，active=resolveCompletion →
content-modified → [SemanticRequestRunner](../../src/lsp/semantic-request-runner.ts#L170) 记 stale 并返回该方法的 fallback=null →
[onCompletionResolve](../../src/lsp/run-language-server.ts#L366) 把 null 改抛为 InvalidParams。
mutation 完成后，**不重新取列表，原句柄又能成功 resolve**，直接排除了“该句柄被无关文档删除”的解释。
目标在 resolve 执行期间关闭，也复现 null fallback → -32602；真实客户端取消则仍是独立的 -32800。

| 同一最小复现中的操作 | Mac / Windows 普通与观测轮结果 |
| --- | --- |
| 正常 resolve | 成功 |
| 目标关闭后 resolve 旧句柄 | -32602 |
| 原 URI/version 重开后再用旧句柄 | -32602 |
| 获取新列表后 resolve | 成功 |
| resolve 在途只打开或关闭 Unrelated | -32602；句柄及目标版本未改 |
| 无关 mutation 结束后用同一未删除句柄 | 成功 |
| 真实 $/cancelRequest | 一个 -32800 |
| resolve 在途关闭目标 | -32602 |

Windows 原始 UI 的 41 次错误中，29 次关闭在先、3 次执行中关闭、9 次目标无事件但别处 mutation。
全部 data 与原列表相同，88 个句柄低于 512 上限。
本次两端控制复现补齐了路径 B 的内部证据；原现场九条没有逐条内部插桩，不能倒填成每条都观测到同一内部 guard。

Zed 对多个补全项循环执行异步 resolve，任务持有列表和 buffer snapshot，并将失败记为 ERROR；
原 UI 帧证明弹窗/文档关闭后仍有后续 resolve。[固定 Zed 源码](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/project/src/lsp_store.rs#L8029)
没有在该循环为这些服务错误做静默处理。这里需要处理普通失效与详情请求生命周期的兼容，不应靠 Worker 重建消除日志。

已有 [负向用例](../../tests/lsp-reliability.test.mjs#L674) 使用 scripted semantic adapter，把编辑后的 stale 与伪造句柄都断言为 -32602。
它保护了旧合同，却没有覆盖生产 Worker 的跨文档交错，也不检查实际 Zed 如何显示这种错误。
所以旧测试 GREEN 和真实 UI ERROR 可以同时成立。

## ZUI-02：服务增加了实际 Zed 不满足的能力前提

真实 Zed 声明 documentChanges=true、prepareSupport=true，但 failureHandling 未声明；
[该构建的共同 LSP 客户端实现](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/lsp/src/lsp.rs#L919)也与捕获 payload 一致。
服务的 [supportsTransactionalRename](../../src/lsp/register-semantic-capabilities.ts#L587)
要求 transactional 或 textOnlyTransactional，故 initialize response 没有 renameProvider，UI 不发 prepareRename/rename。

两端使用同一实际 capabilities 都不广告；诊断客户端只增加
`workspace.workspaceEdit.failureHandling="textOnlyTransactional"`，就得到 `{prepareProvider:true}`。
这证明阻断发生在协商，尚未执行重命名算法。
[LSP 3.17 的 failureHandling](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/types/workspaceEdit.md)
是可选的编辑失败恢复描述，并不是声明 renameProvider 的通用必填条件；这里是本项目选择的额外安全合同。

此前 [能力负向测试](../../tests/lsp-capability-contract.test.mjs#L148)明确把缺少该字段时不广告记为 PASS；
[重命名功能测试](../../tests/semantic/resident-session-rename.test.mjs#L370)则自行提供 transactional。
缺失的是“真实 Zed 能力下功能是否可达”的验收，不能称作 Windows 专属实现错误。
后续需要审查安全的兼容合同；不能直接删除校验或凭空宣称客户端拥有事务保证。本轮未调整它。

## ZUI-03：引用视图本身就触发根级答案缓存失效

此问题沿用 [OP-04 已暂停 TODO](../plans/2026-10-11-query-performance-follow-up-plan.md#op-04-有界增量快照与编辑失效)，不启动缓存优化。
从 [sync/close](../../src/semantic/semantic-worker-proxy.ts#L174) 到
[#mutate](../../src/semantic/semantic-worker-proxy.ts#L479)，每次真实 open/change/close 都推进 root 输入状态，
并调用 [ReferenceResultCache.invalidateRoot](../../src/semantic/references/reference-result-cache.ts#L65)，删除该 root 的结果并推进其 generation。
索引到候选或 Program/AST 可能仍复用，不能把“结果缓存 miss”直接说成“所有 AST 都重建”。

Mac Photos 使用相同 revision 的隔离归档，288 个源码、固定 SDK，捕获的 Zed 查询目标 callback 32:10、includeDeclaration=true。
7 条引用都返回 52 个位置；只是核对位置数和协议终态，没有独立认证完整绑定关系。
本表是一个串行控制会话的逐次值，不是多轮中位数，也不是 Mac UI 时延。

| 状态与操作 | 客户端完整响应 ms | 产品缓存见证 |
| --- | ---: | --- |
| 首次引用 | 725.269 | miss/store |
| 相同快照，直接重复 | 2.586 | hit |
| 目标不改，仅 SelectManager/AlbumDataImpl open→close 后查询 | 743.887 | miss/store |
| 不再 mutation，直接重复 | 1.910 | hit |
| isTrash true→false，保存并发送相应 watched-file 事件后首查 | 581.473 | miss/store |
| 相同编辑后快照直接重复 | 1.939 | hit |
| 目标仍不变，再开关上述两个视图文件后查询 | 674.295 | miss/store |

上述两文件正是实际 Zed 引用结果视图涉及的文件。Windows 九条引用之间可见这些 open/close，九次均 miss/store。
所以 Windows 标为 repeat 的操作并不是同快照 cache-hit 场景。
Mac 在 degraded 下仍可命中 open-document 结果缓存，代码的
[缓存准入](../../src/semantic/references/reference-cache-admission.ts#L7)也允许这条路径。
degraded 本身不能解释 Windows 所有 repeat 都 miss。

Windows 编辑后首次中位数 4146.941ms、最大 4620.979ms；本轮证明了缓存失效触发条件，没有把这 4.6s 完整拆成独占内部阶段。
真实 UI 还产生后台 resolve/highlight/codeAction，而此 Mac 对照没有重放所有背景流量；硬件、流量与运行时状态也不同。
不能把 Windows 与 Mac 的差额全部归为扫描、CPU、IO、GC 或某一个 Worker 阶段。
先前 2048 文件 [失效诊断](2026-10-22-path-fix-and-cache-invalidation.md)中的全局 Program/Host 和两轮身份核验，是另一个测量范围的证据，不倒填成本次毫秒分解。

## ZUI-04：旧计时在初始化之后，新 UI 点击发生在初始化期间

旧 Mac 普通脚本 [先等待 preparation 终态](../../.bench/state-machine-implementation-20261024/photos-validation.mjs#L55)，
之后才执行首次打开和定义。原三轮初始化为 20998.953 / 18637.934 / 19401.704ms；此前已记录秒级启动。
本次在 initialize 响应后立即发定义，Mac 得到 **23222.927ms**，同样会等待。

公开入口 → SemanticWorkerEngine → workerDocumentRequest →
[WorkerProjectPreparation.request](../../src/semantic/worker-project-preparation.ts#L56) 在非 semanticReadiness 方法中 await 同根 initializations Promise，
再进入实际 Worker 请求。初始化包含分组准备、Program/checker 准备、加载输入校验及依赖完整性检查，见
[prepareProjectReadiness](../../src/semantic/project-readiness.ts#L24)、
[prepareInitialGroups](../../src/core/types/type-engine.ts#L192)、
[prepareOfficialReadiness](../../src/core/types/typescript-semantic-readiness.ts#L151)。

Windows 原始冷请求区间可按实际初始化终态时间分为：

| request id | 完整 ms | 初始化终态之前的区间 ms | 终态之后的区间 ms |
| --- | ---: | ---: | ---: |
| 3 | 33828.323 | 33450 | 379 |
| 6 | 34523.123 | 33153 | 1370 |

这是请求区间与初始化终态的墙钟关系，1ms 时间戳存在舍入；不是 compiler 的独占阶段，也不能跨行相加。
代码的共享 Promise 与实测区间共同解释了为何初始化中点击会出现数十秒。
初始化内部每种扫描、SDK 解析、Program/checker、IO 的独占成本本轮未测，不据此分配百分比。

## ZUI-05：依赖缺失、ETS 元数据缺失与审阅遗漏分别成立

**依赖缺口：** 两端 SDK 都未提供被解析到的 `@ohos.filemanagement.userFileManager`。
Photos 的 AlbumDefine 14:28 导入该模块，固定 compiler 返回 2307；
[完整性检查](../../src/core/types/typescript-semantic-readiness.ts#L168)将其报告为 dependency-inputs-incomplete，semanticState=degraded、无完整输入证明。
SDK 元数据被识别，与项目依赖完整是两个不同条件。当前项目 compileSdkVersion=20，测试输入为 OpenHarmony API24 的声明分发；
未验证缺失模块究竟源自发行包分类、API 变更还是额外系统 SDK，不将版本号更大视为覆盖证明。

**ArkUI 配置缺口：** SDK 输入清单两端都没有 `ets/build-tools/ets-loader/tsconfig.json`。
[officialEtsCompilerOptions](../../src/semantic/backends/ohos-typescript/ets-options.ts#L12)在该文件不存在时返回 feature fallback，未提供 ets.components。
固定 compiler 的 `isCurrentTokenAnEtsComponentExpression` 读取该名单；空名单时，Flex 没走组件表达式路径。
本项目 [SourceDocument](../../src/core/types/source-document.ts#L12)原样把文本传给 compiler，没有另做 ArkUI 语法变换来弥补它。

对完全相同的 PcMainMenuBar 字节，固定编译器以 ScriptKind.ETS=8 和实际 fallback 解析：
1005 位于 35:7，1128 位于 40:4；恢复后的 height 是独立 CallExpression 内的标识符，解释了后续 2304。
只在内存中给同一 parser 调用补入 **现有 SDK component_config.json 的 128 个组件名**，1005/1128 变为 0。
源文件、SDK 和编译器都没改。这是隔离的因果对照，不是可交付 SDK 修复，也不证明 userFileManager 缺口或全工程语义已解决。
代码依据是固定 compiler SHA 下的 createSourceFile 第六个参数及组件解析分支；不将上游当前 TypeScript 文档当作 ETS fork 行为证明。

**审阅遗漏：** 原 Mac 11/12/13 三轮每轮各 12 次诊断通知，包含 8 条非空诊断实例，去重后四类：
RenameMenuOperation 的 2307；PcMainMenuBar 的 1005、1128、2304。
此前报告列过 degraded，但 error/warn=0 和 RPC-error=0 的审阅没有把这些协议消息合并展示。
这是汇总遗漏，不能说它们在 Mac 上不存在。加注释的编辑会使源位置下移一行，代码和消息仍相同。

## 待办、验证边界与证据

五项已登记在[现有执行计划的 ZUI 待办](../plans/2026-10-11-query-performance-follow-up-plan.md#2026-10-24-真实-zed-ui-问题待办)，均未标为修复。
后续验收至少加入：真实能力 payload、批量后台 resolve 与关闭/重开/无关文件交错、真实取消、
同快照和引用视图 mutation 分开的计时、初始化期间到达的查询、实际 SDK 完整性及 publishDiagnostics。
过期句柄与在途失效的响应策略需审查安全合同，禁止发布陈旧 edits；不能以吞错、移除校验或 Worker 重建替代兼容性处理。

证据根：[.bench/windows-ui-cause-20261024](../../.bench/windows-ui-cause-20261024/)。

- `prior-mac-coverage.json`：原三轮实际方法计数、能力、初始化状态和此前漏列的诊断。
- `cross-platform-repro.json`、`minimal-plain2/`、`minimal-probe2/`、`windows/minimal-*/`：48 条逐次请求，原始 wire/操作/观察和退出结果。
- `capabilities-*/`、`windows/capabilities-*/`：只增加一个 failureHandling 字段的能力对照。
- `photos-mac-plain-v3/`、`mac-photos-control-summary.json`：7 条真实 Photos 引用及 cache hit/miss 配对；`cold-query-overlap.json`：Windows 冷请求时间区间。
- `compiler-parse.json`：相同源码、编译器及仅增加组件名单的 parser 对照。
- `research/receipts.json`：固定 Zed commit 的官方源码、LSP 3.17 原文 SHA；Context7 先查询文档，精确行为以固定源码和实际包验证。
- [复现命令](../../.bench/windows-ui-cause-20261024/REPRODUCE.md)、`audit.py`、`summary.json`：可重算入口。

Windows 对照原包 SHA256 `101d4f2207a2a617f00eccf1845a75937e8f481c7a034a2d7a2a32c735ddbe3e`。
Mac Photos 前两次准备阶段因输入指纹断言退出，未进入查询：先发现 498 项 LF/CRLF 差异，随后发现一项中文图片名的清单遗漏。
失败脚本/输出/归档保留；第三次按既有 Windows 573 项指纹逐一转换并匹配，额外图片保留在测量项目外，不放宽源码断言。
原始 Git 归档实际 574 个项目文件；Windows tar 解码后 `figures/1层逻辑.png` 变为 `1灞傞€昏緫.png`，漏出原按 Git 名称采集的哈希表。
Windows 实际还有生成设置，磁盘共 575 项，源码仍 288；旧“573 个项目文件”的表述已补正。这是测试输入审计缺口，不能据此声称产品已完整覆盖非 ASCII 路径。

自然 Windows 无限循环本轮仍未复现；本次错误分类、协商与缓存失效不等于那个现场的自然根因已获证。
原 UI shutdown 未捕获响应的原因仍无 EOF 时点证据；新两端协议复现的正常握手通过，不能倒填为旧 UI 握手通过。
没有新 2 万文件或长期压力验证，没有测当前实际 Program 成员/构建次数；没有把缺失阶段归因。
产品冻结输入、配置、runtime 和 SDK 指纹另行核对；此前完整 2016/2016 属于同字节候选的既有检查，本轮未重跑全量检查。
455 文件冷目录 3 秒门槛继续按用户授权排除，与本轮功能/覆盖遗漏无关；500ms 目标没有降低。

GitHub issue 创建被自动审批拒绝，理由是未明确授权把诊断细节公开到该外部目的地；未重试或绕过，改为本地计划与报告持久化。
`external-recording.json` 保留拒绝和处理方式；没有对外发布。
