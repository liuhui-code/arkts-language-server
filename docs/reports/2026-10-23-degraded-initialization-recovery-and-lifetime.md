# degraded 初始化、失败恢复与资源生命周期验证

> 本文保留修复前的诊断与根因证据。后续工作区修复及Mac/Windows验证见
> [ADR 0020](../adr/0020-failed-semantic-build-recovery.md)与[修复TDD记录](../tdd/degraded-build-recovery-20261023.md)；尚未合并。

日期：2026-10-23。代码父版本 `e35459131366a32c48c10d1d74adef74357cd3dc`，
当前分支 `fix/windows-path-identity-20261022`，包含上一轮未提交的路径修复。
本轮没有修改产品代码、缓存策略、新鲜度合同或此前性能 TODO，没有执行合并。
证据根：`.bench/degraded-init-20261023/`。源码/完整 runtime 初末哈希验证见 `source-before.json` 和 `analysis.json`。

## 结论

**不能把所有 degraded 都称为永久卡死，也不能断言失败资源都能正常回收。**

1. 缺失依赖导致的自然 degraded 可以同会话恢复；修复输入并显式 `prepare:true` 后 READY，
   无需重启。初始从未取得 READY 时，普通查询可以已正确，但不自动刷新 READY 证明。
2. **确认冷构建异常/中途取消后的同版本重试缺陷**：故障已经撤销，显式重试仍不再调用
   createProgram，返回 `degraded/program-unavailable`。文档版本变化或配置退役后再准备能恢复。
   不是不可逆死锁，也不是初始化 Promise 永久 pending。
3. **确认部分构建的 Registry 租约未回滚**：失败 owner 已 dispose、无活动 Program 后，
   项目 SourceFile 仍由共享 Registry 持有。真实 LSP 取消三次后遗留9份项目租约、3个 AST对象；
   同 SDK 重建不能消除旧租约，换 SDK 注册域或终止 Worker 后才能解除该持有。
4. 全会话关闭能结束 Worker isolate、原生索引进程和服务器进程；未观察到线程/原生进程
   永远退出不了。致命 Worker 退出另有失效锁定策略，本次受控退出后同会话不恢复，新会话恢复。

上述“实际构建中途取消”通过标准 `$/cancelRequest` 触发；仅用私有 snapshot 暂停保证命中阶段，
没有伪造取消结果。异常注入与自然输入退化分别记录，不把测试注入当作线上已发生的故障频率。

## 环境与实验边界

- Mac x86_64、macOS 26.6.2；Node 20.19.5，ohos-typescript 4.9.5-r10。
- 使用当前 dist 与 release native sidecar；默认4096MiB压力预算，一个语义 Worker。
  `ARKTS_BENCHMARK_CONTROL=0`；日志、queue trace、运行 metrics 和私有生命周期探针启用。
- 生成隔离 workspace：Main.ts、Dep.ts、Spare.ts 共3源码；Main正常时 import Dep，
  Dep导出 `value()`，Spare无关。SDK为生成的API24元信息与一个common声明。
  实际成功 Program：3项目 + 1 SDK + 113其他输入，其中标准库52、仓库Node ambient61。
- 不使用真实 Photos、不编辑真实 SDK、不复测2048/20k性能、不把诊断 GC 的时延当产品性能。
  本轮只在Mac验证；未宣称Windows、OOM、所有初始化失败阶段或多语义组故障均已覆盖。
- 9类诊断场景各串行两轮，另3个无探针自然失败对照，共21会话；再补同输入重启验证1会话。
  21个驱动均执行完、服务器均exit0，**不代表21个场景都自动恢复成功**；失败状态是实验结论。
- 无探针对照重现同样的自然 degraded→普通查询后仍degraded→显式READY过程。
  既有真实LSP初始化/就绪相关测试 `existing-readiness.log` 为25/25；不是本轮缺陷已修复的证明。

## 实际调用链与状态转换

| 阶段 | 代码入口 | 实际行为 |
|---|---|---|
| 自动启动 | `src/lsp/initial-semantic-preparation.ts:6` | started；正常返回报告发送complete（可degraded）；异常发送failed并停止该次自动循环。只有content-modified自动继续，非通用无限重试 |
| 初始化合并 | `src/semantic/worker-project-preparation.ts:30` | Map按根共享初始化Promise；finally删除。普通请求等待该Promise；后续readiness请求可独立再次执行 |
| 初始化豁免 | `src/semantic/coordinator/initial-preparation.ts:13` | 正常完成报告包括degraded后记preparedRoots；finally清理checkpoint和active计数；异常不记完成。后续普通恢复不续借已消费的压力豁免 |
| 真正准备 | `src/semantic/project-readiness.ts:11` | Store准备root、初始化语义组、registry semanticReadiness |
| 进入owner | `src/core/types/type-engine.ts:441`、`type-workspace-entry.ts:35` | 获取lease、调用真实LS readiness；finally归还lease。没有通用的“compiler异常后销毁损坏LS”修复路径 |
| 证明状态 | `src/core/types/typescript-semantic-readiness.ts:48` | prepare先clear；只有取得proof才开启queryRefreshEnabled；初始degraded/抛异常没有普通查询自动认证意图 |
| 编译器同步 | `node_modules/typescript/lib/typescript.js:124353` | 先缓存lastProjectVersion，后createProgram；失败未回滚这个版本，下一次同版本直接return |
| 异常回包 | `src/semantic/semantic-worker-runtime.ts:247` | answerRequest捕获构建异常/取消，回单个错误；普通异常不等于Worker死亡，串行队列能继续服务 |

### 自然缺失依赖：可恢复退化

`Main.ts` 初始：`import { value } from "./Missing"`，文件不存在。
实际initialization为 **complete/degraded/dependency-inputs-incomplete**，诊断2307。
此时 createProgram 已完成，不是“根本没有构建出Program”。

