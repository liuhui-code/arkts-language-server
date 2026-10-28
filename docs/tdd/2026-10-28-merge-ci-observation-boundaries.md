# 合并候选：CI观测边界校准

父版本：`3ab8936b9550c04ce63a1749708d7e95757332e6`，PR [#100](https://github.com/liuhui-code/arkts-language-server/pull/100)。
本次只修改公开LSP测试及其夹具，不修改产品实现、路径/新鲜度校验、执行/取消截止、恢复预算或规模/内存阈值。
用户已授权UI权限仍阻塞时按正常PR流程合并；真实UI仍为0动作/0秒。

## 原始失败

[Linux CI run40646223350](https://github.com/liuhui-code/arkts-language-server/actions/runs/40646223350)
使用Node20.19.5，完整`pnpm check:fast`执行2085项：2082pass、3fail，0cancelled/skipped/todo，2147225.656ms。
不是455文件冷目录3秒门槛或500ms体验目标导致失败。Windows安装/重装/已安装LSP smoke通过，不代表真实Windows项目UI通过。

| 失败测试 | 原断言及已知事实 | 校准后的合同 |
| --- | --- | --- |
| `interactive-diagnostic-fairness`的outgoingCalls | 公开响应之前B诊断不得发布；无错误响应已通过，后续payload断言未执行 | 实际前台Worker dispatch必须早于已排队B；结果必须正确，A/B最新版本的2322诊断仍完整发布 |
| package entry retarget | 整段会话不得出现resident hit；两个查询的结果已与新进程精确oracle一致，旧PackageConsumer已消失 | false/true声明策略各用独立会话，等待基线诊断完成后warm，再修改manifest；各自首次查询仍禁止resident hit且必须fallback |
| L04 retarget | 同上，且执行选定budget-aware保留策略 | 同上，保留实际策略运行/未移除当前fallback状态的断言 |

原CI未保存这些夹具清理前的完整阶段日志，不能据此断言其自然窗口与下列受控实验时序完全相同。
可确定的是原断言混用了Worker调度、父端校验和重建后的合法状态；控制实验能独立证明这些边界。

## RED→GREEN：前台派发与完整响应

真实stdio LSP，不替换compiler/Worker执行。诊断A在真实Worker中有限等待，B实际排队；
只在测试preloader中对outgoingCalls终态**之后**的`Unopened.ets`真实realpath结果交付增加40ms。
该延迟模拟父端I/O差异，不写入产品或增大任何截止时间。

- `outgoing-delayed-red.log`：原断言失败，dispatch顺序仍为A→outgoingCalls→B。
- 对应日志时间：前台dispatch07:53:48.039Z，B dispatch48.069Z，前台公开完成48.199Z。
- `terminal-vs-validation.ndjson`保存三次真实result-source realpath及堆栈：
  `SemanticRequestRunner.runCallHierarchy`(`src/lsp/semantic-request-runner.ts:323`)
  →`CallHierarchySourceAuthority.validateResultItems`(`src/lsp/call-hierarchy-source-authority.ts:194`)
  →resolve/最终身份复核。因此B发布可先于完整响应，不表示它先占用了前台Worker时隙。
- `outgoing-delayed-green.log`：同preloader及原deadline下通过；仍检查正确被调函数及其URI、两份最新诊断和真实派发先后。
- 未插桩Node20基线也观测到B dispatch先于前台公开完成，见`node20-baseline/`；不把诊断插桩耗时当普通时延。
- 反向检查`fifo-policy-negative.cjs`仅在诊断进程内将真实队列选择改为FIFO，原文件字节不动：
  新测试仍在“前台必须先派发”处失败（`fifo-policy-negative.log`），并非删断言获得GREEN。

## RED→GREEN：失效拒绝与后续合法复用

在两个公开references之间插入公开implementation请求，保留真实输入、manifest改动与新进程oracle。
`recovered-reference-red.log`中两种策略均在原“全程无hit”断言失败；此前精确payload比较已通过。
阶段证据为首次resident miss→完整fallback→当前implementation成功→第二次completeScope resident hit，
后者`programBuilds=0`并非对旧输入的成功复用。`recovered-reference-green.log`保留同一干预：
两种声明策略改为独立首次查询后均通过，首次no-hit、batch及完整新进程oracle断言不变。

另新增公开对照`a fresh complete Program may serve references after the stale package owner was rejected`：
首查询必须miss/batch且无hit，真实implementation重建后第二查询允许completeScope hit；两个payload都必须等于新进程。
夹具未实现`afterReference`时`package-recovery-red.log`在“真实中间重建必须执行”处失败；
增加该夹具生命周期回调后`package-recovery-green.log`通过。该回调仅测试驱动可用，无产品钩子。

这证明原no-hit观测范围过宽；**不证明原CI一定由同一个implementation请求触发**。
普通诊断也可能重建有效状态，原SDK freshness测试已经允许首次拒绝后的合法命中。

## 命令、原始证据与最终门禁

证据根目录：`.bench/merge-candidate11-20261028/ci-diagnosis/`，保留RED/GREEN日志、清理前夹具日志及以下诊断脚本：
`capture-test-cleanup.cjs`、`delay-outgoing-validation.cjs`、`interleave-recovered-definition.mjs`。
`../ci-linux-job-raw.log`是完整原始Linux job日志，`../ci-status.json`保存失败结论；失败记录不覆盖。

普通完整两文件命令（Node20.19.5及Node26.3.0分别串行运行，无preloader）：

```sh
node --test --test-concurrency=1 --test-reporter=spec tests/semantic/interactive-diagnostic-fairness.test.mjs tests/semantic/references-batch-search-coverage.test.mjs
```

普通两文件实际结果：Node20为32/32、134972.961ms；Node26为32/32、131427.970ms，
均0fail/cancelled/skipped/todo，见`focused-node{20,26}.log`和`focused-verification-receipt.json`。
`pnpm check`退出0。与candidate11的775输入相比仅三份已有测试/夹具变化并新增34行包入口夹具；
产品源码0变化、87冻结产物0差异，见`qualification-identity.json`。

诊断RED/GREEN不是全量通过证据；定向name筛选中的未选测试明确记为skipped。
最终提交仍须通过新一轮完整`pnpm check:fast`和适用release检查，结果以PR最终HEAD的CI及本地收据为准。
不复用旧候选2085/2085来宣称修改测试后的新提交已过全量。

产品输入/产物仍对应原candidate11，两小时协议证据继续只证明同一产品字节的协议范围，不能补记真实UI。
真实SDK11pass/2原180秒超时、30K完整references/rename范围缺口、原自然M002窗口与原生索引高内存仍保留。
用户仅豁免455冷目录3秒门槛、测试Node RSS2048MiB停测线；500ms允许体验波动，不新增替代硬门禁。
