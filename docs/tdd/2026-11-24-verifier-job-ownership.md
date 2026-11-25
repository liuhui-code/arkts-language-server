# ADR0049：逐 job 所有权修复记录

父提交：`c869ade983006c700c49e883d02340e120c0ea9d`，PR119 的隔离工作树；继承已有 Gitignore 与文档修改。
Node20.19.5 / pnpm8.15.9，原安装编译器4.9.5-r10。
证据：主工作区 `.bench/pr119-fix-20261124/`。本轮不部署、合并、发布或改用户 Zed/项目。

## RED→GREEN 切片

| 切片 | RED 与实际失败 | GREEN / 已测范围 |
| --- | --- | --- |
| 已完成 job 的外层取消 | ownership-red.log：公开 A 正常取消，B 同 Worker 查询 -32603 | ownership-green1.log：1/1，精确参数引用，物理 verifier 仅1个 |
| 迟到旧终态 | late-terminal-red3.log：B 改查另一个符号，旧 A 响应导致 -32603 | ownership-green2.log：2/2，旧 ticket 不结算 B，两个符号的完整 Location oracle |
| 状态收敛的行为表征 | 已有两项 GREEN + 原 anchor/reuse/cancel 用例作为保护 | ownership-state-characterization.log：32/32，零skip |
| 嵌套实际退出 | nested-fatal-red.log：退出后未进入原恢复流程 | nested-fatal-green.log：4 次受控 exit41，3次替换后熔断，重复请求未再创建 Worker |
| 同步创建失败 | spawn-fatal-red.log：new Worker 抛错，没有 error/exit 回调，未触发恢复 | spawn-green-and-ownership.log：4/4；同步构造异常也受原预算约束 |
| 同步发送失败 | send-fatal-red2.log：确认预热后复用发送抛错，却未进入恢复 | transport-and-ownership-green.log：5/5；退出/构造/发送三类故障均受预算约束 |
| job 状态观测 | job-observation-red.log：只有 Worker 占用，没有实际 job 转换关联 | job-observation-green.log：4/4，公开精确结果、每个正常 job queued/running/settling/settled 各一次 |

迟到消息控制的前两版查询同一符号，未产生区分性失败，原日志保留但不算 RED；
改成不同符号后才证实故障。控制只重放真实 A 终态，不替 B 返回伪造正确结果。
name-pattern RED 日志中的名称过滤 skip 不计验收；完整 GREEN 文件均无 skip。

原始执行入口（在隔离工作树，固定 Node20）：

```sh
node --test tests/semantic/references-verifier-ownership.test.mjs
node --test tests/semantic/references-verifier-faults.test.mjs
node --test --test-concurrency=1 tests/semantic/references-verifier-ownership.test.mjs tests/semantic/references-anchor-reuse.test.mjs
```

测试使用真实 child-LSP、Content-Length framed stdio 和隔离 SDK/Native 缓存。
`tests/fixtures/verifier-job-gates.cjs` 用明确的回退 gate 等待真实取消单元，在已完成 verifier job 外观察取消，
没有靠 sleep 猜窗口或扩大产品截止。exit41/构造异常是受控故障，不代表自然现场 OOM。

## 实现与边界

- client 只有一个物理 slot：absent/live/retiring/closed；activeJob 派生 busy，不再另存 busy/retire 多份真相。
- job 独立拥有上下文、状态、result/清算和取消轮询；queued 取消不终止别的 active job。
- infrastructure 在无请求的模块装配域创建；每 job 的 AsyncResource 恢复自己的取消、证明与 trace 域。
- 初始 workerData 和复用 postMessage/响应使用 generation+jobId；旧 job 终态不能被新任务接收。
- 结果仍由 runtime 完成 LS dispose 后发送；active 取消的调用方可以先结束等待，串行 drain 仍等待物理退出。
- config/SDK dispose 保持可重用 reset；registry 最终 dispose 调用 close，停止准入；shutdown 等原 client drain。
- 同步创建异常、Worker error/意外 exit、协议及终止故障有独立 typed fault 通道，进入既有 Host/FailureRecovery。
  不是把普通取消升级为致命故障，不新增恢复预算，不自动重放失败 job。
  exit/spawn 控制连续同输入失败；send 控制新输入与成功预热交替的间歇发送失败，仍受180秒频率预算约束。
