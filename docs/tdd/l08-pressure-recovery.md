# L08：模块访问突发后的 Worker 恢复

日期：2026-10-11。父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
用户授权仅修复压力后恢复失败；原 dirty 工作树保留，不改验收门槛或默认实验配置。

## 反馈回路与 RED

真实 Content-Length stdio、生产 server/Worker：先补全，再访问并关闭 20 个
模块，编辑主文档，施加 L3，立即补全。用既有 1500ms 诊断 hold 固定
Worker 繁忙窗口，不模拟 semantic owner、compiler 或传输。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-reporter=spec \
  --test-name-pattern='^completion recovers after module visit mutations and L3 pressure$' \
  tests/lsp-production-semantic-worker.test.mjs
```

原产物 server `9510101a…`、Worker `60156e4e…`。
无 hold 的小夹具首次 GREEN，不能冒称有效 RED；固定繁忙窗口后两次
相同 `-32603: Semantic worker restart required`，首次 2764.62661ms，exit1。
只把访问数改为 15，6198.4028ms、1 PASS/6 名称过滤；恢复 20 后再次失败。

## 原因与修复范围

20 次 open/close 产生 40 条不可跨生命周期合并的变更，超过原 32 条
mutation journal 上限；Supervisor 按合同 fail-closed，而 proxy 把
restart-required 永久锁存，没有恢复。错误出现在压力后的请求，不等于
由压力驱逐本身造成。队列/字节上限、close/open 生命周期 fence 保留。

恢复在既有 Worker 生命周期 owner 内终止旧 Worker，再注册全部根并
顺序重放 DocumentAuthority 最新打开文本；不重放已关闭文档。随后处理
快照后的变更，新请求可取消地等待恢复。其它错误仍 fail-closed。
旧 Worker 退出后才创建新 Worker，不启用实验性压力回收开关。

首次恢复 GREEN 后按既有 characterization 抽出 mutation settlement tracker，
proxy 560→559 行、不增长；剩余超限迁移债保留。回收/诊断/production
三个原入口 29/29、exit0；取消与第二次 L3 补全保护单例 GREEN。

追加“恢复期间未打开文件的 outgoingCalls”公开保护，先取得同文件准确
target/range，再关闭文件、触发恢复并立即 follow-up。第一版恢复错误地
清掉全部延迟变更，漏掉不在打开文档表中的 version0 临时 staging；
RED 为 `Semantic document changed`，5014.927464ms、exit1。
最小修复保留延迟队列，顺序 flush，沿用现有生命周期 barrier 与 wire bounds。
不以快照重放替代恢复期间必须执行的临时 staging 或 workspace invalidation。

随后多根公开反例保留另一根在途 v2 变更，再令第一根 journal 溢出。
旧 Worker 替换取消另一根变更的晚到 `worker-unavailable` 被错误锁存到
新 Worker；RED 5355.718155ms、exit1。tracker 退休旧 mutation generation，
只隔离旧代结算；新代真实失败仍进入原 health/fail-closed 路径。
两个根的最新未保存补全、正常版本化诊断与未打开 follow-up 均须通过。

中间构建 server `2d2fc70f…` 的原 10k 完整工作流已经 PASS，18 会话
（cold3/warm10/stress5）包含全部 5 次压力后补全；不重 pin 为随后
多根修复后的最终构建证据。原 benchmark 脚本、夹具和 SDK 未修改。

## 验证状态

最终构建 sourceInput `f5585462b2f6011e517e6d99d9a1170281f9e6d972a45550dd77e3d0d84e82e6`，
server `00272459562a21ec2acc408a31b54a996175b811badf99b5d7576493b4c79b3e`；
Worker `60156e4e…` 不变。固定 Node20.19.5、原 API24 SDK，实际 SDK
digest `8098b8ab…`。`pnpm check`、`pnpm build` 与差异检查通过。

最终公开单例 11377.017536ms、exit0；两根最新 v2、取消、第二次 L3、
真实不同 threadId、未打开 outgoingCalls 完整 payload 和正常诊断通过。
九文件串行回归 110/110、exit0，零 fail/cancel/skip/todo，
163815.416915ms；统计不与重叠的早期 29 或名称过滤单例相加。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-reporter=spec tests/lsp-production-semantic-worker.test.mjs \
  tests/semantic-worker-supervisor.test.mjs tests/semantic-worker-supervisor-lanes.test.mjs \
  tests/semantic-worker-protocol.test.mjs tests/semantic-worker-project-snapshot.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs tests/semantic/semantic-worker-recycle.test.mjs \
  tests/semantic/references-diagnostic-scheduling.test.mjs \
  tests/semantic/semantic-readiness-lifecycle.test.mjs
```

原脚本完整执行 cold3/warm10/stress5：最终默认 10k、选定配置 10k 和
选定配置 100k 全部 PASS，三次 CLI 均 exit0，各 18 会话、5 次压力后
补全成功、correctness.failures=0；总计 54 会话、15 次压力后补全。
每个会话完成 10000/100000 全目录准备，没有删减原 fixture、scope 或 SDK。

| 最终功能工作流 | 报告 | 压力后补全观测范围 |
| --- | --- | --- |
| 默认 10k | `.bench/l08-pressure-recovery-final-default-10k.json` | 3255–3341ms |
| 选定配置 10k | `.bench/l08-pressure-recovery-final-selected-10k.json` | 3291–4941ms |
| 选定配置 100k | `.bench/l08-pressure-recovery-final-selected-100k.json` | 5280–6019ms |

这些是功能恢复开发观察，不是≥100请求/能力×桶的550ms SLO认证；
完整响应仍为秒级，不能把报错消失宣称为性能毕业。三报告的原采样均
保留，peak RSS分别666603520/667918336/867971072 bytes；不是PSS对照。

最后工作流终态后再完整读取19个指定源码/测试/工具/产物/Node文件、
两个fixture全部10006/100007个文件字节及路径，SDK declarations及
其它 pins、分支、HEAD/本地main/本地origin-main引用；五组向量全等。
Settings仍clean、全部源码/产物/夹具/SDK不变；之后才更新本证据文档。
记录 `.bench/l08-pressure-recovery-final-{frozen,postflight}-inputs.json`
与 `.bench/l08-pressure-recovery-final-state.json`，后者保存完整命令、
原始15个压力样本、报告SHA及作用域。focused日志一次工具观察截断
保留，只声明完整根统计与退出，不冒称逐字完整stdout。

本缺陷功能修复 DONE：原三组失败流程当前都成功，取消、两根最新文本、
version0 staging及新代真实失败保护通过；所有实验开关和预算值保持。
原首个 rewritten struct 引用超时未修改，不把它或其它L08门禁改为PASS。

proxy 最终保持 560 行（原有超限迁移债，不增长），tracker36、recycle215、
production test349 行。没有 debug 日志；隔离临时构建目录已清理。
新 whole check:fast 未运行，旧 1580/1579/1 FAIL 不改写；不以本缺陷的
功能修复验证宣称 550ms、PSS/DevEco、L08 产品准入或允许合 main。
