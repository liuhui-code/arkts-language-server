# 状态机完备度与 TDD 自审

日期：2026-10-24。范围：审查 ADR 0020、当前 v8 候选和公开 LSP 回归，补受控反例与诊断对照；不修改产品源码、不部署、不合并。

## 结论与证据边界

**当前不能宣称状态机已完整解决问题。已有恢复用例本轮 30/30 PASS，但新增公开 LSP 反例确认两个 P1 缺口：跨文件重放丢更新，以及清算自身失败后失去继续结算的所有权。**

它们都不是缺一个 `degraded` 枚举值就能解决：前者丢失输入，仍可报告 READY；后者只锁定旧 LS，新 LS 又能复用同一有残余租约的 SDK 域。
此前全量 1984/1984 的结果保留为当时测试集合的结果，不能据此排除本报告的新反例。

- HEAD：`e35459131366a32c48c10d1d74adef74357cd3dc`；分支 `fix/windows-path-identity-20261022`，含此前未提交工作，不能用 HEAD 单独标识候选。
- 本轮开始冻结 772 项源码/测试/构建输入及 4 个主要运行包，见 `.bench/state-machine-audit-20261024/start.json`；结束核验见同目录 `verification.json`。
- macOS 26.6.2 / 25G83，Node v20.19.5，Node 架构 x64；编译器为实际安装的 `ohos-typescript 4.9.5-r10`。
- 原 compiler SHA256：`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`，本轮未改安装包。
- 原 server SHA256：`9b6bc5babc2196d80e1e12191240fbe1d37841478c87af772bdf018a66b9eb67`。
- 原 semantic Worker SHA256：`1a751730f41463e46a028c5d8b54220f04fbc675b7af3b57ad74250457c73635`。

测试通过真实子进程与 Content-Length stdio。项目均为临时夹具，使用 API 24 元数据、1 个 SDK 声明文件和 52 个标准库文件的最小 SDK 壳。
这是实际编译器上的受控故障验证，不是完整 SDK、Photos、Windows Zed 原现场或 2 万文件复测。
取消/截止预算在测试中有显式缩短，耗时不能作为产品默认性能结果。未测本轮 AST WeakRef 或 RSS 回落，未将线程 RSS 相加。

本轮所有原始帧、Worker 消息、生命周期、TAP、脚本与清单位于 `.bench/state-machine-audit-20261024/`，汇总为 `observations.json`。
两个反例各再次串行复现；最终 5 项诊断执行记录为 `final-results.json`。其中两个预期 RED 是尚未修复的缺陷，不能记为产品通过。

## P1：恢复期间不同文件的更新被错误合并

### 公开操作与实际结果

`replay-oracle.test.mjs` 的 `cross-document` 场景：

1. 初始化 READY，打开 `Main.ets` v1 和 `Unopened.ets` v1，显式准备作为初始 mutation 的结算屏障。
2. 对 Main 发送 v2 全文编辑；测试预加载器在真实 mutation 已应用、ACK 发出前使 Worker 同步阻塞。
3. 父线程实际执行截止保护并退休旧 Worker。替换 Worker 在启动测试钩子中暂挂，此时恢复已取出旧文档快照。
4. 向同一项目依次发送 Main v3、Unopened v2；Main v3 把 import 与调用符号都从 `neverQueried` 改成 `latestQueried`，Unopened v2 在顶部加注释。
5. 发送故意未实现的 `arkts/stateAuditBarrier` 请求，收到预期 `-32601`，确认父端已处理前面的同步通知；再解除替换 Worker 启动暂停。
6. 查询 Main 的定义，LSP 零基位置 `(2,23)`；显式准备，再重复相同定义请求。

期望精确目标为 `Unopened.ets` 的 `latestQueried`，范围 `(2,16)–(2,29)`。
原包两次都返回 `[]`，中间 `prepare:true` 却返回 READY。最终执行 `final-cross-document.tap` 为 RED，前一次 `replay-cross-document-proof.tap` 也相同。

Worker 发送记录精确显示：

| 替换 Worker 的 mutation revision | 文件 / 文档版本 | 来源 |
| --- | --- | --- |
| 1 | Main / v2 | 恢复快照 |
| 2 | Unopened / v1 | 恢复快照 |
| 3 | Unopened / v2 | 恢复日志 |

**Main v3 没有被发送给替换 Worker。** 之后 define 请求要求 Main v3 / revision 3，Worker 回 `content-modified`。
`SemanticRequestRunner.run` 将该错误按现有合同转换为空数组，重复查询也不会补发 Main v3：父端 `sync` 认为本地早已拥有相同版本和文本。

