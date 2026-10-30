# Windows UI 后续修复 TDD 记录

父提交`4859f76c46265a885332d7141c99698bf749c61e`；已有ADR0030/0031候选和未提交工作保留。
本轮基线及patch：`.bench/windows-ui-remediation-20261030/baseline.json`、`baseline.patch`。
[ADR0032](../adr/0032-completion-item-identity-and-inferred-roots.md)；[执行计划](../plans/2026-10-30-ui-remediation.md)。

## 公开 RED → GREEN

所有语义反例通过真实子进程、Content-Length stdio；没有用私有server方法代替。
证据根`.bench/windows-ui-remediation-20261030/`，每次证据含wire、stderr和操作结果。

| 切片 | 失败合同 / 实施 | 原始命令与结果 |
| --- | --- | --- |
| A1 | 两个有效item串行均完整，并发前项被supersede；改用服务端UUID隔离lane，文档失效scope保留 | `COMPLETION_LIFECYCLE_EVIDENCE=<root>/completion-red node --test --test-reporter=spec tests/semantic/completion-resolve-lifecycle.test.mjs`；`completion-red.log`→`completion-green.log` |
| A2 | 同item重复订阅仍相互取消；复用InFlightRequestCoalescer，消费者独立取消 | 同上目录改`duplicate-red/green`；`duplicate-red.log`→`duplicate-green.log` |
| B | partial20007源文件，Program已含两个closed依赖，未变化查询却使Program1→2；分离推断根与驻留文本，按真实Program/snapshot/磁盘身份证明复用 | `node --test --test-reporter=spec tests/semantic/partial-completion-admission.test.mjs`；`promotion-red.log`→`promotion-roots-green.log` |
| A3 | A1/A2候选128个有效item并发预取，57份物理队列满错误；加逐workspace有界详情准入，物理队列64保持 | `COMPLETION_LIFECYCLE_EVIDENCE=<root>/prefetch-red node --test --test-reporter=spec --test-name-pattern='bounded editor prefetch' tests/semantic/completion-resolve-lifecycle.test.mjs`；`prefetch-red.log`→`prefetch-green.log`11/11 |

A3的`prefetch-stale-build-attempt*`是tsc类型错误后误用旧构建的无效GREEN尝试，实际失败；保留并排除最终依据。
类型明确为`VersionedSemanticResult<SemanticCompletion|null>`后重新check/build，才执行最终11项。

补充：排队消费者取消只给其-32800/单终态，其他127项有真实签名；排队时编辑/关闭/重开，旧句柄不能复活，
新句柄返回当前string类型。原恶意句柄、关闭重开同数字版本、真实mutation对照保留。
B补真实未保存类型变化、关闭回盘、磁盘watch变更，另运行完整成员promotion/SDK/包/目标入口/完整引用对照。

## 聚焦与完整检查

最终命令：

```sh
node --test --test-reporter=spec \
  tests/semantic/completion-resolve-lifecycle.test.mjs \
  tests/semantic/partial-completion-admission.test.mjs \
  tests/semantic/semantic-same-content-promotion.test.mjs \
  tests/semantic/navigation-foreground-scheduling.test.mjs \
  tests/semantic/interactive-diagnostic-fairness.test.mjs \
  tests/semantic/completion-foreground-scheduling.test.mjs \
  tests/semantic/references-coalescing.test.mjs
```

`final-targeted-v2.log`34/34/exit0。早一次命令误写diagnostic-fairness文件名，只跑27项，不能替代34项。
`pnpm check`/`pnpm build`通过；首次完整`pnpm check:fast`写`check-fast-final.log`，2110/2113、exit1（下述3项观测fixture失败）；
修正后的最终完整复跑`check-fast-verified.log`已exit0：2113/2113，fail/cancelled/skipped/todo均0，3278904ms。
初次沙箱检查遭进程采样EPERM；允许进程访问的中间检查因新A3 RED被主动停止，均不是完整通过。
仅按stdout文件和进程组核对后停止本轮检查，停止凭据保存；未停止用户服务。

## Windows 条件分开

旧默认C临时目录运行24pass/1cancelled，30K夹具串行写入65952ms，initialize到65955ms才发送；
LSP实际初始化成功、首定义成功、退出0，75秒用例总截止截断后续轮次。取证`startup-timeout-analysis.json`及`startup-timeout-diagnostic-v2/`。
没有证据将慢磁盘归因Defender，未改安全设置。异步夹具实验仍写入63336ms、同样失败，实验已排除；源码恢复基线，原实验保留。
原同步夹具只将测试TEMP/TMP移到专用D盘，三项通过；75秒、完整30K、四轮和产品截止均不变。
不同TEMP条件分别统计，不宣称默认C条件通过。最终冻结候选公开回归及真实UI结果另补，不累计不同进程为单会话。

