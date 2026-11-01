# 跳转优化实施与验证

本报告记录ADR0037冻结候选；随后工作树的关闭重开优化见[ADR0035](../adr/0035-unchanged-source-authority-transitions.md)。
以下测量、产物SHA与2147收据均保留原时点含义，不代表后续候选已经通过相同检查。

服务器侧三项优化已实现；最终 `pnpm check:fast` **2147/2147、exit0**，相关公开回归 **103/103**。
固定驱动、SDK和隔离30K项目的三轮交替协议对照，最坏定义 **6466.262→3563.904ms**，下降约44.9%。
每轮69份完整响应逐字段一致，包含原有错误；仍有多秒排队，关闭重开未改善，原Windows真实UI问题保持OPEN。
父提交 `04282ed34ebab7cd01726bb0291af53bd278ff00`，分支 `fix/navigation-request-work-reuse-20261030`。
[ADR0037](../adr/0037-navigation-work-and-input-validation.md)、[TDD](../tdd/2026-10-31-navigation-work-reuse.md)、
[实施计划](../plans/2026-10-30-navigation-work-reuse.md)；证据根 `.bench/navigation-work-reuse-20261030/`。
本轮未提交、push、合并、发布或部署日常扩展。

## 实现与边界

1. `src/lsp/register-navigation.ts:6` 统一定义/类型定义注册，接入现有在途合并器。
   同方法、URI、位置、workspace和文档版本的在途工作共享；每个消费者保留独立取消和唯一终态。
   workspace失效撤销旧操作，依赖/配置变化、编辑及同版本关闭重开不能加入旧计算。
   不同位置、不同方法保持独立；没有跨请求完成结果缓存。
2. `src/core/workspace/project-membership-catalog.ts:21` 抽取原成员枚举；
   `workspace-source-enumerator.ts:24` 在原目录关闭验证后保留真实目录身份。
   `SemanticDocumentStore.hasCurrentCapacityFailure`（`document-store.ts:811`）只复用容量失败证明，
   检查必要overlay、目录物理路径及精确身份；`interactive-workspace.ts:31` 在完整准备/预载前检查它。
   定义局部结果为空时，不再为了得到同一容量错误重做20K成员扫描和无关源码预读。
   namespace/config变化恢复原枚举；输入不可用、枚举异常不当作容量失败缓存。
   原完整范围错误保留，没有提高20K上限，也没有将错误改成截断空成功。
3. `src/semantic/navigation-query.ts:16` 包围无await的导航准备；
   `src/project/request-input-validation.ts:29` 将准备证明交接给原leased查询。
   同一同步操作的配置/命名空间观察复用；**最终核验清空观察缓存，仍在原Program租约内重新执行**。
   `loaded-configuration-witness.ts:195` 只对验证扫描复用；实际加载前后guard、磁盘字节及符号链接检查保留。
   不跨请求缓存“有效=true”；原32MiB可选元数据额度、mutation/global屏障、公平性和Worker监督保持。

原Windows21562.433ms中21292.850ms在父端准入至Worker发送之间；自身定义62.081ms、Program零重建。
原前序4057.663ms失败请求没有完整内部阶段，不能把本轮Mac受控重放结果追认为其全部归因。
该最大值属于自动查询；真实F12另有16427.801ms。出处见[原拆解](2026-10-30-definition-21562ms-breakdown.md)。

## 公开正确性与全量检查

所有LSP回归通过真实child process、Content-Length framed stdio。
`final-scoped-regressions.log`：103/103、exit0、0skip/cancelled/todo，覆盖新增导航及原路径/输入证明回归。
最终 `check-fast-final.log`：2147/2147、0fail/cancelled/skipped/todo、exit0，测试体3425610.896ms。
实际Node20.19.5、pnpm8.3.1；仓库声明8.15.9，未更新管理器或依赖。
`final-check-summary.json` 保存日志SHA、800份冻结源/测试/配置和最终运行产物核验。
最终检查完成后未再改产品或测试输入；文档与独立诊断派生统计不在该冻结范围内。

