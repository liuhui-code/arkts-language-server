# Mac 30K 编辑、撤销后导航不可用：现场与取消接线缺口

日期：2026-10-27。用户原话：“实测在某一个类编辑再撤销后，那个类多点击几次跳转之后，后续再无法在点击跳转。”
用户确认 Mac、08:00 左右，文件：
`/Users/liuhui/Documents/code/applications_photos_30k/product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`。

## 结论与证明边界

1. 现场确实失效。Zed 继续发请求，得到 `Semantic worker unavailable`；并非点击没有发到服务端。
   PID92778 的语义 Worker 共启动8次、恢复完成7次，多次触发恢复停止，最后退役后没有可服务 Worker。
   这次证据没有 OOM；不能把它归为昨天的 OOM、无限循环或单纯 Program 构建未返回。
2. **确认并修复一个能产生同样失效链的生产缺口**：Legacy 引擎给编译器传了 HostCancellationToken，
   却没有给 SemanticDocumentStore 传已有的 operationControl；扫描、依赖读取等检查点因此一直是空操作。
   编辑/撤销撤销了旧请求资格，旧准备却不停下，超过1s取消宽限后由父端终止 Worker；重复发生会进入熔断。
3. 公开 framed-stdio 受控 RED 两轮重现；只是对真实依赖读取加入每次有限40ms延迟，没有伪造取消、心跳、编译器响应或恢复错误。
   旧版两次在失败断言快照时已继续打开25/24个依赖，随后退役，后继定义返回 -32603 `Semantic worker unavailable`。
   修复后 definition/completion 两入口均只读1个依赖即退出；撤销、另一文件的后继 overlay 修改和四次跳转均正确，同一 Worker 无退役。
4. **未把上述缺口等同于全部现场根因**：现场没有第一次取消时的内部调用栈、完整 client wire、精确编辑文本和输入节奏。
   现有计数只能证明退役采样时处于 `request`、观测到的 Program/checker/sync 均已配对返回；不能据此断言具体读哪份文件。
   普通30K协议重放修复前也未复现；真实 Zed 点击验收尚未完成。当前用户 Zed 会话未被重启/替换。

## 输入、运行身份与原始现场

- 分支 `fix/partial-program-lifecycle-20261026`；父提交 `17e923f0cb8c430b6a10793a0f3d2f9097febfec`。
  现场运行的是已含此前未提交优化的v5候选，**不是该父提交的纯净 main**。保留原工作树，没有提交/推送/合并。
- 实际 Zed PID91860，语言服务器PID92778，原生索引PID92783。启动时间本地07:55左右。
- 实际已安装目录见 `running-artifact.json`；server/Worker SHA 与此前冻结v5一致：
  server `118d7575dfbb6cbd65ae87037e64a95fee03fad9d69d759cd785684643270b81`；
  Worker `d600e3c40ac2acdeab70c8521b87ba6c80af75c39aad492aab57fe1531595462`。
  修复候选server SHA不变，Worker SHA `6c583128f7b395053deff52a15d133e0f847bb20ae8d148d9a6bba979ec8efe3`。
- 固定编译器 `ohos-typescript 4.9.5-r10`；SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24 / 6.1.1.125。
  元数据身份识别不代表所有SDK声明/方言都已验证。
- 原现场07:55:43初始化 `degraded`，8027.4ms；随后定义曾正常返回约30ms。
  隔离重放明确观察到初始化原因是 `project-membership-incomplete`；原现场初始化日志只记录状态，没有完整report。
  **degraded 与后来 Worker 不可用是两层状态**，不能把初始化退化直接解释为永久不可服务。
- 原日志真实位置：`~/Library/Logs/arkts-language-server/server.log`、`~/Library/Logs/Zed/Zed.log`。
  完整字节快照 `initial-server.log` / `initial-zed.log`，尺寸/SHA/mtime见 `log-capture.json`。
  仅PID92778过滤结果 `session-92778.ndjson`；没有把其他基准进程的日志混入。
- Zed DB只读复制到 `zed-db-snapshot/` 后查询；未写用户数据库、未丢弃未保存内容、未操作用户 Zed 窗口。

证据根目录统一为 `.bench/edit-undo-definition-20261027/`，下文相对该目录。

