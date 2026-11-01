# 同内容关闭重开跳转优化

状态：候选已实现；公开相关88项、最终新5项/层清单9项通过；最终check:fast **2152/2152、exit0**。
追加独立诊断NAV-INPUT-001在旧/新候选均失败，单列为既有恢复缺口，不算功能通过。
[ADR0035](../adr/0035-unchanged-source-authority-transitions.md)逐项审计历史合同，
[TDD](../tdd/2026-10-31-unchanged-navigation-inputs.md)保留RED/GREEN和测试控制修订。
证据根 `.bench/navigation-close-reopen-20261031/`；无提交、合并、push、部署日常Zed或真实缓存删除。

## 根因与最小实现

前一候选同字节关闭重开约1.2秒，LS未退役、SDK AST继续复用，但Program更新。
本轮公开stdio反例Program1→2，newEntry=false、resetReason=null，定位到保留owner内部的内容delta。

实际链：LSP didClose → 原mutation/Freshness失效 → Worker/LegacySemanticEngine.close →
DocumentStore.close/invalidateClosedDocument → WorkspaceContentChanges.advance → 下次准备交付内容delta →
TypeScriptLanguageServiceEngine.updateProjectContent → applyTypeScriptContentChanges →
TypeScriptContentVersions.update并移除script → updateScript再安装相同快照并处理入口准入 → 编译器同步Program。
推断根是否在该次重开改变顺序未单独测量，不作为已确认耗时归因。

修复位于 `src/core/types/typescript-compiler-inputs.ts`，由原LS准备入口调用：
仅已交付文档与当前owner驻留source逐字一致、且文件仍为当前查询入口或明确稳定根时，保留原编译版本和快照。
received revision及owner applied revision仍前进，prepare照常更新overlay/documentVersion。
真实编辑、未交付/未知/移除、根/配置/解析owner变化仍更新或保守重建。
`TypeScriptHostRoots.hasStableRoot`使用现有根集合，不全项目扫描；源码位于工作区内且排除oh_modules。

原DocumentStore关闭/磁盘回退未改，不保留已关闭overlay，不复活旧请求或补全句柄。
旧source/SDK/config/物理路径检查、当前请求和租约内全新最终核验保持。
无新长期缓存、结果缓存、TTL、RSS/V8/超时/规模门槛；调度、取消和恢复预算不变。

历史关系：0019已区分事件消费、compiler输入和单文件版本；0025 M004/M005已要求实际稳定读取协调自身源码证明；
0032的真实入口、root集合及同生命周期请求合同继续保持；0037当前/最终证明不跨请求复用。
具体段落、取舍及回滚边界见ADR0035。不将实施授权追认为独立设计评审或Accepted。

## 公开回归

`default-reopen-red.log` exit1，默认产品配置Program1→2；首个GREEN保持Program。
首次夹具强制resident fast path=0与实际默认不符，其RED保留为不同控制配置，不冒充同owner反例。

最终新文件 `tests/semantic/navigation-close-reopen.test.mjs`：

1. 同字节关闭/同数字版本重开连续3次，完整定义URI/range一致、Program不换代、1Worker。
2. 未保存overlay和磁盘不同：关闭实际回盘；相同磁盘内容重开复用；开放overlay不被未通知磁盘修改覆盖。
3. 查询文本不变但依赖真实编辑且无通知：返回移动后的精确行号、Program正确更新。
4. 相同文本重开后，在实际编译器返回位置后修改私有SDK：拒绝旧结果-32803，配置替换后同会话恢复。
5. 依赖父目录移出工作区并用同字节symlink/junction回指：结果精确匹配MissingTarget控制的本地import binding，
   不能继续返回越界依赖；真实恢复并通知后正确跳转。Windows junction分支本轮未真机执行。

测试使用真实child-process、Content-Length stdio并回应server进度创建请求。
`final-scoped-regressions.log`88/88（含当时4项新测试），覆盖独立请求、旧句柄、namespace、原始源码/SDK证明、
版本快照和保存同步；第五项及连续3次重开最终版本另在 `final-five-and-manifest.log`9/9。
原15项表征先GREEN再提取成员移除的版本/cache配对，超限LS3077→3073行；剩余体量债务仍在。
组合工作树的其他旧超限文件为document-store1765→1703、register-semantic-capabilities721→707、
legacy-semantic-engine745→728（属ADR0037已有切片）；四份均未增长。新增源码/测试/脚本均≤500行，
逐文件行数见final-review-audit.json，不把旧体量债务当作新增大文件的许可。

## 30K同条件对照

