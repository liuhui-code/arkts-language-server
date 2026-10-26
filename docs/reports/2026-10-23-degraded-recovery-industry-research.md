# 初始化构建失败、取消与共享 AST 所有权：业界方案调研

日期：2026-10-23。性质：官方文档和源码调研、适配建议；未实施产品修复、安装依赖或合并。
项目事实以[本项目运行诊断](2026-10-23-degraded-initialization-recovery-and-lifetime.md)为准。
本轮没有重跑性能测试，也没有启动暂缓的引用缓存优化。

## 结论与适用范围

可参考的成熟机制是：**输入版本与完成状态分开、失败作用域有确定收尾、共享缓存有明确所有者、
故障按请求/LS/Worker分级隔离，并对重试与重启设置边界**。
以下是多个成熟项目的具体实现，不能理解为所有语言服务器采用同一套代码，或上游已经替本项目解决问题。

优先尝试通过Context7检索TypeScript文档，但resolve-library-id因连接
`https://mcp.context7.com/mcp`失败；改用下列官方一手文档和源码核验。
TypeScript固定审阅v5.9.3；其他main/master为本日读取的移动分支，不声明其对应已发布版本。
没有执行第三方项目回归或证明某个版本无缺陷。

## 官方实现与本次问题的对应关系

### 1. Salsa：完成结果与中断执行分开，异常时退出活动查询

