# PR119 合入检查失败：根因与证据

日期：2026-11-24（Asia/Shanghai；原始日志时间为 UTC）。本轮仅诊断；未修产品、提交、合并、部署或改测试门槛。

## 候选与边界

- PR：https://github.com/liuhui-code/arkts-language-server/pull/119
- 候选：`c869ade983006c700c49e883d02340e120c0ea9d`，分支 `feat/hot-query-proof-cache-20261123`。
- 隔离工作树：`/private/tmp/arkts-lexical-reference-probe-20261123`。以下源码行号以此工作树为准，不以另一个仍有历史改动的日常工作树代替。
- 本地追踪的 `origin/main`：`1e3886df3c4d27755a53c073462f1456b0a3de7e`；本轮未推进 main。
- Node：`/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node`。
- server SHA256：`27517a3ce973baf59f7852841eea029d8b44f7819af0eb0a84aa9fa242114fb3`。
- semantic Worker：`1e6dbd900d77bdad0d16a0797e48bdecddcc73735175693aac716b7c3bbd7d53`。
- reference verifier Worker：`41651837934bda3faf362c7d0f844d685607335a435282d77165f84923f75ec3`。
- 上述文件诊断前后未改写。诊断 preload 的额外探针只在模块加载时向内存中的代码插入记录，单独标注，不能当作未经插桩的性能数据。
- SDK 使用各原测试的隔离 SDK；补全一致性用例使用仓库 `fixtures/conformance/v1/sdk/openharmony`。未用用户 Photos 或 Zed 代替这些回归。

证据目录：`.bench/pr119-diagnosis-20261123/`，下文简称 D。原始本地全检：`.bench/hot-query-20261122/merge-checkfast-c869ade.log`。

CI run `45088414928`：Linux validate 失败、Windows 安装 smoke 成功。直接下载 job `137412187775` 的完整日志见 D/`ci-job-raw.log`：2801 tests，2798 pass、3 fail，最终退出 1。失败正是下文 Gitignore、parent-retarget、取消后恢复三项。`gh run view --log-failed` 在本次得到的输出提前结束，故完整汇总以 job 原始日志为准；不能以截断输出当作全部检查结束。Windows 安装 smoke 不等于真实 UI 验收。

## 结论与证据强度

| 问题 | 已证实内容 | 尚未证明/处置边界 |
| --- | --- | --- |
| 源码归档回归 | 提交遗漏必要 `.gitignore` 改动；带尾斜杠规则不排除目录符号链接 | 应补回必要改动，不应跳过回归 |
| 取消后新查引用失败 | 验证 Worker 消息回调进入创建 Worker 时的旧请求 AsyncLocalStorage 上下文，新请求误读旧取消单元 | 已抓到实际单元编号和原始异常；尚未实施修复 |
| 本地大量资源/驱动失败 | 沙箱拒绝采样器 `ps` 子进程，出现 `spawn EPERM`，后继缺采样/等待失败 | 不能把 121 条失败都直接归到权限；只对已做对照的类别下结论 |
| 补全 5 秒超时 | 初始化与首个补全共用冷准备等待；相同原测试有超时也有通过 | CPU/磁盘/调度波动的各自贡献未测，不笼统断言机器负载 |
| Linux 目录恢复失败 | CI 恢复目录并发送 watch 后，新的补全仍返回 `-32803` | Mac 20 次循环未复现；拒绝点以下具体证明尚未锁定，不能宣称已修复或与取消串扰同源 |

## 1. 必要 Gitignore 改动被漏提交

CI：`repository source inventory excludes generated dependency and Cargo directory links`。
实际列表包含 `node_modules`、`target` 两个符号链接，预期不包含。

调用链：

1. `tests/retained-regression-collector-cli.test.mjs:288` 创建隔离 Git 仓库，复制当前规则，创建两个目录符号链接。
2. `scripts/bench/run-retained-regression.mjs:106` 使用 `git ls-files -co --exclude-standard -z` 枚举归档输入。
3. 已提交规则 `node_modules/`、`/target/` 不排除这两个符号链接；工作树中原本已验证的 `node_modules`、`/target` 能排除。