证据：`replay-original-cross-document-final/{wire.jsonl,replay-messages.ndjson,report.json,logs/server.log,worker-lifetime.ndjson}`。
`arkts/stateAuditBarrier` 的 `-32601` 是测试预期，未新增生产接口，不计为产品错误。

### 调用链与原因

| 文件 / 函数 / 行 | 行为 |
| --- | --- |
| `src/lsp/run-language-server.ts:288`，onDidChangeContent | 取得文档新快照，取消旧请求并调用 semantic.sync |
| `src/semantic/semantic-worker-proxy.ts:174`，sync | 先保存父端文档；相同版本/文本后续不再次发送 mutation |
| 同文件 `:479`，#mutate | 更新输入修订，经 mutation tracker 进入恢复日志 |
| `src/semantic/semantic-worker-mutation-tracker.ts:21`，mutate | 恢复活动期间调用 recycle.defer |
| `src/semantic/semantic-worker-recycle.ts:106`，defer | 合并条件只有相同 root 与 open/change 类型，**漏掉 URI 相等**；第二个文件覆盖第一个文件日志 |
| 同文件 `:142`，recover | 先取文档快照，再发送快照、flushMutations，最后记 recovery.complete |
| `src/semantic/semantic-worker-host.ts:109`，flushMutations | 忠实发送已经丢失一项的队列，无法自行恢复 Main v3 |
| `src/semantic/semantic-worker-runtime.ts:247`，answerRequest | Main 实际 v2，与查询要求 v3 不符，拒绝 content-modified |
| `src/lsp/semantic-request-runner.ts:170`，run | 转成该请求的空结果；没有把旧答案当作有效答案发布 |

READY 此时只认证了 Worker 自己持有的输入。恢复事务没有发现父端 Main v3 与 Worker Main v2 的差异。
这是重放正确性缺口，不是普通用户仍在编辑导致的一次正常过期；操作完成后输入不再变化，第二次查询仍失败。

### 因果对照与最小修复边界

在 `.bench/.../same-document-coalescing/` 的**隔离生成包**中，仅增加 `tail.mutation.uri === mutation.uri`，保留相同测试、故障、预算和精确断言。
`final-cross-document-causal-control.tap` GREEN：两次定义都精确指向 latestQueried，READY，物理语义 Worker 峰值 1、关闭后 0。
原包反例也保持峰值 1、关闭后 0，因此不能用“没有并行 Worker/内存未增加”代替语义验收。
清单为 `same-document-shadow-manifest.json`，生成脚本为 `prepare-same-document-shadow.py`。

产品最小修复应限制合并为**同 root、同规范 URI、同一次打开生命周期内相邻全文更新**，保留 open/close、配置、文件事件的顺序边界。
关闭重开后文档版本可以重新计数，不能只用版本数识别打开生命周期；不引入全路径转小写。
修复后还须补多文件、close/open、两根、快照前/后及 flush 中编辑回归，并证明重放覆盖最新权威输入，不能仅由队列清空或 ACK 宣称恢复正确。
本轮生成包对照只用于定位，没有修改 `src` 或正式 `dist`，不构成可发布修复。

## P1：清算操作抛错后的隔离与恢复没有闭环

### 受控故障、成功对照和租约计数

`cleanup-failure.test.mjs` 使用 Main、Unopened、Spare 三个项目文件。
在 Spare 的 Host snapshot 阶段制造一次部分构建失败；另在已记录为项目文件的 Registry release **实际生效之前**制造一次异常。
随后同输入重试三次、同 SDK 配置退休、重建、精确定义查询、再次配置退休，最后关闭会话。
测试明确断言 fault 已消耗并产生 `cleanup-fault.ndjson`，避免注入点未命中却报告通过。

| 检查点 | 无 release 故障：attempts / completed；项目 refs | release 自身故障：attempts / completed；项目 refs |
| --- | --- | --- |
| 首次部分失败后 | 1 / 0；0 | 1 / 0；2 |
| 同版本显式重试三次后 | 2 / 1；3，三次均 READY | 1 / 0；2，三次均 -32803 |
| 同 SDK 配置退休后、重建前 | 2 / 1；0 | 1 / 0；2 |
| 同 SDK 重建后 | 3 / 2；3，READY | 2 / 1；5，READY |
| 再次退休所有当前项目 owner 后 | 3 / 2；0 | 2 / 1；2 |