- `missing-overlay`：didOpen提供正确 `./Dep` 全文；定义跳转精确返回Dep.ts的0:16–21。
  此后的 `prepare:false` 仍degraded。显式 `arkts/semanticReadiness {rootUri,prepare:true}` 后READY。
- `missing-repeat`：输入未修时连续三次准备仍degraded，实际Program构建次数仍1；
  不是每次失败都重建。磁盘修复Main并发送watched Changed后，显式准备构建第2个Program并READY。
- `missing-overlay` 关闭未保存overlay后回到坏磁盘输入，状态再次退化；这是文本权威回退。
  随后保存正确输入、配置退役并显式准备又READY，不把这次回退归因于泄漏。

**事件合同**：输入事件推进文本/成员状态；`prepare:false`只观察、不主动准备。
明确的 `prepare:true` 可认证READY。普通标准LSP查询在初始从未READY时不会保证自动升为READY；
配置通知退役旧域后也不能直接当作“已经READY”，须实际后续准备/查询并检查报告。

### 冷构建抛异常：同版本重试停滞

| 场景（两轮一致） | 首次失败阶段 | 清除故障后同版本prepare | 版本事件后prepare |
|---|---|---|---|
| throw-before | createProgram调用边界、进入编译器主体前抛错 | attempts仍1、返回0；degraded/program-unavailable | attempts2、返回1，READY |
| throw-snapshot-repeat | Host读取Spare快照时抛错，已有Dep/Main取得Registry租约；三次版本不同的失败 | attempts仍3、返回0；degraded/program-unavailable | attempts4、返回1，READY |
| throw-after-repeat | 原createProgram已返回但LS尚未安装Program时抛错，三次失败 | attempts仍3、返回3；LS仍没有Program，degraded/program-unavailable | attempts4、返回4，READY |

首次抛错时通知是 **failed**，随后 `prepare:false` 是unprepared；不能把failed通知伪称为degraded报告。
清除注入而不推进Host版本后再显式准备才得到 `program-unavailable`。
这里attempts是实际createProgram调用次数，“返回次数”不是安装到LS的成功次数。
停滞结论限定于损坏LS仍驻留、版本未变的状态；压力驱逐后重建owner可能另有恢复路径，
本轮未单独以L3压力验证该恢复，不把它说成不可逆的永久死锁。

根因：编译器 `synchronizeHostData` 在124360行先写lastProjectVersion，124460行才赋值
`program=createProgram(options)`；异常使后者未赋值，版本却已写入。下次124357行的相等
分支提前返回，故障已消失也不再实际尝试构建。应用的readiness重试沿用相同LS，未清除此状态。

### 真实取消：同样可触发该缺陷

`cancel-retry`先从自然degraded恢复READY，随后每次配置退役建立冷LS。
私有探针在实际读取Spare时暂停300ms；客户端见进入标记后发送真实 `$/cancelRequest`。
三次都收到 **-32800**，不是脚本伪造的返回值。

| checkpoint | createProgram累计调用/返回 | 重试状态 | 项目Registry租约 |
|---|---:|---|---:|
| 初始自然degraded | 1/1 | dependency-inputs-incomplete | 3 |
| 修复后显式READY | 2/2 | READY | 3 |
| 第一次中途取消后 | 3/2 | 同版本重试program-unavailable | 3 |
| 第二次中途取消后 | 4/2 | 同版本重试program-unavailable | 6 |
| 第三次中途取消后 | 5/2 | 同版本重试program-unavailable | 9 |
| 清故障后再重试 | 5/2 | 仍program-unavailable | 9 |
| 配置退役，无新构建 | 5/2 | 观察资源 | **9** |
| 同SDK配置重建 | 6/3 | READY | 12（含新owner的正常3） |
| 换SDK注册域重建 | 7/4 | READY | 新域3；旧域项目对象全部不再存活 |

两轮的调用数、状态及残留租约数一致。取消后的恢复缺口不是只在“人为抛普通Error”时出现。
但这不是自动初始化请求本身的客户端取消：启动请求由服务器拥有；本场景验证的是初始化
退化之后的冷重建取消，使用同一compiler/owner生命周期路径。

### 致命Worker退出：另一个故障类别

`worker-exit`在首个构建入口让本次测试Worker `process.exit(17)`，模拟不可捕获隔离故障，
**没有制造OOM，也不称其为OOM证据**。初始化failed；三次显式准备和一次配置后准备均-32803。
`semantic-worker-host.ts:194` 通知failure，`semantic-worker-proxy.ts:96` 保存#failure，
后续assertHealthy继续拒绝；配置通知不清除该失败。普通公开路径未自动启动新的Worker。

补测 `restart-after-worker-exit/`：同一原workspace/SDK、零源码编辑，关闭旧会话再启动新会话，
自动complete/READY，精确定义正确。当前正常客户端应重启语言服务器来恢复这类故障；
这不等于degraded证明不可修复，也不等于死Worker还在执行或无法终止。

## 资源：释放了什么，残留了什么

生命周期探针只在加载bundle时内存插桩：WeakRef、不持有对象的ID表、真实Registry引用计数、
Worker/child-process事件、初始化Map大小、dispatch活动数、AbortSignal/parentPort监听器观测。
不调用getProgram来“观测dispose”，避免诊断自己创建Program；GC只在请求settled检查点执行。
每检查点四次GC并跨setImmediate；dispose后另等约500ms，再做四次GC。

### 已确认的部分构建租约泄漏

