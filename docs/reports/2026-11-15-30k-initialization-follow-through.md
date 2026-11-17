# 30K 初始化不可用：实现及验证续进（2026-11-15）


> 最新续进已转至[11月16日最终检查失败续修](2026-11-16-final-gate-closure.md)。原嵌套30K普通30/31局部定义正确，仍约14秒重复查询；完整检查2480PASS/22FAIL。下列profiling29待测措辞及旧候选为历史记录，不是当前验收状态。

本项仍未整体完成。局部语义查询已在完整30K隔离副本返回正确结果；SDK仍为真实partial，
不是READY。原嵌套目录的导入密集型包身份回退、完整语义资格、持续慢查询和数据库后置校验仍OPEN。
不把95项定向通过、Native进度100%或单个定义正确等同全量通过。

前序：[11月12日阶段及OOM证据](2026-11-12-30k-initialization-unavailability.md)。
决策：[ADR0045，仍Proposed](../adr/0045-complete-membership-and-source-resource-budgets.md)。
总体：[Feature Ledger](../plans/references-feature-ledger.md)。

## 身份及输入

- 实现工作树：`.bench/worktrees/index-versioned-maintenance-20261104`，父提交
  `298d65f5d7f796c347fe8be5c739e428066489d8`，未提交候选；根工作树其他修改保留。
- 历史95候选：`operation-omission-runtime-identity.json`。
  server SHA256 `76e091442ceb13ccefaee897fe98f8a3a1d53fd41e2b8ef5e0a09b9c105a019c`；
  Worker `096bf5268822cb094ee89a4a4f8648ba3e82d7cbe2b2d4121a3b14ccd77f5c03`。
- Node20.19.5；Native release SHA256
  `800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c`，本阶段未改Rust。
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24、6.1.1.125，
  项目目标兼容性unverified/type-compatible-only；11月15日核验既有SDK基线范围3536个文件及
  符号链接，无内容差异、增删。该范围不代表整个安装或SDK完整可用。
- 保护输入H36副本位于仓库`.bench`下，物理30000源码；Node实际成员29995（5个ohosTest排除）；
  Native目录清单30000。不可混算。
- 独立副本 `/private/tmp/arkts-30k-initialization-20261112/project`，逐文件SHA与H36一致。
  项目相对拓扑/内容不变，物理父目录改变；绝对URI及namespace哈希随之改变。
  这是隔离父目录依赖的明确对照，不是原固定路径已经通过。
- 全程协议驱动；无真实UI、Windows或两小时耐久的新验收。不部署、不合并、不删除真实缓存。

