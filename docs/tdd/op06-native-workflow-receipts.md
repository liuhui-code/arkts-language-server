# OP-06：真实原工作流模块访问与失败报告留存

日期：2026-10-15。父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，
分支 `codex/op00-query-attribution`。本切片相关 GREEN；OP-06／L08 IN_PROGRESS。
按 TDD 保持原生产 CLI、真实 compiler、Content-Length stdio、3cold／10warm／
5stress、原期限和六默认／1024MiB；没有增加语义 owner 或额外查询。

## 原模块访问证据

公开反例：`run-macos-e2e.mjs` 完成18个原会话却未保留stress实际模块动作。
命令：Node20 `--test --test-reporter=spec tests/macos-workflow-module-visits-cli.test.mjs`。
RED0/1、exit1；最小实现观察原transport.send，并转发原调用和异常，记录
实际didOpen／didClose完整消息、URI／version／source及monotonic开始／结束。
每stress20组，共100组；冷／暖访问数组为空。GREEN1/1、exit0。
SENT只证明原send返回／入队，不证明服务器确认、加载成功或原生处置。

证据前缀 `.bench/op06-native-workflow-visits-{red,green}-v1*`。
GREEN log SHA `ea2546d6502cc49aa7c30f157e6268cc1f7a2a79988ece9deedb51f5f6237f33`，
audit SHA `e2374c3319dfde8f35c3ec226f149b347119ab6f00bc5f60387b7e24764158c5`。
库存未登记的3/4原FAIL保留，补登记后207/unit101/fast200。

## 原失败：未定位，不能宣布修复

原八文件联合77/78、exit1、零注解，source／SDK／产物稳定：
`macOS workflow retains every full semantic response and pressure receipt`
失败为 `MACOS_RUNTIME_LIFECYCLE_INCOMPLETE`。fixture在断言之前未留存报告，
临时目录又随t.after清理，故缺失／重复事件的实际计数不可恢复。
前缀 `.bench/op06-native-workflow-visits-related-v1*`；log SHA
`c5c4518581f6f2744a2b66461ab5a5a0535fe78454f05939eddd9cf8ac999d11`，
audit SHA `9adc1bcd9bd90fbd1480e36b55e86d97d303168d7ec7fb640c381dcbe06176d3`。

临时实际写报告观察器的首轮路径检查错误保留为工具FAIL，不是原问题重现。
纠正后原名称一次复测1PASS／32名称过滤、exit0，18会话均started1／stopped1／
exit0，没有重现；不当完整文件或整轮GREEN。实际报告保存在
`.bench/op06-native-lifecycle-diagnostic-v1/report.json`，原字节不改。
该诊断不是正常性能／PSS实验；临时preload及DEBUG marker已从源码删除。

## 失败报告留存的公开 RED→GREEN

真实服务器先返回完整语义响应，再在OS退出边界产生exit17；driver如实FAIL。
原fixture意外退出只抛预期0／实际1，测试诊断中没有原报告：名称过滤RED0/1，
另1项过滤、exit1，前缀 `.bench/op06-workflow-failure-retention-red-v1*`。
log SHA `43e26406bfb2d8e361649be17aa711984b438e9c89ac67ceaa17cee8e3af1399`；
audit SHA `1f7c8b83cc51da56fe9323e3f04bfca0cf2462155fad6415855b1ca854d67fa0`。

最小改动仅在意外退出时，先通过t.diagnostic输出JSON事件
`macos.workflow.unexpected-exit`、真实exitCode／signal和原UTF-8报告全文reportText，
再执行原assert.equal；不把错误当成功，不改原生日志或报告数值。
原报告包含完整响应、运行日志、实际退出与未执行尾部，可从测试日志重读。
preflight尚无报告时保留null，不补造执行；预期失败不额外输出意外退出事件。

默认沙箱完整文件1/2 FAIL为采样spawn EPERM，原事件和报告实际留在日志：
服务器started1／stopped1／exit0，非原生命周期重现。该FAIL与原字节保留。
授权原生只读采样后完整2/2、exit0；补preflight／预期失败边界后新文件4/4。

## 相关验收与资格边界

八完整文件联合81/81、exit0／signal null，零skip／cancel／todo，355624.268069ms。
含原完整product-gate、三项PSS工具与产品内存消费、库存及runner失败诊断。
前后source／SDK／产物一致、真实PID退出，临时探针已删除。
前缀 `.bench/op06-workflow-failure-retention-related-v1*`；log SHA
`97fab912ba807e4b54cfb85d2a0b7989e53fb14e526fe9607f8c544bcfc484a0`，
audit SHA `bc4342bd3e198f9c8302b9db57de637b7059d92e04a76f49a687a8ef4f583a6a`。
script444／receipt75／fixture128／test92行，均≤500；strict／syntax／diff通过。
生产input5cf9d618及全部产物不变，旧冻结1757/1757不覆盖新工具head。

本机私有API24 fixture SDK和真实compiler资格工具，不是实际完整产品／DevEco
测量或Linux PSS。原77/78失败未定位，复测通过不能宣称修复。继续实际执行／
完整payload／缓存／ready消费、原生采样树／峰值／OOM、生命周期／soak／平台／
历史峰值与全证据正例／336格；合入前新工具head须fresh whole。