两者最后 SDK refs 均为 1，是有意保留的共享 pin；正常成功 Program 的三份项目租约不算泄漏。
故障运行重建后的 5 份项目 refs 包含新 Program 的 3 份和旧失败 owner 的 2 份；当前 owner 再退休后，旧的 2 份仍在。
每个会话只观察到 1 次 Worker 启动、0 次物理恢复，最终会话 shutdown/exit 0。

原始数据：`cleanup-{0,1}-final/{report.json,wire.jsonl,stderr.raw,build-state.json,build-fault.json}`；
故障目录另有 `cleanup-fault.ndjson` 和 `release-attempts.ndjson`。
`final-cleanup-control.tap` GREEN；`final-cleanup-failure.tap` 因项目 refs `2 !== 0` 明确 RED。

这证明当前适配层在**清算自身失败**时存在会话内持有残余租约的情况；不证明固定编译器自然会在 release 前抛错，不等同 Windows 无限循环根因。
本轮没有独立 AST WeakRef/GC 实测，不能把 refs 数换算为内存字节；也不能称资源在 Worker 退出后仍永久存在。

### 调用链与缺失转移

1. `recoverable-language-service.ts:29` 的 retire 在 `:32` 先把 current 置空，再 dispose 已安装 Program、调用 owner.releaseRemaining。
2. `owned-document-registry.ts:35` 只有 shared.release 成功才扣账，符合 acquire/release 配对原则；`:54` 的循环遇到本次异常中止，仍有 2 份余额。
3. retire 的 catch 在 `:39` 设置 cleanupFailed；available 在 `:43` 永久抛该错误，故同版本重试没有新构建。
4. 可继续结算的 previous.owner 没有保存进持久退休状态。后续 dispose 在 current 为空时直接返回，无法继续处理这份余额。
5. `registry-pool.ts:39` 的 officialDocumentRegistryFor 按 SDK 域复用共享 Registry；配置变更建立新 facade，其 cleanupFailed 为 false，旧 Registry 余额仍在，新构建可以 READY。
6. `semantic-worker-runtime.ts:270` 没有清算所有权不确定的专门监督升级；该异常走普通错误路径。
   `register-semantic-readiness.ts:37` 将公开准备异常归为 -32803；现有父端恢复预算没有因此被触发。

因此“清理异常锁定旧 LS”只完成了一半：**旧 LS 不再使用，但同一污染域仍可被新 owner 使用，未结清责任也没有新的 owner 接管。**
这与跨文件合并缺陷可以独立触发，两者不是编译器 lastProjectVersion 早提交的同一个问题。

最小完整修复应增加携带退休责任的 `cleanup-failed/quarantined` 内部状态，并将其明确升级到现有受预算约束的域/Worker 退休流程。
不能只清 cleanupFailed、重建同域 LS，或无限重试 release；若底层先释放再抛错，盲目重试可能双 release。
在无法证明清算完成时停止复用该域，保留权威文档与错误原因，确认旧 Worker 退出后才重放；熔断、半开和 mutation 共用现有预算。
普通可清理的构建失败继续只退休损坏 LS，成功同步后普通查询取消继续保留健康 Program。

## 状态合同应怎样收敛

不需要把全部状态塞进一个巨型 enum。需要明确五类状态各由谁独占写入，以及跨边界提交的证明。
以下是审查后的必要合同；不是本轮已经完成的产品改造。

| 状态维度 / owner | 必须分开的状态或事实 | 当前最重要的约束 |
| --- | --- | --- |
| 物理 Worker / 父端监督者 | 未创建、运行、退休待退出、退避、重放、熔断、半开、关闭 | 前一物理 Worker 实际退出才能创建下一者；终止失败不能丢旧句柄后继续分配 |
| LS 构建 / 编译器适配层 | 无实例、同步中、同步成功、退休中、清算失败隔离、已 dispose | 失败不提交成功证明；退休中仍拥有资源，清算失败不是“已无实例” |
| 输入 / 父端文档和配置 owner | URI/打开生命周期、文档版本与文本、配置与 SDK 域、权威输入修订 | 快照＋日志的重放必须覆盖最新输入；不能跨文件合并，不能仅看根 revision |
| 请求 / 请求 owner 与命令 owner | 调用方终态、底层 queued/executing/cancel-requested/settled | 调用方取消只有一个回包；底层未结算仍计入占用和截止，不能提前宣称 quiescent |
| 公共 readiness / 认证者 | unprepared、preparing、degraded、ready 及具体 reason/coverage | degraded 可与合法 Program 并存；READY 必须对应当前权威输入和有效 epoch，不是资源健康的替代指标 |

必须逐条验证的转移：

