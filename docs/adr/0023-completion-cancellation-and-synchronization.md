# ADR 0023：补全取消与 Program 同步的完成边界

- 日期：2026-10-25。
- 状态：Accepted，工作树实现完成；Mac完整fast2039/2039、Windows相关50/50及指定UI正确性通过；500ms未达标，未发布/合并。
- 父提交：`e35459131366a32c48c10d1d74adef74357cd3dc`，叠加既有未提交候选。
- 问题证据：[编辑后补全拆解](../reports/2026-10-25-edited-completion-latency-breakdown.md)。

## 问题与主流实现依据

Windows 真实 Zed 中，自动补全被取消时打断 Program 同步。ADR0020 正确回收损坏的内部 LS，
后续诊断却要重新构建 Program/checker，3074ms 的诊断及其他读取阻塞手动补全。
SourceFile 复用不能保留已退役服务中的语义状态。现有调度也无法越过夹在诊断与补全之间的高亮/预取。

1. [TypeScript 4.9.5 官方 services.ts](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1350)
   在 synchronizeHostData 的原地更新区明确禁止中途检查取消，因为增量解析会修改旧 Program 的 SourceFile。
   [5.9.3 同一约束](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/services/services.ts#L1798)仍在。
   本项目适配层的 snapshot/module-resolution 检查点必须遵守同一边界；不能只让编译器内部遵守。
2. [clangd 请求调度](https://clangd.llvm.org/design/threads)区分更新与读请求，丢弃已取消读取、合并连续更新，
   使用去抖减少输入过程中的无用重建。其独立补全线程和允许旧 preamble 的合同不适用于本次单语义 Worker 和新鲜度要求，
   本轮仅借鉴生命周期分离与前台调度，不引入并行 compiler 或陈旧答案。
3. [rust-analyzer 架构](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)
   通过不可变 Analysis/Salsa revision 取消过期计算；取消安全依赖其存储与 unwind 合同。
   当前固定 TypeScript 使用可变 Program/AST，不能照搬“任意中途退出后仍安全复用”的前提。

本次 Context7 resolve-library-id 的 HTTP 连接失败，使用上述官方源码/文档核验；未把训练记忆作为实现依据。

## 决定

1. 仅在已开始的同步、非异步 `raw LanguageService.getProgram()` 边界内，暂缓本 Worker 的
   SemanticCancellationScope 协作取消检查。同步包含 Program 构建和 checker 准备，不跨越语义查询或 await。
   请求取消 cell 原值不改；同步前先检查，已经取消的请求不开始构建。
2. 成功同步后、执行语义查询前再次检查取消。取消只终结旧请求；成功提交的 LS/Program 留在原 owner，
   下一条同输入请求可以复用。该取消检查必须放在失败同步的 catch 之外，不能再次把健康实例退役。
3. 同步自身真实抛错仍严格执行 ADR0020 的失效、dispose、Registry 清算和 quarantine 规则。
   真实错误与客户端取消同时发生时，保持请求单一终态及独立资源故障监督；不吞清算错误。
4. 父线程监督不进入此临界区。取消宽限、排队/执行截止、Worker 终止与恢复预算全部保留。
   同步不能及时完成时仍受现有截止约束；没有扩大超时或允许永久运行。
5. 完成列表可以越过尚未开始的诊断及高亮、类型定义等交互读取，寻找范围止于第一个 global 请求。
   不跨越 mutation/global 屏障、不抢占正在运行的同步任务、不新建 Worker/Program owner。
   每个队首请求至多被越过一次，随后必须执行；完整诊断继续发布。define/hover 原优先规则及 detached references 合同保留。
6. 较新编辑、关闭/重开、配置变化及 SDK 变化仍撤销旧请求的新鲜度，旧答案不得发布。
   已同步旧输入不会冒充新版本 READY，mutation 应用后仍须正常更新/认证。

## 修订边界

细化 ADR0020：真实失败同步须退役；请求取消发生但同步安全完成时不属于失败同步。
扩展 ADR0006：补全的一次有限越过不再只观察紧邻诊断的下一条请求，而是在 global 屏障之前查找。
既有 root 结果缓存、全范围身份核验、新鲜度合同、共享 SDK 与内存压力规则均不修改。
更大范围的缓存优化 TODO 继续暂停；本次用户重新授权的是此补全取消/调度缺陷修复。
455 文件冷目录 3 秒性能门槛继续按用户授权排除。

## 回归与风险

首先通过真实子进程 Content-Length LSP 重现：编辑补全构建中取消导致 Program 未返回；
诊断→高亮/类型预取→补全顺序导致补全仍等待未执行的诊断。两条独立 RED 后逐项最小实现。
覆盖同输入复用、较新编辑隔离、取消后 owner 释放、真实失败/清算异常、同步不返回监督恢复，
以及补全公平性、global/mutation 屏障和真实诊断发布。源码在同步前后不能误保留取消屏蔽。

临界区期间取消响应可能等待同步完成或原有监督截止；不承诺任意大型构建能立即合作取消。
本次不是编译器事务回滚补丁，不支持复用真正失败的 Program，也不宣称所有编辑性能或规模成本达到 500ms。
实际最终结果见 [TDD记录](../tdd/completion-shared-preparation-20261025.md)及[实施报告](../reports/2026-10-25-completion-shared-preparation-and-priority.md)。