## 现场时间线（本地 Asia/Shanghai）

全部触发原因均为 `cancellation-deadline`、原宽限1000ms。commandId是内部Worker命令ID，**不是公开LSP请求ID**。
`elapsedMs`是监督端记录的从sent起耗时，不能当作取消检测后耗时或纯执行耗时。

| 时间 | Worker世代 | commandId | 内部方法 | elapsedMs | 采样阶段 | Program开始/返回 | sync开始/返回 |
| --- | ---: | ---: | --- | ---: | --- | --- | --- |
| 07:57:40.245 | 1 | 70 | complete | 1112.8 | request | 3/3 | 94/94 |
| 07:57:52.302 | 2 | 15 | define | 1127.4 | request | 3/3 | 31/31 |
| 07:57:59.743 | 3 | 9 | define | 1091.0 | request | 1/1 | 20/20 |
| 07:58:09.205 | 4 | 8 | define | 1154.9 | request | 1/1 | 17/17 |
| 08:01:31.408 | 5 | 1 | codeActions | 2867.9 | request | 0/0 | 0/0 |
| 08:03:06.430 | 6 | 1 | complete | 1120.0 | request | 0/0 | 0/0 |
| 08:03:18.195 | 7 | 4 | define | 2364.1 | request | 2/2 | 8/8 |
| 08:05:23.015 | 8 | 16 | define | 1134.6 | request | 1/1 | 24/24 |

- 07:57:40 第一次退役是 `complete`，并非定义本身；随后交互和诊断共享的 Worker 受到影响。
- 07:58:09 首次 `recovery.stopped`；08:01～08:05输入修订曾打开半开探测，又发生退役。
- 08:05:23 世代8失败，08:05:24退役；后续定义/高亮/hover/查引用立即报错，服务器Node进程仍活着。
- 自动恢复的连续次数、180s速率窗口和“新输入＋显式查询”的半开约束仍生效；不是硬编码“总共8次预算”。
  同输入重复点击不能无限补充预算，这个限制保留。
- 现场未记录每个请求的 cancelCell 最终值，不能断言每一次由 `clientCancelled` 还是 `contentModified` 先获胜。
  Zed错误日志有完整错误文本，但无该响应的原始RPC code/data/id；-32603来自下述公开复现，不冒充现场wire。

## 调用链与具体缺口

1. `src/lsp/run-language-server.ts:389` `connection.onDefinition` → `SemanticRequestRunner.run`：
   建立文档版本/新鲜度范围；编辑和撤销都产生新版本。撤销恢复相同文本并不等于退回旧协议版本。
2. `src/semantic/semantic-worker-proxy.ts:263` `define` → preparation/recycle/supervisor request。
   `semantic-worker-supervisor.ts:514` `#invalidateRequests` 在新 mutation 时更新旧请求共享取消状态；
   `:533` `#cancelRequest` 处理客户端取消；已执行请求须让 Worker 结算，不擅自释放执行槽。
3. `semantic-worker-runtime.ts:248` `answerRequest` → `SemanticCancellationScope.run` → `invoke`。
   `semantic-cancellation-scope.ts:35` 的 Host token动态读取该异步作用域中的共享cell；请求前后均检查一次。
4. `LegacySemanticEngine.define`（当前 `legacy-semantic-engine.ts:300`）→ `prepare`（`:698`）→
   `interactive-workspace.ts` `prepareInteractiveContext/prepareInteractiveWorkspace` → `SemanticDocumentStore.prepare`（`:787`附近）。
5. `document-store.ts:1362`附近 `collectDependencyClosure` → `resolveRelativeImports`、`loadFromDiskWithinTransaction` →
   `workspace-disk-source.ts:14` `readDiskSource`。这些函数本已有检查点和失败事务回滚，
   但旧 `LegacySemanticEngine` 第85行只传 `{packageResolver}`，使 store 默认 `NOOP_OPERATION_CONTROL`。
   RED 第一份真实堆栈在 `controlled-red/workspace-reads.ndjson`；编译器Program计数没有增长。
6. 父端 `semantic-worker-watchdog.ts:82`附近检查已开始且已取消的命令；超过原宽限则报告 unresponsive。
   `semantic-worker-failure-recovery.ts:77` `workerFailed` 走共享恢复约束；不能恢复时记 stopped，物理退役在 recycle 中完成。