| 场景 | 重复失败后项目租约 | 成功重试后 | owner dispose后，无活动Program | 仍存活项目AST对象 |
|---|---:|---:|---:|---:|
| 自然缺依赖/修复 | 3 | 3 | **0** | 0 |
| 进入Program主体前抛错 | 0 | 3 | **0** | 0 |
| 三次snapshot抛错 | 6 | 9 | **6** | 2 |
| 三次Program返回边界抛错 | 9 | 12 | **9** | 3 |
| 三次真实中途取消 | 9 | 同SDK新owner后12 | **9**（重建前） | 3 |

这不是仅凭WeakRef没消失作判断：同一SDK Registry仍强持这些文件，真实refCount>0，
没有对应活跃LS租约；dispose正常调用且coordinator lease/context已归零。原Program对象已能回收，
残留的是SourceFile/Registry租约。**6份租约不等于6个AST，也不等于RSS随失败次数线性增长。**
本次同文件重复下对象数量可固定；未做长期、多项目/多文件增长或堆大小曲线。

调用链根因：

- 编译器124507–124524行在构建过程中调用 `documentRegistry.acquireDocumentWithKey`。
- 中途异常没有逐项归还本次已取得但未安装的租约。
- 124600–124607行 `dispose()` 仅遍历已安装program的SourceFiles释放租约；
  program未赋值时跳过，后续成功构建再dispose也只释放成功Program的一份。
- 应用 `TypeScriptLanguageServiceEngine.dispose:1627` 正常调用该dispose并清空自己的scripts、
  membership、lazySnapshots等；无法弥补compiler内部未交付的租约。
- `registry-pool.ts:30–59` 的域级Registry继续驻留；同SDK配置重建复用它。
  换SDK目录后 `registries.clear()` 替换旧域，旧残留项目对象ID在GC后全部消失。
  会话shutdown终止整个Worker isolate也会释放该域。

因此是**共享SDK域内可持续保留的所有权缺陷**，不是跨进程永远无法回收；也不是所有degraded
都泄漏。SDK/标准库合法的额外pin（闲置时本夹具SDK1、标准库52）不能计为项目泄漏。

### Host、Promise、任务、监听器与外部进程

- 普通配置退役后，旧Program和项目AST正常场景已消失，但一份旧Host/engine/LS包装对象
  仍在；engine scripts=0、membership=0、scriptBytes=0。`sdk-registry-cache.ts:32,60`
  的 `latestAcquisition` 保留参数数组，其中[2]是Host，可达engine。下一次SDK acquire/域替换
  后该旧对象消失。这是有界额外保留，不能说所有Host在dispose瞬间已断引用；未做heap-retainer
  图排除其他持有路径，不把该链说成唯一来源。
- 所有正常/异常场景的初始化Map最后均0，首次Promise WeakRef在检查点已消失。
  initial-scope-exit的activePreparations/checkpoints均0；致命退出直接销毁isolate，不伪造finally事件。
  活动dispatch检查点均0；请求都有终态，未观察到永久pending初始化/等待任务。
- 观察到的存活AbortSignal在空闲/关闭检查点abort监听器为0；Worker parentPort的message/close
  监听器保持固定数量，没有随重试增加。`wait`的abort监听器有finally移除路径。
  未对整个进程所有Promise/监听器做堆图遍历，不作全程序无泄漏保证。
- `didClose`只撤销文档overlay，不是关闭项目或销毁长期LS。源码未注册workspace-folder移除
  handler，也未声明该能力；本轮以真实shutdown/dispose/exit验证会话关闭，不声称单独移除
  workspace-folder已可卸载全部项目资源。
- `run-language-server.ts:101,550` shutdown先取消初始化/诊断，await语义dispose后关闭索引。
  proxy清空引用结果缓存和queriedRoots；失败仍打开一份文档的case在dispose后documents=1，
  直到server对象/进程退出才解除。没有把“dispose返回”说成所有打开文本已立即清空。
  本轮未填充引用答案缓存，entries=0不是动态验证“有值缓存被清空”的证据；clear调用来自源码检查。
- `type-engine.ts:473 → coordinator.dispose → LS.dispose`；`semantic-worker-runtime.ts:482`
  清sampleTimer、dispose engine；`semantic-worker-shutdown.ts:4` 等shutdownComplete并terminate。
  18个探针会话均观测到Worker exit：16个正常路径先shutdown ACK，再显式terminate返回1；
  两个致命退出返回17，不当成普通关闭成功。原生sidecar的18个start/exit配对，全部exit0。
- 所有21会话服务器最终exit0；补充重启会话也exit0，其Worker/native同样结束。
  正常路径dispose后500ms/第二组GC，Worker JS包装对象也消失。致命退出的旧Worker包装对象
  在该有限窗口仍存活，但线程已退出、无继续执行；其保留者未归因，不能据此断言永久JS泄漏。
- **未用RSS是否立即下降判定回收**；进程级RSS不能再叠加同PID Worker RSS。
  本轮未测RSS/PSS峰值和堆字节，不作内存优化收益结论。

## 最小修复建议（本轮未实施）

1. **恢复正确性优先**：冷构建抛错/取消后不得保留“版本已同步、Program未安装”的状态。
   首选修正固定compiler的版本提交/异常回滚；应用层替代应在捕获构建失败后明确退休损坏LS，
   并让下一次显式重试创建干净owner。不能仅给generation加1就称修复完整。
2. **同片修复租约所有权**：对每个LS的Registry acquire/release建立可验证的取得清单，
   部分构建异常时回滚尚未提交的项目租约；或在compiler层补齐相同语义的异常清理。
   SDK缓存自己的额外pins与LS租约分开结算。不能只调用现有service.dispose：本实验已证明
   program未安装时这不足以归还部分租约，也不能清掉整个共享Registry掩盖问题。
3. 后续单独评估初始degraded的自动重新认证触发（现有显式prepare已经可用），以及预热参数
   对Host的额外保留；若实现，保留输入/最终证明、取消与首次豁免合同，不能缓存degraded作READY。
