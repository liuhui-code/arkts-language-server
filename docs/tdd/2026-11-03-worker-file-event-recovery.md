# 熔断恢复保留压缩文件事件来源

日期：2026-11-03。父版本：`c0a6da0db115de563c41de0f959b0f60aad9538c`。
范围：当前版本的恢复准入缺口；不是用户 Windows 首次卡死的现场归因。
依据：[ADR0020](../adr/0020-failed-semantic-build-recovery.md) 的真实输入变化、受限半开及物理退出合同。
以下原始收据为提交前验证快照；后续独立main整合见文末，发布和完整CI以新PR收据为准。
未合并或部署；生产超时、恢复次数、默认内存策略和完整输入校验均不变。

## 当前实现反例

`WorkspaceFileChangeCoordinator` 收到配置文件事件或单批超过1024个路径时，
把源文件集合压成 `rootDirty=true, changes=[]`；配置事件另保留 `configurationChanged=true`。
这是既有有界失效机制，不表示输入没有变化。
但父端 `SemanticWorkerEngine.#mutate` 只在非文件mutation或非空 `changes` 时推进恢复输入修订。
因此熔断后，真实修复后的磁盘内容无法通过“新输入”半开门槛。

两场独立公开framed-stdio对照先以既有仅测试preload的4次退出建立熔断，
再真正修改 `Unopened.ets`，令完整定义范围从第0行移到第1行：

1. 源码通知与真实修改的 `oh-package.json5` 通知同批送达。
2. 一条修正源码通知与1024个真实创建源码通知同批送达。

两场继续返回 `-32603 / Semantic worker unavailable`，没有半开，Worker启动总数4。
不再修改任何磁盘字节，只补发同一源码的单文件通知，均半开一次、Worker总数5，
返回精确第1行目标且关闭exit0。独立对照见证据目录 `probe.mjs`、`result.log`。
退出及父端时间窗口推进是受控测试，不冒充自然大工程首故障。

## RED → 最小 GREEN

新用例加入既有 `tests/semantic/worker-recovery-configuration.test.mjs`，不新增测试入口或调整分层计数。
测试先在原180秒窗口内发送上述真实变更，仍要求不可恢复；
再由既有preload只推进父端速率时钟181秒，要求只读状态仍不启动Worker，
显式定义才用一次半开恢复。重复定义必须相同，物理创建/退出交替且最终归零。

```sh
node --test --test-name-pattern='collapsed file changes unlock' \
  tests/semantic/worker-recovery-configuration.test.mjs
```

父版本构建上RED：0PASS、2FAIL、2名称过滤skip，exit1，7120.749694ms。
两例均在过期窗口后的显式定义断言失败，实际仍是unavailable，不是初始化/夹具失败。
保留 `red.tap`，没有修改预算或放宽结果断言。

最小实现把真实文件事件来源作为editor-neutral入口的可选 `origin="file-events"` 传到父端。
只有已通过现有coordinator归属/类型检查且形成有效batch的通知获得来源；空/无关事件无batch。
父端在原mutation入口按来源推进恢复输入修订。该标记不进入Worker协议，不新增持久映射、
文件扫描、AST/Program所有者或主动恢复；实际请求仍经过原 `admit`、速率预算和退出围栏。

不能仅把所有 `rootDirty` 计为新输入：同值 `workspace/didChangeConfiguration` 也合成空rootDirty。
该调用不携带文件事件来源，继续由 `configureProject/configureSdk` 的深相等比较决定输入是否改变。
文件事件只是既有变更通知证据，不作为语义有效性证明；查询仍须实际读取及终检。
重复文件通知的准入规则与原非空文件列表一致，不重置速率或绕过失败半开立即熔断。

Node20.19.5、pnpm8.15.9、Linux x86_64，`pnpm check`、`pnpm build`通过。
最小GREEN：2PASS、0FAIL、2名称过滤skip，exit0，9712.840068ms，见 `green.tap`。
另补公开负向回归：已过速率窗口，空列表、非法URI、无效type、根外文件均不能解锁；
随后真正根内文件变更仍能精确恢复。它是审查后增加的保护，不伪称此前RED中的测试。

## 验证收据与边界

最终8个完整相邻文件84/84PASS，0fail/skip/cancel/todo，exit0，165177.622495ms。
审查补负例前的首轮83/83PASS（162974.536682ms）单独保留，不冒充最终84项。
覆盖：本文件、unresponsive-worker-recovery、worker-recovery-replay、replay-model、
workspace-configuration-authority、workspace-file-change-coordinator、LSP workspace-file-changes、global-freshness。
重点保持相同配置/成员顺序不解锁、失败半开不链式重启、只读/诊断不花探测、最新overlay重放与全局新鲜度。

完整命令：

```sh
node --test --test-concurrency=1 \
  tests/semantic/worker-recovery-configuration.test.mjs \
  tests/semantic/unresponsive-worker-recovery.test.mjs \
  tests/semantic/worker-recovery-replay.test.mjs \
  tests/semantic/worker-recovery-replay-model.test.mjs \
  tests/workspace-configuration-authority.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs
```

证据根：`.bench/worker-file-events-recovery-20261103/`；最小GREEN身份 `candidate-before.json`。
最终验证前后 `candidate-final-before.json` / `candidate-final-after.json` 的3产品源码、1测试和4入口构建SHA全部一致。
完整日志 `final.tap`，恢复原始记录 `final/`，物理生命周期记录 `final-audit/`；首次83项为 `related-first.tap`。
三产品文件contracts441、LSP498、proxy496行；测试163行，均不超过500行。
完整 `pnpm check:fast`、真实Windows/Zed、用户大项目、初始故障及长期恢复风暴未在本片验证。
不以本修复宣称当前用户首故障已定位、性能达标、RSS改善或L08毕业。

## Independent main integration

新PR独立基于 `298d65f5d7f796c347fe8be5c739e428066489d8`，未带入未合并PR115的SDK构造清理。
两修复与其无代码依赖，旧c0a6da0的RED和输入SHA保留为历史证据，不冒充新main候选。
独立整合Node20check/build通过，17完整文件142/142、零fail/skip/cancel/todo，199165.70419ms；2224输入前后一致。
完整命令、portable安装、缺WASM限制及独立Windows步骤TDD见[安装验证补记](2026-11-03-installed-diagnostic-worker.md#independent-main-integration)。
Windows job在安装与installed smoke后，使用原期限运行本恢复文件全部5例，无名称过滤；
这一步验证构建目录中的真实bundle，前一步则验证已安装bundle。发布前只有Linux预验，原生结果须以目标head CI为准。