| 事件 | 正确的下一步与提交条件 | 本轮判断 |
| --- | --- | --- |
| 同版本构建失败，清算成功 | 撤销证明、退休损坏 LS；后续显式操作可以重试 | 现有公开用例与退役负向变体验证有效 |
| 构建失败，清算也失败 | 隔离域并持有未结责任；受控退休，不得同域新建后当作全好 | **新反例 RED，缺口已确认** |
| 同步完成后的合作取消 | 请求唯一取消终态，健康 LS 保留 | 已有专用用例；不能拿构建中取消替代它 |
| 同步不返回 / 致命退出 | 未阻塞的监督端终止旧世代，按共享预算恢复 | 已有受控 checker/Host/exit 用例；native/OOM 不由它们证明 |
| 排队者取消，另一根正在执行 | 结束排队调用方等待，不因此单独杀另一个根 | 已有公开用例 |
| 重放期间 A、B 交错编辑 | 每个文档独立保留最终内容，正确排序 ACK，验证后才能接收查询 | **新反例 RED；仅同文件 100 次更新不足以覆盖** |
| 恢复期间再失败 / 缓冲溢出 | 退休替换者、熔断，不递归重启、不丢父端权威输入 | 已有固定场景；跨文件合并缺陷会影响日志记录数统计 |
| 连续或间歇失败，穿过时间窗口 | 频率和累计约束同时成立，同输入成功不能无限补充预算 | 已有专用用例；时钟回拨未验证 |
| 新输入后显式探测 | 一次半开；实际同步成功才能恢复，后台/只读请求不自行解锁 | 已有固定场景；清算隔离原因还未接入 |
| 关闭与恢复同时发生 | 关闭优先，终态后不重生；所有等待者结算，监听器和定时器有 owner | 普通关闭/卡住时关闭已有用例，清理异常与终止异常的组合未测 |

`createProgram` 返回、checker 返回、LS 同步完成、输入核验完成、READY 必须继续分开观测。
阶段计数是诊断事实，不能从 observed=false 或单个 phase 推导完整状态，更不能替代所有权账本。
每份异步任务必须明确 owner、加入/取消规则、实际结算边界；不能只依靠多个 boolean“看起来没有并发”。

### 尚未证实为缺陷的审查项

- 恢复频率窗口在 `semantic-worker-failure-recovery.ts:68` 用 Date.now，执行截止用单调时钟；现有测试只推进时钟，未测回拨/校时。建议预算也使用单调时间，先补验证。
- `semantic-worker-host.ts:155` 的 replaceWorker 在退休 Promise finally 中解除围栏；`shutdownSemanticWorker` 等待 terminate。若 terminate 拒绝且旧 Worker 未退出，应如何保留所有权、停止新分配，尚无公开故障用例。
- Host dispose 当前以 boolean 保证不重复启动清理，未用专门场景证明并发调用者都等待同一清理完成；不能仅凭此静态现象宣布泄漏。
- 初始化 prepare 对 content-modified/config 变化重试。持续编辑下的最终收敛与关闭优先级需要有界场景验证，不能以有限静态例子证明任意事件交错都终止。
- 租约观察 fixture 按 path 保存最后一次 scriptKind；产品账本按 path/bucket/kind/node-format。当前简单同 kind 夹具的计数有效，但不证明换 kind/模块格式的全 key 生命周期。

## TDD 自审与后续实施顺序

### 已有测试有价值，但覆盖结论此前过宽