Mac macOS26.6.2 x86_64、Node20.19.5；SDK API24/6.1.1.125，路径
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`。
沿用前轮隔离 `photos-30k` 的30000源码、真实拓扑、原7份overlay与508–571共64个不同请求。
Picker版本68及文本SHA与磁盘完全一致；不缩小项目、改符号/SDK/内存或截止时间。
工作区源/测试/配置801输入冻结；原项目及未保存编辑不动。

基线为前轮ADR0037冻结候选：server604cbd72、Workerdebfcd3e。
本轮server SHA保持 `604cbd724df7c38e9e9514682f3eeaa446f66eaa79cdb286cdf8562e917a2304`，
Worker `6ffc6fac3eed366e2821a1bc13914ec646806f9f259617f610abdcab0245093a`。
`comparison-environment.json`及各轮identity保存完整SHA、SDK/源码清单、驱动、采样器和native身份。

基线/候选交替3轮，每轮新进程；初始化及同样7份overlay诊断后按原64请求突发，随后重复、编辑、撤销、关闭重开。
生命周期锚点是PickerUIExtensionAbility__copy_003.ets的onSessionCreate同文件定义（LSP零基42:2）。
编辑为尾部追加`\n// isolated replay unsaved edit\n`、版本68→69；撤销恢复原文v70，关闭后以原文v71重新打开。
计时从两条close/open通知已发出后、发送definition前开始，到完整响应接收；含尚未结清的服务器mutation/排队，
不包含关闭到重开通知的用户操作间隔或UI渲染。其余生命周期行同样记录后继查询，不是完整UI输入耗时。
查询序列与驱动固定：`protocol-replay.mjs` SHA d9433e5c36cd2453e12437f4bd4ad5fa3da19489d592aa42a2fbb781bf4ab644。
plain仍启用已有产品trace/queue/memory观测，不加载filesystem probe；不等同关闭全部观测的日常UI延迟。
性能运行期间无其他仓库测试并发；不将后续全量检查的资源轨迹混入本对照。

| 轮次 | 重开后公开耗时 ms | Program | createProgram区间 ms | Worker创建 |
| --- | ---: | --- | ---: | ---: |
| baseline1 | 1192.076 | 7→8 | 1019.588 | 1 |
| candidate1 | 140.757 | 7→7 | 0.000 | 1 |
| baseline2 | 1136.739 | 7→8 | 970.737 | 1 |
| candidate2 | 140.723 | 7→7 | 0.000 | 1 |
| baseline3 | 1077.527 | 7→8 | 926.509 | 1 |
| candidate3 | 158.738 | 7→7 | 0.000 | 1 |

三轮中位数/最大：**1136.739/1192.076→140.757/158.738ms**，中位下降约87.6%。
createProgram区间包含在compiler callback与公开耗时内，不能与它们重复相加。
实际Program序号佐证不换代，不只凭分组createProgramEvents=0推断；SDK284份SourceFile对象均继续复用。
本轮没有另计SDK真实parse调用次数，对象复用统计不当作解析次数。
查询Program仍505个SourceFile：项目108、SDK284、其他113，根110，不能把30000源码都当进入Program。

每轮69份完整响应逐字段一致（包括id、URI、range和error），未删掉失败样本。
原558仍-32803完整范围不可用，不算功能成功；部分类型定义为空，未宣称其丰富目标正确性。
64个键都不同，没有在途合并，本次收益来自同输入Program复用。

| 顺序操作：三轮中位数/最大 ms | 基线 | 候选 |
| --- | ---: | ---: |
| 首次锚点（SDK初始化和诊断后） | 69.783 / 78.228 | 70.003 / 75.890 |
| 突发结清后重复锚点 | 50.469 / 59.535 | 54.042 / 58.775 |
| 未保存真实编辑后首次 | 279.358 / 296.988 | 258.843 / 302.614 |
| 撤销后首次 | 297.175 / 305.070 | 258.563 / 306.568 |
| 关闭重开后首次 | 1136.739 / 1192.076 | 140.757 / 158.738 |

突发定义每轮p50的中位数1741.992→1838.334ms，最坏3456.268→3558.442ms；本轮没有改善这段排队。
小幅差异不据3轮定因，但实际变慢的样本保留；不拿早前更慢基线夸大本轮收益。
编辑/撤销真实改变文本，Program仍需更新，不把波动全部归功于同输入优化。

## 独立文件访问计数

两轮 `mac-{baseline,candidate}-audit` 完整响应69份一致、exit0、无自有native残留。
以下为重开查询的整个Worker请求；插桩耗时不混入上述plain计时，次数不等于解析文件数。

| 调用 | 基线 | 候选 |
| --- | ---: | ---: |
| realpathSync.native | 18535 | 1947 |
| lstatSync | 48138 | 1060 |
| statSync | 24140 | 1607 |
| openSync | 482 | 84 |