4. 致命Worker默认fail-closed与是否自动重建属于独立恢复策略；当前可用路径是新会话。
   若决定支持同会话恢复，应重放最新输入并重新认证，而不是简单清除#failure。

这些是故障恢复/资源正确性建议，**未启动此前暂缓的引用缓存性能优化**。
后续修复必须先把这里的真实stdio反例固化为公开回归；本轮没有修改vendor或产品实现。

## 证据与执行命令

证据均在 `.bench/degraded-init-20261023/`，原始smoke与正式数据分开保留。

- `validation-ledger.json`：21会话的实际命令、时间、退出；`analysis.json`：逐次状态、资源摘要。
- `*-probe-{1,2}/`：report.json、完整wire.ndjson、stderr.raw、metrics.ndjson、probe-pid-thread.ndjson、
  checkpoint-名称-thread.json，以及隔离workspace/SDK。精确输入编辑、请求位置、取消顺序在wire中。
- `missing-*-plain-1/`：无插桩自然失败对照；没有为这些会话编造Program/WeakRef计数。
- `restart-after-worker-exit/`：同一输入新会话的READY与定义结果，sourceEdits=0。
- `run-case.mjs`、`lifecycle-probe.cjs`、`run-validation.py`、`analyze.py`：复现、定点故障/GC观察、
  串行执行及分析。probe有严格唯一hook匹配；不写产品源码；状态/对象计数来自原函数执行。
- `existing-readiness.log`：既有25个测试通过；命令为固定Node20的node --test，两个文件
  `tests/semantic/project-initialization.test.mjs tests/semantic/semantic-readiness.test.mjs`。
- smoke试跑用于校准工具，不混入21会话：早期Registry观察曾读尚未赋值的SourceFile.resolvedPath，
  正式版改读真实acquire参数args[1]；原smoke数据不删除，不用它认定正式租约数。

```sh
# 新trial避免覆盖已封存目录；仍是当前仓库与固定Node20
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/degraded-init-20261023/run-case.mjs throw-snapshot-repeat replay1 probe
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/degraded-init-20261023/run-case.mjs cancel-retry replay1 probe
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/degraded-init-20261023/run-case.mjs missing-repeat replay1 plain
```

首次完整执行命令是 `python3 .bench/degraded-init-20261023/run-validation.py`；已有ledger时拒绝
覆盖。全量重放可将四个驱动/分析脚本复制到同层全新私有目录再执行，保留全部失败样本。
本轮未执行全量check:fast/发布验收，没有以25项局部通过替代这些检查，也未执行合并。

封存：`.bench/degraded-init-20261023/degraded-initialization-evidence.tar.gz`，SHA-256另存同目录`.sha256`文件。
`verification.json`记录21会话180个客户端请求各恰有一个终态响应，以及源码/runtime/native前后不变；
补充重启会话单列，不混入这180个请求。

## 深入根因补证：版本提交与 Registry 所有权（2026-10-23）

本节继续定位上述两个已确认问题，**未实施修复**。新增正式证据位于
`.bench/degraded-init-cause-v2-20261023/`：6个场景各两轮串行，共12会话、124个客户端请求，
每请求恰有一个终态；12个服务器均exit0。这里“执行完成”包含预期重现的失败，不能读成缺陷已通过。
正常构建、自然2307退化、构建前异常、快照异常、返回边界异常、公开取消分别单列。
源码、dist、原生程序及安装的compiler前后SHA一致，与上一轮共有源码哈希一致；
详见 `verification.json`、`source-before.json`、`source-after.json`。

### 版本与观察方法

- 父提交仍为 `e35459131366a32c48c10d1d74adef74357cd3dc`，分支和已有未提交路径修复同本文开头。
  Git提交不能单独代表dirty候选的字节；逐文件清单才是本次实际输入标识。
- 实际依赖 `package.json:26` / `pnpm-lock.yaml:10` 为 `typescript → npm:ohos-typescript@4.9.5-r10`；
  安装文件 `node_modules/typescript/lib/typescript.js` SHA-256为
  `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
  下列compiler行号均指这个安装文件；Worker运行的是其已打包副本。
- `src/semantic/backends/ohos-typescript/identity.ts:1` 的静态revision为
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`，静态packageVersion仍写4.9.5-r4；
  **不能将其当成实际安装r10的源码提交证明**。本次以安装包版本、文件SHA及runtime SHA定位，
  未从这段常量推断r10对应的上游Git提交，也未修改该元数据。
- `lifecycle-probe.cjs`在加载bundle时增加同步函数入口、版本提交/跳过、Program安装、dispose，
  以及底层真实Registry acquire/update/release前后计数。`lifecycle-base.cjs`沿用原探针，
  补记Host快照抛错的真实文件和完整栈。所有替换均要求唯一匹配，只改加载中的内存字符串。
  观察不调用LS.getProgram、不修正版本、不补release；对象ID使用WeakMap，既有存活检查用WeakRef。
- owner数字是本夹具中Host的诊断ID；每次配置创建新Host/LS。不是跨进程全局ID，也不是SDK pin owner。
  registry数字标识底层Registry。客户端phase标记可能在控制消息执行中变化，配对依据是同一Worker
  日志顺序、owner、registry和文件key，不能只凭phase字符串认为两个动作同时发生。
- `project-lease-journal.csv`保留288条逐文件事件及其原始日志行号；文件key保留编译器实际canonical值。
  Mac编译器对本机不区分大小写，canonical key与SourceFile.fileName大小写不同。
  原始 `cause-lease.project` 的字符串前缀判断因此为false，**分析不使用该字段**；按既有探针记录的
  acquire实际参数key与返回SourceFile的project分类对应，未修改产品路径规则或删除身份核验。

### 从公开协议到实际编译器的相关调用链

