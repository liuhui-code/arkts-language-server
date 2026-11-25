# 当前 Native 资格被重复协调撤销：诊断与修复验证

## 状态与身份

问题 `NAV-REF-QUAL-REVOKE-001`，本地已实现、最终验证中。未合并、部署或进行 UI 验收。
工作树 `/private/tmp/arkts-reference-qualified-input-20261121`，基底
`1e3886df3c4d27755a53c073462f1456b0a3de7e` 加本轮未提交差异。
当前 server SHA256 `a3214862817484ad0fd5aeba09c9a301cc099b7386787a76153a26ece985be7d`，
Worker `879239c186a12489802470c54b7c30b41a3f738973fc38535a4d7d236a7bc94f`。
此次变化在父进程；仅比较 Worker 哈希不能识别此候选。
证据根为 `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`。
冻结源码1034份、运行资产76份，见 `qualified-input-source-freeze02.json` 与
`runtime-qualified-input-v2-identity.json`。Node20.19.5；安装编译器 ohos-typescript4.9.5-r10
SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

## 直接触发与证据

固定 Main/Target 查询目标，先完成补全/详情、跳转、编辑撤销、关闭重开、引用和重命名；
磁盘向 Main.ets 追加 `export const second = new Target()\n`，发送 type2 watch，立即查 Target 引用。
预期3个原位置加1个新位置。旧 main 20K 在45000.683ms触及外部诊断保护而停，
不是已经证实的产品截止/OOM。前一候选普通同条件42034.76ms正确返回，但严重慢。
完整配对额外矩阵因此仅运行20个会话，不能声明完成30个。

实际20K插桩时间线见 `reference-index-race-public03/`：
00:39:46.474Z维护开始，49.193 Native完整资格rev6发布，49.209 catalogReady；
51.647引用入口首次观察新磁盘内容，再次 requestReconciliation(content)；
51.648覆盖 dirty owner，51.663新维护推进输入rev6→7；51.664原rev6 status以
`invalid_generation: index input changed before read`拒绝。
随后候选路由保守回退，20000文件、20批、20个不同 Program，约28.98s在批次阶段；
查询本身每批约10–15ms，80个中间位置合并4个约0.26ms。
其余区间约13s不能都归给 compiler，命名空间前后证明仍有成本。
该插桩运行36.05s只用于因果定位，不替代普通42.03s结果。
128文件对照另显示真实 warming：并非每次 dirty 都有可直接复用的完整资格。

## 正式修复及不变量

保留每次真实 Store 观察和语义结果缓存/引用输入版本失效。
仅在观察到完整磁盘 URI集合+内容摘要后，实时向 Native 查询状态：必须 READY、versioned、
完整未拒绝资格、snapshot/store/domain/head匹配、完整指纹精确一致，且 await 前后 dirty owner
和观察仍属当前输入，才不重复发起 Native 协调。覆盖内容与目录命名空间变化，不能仅按文件数或旧head复用。
未知、legacy、warming、指纹不符、并发变化仍沿原保守协调/回退。
取消后不追加协调；旧结果不能通过新输入/final fence。
此资格不证明 SDK完整、compiler READY，也不删除候选语义验证和最终独立核验。

调用链：SemanticWorkerProxy → createReferenceNamespaceAdmission → ReferenceNamespaceAdmission.read
→ ReferenceIndexFreshness.confirmsCurrentSources → index.status；候选选择使用相同纯指纹匹配器。
相关文件位于 `src/semantic/references/`，公开回归
`tests/semantic/references-current-index-qualification.test.mjs`，实际Native状态观察夹具
`tests/fixtures/current-index-qualification.cjs`。无 Rust 或存储格式更改。

## RED/GREEN 与适用范围

公开真实stdio/Native RED：正确4个结果但发生1次多余content协调；修复后0次。
第一版仅处理内容，namespace-create RED仍多协调1次，故没有作为最终版本。
当前版本覆盖create→move→delete→restore→remove-restored，精确位置和零多余协调均通过。
`qualified-input-lifecycle-expanded02.log`：64/64 PASS、0跳过/取消，含最终源/成员围栏、
无通知生命周期、代际竞争、取消/并发 dirty owner、legacy/warming拒绝。
body-only全量检查被主动SIGTERM以替换候选，原日志保留，不能声称通过。
前一候选2752/2752与198规模会话不属于本次父进程修复。

