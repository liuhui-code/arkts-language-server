# 2026-10-31：NAV-INPUT-001 修复、30K 协议对照与 UI 阻塞

> 验证更新：本报告13e90ee7候选在完整检查中发现5项已知源码增量读回归，已封存并中止
> （1796.325秒、exit1，见check-interruption-intent.json）。下述短测仅说明该候选的局部恢复，
> **不是最终合格版本**。正在收窄正向内容变化与命名空间变化的判定，新收据独立保存在
> `.bench/nav-input-recovery-v2-20261031/`。后继已完整2160/2160及最终30K复测通过，
> 见[修正版最终报告](2026-10-31-compiler-namespace-recovery-final.md)；下方13e90ee7历史不追认为合格。

## 当前结论与范围

NAV-INPUT-001 已在候选中修复：当前过期输入仍拒绝，后继显式查询可在同一 Worker 内恢复。
新公开回归覆盖无通知创建、删除恢复、目录有无、真实编辑、关闭重开及 complete/partial；
SDK/选择配置、旧请求、磁盘权威和独立最终 fence 合同保留。

最终源码定向42/42，Mac真实Photos30K三轮交替前后协议对照、目录生命周期混合短测完成。
**完整 check:fast 运行中**，最终收据见本报告末节及证据 JSON；不能以旧 fast2152 代替本次检查。
64不同有效请求长尾、较昂贵的 namespace 重载、Windows/真实UI仍未验收关闭。
本轮没有提交、push、合并、部署日常Zed、重启用户进程或清理真实缓存。

## 代码、输入与运行身份

证据根：`.bench/nav-input-recovery-20261031/`。分支 `fix/navigation-request-work-reuse-20261030`，
父提交 `04282ed34ebab7cd01726bb0291af53bd278ff00`，叠加未提交 ADR0037/0035，原工作保留。
起始 `baseline-identity.json`/`existing-worktree.patch`，最终 `candidate-source-freeze.json` 冻结805项源码/测试/脚本/配置输入。