下表路径均相对仓库根；编译器路径缩写 `TS` = `node_modules/typescript/lib/typescript.js`。
同根公开readiness和启动准备汇入同一Worker路径。夹具未声明可分组模块，实际失败发生在根owner，
没有把本例当成所有模块组都失败的证据。

| 层/顺序 | 文件、函数、行号 | 与本次问题直接相关的动作 |
|---|---|---|
| 服务装配 | `src/lsp/run-language-server.ts:86`；`src/semantic/backends/production-semantic-engine.ts:11` | 创建SemanticWorkerEngine代理；不是在LSP主线程执行compiler |
| 自动准备入口 | `src/lsp/run-language-server.ts:199` → `src/lsp/initial-semantic-preparation.ts:6` prepareInitialSemantics | initialized后服务端主动准备；非content-modified异常发failed并退出该次循环 |
| 显式重试入口 | `src/lsp/register-semantic-readiness.ts:13` registerSemanticReadiness | 公开arkts/semanticReadiness，校验根/prepare；token转AbortController；finally注销取消监听 |
| 代理合并/读取 | `src/semantic/semantic-worker-proxy.ts:143` semanticReadiness/initializeProject → `src/semantic/worker-project-preparation.ts:22` read、`:30` initialize、`:40` prepare、`:53` request | 自动初始化Map按根合并并finally删除；显式read不被旧Promise永久挡住；prepare:true重新发送请求 |
| 排队与取消 | `src/semantic/semantic-worker-recycle.ts:40` request → `src/semantic/semantic-worker-host.ts:66` supervisor → `src/semantic/semantic-worker-supervisor.ts:232` request、`:303` #pump | 获取root supervisor、排队，发送含epoch/revision/cancelCell的请求；取消不依赖Worker事件循环处理下一条消息 |
| Worker分派 | `src/semantic/semantic-worker-runtime.ts:100` 消息队列、`:111` dispatch、`:247` answerRequest | 校验根/输入版本，再在cancellation.run中调用engine.semanticReadiness |
| Worker内引擎 | `src/semantic/semantic-worker-runtime.ts:66`；`src/semantic/backends/ohos-typescript/engine.ts:8`；`src/semantic/legacy-semantic-engine.ts:128` semanticReadiness | OhosTypeScriptSemanticEngine继承现有引擎，汇入prepareProjectReadiness |
| 初始化作用域 | `src/semantic/project-readiness.ts:11` prepareProjectReadiness → `src/semantic/coordinator/initial-preparation.ts:13` run | prepareRoot/prepareInitialGroups/根readiness；finally退出初始化作用域。异常不是永久pending；返回degraded亦消费首次豁免 |
| owner与租用 | `src/core/types/type-engine.ts:441` semanticReadiness → `src/core/types/type-workspace-entry.ts:33` queryWorkspaceReadiness → `src/core/types/semantic-query-lease.ts:5` runWithSemanticLease | prepare同步输入；借coordinator lease，finally归还。这个lease不是Registry文件租约 |
| 创建LS/Host | `src/core/types/type-engine-factory.ts:10` createTypeScriptEngine；`src/core/types/typescript-language-service.ts:261` constructor、`:1650` createHost | 创建长期Host/官方LS；getProjectVersion在:1661由generation、membership status、content revision组成 |
| 输入/证明包装 | `src/core/types/typescript-language-service.ts:276` withRequestModuleResolution、`:345` semanticReadiness → `src/core/types/typescript-query-module-resolution.ts:16` query → `src/core/types/typescript-semantic-readiness.ts:72` prepare、`:123` prepareOfficialReadiness | 先clear旧READY观察，再在:151调用官方getProgram；只有正常返回后才建立新的证明 |
| LS同步入口 | `TS:124527` getProgram → `TS:124353` synchronizeHostData | 先比较/写lastProjectVersion，随后才准备compilerHost并构建Program |
| 真正构建/装载 | `TS:124460` createProgram → `TS:107890` createProgram → `TS:109386` processSourceFile → `TS:109436` findSourceFile → `TS:109453` findSourceFileWorker → `TS:109520` host.getSourceFile | compilerHost回调实际是LS的getOrCreateSourceFile；不是直接绕开Registry的独立parse |
| 取快照/取得文件租约 | `TS:124507` getOrCreateSourceFileByPath → `src/core/types/typescript-language-service.ts:1669` Host.getScriptSnapshot；随后 `TS:124518/124524` | 旧已安装Program有同kind文件则update；否则acquire。冷失败时program为空，重建会再次acquire |
| Registry包装 | `src/semantic/backends/ohos-typescript/registry-pool.ts:38` officialDocumentRegistryFor → `observed-document-registry.ts:4` observedDocumentRegistry → `sdk-registry-cache.ts:24` retainSdkDocuments | observed包装只观察返回对象；SDK/标准库才额外pin，项目文件不pin；同SDK兼容域共享Registry |
| 底层引用计数 | `TS:121171` acquireDocumentWithKey、`:121179` updateDocumentWithKey → `:121187` acquireOrUpdateDocument；`:121272` releaseDocumentWithKey | 新entry计数1；已有entry acquire加1、正常update不加1；release减1，到0删除bucket entry |
| 错误终态 | `src/semantic/semantic-worker-runtime.ts:279` catch → `src/semantic/semantic-worker-supervisor.ts:648` #settleRequest → `src/lsp/register-semantic-readiness.ts:38` catch | 只结算请求/错误，不回滚compiler私有版本，也不结算遗失的Registry租约；普通构建错误不致命退出Worker |

`queryWorkspaceReadiness`内compiler构建发生在query回调，晚于 `type-engine.ts:221` 中只保护
`entry.engine.prepare(workspace)` 的catch。因此“newEntry prepare失败则remove”的现有分支没有覆盖
本次失败位置。`runWithSemanticLease.finally`归还coordinator lease也不会销毁长期owner。
这解释了为何外层已经处理异常，损坏LS仍可被下一个readiness请求取得。