普通内容版单轮20K：42034.76→12399.59ms，候选2文件/1批；只是历史同条件观察，
不是稳定百分比承诺。最终内容+namespace版本串行20K/30K各3轮正在运行，见
`qualified-input-final-large-series02.json`。首轮20K已通过完整结果、SQLite与关闭核验；
编辑后首次13300.88ms，重复12103.61/13949.10ms，表明剩余成本仍很明显。
重复查询不等于结果缓存命中。尚不宣称500ms、初始化约80s或全部30K功能已解决。
最终实际源码全量门禁待本轮串行规模结束后执行，避免并发压测污染数据。

## ADR与后续

这是 ADR0037 原位新鲜度/独立最终围栏与 ADR0043 当前输入完整资格的实现修正，
不是采用 watcher-only 权威；不改变 ADR0006已运行后台诊断不抢占合同。
下一步以当前候选普通多轮数据拆剩余证明/语义成本，不因消除一次回退就宣称整体完成。
保留实际 Photos SQLite60s失败、SDK partial、UI/Windows及耐久未闭环。

## 剩余13.30s的边界核对（普通首轮20K）

原请求发送到响应13300.88ms；首次semanticReadiness分派后到cache.miss为5410ms，
末次semanticReadiness分派到响应为4633ms，合计10043ms约75.5%。这是日志边界区间，
包括readiness、namespace、transport和父进程后续工作，不是已测独占CPU或纯磁盘I/O。
候选选择865.88ms，其中direct-query821.99ms为包含区间，不能另加。
引用执行从分派到merge约2214ms，批次1079.58ms含Program构建553.62ms和实际query18.49ms；
merge0.11ms。前后队列分派相邻约1ms，不能把约10秒归为后台排队。
可复算数据 `qualified-input-v2-reference-boundaries02.json` 及普通stderr/wire日志。

源码进一步说明：`reference-query-entry.ts` 调用 `referenceCacheAdmission`；
`reference-cache-admission.ts:diskReferenceProof` 要求semanticState READY、SDK/依赖完整
和对应readyCapability，当前SDK partial因此不存结果（六个references.cache.miss、零store/hit）。
但这两个readiness调用通过ReferenceNamespaceAdmission.read也承担磁盘命名空间观察和最终
输入revision失效；不能因为缓存资格undefined就直接删掉后一次调用，否则可能漏掉查询期间
无通知磁盘修改。下一步必须把缓存资格与输入新鲜度义务分清并测实际子阶段，再消除重复工作。
本轮未放松这项合同，也不把Program/AST复用称作结果缓存命中。

## 最终v2普通递增规模结果（六个会话已完成）

20K/30K各三个新LSP会话，228个公开请求，36组补全列表+详情核对；全部精确结果、SQLite和关闭检查PASS。
每档第一轮新应用缓存，后两轮复用索引；OS缓存未清空。因此下表为三轮混合缓存状态分布，
不能称三轮纯冷启动或同进程缓存命中。零references.cache.hit，定义实际Program项目文件均16。

| 操作（ms中位数 / 最大值） | 20K | 30K |
|---|---:|---:|
| 首次补全 | 1283.43 / 4764.37 | 1722.06 / 1757.97 |
| 首次详情 | 572.34 / 1994.21 | 758.34 / 760.92 |
| 补全之后首次定义 | 506.99 / 793.34 | 717.12 / 741.34 |
| 保存Main后首次引用 | 14037.12 / 17356.94 | 22382.52 / 22794.02 |
| 保存Main后重复引用0 | 13312.25 / 21416.25 | 21376.76 / 22065.51 |
| 保存Main后重复引用1 | 13949.10 / 16962.46 | 22267.18 / 30611.31 |
| 保存Main后重命名 | 13195.42 / 17078.35 | 24791.04 / 30171.87 |

Node RSS峰值20K三轮最大1437.72MiB，30K最大1243.77MiB；这是采样值，不是堆峰值，不能据此推断大项目内存更低。
各轮资源/退出/raw transcript、冷/暖拆分、复现脚本和全部方法见 `qualified-input-v2-summary02.json`。
结果仍随总N增长，不拟合O(N)或平方复杂度。当前固定闭包与实际定义P16，不是实际30K Photos拓扑。
原main45s失败、前候选42s及冷缓存首次引用42.29s仍保留。
当前实际候选完整门禁 `qualified-input-final-check02.json` RUNNING，不引用历史2752当最终通过。