最终D串行仍失败，独立诊断保存`final-startup-timeout-analysis.json`：准备63233ms、初始化5729ms、前三轮定义成功，
第四轮测试总截止导致shutdown/superseded；1Worker/0退出重建，exit0。由此正式修正测试夹具生命周期：
before独立准备29998个真实文件，同卷rename到两源码fixture，断言实际30000；服务body仍75秒，
四轮及逐请求10秒/诊断12秒等正确性断言未改，before另设75秒预算，after清理已注册资源。
新结果不能冒充原“准备+验证总75秒”通过。旧原版源码、SHA、RED和变更理由分别保存在
`startup-before-fixture-lifecycle.mjs`、`startup-fixture-lifecycle-change.json`；这是测试驱动变更，不是产品超时更改。
Windows新3项GREEN：准备62815ms、服务16848ms、完整进程85583ms；真实四轮/版本37/1Worker/0恢复。
Mac新3项GREEN：`startup-fixture-separated-green.log`；完整fast运行到该文件前已载入最终测试版本，最终日志须含准备诊断与四轮结果。

无Rust修改。3077行TypeScriptLanguageService从3085行缩减，仍是迁移债务；新增职责模块均小于500行。

最终同产物Windows整组 `windows-final-regressions-separated-fixture.*` **28/28、exit0**，
2026-10-30 01:22:32–01:25:18Z；没有与全项目哈希审计并行。测试夹具计时边界变更单独记录，
原版24/1、27/1、2/1和诊断cancelled均保留，不将其抹成历史GREEN。公开私有SDK回归，不是UI/真实SDK验收。

## 完整检查暴露的 SDK 观测 fixture 缺口

第一轮完整`check-fast-final.log`发现`retained-source-evidence.test.mjs`三项10秒通知等待失败。
独立公开RED：`sdk-init-red.log`及`sdk-init-red/`保存真实子进程、帧和生命周期。
`resident-source-read-counter.cjs`原本在整个编译Worker包中要求before身份代码只出现一次，
新增HostRoots合法使用同样语句，使匹配数2；插桩在Module._compile阶段主动throw，Worker还未执行产品初始化。
额外直接Worker诊断`sdk-counter-compile-proof.json`记录确切`one actual observation identity site required`及加载栈；
这只是辅助故障定位，不能替代上述公开LSP RED。

修正观测归属：只在唯一TypeScriptResidentReferenceState类片段内注入before/after，
类边界、读站点、身份站点仍唯一断言；没有改产品局部变量名来迎合插桩、取消文本/身份断言或扩大截止。
初次按模块注释定位的尝试因esbuild重复导入/实现标记失败，`sdk-init-green.log`是保留的失败中间尝试，不能当GREEN。
实际GREEN为`sdk-init-scoped-green.log`3/3：96 SDK输入、编辑后文本重读0、真实引用身份观测192/每输入2。
Windows同产物`windows-sdk-evidence-regression.*`同样3/3；与此前28项是两次独立命令，非一次31项运行。
第一轮完整检查保留失败，修正后完整复跑另记，不能将聚焦GREEN冒充完整`check:fast`通过。

最终源码689文件及五份运行产物复核MATCH：`identity-audit-after-full-check.json`。
源码manifest文件字节SHA为`2e887c0248def38d3968582dbd2f91bfaee4c5bda06aab10216e1da044229368`；
按Python `json.dumps(manifest, sort_keys=True)`规范化后的SHA为`68258d33f5862f0170d44c36f22ec1b7ca2039ef757904c63d52e7be3c7879a6`。
两者口径不同，均可重算；无缺失/额外源文件，`git diff --check`通过。
455文件冷目录3秒性能项仍按用户既有授权跳过，不属于本次2113个默认fast测试，不能宣称该独立门槛通过。

## WUI-006：真实混合导航失败后的额外切片

第一候选公开/完整GREEN后，真实UI35分17.680秒在rapid第53宏失败，不能用此前GREEN否认问题。
父78a3158的候选仍沿用method+URI隐式替换，新增`independent-semantic-reads.test.mjs`经真实stdio复现。
`navigation-red.log`10fail/2pass；workspace/symbol另独立RED。中间测试拼写和计数错误原日志保留，修正后才采用GREEN。
统一普通、disk、call hierarchy和workspace symbol逐请求所有权；取消一个、编辑、同数字版本关闭重开仍失效，
重复相同位置也独立终态。内部参数改identityKey，不用名字暗示替换。
新增最终17项；聚焦17+11详情+1引用+4manifest共33/33，`navigation-final-focused.log`。
Windows同冻结690源清单+de22server/BFWorker共48/48、exit0，`windows-navigation-complete-regressions.*`。
此前中间候选47项、完整检查被新workspace RED主动停止，单独保留，不能计最终完整通过。
最终完整`check-fast-navigation-complete.log`另行运行；没有源/测试修改混入运行中候选。
真实UI当前四宏95.376秒通过，但原生索引0文件degraded正式暂停诊断；不以机制或校准替代正式验收。


## WUI-008：正常UI80个不同读取触发64条计数拒绝