7. 对照：`type-engine.ts:230` 的 `runPreparedSemanticQuery`、输入终检和 source fence 本来已传 `referenceCheckpoint(hostCancellationToken)`。
   因此本轮没有把终检全部删掉，也没有把所有 `phase=request` 工作加入同步免取消区。

## 最小修复与正确性边界

- 新 `src/semantic/semantic-engine-resources.ts:9` 集中创建同一引擎的 resolver/store/registry；
  第15～16行将动态 Host token接到 store 的既有 operationControl。Legacy适配器使用这份同域资源。
- 取消后通过既有 `prepare` catch → `rollbackDocumentCacheTransaction` 恢复捕获的record/closure，
  不发布取消过程的半成品；随后新版本undo/其他文件overlay mutation照常应用。
- AsyncLocalStorage只属于请求；独立串行mutation在作用域外运行，不继承该取消令牌。
- TypeScript原地Program同步仍遵守ADR0023：不能从Host回调任意抛取消破坏共享SourceFile；
  同步完成后才结算已失效请求。新接线调用的是同一token，继承原安全提交边界。
- 截止时间、内存预算、成员上限、熔断/退避、租约回收、结果新鲜度与单终态全部未放宽。
- 单次真正阻塞且不到检查点的native/解析调用仍可能需要父端终止；这份接线不承诺任意有限函数都能在1s内协作退出。
- adapter由原候选783行降至767行，仍是超限迁移债；新资源装配30行，新测试和fixture均小于500行。

## 公开回归与原始RED/GREEN

测试：`tests/semantic/edit-undo-definition.test.mjs`；fixture：`tests/fixtures/cancellable-workspace-preparation.cjs`。
真实 child process + Content-Length stdio；未用私有engine测试代替LSP。

```sh
ARKTS_TEST_EVIDENCE_DIR=.bench/edit-undo-definition-20261027/controlled-red node --test --test-concurrency=1 tests/semantic/edit-undo-definition.test.mjs
pnpm build
ARKTS_TEST_EVIDENCE_DIR=.bench/edit-undo-definition-20261027/controlled-green-both node --test --test-concurrency=1 tests/semantic/edit-undo-definition.test.mjs
```

旧版RED两次退出1；当时测试仅definition入口，父版本17e923f叠加v5候选，server/Worker SHA如上。
新增completion入口随后在同一修复上做行为对照，2/2 GREEN。两次RED日志、读文件堆栈和服务日志均保留。
64个依赖只用于确定性最小复现，不是新的产品批次大小或文件上限。
原始 `controlled-green-both/definition/` 与 `/completion/` 各有服务日志、读文件记录和transport metadata；
metadata没有完整RPC payload，不声称它是完整wire。断言逐一校验了完整definition目标/新行号、-32800取消、单终态及关闭exit0。

近邻回归 `focused.log` 49/49通过：取消协作、失败构建同版本恢复、同步中close/reopen、绝对截止不能被活动绕过、
连续/间歇失败预算、mutation恢复、真实故障注入后overlay重放、关闭回收。随后扩展的双入口单测2/2通过。
计数分开，不能宣称51个互不重复用例。manifest新增1个测试入口，257个总入口，bundle-e2e由130变131。
首次manifest断言因精确入口数量需要更新而失败，保留 `manifest-test.log` / `manifest-test-green.log`，最终专用检查通过。

### 仅撤销与连续撤销的独立补证

这些诊断在主回归修复后用冻结v5和新候选分别执行，不伪称全部在实现前完成。
`.bench/edit-undo-definition-20261027/undo-only.test.mjs` 不发送 `$/cancelRequest`，只发didChange撤销；
Node20修复版1/1通过，旧版被取消宽限终止并换代一次。旧版第一条后继查询在恢复后成功，1977ms，
但单Worker/协作停止合同仍失败；不能把自动恢复成功视为缺陷不存在。
旧版快照共记录46次依赖打开，包含请求被判超时到物理退出前的窗口，不能简单乘40ms当作请求执行时长。