Salsa的普通查询先运行，再生成/插入memo。源码明确说明普通查询panic时不插入memo，
后续依赖它的查询可以重新执行；循环定点查询另有provisional状态，不适用这一简单规则。
该分支专门使用`PoisonProvisionalIfPanicking`在异常时把临时结果变为没有值的初始状态，
避免残留结果被误当成可复用的完成结果。
见官方[execute.rs](https://github.com/salsa-rs/salsa/blob/master/src/function/execute.rs)，
重点为execute及PoisonProvisionalIfPanicking。

活动查询的push返回`ActiveQueryGuard`；成功通过complete生成完成记录；异常展开时，
Drop仍弹出活动查询。它没有依赖“最后肯定能走到正常返回”来恢复内部栈。
见官方[zalsa_local.rs](https://github.com/salsa-rs/salsa/blob/master/src/zalsa_local.rs)，
重点为ActiveQueryGuard::complete和Drop。

对应建议：本项目“已见过版本V”与“版本V成功同步”必须区分；失败不能仅留下成功快路径的版本标记。
查询/coordinator lease、Registry文件租约和初始化任务分别有自己的收尾，不能拿一个finally代替全部。
这是从源码机制推导的项目建议，不表示应把Salsa移植进来。

### 2. rust-analyzer：取消是专门的控制流，快照与输入代次绑定

`Analysis`代表一个时点的分析状态；输入推进会取消已有分析。`Analysis::with_db`通过
`Cancelled::catch`包住可取消操作。Salsa的catch只吸收自己的取消payload，其他panic继续展开，
没有把所有异常都解释成正常取消。
见官方[ide/src/lib.rs](https://github.com/rust-lang/rust-analyzer/blob/master/crates/ide/src/lib.rs)
和[cancelled.rs](https://github.com/salsa-rs/salsa/blob/master/src/cancelled.rs)。

rust-analyzer架构文档还区分破损用户代码与系统错误：前者是分析需要处理的输入，
并说明请求边界使用catch_unwind隔离panic。
见官方[Architecture：Cancellation / Error Handling](https://rust-analyzer.github.io/book/contributing/architecture.html)。

对应建议：自然缺依赖的degraded、客户端取消、compiler构建异常与Worker死亡应走不同状态。
取消终结原请求；后续新请求可以重试，但不能偷偷重发已取消请求并再回一次响应。
输入变化仍须通过本项目已有版本/新鲜度围栏，不能借“重试”发布旧结果。

边界：当前读取的rust-analyzer源码仍对fixpoint cancellation记录了synthetic_write兼容处理。
不能据此宣称成熟引擎的每一种取消都天然安全，也不能照搬它的revision bump作为本项目修复；
本项目已证明仅推进版本不能释放遗失租约。

### 3. clangd：缓存持有空闲 AST，作用域守卫归还借出的 AST

clangd的`TUScheduler::ASTCache`拥有空闲AST；Worker使用时take，完成后归还。
`ASTWorker::runWithAST`以`unique_ptr`持有对象，并在调用上层Action前建立`scope_exit`，
保证正常离开该作用域时归还缓存；LRU驱逐使用明确析构释放。
见官方[TUScheduler.cpp](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/TUScheduler.cpp)，
重点为ASTCache、ASTWorker::runWithAST。

这段实现还区分“没有缓存条目”与“已构建但失败的空AST”。后者会回invalid AST，
不是所有失败都立即重新解析。构建失败状态需要明确的刷新/重试策略，不能把它误当成功。
作用域资源安全也不等于可从任意native crash或abort恢复。

clangd把兼容preamble与主文件AST分开管理，队列丢弃已取消读请求和被后续写覆盖的旧更新。
见官方[Threads and request handling](https://clangd.llvm.org/design/threads)。
对应到本项目：借鉴所有权和调度边界，保留合法SDK共享，不把clangd允许使用旧preamble的
交互策略套到本项目要求当前完整输入的references/rename上。

### 4. Roslyn：不可变分析模型，修改形成新快照

Roslyn的Solution/Project/Document属于不可变模型；取得的Solution不会随编辑原地变化，
编辑通过基于原实例构造新实例表示。它提供了“权威输入正在变化”和“查询所见模型”分离的成熟参考。
见官方[Work with a workspace](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/work-with-workspace)。

其增量生成器文档要求传递取消token，在长操作中检查取消，让host重新运行；
不建议自行保留半生成结果继续拼接。
见官方[Incremental generators：Handling Cancellation](https://github.com/dotnet/roslyn/blob/main/docs/features/incremental-generators.md)。

对应建议：新的Program与其输入证明成功后才能成为可发布状态；“输入版本已消费”不等于Program已完成。
这是架构原则参考，不能声称ohos-typescript的SourceFile/Program因此已具备Roslyn的不可变保证；
也不建议为这两个缺陷重写整个工作区模型。

### 5. VS Code Language Client：致命关闭后有限重启

`DefaultErrorHandler.closed()`维护重启时间记录，根据maxRestartCount和三分钟窗口决定Restart或DoNotRestart，
防止无限崩溃循环。见官方[client/src/common/client.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/common/client.ts)。

这是客户端监督整个语言服务器连接的实现，不是现成的Node Worker恢复模块。
对本项目可借鉴“隔离终态、建立新代次、有限重启”的机制；Worker重建还必须由我们的父线程
重放SDK/配置、workspace roots和最新未保存文本，并重新准备/证明READY。
只清proxy.#failure会继续触碰死endpoint，不构成恢复。

### 6. TypeScript：共享 AST 是官方路线，但不能假定升级即可解决异常安全

官方DocumentRegistry用于多LS共享SourceFile，通过acquire/update/release管理引用。
见[v5.9.3 documentRegistry.ts](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/documentRegistry.ts)。
这支持继续共享SDK AST；不支持在某个LS失败时清空所有owner的Registry。

但核对的v5.9.3 `synchronizeHostDataWorker`仍在构建前赋值lastProjectVersion；
cleanupSemanticCache/dispose按已安装Program的SourceFiles释放。
见[v5.9.3 services.ts](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/services.ts)。
这一静态对照不证明v5.9.3在所有相同输入下都重现，也不代表后续所有版本未修；
足以说明“更新TypeScript版本即可修复”目前没有依据。ArkTS还依赖ohos fork，不能直接换标准TS。

## 结合当前项目，建议的恢复策略

以下是依据上述机制与本项目实测作出的设计建议，不是第三方源码的直接功能承诺。

| 实际状态 | 保留什么 | 应做什么 | 何时允许再次尝试 |
|---|---|---|---|
| Program正常存在，缺依赖而degraded | 可用LS、共享SDK及合法AST | 记录缺失输入，保持正常输入失效规则 | 修复输入后prepare；不强制重启 |
| 冷构建中取消/抛错，Program未交付 | 权威文本/配置、其他健康owner、共享SDK合法pins | 终结请求；结算失败owner租约并退休损坏LS | 清理完成后，新显式prepare或新语义请求可用相同输入重建 |
| Program已完成，仅查询取消 | 经核验仍一致的Program/LS | 取消请求，清理请求作用域；不一律销毁LS | 后续独立请求正常复用 |
| 输入终检失败 | 权威输入和可证明安全的共享语法 | 撤销该次发布资格，消费最新输入 | 按现有content-modified合同处理 |
| owner清算无法证明一致 | 父线程中的权威输入 | 停止复用损坏域，升级到受监督的Worker重建 | 新Worker输入重放并认证后 |
| Worker致命退出 | 父线程最新文档、配置与根列表 | 拒绝旧代次响应，有限重启并重放 | 新代次可用；超限明确不可用，等待显式恢复 |

第一阶段最小范围：

1. **逐LS租约所有权 + 失败LS退休作为一个完整切片。** facade记录本LS实际成功取得的完整Registry key和份数。
   先正常dispose，再结清剩余余额；域owner的SDK额外pins另算。正常update不盲目记成新acquire。
   需覆盖acquire后观察回调抛错、dispose重复调用与其他活跃owner，避免双release或漏记。
2. **失败不封死相同输入的下一次准备。** 通过新LS干净状态恢复当前私有lastProjectVersion问题；
   明确记录输入版本、attempt和最后完成版本，不把失败Promise或失败版本当作成功命中。
   不要求为恢复而伪造一次编辑，也不做无上限后台重试。
3. **Worker fatal恢复单独评审。** 复用已有recycle/recover事务能力，为致命退出增加有限监督入口和代次围栏；
   普通请求取消或自然degraded不触发整Worker重启。

长期可选择对固定ohos编译器补事务提交/回滚，但需要覆盖热Program、换kind、旧文件释放和checker失败等阶段。
这比当前适配层隔离的影响面更大，必须用同一批公开LSP反例证明，不能只挪一行lastProjectVersion。
上述适配层方案也尚未实现，不能据此承诺恢复时延或内存收益。

## 后续验收重点

- 相同版本撤销故障后可重试，不依赖编辑/重启；连续失败再成功。
- acquire/release余额在失败owner退休后为0，其他owner及SDK pins保持合法。
- 真实取消只有一个终态；后续成功；自然degraded不被误当系统崩溃。
- 冷构建、热更新、新增依赖、移除文件、换kind和checker/回调异常分别验证。
- Worker恢复重放最新overlay；旧代次不能发布；连续崩溃达到上限后停止自动重启。
- 正常成功路径继续复用Program/AST，不扩大到全局缓存清空；此前缓存性能TODO维持暂缓。

本轮只调研和记录；未改变ADR决定、产品代码或重试合同，未执行提交、推送或合并。