- 三个相同定义：物理dispatch 3→1，三个完整响应保留。
- 取消首订阅不取消其他订阅；全部消费者取消后同查询可重新准入；不同位置/方法不误合并。
- 未打开来源不创建伪overlay；依赖/配置、同版本关闭重开隔离旧工作。
- 20003源缺失定义三次：noise枚举2→5改为2→2；约436–449ms改为约8–16ms。
  真实删除目录、新增声明且不发文件通知后，同会话正确恢复完整定义。
- 不可用源码修复保持目录mtime不变，仍可重试；不把所有partial永久缓存。
- 已加载namespace同path/mode保留首次与全新最终两次观察，消除额外重复。
- 实际编译器产生定义后才修改私有SDK文件：旧结果必须被最终围栏拒绝，配置切换后恢复。
  这是受控真实文件修改；用户原SDK未改，不冒充自然时序复现。

初始RED、中间失败及修正原因见TDD；未放宽原物理源根扫描断言或新鲜度合同制造GREEN。
455文件冷目录3秒独立门槛按用户此前授权不执行，不宣称该项通过。

## 固定输入与运行身份

运行平台 macOS 26.6.2、x86_64；隔离副本 `photos-30k/` 保留真实项目30000个 .ets/.ts 及模块拓扑，原项目和未保存编辑未改。
`photos-source-manifest.json` 记录逐文件SHA；事后30000份全部匹配，无增删。
SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24、6.1.1.125；
`matched-environment.json` 的3956份SDK声明/选定元数据输入事后无变化。
这是完整Mac DevEco SDK；原Windows声明SDK不同，**不能把下表直接当作Windows21.56秒的前后比**。

| 产物 | 基线SHA256 | 最终候选SHA256 |
| --- | --- | --- |
| server.cjs | dd3feefdb5e2011739046c58080858ca0aeb426950b00ec07487435644a1b82d | 604cbd724df7c38e9e9514682f3eeaa446f66eaa79cdb286cdf8562e917a2304 |
| semantic-worker.cjs | bf8433e77e53a280afca48eaa8cb62d9a20ab20a2596a4353e50a09deda78afa | debfcd3e1310b73c08feff96c8c79911c7444417dafaf76cdc07292934a30ce3 |

基线冻结于 `baseline/`，与原Windows封存同产物；候选 `candidate-qualified/` 与当前dist哈希相同。
每轮 `identity.json` 记录实际server/Worker/native、SDK、Node、fixture、驱动与采样器身份。
原生索引SHA `f081d507b45ae99bac44450d9273db3b7f4752b196f95ab188ae622387421ba0`。
最终六轮固定驱动 `d9433e5c36cd2453e12437f4bd4ad5fa3da19489d592aa42a2fbb781bf4ab644`，
采样器 `fd12ab07f5cd08973fb69ae17f61f0d58a89c31806540247244f57bbec7c0088`；无其他仓库测试并发。

从原封存wire逐条应用UTF-16编辑，还原原时点7份overlay。Picker版本68、SHA
`abde5c958e758df9ae1e8aa248c3353b8517c5eb8ff55bb4f26144aa2d0ab22d`。
重放原508–571：32定义+32类型定义，**64个键全部不同，没有合并事件**，下表收益不能归功于请求合并。
每轮新进程，初始化后打开同样7份overlay并等待诊断，再执行首次锚点、64请求突发和后续生命周期动作。
首次锚点前没有用户查询，但SDK初始化/诊断已发生，不能称全冷；重复是再次服务，不代表完成结果缓存命中。

## 最终三轮同条件协议对照

运行按基线1/候选1/基线2/候选2/基线3/候选3串行，六轮均exit0、资源保护未触发。
正确回应全部server请求，包括id0的进度创建；`stdout.raw` 为完整帧，client-wire保留实际回包。
每轮69份查询完整响应逐字段与基线一致，包括error、位置和URI；不是只比结果数量。
每轮原558定义仍返回 `-32803: Semantic query requires current workspace inputs`，不能算功能成功。
32份定义中18份跨文件；部分类型定义为空，不对空结果宣称丰富目标正确性。