`repeated-undo.test.mjs` 连续创建新依赖、编辑、查询、撤销，再查询；失败响应也保留，允许记录受控恢复后的重试。
冻结v5在4次撤销中出现4次 `cancellation-deadline`，启动4个Worker、完成3次恢复，第四次达到速率预算并 `recovery.stopped`。
每次首次后继定义都返回 -32603；前3次恢复重试正确，第四次无恢复。这完整复现了“起初还能恢复，之后无法再跳转”的机制。
修复版5次撤销均返回正确后继定义，1个Worker、0退役、0恢复/熔断，正常exit0。
这是有限慢读取+固定小SDK的受控因果验证，不是原30K自然UI现场复现。
`v5-readiness-fixture.mjs` 仅把同一公开测试辅助器的import/制品地址指向冻结v5，不改变Worker逻辑或期限。

原始证据：`undo-only-green/`、`undo-only-v5-red/`、`repeated-undo-v5-budget/`、同脚本最终冻结对照 `repeated-undo-v5-final/`、`repeated-undo-fixed/`，
每组保留log/observations；初版在第一条后继失败就停止的 `repeated-undo-v5/` 也保留，未丢弃失败样本。

```sh
EDIT_UNDO_FROZEN=1 ARKTS_TEST_EVIDENCE_DIR=.bench/edit-undo-definition-20261027/repeat-old-newtag /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 .bench/edit-undo-definition-20261027/repeated-undo.test.mjs
ARKTS_TEST_EVIDENCE_DIR=.bench/edit-undo-definition-20261027/repeat-fixed-newtag /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 .bench/edit-undo-definition-20261027/repeated-undo.test.mjs
```

## 30K普通协议验证（无人工延迟）

APFS clone隔离完整242MiB项目，30000源码（13900 ETS、16100 TS）；没有改真实源文件。
SDK、成员/内存/请求期限仍用既有默认值；不是缩小项目的fixture。冷OS缓存未强制清除。
每轮171个功能请求，6次编辑/撤销：completion、definition、typeDefinition、highlight交错，
撤销后18次定义逐一核验 `ThirdSelectConstants.ts` 第30行 `filterMediaType` 的完整UTF-16范围，另有首/热/最终定义。
`typing`组逐步把 `getAvoidArea` 改成不完整输入再撤销；具体文本、版本和顺序在脚本/actions中。
这是受控输入模式，不假称用户当时确实输入了同样文本。

每轮保留 `actions.ndjson`（完整双向消息、请求起止与结果）、`stdout.raw`、`stderr.raw`、`logs/server.log`、
`resources.ndjson`、`worker-metrics.ndjson`、`result.json`。
普通重放没有插桩编译器内部；**实际Program SourceFile个数/构建次数未测**。
metrics的 `projectFiles=87` 是上下文记录的项目数量，不冒充实际Program构建计数。

| 运行 | 初始化ms | 撤销后18次定义中位/最大ms | Node RSS峰MiB | Worker heap采样峰MiB | 原生RSS峰MiB | Worker启动/退役 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| natural-before-1 | 12123.4 | 132.64/402.44 | 685.1 | 611.6 | 1402.9 | 1 / 0 |
| natural-before-2 | 21427.1 | 325.08/779.55 | 583.2 | 610.8 | 3217.1 | 1 / 0 |
| typing-before-1 | 10264.1 | 52.60/394.31 | 749.0 | 607.7 | 3092.5 | 1 / 0 |
| natural-after-1 | 9756.6 | 108.27/267.90 | 799.4 | 612.8 | 3490.5 | 1 / 0 |
| typing-after-1 | 9905.4 | 98.65/234.61 | 761.6 | 586.4 | 3488.1 | 1 / 0 |

上表修复前3轮、修复后2轮均未自然复现不可用；不能只展示修复后通过而宣称原问题完全消失。
`natural-before-2`曾与近邻回归同时运行，其779.55ms样本保留，但不用于纯净时延A/B结论。
其余也只有每输入模式少量轮次，OS缓存/GC/索引后台进度不受控，表格不是性能改进或500ms通过证明。
未缩小真实项目文件数，但目标依赖范围相对小；没有声称全项目语义范围已支持。