### A：lastProjectVersion提前提交的精确状态序列

实际安装compiler的关键执行顺序：

1. `TS:124356`取得hostProjectVersion；`:124357`若等于lastProjectVersion且automatic type directives未变化，
   `:124358`立即return，**不检查program是否存在，也不重试createProgram**。
2. 不相等则`:124360`立即赋值lastProjectVersion。后面的根枚举、选项、输入读取、createProgram和
   getTypeChecker均尚未保证成功。
3. `:124460`求值createProgram右侧；正常返回才把结果赋给program；`:124465`还要准备checker。
   此函数无覆盖这段工作的异常回滚。右侧抛异常时，冷LS的program仍undefined，版本写入却保留。
4. 我们的readiness.prepare先clear；异常使observation赋值未完成。第一次是初始化failed，
   prepare:false是unprepared。下一次prepare:true再次调用getProgram，却被第1步挡住；
   getProgram正常返回undefined，适配层`:153`据实报告degraded/program-unavailable。
   该结果是**第二次请求发现缺Program**，不是原异常被缓存为同一个响应。

以下值直接来自 `state-transitions.json`，两轮一致（以throw-snapshot-repeat为例）：

| 时点 | owner | lastProjectVersion | 已安装Program | createProgram累计调用/返回 | 结果 |
|---|---:|---|---|---:|---|
| 首次进入同步 | 1 | null | 无 | 0/0 | 尚未提交 |
| 首次提交后，Spare快照抛错 | 1 | 4:complete:0 | 无 | 1/0 | 初始化failed |
| 两次真实文本版本推进后再次失败 | 1 | 5:complete:0 → 6:complete:0 | 无 | 3/0 | 两次-32803 |
| fault.json撤销，不改任何Host输入，显式重试 | 1 | 6:complete:0 | 无 | **仍3/0** | cause-version-skip；program-unavailable |
| didChange注释使Host版本推进，再显式准备 | 1 | 7:complete:0 | Program ID122，3项目文件 | 4/1 | READY |
| 同SDK配置退役、重新准备 | 新owner123 | 从null重新提交4:complete:0 | Program ID187 | 5/2 | READY |

文本恢复没有“偷偷撤销旧提交”：它只是新Host版本不等于旧值，绕过提前return。
配置恢复更不是必须增大数字：新LS局部lastProjectVersion重新为undefined，所以同样的4:complete:0
也能构建。`configureSdk → legacy.configureSdk:153 → type-engine.configureSdk:164 → coordinator.dispose:167`
退役旧owner，下一次prepare才创建新LS；单独发配置不等于已READY。

成功对照同样提交4:complete:0，但随后安装Program ID119；同版本重试跳过是合法复用。
自然缺依赖也已有Program，修复Main后保留同Host、使用update而不是再acquire全部项目租约。
可见问题不是“版本相等不能跳过”或“所有degraded都应重建”，而是**失败的同步被标记为已完成**。
本节验证的是冷LS在Program安装之前失败；热Program更新、checker安装后失败、type-root变化和
多个同时共享owner的异常事务尚未运行，不能外推其回滚细节已经验证。

### B：每份租约原本由谁配对，为什么dispose找不到它

Registry只有`bucket(key+impliedNodeFormat) → canonical path → scriptKind → {SourceFile,refCount}`，
没有“LS owner ID/未提交事务清单”。新entry创建AST并计数1；对已有entry重复acquire加1，
即使返回同一AST。正常update复用该owner已持的一份租约（本例6次update计数净增0）。

| 租约类型 | acquire者 | 正常release责任 | 本例失败对配对的影响 |
|---|---|---|---|
| LS项目/ambient/SDK/标准库的一份 | compiler getOrCreateSourceFileByPath，经本LS Registry facade取得 | Program换代移除/换kind时onReleaseOldSourceFile `TS:124500`、`:124520`；最终LS.dispose `TS:124600` | Program未安装时，已acquire的文件没有被记入可供dispose遍历的program |
| SDK/标准库额外pin的一份 | retainSdkDocuments `sdk-registry-cache.ts:71`第二次acquire，或其预热路径 | pin配置key/字节不兼容时release；整个域失去引用/Worker退出后回收 | 这是域owner合法保留；不能当项目遗漏归还，更不能每个LS dispose顺手减它 |
| coordinator上下文借用 | runWithSemanticLease | 该函数finally release | 已归还；与每份SourceFile的Registry计数独立，不能抵消它 |

编译器`TS:124600–124607`的dispose只在`if(program)`里遍历`program.getSourceFiles()`并各release一次。
它没有遍历所有Registry文件、更没有按本LS历史acquire次数结算。因此冷失败时跳过整段；之后
成功安装一次Program再dispose，也只归还那次正常Program拥有的一份，不会自动多归还旧3轮。

实际逐文件事件（两轮一致，计数为同底层Registry、同bucket/key/kind）：

| 场景/owner | 项目acquire事件数 | update事件数 | 最终release事件数 | 仍未配对份数 | dispose前/后Program |
|---|---:|---:|---:|---:|---|
| 正常成功owner1 | 3 | 0 | 3 | **0** | 有→无 |
| 自然2307、修复成功owner1 | 3 | 6 | 3 | **0** | 有→无 |
| 构建主体前抛错、版本推进后成功owner1 | 3（全部在恢复后） | 0 | 3 | **0** | 有→无 |
| 三次Spare快照抛错、再成功owner1 | 9＝2×3＋3 | 0 | 3 | **6** | 有→无 |
| 三次createProgram返回边界抛错、再成功owner1 | 12＝3×3＋3 | 0 | 3 | **9** | 有→无 |
| 真实取消owner122/126/127，各自冷失败 | 各3 | 0 | **各0** | 各3，共**9** | 无→无 |
| 取消后同SDK新成功owner128 | 3 | 0 | 3 | 自己0；旧9仍在 | 有→无 |

