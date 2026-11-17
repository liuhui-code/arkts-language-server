# 索引输入投递、目录生命周期与排队对账

2026-11-05，parent `298d65f5d7f796c347fe8be5c739e428066489d8`；隔离候选仍未提交、部署、合并。
工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`；ADR0043仍Proposed。
接续[默认维护/No-op报告](2026-11-05-default-index-maintenance-and-noop-freshness.md)，不改写旧失败/旧候选成绩。
原项目、日常Zed/缓存与未保存编辑未动；原工作区另外40个既有文件逐项哈希核对。

## 实际链路与状态含义

`run-language-server.ts` watch/config → `workspace-input-delivery.ts:7` →
`DefaultWorkspaceSymbolService.observeWorkspaceFiles:92` → `SidecarWorkspaceIndex.observe:307` →
`maintenance-input-normalization.ts:9` → `MaintenanceInputs.observe:56`：先同步撤销父端旧输入资格，
再异步发送一份在途changes及一个按URI合并的后继；语义dirty基线读取在这个观测之后。
老Native没有observe能力，仍保留原capture-before-catalog/start顺序。

普通源码changed保留URI/大小写、kind和input；created/deleted及移动批带namespace，
配置带configuration；既有256 URI/4096单URI字节/64KiB总字节协议边界溢出保留watch-overflow对账需求，
不截断后假称精确完成，也不改项目源码数量上限。资源/overlay不作为磁盘源码facts直接写入。
Native URI校验及源fence保留；没有全路径转小写或删除校验。

`VersionedMaintenance`等待changes ACK，再申请完整对账。Native局部任务尚在工作时返回accepted=false，
父端监听真实终态后用**同一attempt/input**重试，没有定时盲目重试/重建进程。
文件终态早于拒绝ACK的窗口用单调活动序号防止漏唤醒。
取消排队对账只结束该订阅，不取消共享文件mutation；读取取消与输入投递所有权分开。

三件事严格不同：observedInput是Native记录了输入；完整任务accepted是Native分配了该对账；
完整qualification是同data快照可确认的资格。它们均不是TypeScript Program/checker完成标记。
未被接受的对账不能提前把该input标成已分配，否则取消后重试会虚构一个Native尚未观测的版本，拖住前台读取。
新Native file progress明确带scope/uri；不用任务名字符串猜测归属。局部data-updated/unchanged是数据快照，
qualification始终null、currentInput=false，不能代替完整资格；完整qualified也不能伪装成scope=file。

## 本地问题记录（不创建远端issue）

| 稳定标识 | 直接原因/影响 | 对照与当前状态 |
| --- | --- | --- |
| IDX-V1-INPUT-001 | pump最后一次检查空队列后、finally清理前又观察到输入，schedule仍认为在途，漏掉后继投递 | `ix03-input-drain-race-red.log`实际1次而预期2；finally重查待办后GREEN，保留最新输入ACK |
| IDX-V1-INPUT-002 | watch路径只解析一层父目录；目录整段删除后alias与physical不匹配，通知丢弃；另有exact-parent `..`包含错误 | 公开LSP namespace资格超时、Native根本没收到删除；4个路径案例原1PASS/3FAIL，修复后4PASS，真实LSP删除/恢复通过 |
| IDX-V1-INPUT-003 | session已失败且read signal已取消时，先创建失败的flush Promise再直接返回AbortError，留下unhandled rejection | `ix03-already-cancelled-wait-red.log`公开adapter进程退出；先检查取消并消费已取消等待的后台拒绝，进程继续返回degraded状态 |
| IDX-V1-INPUT-004 | 在Native真正accepted之前登记input已消耗；排队请求取消后重试分配新未观测版本，缓存读被堵在ACK屏障 | `ix03-queued-reconcile-red.log`触发现有250ms测试watchdog；改为实际accepted才登记，24项组合GREEN，未放宽任何产品/测试时限 |

这些是不同触发点：消息队列生命周期、路径身份、取消订阅生命周期、输入分配状态。
可以用统一的所有权/单一终态约束理解，但不能强行认成同一底层缺陷。
INPUT-002与旧M001同属命名空间风险，**本次已证直接原因是watch路由丢事件**，
不是再次证明旧resolver历史证明缺陷；没有推断未测Program/SDK阶段。

`physicalPathWithMissingTail`（coordinator:229）逐级寻找有当前证据的祖先，拼接确实缺失的尾段；
真实outside symlink仍拒绝。dangling link、权限/I/O错误不能作缺失证明：仅对词法归属明确的根标dirty，
交由完整准入核验，不能伪造“文件删除”。严格包含复用既有relativePathWithinRoot，排除exact parent。
没有增加永久历史路径表或每次编辑清空全缓存。别名根本身重定向、离线卷及Windows更广泛生命周期仍需后继专项。

## 真实LSP复合回归（生成夹具，非Zed UI）

128个生成项目源码，SDK显式不存在，语义层partial；Native/词法索引可独立验证。
先冷建，随后：改单文件、重复watch、创建MixedCase.ets、成组移动、删除文件及空目录、恢复目录/文件、SDK配置通知。
逐步校验真实workspace/symbol结果、URI、计数、输入与资格；每次都使用实际磁盘字节。
**不是保存事件覆盖**：本片重复的是watch通知；didSave独立入口还需补。
没有测实际进入Program的文件数、SDK/Program构建时段或各SQL内部占比。

原帧：`.bench/index-versioned-maintenance-20261104/ix03-uri-lsp-scenarios-v2/`；
摘要`ix03-uri-scenarios-summary.json`。下面是该专用运行的私有协议时间区间，
不是UI点击/完整LSP时延，也不能把point和后继区间重叠相加。
v2发生在后续INPUT-004登记修正/完整file资格guard之前；最终候选以完整check receipt为准，旧帧不冒充新候选计时。
当前快测日志已报告同一复合LSP用例PASS（4,671.57ms全用例），完整套件尚未结束/尚有失败。

| input | head | 最终源码数 | 局部facts文件写 | 完整对账facts文件写 | 私有区间ms |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 128 | 0 | 128 | 349 |
| 2 | 2 | 128 | 1 | 0 | 354 |
| 3 | 2 | 128 | 0 | 0 | 314 |
| 4 | 3 | 129 | 0 | 1 | 231 |
| 5 | 4 | 129 | 0 | 1 | 238 |
| 6 | 5 | 128 | 0 | 0 | 238 |
| 7 | 6 | 129 | 0 | 1 | 241 |
| 8 | 6 | 129 | 0 | 0 | 225 |

input1区间为start发送→qualification；其余是changes发送→qualification。
删除可零facts写但dataPublished=true、head前进，因为manifest发生变化；零facts写不等于零SQL/物理写。
本回归没有测实际落盘字节、WAL峰值、文件读取数/realpath次数，不能给出物理写放大比。
Dedicated原帧只有一个Native PID并正常code0退出；maintenanceWorkerSpawns累计的是Rust任务线程，
不能当作Node semantic Worker换代数。本片不证明30K长期资源稳定。

## 验证与环境错误

- `ix03-uri-v1.log`：首先贯通changed URI→局部写1→同input完整资格写0。
- `ix03-uri-lsp-scenarios-v1.log`：移动后删除空目录，30s等待namespace资格失败；无删除RPC。
  修复watch身份后v2完整复合场景通过（4,241.96ms）。
- `ix03-queued-reconcile-green.log`：15个公开adapter生命周期＋9个输入队列合同，24PASS/0skip。
- `ix03-watch-path-lifetime-green.log`4PASS；`ix03-input-proofs-inventory-green.log`资格/库存23PASS。
- file progress scope公开Native先RED后GREEN：`ix03-file-event-scope-{red,green}.log`。
- 当前Native release、fmt/严格workspace all-targets Clippy通过；这不是新版本完整Rust全量成绩。
- 上一冻结候选完整默认Rust：`ix03-wiring-rust-receipt.json`，401PASS/0FAIL/1既有ignored，820.11s，输入不变。
  ignored为未配置ARKTS_INDEX_REAL_FIXTURE的真实455夹具入口；不等于授权跳过该入口全部正确性。
  后来扩展了Native progress元数据，旧401不能覆盖新候选；最终需按新身份检查。

当前完整`pnpm check:fast`在执行，`ix03-uri-checkfast-receipt.json`及`ix03-uri-final-checkfast.log`。
已出现外部RSS采样失败，普通sandbox的只读ps exit127；正常工具授权的同探针exit0。
未修改的`prepared-suite-cli.test.mjs`在授权采样环境26/26通过，`ix03-sampler-permission-control.log`；
只证明该对照文件的权限因素，**不预设其余失败都同因**。完整失败轮保留，终态后另以授权环境复跑全量。
不改采样断言、超时、V8、RSS默认预算或500ms口径。当前完整检查不能宣称通过。

门控夹具新增fs.watch在普通sandbox异步EMFILE，独立200ms探针重现；授权环境同探针无错误，
记录`ix03-fixture-watch-probe{,-escalated}.log`。不由此断言整机句柄耗尽/产品泄漏。
门控改为只读自建flag的stat轮询，释放/关闭显式unwatch，仅测试夹具，不改产品watch策略。
Context7 resolve-library-id调用因HTTP transport失败；按实际Node21.6.2核对了
[Node官方fs.watchFile文档](https://nodejs.org/download/release/v21.6.2/docs/api/fs.html#fswatchfilefilename-options-listener)：
stat轮询可用于底层watch不可用的情况、可配置间隔并用unwatchFile清理；此处用于受控测试同步，不是生产大项目监听方案。

## 后继验收，不缩减范围

- didSave与随后重复watch、未通知修改后的对账、unknown-directory/overflow/reconnected公开输入及恢复；
  当前正常输入已接通，不代表所有触发器已实现。
- resource-only批次仍可能被服务层排入完整catalog；observer不发送资源源码URI，不代表已消除服务层无关对账。
- 持续无静止输入下的公平性/无signal内部status等待、更多取消/ACK交错仍须压力证据；有界URI待办不等于已证明所有订阅有界。
- qualification/metadata/墓碑及partial/迁移、双窗口/旧reader/Windows完整生命周期仍开放。
- 最终新身份完整检查、两类规模、真实30K单会话至少两小时及Mac/Windows真实UI；不得用本片小夹具/多会话相加替代。
- 完整引用/重命名、SDK及原语义缓存性能TODO保留原状态；本片不扩展其优化。

本片所有新增手写文件≤500行；run-language-server499、sidecar-workspace-index483。
旧Core lib1131/SQLite lib761迁移债继续记录。无提交/push/合并/部署或真实缓存清理。