| 版本/轮次 | 定义p50 ms | 定义最大 ms | 类型定义p50 ms | 类型定义最大 ms |
| --- | ---: | ---: | ---: | ---: |
| 基线1 | 2257.002 | 6235.385 | 2321.795 | 6289.337 |
| 候选1 | 1910.818 | 3531.438 | 1963.949 | 3582.971 |
| 基线2 | 2314.022 | 6429.117 | 2369.427 | 6489.529 |
| 候选2 | 1776.307 | 3257.126 | 1823.890 | 3306.265 |
| 基线3 | 2171.992 | 6466.262 | 2237.641 | 6531.240 |
| 候选3 | 1866.626 | 3563.904 | 1918.066 | 3614.072 |

“每轮p50的中位数”：定义2257.002→1866.626ms（约17.3%），类型定义2321.795→1918.066ms。
三轮最坏定义6466.262→3563.904ms，最坏类型6531.240→3614.072ms。
64条未取消的独立请求仍串行承担总服务成本，有持续多秒排队，不能宣称长尾已全部解决。
全部逐次数据、完整响应及计算口径见 `comparison-matched.json` 和 `analyze-matched.mjs`。

### 顺序生命周期锚点

锚点为原请求570的 `onSessionCreate` 同文件定义，不将其热态耗时称作跨文件UI点击。
每格为三轮中位数/最大值；编辑在隔离overlay尾部加入注释，撤销原样恢复，关闭重开同文件。

| 前置状态 | 基线 ms | 候选 ms |
| --- | ---: | ---: |
| 7份overlay诊断后首次锚点 | 80.889 / 82.304 | 70.546 / 71.848 |
| 突发结清后重复锚点 | 71.309 / 72.116 | 59.760 / 60.096 |
| 未保存注释编辑后首次 | 305.436 / 315.941 | 304.247 / 309.168 |
| 撤销后首次 | 307.009 / 407.272 | 302.578 / 305.953 |
| 关闭重开后首次 | 1051.739 / 1111.666 | 1200.191 / 1212.422 |

编辑/撤销收益有限；关闭重开中位数约增加148ms，未改善，不算成功。
该动作仍有根级失效/Program更新等既有成本，本轮不扩大到原先暂停的无关缓存优化。

## 文件访问与Program

独立 `mac-matched-{baseline,qualified}-audit-1` 使用相同冻结驱动、SDK及输入，两轮exit0、69响应一致。
插桩结果只分析实际调用次数，**插桩耗时不混入上表**；计数覆盖整个Worker请求，不全归给checker。
`filesystem-comparison-matched.json` 保存方法、Worker ID及逐动作统计，原始 `filesystem-*.ndjson` 可核对。

| 热态突发定义：单请求调用中位数 | 基线 | 候选 |
| --- | ---: | ---: |
| realpathSync.native | 1015 | 752 |
| lstatSync | 1569 | 1048 |
| statSync | 1075 | 812 |
| openSync | 84 | 84 |

原558失败回退（Worker请求60）：lstat 22178→1392，opendir 92→0，realpath 1432→921。
仍执行必要目录见证/最终输入核验，错误保持；没有删除真实路径校验。
关闭重开仍有大量调用：realpath 18798→18535、lstat 48659→48138，说明本轮局部复用未消除其主要工作。
open不减少；源码/SDK字节保护并未省略。readFileSync计数0不代表未读文件，实际存在open/其他读取路径。

热态突发的Program均为序号5、createProgramEvents=0：505个SourceFile，项目108、SDK284、其他113，根110。
不能将30K目录源码数当作全部进入Program，也不能把最终验证当成Program重建。
505个文件的必要验证和64份独立请求成本仍存在；不据此宣称规模无关或推导线性/平方复杂度。

## 初始化、索引与资源口径

初始化通知均为phase complete但semanticState degraded，原因 project-membership-incomplete；没有全局READY。
三轮初始化中位数/最大：基线11827.295/11850.829ms，候选11745.012/11833.623ms。
原生索引真实运行，各轮收到约534–546份进度；完整stdout最后仍为99%、30000/30000，随后测试会话关闭。
**本测试没有等待全量索引提交结束，没有观察end，不能判定索引完成或永久卡99%。**
这也限定全量引用/重命名的结论，未用局部定义成功替代它们。