以snapshot为例，Dep/Main每次失败各+1：两文件计数0→1→2→3。
Spare还没acquire就抛错；版本推进成功后Dep/Main为4、Spare为1。dispose实际事件为
Dep4→3、Main4→3、Spare1→0，剩6份，当前存活项目AST为2个。不是“dispose没被调用”。
`project-lease-journal.csv`还显示Dep可一直返回同一AST ID2，Main内容变化时AST ID会换；
不能把租约数直接换算为AST数/堆字节。

同SDK重建查询同一个Registry域，新的LS的program为空，仍走acquire：残留6→9（或9→12）。
新owner dispose仍只减自己的正常3。实际日志中registry=1未变，owner已更换，说明不是“旧LS还在活动”。

不同SDK路径触发 `registry-pool.ts:41` 的key变化；默认共享保留已启用，`:54`清Map并创建新域。
日志变为registry=2；原域不再有强持有者，既有WeakRef检查点中旧项目AST ID全部消失。
这里**没有把旧refCount逐项减到0**，而是整个不可达Registry连同bucket回收；新域正常项目refs=3。
旧报告关于域替换的结论限定在当前一个SDK活动域/串行夹具；并发多个SDK owner仍持旧域时，
Map.clear本身不保证立即回收。终止Worker则结束整个JS isolate，无需等待逐份release。

### 真实取消在哪一步打断，不把注入当自然异常

正式 `cancel-retry-probe-{1,2}` 每轮三次：先自然degraded、修复输入并READY；配置退休当前成功LS，
随后对新的冷readiness发真实`$/cancelRequest`。探针只在读取Spare时暂停300ms，让客户端确定命中。

真实链路为 `register-semantic-readiness.ts:28` AbortController → `semantic-worker-recycle.ts:47`
handle.cancel → `semantic-worker-supervisor.ts:533` #cancelRequest → `worker-protocol.ts:431`
cancelSemanticWorkerRequest/`:443` Atomics.compareExchange。Worker同步构建期间，父线程仍可改共享cell。
`semantic-cancellation-scope.ts:25` hostToken实时读取这个cell。

**本次真正抛错不是Spare暂停点，也不是编译器OperationCanceledException**：Spare原Host调用返回，
项目Dep/Main/Spare三份租约均取得；接下来读取SDK `sdk/ets/component/common.d.ts`，在
`Host.getScriptSnapshot:1676 → compilerScriptSnapshot (compiler-source-snapshots.ts:63) →
CompilerSourceReadFacts.current:39 → validateRequestInput (request-input-validation.ts:35) →
current的checkpoint (:48) → referenceCheckpoint (reference-context-retention.ts:32)`
发现cell已取消，抛真实`Error("Semantic request cancelled")`。栈显示compiler仍在
`findSourceFileWorker → getOrCreateSourceFileByPath`内部，createProgram尚未返回，Program未安装。
runtime依据cell把它回包为client-cancelled，公开终态-32800；三次后同版本重试均跳过构建。

两轮共6条`host-snapshot-throw`的文件均为上述SDK声明，均有真实调用栈和对应wire取消。
这验证了**本适配层实际支持的中途取消会触发这两个缺陷**。它没有证明无需受控暂停时的命中概率、
自动启动准备的客户端取消、OOM、真实SDK损坏抛异常、compiler内部断言或所有取消检查点。
before/snapshot/after三种Error均是故障注入：证明指定边界不具备异常安全，不代表线上已发生相同Error。
after-program是在原createProgram已返回而LS赋值尚未完成的探针边界，不谎称compiler天然在该处抛错。

### 是否同源、责任边界与Worker致命退出

两者共享“同步失败没有事务收尾”的触发背景，但**不是同一个状态，也不是彼此的必要条件**：

- A可独立出现：before-program首次失败没有一次项目acquire/AST，仍留下已提交版本，同版本重试停滞。
- B可在A已解除时持续存在：snapshot/after推进版本后已READY；同SDK新owner也READY，旧6/9份仍留在域中。
  版本推进或重建LS能解决当次可用性，却不能结算遗失的租约。不能只修A、让实际重建更频繁后当作修好了B。
- “可分别触发/保留”不等于已跑过人为删掉getProjectVersion的反事实compiler。没有修改版本门槛来制造B。

责任划分：compiler私有lastProjectVersion提前提交、仅从installed Program释放文件，是实际安装实现的
异常安全缺口；共享Registry本身按每次acquire计数，没有owner概念，不能猜测哪份失败租约可以删除。
我们的Host在取消检查点抛错符合现有取消合同，不应删除检查点来规避问题。
适配层仍须负责兼容所固定compiler：目前错误只回包、坏LS留驻，且没有逐LS租约账本。
coordinator的lease归还和engine脚本Map清理正常，不能替代compiler文件租约的清算；
域级缓存把这项遗漏延长到SDK域生命周期，但正常的SDK pin不是根因。

Worker致命退出属于第三类。上一轮实际LSP受控exit17及原输入新会话READY证据继续有效；本轮不重造OOM。
`semantic-worker-host.ts:194`设置proxy failure；supervisor的endpoint exit/error进入`:388` #fail，
显式设置#failure/#disposed、拒绝队列；proxy`:489` #assertHealthy此后拒绝新请求，配置不清该failure。
Host也未在exit处理器清除#worker、删掉root supervisor并启动重放。
本轮既有supervisor三项针对性测试通过（`fatal-policy-tests.log`：3 PASS，33未匹配跳过），保护这种终态围栏。