D/`gitignore-control.json` 是两份规则的独立对照：提交版列出四个条目，工作树规则只列出 `.gitignore`、`Input.ts`。此前整理提交把这两行当作无关改动排除，这是本次集成遗漏，不是 CI 偶发。

修复边界：纳入已有必要规则，保留回归和其他忽略范围；不扩大为清理依赖或删除文件。

## 2. 取消状态串入后续引用请求

公开复现：`tests/semantic/references-anchor-reuse.test.mjs:264` 的
`cancel during rejected-anchor complete retry rejects old work and permits exact recovery`。
首次请求在索引锚点被编译器拒绝、转完整范围回退时取消；旧请求正确返回 `-32800`，紧接的新请求却可能返回 `-32603`。

### 实际链路

- `src/semantic/semantic-worker-runtime.ts:267` 在 `SemanticCancellationScope.run` 内执行请求。
- `src/semantic/semantic-cancellation-scope.ts:33` 使用 AsyncLocalStorage 保存请求取消单元；`:41` 的共享 Host token 每次从当前异步上下文读单元。
- `src/core/types/type-engine.ts:112` → `referenceWorkerOptions` → `src/semantic/references/reference-batch-worker.ts:30`，把这个动态 Host token 包装为回调。
- `src/semantic/references/reference-verifier-client.ts:74` 在请求 A 上下文创建验证 Worker，并在之后请求复用它。
- `:102–112` 为每个任务注册消息回调；但注册回调没有把该任务的异步上下文绑定给 Worker 消息事件。
- `:107` 在消息回调里调用动态 Host token，实际读到创建该 Worker 的请求 A 上下文，可能不是正在等待的请求 B。
- 误判取消后 `:124–128` 终止验证 Worker 并抛出取消异常。
- `src/semantic/semantic-worker-request-error.ts:7` 按 B 的真实单元分类：B 未取消，异常又只是普通 Error，于是分类为 `internal-error`。
- `src/semantic/semantic-worker-error-policy.ts:23` 隐去原异常，公开响应表现为 `Semantic worker request failed`。

### 实测与因果对照

保持原公开测试、原断言和超时：

| 运行 | 轮数 | 失败轮 | 额外观察 |
| --- | ---: | --- | --- |
| D/races.json | 8 | 3、7 | 仅封存临时日志 |
| D/trace-races.json | 12 | 5、12 | Worker 创建/终止/异常事件 |
| D/error-races.json | 8 | 1、3、7、8 | 加载时记录原始被映射异常 |
| D/context-races.json | 6 | 1、2、3 | 加载时记录取消单元匿名编号 |

这些是不同观察条件，不把它们合成生产故障概率。第一组已经在未改产品逻辑的公开用例中复现，不依赖后续探针制造故障。

关键实测 D/`context-1.jsonl`：

| UTC 时间 | 事件 | 单元 | 是否取消 |
| --- | --- | ---: | --- |
| 16:54:23.790 | 首任务注册 verifier 消息监听 | 1 | false |
| 16:54:25.429 | 新任务注册消息监听 | 2 | false |
| 16:54:25.430 | 复用 Worker 的 runtime-ready 消息回调 | 1 | true |
| 16:54:26.546 | 实际验证结果消息回调 | 1 | true |
| 16:54:26.557 | 新任务异常映射时直接检查请求单元 | 2 | active（0） |

原始异常栈明确停在 verifier client 的 `onMessage` 取消检查，并非编译器异常、OOM 或 Worker 先自行崩溃。
另一轮 D/`worker-5.jsonl` 显示主动终止来源是 `ReferenceVerifierClient.runJob → dispose → Worker.terminate`；随后 verifier exit 1 是主动终止的结果，不能反过来当崩溃原因。