每轮1次Worker创建，未观察换代/恢复/OOM；六个独立短会话，不宣称两小时耐久或无泄漏。
采样每2秒读取测试进程树PID RSS/CPU、系统压力/可用内存/磁盘；Worker heap由内部指标记录。
Node RSS按PID只算一次，已含Worker；isolate heap不额外相加。进程树是PID RSS之和，**不是PSS/独占物理内存**。
以下为各轮采样峰值范围，不是持续占用或真实瞬时上界；本测试未做长时间空闲回收结论。

| 资源（MiB） | 基线三轮峰值范围 | 候选三轮峰值范围 |
| --- | ---: | ---: |
| Node进程RSS（含Worker） | 735.19–737.74 | 733.34–740.95 |
| Worker heapUsed（不与RSS相加） | 604.04–607.94 | 609.49–611.66 |
| 原生索引进程RSS | 3528.74–3532.32 | 3528.33–3533.15 |
| 同时采样进程树RSS之和 | 4263.40–4264.80 | 4258.91–4267.73 |

无固定Node RSS停测线、产品预算未改，V8/超时/规模阈值未改；系统严重压力和既有磁盘保护保留。
所有六轮系统压力等级均1，必要保护未触发；正常关闭后未发现本轮私有索引进程残留。
原生索引约3.45GiB仍明显高，本轮不顺带做其内存优化。

## 原始记录与未覆盖范围

初版plain驱动漏答进度创建；另有一组已修握手但采样元数据修改导致驱动版本不一。
分别保留 `mac-*-plain-*`、`mac-comparable-*`，以及原 `comparison.json`；均为初步记录，不混入最终匹配统计。
早先8279→4925ms不作为最终收益数字。遗漏握手已纠正，没有删除原始证据或用更慢基线放大效果。

Windows最初只读SSH可连，23MB基线/中间候选包上传至新诊断目录；未动日常扩展/原项目/真实缓存。
.ps1准备被执行策略拒绝，未改策略；Node替代脚本SCP及后续有界SSH超时，未完成最终候选安装/运行。
Mac System Events查询返回 `-10827`，未证明能操作UI，也未绕过系统权限。
**本轮没有Windows最终候选验证、真实Zed点击或新的两小时耐久验收。**

ADR0033的客户端自动需求取消/晚到结果围栏保持OPEN；标准LSP没有可靠F12/自动查询区分，
实际安装扩展API没有可改Zed核心导航任务所有权的钩子。没有用服务端latest-wins取消合法独立请求。
原21.56秒Windows问题、SDK来源/运行时global、30K完整引用/重命名及原生索引完成性能仍未闭环。
500ms是体验目标；不以偶发超标判失败，也不掩盖持续慢响应。

## 复现

```sh
node --test --test-concurrency=1 tests/semantic/navigation-coalescing.test.mjs tests/semantic/navigation-partial-membership.test.mjs
python3 .bench/navigation-work-reuse-20261030/make-ui-burst-fixture.py
node .bench/navigation-work-reuse-20261030/analyze-matched.mjs
```

保持Node20.19.5；`protocol-replay.mjs <server.cjs> <隔离30K项目> <SDK> <native> <全新结果目录> [plain|audit]`。
固定SDK路径如上，native可用任一已记录同SHA私有副本；驱动会再复制为本轮专有可执行文件。
每轮结果包含 `identity.json`、`operations.ndjson`、`client-wire.ndjson`、`stdout.raw`、`stderr.raw`、
`logs/server.log`、`worker-memory.ndjson`、`process-resources.ndjson`、`exit.json`、`result.json`。
证据目录拒绝覆盖；本地bench未作为产品提交内容。当前产品与测试改动仅在工作分支中。
余留体量债务：legacy引擎745→728行、document-store1765→1703、semantic-capabilities721→707；
均提取相关职责且未增长。run-language-server500→489；新增手写源码/测试/脚本均不超过500行。
