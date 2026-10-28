# ADR 0024：partial 初始化范围与同步取消的活动见证

- 日期：2026-10-26；2026-10-27验证；状态：Accepted，已在工作树实现，未发布/合并。
- 父版本：`17e923f0cb8c430b6a10793a0f3d2f9097febfec`。
- 任务及逐片证据：[逐项清单](../plans/2026-10-26-30k-interactive-recovery-checklist.md)。
- 原始原因：[30K 不可用归因](../reports/2026-10-26-main-30k-unavailable-root-cause.md)。

## 已证明的问题

30K 超过 membership 的 20000 路径保护上限，不能认证全项目 READY。
初始化在返回该状态前已经预装项目文本，但没有构建 Program；这些驻留 barrel 随后被当成交互入口。
因此“初始化 complete”没有意味着 SDK/Program 已充分准备，SDK 相对解析和大量无关项目依赖留到了首次查询。
固定闭包下的增量优化没有覆盖该 partial 分支，不能据历史小规模通过宣称全操作规模无关。

ADR0023 禁止在可变 Program 同步中任意展开取消，但原父端 watchdog 对同步活动没有观测，
普通 close/open 把后台诊断标为 content-modified 后，即使编译器持续处理新文件也在 1s 后整体退役。
尚未发送的前台查询随所属 supervisor 被销毁，得到通用 worker-unavailable。
公开 LSP 的有限 SDK 图读取已重现该问题，不需要假设 OOM 或无限循环。

## 决定

1. partial 初始化只在原 coordinator/root owner 中准备 **显式空项目根的 SDK/标准库上下文**。
   不把初始化锚点和项目预装 documents 送入该 LS；SDK Registry/pin、配置域和初始化压力豁免仍沿原所有权。
   首次局部查询按自身实际依赖准备根并增量同步；partial 不冒充 READY，完整引用仍遵守完整性合同。
   不提高成员上限、堆限制或截止时间，不在此处新增全局 Program。
2. 相对模块候选复用限于原有同步 QueryModuleResolution 作用域，保留首次实际 load-owned 证明。
   正/负候选按原路径大小写为键，1MiB 估算元数据预算，溢出普通解析；作用域结束清空。
   逐 importer 的物理来源、符号链接和包含边界核验仍执行；独立最终联合校验不复用旧资格。
   SDK/文件变更、较高优先级候选后来创建及未知输入不能被缓存遮蔽。
3. 细化 ADR0020/0023 的父端取消保护：仅在共享观测的 epoch/commandId 与该活跃请求匹配，
   且 phase 为 synchronize/program/checker 时，持续更新的同步活动序列可以更新取消宽限的起点。
   活动来源是实际编译器 SourceFile/绑定入口和同步中的 Host 取消检查点，不依赖 Worker 定时器或异步 ACK。
   无活动仍按原 1s 取消宽限退役；**绝对执行/准备截止始终从原开始点计时，不因活动、取消或重试延长**。
   活动只说明到达观测点，不证明一定产生有效进展；即使无限循环不断调用检查点，绝对执行截止仍须终止它。
4. 输入取消立即撤销旧结果的新鲜度；安全同步完成后旧请求结算一次，当前 mutation 正常应用，前台不继承旧答案。
   真正构建异常仍走清算/quarantine；致命退出、无活动、绝对截止仍走原共享恢复预算，确认旧 Worker exit 后才建替代者。
   不自动重放已执行请求，不吞错，不补充预算，不新增并行语义 owner。
5. 完整范围请求在改变 compiler 范围前做完整 membership 准入。原 references planner 本来已要求 complete，
   这次将注定失败的入口提前，防止被拒绝的 references/rename 再次污染局部根；保留完整性错误码、不发布截断结果。
   partial 清单仍保留已枚举路径，但不预读无关源码正文；实际目标依赖不受清单前缀截断。
   incoming-calls 的 `source-unavailable` / `project-membership-incomplete` 具体结果仍由原接口返回。
   引用保留原能力文案；partial rename提前拒绝仍为-32803且无编辑，通用输入不足文案与原位置不可用文案的差异列入报告。
6. partial全局请求的成员重试只调用现有 `refreshProjectMembership` 实扫；不把重试本身伪造成 `rootDirty` mutation。
   清单/磁盘身份未变时不清空局部解析状态；真实增删改仍按原扫描结果失效，配置/未知根通知仍保留原保守重置。
   不缓存partial为永久终态，也不省略为恢复完整清单所需的实际扫描。