成功对照：若旧取消被任务内部定时器先观察到，`runJob` 会先结束并终止验证 Worker；新请求创建自己的 Worker，避免继承旧上下文。若旧取消先在锚点回退外层的词法检查被观察到，验证 Worker 已空闲而被保留，后续复用才触发串扰。这解释了过去单轮全绿为何没有排除此缺陷。

D/`async-context-control.cjs` 是独立 Node20 最小对照，不运行语言服务：在 A 创建 Worker，在 B 注册消息监听，未绑定回调读到 A；在 B 绑定的对照回调读到 B。输出见 `async-context-control.json`。

最小修复方向：在跨请求复用的异步事件边界保留每个任务自己的上下文，或显式传递/捕获该任务的取消单元；同时保护结果校验所依赖的上下文。不能缓存一次 `cancelled=false`、吞掉异常或仅改变错误码。回归必须控制“旧任务已完成验证、回退处才取消、下一任务复用同一 Worker”的窗口，再覆盖新任务真实取消、队列等待取消、正常复用及资源结清。尚未实施此修复。

### 历史为何处理过，当前仍出现（2026-11-24 追加核对）

不是推测旧包残留：本次实际产物身份已固定；`git log`、`blame` 和逐版本文件摘要显示：

| 历史节点 | 实际保障/变化 | 没有覆盖的边界 |
| --- | --- | --- |
| `f4ddfe4`，2026-09-21 | 把共享 `activeCell` 改为 AsyncLocalStorage；并发 references/交互请求各自 Promise 链隔离。记录见 `docs/tdd/references-scheduling.md` | 没有证明以后跨任务复用的 Worker 消息回调属于监听注册任务 |
| `3add697`（PR96），2026-10-19 | 引入现有 `ReferenceVerifierClient`，让验证 Worker 跨 job 保留 SDK；动态取消检查及未绑定消息监听同时进入该文件 | Worker 生命周期跨请求，消息异步资源却在第一次请求内创建；没有逐任务重新绑定上下文 |
| `8def69d` / `3ab8936`，2026-10-26/28 | 安全完成原地同步、准备阶段检查点、监督截止和取消终态；ADR0024 的 10-27 补充要求独立 mutation 不继承请求上下文 | 请求作用域外 mutation 的独立性不等于常驻 Worker 消息事件已经绑定新 job |
| 当前 PR119 `c869ade` | 新增词法引用探测与检查点；本次失败栈显示回退时可以先在 verifier 外部观察到取消，使已空闲 verifier 保留下来供下一请求复用 | 旧取消上下文缺口被该执行路径暴露；本轮仍须修复，不能因为代码早已存在而免责 |

`3add697`、主线 `1e3886d`、当前 `c869ade` 的整个 verifier client 文件 SHA256 **完全相同**：
`1226eb755ee984e3fc9c4e0850d8f2dad6e5c016d59bf051669c4f02cdff3cca`。
D/`history-context-ownership.json` 保存对照。故已证实不是本轮把这份修复代码回退；常驻 verifier 缺少逐任务上下文绑定这一实现缺口早已存在。尚未逐版本运行旧主线/二分第一份可触发构建，不声称已证明各历史版本的自然故障率。

根本错误是假定“在请求 B 中创建函数/注册监听，函数执行时就自动属于 B”。闭包保存的是一个动态 `hostToken` 引用，并没有保存 B 的取消单元；token 被调用时才取 `getStore()`。Worker/MessagePort 事件可能属于 A 创建的异步资源。任务串行、LSP ID 正确、取消单元互不复用，都无法替代这个回调执行身份约束。

现有 `tests/semantic-cancellation-scope.test.mjs` 验证独立 Promise 并发、嵌套、异常清理等；没有复用 Worker 事件边界。旧公开 rejected-anchor 取消测试虽然存在（`f812b153`，2026-09-29），但没有强制“取消发生在 verifier 已空闲、外层回退尚未结束”的分支，所以单轮 GREEN 可能只走终止后重建的成功路径。这是机制测试缺口，不是缺少取消测试数量。