- trace ON 时逐 job 转换通过现有 bounded 日志通道发布；trace OFF 无新增状态日志。
- 当前 .gitignore 的必要修正继续保留，未删依赖或缓存。两个新增测试入口纳入 bundle-e2e，精确数量380→382、199→201。

未更改 V8/RSS/规模/超时参数、正常结果范围、SDK兼容键、磁盘权威、最终新鲜度检查或原恢复预算。
无 Rust 产品变动；此文件不以 tests-only故障模拟声明真实 Windows/Zed 或30K问题全部解决。

## 相关回归与一次中断

`focused-lifecycle.log`：29条中28 PASS，唯一 FAIL 为 manifest 仍按旧 bundle 数199断言，实际201；
该运行的功能回归全部通过，包含实际 SDK/标准库解析复用、真实取消后退出再重建、跨root排队取消、
Registry 释放先于结果发布、调度、原清算/恢复预算。原失败日志保留。
修正为两个真实新增文件的精确计数后，`manifest-green-final.log`4/4，零skip；不是放宽为范围检查。

第一次完整 check:fast 已冻结2690个输入并开始；在425条通过、尚无失败记录时，
审查发现同步构造异常入口未接线，主动停止以补 RED→GREEN。
`checkfast-interruption.json` 记录 UTC、仅本轮测试进程树及停止原因；**INTERRUPTED，不是 PASS**。
原 `checkfast.log`、`checkfast-inputs.json` 与该轮 runtime 哈希保留，不能冒充最终候选通过。

第二轮全检1557条通过记录、零已见失败后因新复现的成员目录恢复缺陷停止；exit143，记录见 checkfast-final2-interruption.json。
该轮不是完整PASS。最终候选还须在目录修复回归后重新冻结执行完整检查。

## 仍需独立验证

- Linux parent-retarget：已有 Mac 同型可控 RED→GREEN，但 Linux 原现场没有内部栈，仍需平台复验；不把它并入取消串扰。
- 更多错误/终止未完成/重置关闭交错，随最终完整回归核验；针对性 GREEN 不代替整个 ADR 验收。
- 真实 Windows、真实 Zed UI、30K耐久、完整引用/重命名及性能遗留未在本轮执行。


## 独立成员目录恢复修复（2026-11-25）

parent-request 三轮证明普通 GREEN 会由 diagnose 先在 validateCachedMembershipBeforeCapture 消耗旧证明失败。
parent-delayed-diagnostics 复现首个恢复 complete 的公开 id4/-32803，不是取消或 OOM。
原 test增加 diagnostics=2000 分支，parent-recovery-red.log 为0/1（其余名称过滤），后 parent-recovery-green.log 全文件5/5。
新代码仅在 watcher producer 边界检查 changed 源的去重父目录原证据，撤销已失效的原 completeProof，
保留 invalidated 供原 membershipFor/prepare 路径扫描；不在已失败的请求中修补资格。
相关 unit/公开身份、增量、摘要复用及 verifier 生命周期回归在 parent-and-lifecycle-focused.log：63/63 PASS，零skip/cancel/todo，71593ms。


## 完整检查补出的精确 IO 合同与时延观察（2026-11-25）

第三轮 checkfast-final3.log 在“latest document version clears obsolete diagnostics”遇到原5秒等待超时；
保留原始失败后停止，checkfast-final3-interruption.json 标记 FAILED_AND_INTERRUPTED，不是完整PASS。
公开 observe-diagnostics.mjs 记录实际 version2/空诊断最终到达：并行观察6轮约6.0–8.2秒；
这不是串行性能基线。停止其他本轮测试后的6轮约4.7–6.7秒，均正确；5秒内仅3轮到达。
父提交 c869ade 用 git archive 独立构建，并与候选交替运行、同SDK/输入：
候选三轮3677/3691/3691ms，父提交3675/3711/3734ms，均正确。
这排除了该控制条件下显著候选差异，不能解释全部环境波动或宣称长尾已消除。
随后原诊断文件 diagnostics-original-serial.log 原参数/原断言6/6，零skip；没有改测试等待时间。
原始阶段墙钟区间在 diagnostics-observation-summary.json；不当作CPU包含区间相加或归因机器故障。