本报告原始证据统一位于：
`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。

## 已证实的因果链与实现边界

1. 旧候选在初始化中构建完整项目Program，真实捕获`ERR_WORKER_OUT_OF_MEMORY`，
   Program开始1/返回0，checker尚未开始。不是凭RSS或exit1判断OOM。
2. 当前SDK已知无法取得完整资格，旧顺序仍先付出巨型项目构建成本，最后才报告SDK问题。
   `src/core/types/initial-semantic-contexts.ts:22`先做纯覆盖判断；已知拒绝时只同步真实SDK
   上下文并准备源码角色元数据，保持完整成员集合及真实SDK-partial报告。
   合格SDK的完整准备合同没有被静默改掉；其密集30K路径仍需验证。
3. 只改变初始化不够：默认交互分组仍可能扩到整个模块。当前操作范围保留同一真实语义组，
   使用完整源码角色、合法globals/augmentations及输入证明，不创建假项目或冒充READY。
   `project-operation-scopes.ts:41`选择；`:62`更新；`:105`重新核验overlay。
4. 背景诊断及非成员补全/详情曾重新把完整项目送回根owner；公开失败回归后已统一范围。
5. 未保存且无磁盘文件的合法global曾被磁盘token优先检查拒绝。现在从Store的
   `document-store.ts:302 overlayFor`取得实际权威，再决定磁盘读取；最终仍核验版本/内容。
6. Worker换代后一次性初始化豁免正确保留“已消耗”，但角色元数据丢失，下一次查询由4文件
   回到100。父端`worker-project-preparation.ts:52/90`按实际supervisor及配置共享重建准备，
   用弱引用避免持有旧代；只用于SDK-partial范围，不续领压力豁免。
   最初扩大到所有根改变了普通取消截止/第二工作区排队，曾出现34/36；已收窄并在95项中复验。
7. 原嵌套目录的返回局部Program包含87项目文件、总482文件，却因继承父仓库`@types/node`
   进入原生包身份保护，随后全模块构建超过30s。此前95候选已取得针对自动类型的第一条
   正证明：仅当实际包拥有者表与已完成SDK基线完全一致，且所有排除文件依赖为空，才可免去
   回退。不是按名字豁免@types，也没有删除包身份校验。
   导入/导出请求、动态import/require、引用、decorator/annotation、struct/JSX及隐式helper
   选项都不获本条证明。实际Photos导入密集，不能据此宣称原嵌套路径成本已解决。

调用关联：公开初始化→`lsp/initial-semantic-preparation.ts:13/16/21/28`→父端共享准备→
Worker `project-readiness.ts`→TypeEngine→上述SDK/范围准备；公开definition→
`legacy-semantic-engine.ts:246`→interactive workspace→TypeEngine/group选择→
官方LS/compiler→`observe-compiler-program.ts:8`包身份围栏→最终输入/overlay/配置围栏→响应。
更完整的父端监督及原始错误时间线仍见11月12日报告。

## 95候选最新普通计时：单轮，非中位数/最大值统计

| 场景 | 准备终态 | 首次定义 | 重复定义 | Node峰值MiB | Native峰值MiB | 后置结果 |
| --- | --- | --- | --- | --- | --- | --- |
| cold17：新进程、空索引 | SDK-partial 54023ms | 4104.84ms | 1785.69ms | 1086.51 | 43.23 | 局部结果正确；关闭取消未完成冷索引，留下的bootstrap DB检查PASS，不能代替完整索引验收 |
| warm18：完整Native缓存副本重开 | SDK-partial 49731ms | 4268.10ms | 1787.83ms | 1117.64 | 114.38 | Native ready30000/30000、跳过0；两次定义正确；完整数据DB校验60s超时，整体FAIL |

17起止：2026-11-15T03:29:43.506Z–03:30:44.600Z。
18起止：2026-11-15T03:36:41.110Z–03:38:38.282Z。
真实查询：`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，
零基位置53:20，`getInstance`，期望`common/.../ScreenManager.ts`81:9–81:20；逐次响应和断言保留。
Node RSS包括同进程Worker线程，不能再把Worker RSS加一次；Worker isolate heap单列于原始metrics。
默认RSS预算未配置，V8实际约4GiB堆限保持；测试Node RSS保护豁免沿用，其他资源保护不变。

同日新候选与11月12日39s准备的差值，不足以归因于代码：OS文件缓存未控制、日期及主机状态不同。
“冷”仅指新语言服务/空索引。重复定义持续约1.7–1.8s仍是待优化慢响应，不能因500ms是软目标
而当成体验已达标。当前源码/SDK/依赖/元数据子阶段精确占比未测，不用总差值分摊归因。

## 实际Program文件数：独立诊断16，不替代普通计时

使用先前冻结的89候选`operation-domain-final-runtime`，不是95候选测量。

- SDK准备Program：308文件，项目0、SDK256、其他52。
- 查询Program：421文件，项目87、SDK282、其他52。根/实际路径全量保留在
  `photos-operation-domain-final-program-diag-16/worker-causes.ndjson`。
- 两次查询的Program ID均为2；共享阶段计数仅2次Program开始/返回（SDK+查询），并非每次查询重建。
  多次synchronize/getProgram观测不等同多次createProgram。
- 指标`projectFiles=59990`是两个上下文的成员数相加，不是实际加载59990个项目AST。
- 诊断首次5028.31ms、重复2065.18ms；与普通计时不同日期/主机状态，不把差值直接称插桩开销。
- 两次位置正确、无OOM；SQLite后置60s超时，所以本轮整体FAIL。

## 后置检查和驱动失败没有排除

- warm14曾有`integrity.status=FAIL`，顶层仍写局部查询成功状态：驱动缺少强制断言。
  已修为后置不通过必须FAIL，汇总也按后置结果分类；原result不重写。
- diag15在首次Program前因探针参数`roots`与构建后的`roots2`不符失败，原记录保留为驱动失败。
  预检失败后下一启动命令仍被执行，是本轮编排错误；现在预检与启动分开，只有确认成功才启动。