## 参考及适用边界

- [TypeScript 4.9.5 services.ts](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts)：
  原地 synchronizeHostData 的取消安全边界；固定 ohos-typescript 实装源码仍需适配，不能假定上游回滚能力存在。
- [TypeScript moduleNameResolver.ts](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/compiler/moduleNameResolver.ts)：
  成熟的模块/目录解析缓存分工。官方缓存不授予本项目输入新鲜度，复用仍由现有 load witness 和最终校验约束。
- [Node 26.3.0 Worker 文档](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html#workerterminate)：
  SharedArrayBuffer 可供线程间观测，terminate/exit 提供物理生命周期机制；进程级 OOM 或不可中断 native 不由此获得完整隔离保证。

本次 Context7 resolve 请求连接失败，采用官方来源和实际安装源码；不机械引入 clangd 的陈旧 preamble 或 rust-analyzer 的不可变数据库假设。

## 必须验证

公开 framed-stdio：跨 20K 的 SDK 提前解析和局部根隔离；同输入 Program 复用；实际相对候选少探测但后来创建必须拒绝旧资格；
有限持续活动同步中 close/open 不触发换代且回答当前前台请求；无活动卡住仍取消退役；持续假活动不能绕过绝对截止；
真实取消、较新编辑、配置重放、单终态、失败清算和物理退出/预算原回归。
规模对照必须区分磁盘总数、Program 入口、实际 SourceFile/依赖闭包；真实 UI 和协议重放分开。
不以本决策宣称 500ms、完整 30K references、所有大型项目或 OOM 已解决；最终证据及限制更新于任务报告。

TDD 及首次完整检查暴露的兼容性失败保留于
[逐片记录](../tdd/30k-partial-initialization-20261026.md)。完整检查需对最终候选重新执行，不能沿用中间版本的局部通过。

最终v5完整`pnpm check:fast`2050/2050通过，零fail/cancel/skip/todo，退出0；检查前后760项源码/测试/配置、实际编译器及5项生产制品SHA不变。
九档最终候选各三轮、原Photos/30K及捕获协议证据见[实施报告](../reports/2026-10-26-30k-optimization-execution.md)。
完整>20K global能力、全部操作500ms、自然OOM与真实UI未闭环；这些限制不因ADR实施或fast通过而关闭。
活动观测也不能证明任意有限函数都会及时到达检查点：单个长期无检查点的解析/native调用仍可能触发原取消宽限；
本次有限SDK图与30K协议证据不外推成任意Windows重编译的保证。

## 2026-10-27：同步区之外的准备必须实际接通取消

真实 Mac Zed 在 copy_003 编辑/撤销及连续导航后出现连续取消退役，最终熔断。
ADR0024 的同步活动保护没有覆盖所有 `phase=request` 工作，也不应扩大为任意活动都延长取消宽限。
公开 child-LSP RED 进一步确认：Legacy 引擎向编译器传入 HostCancellationToken，
却没有向 SemanticDocumentStore 传入已有 operationControl，导致依赖准备/成员枚举的检查点默认空操作。
有限依赖读取在请求已取消后继续运行，超过原 1s 宽限便被终止。

修复将同一动态请求令牌接到 store 既有检查点；准备取消沿既有事务回滚并结算一次，
后继 undo/open/config mutation 不继承已取消请求的 AsyncLocalStorage 上下文。
Program 原地同步继续采用 ADR0023 的安全提交边界。真正不返回、执行截止、恢复预算和隔离世代规则不变。
资源装配抽到 semantic-engine-resources，避免 adapter 超限文件增长。

[本次诊断与回归](../reports/2026-10-27-edit-undo-definition-unavailable.md)区分真实现场、受控延迟和普通协议重放。
现场首次退役的精确内部函数未捕获调用栈；不能把该确定缺口直接等同于全部 8 次现场退役，
也不能凭普通重放未复现宣称真实 UI 验收完成。

本补丁最终Node20完整 `pnpm check:fast` 2052/2052通过、零fail/cancel/skip/todo，检查前后760项输入及制品SHA一致。
冻结v5在受控连续4次undo后熔断；修复候选5次undo保持单Worker。九组真实30K协议重放1539功能请求前后均未自然复现，真实UI验收仍未完成。
