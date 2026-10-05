# Semantic-Ready：正确性、就绪、500 ms 与内存验收

状态：后续执行的规范性契约；S00只同步文档。S01已实施公开harness和真实候选对照，
但未产生semantic-ready/500ms产品PASS；实际失败/缺口见[S01证据](../reports/2026-09-29-semantic-ready-s01-baseline.md)。
执行顺序见[主计划](../plans/2026-09-29-semantic-ready-execution-plan.md)，产品边界见[产品契约](../plans/semantic-ready/product-contract.md)，决策见[ADR 索引](../adr/README.md)。

所有支持范围、阈值、场景分类、目标池和采样规则在变更／取样前冻结。
门禁结果只使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN`；功能实现状态与性能毕业状态分别记录。
`Implemented`、候选索引 ready、单次快速响应或已有 ADR 均不等于本契约 PASS。
阶段实施可在精确性、完整性、新鲜度、取消与新路径资源安全通过后继续，即使
G-LATENCY 的 500 ms 仍为 FAIL；该 FAIL 必须保留原始证据并留待 S12b，
不许重标 PASS。最终毕业、默认推广、发布及 #85 关闭仍要求全套门禁通过。
S02 投影语义不等价及 S05 候选资源回归不是单独的时延失败，不能据此放行。

## G-CORRECT：完整语义与精确差分

使用真实子进程、Content-Length framed stdio 和标准 LSP 公共请求验收；仅内部调用通过不足以宣告 capability。
现有测试、timeout、golden、完整结果范围和正常诊断必须保留；不得缩小引用域、关闭正常诊断或放宽超时换取通过。
无截断完整响应是默认合同，大结果的编码／传输成本也计入时延。

- references 与 implementations 比较完整的精确 URI + zero-based UTF-16 start/end 集合；跨 checkout 时先映射为 workspace-relative POSIX path，保留原始大小写和既有路径规则，不无条件 lowercase。
- 排序去重后仍分别报告 missing、extra、duplicate、invalid range；数量相等不能证明集合相等。
- references 的 `includeDeclaration=true/false` 分别验收；constructor 查询的 Settings 267 Locations 与 class-declaration 查询的 247/248 Locations 是不同 oracle，不能互换。
- definition／typeDefinition 分别比较精确集合；rename 验证 WorkspaceEdit、版本约束和应用后的源码行为；completion 保留既有排序、编辑、snippet、`isIncomplete` 合同。
- oracle 使用相同 compiler／SDK／配置的完整路径，并以人工已知位置或专门反例交叉验证，避免两个同错实现互证。

覆盖导出／导入、alias／re-export／barrel、同名声明、namespace、继承／override、接口实现、generic、constructor／own-constructor barrier／`new this()`／`super()`、受支持的全局与 module augmentation／声明合并、SDK／ArkUI、Unicode／surrogate、缺依赖、语法不完整、深层模块及源码增删改名。
覆盖未保存新增／删除引用、diskless overlay、close→reopen、嵌套 root／realpath 别名、变更中取消与独立 waiter 取消。
无法由新投影正确表达的场景保持 exact fallback，记录 `coverage=false`，不能返回“无结果”或静默排除；相关能力整体毕业仍受阻。

## G-READY：有效代际、输入与覆盖

`candidate.ready` 只描述 discovery；语义 ready 必须由真实 `semanticGeneration` 的输入身份、已提交数据、投影版本和能力覆盖证明。
输入绑定 canonical root、product／target、backend package／patch digest、SDK／标准库 digest、compiler options、ProjectGraph／membership revision、source manifest、authoritative overlay snapshot、schema／projection revision。
mtime／文件大小不是内容身份的充分证明；监听丢失或身份未知时保守失效。开放文档始终高于磁盘与持久化事实。

必须反例验证：候选 ready 但事实未完成、schema 不兼容、数据损坏、SDK／backend／options 不同、缺源码、未知继承、只有当前模块、写入中断及查询投影版本不同。
上述状态不得宣称受影响能力 ready；工程总体 ready 需要冻结范围内所有必须支持的核心能力完整有效。
普通代码诊断不必然令所有能力失效；缺少必要分析输入时明确受影响 capability 与原因，不能伪装正常完整。

准备不得预跑基准目标查询或预存其完整答案。
先记录冻结目标池 digest／seed，再完成准备；随后选择从未通过公开请求查询的符号，并验证未打开模块。
清空完整答案 cache、释放提取 Program 后，仍须证明事实投影独立可用；不得以写完行数或跑过目标列表代替 ready。
本契约不假定 pinned compiler 已有完整投影 API；S02 若无法证明 references／implementations 提取等价，停止 production schema 投入，保留反例与正确慢 fallback。
慢 fallback 可以保护正确性，但仍可能使 G-LATENCY FAIL；不得补第二套 checker 或扩张 Rust 语义模型掩盖缺口。

## G-LATENCY：每能力、每场景独立计量

单调时钟计时：`客户端开始写请求 → 收到并解析完整终态响应`。
包含排队、增量追赶、anchor、索引／compiler、合并、fallback、重试、编码和等待；不以首条结果或内部 CPU 时间代替。
以下每个 capability × bucket 的正常请求均要求 P95 ≤500 ms：

| bucket | 冻结的初始状态 |
| --- | --- |
| first-unseen-symbol | semantic ready；该符号从未通过公开查询请求 |
| first-unopened-module | semantic ready；模块未在用户会话打开 |
| repeated-snapshot | 同一快照；完整答案 cache 可命中，独立报告 |
| edit-body | 普通单文件 body 编辑后立即请求 |
| edit-reference | 普通单文件新增／删除引用后立即请求 |
| edit-public-api | 普通公开签名编辑后立即请求 |
| after-eviction | 正常预算回收／空闲淘汰后立即请求 |
| restart-after-validated-ready | 已有事实经重启校验达到 ready；查询未查过符号 |

ready 后普通编辑产生的 updating／等待完整计入，不是新初始化；公开签名影响面大时记该桶失败。
首次准备和重启恢复分别报告 initialize、time-to-semantic-ready、CPU、总时长、峰值内存和磁盘／事实量；恢复验证成本不能藏为零。
首次准备只豁免 500 ms 交互门禁，不豁免正确性、内存、可取消和可观测失败。
SDK／target／大型分支切换可单列重新准备，事件阈值与分类须预先冻结，不事后把普通编辑改名。

PR smoke 每桶至少 10 个终态样本用于回归，不能据此宣称稳定 P95 毕业。
release 每 capability × bucket 至少 100 个请求、跨至少 5 个独立会话；未见符号须足够多且分层均衡，不复制一个符号冒充样本。
使用 nearest-rank `ceil(.95*n)`；报告原始分布、P50／P95／P99／max、>500 ms 比例、error／timeout、fallback 原因／命中率及 coverage。
样本不足为 `BLOCKED`，未运行为 `NOT_RUN`；bootstrap 区间可追加，不能代替原始分布。

正常请求的 error、内部 timeout 和最终失败均为失败样本，留在分母；超时记录下界／未完成标识，不能记 0 或删掉。
任何正常请求语义错误直接 G-CORRECT FAIL；slow fallback 不享豁免。
用户主动取消和故意 ContentModified 是独立负例，不混成快速成功。
产品性能用 trace-off；归因用独立 trace-on 运行，不能合并两者样本。
记录 phase 包含／重叠关系，不相加重叠 wall time；宿主 sleep、thermal、swap 等污染保留并标记，再重测，不冒充 compiler CPU。

## 固定 Settings/API 24 compatibility track

Settings revision `ecc550dfaed880e04e38a2477eb7235cd50475b9` 声明 compile SDK 23，本机选择 API 24。
该固定配置已获授权继续同 SDK 的策略、时延与内存 A/B/C；缺少 API 23 不阻塞此 compatibility track，也不重复争论其准入。
冻结 checkout／dirty state、server／sealed artifact、Node／toolchain、backend、selected SDK／标准库／Worker digest、项目选择、schema／generation、查询文件／符号／UTF-16 位置及所有 `ARKTS_*` overrides。
独立进程比较 legacy、batched、indexed-batched，保留各自精确 oracle、正常 diagnostics 和退出状态。
API-23-matched、跨版本等价及 DevEco 对照为独立门禁；API 24 compatibility 结果不得声称它们通过。
历史 Settings `LogUtil` 的不完整 legacy 结果不能成为 golden；class 与 constructor、两个 declaration policy 始终分开。
同一 checkout 未安装 `oh_modules`：`MenuCustomComponent.ets` 的
`@ohos/mpchart@3.0.15` 子路径导入在真实 LSP 产生 TS2307。因此依赖这些
导入的符号须标为 `ENV_INCOMPLETE`，不得把 import binding 上的结果当完整
语义 oracle；已单独验证的其他 Settings 符号仍可按各自证据验收。要升级为
全工程 S02 oracle，须先锁定实际依赖版本／内容、安装拓扑和搜索范围。
同 SHA 的隔离 `ohpm install --all` 对照已消除这些 TS2307，但当前
默认 production pin v2 按设计拒绝 `oh_modules`。显式 v3
`--pin-installed` 已固定包内容／拓扑及本地 `file:` 目标；安装后的
`DialogPage` stock 30／31 个 URI＋UTF-16 位置与既有 oracle 全等。
公开 CLI RED→GREEN fixture 已为实际进入 Program、字节与 v3 pin 一致的
本地包文件建立独立的实验 semantic search／origin 准入；工程成员和查询
目标集合不扩大，包内两种声明策略与 stock 精确一致。真实安装后 Settings
全量 v6 hook 仍 exit42、无 facts：新的首个失败文件又含一个固定 commit
缺失的相对 controller import，真实 LSP 对该 import 报 TS2307。公开 LSP
`source-unavailable` 的具体来源尚未定位。fixture 成功和 v3 pin 成功都
不等于全工程 S02 oracle 已就绪。

## G-MEMORY：原门禁与全生命周期

[原 release gates](../../config/memory-release-gates.json) 与[原产品流程](product-gate.md) 继续生效；S00／S01 保存配置 digest，不能放宽阈值。

| 原门禁 | 阈值 |
| --- | ---: |
| DevEco steady PSS ratio | ≤0.75 |
| DevEco peak PSS ratio | ≤0.85 |
| unrelated 100k／10k PSS ratio | ≤1.25 |
| post-eviction／initial-warm PSS ratio | ≤1.20 |
| allowedContractFailures | 0 |
| warm P95／baseline ratio | ≤1.25 |

新 500 ms 与旧 warm 回归比同时适用。原 >3 GB 复现及最终 50% peak reduction 目标保持 open，本契约不能关闭它们。
准备、正常交互、编辑追赶、淘汰、重启恢复均记录 Zed + server + sidecar product tree 与 compiler context 数量；harness 单列。
按 PID 计量：worker thread RSS 已包含在 Node PID，不能重复相加；heapUsed／external／arrayBuffers 不能简单相加当 RSS。
Linux PSS、macOS footprint／RSS、Windows private working set 分别命名，Mac RSS 不能称 PSS 或替代 DevEco/PSS gate。
平台无法准确提供原门禁口径时记 `BLOCKED`，需独立 metric 适用性决策；不自动替换阈值。

保存 raw 实际采样时间、PID-to-role、实际间隔、P50／P95／max 采样空洞及采样器错误；请求 50 ms 不证明实际 50 ms。
无实测峰值下降不得按文件数推算百分比；1024 MiB budget 是策略参数，不是已证明的 RSS 硬上限。
复用实验至少 100 次交替任务与编辑循环，检查释放后的平台期、趋势；报告新语义表大小和准备成本，避免成本转移。

## G-LIFECYCLE／G-PORTABILITY 与最终发布

同一 inputKey／generation 查询；旧 generation 提交不能混用新 overlay；跨 Program 身份不使用 `ts.Symbol` 引用。
准备取消无假 ready；stage／publish／commit 崩溃不污染旧有效数据；相同输入可复用，配置变化明确失效。
长 references 期间 definition／hover 仍可用；mutation 使旧请求 ContentModified；取消一个合并 waiter 不取消其他，最后 waiter 消失可停止共享任务。
同步 compiler 阻塞须以真实并发请求验证，Promise lane 本身不是证据。
Windows／macOS／Linux 分别验证空格／非 ASCII 路径、SDK 定位、native sidecar、迁移和旧数据库处理；单平台 GREEN 不推断其他平台 500 ms。
原有已支持能力不能因实验静默删除；仅真实 child-stdio transcript GREEN 后宣告标准 LSP capability。

最终矩阵按 capability × bucket × platform／环境列出 correctness、ready、latency、memory、lifecycle、portability 状态、样本数与证据链接。
任何关键未跑、覆盖无法证明或不足样本的门禁保持 `BLOCKED`／`NOT_RUN`；实现完成不能替代性能毕业。
S05 无复用收益／回收失败则撤回该实验；S06 未见符号仍慢则分别测 I/O、定位、增量和序列化；S07 普通编辑需全工程重算则保持正确、明确该桶 FAIL 并重评估边界。
