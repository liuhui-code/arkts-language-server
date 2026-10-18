# OP-00：transient verifier 收尾先于结果发布

日期：2026-10-15（运行 UTC2026-10-14）。父修订
`a111235bc4bfcb55b126752f95b3ba095f2996af`，分支 `codex/op00-query-attribution`。
本切片公开RED→GREEN、相关40/40与真实Settings15/15；OP-00／OP-06／L08仍IN_PROGRESS。
这是实际LS／Registry收尾顺序保护，不是原403文件超时的唯一原因修复、物理释放或550ms验收。

## 证据与三个假说

前序真实六个verifier的最后compiler边界为outbound-message，仍记录676 lease，
native dispose未观测；父侧exitCode1仅证明线程被terminate，不证明dispose或泄漏。
冷getProgram约4.47–4.77秒、目标API约50–56ms，原完整回归id4超时保留。
见[前序OP-00记录](op00-query-layer-attribution.md#父侧退出与-native-dispose-调用来源)。

依次核验：结果发布先于收尾、同批次重复Program、启动／调度等待。
本切片关闭第一项的顺序缺口；不把它替代另两项或宣称原超时唯一原因已知。
生产verifier原先postMessage后才在finally dispose，父侧收到结果后立即terminate。
Context7核对[Node20 Worker文档](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html)：
terminate会尽快停止线程JavaScript；不能把消息后的finally当成必定完成的收尾见证。
ADR0003的每批transient终止、单并发和禁止偷偷保留LS／SDK AST均保持。

## 真实公开RED→GREEN

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-reporter=spec \
  tests/semantic/transient-verifier-release-order.test.mjs
```

真实生产LSP子进程Content-Length stdio；两个完整引用策略、最新版本诊断均正确。
私有preload只在真实verifier的原postMessage入口读现有benchmark Registry探针，
转发原消息；不替换compiler、伪造文件／release值、创建额外LS或强制GC。
探针保留实际Program路径／script-kind的fork refcounts，发布时收据原文进入原测试log。

RED-v1与补全原文／独立oracle后的RED-v2均0/1、exit1，发布时四个Worker收据均空。
v2为3679.991623ms，log SHA
`589def4824f25e1dbb39f470a598660fb84ee94d60b1c2305b1e06e2087a5104`，
独立audit SHA `b55c1d610747e83817c00da2b90cd7ee813642c35813d1a4bf457f2915a7e4e5`。
这证明发布早于dispose；没有证明旧线程退出后物理内存泄漏。

最小修改209行的`reference-verifier-worker-runtime.ts`：完整查询与结束fence产生
成功／错误envelope后，先实际engine.dispose，再postMessage，最后close port。
dispose异常发生在消息之前，交由原Worker error／exit路径拒绝，不发布旧成功。
原输入不可用错误分类、完整scope／SDK、取消终止、每批单LS与预算不变。
正常结果仍只有原纯值payload／stats，无Symbol、Program或AST跨Worker。

GREEN1/1、exit0，3669.998264ms：两anchor各55→0、两final各56→0，
完整2／3个Locations与当前诊断正确，LSP正常关闭exit0。
log SHA `e99d3e5298d1831b9908e1871c662eec3e014c6953158de5c50cba50d0700ca9`。

随后真实SDK目录临时true→absent的输入拒绝路径亦通过：-32803、无partial result，
实际失败verifier的57个引用在错误发布前归零。二用例2/2、exit0，6264.171042ms，
log SHA `478efa0e97622dd6eb6b52d8b22d83699e3a8a40ead4454c691287b47ddbe5fa`，
audit SHA `51cd59787f59361809d45842ab14eac51a7e5ecc4a3a3a10a17095230a25338e`。
原source-change拒绝／取消／恢复合同仍独立保护，不因收尾失败输出假成功。

库存RED3/4后登记bundle-e2e；强化既有官方compiler hook公开CLI测试，要求真实
completed verifier dispose1且native与观测lease均0，不再条件性跳过未知收尾。
八文件联合40/40、exit0、零skip/cancel/todo，218523.078843ms。
含原403文件／SDK load窗口／package身份／取消恢复／真实compiler观察／完整scope。
原403 case34102.807428ms是总case时长，不是单RPC；原20秒期限未改。
log SHA `3672028f6b4875c8d96d0e12acf7c6c4e339cc765dd6fc910d87ccc86de9d9f7`，
audit SHA `af8f081230476b498437695238965f986150c9d70af1b7481235aac0643a5bcc`。

## 三轮真实Settings／API24／完整SDK

原五场景：implementation准备、未查引用、重复、未保存新增引用、删除引用。
固定原checkout／declared deps／目标与完整oracle／SDK，六默认和1024MiB保持。
observer使用完整生产源码的export hook，baseline产物逐字节一致；原stdlib路径不变。
diag产物独立记录digest，仅用于归因，不作正常计时或产品RSS/PSS。

首清单v1因我加入禁止覆盖的日志目录而在compiler启动前拒绝RUNTIME_ENV，
三CLI实际exit2、没有report。原失败／日志／source归档保留，不计产品失败或成功。
设置audit SHA `8fc4541df493d10a518e1b430c4fa2730a9c0d2e1d624ee8d6a0bbe9d23700ee`。
v2只移除该字段，预先运行原清单校验，然后按原三个会话执行，不改校验器／期限。

真实PID18714／18855／18997均exit0，15/15完整位置等于原始／编辑后的oracle。
每轮两个实际verifier各starts1／successful dispose1，acquire676／release676，
原生fork path-kind和公开操作观测outstanding均0；父侧created／exited配对独立保留。
最后compiler边界现在outbound-message时已释放，不借线程停止或旧样本填假零。
原数据 `.bench/op00-verifier-release-real-settings-v2/*`；原输入／产物／源码审计 SHA
`730c48a5974a1c8224df1014a0e6d5d3a42e7c94848ef442f989662a0412f437`，
独立重读全部15份实际Location tuples／oracle的audit SHA
`8255f5e9fab5d13a233eeaae7eddf685f597d3c114fdefe9ce0ac2cb619f4e66`。
新增引用三值5330.93／5480.82／5796.52ms，删除4921.80／5107.76／5631.52ms。
保留全部慢值；这是diagnostic wall，不是正常净收益／P95或冷Program成本修复。

## 身份、限制与后续

相关测试与真实会话同冻结1697文件，repo SHA
`d1e0f4ab646067caaa4eac26e16ff9221037590b9caf22f0d892534a5aeff449`，source archive SHA
`de1f65453899a69c16de1b212c8173b6d44c79618ca60b00f139f526fd886269`。
production input `0fbafd7b7b1578bc9b6b235fce076d002d9f00288e2b1eb627be4556857182cd`；
reference verifier `af6044019c73f846237711acd62ecfba83a7814c7aa12df4bb14c07b68b926be`。
其余生产产物／SDK／backend不变，不借撤回候选或旧whole授予新head完整GREEN。
strict／build／diff通过；runtime209／fixture23／新测试140／原CLI测试477行。
库存202，unit97／protocol8／bundle90，fast195；旧core3260行迁移债仍保留。

本次native release只是已观测路径／kind的LS／Registry收尾，不证明GC、所有AST
可达性或独立物理回落；强制取消也不能凭正常收尾结论填假dispose。
下一步冻结当前源码／文档，执行新的真正完整check:fast，并继续冷准备／正常
资源／压力回收／≥100循环、其它能力与原客户端／三平台／DevEco-PSS／历史3GB及
50%／全部正例和336格。原1750/1751 FAIL保留，不宣称整轮超时唯一修复。
OP-00／OP-06／L08未毕业，未合入／push；最终550ms／内存不前移阻塞其它切片。

## 后续完整回归检查点

真正当前whole已终态1752/1754、2FAIL、exit1，零注解及完整身份稳定；原403
与本切片两个收尾guard均PASS，但不凭此宣布超时唯一修复或整轮GREEN。
两失败是原协调器lexical alias输入拒绝，已由[package存在性TDD](op02-package-metadata-presence.md)
保留完整原失败、有限复现和公开RED→GREEN；随后九文件86/86、原协调器22/22。
该新production5cf9d618不得借旧whole取得完整通过，需补齐失败摘要消费并新whole。
原完整log/audit及全部OP-00–06／L08范围保留，native收尾仍不等于物理回落。