- diag16修正探针并已获取真实Program数据，仍保留整体后置失败。
- 同一关闭、只读、无WAL的约1.81GB数据DB：原60s超时；另做独立180s观察也未完成，输入stat未变。
  最后采样约48s CPU/180s墙钟、进程多次U状态，支持存在等待，但未定位到具体SQLite语句/页面。
  不能把无输出或超时称为数据库损坏，也不能视为通过。
- 按官方API仅改变诊断连接cache_size至64MiB、保持原60s及完整SQL，仍超时。
  未修改产品或通用验收缓存参数，不把这个未解决的假设落成补丁。
- 不以quick_check替代完整检查。官方说明其不检查UNIQUE及索引/表内容一致性：
  [SQLite PRAGMA](https://www.sqlite.org/pragma.html#pragma_quick_check)。
  页缓存作用域参考[cache_size](https://www.sqlite.org/pragma.html#pragma_cache_size)；
  Context7 resolve当日transport失败，使用官方资料回退。

## 回归、ADR和未完成项

`operation-omission-final-expanded.log`：9文件95/95、零失败/跳过；同候选tsc/build通过。
包含：全局/扩展、反复编辑及最终围栏、SDK配置、取消/恢复预算、未保存/多标签、
补全详情、Worker换代与准备豁免、自动类型包以及增加/删除依赖的正反向对照。
SDK探测复用断言未放宽。自动类型反例101→5；增加依赖时证明失效，恢复依赖为空才回到5。

旧全量2470PASS/7FAIL属于更早候选，不是95候选全量结果；尚无新的check:fast全绿。
三项目录竞态有后续17/17；20K超时、全量引用/重命名、其他全量失败清单继续保留。
修改的历史超限文件债务仍有TypeScriptLanguageService2978、Legacy686、DocumentStore1541行；
本轮未增长，另有TypeEngine500、proxy499、公开测试495行，不以继续堆文件替代后续分责。

下一步按依赖顺序：

1. 对导入密集型排除集合建立实际解析依赖及全局/原生包影响的完整证明；不能把未知视为无影响，
   不能只按文件数量切掉导入入口。当前第一条dependency-free证明不足以覆盖Photos。
2. 补原固定路径复验及SDK合格密集30K对照；保持真实资格，不伪造READY，不把另一父目录成功替代它。
3. 独立定位数据库完整性检查未完成；保留原60s失败，明确区分语言服务器运行与外部校验进程。
4. 在这些机制闭环后修剩余全量行、重复查询成本，完成全量检查及所需实际场景验收。

本次没有提交、push、合并、部署或重启用户Zed。原始失败/用户项目及既有工作均保留。

## 原嵌套路径的受控分解19

同95冻结候选，在SDK及源码角色准备完成、首次选择范围之后，专用探针主动返回content-modified；
没有进入已知会扩大的项目Program。原结果FAIL保留，另有独立分类记录：这是受控诊断停止，
不是产品失败样本，也不是定义通过。

实测合法语义组28902文件，选择根1，排除28901，其中25420带依赖，不能取得dependency-free证明。
SDK基线仍有继承父仓库的`@types/node`一项。当前缓存并非没命中：它保留了完整语法角色，
却没有足以证明这25420项导入影响的实际依赖关系，无法安全关闭完整范围保护。
因此第一条自动类型优化不能解决这个导入密集型场景，不能扩大白名单或直接删除保护。
87个实际Program项目文件、28902个合法入口、29995个Node成员和30000个Native目录项是不同口径。

下一条实现需要按实际resolver建立依赖、全局扩展及原生包影响关系，反向保留所有可能影响
全局或包拥有者的入口，未知节点保守保留。沿用SDK/本地包优先级、路径边界、正负解析见证、
overlay权威和最终围栏；图与AST生命周期分开，不把每次body编辑变成全图重建。
先补256交付范围外的传递扩展、别名/重复版本和动态依赖反例，再复用SDK已解析语法元数据，
最后回到固定路径。该依赖图步骤尚未实施或验收。


## Dependency graph continuation: public regressions and original-path failure20

The previous paragraph saying the graph was not implemented describes the95
predecessor. The new working candidate now records actual resolver edges, source
roles and load-owned lookup witnesses, prunes unreachable external nodes and
lookup owners, and retains reverse global/opaque/native importer chains. It
preserves original root order and the final native-owner/full-scope fallback.
No READY, result-completeness or input-freshness contract was relaxed.

A cold typeDefinition before definition fallback reproduced an omitted transitive
global declaration in the95 predecessor (scope-cold-transitive-type-red.log).
The latest17 public partial-initialization cases pass. A separate400-source test
with a cyclic global introducer outside raw delivery also fails on95, then passes
on the graph candidate, including unsaved import removal and undo. Evidence:
scope-graph-public-latest.log, scope-graph-cycle-overlay-red.log and
scope-graph-cycle-overlay-green.log. Test inventory updated336 entries,174 bundle
entries; manifest4/4 PASS. tsc/build PASS. These are targeted, not check:fast.

Frozen operation-graph-runtime worker:
8cd6d702e00605a8b96a4a406215e54a4082e4ec18530780b810425aa5c3b224;
server76e091442ceb13ccefaee897fe98f8a3a1d53fd41e2b8ef5e0a09b9c105a019c.
Full identity includes294 source hashes and unchanged Native binary.
photos-dependency-graph-nested-cold-20 uses the original nested30K fixture,
29995 Node sources, same SDK and no product threshold change. SDK Program and
checker returned. SDK-partial preparation terminal arrived127999ms after initialized.
The first picker-screen/getInstance definition at line53 character20 still failed
at30028.39ms with -32603 Semantic worker unavailable. Its dispatch wait was1.43ms;
product execution-deadline30000ms fired while shared progress still reported only
the SDK Program (starts/returns1/1). Thus this failure precedes a project Program,
not proof of compiler OOM or an infinite compiler loop. Node peak1444.86MiB,
Native65.85MiB; two owned PIDs closed. Bootstrap DB postflight PASS, but the cold
full Native catalog was intentionally canceled at shutdown, not fully accepted.

Result20 is FAIL and remains raw. A separate graph-update CPU profile run21 is
being used to locate the added metadata/proof cost. Profiling results must be
kept separate from ordinary timings. The graph is not yet accepted for30K.


### Profile21 and boundary-proof repair (candidate22 pending)

Independent21 still FAIL, SDK-partial preparation125993ms. Diagnostic-only
inspector profiles saved at photos-dependency-graph-profile-21/
worker-causes.ndjson.scope-{1,2}.json and cpu-summary.json. Initial graph update
65306ms, first-query update25887ms; actual graph30301 nodes. Query samples attribute
~13849ms inclusive to relativeModuleBoundary and~6970ms to witness scan. Inclusive
stacks overlap; never add them to form an exclusive phase total. This is a
physical-path/proof hotspot before project Program, not evidence of native memory
pressure. Counts of distinct nodes are not Program source counts.

The public repeated-import regression measured3 physical containing-file boundary
computations for one file/three edges (scope-boundary-reuse-red.log). New
ScopeSourceBoundaries shares an original load-owned file/root path witness;
replacement/pruning advances lookup revisions. It does not share authority between
arbitrary same-directory source files. Graph proof validation now uses the existing
request-local identity sharing and uncached final union rather than independently
rescan the same owners per edge. Input load windows and final freshness stay.
Both fixes run against real child stdio LSP, including cold type navigation,
unsaved removal/undo and exact definitions:19/19,0skip in
scope-boundary-reuse-public-green.log. tsc/build PASS. No whole-gate claim.
Frozen operation-boundary-runtime worker2a8def16eb0583426255266e5a73e6de58d0cc51c0107e0016266f11e40e5bef,
295 source hashes. Ordinary original-path run22 is independent of profiling21;
its acceptance remains pending until final raw result, owned teardown and postflight.


### Ordinary original-path22: not accepted

Preparation108788ms (SDK-partial, not READY), first definition30118.53ms
(boundary-sharing22-summary.json/raw result). Node
peak2249.02MiB, Native67.48MiB, owned processes CLOSED, bootstrap integrity PASS.
Unlike20, shared progress reached project Program starts2/returns1 and checker1/1.
The execution deadline still fired; test shutdown then called Worker.terminate.
Exit1 after that is not spontaneous crash or OOM. There was no observed runtime
OOM. Full cold catalog was canceled at shutdown, not complete-index acceptance.
Run23 captures actual influencing roots and stops intentionally before the project
Program, to separate overly conservative influence retention from native-package
fallback. Its failure, if caused by that explicit cutoff, is diagnostic evidence,
not ordinary query pass or independent product failure.


### Influence23 and the independent SDK-global proof

Diagnostic23 intentionally stops before project Program; raw FAIL retained,
bootstrap integrity PASS. influence-summary.json shows21825/28902 retained roots,
all nonambient/nonopaque themselves. A shortest global seed path for every one
reaches SDK component/navigation.d.ts through project UiUtil and SDK window,
UIContext and observer. This is actual dependency evidence, not a file-count guess.
The summary's seed counts use one shortest path per root, not all paths.

New exception uses disjoint top-level global binding domains in the full legal
closure, actual baseline library/automatic-type names, and the ORIGINAL full SDK
load/probe capsule. Source/type/lib negative inputs are included, not restamped.
Merged/unknown globals and real native owner changes retain original protection.
Public regression100!=4 RED;4->100->4 GREEN, exact merged property target checked.
Context7 TypeScript resolve attempted again and failed transport; ABI/source used
is actually installed ohos-typescript4.9.5-r10. ADR0045 remains Proposed.

Frozen independent-globals runtime workerd6ed87ce..., ordinary original-path24:
SDK-partial preparation136908ms, definition30070.36ms,
Node peak1688.85MiB, Native62.28MiB. Both SDK and project Programs/checkers returned
(2/2), but product execution deadline still fired in request phase. NOT accepted.
No observed OOM; owned teardown/DB postflight retained in result.json. The observed
stage moved past project Program, so remaining metadata/proof work is material.

Refactor retains an unchanged graph topology only when source-role objects,
aliases, all original boundary/binding/external-source owners remain current;
ordinary query/publication still freshly validates those owners. Old epochs are
not restamped. Updated six-file suite54/54,0skip in
scope-graph-reuse-expanded-final.log; tsc/build PASS. An earlier53/54 attempt had
an incorrect test expectation that unnotified SDK changes could immediately renew.
The existing SDK contract rejects that input repeatedly until configuration
notification, then actual SDK synchronization recovers. The final case strengthens
this refusal and checks same-session recovery; old failed log remains.

Frozen graph-reuse runtime workerfbd670918215a19e765a1381381e6b3b52aac8a0917922be54a5f19566bbfc1e,
297 source hashes. Ordinary original-path25 is in progress, separate from21 CPU
profiling. No new check:fast, full Native integrity, SDK READY or UI/endurance
acceptance is implied by the54 focused passes.


### Handoff28 and source-hash successor: remaining failure preserved

The actual public RED is scope-preparation-handoff-query-red.log: early graph
union physically rescanned Augment/Main/Unused0. Earlier setup probes incorrectly
expected Unused0's initial boundary to be registered for a standalone final union;
those are probe errors retained separately, not claimed as product failures.
Handoff collects all nested lookup owners in the existing preparation phase,
with the final fresh union owned by the actual query. New imports after a disk
edit join the same phase. Source/body load guards remain uncached.

scope-handoff-expanded.log64/64 and later scope-source-hash-expanded.log64/64
both have zero skips; tsc/build PASS. The latter additionally hashes every actual
baseline AST text against freshly loaded source-role inputs: configuration
capsule182 facts alone is not all Registry source contents. This closes a proof
completeness concern, without a new lease or SDK whitelist.

Ordinary28 is still FAIL: SDK-partial preparation135560ms, first definition30029.1ms,
Programs2/2 and checkers2/2. Certification completed~16.6s into the query, but the
remaining guards reached the product30s execution deadline. Node peak1787.43MiB,
Native67.95MiB; owned teardown CLOSED and bootstrap postflightPASS. No observed
OOM. This does not constitute full cold Native catalog/integrity acceptance.

Latest source-hash frozen candidate64/64 uses297 source hashes, Native unchanged.
Whole synchronous navigation CPU/identity-cache diagnostic29 now measures the
remaining before-use/final scans and capacity fallbacks. No budget, deadline or
correctness guard was changed. A capacity effect is a hypothesis until counters
are collected. Original26 launch failed preflight on a parameter-name assumption
and missing identity before any server started; proof-profile26-preflight-failure.json
classifies it as a driver error. Corrected27 has separate raw timing/profiles.