| 项 | 本轮实际值 |
| --- | --- |
| 前版对照 | ADR0035已验候选：server `604cbd724df7c38e9e9514682f3eeaa446f66eaa79cdb286cdf8562e917a2304`；Worker `6ffc6fac3eed366e2821a1bc13914ec646806f9f259617f610abdcab0245093a` |
| 新候选 | server `9b2978eed91aa34eb6bbd863d708f725c2838f95e1ba3c3133298db08cf7a6cc`；Worker `13e90ee7777eed99b737762db9437a5abd39dce7675be5eec494892535fa1c9f` |
| 系统/运行时 | Mac macOS26.6.2、x86_64；Node20.19.5；实际pnpm8.3.1，仓库声明8.15.9，差异披露 |
| 编译器 | ohos-typescript4.9.5-r10；typescript.js SHA `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24、6.1.1.125；3956个相关输入哈希冻结 |
| SDK边界 | selected ready=true/identified；dialectCompatibility=unverified，declarationSupport=typescript-compatible-only，不代表所有ArkTS声明或SDK场景通过 |
| Photos | `/Users/liuhui/Documents/code/arkts-language-server/.bench/navigation-work-reuse-20261030/photos-30k`；真实项目隔离副本，原30000源码逐份哈希冻结 |
| 测试产物 | 本轮 `.bench/.../candidate/{dist,config}`；不是已安装/日常运行的Zed产物 |

三轮原请求对照不改Photos任何源码。单独 namespace 短测增加私有 Main.ets/Lazy.ets：
30001→30002→30001，实际数量明确记录；保留原30000份源码及模块拓扑，结束删除**测试创建的probe目录**。
不能把这个附加夹具写成原用户符号的自然现场复现，或称30000份全部进入Program。
另以事后只读审计对照原项目的59份JSON/JSON5/properties及hvigor入口，全部一致，
见`project-metadata-postflight.json`；该项不是事前独立冻结收据，采集时间明确披露。

## 原始失败及根因

最小 Main.ets：

```ts
type Alias = import("./nested/Lazy").Lazy
export let selected: Alias
export const result = selected.value
```

初始化后打开Main v7，hover零基2:32得到any；关闭Main、在原空nested内写入
`export class Lazy { value = 1 }`，**不发文件通知**，同文本v1重开。
基线请求3、4连续 -32803，message均为`Semantic query requires current workspace inputs`。
该序列没有重命名，查询时间不包含重命名；计时为发送该查询前至完整响应解码，非UI渲染时间。
已存在的冷会话、显式Created及配置控制得到精确Lazy.value:number。

`public-red.log`为无插桩公开RED；`diagnostic-red.log`/`witness-observation.ndjson`为独立只读插桩。
后者实际记录compiler witness1的nested目录旧full stamp（空目录64字节）与当前stamp（96字节）不符；
两次错误均由hover后的assertCurrentInputs抛出。inode/物理路径相同不意味着子项命名空间相同。

问题是两份证明的消费集合不同：package resolver并未拥有该源码负查找，compiler私有witness拥有。
原`reconcileResolutionOwner`只刷新前者；前者有效，generation不动，旧LS及其失败证明持续保留。
动态import类型不等同文本closure，原源码delta未覆盖这个新文件；不是结果缓存直接返回旧答案。
同内容重开优化之前的ADR0037基线也失败；原错误不应归为ADR0035新引入。

| 调用层 | 当前源码位置/作用 |
| --- | --- |
| LSP | `src/lsp/register-semantic-capabilities.ts:114` onHover → SemanticRequestRunner版本/取消围栏 |
| 父端 | `src/semantic/semantic-worker-proxy.ts:407,457` → workerDocumentRequest/项目准备 → supervisor队列 |
| 派发 | `src/semantic/semantic-worker-supervisor.ts:300` pump，mutation先行；Worker runtime派发原hover方法 |
| 输入 | `src/semantic/legacy-semantic-engine.ts:636` sync/prepare → interactive-workspace → type-engine.prepare |
| 原恢复入口 | `src/core/types/type-context-reset.ts:13` reconcileResolutionOwner；只刷新resolver已有事实 |
| 语义与最终核验 | `src/core/types/type-engine.ts:343` leased hover → `typescript-language-service.ts:1526` getQuickInfo/assertCurrentInputs；`type-workspace-entry.ts:73`保留源码和输入终检 |
| 实际拒绝 | `typescript-query-inputs.ts:37` → loadedConfigurationIsCurrent → LoadedConfigurationWitness.freshness |
| 公开错误 | `semantic-worker-request-error.ts:12` workspace-incomplete → `lsp/semantic-request-runner.ts:170` RequestFailed(-32803) |

源码行号对应本报告新候选；原编译bundle堆栈与原源码哈希单独保留，不混称为同一版行号。

## 实现与历史ADR协调

[ADR0036](../adr/0036-compiler-source-namespace-recovery.md)补齐
[ADR0025](../adr/0025-namespace-proof-domain-recovery.md)的消费者恢复入口，不撤销SDK/配置合同。

- `LoadedConfigurationWitness.observeSourceNamespace`记录事实的实际compiler来源；默认配置消费保持保守，来源元数据受原事实容量界限约束。
- freshness遇到源码事实失效，先实际核验其余事实；有SDK/配置或非源码失败时不借机恢复。
  未知/容量失败不能伪称安全namespace；已知失败源码读仍走自身权威snapshot恢复。
- `createCompilerInputWitness`在失败路径核对词法/物理workspace及SDK双域排除。
- `LocalPackageResolutionOwner.createInputWitness`只接受当前epoch的合格申请，废弃原域解析元数据并推进代次，记录本命令rebase；当前结果仍拒绝。
- 后继命令由DocumentStore既有代次规则撤销closure/membership，再由coordinator原单一退役点释放未借出的旧LS，重建当前输入。
  没有删除identity fence、仅reset证明、重启Worker、同请求循环重试或跨请求valid=true。
- helper提取使超限`typescript-language-service.ts`由上轮3073降到3072行；相对HEAD3077。
  其余既有超限债：document-store1703、semantic-capabilities707、legacy-engine728；本轮没有使其增长。

中间“所有compiler证明失效都退休域”候选破坏SDK切换/metadata回归，证据`focused-green.log`49项中4失败。
三项是合同反证，一项为测试清单计数；收窄来源策略后保持原产品断言通过，不用放宽断言换GREEN。
中间产物未全部冻结，不能把其失败/耗时归到最终13e90ee7；最终定向42项和下述30K均使用冻结产物。

## 公开回归与原30K请求对照

最终源码42/42：`final-source-regressions.log`；新回归文件
`tests/semantic/unnotified-import-type-recovery.test.mjs`7项。
完整及20001无关文件的partial、原空/新目录、保持打开/关闭重开、真实编辑、两轮删除恢复、
重复健康查询精确类型/定义URI与range，以及并发SDK metadata/declaration变更三次拒绝、配置通知后恢复。
首次保护性拒绝不算成功结果；恢复后重复查询不增加context创建，单Worker。
根目录`./Lazy`额外公开诊断对照1/1通过，见`root-creation-probe.log`；
与完整检查并行，仅用于机制边界验证，其耗时不参与性能统计，也不计入正式回归总数。

另有64个不同源码位置的取消回归：排队后取消60个，各自-32800且不派发；4个保留请求精确返回。
每ID一终态、1Worker。独立筛选`burst-cancellation.log`只选中1项、9项未选，
最终42项中该文件10项全部执行；最终完整检查还会再次执行。

冻结旧UI请求驱动SHA `d9433e5c36cd2453e12437f4bd4ad5fa3da19489d592aa42a2fbb781bf4ab644`，
原文件/7份overlay/64个不同method+位置不改，交替旧/新各3轮，禁止并行仓库测试。
每轮69份完整响应逐字段相等，原有容量错误仍是错误；不是全部查询成功，也不是结果缓存命中测试。
入口相同不代表Program包含全部项目：典型实际Program505文件=108项目+284SDK+113其他，roots110。
初始化通知是complete **degraded/project-membership-incomplete**，不宣称全局READY。

| 操作 | 前版中位/最大ms | 新版中位/最大ms |
| --- | ---: | ---: |
| 初始化语义通知 | 11815.364 / 12781.448 | 11793.720 / 11932.905 |
| 首次局部定义 | 71.380 / 77.777 | 68.444 / 68.878 |
| 热重复定义 | 50.802 / 50.856 | 50.167 / 59.554 |
| 未保存编辑后定义 | 257.398 / 261.788 | 256.296 / 290.813 |
| 撤销后定义 | 257.136 / 257.971 | 264.476 / 316.857 |
| 同内容关闭重开后定义 | 139.126 / 141.209 | 140.741 / 162.768 |
| 64不同请求突发 | 1735.340 / 3427.694 | 1726.755 / 3390.266 |

生命周期中位为3轮中位；突发中位为3轮各64样本中位的中位，最大为三轮总最大。
逐轮、分方法p50/p95/p99/最大保留`comparison.json`，不能用这次微小差异宣称突发优化完成。

## 突发长尾的可测组成

每轮`burst-stages.json`以受控FIFO、不同key、method/URI/顺序关联原LSP ID与Worker ID；
产品trace没有直接LSP ID，关联方式与限制明确披露。

新版parent admission→send中位1659.346ms、最大3305.805ms；Worker receive→dispatch中位0.116ms、
最大0.584ms。前版对应1665.185/3351.325、0.118/0.627ms。
这是已有父端`#pendingRequests`/`#active`单一同步消费者串行准入的累积，不能说Worker自身队列等待3秒。
admission→send还包含准入/状态/屏障工作，不全叫纯排队；剩余区间不冒充checker执行时间。

