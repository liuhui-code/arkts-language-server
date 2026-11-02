# WUI-003：突发跳转请求长尾的根因与生产端修复

日期：2026-11-02。问题：[WUI-003 / GitHub #103](https://github.com/liuhui-code/arkts-language-server/issues/103)。
证据根目录 `.bench/wui003-burst-20261102/`，下文未给绝对前缀的证据均相对此目录。
状态：客户端正式候选、组件回归、release及六轮本地协议对照已完成；部署/UI待验。
不代表日常 Zed、Windows UI 或耐久验收通过；实现验证阶段没有部署、提交、合并或发布。
随后用户授权的仓库集成范围与不重测约定见本文末尾。

## 结论与证据强度

这里的长尾主要是**自动预取一次产生大量合法请求，人工请求跟着排队**。
不是热态每一次跳转都重建30K Program。当前服务端已有前后台有限优先和相同请求共享，
但64个不同的“方法＋位置”都是不同问题，不能共享成同一个答案。
自动预取在标准协议中同样是 definition/typeDefinition；服务器无法可靠识别哪条来自 F12。

固定现场版本的 Zed 自动上下文组件确实会选择最近32个标识符，同时启动每个标识符的两种跳转。
原现场64条的位置及顺序，与光标47:45、附近三行及方法签名完全吻合。
实际生产组件的失败回归也证明：首个响应尚未返回，就已发出64条。
这是强源码与行为对照；**原现场缺少客户端运行时调用栈和功能开关快照，不能断言它是唯一来源**。

正式修复在 Zed 请求生产端实施有界惰性生产：一次只准入一个标识符的一对请求，
保留32个标识符和两种结果。人工查询不用等全部自动请求取完。
新输入使未发出的旧预取失效，最后提交处再次检查源版本和 refresh 身份。
这是独立客户端源码补丁，**只更新 server/Worker/扩展不会应用本修复**。

## 原 Windows 证据与当前 main 对照

原现场：[21.562秒拆解](2026-10-30-definition-21562ms-breakdown.md)，
`.bench/windows-ui-remediation-20261030/final-ui-lifecycle-sealed-7/`。

- 自动定义请求570，Picker `42:2`（本报告位置均为 LSP 零基）：总21,562.433ms，
  supervisor 准入至 Worker send 21,292.850ms，98.75%；自身 compiler callback 62.081ms，Program未重建。
- 在约12ms内产生32 definition＋32 typeDefinition；该批没有对应显式取消，不能自行丢弃。
  现场前面共有75次排队派发及已运行请求。另一个先行请求约4057ms失败，
  缺少细分证据，不能把它补算成此请求的编译时间。
- 原 F12 另有16.4秒记录，与请求570并非同一请求；Windows21秒不直接用作本次Mac优化百分比分母。

本次 b57 main、相同隔离30K Photos/SDK，普通计时三轮：

| 64条突发 | 第1轮 | 第2轮 | 第3轮 |
|---|---:|---:|---:|
| 每请求 p50，ms | 1777.60 | 1797.95 | 1805.44 |
| 每请求最大，ms | 3486.87 | 3544.48 | 3540.00 |

证据 `baseline-final-plain-{2,3,4}/operations.ndjson`。
第一次局部查询是在7份文档诊断完成后，不是冷 compiler；约67–71ms。
重复查询约57–64ms，编辑后约251–272ms，撤销后约256–325ms，关闭重开后约162–216ms。
这证明单条热请求较快，连续64条的排队仍放大；不能称所有请求已低于500ms。

### 单条请求为什么仍有成本

另开插桩运行 `baseline-final-audit-2/`，不混入普通计时：

| 可测量项 | 64条中的中位观察 |
|---|---:|
| Worker入口至返回 | 67.23ms |
| 配置身份 lookupIdentity | 654次、38.66ms exclusive |
| navigation.prepare 自身 | 10.83ms exclusive |
| query.body 自身 | 10.60ms exclusive |
| native realpath 调用 | 761.5次 |

definition/typeDefinition 原始 compiler lookup 分组中位分别约0.335/0.263ms；
prepare/body 自身的进一步归因未全部测量。配置 lookup 分布于准备、查询、最终核验；
FS计时包含在阶段内，inclusive嵌套区间不能再相加，各项中位数也不是同一次请求的精确账本。
`baseline-stage-summary.json`、`comparison-summary.json` 保存 inclusive/exclusive、调用数及插桩开销对照。
project-prefix 的 openSync 中位84次；未保存全部按操作分类的唯一读文件集合，不能把84次直接称84个源码文件。

在该突发窗口，定义观测的 Program sequence 为5，source files505（项目108、SDK284、其他113），
root files110（项目108、SDK2），分组 createProgramEvents 为0。
这是该窗口定义的观测，不代表初始化没有构建，也不声称 typeDefinition 的所有构建事件都被独立穷尽计数。
30K磁盘源码、20K成员上限及505个实际Program输入是三个不同概念。

## 调用链与触发点

固定客户端 `8dd255c3eafb5231056fe4e6f601cedd011f1c93`：

1. `crates/edit_prediction_context/src/edit_prediction_context.rs:209`，
   `RelatedExcerptStore::fetch_excerpts`；常量32，选近邻并排序。
   `:309`起 map 中已创建 Project Task；`:380`才 `join_all(futures)`。
   因此给已经创建的 Task 加缓冲并不能限制实际发送。
2. `crates/project/src/lsp_store.rs:7273`，`edit_prediction_definitions`，
   立即创建 definition 和 typeDefinition 两个任务；`:7204`按可用服务器执行命令。
3. `crates/project/src/lsp_command.rs:1386/1793`，两种 edit-prediction 命令的 `to_lsp`，
   仍是普通文档位置请求，没有可供本服务端使用的后台来源字段。

来源收据 `client-upstream-identity.json` 逐个核对官方 tree 的 Git blob；
`original-burst-client-correspondence.json` 保存32对位置、标识符及距离顺序。
原始源码在 `.bench/zed-navigation-ownership-20261101/source/`，候选在 `zed-client/`。

服务端 b57：

1. [registerNavigationCapabilities](../../src/lsp/register-navigation.ts#L6) 将两种请求送入
   [SemanticRequestRunner](../../src/lsp/semantic-request-runner.ts#L113)；相同位置可合并，不同位置独立。
2. [SemanticWorkerEngine](../../src/semantic/semantic-worker-proxy.ts) → supervisor/pending reads；
   [semantic-request-lanes](../../src/semantic/semantic-request-lanes.ts#L6) 将 define/typeDefinitions 都归 foreground，
   同级稳定FIFO，有限优先并保留 mutation/global fence，不能凭位置猜人工优先。
3. [runNavigationQuery](../../src/semantic/navigation-query.ts#L18) →
   [prepareInteractiveContext](../../src/semantic/interactive-workspace.ts#L22) →
   [runWithSemanticLease](../../src/core/types/semantic-query-lease.ts#L5) → 编译器查询。
4. [request-input-validation](../../src/project/request-input-validation.ts#L49) 和
   [loaded-configuration-witness::lookupIdentity](../../src/project/loaded-configuration-witness.ts#L279)
   完成原有磁盘/配置证明及最终核验。这些步骤串行且真实有成本，正式修复没有绕过。

## 成熟方案的适配及取舍

- [futures0.3.34 buffered](https://docs.rs/futures/0.3.34/futures/stream/trait.StreamExt.html#method.buffered)
  对未来工作实行有界轮询并保序。本项目客户端 Cargo.lock 正是此版本；
  必须把 Project Task 的创建也放在惰性 async 内，不能只限制 await 的数量。
- [VS Code tsserver请求队列](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/requestQueue.ts)
  体现优先级与顺序fence相容；当前服务器已有此类约束，不能让同级无来源请求随意插队或丢弃。
- [clangd线程模型](https://clangd.llvm.org/design/threads)
  为共享AST任务提供有序访问；不通过并发操作同一TypeScript Program隐藏输入生产过量。

Context7 库解析传输失败，未获得正文；明确使用上列官方文档及固定源码回退，
不冒充已经取得 Context7 API 证据。

曾独立实现服务端目录观测复用，普通三轮仅改善约10%，第一版还变慢；
额外目录证明和未实测Windows边界不值得为这点收益纳入正式修复。
见 [Rejected ADR0039](../adr/0039-validation-directory-observations.md)；
`server-directory-prototype/` 保留源码、测试、bundle及原始失败。
**最终server/Worker、测试清单恢复b57，重新构建哈希与基线逐字节相同。**
不把“调用少一些”当作解决突发长尾，不盲目扩大缓存授权范围。

## 正式实现与不变量

[补丁及部署边界](../../editors/zed/client-patches/WUI-003-BACKPRESSURE.md)，
[Proposed ADR0040](../adr/0040-client-context-request-backpressure.md)，
[客户端TDD](../tdd/2026-11-02-wui003-client-backpressure.md)。

- `related_excerpt_fetch.rs`：逐标识符惰性准入、`buffered(1)`；每个参与的可用服务器最多收到该生产器的一对请求。
  多生产器/多服务器各自独立，不能宣称全局只有两个请求。全部32个标识符、两种方法、排序、命中和debounce保留。
- `RelatedExcerptStore::{refresh,set_identifier_line_count}`：记录源版本/刷新身份；同输入保留活动身份，
  新输入和策略变化停止旧未发出任务。准入、异步返回和最终发布都核验，原子提交完整新缓存。
- 活着的过时 refresh 产生 Finished(superseded)，下游调试事件有明确终态；owner销毁后不继续产生请求。
  已发出的首对仍遵循原请求取消/监督规则，不能承诺一个真正卡住的查询会自动在500ms内结束。
- 不改变服务端mutation fence、旧请求失效、磁盘权威、最终核验、恢复预算和单一终态。
  现有“已完成客户端缓存”的跨依赖有效性语义保留；本补丁不声称建立了更强缓存证明。
- 新模块407/347/73行；上下文主文件771→437行。`edit_prediction.rs`3684→3625行仍为迁移债务。

## 同30K生产节奏对照

采用当前main同一个server、同一个Worker和native二进制，原64条请求全部保留；
加入同一个独立跨文件人工目标：Picker `42:25` 的 `Want` →
SDK `ets/api/@ohos.app.ability.Want.d.ts` `44:21..25`，实际文本与完整Location独立断言。
它与原自动请求566的 `42:24` 不同，避免精确键合并。
eager模式先送64条再送人工查询；bounded模式先送一对再送人工查询，后续逐对完成。
两个模式的结果、错误及人工查询目标逐一对照，不能靠少发请求取得绿色。

普通计时六轮全部完成：2026-11-02 `02:22:15Z` 左右开始，`02:24:42Z` 最后关闭；
实际起止以 `producer-launch.json`、各运行 `identity.json/result.json` 和逐操作时间为准。
同轮人工查询从client发送至完整响应被测试驱动接收，包含真实排队，不只计compiler callback。

| 测量项（ms） | eager 中位 / 最大 | bounded 中位 / 最大 |
|---|---:|---:|
| 插入的跨文件人工定义 | **3557.65 / 3668.00** | **174.67 / 176.51** |
| 人工定义父端准入→Worker send | 3473.33 / 3583.23 | 109.83 / 110.74 |
| 全部64条后台取齐＋人工查询总窗口 | 3574.08 / 3686.59 | 3615.54 / 3700.17 |
| 初始化终态（仍degraded） | 11525.02 / 12099.31 | 11615.52 / 11672.12 |
| 诊断后首次局部定义 | 68.70 / 69.48 | 68.84 / 69.86 |
| 全部完成后的重复定义 | 56.63 / 58.00 | 136.25 / 149.60 |
| 未保存编辑后定义 | 252.45 / 265.10 | 253.00 / 253.75 |
| 撤销后定义 | 251.50 / 254.17 | 245.80 / 246.67 |
| 关闭重开后定义 | 160.96 / 180.41 | 162.09 / 204.43 |

人工查询逐轮：eager **3668.001、3557.648、3359.892ms**；
bounded **176.510、174.668、172.156ms**。中位改善约95.1%，
**后台总工作没有消失**，全部取齐仍约3.6秒；不把它写成所有64条总耗时175ms。
父端队列按完整70条实际发送顺序和方法逐一匹配：eager人工workerRequestId74，bounded12，epoch均1；
服务端未新增LSP ID/位置日志字段，这一映射依据及原事件保存于汇总中，不伪装额外插桩。

6轮共420个语义查询响应。每轮69个原查询答案（含已知558失败）与基线全部相同，
另1个固定人工SDK跳转均符合独立文本和Location oracle；384个后台请求没有截断。
原558共6次失败保留，不能把420个响应说成420次功能成功。
所有突发定义窗口Program sequence仍5、505输入、grouped createProgramEvents0；
每轮只有1次Worker启动/1世代，正常shutdown exit0，采样没有保护事件或关闭后的本轮native残留。

| 运行 | Node采样峰值MiB | native采样峰值MiB | Worker观测heapUsed最大MiB |
|---|---:|---:|---:|
| eager1 | 833.10 | 3614.91 | 644.83 |
| eager2 | 825.91 | 3618.23 | 642.54 |
| eager3 | 863.84 | 3611.78 | 664.44 |
| bounded1 | 844.30 | 3614.25 | 661.86 |
| bounded2 | 846.48 | 3616.20 | 665.95 |
| bounded3 | 834.17 | 3615.60 | 647.73 |

内存没有显著降低的结论；native约3.5GiB仍是已知成本，与本轮客户端队列修复分开。
单轮仅约24–25秒，不支持长期内存稳定或UI通过结论。

采样限制也保留：驱动每2秒同步调用ps/sysctl，可能延后驱动处理响应。
bounded1重复定义的服务端 `request.completed` 只有57.86ms、父端队列0.258ms，
client wall却149.60ms；两者差值没有独立采样边界，不能凭wall把它归因成产品compiler或队列退化。
人工查询三轮服务端日志约169–174ms，与client约172–177ms一致；主结论仍有队列事件独立支持。
今后严格比较几十毫秒差异宜隔离采样器；本次普通计时与重度函数/FS插桩仍分开，不删除有开销的原测量。

证据：`producer-summary.json/.console.log`、`producer-progress.json`、
`producer-{eager,bounded}-{1,2,3}/` 的 `operations.ndjson/client-wire.ndjson/stdout.raw/stderr.raw`、
`logs/server.log`、`worker-memory.ndjson/process-resources.ndjson/result.json`。
每个响应都保留；汇总脚本同时检查身份、已知错误、完整答案及Worker/退出，0退出码不冒充全功能成功。

## 环境、检查和复现

- 服务端及远端main起点：`b57ad075a80fdc2169189ba7da17fc6bb98a0866`。
  无Node/Rust索引产品源码改动；`final-server-source-state.json`、`final-main-artifacts.json` 保存核对。
  server SHA256 `1f5393d927aeb469829ab72d49a8135918444a14a5f9541008187e7275d891f4`；
  Worker `00f3c343f73c314abb95eb9d77fda7476456acafadf784d71ba5ec6519b50ed4`。
- native固定旧构建按字节复制，SHA256 `b0e248683f3c1f6681a77e98e5098ac351c2e1c4857feebd98ba1fe463f6d12d`，
  所有对照相同；没有冒称重新从b57构建。
- Mac x64，Darwin25.6.0，12逻辑CPU/16GiB；Node26.3.0，ohos-typescript4.9.5-r10；
  SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API24、6.1.1.125。
  SDK manifest SHA、驱动、overlay及采样器身份在各运行 `identity.json`；不是全SDK字节清单。
- 输入 `.bench/navigation-work-reuse-20261030/photos-30k`，与保留的30K来源清单逐文件hash核对；
  未写用户 `/Users/liuhui/Documents/code/applications_photos_30k`，未碰未保存编辑。
  `producer-inputs-before.json` 与 `producer-inputs-after.json` 均30000文件、0差异、0新增；
  当前清单SHA均 `e078b7bcf5e29a303f02992e2a5b29b987c9870bc3eff97c890a6c7f913f64b6`。
  两次选定SDK manifest及Want声明SHA相同。探测的SDK内同名compiler package不存在，
  实际编译器是repo `typescript` alias（package.name=ohos-typescript），其身份另记于最终保存收据，
  不能把不存在的SDK子路径当成实际编译器证据。
- 每轮新Node会话；OS文件缓存及隔离磁盘index为热态。7文档诊断后再查询，不把第一次局部测量称冷编译。
  Program/AST复用与答案缓存命中分开；这里没有证明服务端答案缓存命中。
- 内存每2秒逐PID RSS；Worker heap属于Node，不能加到RSS再次计数，RSS和不等于PSS。
  是采样最大值而非绝对峰值，ps CPU不是单操作独占CPU。本轮短会话不支持长时间泄漏结论。
  没有固定2GiB/4GiB停测，保留系统critical内存压力与1GiB磁盘余量保护，未调整产品阈值。

复跑（先按补丁说明执行客户端测试；30K命令会创建新证据目录，已有结果禁止覆盖）：

```sh
cd .bench/wui003-burst-20261102
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node producer-sequence.mjs
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node summarize-producer.mjs
python3 verify-inputs.py producer-inputs-after
```

`producer-replay.mjs`、`producer-sequence.mjs`、fixture、support、sampler及逐次wire/操作/日志保留在证据根目录；
连续6轮交替eager1/bounded1/bounded2/eager2/eager3/bounded3，串行且不与编译/其他测试并发。
已存在目录时应复制驱动并更改独立运行名字；不要删除旧证据后重用名字。
这只是可控生产节奏＋真实child服务端协议对照，不是实际Zed UI或正式耐久时长。

客户端检查：上下文31/31、下游105/105，6项各20种调度种子，两个相关crate正式release库构建，rustfmt通过；
见 `client-context-final-fresh-positions.log`、`client-consumer-final-all.log`、
`client-context-scheduler-seeds.log`、`client-libraries-final-release.log/.json` 和
`final-preservation-before-delivery.json`（包括release库SHA及恢复旧源码的收据）。
`client-patch-roundtrip.json` 证明补丁应用后所有Rust文件与实际候选相同。

服务端实验完整 `pnpm check:fast` **2191/2215通过、24失败、0忽略**，
23项为本轮工作树node_modules symlink造成源码清单EISDIR，1项为实验测试清单未更新；
撤回产品实验、恢复main清单和普通ignored安装目录后，三份相关文件 **28/28通过**，build/typecheck通过。
原始失败、环境问题和局部复测独立保存，**没有宣称最终全量check:fast通过**。
本轮最终没有Node产品改动；455冷目录3秒门槛沿用既有授权例外，未以它阻塞本修复。

## 尚存问题及交付边界

初始化仍 degraded(`project-membership-incomplete`)；磁盘30K超过成员20K合同。
原558（`getUIExtensionHostWindowProxy`，Picker44:14）仍返回
`-32803 Semantic query requires current workspace inputs`，按功能缺口保留，不能算成功。
完整30K引用/重命名、原SDK超时、其他人工/客户端突发及单条真实慢请求没有被本补丁解决。

Windows本轮SSH再次连接192.168.31.14:22超时；没有Windows UI结果。
没有部署补丁、更换/重启用户Zed；没有执行物理UI连续点击或两小时耐久。
客户端组件测试、协议对照与真实UI分别列账；WUI-003保留部署/UI待验状态，GitHub issue没有被关闭。
客户端背压统一作用于此Zed生产器；高度并行的其他后端及高RTT远程会话可能牺牲自动上下文取齐速度，
本轮没有验证它们，不能把ArkTS串行后端上的收益推广到所有语言服务器。
ADR0040仍Proposed，表示本地授权实现而非伪造评审接受；WUI-009/ADR0033工作及原始证据保留。
500ms是体验目标；偶发超出不当成功能失败，持续秒级排队、错误和不可用仍须如实记录。

## 2026-11-02仓库集成记录

用户随后明确授权只将WUI-003相关文档、RED夹具及固定Zed版本的客户端源码补丁，
通过本仓库正常分支/PR流程合入main并推送；保留WUI-009及其他未提交工作。
此前“不提交/合并”的表述记录实现阶段，不能据此误读为本次集成未获授权。

**本次集成不运行测试、不重新构建**，仅复用上文既有验证及精确补丁SHA，
不将历史验证写成本次执行，也不宣称最终全量check:fast通过。
提交和PR使用`[skip ci]`，避免本次推送/PR/main合并自动触发测试构建；未修改CI规则，
若远端存在必需检查仍遵守保护，不用强推或管理员绕过。
Windows真实UI尚未验收，协议短测不替代UI或耐久结果。
这只集成本仓库中的客户端源码补丁，未把它编入/安装到日常Zed，server/Worker版本不变。
Rejected ADR0039只纳入决策及实验记录，未纳入被撤回的服务端实验源码、临时缓存、产物或原始大日志。
PR/提交/远端main核验收据保存在`.bench/wui003-main-integration-20261102/`。
