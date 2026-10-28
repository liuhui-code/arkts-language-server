# 编辑撤销后导航不可用：TDD记录

父提交17e923f0cb8c430b6a10793a0f3d2f9097febfec，叠加此前v5未提交候选。
实际Windows/Mac旧问题不外推，本轮现场是Mac Zed，PID92778。

## RED

`ARKTS_TEST_EVIDENCE_DIR=.bench/edit-undo-definition-20261027/controlled-red node --test --test-concurrency=1 tests/semantic/edit-undo-definition.test.mjs`

- 冻结v5 server SHA118d7575…；Worker SHAd600e3c4…，完整身份见报告。
- 最接近公开边界的真实Content-Length child LSP；没有mock掉store、Host、compiler或监督器。
- 初始化/首定义成功后添加64份真实依赖，在文件打开点每份有限40ms；编辑引入依赖、查询、真实$/cancelRequest、undo。
- 两轮各退出1，实际读取25/24份依赖；phase=request、Program/checker/sync已返回；后继定义-32603 Worker unavailable。
- 原日志 `controlled-red.log`、`controlled-red-repeat.log` 及两个同名证据目录全部保留。

## GREEN与提炼

- 最小接线：store既有operationControl使用runtime HostCancellationToken。
- 先 `pnpm build`，再执行公开回归，避免测试旧dist。单入口GREEN后提炼同域资源装配为semantic-engine-resources。
- 后续completion对照和另一文件overlay mutation强化了生产装配、取消域退出、新输入行号与单终态保护。
- 双入口2/2通过，两个路径均只读1份依赖，没有Worker退役；准确目标与新行号正确、正常shutdown/exit0。
- 原有近邻49/49通过（与后来双入口有重叠，不把它们相加宣称51项独立覆盖）。
- manifest原精确计数因新增入口失败，随后总入口257、bundle-e2e131；原失败/最终通过日志均保留。
- 修改后的Legacy767行，低于此前候选783行，仍是迁移债；新增资源30行，fixture/test都小于500行。

## 防止再次漏测

原store单测手动注入operationControl，无法发现生产引擎漏传；同步回归只覆盖mutating compiler commit。
新公开回归覆盖进入真实store的准备阶段以及后继mutation和多次导航，不把“mock取消测试通过”等同于完整装配正确。

最终完整检查及自然30K验证详见[本轮报告](../reports/2026-10-27-edit-undo-definition-unavailable.md)。
普通30K重放修复前也未复现，受控RED证明边界不外推成所有现场退役函数已捕获或实际UI已验收。

## 后续同版本因果对照

修复后追加仅undo（不发送显式$/cancelRequest）和连续5次undo诊断，Node20；源码/产品制品不再改动。
冻结v5对照4次取消宽限退役、3次恢复后熔断，前3次恢复后的定义仍正确；失败响应和熔断都保留。
新候选5次undo始终1个Worker，无退役/恢复，后继定义正确。
普通30K七组共1197功能请求前后都未自然复现，不能只显示修复后成功。
首轮完整检查在沙箱内遇spawn EPERM等原生采样问题，主动停止并保留失败输出，后以所需权限完整重跑。

最终Node20完整`pnpm check:fast` 2052/2052通过，退出0、零fail/cancel/skip/todo，54分13秒。760项输入及server/Worker制品SHA检查前后不变；原沙箱失败不删除。

完整检查后按真实Zed光标位置补两组undo-before-navigation串行协议重放，两版各171功能请求均未自然复现。九组合计1539功能请求、54次undo，未装入当前用户Zed，UI验收仍单列。