原C3公开48项后，真实UI关闭回盘发80个不同参数、30份queue-full；3分6.406秒保护停测，不能计60分钟通过。
公开`semantic-read-burst-admission.test.mjs`原80读取RED（10份queue-full），原源码/产物、日志与UI失败均封存。
`SemanticWorkerPendingReads`把源码归属与位置分离，64来源/4MiB canonical输入，复用原调度策略；
这是替代旧“同源也只能64条”的合同，不把旧断言静默删除：原测试原件存`previous-64-request-contract.mjs`，
新测试分别验证64不同来源拒第65、字节超载、取消返还、输入失效后再准入。超载仍明确失败。
提取职责后supervisor725→716，旧测试1574→1545；两者仍迁移债务，其余新模块均≤500。

首轮扩大生命周期87/89，两个测试假定80读取全部早于服务端处理编辑，原失败保留。
新增隔离编译器入口屏障：实际query entered后发公开编辑/关闭，等待queued sibling失效，再释放；
helper新增可选preload先两项RED（未进入），后实现，控制4/4 GREEN；不是产品sleep或变更超时。
最终完整相关12文件89/89、exit0、无skip/cancel/todo，`burst-final-targeted.log`。
C4 server dd3feefd、Worker BF、694源清单冻结；新`pnpm check:fast`另跑，C3未完成检查不能替代。


C4 Windows首轮57/60：新三个unit fixture用无盘符`file:///workspace`，构造阶段invalid-request，产品未进入待测队列。
原RED保留；改用平台file URI，Mac/Win各3/3，不改产品、断言、超时和预算；完整Windows60项另复跑，不拼轮次。
694文件清单唯一测试overlay及源码SHA单列`runtime-identity-burst-portable.json`；旧包仍保留。
当时Mac完整串行check仍在prepared-suite-diagnostic-barrier，修正测试未加载，父子进程证据保存；
本轮完整结果需包含修正后三项实际执行及最终源/产物复核。


## C4最终完整RED及回归合同迁移

`pnpm check:fast > .bench/windows-ui-remediation-20261030/check-fast-burst-final.log 2>&1`
实际exit1、2133/2136、0cancel/skip/todo；3项旧合同失败及完整原源码保留。
逐请求独立读取已由父版本RED的新17项公共LSP用例保护；旧completion latest-wins用例改为延迟服务上两项均有真实结果，
代码动作改为显式取消首ID并验证取消抵抗底层也不能泄漏编辑，兄弟仍有有效版本编辑。没有降低正确性围栏。
feature evidence精确名称/claim同步；旧私有call-hierarchy preflight迁出大文件并采用当前startConcurrent接口，
原公共stdio预算验证不动。test-entry274→275，unit layer113→114（数量变化是提取一个已有测试）。
初次聚焦漏layer count的失败保留；修正后31/31，`full-contract-migration-focused-final.log`。
最终src/tests695清单a7c278e6，只有测试资格overlay、产品五产物不变。
重新执行`pnpm check:fast > .bench/windows-ui-remediation-20261030/check-fast-burst-qualified.log 2>&1`，
最终结果另补。严禁把2133/2136加31拼成完整通过。

C4真实UI正式2分39.510秒仍FAILED（WUI-009），随后独立定向3分21.853秒亦在移动后的首F12空结果停止。
迟到1852项Created事件期间触发stale；无编辑/重开/重启的三次实际F12复试均恢复。
这不等于永久缓存坏，也不构成原快速交错或耐久通过；证据与限制见报告文末。


最终Windows串行同轮91/91、exit0、0fail/cancel/skip/todo；17文件、695清单a7c278e6，runtime dd3/BF不变。
`windows-qualified-final-regressions-1.*`/attestation留存；原57/60及2133/2136不覆盖。
Mac695完整受限环境复跑的ps权限对照0/1→允许采样1/1后，仅停自有PG91216（有stdout路径证明、SIGINT130收据），
原源码/断言不变，`check-fast-burst-qualified-allowed.log`重新完整运行。不同执行环境分开，不以小对照替代完整结果。


## 最终完整结果与验收边界

最终`check-fast-burst-qualified-allowed.log`实际exit0、2136/2136、0fail/cancel/skip/todo、3006467.152ms；
`check-fast-final-qualified-summary.json`与`final-identity-audit.json`绑定695清单a7c278e6、产品五hash，源0差异、diffcheck通过。
Windows同轮91/91另有身份收据，不能跨平台相加。
真实UI原FAILED保持，新SDK跟随目标公共诊断RED0/1（不在fast计数）保持；不将局部机制通过替代交付验收。
空闲13分11.705秒无语义请求、lease0/context1；首个实际F12正确567.246ms、详情正确164.599ms，独立35命令/18.737秒。
正常AltF4、输入最终MATCH、全部本轮已知进程退出；shutdown未录响应、没有exit帧/EOF顺序，关闭协议完整性未证明。
最终原始证据`final-ui-lifecycle-sealed-7.zip` SHA66d7bbba...；其余失败封存不删除。
455冷目录3秒门槛用户授权跳过，无新Rust变更；未提交/合并/发布/日常部署。