第四轮 checkfast-final4.log 中原批处理单测期望3次realpath，新增独立发布目录核验使实际4次。
watch-realpath-red.log 与 watch-realpath-stacks.jsonl 证实：root/source canonicalization各一次，
随后 finishWatchedSourceChanges→directory.current 独立核验共享父目录一次；不是重复解析源码。
回归改为精确路径及顺序 [root,first,second,parent]，保留closure逐批3次约束，
不按宽范围放行任意IO，也不删除身份核验。watch-fence-characterization-green.log 原文件50/50。
在GREEN后将两项批处理用例及共享夹具内聚提取，原超长文件2170→2029行；2029行仍是迁移债务。
清单入口382→383、unit-contract158→159，bundle仍201；中间一次总数未更新导致53/54，原日志保留。
watch-fence-extraction-green2.log 为54/54，零skip/cancel/todo。
第四轮主动中断，checkfast-final4-result.json exit=-15、2691输入未变；不是完整PASS。
本轮产品参数、诊断等待与正确性断言均未放宽；最终全检必须重新冻结完整执行。


## 最终本地完整验证（2026-11-25）

**最终候选 check:fast PASS：2807/2807，1 suite，0 fail/skip/cancel/todo，命令退出码0。**
固定 Node20.19.5 / pnpm8.15.9；2026-11-24T17:54:16.257Z→19:13:01.227Z（UTC；本地11月25日），
含类型检查、正式bundle构建、原有locked release sidecar前置及全部fast层；整条命令4724.86秒。
这不是UI或30K耐久测试时长。
`checkfast-final5-{inputs,result}.json` 记录父提交c869ade、2694个输入及逐产物SHA；检查前后全部输入不变。
产品四个CJS与前一候选相同；Native/编译器也未变化。本轮无Rust源码变更。
`pre-final5-check.log` 为诊断+缓存批处理+清单联合60/60，另有先前身份/生命周期63/63。
最终全检含原取消回退、两项outer-cancel/stale-terminal、三种fatal预算、两项parent-retarget（含diagnostics=2000）、
独立最终核验、SDK/配置切换、取消、Registry清算、旧世代隔离及shutdown等已有回归。

前四轮的原始失败/中断不改标签、不删除；final5的通过不消除已观察到的冷诊断时延波动。
功能候选已在隔离工作树实施，本地完整fast层完成；ADR仍Proposed，独立审阅、远端CI与Linux/Windows平台复验待完成。
未执行真实Zed UI或30K正式耐久，没有解决30K完整引用/重命名与原有性能遗留。
原冷455文件3秒门槛维持用户此前授权的范围；本轮未改产品超时、RSS/V8阈值或诊断等待。
目录资格失效会让后继准备执行必要的真实成员重扫；未测原子保存/大规模目录变更的生产耗时，不宣称规模无关。

本轮更改的手写源码/测试/脚本均≤500行，唯一例外是既有迁移债务
`tests/project-file-set-cache.test.mjs`：2170→2029行；批处理与夹具已内聚提取，仍需后续迁移。
收尾只追加必要文档；最终源码归档、补丁和收尾身份见同目录`candidate-final-*`。
**没有提交、push、合并、部署、重启用户进程或删除真实缓存。**


## 2026-11-25 PR119集成准备

用户授权按正常PR流程合回main。远端main仍1e3886d，PR119仍c869ade，基线未变，无代码冲突。
提交前cached diff检查补发现两个原新增测试文件末尾空白，先前未追踪时diff检查未覆盖。
仅删除project-file-set-fixture.mjs与watched-source-batching.test.mjs的EOF空白；产品源码与四CJS/Native/编译器均不变。
merge-whitespace-regression.log：相关54/54 PASS、零skip/fail/cancel/todo；原完整2807验证仍属于原冻结输入，
不把这次格式修正说成重新跑过完整套件。后续新commit/CI结果以PR与本地merge证据为准。
真实平台/UI/30K耐久及冷诊断时延观察继续保留。