本轮原命令：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/semantic/failed-build-recovery.test.mjs tests/semantic/unresponsive-worker-recovery.test.mjs
```

`baseline.tap`：30 tests，30 PASS，fail/skip/cancel/todo 均 0，整套耗时 123302.500044ms。
不是全量 check:fast，也不是一次用户操作时延。

为验证测试能否识别错误，只在隔离生成包制造三个变体，测试断言不变：

| 变体 | 现有公开用例的结果 | 能说明什么 |
| --- | --- | --- |
| 去掉同步失败后的 LS retire | 同版本重试仍 degraded/program-unavailable，RED | 能捕捉原失败版本短路缺陷 |
| 去掉 owner.releaseRemaining | 最终项目 refs 2 而不是 0，RED | 能捕捉部分构建余额未结 |
| 合并更新时保留旧文本、谎报新版本 | 原“latest overlay”用例 RED；去掉额外观测日志后仍 RED | 能发现这一个错误重放实现，不能据此宣称所有重放交错已覆盖 |

每个定向命令均选择 1 项、其余 14 项因名称筛选 skip；不能写成整份 15/15 PASS。
见 `without-retirement.tap`、`without-lease-settlement.tap`、`stale-existing{,-no-trace}.tap` 及相应运行包指纹。
额外 traced 日志确实记录 version 101 保留 version 2 文本；没有“变体存活却被忽略”的情况，也没有据三个样本计算通用变异覆盖率。

真正遗漏的是：原 100 次编辑只改同一文件的注释，目标断言仅 URI；没有两个文件在快照之后交错编辑，也没有 release 自己抛错。
本轮强语义 oracle 改成改变 import 和调用符号，精确比对目标 URI、符号所在范围、重复查询及 readiness，成功发现跨文件反例。
控制故障开始/解除顺序由可观察标记和公开请求屏障决定，不依赖“等几秒应该好了”的猜测。

初次清理故障注入用另一个路径表达式选文件，实际未命中，`cleanup-unreached-seam.tap` 为校准记录，不计为正确性证据；修正后增加 consumed/marker 断言并重跑。
一次诊断准备命令因 cwd 错误未执行，随后误名为 no-trace 的运行实际仍带日志，已保留并改名 `stale-existing-trace-repeat.*`；真正无额外日志的运行单独保存。

### 下一轮应按以下切片执行

1. **先修重放丢更新。** 将本轮跨文件 RED 提升为仓库公开 LSP 回归；只修 URI/生命周期的合并边界，再补 close/open、跨根、flush 中更新的语义对照。保持其他现有恢复用例 GREEN。
2. **再闭环清理失败。** 先保留本轮清算 RED，再补清算 before-effect 与 after-effect 不确定性、SDK pin/其他 owner、同输入重试、同 SDK 配置重建、共享预算耗尽及关闭。实现携带 owner 的隔离与监督升级，避免双 release 和无限重启。
3. **验证退休失败和关闭竞争。** 通过测试预加载器控制 terminate 拒绝/延迟、旧 epoch 晚结果、关闭与半开竞争，证明所有调用方唯一终态、旧 Worker 没退出不建新者，正常结束后无活动任务或监听器 owner。
4. **补有模型约束的序列测试。** 模型只描述权威文档、打开生命周期、允许的恢复预算及终态，驱动真实 LSP；记录 seed 与每步帧。覆盖两文件/两根、修改/关闭/重开/配置/取消/失败交错，失败时缩减为最短可复现序列。模型不能照抄实现的合并规则。
5. **最终候选验收。** 精确校验 Mac/Windows 实际启动入口与 bundle 指纹，跑公开回归和 Photos 连续操作，再对最后源码运行完整 pnpm check:fast 与所涉检查。预期 client-cancelled 单独分类；真实 internal-error、空跳转或重启增加都必须留证。

验收以不变量和可杀死的反例为准：最新输入未丢、答案精确、请求单终态、预算不可绕过、owner 有去向、旧世代隔离、关闭后不重生。
代码行覆盖率、请求返回非空、某次 READY、Worker 数为 1、此前全量 PASS，任何一个都不能单独代替这些条件。

## 产物与当前状态

复现入口：`.bench/state-machine-audit-20261024/run-probes.py`；具体命令、环境、开始结束时间与预期退出码见 `final-results.json`。
执行说明见同目录 `README.md`，原始反例不覆盖；`observations.json` 可从逐次报告重新生成。

本轮仅新增本报告、ADR 的审查入口及隔离诊断证据。正式源码、测试、构建脚本与主要 dist bundle 的未变核验见 `verification.json`。
未运行新的全量 pnpm check:fast、未在 Windows 部署，也未实施产品修复或合并；两个 P1 继续标为未解决。
缓存性能 TODO 仍暂停，455 文件冷目录 3 秒门槛继续按用户授权排除，500ms 与规模增长、自然 degraded、native/OOM 和长期内存增长不在本轮结论内。

关联：[ADR 0020](../adr/0020-failed-semantic-build-recovery.md)、[此前监督实现与验收](2026-10-24-worker-supervision-recovery.md)、[Windows Zed 现场诊断](2026-10-24-windows-zed-live-errors.md)。

后续[第二轮边界验证](2026-10-24-state-machine-boundary-validation.md)已补仓库内22项独立诊断和13项URI因果对照，
进一步覆盖关闭重开、配置、清算副作用、真实取消与物理退出不确定。
A→B→A还复现非空旧依赖范围；具体收敛方案见[状态合同](../plans/2026-10-24-worker-recovery-state-contract.md)。
该后续新增的是测试与方案，不把本报告的未修复状态改写为已完成。