`filesystem-comparison.json`与逐次filesystem-*.ndjson保留原计数及unique路径数。
仍有准备/权威切换/核验工作；1947次realpath未再拆到所有调用点，不据次数直接推算剩余毫秒归因。

## 资源与边界

六轮各1Worker、无运行期退役/恢复/OOM，正常关闭后未残留本轮私有native进程；不代表长时无泄漏。
采样每2秒记录CPU/RSS/系统压力，Worker记录heap；峰值是采样下界，不是真实瞬时上界。
Node RSS含Worker只计一个PID，heap不相加；进程树是PID RSS之和，不是PSS。

| 各轮采样峰值范围 MiB | 基线 | 候选 |
| --- | ---: | ---: |
| Node RSS | 674.93–741.31 | 733.80–740.48 |
| Worker heapUsed | 597.08–610.72 | 609.50–613.75 |
| Native RSS | 3329.70–3532.75 | 3529.69–3533.26 |
| 同时采样进程树RSS之和 | 4003.19–4270.76 | 4262.97–4267.73 |

首轮基线采样峰值较低也保留；没有据此宣称内存改善/泄漏。系统压力等级均1，必要保护未触发。
默认无RSS预算、测试Node2048MiB停线豁免继续；无V8/超时/规模阈值调整。
初始化均phase complete、semanticState degraded、project-membership-incomplete；不宣称全局READY。
原生索引各轮最后99%、30000/30000，随后测试关闭；未等待end，不能判永久卡住或已经完成。
原生高内存、SDK来源/超时、30K全量引用/重命名、递增规模成本、Zed客户端ADR0033仍开放。
本轮只读 `ssh -o ConnectTimeout=8 windows-pc hostname` 连接超时，原错误见windows-connectivity.log。
未部署Windows、未执行真实Zed UI或长会话耐久，协议对照不替代它们。
500ms是体验目标；455文件冷目录3秒独立门槛仍按用户授权不执行，不声称该项通过。

## 复现与最终检查

`run-comparison.py`记录3轮交替实际命令，`analyze-comparison.py`逐字段比对并生成comparison.json。
沿用前轮冻结驱动及private cache/native副本；每轮结果目录拒绝覆盖。
原始证据：operations.ndjson、client-wire.ndjson、stdout.raw、stderr.raw、logs/server.log、
worker-memory.ndjson、process-resources.ndjson、identity.json、exit.json、result.json。

最终 `pnpm check:fast` **2152/2152，exit0，0fail/cancelled/skipped/todo**。
实际Node20.19.5、pnpm8.3.1；测试体3402206.127ms，命令3411.140秒。
check-fast-final.log/check-fast-progress.json及final-check-summary.json保留原日志SHA和实际统计。
事后801份源/测试/配置、3956份SDK声明/选定元数据、30000份隔离项目源码均无差异。
82份运行产物/标准库文件与冻结候选一致；另一个sdk-discovery-driver.cjs是tests/sdk-discovery.test.mjs
生成的测试夹具，完整检查后包含本次源码而改变，不是build-runtime入口或server依赖；前后SHA单列，不冒充一致。
ohos-typescript4.9.5-r10实际安装编译器SHA见final-check-summary，server/Worker哈希与性能运行一致。
旧2147收据保留原时点，本2152不覆盖下面追加的独立失败。

## 追加诊断NAV-INPUT-001：无通知动态类型依赖创建后的恢复缺口（OPEN）

这是独立小夹具（Main源码、空nested目录和私有最小SDK），**不是30K/真实UI**。
复现源码：`type Alias = import("./nested/Lazy").Lazy`，下一行`export let selected: Alias`，
再下一行`export const result = selected.value`；hover查询零基2:32。
先查询缺失模块（any），关闭Main、创建`nested/Lazy.ets`为`export class Lazy { value = 1 }`，
不发送文件通知，以同文本/低版本重开Main。首次和重复hover均-32803；冷会话是正确Lazy.value:number。

ADR0037基线Workerdebfcd3e和本轮Worker6ffc6fac各自均如此；显式Created通知后立即恢复，
配置控制亦与冷会话逐字段一致。记录的是既有活性缺口，不是成功或本轮新增回归的证据。
保留原断言失败exit1：negative-creation-probe.log（首个基线）、negative-creation-controls.log及
negative-creation-{baseline,control-baseline,control-candidate}/results.json。
`node .bench/navigation-close-reopen-20261031/negative-creation-probe.mjs`复跑需全新证据目录；
脚本exit1及summary中的unnotifiedFirstFailed/unnotifiedRepeatFailed明确保留失败，不将通知恢复算原场景通过。
具体失效的缓存/证明所有者及自动恢复链尚未定位；不能只凭通用-32803断言根因。
关联ADR0025决定3的缺事件恢复要求，未修订其合同；待办已在现有性能跟进记录持久化。
