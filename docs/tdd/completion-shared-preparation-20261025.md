# 补全取消与前台调度：TDD 记录

父提交 `e35459131366a32c48c10d1d74adef74357cd3dc`，分支 `fix/windows-path-identity-20261022`；
保留全部既有改动。前置普通候选由 `.bench/completion-resolve-20261025/final-validation-inputs-v3.json` 冻结。
本轮证据根 `.bench/completion-shared-preparation-20261025/`，Node 20.19.5。
决策：[ADR0023](../adr/0023-completion-cancellation-and-synchronization.md)。

## 切片一：已开始同步不因请求取消而中断

RED 命令：

```sh
node --test --test-name-pattern='cancelling an edited completion' tests/semantic/failed-build-recovery.test.mjs
```

`01-red-shared-sync.log`：真实 LSP 热态局部编辑，在 Main.ets snapshot 读取中暂停300ms，发送真实取消帧。
旧候选 Program 正常返回次数仍为1，期望2，明确失败；不是使用“没有RPC错误”代替性能/复用证明。
private preload 只控制隔离夹具，不给产品增加暂停开关。

最小实现：SemanticCancellationScope 在同步调用栈内暂缓合作取消；recoverable LS 同步前后检查取消，
同步后取消检查位于 retire catch 外。真实异常仍回收。`03-green-shared-sync.log` 同命令 GREEN。
下一条同版本 completion/readiness 不新增 Program 构建、符号正确、仅一个 Worker、配置退休后项目租约归零。
name-pattern 运行中未匹配的其他测试为 skip，仅证明选中的一项，不作为整文件 PASS。

## 切片二：补全不能被夹在诊断后的预取隐藏

RED 命令：

```sh
node --test tests/semantic/completion-foreground-scheduling.test.mjs
```

`04-red-foreground.log` 保留初版测试把不同请求的补全句柄作整包相等比较的采集断言错误；它不是产品调度反例。
改为比较相同目标的语义字段后，`04b-red-foreground.log` 明确失败于“首次补全必须越过尚未执行的诊断”，
实际诊断已先返回。真实 child/stdin LSP，诊断、highlight、typeDefinition、两个不同文档的 completion 串行入队。

最小实现：在 global 屏障之前查找 completion，复用原一次越过预算；最老请求下一次执行。
`06-green-foreground.log`：1/1 PASS，首补全越过诊断和高亮，第二补全等待该诊断，两个最新诊断均发布。
未增加 compiler 并发或绕过 mutation。

## 扩大回归与校准

`07-focus.log`：55项中54 PASS、1 FAIL；失败是新增测试文件后 manifest entryCount 仍为250，实际251。
补显式层分配并更新精确计数，不放宽分类完整性断言。
`08-edit-and-fairness.log`：19项中18 PASS、1 FAIL；新编辑交错用例原期待-32801，
实际沿既有补全新鲜度合同返回精确空列表。测试改为检查该既有空列表、最新别名补全和定义结果，产品映射不改。
两个失败原始记录保留，不追认为通过。

原“取消打断构建后归零”测试改为“取消后成功同步，持有有效租约直到正常退休”，
继续严格检查构建次数、同版本复用、单终态和退休归零。
资源故障叠加取消测试显式注入暂停后的真实 snapshot 异常，使其仍经过失败清算并验证独立故障监督，
不再依赖人为中断本应原子完成的同步。真实失败各阶段的原回归继续保留。

最终扩大回归、全量及Windows真实UI结果见下节；上述较早失败记录保留，不追认为通过。

## SDK取消合同、提取与Windows实际资格

`15-cancel-boundary-characterization.log`保留旧“第64边立即停止”的失败。
该取消发生在编译器原地同步里，按新合同须先完成同步、再拒绝调用，不得复用被中断的Program。
保留真实取消与无结果断言，改为严格检查第65边完成、下一个边界取消（检查点计数精确为6），
并用新token验证同输入terminal成员仍可用。`16-sdk-sync-contract.log`选中项通过；
`17-before-extraction.log`整个原22项通过后，再提取SDK职责和通用harness，
`18-after-extraction.log`提取后28/28通过。原超限文件缩到1267行，剩余迁移债务仍列入报告。

Windows初轮44/49、补验46/49分别暴露夹具URI、隔离Git元数据及漏同步config的问题。
v3的49/50中SDK单项未进入依赖图：properties解析把未转义的Windows反斜杠移除。
先在隔离Windows副本仅替换正斜杠书写，`windows-sdk-case.stdout`为1/1 PASS，再将相同修正同步仓库。
未修改产品解析器或放宽进入依赖图/取消/恢复断言。
最终`windows-regressions-v4.log`为**50/50 PASS**，零fail/skip/cancel/todo。
所有较早失败日志保留，最终用例未排除失败分母。

Mac普通沙箱全量`12-check-fast.log`因原生进程采样spawn EPERM出现29条失败后中止；
`13-*`、`19-*`在最终跨平台测试输入固定前停止，均不称为全量通过。
最终747项输入冻结于`final-validation-inputs-v3.json`；完整全量结果以`20-final-check-fast.log`结束状态为准。

## 最终收尾

`20-final-check-fast.log`：完整`pnpm check:fast` **2039/2039 PASS**，退出0，零fail/skip/cancel/todo。
Node20.19.5，测试时长3335816.410ms；747项源码/测试/构建/配置输入前后完全一致。
`final-identity-audit.json`及`final-windows-audit-v2.*`证明Windows同747项一致，产物/编译器指纹不变、
私有诊断进程0、任务0、真实Photos工作树干净。`git diff --check`通过。

普通同机对照，旧版→新版六次编辑后补全中位3591.737→647.820ms、最大5651.636→807.603ms。
新版仍4/6超过500ms；旧版与新版各16条详情零错误、编辑接受/跳转位置全部正确。
另有新候选观测会话6条正确、16条详情零错误，真实取消中的Program/checker成对返回，后续同输入复用；
更早新候选普通初始化180秒超时，未执行六条业务流程，失败证据完整保留。
一条复合SSH采集命令超过Windows命令行长度，未执行，保留`windows-ui-normal2.*`错误；
改为原有短脚本顺序执行后完成普通对照，没有更改产品超时。
阶段范围与统计限制详见[实施报告](../reports/2026-10-25-completion-shared-preparation-and-priority.md)。
455冷目录门槛仍按授权排除，引用缓存性能TODO暂停；无推送、合并、发布或日常安装替换。
