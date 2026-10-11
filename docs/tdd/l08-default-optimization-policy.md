# 默认语义优化策略的公开回归

日期：2026-10-11。父revision：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
用户授权六项优化默认开启及通过PR合入main，范围和回滚见
[ADR 0015](../adr/0015-default-resident-optimization-policy.md)。

## RED和GREEN

Node固定为`/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node`。
公开LSP用例使用真实生产子进程和Content-Length stdio。
每切片先运行下述failing command，再最小修改默认值、构建并复测。

| 完整用例名称 | RED | GREEN |
| --- | --- | --- |
| default optimization policy reuses complete references without benchmark opt-in | 2405ms，resident hits 0而非2 | 1580ms，两种声明策略和同内容晋升复用 |
| RSS admission defaults on without benchmark control | 4893ms，多批计划未按启用政策拒绝 | 1185ms，资源错误且无部分Locations |
| cost-aware capacity eviction defaults on without benchmark control | 2295ms，成本见证0而非2 | 1510ms，按实际成本驱逐且overlay精确 |
| persistent pressure uses default transient diagnosis without benchmark opt-in | 11051ms，v2临时诊断完成事件缺失 | 1844ms，精确2304 range且无resident再准入 |
| prepared suite pins the default diagnostic worker without benchmark opt-in | 1949ms，无诊断Worker pin仍启动，CLI1而非拒绝2 | 2086ms，未绑定先拒绝、绑定后执行 |

前三项命令为`node --test --test-concurrency=1 --test-reporter=spec`
加`--test-name-pattern='^<表中完整名称>$'`，分别执行
`tests/semantic/resident-session-references.test.mjs`、
`tests/semantic/semantic-reference-pressure-sampling.test.mjs`和
`tests/semantic/semantic-l2-rearm-witness.test.mjs`。
后两项直接执行`tests/semantic/default-pressure-diagnostics.test.mjs`和
`tests/prepared-suite-diagnostic-worker-pin-cli.test.mjs`；CLI测试允许RSS采样。

显式opt-out的公开引用、正常诊断和编译器换代控制亦通过。
新测试先因未登记使manifest RED；登记进bundle-e2e后入口179→180。
纯协议fake-server夹具显式关闭其未提供的诊断Worker；生产fixture仍
覆盖正常默认，不全局关闭新优化来通过测试。

## 合入验证

第一轮相关联合88项：74 PASS、14 FAIL；13项旧测试等待resident驱逐，
而新默认临时诊断未创建该context，另一项是新登记后的bundle层计数。
更新L3实际路径见证及计数后，第二轮88项为87 PASS、1 FAIL：旧resident
诊断对照期待program trace。该唯一对照显式关闭临时诊断，保留原全部
创建/驱逐/精确结果断言，单独复测3239ms通过。默认临时诊断另有独立
公开用例，不将这个opt-out扩散到生产或整个测试层。

新完整`pnpm check:fast`的根终态在实际结束后追加。
不把两轮失败的联合结果、单独通过或历史全量结果改写成完整GREEN。
L08仍未通过，550ms及最终资源/ready门槛不变。

仍有九个既有超过500行的迁移债务文件，均较父revision减少而非增长：
`src/core/types/typescript-language-service.ts`3375、
`src/core/workspace/document-store.ts`1945、
`src/lsp/register-semantic-capabilities.ts`721、`src/lsp/run-language-server.ts`792、
`src/semantic/legacy-semantic-engine.ts`926、`src/semantic/semantic-worker-proxy.ts`560、
`src/semantic/semantic-worker-supervisor.ts`894、`src/semantic/worker-protocol.ts`1998、
`tests/semantic-worker-protocol.test.mjs`974。相关责任已在本分支提取；
新增手写源码、测试和脚本全部不超过500行。