Context7 `resolve-library-id` 本次 transport 失败，未伪称取到资料；改核对运行版本的 [Node20.19.5 官方文档](https://nodejs.org/download/release/v20.19.5/docs/api/async_context.html#integrating-asyncresource-with-eventemitter)：监听器的执行上下文可能不同于调用 `on()` 的上下文。其 [Worker pool 示例](https://nodejs.org/download/release/v20.19.5/docs/api/async_context.html#using-asyncresource-for-a-worker-thread-pool) 为每个任务创建 AsyncResource，通过 `runInAsyncScope` 完成回调并结清；与本次独立 Node 控制及实际单元观测一致。

设计约束应补成：**Worker 属于可复用基础设施，取消与证明上下文属于单次 job；所有回调入口必须显式恢复 job 身份，终态后释放该身份。** 不通过清空旧单元、共享可变 currentCell 或关闭 Worker 复用解决。后续修复应同时验证 A 取消不影响 B、B 真取消仍及时生效、事件晚到不结算错误 job，以及正常复用不新增 Worker。

后续状态机评审已单独记录于[逐 job 所有权与状态转换方案](../plans/2026-11-24-verifier-job-ownership-state-machine.md)：
盘点已有监督/恢复机制，比较三种选项，建议局部 job 状态机＋显式上下文绑定＋内部 ticket，沿用父层恢复权威。
该文是待评审建议，不是已实施修复，亦未关闭 Linux parent-retarget 的独立失败。
[ADR0049](../adr/0049-verifier-job-context-and-lifetime.md)已记录长期所有权、上下文、终态和恢复边界，仍为 Proposed。

## 3. 本地 121 条失败中的测试环境影响

原本地全检：2801 tests，2680 pass、121 fail。失败记录数量不等于独立产品缺陷数。

原日志有采样器 `spawn EPERM`，以及 `external RSS sampler did not produce its first sample`、10 秒驱动等待、缺少响应/采样引起的后继断言。这里采样依赖 `ps`，文件系统沙箱拒绝启动该进程。

同候选、同断言、串行、允许实际采样的对照：

- D/`targeted-unsandboxed.log`：15 条中 12 pass、3 fail；资源 CLI 全部通过，4 个 closed-input 用例通过；3 个失败记录为补全两个子例及其父例。
- D/`permission-control-expanded.log`：56/56 pass，零 skip。包含 prepared 资源、prepared suite、Settings cancel CLI、sampler shutdown、relative-candidate reuse 三种配置，包括原来 20 秒超时的 saturated 配置。
- D/`local-failure-records.json` 保存原 121 个失败记录及原始诊断片段。分类仅作检索，`other` 不是已归因。

这证明环境故障能够制造大量失败，但没有证明 121 条全部由权限造成。取消串扰在允许采样后仍稳定复现；不能用权限解释它。

## 4. 补全冷等待为什么可能超过 5 秒

原用例 `tests/support/conformance-scenario.mjs:33` 在 initialize 握手后立即 didOpen 并发送补全，`:53` 用默认 5 秒等待。握手不等于语义准备完成。

`src/semantic/worker-project-preparation.ts:74` 的普通请求先 `wait`，`:94` 等待 root 已在进行的初始化；实际调用由 `semantic-worker-document-request.ts:15` 进入。之后仍需要针对打开的 overlay 完成当前查询。

原失败日志中一个入口初始化用了 4216.57ms，留给后续处理的时间不足 0.8 秒；另一个入口超时时尚无初始化完成事件。不是单独测了一个热补全算法却花了 5 秒。

D/`completion-timeline.json` 将观察等待延长至 30 秒以取得终态；仅诊断，不是修改原测试或产品截止时间：

| 独立新会话 | 初始化日志 | 客户端补全计时 | 结果 |
| --- | ---: | ---: | --- |
| 握手后立即发送 | 2363.70ms | 3682.50ms | title/save/build |
| 等实际 complete 通知再发送 | 2414.09ms | 1415.17ms | title/save/build |

即时会话从初始化 complete 到 request.completed 的墙钟间隔为 1316ms。初始化区间包含在即时补全等待内，不能再次加到 3682.50ms 上。

其他诊断结束后原 5 秒用例重新执行，D/`conformance-idle-control.log` 的 bundle/CLI 子例各约 3419/3462ms（整个子例，含启动/关闭），3 条记录全部通过。此前同样允许采样的运行仍曾失败。因此它是有实际冷准备成本和波动的超时，不是权限错误，也不能因一次通过宣称解决。尚未对失败轮 CPU/磁盘/队列分别计时；不得给它们编造占比或默认延长门槛。

## 5. Linux parent-retarget 恢复仍未闭环

CI 2026-11-23T00:49:00.391Z，`group-closed-input-delivery.test.mjs:78`：已正确拒绝目录临时重定向期间的请求，恢复原目录并发送 Globals.d.ts changed 后，新的 id4 补全仍 `-32803`。

用例保留文件字节和 inode 身份，只把父目录临时改为 symlink，再恢复；它专门保护物理路径边界校验，不能删掉该断言。

可能的拒绝链：`type-workspace-entry.ts:86–93` 依次检查原始磁盘快照、changed-input token/physical path、编译器输入证明、作用域以及成员证明。公共错误没有指出到底是哪项失败；CI 日志也没有相应原始异常栈，因此不能仅凭错误码选其中一项当根因。

Mac：原 8 轮 + D/`parent-races.json` 的 12 轮全部通过。后 12 轮保留了预期第一次拒绝的原始栈（`parent-error-*.jsonl`），没有把预期拒绝计作成功恢复失败。另一次 4 例整文件对照也通过。Linux 独立环境尚不可用（本机 `docker info` 未得到可用服务身份），本轮不安装或启动 Docker 服务。

下一项最小补证：在 Linux 隔离同候选，保留原 hook 和原事件顺序，仅在上述各证明拒绝处记录原因及前后 token/physical path；对齐 watch 应用、后台诊断和恢复请求，不先重跑大项目或修改新鲜度合同。

## 命令与后续提交边界

在隔离工作树中，固定 Node20：

```sh
node --test --test-concurrency=1 --test-name-pattern='cancel during rejected-anchor' tests/semantic/references-anchor-reuse.test.mjs
node --test --test-concurrency=1 --test-name-pattern=parent-retarget tests/semantic/group-closed-input-delivery.test.mjs
node --test --test-concurrency=1 tests/conformance-scenario.test.mjs
node --test --test-concurrency=1 tests/prepared-resource-artifact-cli.test.mjs tests/prepared-suite-cli.test.mjs tests/replay-settings-cancel-control-cli.test.mjs tests/sampler-shutdown.test.mjs tests/semantic/relative-candidate-reuse.test.mjs
```

可重放观察脚本在 D：`repeat-races.mjs`、`trace-races.mjs`、`error-races.mjs`、`context-races.mjs`、`parent-races.mjs`、`conformance-timeline.mjs`。脚本记录其真实固定工作树绝对路径，迁移时须显式核对路径与产物身份。

后续顺序：补齐 Gitignore 集成遗漏；为取消上下文跨 Worker 事件边界建立可控失败回归并修复；补齐 Linux 目录恢复拒绝点；在具备采样权限的环境运行最终全检及 CI。当前仍不满足合并条件，历史全绿不能替代本候选验证。真实 Windows/Zed UI、30K 完整引用/重命名与剩余性能限制均没有被本轮这些小回归验收。


## 2026-11-25：目录恢复同型失败已在 Mac 控制时序下复现

独立三轮 `parent-request-{1,2,3}.jsonl` 均表明：mutation 属于 complete，原 complete 在 source fence 拒绝；
随后 diagnose 首先在 validateCachedMembershipBeforeCapture 发现旧目录资格失效，下一 complete 才成功。
使用已有 ARKTS_TEST_DIAGNOSTIC_DELAY_MS=2000 将后台 handoff 后移，不改身份检查，
`parent-delayed-diagnostics.log` 复现公开 id4/-32803，与 Linux CI 错误相同。
内部栈明确为首个恢复 complete 的 validateCachedMembershipBeforeCapture，证明本地恢复依赖了后台先消费一次失败。
并非已证实的盘符/大小写错误，也不是 ADR0049 的取消单元串扰。

机制是 watcher 的源码 changed 不足以证明旧目录 witness 仍有效，旧 completeProof 被保留；
首个消费者才由 current() 将其标 invalidated 并拒绝，下一消费者才走原扫描。
候选在 finishWatchedSourceChanges 检查通知源的去重父目录，资格失效便调用原 proof 的单调 invalidate；
不把 invalidated proof 经 renew 丢成 undefined，确保首次后继准备就能在 capture 前重新扫描。
原在途请求仍拒绝。没有清空全缓存、接受旧身份、全路径小写或为新请求复用旧有效性判断。

`parent-recovery-red.log` 固化这一公开 RED；`parent-recovery-green.log` 五项5/5，含无后台先行恢复对照。
这证明并修复了 Mac 可控同型机制；Linux 原失败无内部栈，Linux CI/真机复验仍待完成，不能据此宣布平台全验收。
早期 parent-case-policy 对照未观察到 bundled compiler 策略改变，不用于排除大小写假设。
第二轮全检在1557条通过、零已见失败记录时主动中断，原因及PID在 checkfast-final2-interruption.json；不是完整PASS。


## 2026-11-25 修复与本地最终验证

两个独立缺陷分别修复：ADR0049逐job上下文/ticket/终态与物理清算；ADR0044目录资格在producer及时撤销，后继准备重扫。
verifier实际故障通过typed verifierFault→semantic runtime quarantine→Host.onFailure进入原Recovery，
退出/构造/发送失败（含间歇成功）均受原共享预算约束；不自动重放旧请求，不把普通取消变为fatal。
本地最终`pnpm check:fast`：**2807/2807，0失败/跳过/取消/todo，exit0**。
2026-11-24T17:54:16Z→19:13:01Z UTC，4724.86秒；2694冻结输入未变。
权威产品代码在`/private/tmp/arkts-lexical-reference-probe-20261123`，父提交c869ade加未提交修复；
不是声明c869ade提交本身已经包含修复。身份与原始日志在`.bench/pr119-fix-20261124/checkfast-final5-{inputs,result}.json`和log。
新增目录发布身份核验引起原总realpath计数3→4；调用栈证实前三次是root+两源码归一化，第四次独立检查同一父目录。
现回归精确约束路径与顺序，保留每closure每batch一次；不是删校验或宽范围放过重复IO。
测试先50/50表征GREEN再提取，原2170行文件降至2029（仍是迁移债务）；提取+清单54/54，前置联合60/60。

第三轮原诊断5秒等待失败与第四轮旧IO断言失败均保留；前四轮全部是中断/失败，不算完整PASS。
冷诊断最终通知确实可能较晚，候选/父提交交替对照没有显著差异；本轮没有修改等待参数，波动原因未逐CPU/磁盘归因。
final5一次完整通过不关闭该性能观察。详见[实施记录](../tdd/2026-11-24-verifier-job-ownership.md)。

当前实际位置：client:11基础设施中性域、68准入、81执行、112创建、133消息身份与上下文、172唯一退休、193故障上报；
job:6状态/资源、30上下文入口、35启动、42取消、50清算；fault:18上报/22校验；
semantic-worker-runtime:43隔离故障、semantic-worker-host:235复用onFailure；
complete-membership-proof:75单调撤销、watched-source-notifications:180发布核验/185保留invalidated资格。
文件完整路径及hash见final-code-map.json与冻结清单；行号属于此未提交候选。

仍未证明：Linux原现场唯一内部因果（Mac同型机制已控窗RED→GREEN）、Windows实机、真实Zed UI、30K正式耐久；
大规模完整引用/重命名与原性能问题没有在本轮解决。目录证据变化仍可触发必要成员重扫，未测其30K生产耗时。
ADR0049保持Proposed，独立审阅与远端CI待完成；未执行提交、push、合并或部署。