这些64个不同请求无取消，服务端不能用latest-wins吞掉仍有效的ID。实际取消的队列清除已验证，
原Zed晚到结果抢焦点仍须[ADR0033](../adr/0033-client-navigation-ownership-and-ui-input-context.md)的客户端证据/恢复。
不在本轮无UI权限的条件下宣布原Windows 21.56s或焦点竞态已解决。

## 私有namespace混合短测：功能与速度分开

单会话98.692秒、78条记录（含初始化、文件操作、30秒空闲），64个公开请求：
51份当前成功结果、11份预期保护性-32803、2份完整范围已知限制-32803。
不能把64份都说成成功，也不能将98.692秒加到其他会话成为正式耐久时长。
6轮创建/删除恢复，期间补全及详情、定义、未保存编辑、撤销、关闭重开、空闲恢复均完成。
定义检查精确URI/range；hover检查当前类型；补全检查当前value成员，详情检查无错误且label一致，
本短测未逐字段冷会话对照全部详情编辑载荷，该更强断言由公开回归覆盖。

| 操作 | n | 中位ms | 最大ms |
| --- | ---: | ---: | ---: |
| 创建后首请求（大多保护性拒绝） | 6 | 17.729 | 27.215 |
| 后继恢复查询 | 6 | 3143.090 | 3197.029 |
| 删除目录后后继查询 | 6 | 3113.264 | 3256.453 |
| 恢复后定义 | 6 | 84.096 | 122.761 |
| 补全列表 | 6 | 43.578 | 82.761 |
| 补全详情 | 6 | 39.529 | 78.867 |
| 同文本关闭重开后hover | 6 | 30.612 | 32.348 |

