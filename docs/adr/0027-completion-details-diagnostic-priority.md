# ADR 0027：补全详情在普通诊断队列中的有界优先

- 日期：2026-10-27。
- 状态：**Proposed；维护者已授权实现，candidate11调度回归及7204.609秒协议混合验证完成；按500ms体验目标跟踪尾延迟，未记录独立评审，不追认Accepted。**
- 问题：[SOAK-30K-M003](../plans/2026-10-11-query-performance-follow-up-plan.md#soak-30k-m003)。
- 依据：[队列因果链与对照](../reports/2026-10-27-30k-issues-root-causes-and-adrs.md#m003)。

## 背景与现有合同

详情被归为 interactive，但普通队列的诊断绕过名单只有 define/hover/complete。
原 30K 详情等待5266.325ms才 send，先等待一个在途诊断及八个随后派发的诊断。
期间没有 mutation。小夹具中，八诊断同输入时，resolve 等其余七个诊断；
列表 complete 则在在途诊断结束后先派发，所有最新诊断仍正常发布。

[ADR0006 §Queued automatic diagnostics and interactive navigation](0006-semantic-request-scheduling.md)
与 [ADR0023 §决定5](0023-completion-cancellation-and-synchronization.md)明确了特定方法
的有限绕过，未授予所有 interactive 相同优先。当前实现遵循旧名单，遗漏的是详情场景。
[ADR0022](0022-completion-resolution-lifecycle.md)解决句柄生命周期，不保证详情调度时延。

## 拟议决定

2026-10-27修订原“只加入详情”的草案：维护者明确要求统一实际调度与交互分类，避免逐方法补名单。

1. 用穷尽全部Worker方法的策略表作为分类和选择器的共同来源；新增方法必须明确选择类别，编译检查遗漏。
   completion（列表/详情）高于其他interactive，interactive高于自动diagnostic；同级FIFO。
   实际需要完整范围的implementations/references/prepareRename/rename/incomingCalls及semanticReadiness为global屏障。
   局部prepareCallHierarchy/outgoingCalls按interactive处理，公开LSP对照验证其正确结果和诊断发布。
2. 保留 mutation 优先、global 屏障及每个队首最多一次被绕过的公平性。
   不抢占已经运行的原地编译；不新建 Worker/Program 并行处理详情。
3. 普通队列仅在第一个global之前选择较高优先类；队首被越过一次后必须先执行，再重新选择。
   因此列表/详情也能有限跨越普通prefetch，不会让诊断或低一级读取无限饥饿。
   detached references既有lane保留，使用相同interactive分类；不新增并发编译owner。
4. 先执行 ADR0022 的句柄/文档生命周期验证。过期可合法返回原 item，
   真正后端故障仍显式失败；不得把所有慢详情降成原 item 来虚报时延。
5. 用户完整响应500ms目标包含父端队列等待。有界优先不保证长在途编译
   能在500ms内结束；分别报告排队、Worker执行与完整时延。
   2026-10-28用户明确该值为体验目标，允许适当波动；偶发超过不独立判功能失败或阻塞交付。
   按典型体验、分布、频率和持续性评估，持续严重慢响应/超时/不可用仍记录，不新增替代硬线；
   详见[当前时延评估](../benchmarks/interactive-latency-assessment.md)。

实施期间补证：父端preResolved快捷路径也必须通过Worker所有权准入，不能凭文档版本绕过namespace证明。
按ADR0025用小收据校验后复用原载荷，仍作为resolveCompletion进入同一有限交互队列；
无需传输大段缓存文档/编辑，也不新增编译owner。缓存命中不等于可跳过输入/世代/恢复约束。

## 成熟实现参考与取舍

[clangd调度](https://clangd.llvm.org/design/threads)保留更新/读取顺序、丢弃失效读取及合并冗余更新，
避免无关后台工作堵塞交互；其[调度源码](https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-20.1.8/clang-tools-extra/clangd/TUScheduler.cpp)
先处理取消任务并保有单AST所有权。采用明确工作类别、有限队列和所有权边界，不照搬每TU线程或过期答案策略。
[LSP官方取消与顺序规范](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/specification-3-14.md)
允许不影响正确性的读取重排，但不能改变结果所依赖的先行操作，取消仍须有响应。
本轮Context7失败，以官方原文回退；使用的是上述稳定基础合同，不以旧版说明宣称新版本新增能力。

选择现有监督器的有限优先，而非无界最高优先、每方法特殊绕过或另起编译Worker。
原maxWaitingRequests、mutation文本/条数背压、取消cell、根revision及global覆盖保持不变。
用户主动发起的全范围工作仍可能是global，foreground是使用场景，不代表可以绕过它的完整范围合同。

## 回归与验收

- 公开 LSP：八诊断积压后，用服务端真实签发 item 请求详情，断言正确详情先于排队诊断。
- 原队首随后必须运行，多轮交替详情不得饿死诊断；八份最新版本诊断全部发布。
- mutation/global屏障、正在运行诊断、取消/关闭重开、同数字版本新生命周期和伪造句柄。
- 完整计时与父端准入、Worker接收/dispatch独立记录；不跨线程时钟做差。
- 调度矩阵通过公开LSP执行并核验结果/最新诊断，以真实Worker dispatch先后验证排队优先；
  完整响应仍包括返回后的磁盘身份核验，不能用后继诊断是否已发布替代该派发边界。
  [CI受控RED/GREEN](../tdd/2026-10-28-merge-ci-observation-boundaries.md)保留I/O和重建交错对照。
- 所有interactive分类与普通队列一致的穷尽合同、所有global屏障、持续列表/详情到达下队首最多一次被绕过。

## 边界与回滚

独立调度切片与公开回归；不修改输入证明、详情 fallback、SDK、结果缓存或 Worker 恢复预算。
不与 M002 的计时参考点修复捆绑。原 30K/2h 失败及500ms未达标保持原记录。
工作树实现及公开RED/GREEN见[本轮TDD](../tdd/2026-10-27-three-soak-defects.md)，完整检查/耐久验收另记录，不用本草案状态代表通过。

## 2026-10-28最终验证收据

candidate11完整fast2085/2085，7种公开交互矩阵与队首有界绕过/公平性/global-mutation屏障回归通过。
7204.609s混合中304份详情均实际enriched，p50/p95/max93.807/1241.931/1387.730ms；不以安全回退虚报语义成功。
最慢详情请求3621的trace37426等待1206.780ms；到达时10661诊断已在途，随后即10662详情，期间0个其他诊断派发。
本例修复原“继续排八诊断”的遗漏，**仍可能被一份长在途诊断阻塞**，不能宣称500ms或所有尾延迟解决。
原5328.783ms与本轮不同目标/输入，不能当严格A/B提速率；[最终报告](../reports/2026-10-28-three-soak-defects-final-verification.md)保存同请求区间与限制。

2026-10-28按新体验口径关闭M003原调度缺陷；46/304份详情超过500ms等测量保留为体验观察，
不是以单次/偶发超过目标判功能失败或要求全部压进500ms才交付。反复尾延迟仍需结合使用场景评估。