补充按实际Zed失败位置的 `ScreenManager.getInstance`：撤销后原文件零基行55、列25，目标为 `ScreenManager.ts` 零基行81、列9～20。
`screen-before-1` / `screen-after-1` 各171个功能请求、6次部分输入/撤销也均正确，均1个Worker/0退役。
后继定义中位/最大分别47.81/359.17ms与57.26/341.74ms；
两组与完整检查同时执行，只作诊断正确性数据，不用作纯净性能A/B。
此前七组合计42次编辑撤销、1197个功能请求。完整检查后再补两组 `log-positions-before` / `log-positions-after`：
先在编辑文本发completion，50ms后undo，再按原Zed日志的(55,25/27/33/40/41)、(56,17)、(80,14)、(79,13)连续请求，
不显式发送$/cancelRequest；两版各171功能请求都未自然复现不可用、均1个Worker/0退役、正常exit0。
九组累计54次编辑撤销、1539个功能请求；所有结果保留，不把修复前未复现样本删掉。

RSS每PID只统计一次，语言服务器含Worker线程，不再叠加线程RSS；Worker heap是Worker自己采样的isolate heap。
Node/原生各自峰值可能不同步；不能相加成同一时刻的总峰或与heap做直接加法。
保留原保护：Node RSS1536MiB/每会话90s外部诊断界限；本轮未触及、未OOM，正常shutdown/exit0。
原生索引约3.4GiB的峰值已如实列出，本轮没有顺带优化索引内存或重启暂停路线。

复现命令（目录名必须用新tag，输出不会覆盖）：

```sh
node .bench/edit-undo-definition-20261027/replay-edit-undo.mjs .bench/edit-undo-definition-20261027/v5-runtime/dist/server.cjs reproduce-before
node .bench/edit-undo-definition-20261027/replay-edit-undo.mjs dist/server.cjs reproduce-after
EDIT_UNDO_TYPING=1 node .bench/edit-undo-definition-20261027/replay-edit-undo.mjs dist/server.cjs reproduce-typing
EDIT_UNDO_SYMBOL=getInstance EDIT_UNDO_TYPING=1 node .bench/edit-undo-definition-20261027/replay-edit-undo.mjs dist/server.cjs reproduce-screen
EDIT_UNDO_SYMBOL=getInstance node .bench/edit-undo-definition-20261027/replay-hover-after-undo.mjs dist/server.cjs reproduce-log-positions
```

冷会话每轮新LSP/索引缓存，等初始化终态；热查询及编辑撤销按脚本顺序。
只读逐项比对真实项目30058份源码/配置与隔离快照，0差异，见 `original-comparison-after.json`。
原项目输入、隔离项目输入、v5制品与修复制品身份见 `isolated-project-inputs.json`、`fixed-identity.json`、`running-artifact.json`。

## 检查与后续限制

- TypeScript `pnpm check`、初始化/SDK配置恢复22/22、manifest专用4/4通过。最终完整 `pnpm check:fast` 在允许进程采样的环境 **2052/2052通过**，退出0，零fail/cancel/skip/todo，3252802.423ms（约54分13秒），日志 `check-fast.log`。
  检查前后760项源码/测试/脚本/配置SHA不变，server/Worker匹配冻结修复候选；见 `check-verification.json`。
  首次沙箱执行出现spawn EPERM及资源采样失败，确认自有PGID94338后以SIGINT停止，外层退出1；
  `check-fast-sandbox-interrupted.log`与9个自有进程身份保留。它不是完整通过，也不把所有失败先验归为权限。
- 455文件冷目录3s性能门槛仍按用户既有授权跳过；本次没有为它做写入/URI/页缓存优化。
  这不代表删除索引功能或跳过正确性检查。
- Context7 resolve本轮再次HTTP连接失败；没有伪造查询结果。同步安全边界沿用ADR0023/0024已核验的固定编译器源码与官方资料。
- 无真实UI连续点击验收；保留现场原始字节和无重启会话，不宣称自然OOM、规模成本、全部500ms或完整>20K全局能力已解决。
- 无关缓存性能TODO继续暂停；未发布、未推送、未合并。

最终收尾：`owned-processes-final.json` 对27条自有回放/中断检查进程身份按PID＋启动时间＋完整命令复核，无残留；用户Zed/LSP未被停止。
`original-comparison-final.json` 再次只读核对真实项目；`evidence-manifest.json` 保存原始日志/脚本/逐次结果的SHA清单。