1Worker/0恢复换代，13次context创建、12次resolution-generation-change退役，退役leaseCount均0。
这是12次真实拓扑变化后的保守语义消费者重载，不是每次热查询退役Worker。
grouped compiler-build cost事件不能当成实际Program构建次数；跨owner的实际解析次数未单独测量。

恢复约3.1秒仍明显慢。第一轮日志可分出Worker dispatch→context eviction约2090ms，
eviction→新context约7ms，prepare记录0.223ms，prepare完成→公开响应约1068ms。
前段包括DocumentStore/resolver/成员及closure准备，后段包括compiler及输入终检/返回；
没有更细独立计数，不能各自断言全是扫描或checker，也不能与嵌套build cost重复相加。
新定义时Program371文件=2项目+256SDK+113其他、roots3；不是30002文件都进入Program。
本轮解决永久拒绝，不宣称精细namespace失效/规模成本已经解决。

## 资源、索引与环境阻塞

原三轮新候选采样峰值：Node RSS781234176字节，native RSS3705659392，单样本进程树RSS和4481921024。
namespace短测Node RSS969920512、Worker heap833703680、native RSS3709140992、树和4622708736。
Worker heap属于同一个Node PID，不再加一份RSS；各项峰值可处于不同时刻，树RSS和不是PSS。
只采本测试自有Node/native；无真实UI，未声称采集Zed交互资源。短会话不足以判定长期泄漏或长期稳定。
资源保护无事故，正常shutdown/exit0、无自有native残留；原项目零写入，原隔离30000源码零内容差异。

namespace进度最后仍为99%、30001/30001，未见end；会话正常关闭，**未证明索引完整提交，也未证明永久卡住/崩溃**。
语义初始化complete与索引终态分开；原99%问题未因本短测关闭。

- Windows：`windows-connectivity.log`，SSH192.168.31.14:22八秒连接超时，未执行Windows UI。
- Mac：沙箱内-10827不是权限结论；沙箱外实际`UI elements enabled=false`，
  读取Zed窗口明确`osascript不允许辅助访问`(-1728)，见`macos-ui-permission-unsandboxed.log`/`macos-zed-accessibility.log`。
  继续真实UI需要在系统设置→隐私与安全性→辅助功能允许执行本次自动化的宿主/对应终端。
  未绕过系统权限，没有控制/关闭用户窗口或丢弃编辑。
- 无真实UI动作/时长，无新的正式两小时单会话验收；原Windows/耐久失败状态保留。
- 500ms仅体验目标，不用偶发超标判功能失败；本轮无固定Node RSS停测线，产品预算/V8/截止时间不改。
  455文件冷目录3秒**独立性能门槛**继续按用户授权未执行；并非跳过正确性检查。

## 复跑及最终检查

```sh
pnpm build
node --test --test-concurrency=1 tests/semantic/unnotified-import-type-recovery.test.mjs
node --test --test-concurrency=1 tests/semantic/navigation-coalescing.test.mjs
pnpm check:fast
```

原30K复跑：`run-serial-verification.py`（须独立证据目录；拒绝覆盖原结果）、
`photos-namespace-session.mjs`、冻结`candidate`及`candidate-source-freeze.json`。
分析：`analyze-results.py`，输出`comparison.json`、每轮`burst-stages.json`、`queue-and-resource-summary.json`。
每次LSP输入、响应、UTC起止、持续时间、Worker世代、内存及进程轨迹在各轮
`client-wire.ndjson`/`operations.ndjson`/`logs/server.log`/`worker-memory.ndjson`/`process-resources.ndjson`，完整帧在stdout.raw。

完整候选检查：`final-check.log`/`final-check-summary.json`当前运行中。
最终结果、源码/SDK/项目复核及运行产物审计在完成后补入，不沿用旧版通过数据。