因此**“致命故障后旧endpoint终止/拒绝复用”是明确的现有fail-closed行为；“同会话自动重建并恢复”则缺少
这个故障入口的接线**。不能笼统说系统完全没有Worker替换能力：`semantic-worker-recycle.ts:111` recover
已有恢复事务，proxy`:476` #mutationFailed只对mutation journal的restart-required进入它；
`:151`压力/手动run又先checkHealth，无法绕过当前fatal failure。未找到“致命退出必须永久不恢复”的专门ADR决定，
不把现有行为美化为已评审的完整恢复策略，也不把它并入A/B修复。当前恢复方式仍是重启语言服务器会话。

### 最小修复点、提交/回滚边界与回归风险（仅建议）

建议先在我们的compiler适配边界做一个完整的正确性修复切片：

1. 为每个LS提供owner专属Registry facade，记录实际取得/归还的完整lease key
   （域、bucket、canonical path、scriptKind、impliedNodeFormat及份数）。放在能观察真实acquire成功、
   又不被后续SourceFile观察回调抛错遗漏的位置；正常update不当成新acquire。
   SDK保留器内部的额外pin由域owner负责，不能算到LS的待清算余额。
2. 在官方getProgram同步抛错的边界将该LS标为不可复用，撤销它的readiness/proof；
   先执行正常dispose结算已安装Program，再结算该owner剩余未配对的acquire，随后退休owner。
   下一次显式prepare从干净LS重试。自然degraded及仅输入证明不可用不能一概触发退休。
   仅调用当前dispose、仅generation++、Registry.clear、或撤掉身份/取消校验均不足或越界。
3. 替代方案是给固定compiler打可复现patch：`synchronizeHostData:124353`将版本提交移至同步成功，
   并在每个有效提前返回处提交正确状态；用本次acquire事务清单在异常时回滚未交付租约。
   不能只把lastProjectVersion那一行挪到createProgram之后就宣称覆盖checker、旧Program、换kind、
   type-root和release回调等所有失败阶段。选择compiler patch须带包补丁/锁文件/产物身份同步，
   不临时修改node_modules或用静态r4常量冒充r10证明。

提交边界：先固化真实stdio的失败/恢复/关闭回归为RED；**租约兜底与坏owner退休一起形成可部署的修复提交**，
避免单独上线“每次都能重建”却放大B。compiler patch若被选用，作为替代适配方案的独立评审边界，
不能未经验证同时叠两套回滚。Worker fatal自动恢复、Host预热参数保留、缓存性能TODO均另立任务。
回滚该切片只回滚新所有权facade/退休接线及相应构建依赖；保留本报告、失败样本和已有Windows路径修复，
不回退新鲜度合同，也不恢复已暂停索引路线。

必须覆盖的回归：同版本故障撤销后直接READY；连续失败再成功；每次取消后重试；失败未修时关闭；
成功/自然degraded的3进3出；与另一活跃LS共享SDK时不误释放其AST；同SDK/换SDK；热更新新增/删除/import、
换kind/选项/节点格式，以及checker或观察回调抛错后的单终态与完整答案。主要风险是双release、把update当
新租约、误释放pin/其他owner、退休时仍有active lease、失败后读旧Program发布结果；不能牺牲完整性换恢复。
本次只有Mac单根小夹具，未验证Windows、多活动SDK、热构建异常、heap字节斜率或所有compiler阶段。

### 补证复现与原始文件

正式根 `.bench/degraded-init-cause-v2-20261023/`：

- `validation-ledger.json`：12次命令与起止/退出；各`*-probe-{1,2}/wire.ndjson`、`stderr.raw`、
  `report.json`和`probe-*-1.ndjson`保存完整公开输入、状态、真实栈、内部事件；原始失败不筛掉。
- `state-transitions.json`：版本提交、提前return、安装/失败/dispose逐次状态及原始行号。
- `project-lease-journal.csv`、`analysis.json`：逐文件计数配对、逐owner余额、各检查点AST/Program存活数。
- `verification.json`：124请求单终态、源码/runtime/native不变、探针SHA；`fatal-policy-tests.log`：针对性3/3。
- `run-case.mjs`、`lifecycle-base.cjs`、`lifecycle-probe.cjs`、`run-validation.py`、`analyze.py`：可复现驱动。
  每个手写脚本均小于500行。原始上一轮封存包不覆盖；本次另存根因补证包与SHA。

```sh
# 完整重放：把上述五个驱动/探针及分析脚本复制到.bench下同层新目录，避免覆盖已有ledger/样本。
python3 .bench/<新目录>/run-validation.py
python3 .bench/<新目录>/analyze.py

# 单场景复现，replay1为新的trial名称，不覆盖已有1/2：
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/degraded-init-cause-v2-20261023/run-case.mjs throw-snapshot-repeat replay1 probe
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/degraded-init-cause-v2-20261023/run-case.mjs cancel-retry replay1 probe

/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='fails the root closed exactly once|treats endpoint error as terminal|fences send and decode faults' \
  tests/semantic-worker-supervisor.test.mjs
```

工具校准目录 `.bench/degraded-init-cause-20261023/`也完整保留：smoke1/2因bundle hook名称/参数匹配错误而失败，
smoke3及初版12轮用于校准，不混入本节正式12会话/124请求。初版事件payload的kind字段覆盖了事件名；
正式v2拆为scriptKind，逐事件计数经owner余额和真实Registry检查点交叉验证。
正式v2的project前缀辅助字段问题及排除方法见上文，未因此改写原始日志。
分析脚本调试中对null/list result的错误已修正后重跑成功，未改动会话数据。
本轮没有运行全量check:fast、没有改变产品实现或安装依赖、没有提交或合并；455冷目录门槛及缓存性能TODO保持原范围。
