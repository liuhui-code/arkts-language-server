# 大项目可用的 ArkTS Language Server：组件复用执行计划

状态：Phase 2 in progress；Phase 1 的 P1.1–P1.6 及冻结门禁均已完成；P2.1b
功能切片、统一快速门禁与冻结复审已完成，PR/CI 与合并待执行。
P1.4b 已锁定并验收 API 24 / ETS 6.1.1.125 的命名工作流；版本元信息本身仍不作为兼容认证。
基线：`ed069cf5075992b7afd8821ffd12328a9a4fd7ea`。
Phase 1 合并记录：PR #2，merge `db5d09c`。
Phase 2 启动基线：`9218508ddf9ee8e86b022965768a2a04c21a163b`。
P2.1a 合并记录：PR #4，merge `fdcfb43c3214e1779392a66fbaa18b534e856e52`。
P2.1b 父 revision：`fdcfb43c3214e1779392a66fbaa18b534e856e52`；候选分支：
`codex/p21b-reference-freshness`。

## 已确认的产品决策

- 目标是在 Zed 中可靠编辑已有大型 HarmonyOS 工程，不要求用户为语言服务改写工程。
- 现成 ArkTS LSP 整体复用已经由用户验证不可用，不再重复整体后端选型。
- 保留独立 LSP，优先复用组件；已有 TypeScript、LSP transport、测试、索引和交付资产继续使用。
- 不新增第二套常驻语义引擎；不把 workspace-symbol 索引当作精确语义真值。
- 基本功能的完整性按真实工程工作流判断，不按 advertised capabilities 或测试数量判断。
- 时延与内存必须在功能正确、结果完整的条件下测量。现有预算不能凭空放宽。
- 旧功能/E2E计划继续保存实现证据；本文件负责下一阶段优先级。暂缓非核心能力扩张。

## 执行顺序与验收

### 第一阶段：真实项目与 SDK 模型

先补当前相对路径测试绕过的命名模块解析。公开接口仍为标准 LSP，无新增自定义协议。

- [x] P1.1 本地模块依赖：最近的 `oh-package.json5` 的 `dependencies` 中，精确依赖名
  映射 `file:` 目录，再读取被依赖模块的 `main`。真实 stdio 测试验证未打开入口/实现的精确
  definition、成员 completion 与 diagnostics；不以深层相对路径替代命名导入。
- [x] P1.2 共享与安全边界：dependency closure 与 TypeScript host 共用解析器；限制配置
  读取与缓存大小；模块不能借未声明依赖、非法配置或逃逸路径悄悄绑定到无关源码。
- [x] P1.3 配置生命周期：磁盘 manifest create/change/delete 经已有 watcher 进入语义失效路径，
  热请求与新进程结果一致，保留未保存源码 overlay；缓存有界、不会每次请求扫描整个工程。
  包含无需再次编辑源码的诊断刷新；不包含未保存 JSON5 配置的 overlay。
- [x] P1.4 SDK 身份：明确支持的 ArkTS 方言/API 版本，按项目选取 SDK；不同版本工程互不污染。
  - [x] P1.4a 项目 SDK 选择与身份：工作区 `local.properties` 的 `sdk.dir`，缺省复用现有
    环境/平台发现；module 与 ambient 共用构造快照，API 等级和组件版本分开记录。
    两个工作区、配置变更/删除、共享配置软链接、未保存源码和 warm=fresh 均有真实 stdio 证据。
    错误显式配置不静默 fallback；日志明确 `typescript-compatible-only` / `unverified` 边界。
  - [x] P1.4b 锁定支持基线并用真实 SDK 场景验证：OpenHarmony API 24、ETS
    6.1.1.125 和 TypeScript-compatible `.ets` 子集。10个真实 child-stdio 场景覆盖 ArkUI、
    四类 SDK namespace、诊断、成员/工作区补全和精确跳转；Stage 配置子集由 P1.5/P1.6
    的项目模型、target 和资源套件独立验证。两类正交证据都不扩张为完整 ArkTS 方言、
    完整 Stage/FA 工程模型或官方编译器兼容声明。
- [x] P1.5 项目配置：按真实项目补 `build-profile.json5` module/target、安装的 `oh_modules`
  依赖与声明入口规则；不提前实现通用构建系统，不执行用户构建脚本来读取配置。
  - [x] P1.5a 安装包解析：按声明依赖及最近祖先安装位置解析精确包名，支持
    scoped 包、安装链接及 `typings/types/main` 显式入口；共用原有有界解析和配置失效机制。
    私有依赖按物理安装树查找、同一物理包统一语义身份；入口及转导出实现的未保存内容优先，
    关闭恢复磁盘。标准锁文件变更刷新结果与诊断；安装候选 LRU 最多256条。
  - [x] P1.5b module/target 配置与归属：非默认 srcPath、显式 product/target 选择与热切换；
    sourceRoots 保留公共 main 空间，自包名寻址遵循已核验的优先级；alias/diskless overlay 优先。
    未选 target 的磁盘目录、overlay、watch-created 不混入项目补全，保留已选自动导入和显式依赖。
- [x] P1.6 资源可见性：项目模型驱动已选模块的 string resource 归属；同名定义、补全和诊断隔离。
  覆盖自定义目录名、资源热变更、配置错误诊断；候选 watcher 不放宽实际目录/物理边界。

第一阶段完成条件已由两类正交证据共同满足：真实 API 24 child-stdio 语义验收，以及
Stage 配置子集的 project-model/target/resource 套件。P1.1–P1.3 与 P1.5a 单独完成仍只是
本地/已安装依赖工作流完成；第一阶段关闭也不代表完整 Harmony 工程模型或大型项目已经可用。

第一阶段冻结的支持矩阵：

| 维度 | 已验证基线 | 明确保留的边界 |
|---|---|---|
| 工程模型 | Stage 配置子集；product/module/target、`srcPath`/`sourceRoots`、模块资源 | 不支持完整 Stage/FA 模型；不执行构建脚本或推断 IDE 当前 Build Target |
| SDK | OpenHarmony API 24；ETS 6.1.1.125 | 只认证10个命名工作流，不代表所有 API/版本 |
| 语言 | TypeScript-compatible `.ets`、现有 ArkUI lowering | 尚未通过官方 `arktsc` 全语法/类型规则一致性验证 |
| 依赖 | workspace `file:`、已安装 `oh_modules`、`@ohos`/`@kit`/`@arkts`/`@system` | 不下载/解包 HAR，不求解远程版本，不执行包脚本 |
| 补全候选 | module-export 请求最多扫描4096个 TypeScript 候选并保留/返回128项；按 prefix、camel、subsequence 全局排序 | 超过扫描边界时返回 `isIncomplete=true`，但边界后的自动导入可能未出现；后续用 workspace/export 索引或可续查接口解决，不能退回无界扫描 |
| Host | 本地标准 LSP stdio，面向 Zed；一键本地 dev-extension 安装及产物 E2E 已完成 | SSH、远程交付和自动化真实 Zed host smoke 仍在后续阶段 |

各实现按以下首个 RED 启动，已执行的证据见下文；禁止一次铺开全部实现：

| 任务 | 首个真实 LSP 失败场景 | 最小修改入口与前置条件 |
|---|---|---|
| P1.4a SDK 身份 | 两套固定 SDK 提供同名 API、不同成员；工程选择 A 时只补全 A 成员、跳转进入 A；切换后热结果与新进程一致 | `core/sdk/discovery.ts`、TS engine 初始化；模块解析和 ambient declarations 共用一次选择结果。与 P1.5 共用配置事件入口，不再逐请求全局发现 |
| P1.4b 真实 SDK 基线 | 选定 SDK/API/方言的实际声明和 ArkUI 样例，验证补全、精确跳转与诊断，而不只读取版本字段 | 已固定本机 API 24 / ETS 6.1.1.125 并记录支持矩阵；其他 API 版本必须另建验收层，不从元信息推定 |
| P1.5a 安装包 | 普通版本依赖已安装到 `oh_modules`，但未打开入口；命名导入可精确跳转并补全 | 扩展 `LocalPackageResolver` 的确定性安装位置，继续按需加载，不能将整个 `oh_modules` 加入全量扫描；可与 SDK fixture 并行 |
| P1.5b 模块归属 | `build-profile.json5` 声明非默认 `srcPath` 和显式目标；只使用所选模块/目标的源码与配置 | 项目 resolver 读取最小 module/target 模型；先确定支持字段及选择规则，不执行构建脚本；共享配置接口由单一 owner 集成 |
| P1.6 资源隔离 | A/B 无依赖模块各有同名资源；A 的跳转只返回 A，补全不含 B 独有资源，B 变更不污染 A | 现有 resource provider/index 消费 P1.5b 的模块根与 revision；保留字节/文件预算。测试可先并行准备，生产接线依赖模块归属 |

每个任务交付：固定 corpus、真实 stdio transcript、RED/GREEN 命令及父 revision、准确范围断言；
不能只判断“结果非空”。focused GREEN 后执行 `pnpm check:fast`，不得通过改阈值、跳过测试
或扩大搜索范围换取通过。真实 SDK/API 版本与安装产物验收另行记录，不由微型 fixture 推定。

### 第二阶段：核心功能的工程级正确性

- [x] P2.1 在项目模型上覆盖命名依赖的跨模块 references 完整性；首个纵切使用真实
  Stage 双模块、`file:` 依赖和包名导入，并排除未声明模块；inactive target、overlay 与
  watcher freshness 由后续纵切分别闭环。
  - [x] P2.1a 真实 stdio references 只返回 declared module 的 import/use、未打开 barrel
    与 origin；未列入根 profile 的 ghost module 不再污染 project membership。目录在打开前、
    文件在 stat 前按项目模型剪枝；未声明超大源码不把完整快照误报为 partial，嵌套声明模块仍可达。
  - [x] P2.1b 补齐 inactive target、overlay 与 watcher freshness 的 references 纵切；
    同时封闭 discovery 到 lazy read 之间的文件身份变化，避免大型 membership 中未打开文件
    被软链接替换后读入越界内容。实现、统一门禁与冻结复审已完成，PR/CI 与合并
    单列在下方待办。
- [ ] P2.2 复用 P2.1 corpus 完成跨模块 rename 的安全编辑闭环：冲突、版本、原子
  `WorkspaceEdit`，应用后重新验证 definition/references/diagnostics。
- [ ] 用支持版本的 SDK/编译器样例校验 ArkUI lowering、diagnostics、builder 与位置映射。
- [ ] 每个关键用户场景同时通过 bundle 和安装产物验收；以前失败的外部方案场景纳入 corpus。

P2.1a 验收（2026-09-07）：真实 child-stdio references 精确返回4个 UTF-16 location；
未声明模块/根目录内的超大源码均不污染完整 membership，目录在打开前完成剪枝；聚焦回归
29/29、相关缓存/语料/解析回归76/76、统一 `pnpm check:fast` 771/771通过。证据见
[命名跨模块 references TDD](../tdd/p2-named-cross-module-references.md)。这是 P2.1a 合并时的
验收记录；P2.1 由下述 P2.1b 候选补齐，统一门禁和合并状态仍按独立清单跟踪。

P2.1b 候选（父 revision `fdcfb43`）：真实 child-stdio 场景覆盖未选 target 的明确排除、
同一物理源码只保留最近活动 overlay、相对导入也遵循相同 authority，以及声明 source root
首次出现后的 Created/等字节同 mtime Changed/Deleted 与 fresh server 精确一致。多 alias 状态机
显式验证 `second -> first -> second` authority 切换：同一个 lexical engine 每次都删除前任脚本，
不会因 reset 由另一 alias 先消费而残留旧定义或补全。大型 membership 新增按
`(canonical root, catalog revision, per-file admission token)` 绑定的按需读取口；文件在发现后被
替换或越界时 references 返回 `source-unavailable`，rename 也只验证相同 fail-closed 安全边界，
不提前宣称 P2.2 完成。

相对解析继续复用一套 resolver，但把 lexical workspace 与 selected SDK 的物理授权分开：
workspace importer 永远先受 workspace boundary 约束，即使 SDK 是 workspace 的祖先；lexical
workspace symlink 也不能继承其 SDK target 的权限。真正位于 SDK 内的 declaration 仍可解析
dotted-relative suffix。100-edge 热路径约为203次 `realpath`（约2.03次/edge），canonical root
只 snapshot 一次；SDK 图与其他解析共享每64 edge一次取消检查。调用层级的越界失败只由被选
函数实际产生的 import-call provenance 触发，type-only 或未使用的越界 import 不会污染空结果
或合法的本地 outgoing edge。

1000 文件 Stage membership 把 source-root `realpath` 从逐文件热循环降为每个 root 不超过4次，
并在未变 epoch 复用不可变 membership snapshot；这些都是确定性 I/O、状态和取消契约，不是
Phase 4 的 p95/RSS 结论。证据见
[target/overlay/watcher freshness TDD](../tdd/p2-reference-freshness.md)。

候选第一次完整执行 `pnpm check:fast` 得到793/798，准确暴露5类回归，而不是把局部 GREEN
当作发布结论：outgoing call 越界被误报为空结果、SDK dotted-relative declaration 失效、
object-property completion 的 checkpoint 从基线4增至80、alias reset 被另一个 lexical root
先消费后遗留 removed path，以及只收到最新 owner revision 的 lexical engine 未重建。每项均以
既有或新增稳定公开测试复现后最小修复；这次793/798是 RED 证据，绝不是最终门禁通过记录。

冻结前一次完整门禁又以822/827暴露 re-export provenance 缺口：caller 的 bridge import 成功，
但越界 failure 属于 bridge 的 `export ... from`。修复按具体导出名递归传播 named/star/default
re-export failure，并保留本地显式导出的优先级。最终 affected suites 246/246、统一
`pnpm check:fast` 827/827通过，0 failure/cancel/skip/todo；冻结 diff 复审无P0/P1。

P2.1b 集成收口清单：

- [x] 候选冻结后运行 `pnpm check:fast` 并记录准确通过数、失败/取消/跳过/todo与耗时。
- [x] 运行 `git diff --check`，并让最终冻结候选通过冻结复审且无 P0/P1。
- [ ] 通过 PR 合并到 `main`，回填 PR、merge revision 与 CI 结果。

上述三项完成前，不把 P2.1b 称为已合并或统一门禁通过。下一功能切片仍是 P2.2，不能把本轮
仅用于 source-unavailable 的 rename 安全回归扩张为跨模块 rename 已完成。

### 第三阶段：真实响应性与生命周期

- [ ] 沿已有 worker 计划完成一条 production completion/edit/cancel 纵切，再迁移其余能力。
- [ ] 按语义项目和实测资源选择 worker 数；复用版本、队列和缓存机制，不重复扫描/加载 SDK。
- [ ] 验证 mutation 顺序、过期结果拒绝、退出和恢复；旧功能不得因迁移消失。
- [ ] 让 SDK declaration snapshot/AST 跨普通源码编辑复用；当前128文件/8 MiB lazy cache
  覆盖不了完整 API 24 ambient 集，不能把语言服务内部缓存命中等同于受控内存预算。
- [ ] 首个 RED：让精确 workspace export 位于 TypeScript completion provider index 4096，
  要求一次请求即可召回并生成正确 import edit；当前 Phase 1 会返回 `isIncomplete=true` 但漏项。
- [ ] 新增独立的 export-aware 索引契约，而不是把 workspace-symbol 当语义真值。至少保存
  `exportedName`、kind、module/declaration identity、specifier、target scope 和 generation；
  SQLite 在 `name_folded` exact/prefix 索引上执行 `LIMIT 129`，禁止取回全量后再截断。
- [ ] 用 project/content revision、target scope 与 overlay 校验候选；TypeScript Program/
  TypeChecker 负责构建或验证 export、barrel、alias、default/type-only 语义。自有 resolve 路径
  生成受测试保护的 import edit，不伪造 TypeScript opaque `source/data`，也不依赖私有排序。
- [ ] 将 TypeScript lexical/member completion 与 export lane 异步合并；固定返回128项、每64项
  可取消，并覆盖未导出同名排除、barrel/alias、过期结果、客户端排序及10万导出内存边界。

### 第四阶段：大型项目与可靠交付

- [ ] 455 文件真实项目加补全、跳转、诊断和索引中交互，而不只验证符号搜索。
- [ ] 同一硬件/SDK/corpus采样冷/热 p50/p95/p99、取消、持续编辑和内存回收。
- [ ] Node process RSS 只计算一次；worker isolate heap分别记录，sidecar按进程记录。
- [ ] 经至少10次稳定基线，逐级扩展项目规模并启用明确的时延和内存回归门禁。
- [ ] CI与发布消费相同artifact digest；真实Zed smoke验证安装的同一产物。

一次非门禁诊断采样显示：API 24 冷加载读取138个 SDK declaration、约5.14 MiB，进程
RSS约281 MiB；30次 warm query 无新增 SDK 读取、均值约6.09 ms，但每次普通注释编辑仍会
重新读取138个 SDK 文件，10次编辑累计约51.4 MiB、均值约31.7 ms。这些数据只用于锁定
第三/四阶段的缓存与资源目标，不是稳定 p95/p99，也不能据此宣称大项目性能已达标。

## 本次实施与并行边界

### 本批 P1.4 / P1.5b / P1.6

SDK、module/target 模型、源码 membership、目录预算和独立复审分区并行；主代理接入
共享解析、资源作用域与标准 LSP 配置/失效。没有更换 TypeScript 后端、复制每模块语义引擎，
也没有将 workspace-symbol 索引作为类型语义真值。源代码和测试已冻结后再运行完整快速门禁。

本批复用锁定的 `properties-file@5.0.7` 处理 Java properties 转义；没有手写该语法解析器。
MIT notice 随 bundle 保留。SDK 选择只发生于引擎构造；100个新导入者的热查询没有新的
配置/layout/metadata探测。非活动 target 目录在枚举前被剪枝；资源目录最多读取预算加一条
溢出哨兵，超限仍报告 partial。以上为局部确定性契约，不等于大工程 p95/RSS 验收。

SDK 路径和显式 product/target 配置用法已写入 README。未知/歧义选择报告配置诊断；
标准 didChangeConfiguration 与文件 watcher 都复用既有取消、rootDirty 和诊断更新链，
保留未保存源码。独立复审发现的 shared/dangling 配置软链接、自包名 alias overlay 缺口
均先复现再修复。资源候选监听曾过宽，原有严格目录回归捕获后用共享模型确认归属，未放宽断言。

证据：

- [SDK选择与身份](../tdd/p1-project-sdk.md)：23/23聚焦回归。
- [模块/target模型](../tdd/p1-project-model.md)：16/16公开模型契约。
- [源码membership](../tdd/p1-target-membership.md)：新旧suite合计14/14。
- [目录与缓存预算](../tdd/p1-project-model-resource-budgets.md)：7/7。
- [真实模块/资源工作流](../tdd/p1-module-target-resource-workflows.md)：12/12，包含自包名alias/diskless overlay。
- [真实API 24 SDK验收](../tdd/p1-real-sdk-acceptance.md)：10/10，独立非fast门禁；缺SDK时失败而非跳过。

历史中间门禁（2026-09-07）：`pnpm check:fast` 747/747通过；随后真实 SDK ambient
补全公平性回归引入了新的生产与测试变更，因此该结果不再作为第一阶段最终证据。

冻结代码的最终统一快速门禁（2026-09-07）：`pnpm check:fast` 完成 TypeScript 类型检查、
生产 bundle 构建和全部 fast 层，761/761通过；失败/取消/跳过/todo均为0，测试耗时469.61秒。
独立真实 SDK 门禁为10/10、19.54秒；test-layer清单/runner契约32/32，`git diff --check`通过。
第一阶段据此关闭；仍不宣称真实 Zed/安装产物或大型工程时延、内存已验收。
“未提交、推送或合并”是该批验收当时的状态；Phase 1 后续已通过 PR #2 合入
`main`（merge `db5d09c`）。

### 前批 P1.5a 记录

续批：先推进不依赖 SDK 版本推断的 P1.5a；P1.4 的自动选择不抢先实现。源码调查确认
当前没有项目级 SDK override；`compatibleSdkVersion` 不能当作编译 SDK 选择条件。
安装包规则以固定 OpenHarmony compiler revision 核验，不推测 `.ohpm` store 目录名，
不下载/安装依赖、不执行用户工程脚本。安装树不纳入全量源码枚举。
协议与包解析由同一 owner 实施，文件系统边界契约和官方规则核验并行；RED/GREEN 证据
记录于 `docs/tdd/p1-installed-package-resolution.md`。最终统一跑完整快速门禁。

续批结果（2026-09-07）：新增21项测试；包解析22/22、独立安装包用户工作流6/6、
解析器契约11/11；`pnpm check:fast` 685/685，失败/取消/跳过/todo均为0，耗时340.9秒。
复用现有 TypeScript engine、依赖闭包、JSON5 与失效链，本轮没有新增运行依赖。
证据与固定官方实现来源见 [安装包TDD](../tdd/p1-installed-package-resolution.md)。
该切片当时尚未验收真实 SDK；后续 P1.4b 已完成 API 24 命名工作流门禁。
不可变安装产物、Zed host、大工程p95/RSS当时仍未验收；该批“未提交、推送或合并”也是
历史中间状态，Phase 1 最终由 PR #2 合入 `main`。

### 前批 P1.1–P1.3 记录

本次先推进 P1.1–P1.3。每个组件的生产代码由单一 owner 负责；调用链审查、独立评审可以并行。
每一行为切片：一个真实 LSP RED → 最小实现 → focused GREEN；之后再增加下一场景。
不修改全局 SDK 配置，不下载/执行第三方服务器，不推送或合并。

记录命令、父revision、实际失败原因与GREEN结果于 `docs/tdd/p1-local-package-resolution.md`。
提交验收前运行 `pnpm check:fast`。未经采样不得宣称性能改进。

集成发现的正常关闭缺口单独交给生命周期 owner：先复现 shutdown 未等待索引子进程，
再补最小 await 链和退出回归。不能用测试目录删除重试掩盖后台进程仍在写入；此修复不扩张
为第三阶段的 worker 迁移。模块解析与生命周期生产改动分区，最终统一运行完整门禁。

本批验收结果（2026-09-07）：本地依赖真实 stdio 13/13；生命周期相关套件28/28；
`pnpm check:fast` 664/664，失败/取消/跳过/todo均为0，耗时329.1秒。
完整门禁首次暴露的闭包失效与关闭顺序问题均已修复后再通过，未放宽断言或清理逻辑。
证据见 [本地依赖TDD](../tdd/p1-local-package-resolution.md) 与
[正常关闭TDD](../tdd/p1-sidecar-shutdown.md)。该段记录保留了当时“尚未提交、推送或合并”
的检查点；Phase 1 最终由 PR #2 合入 `main`。

本批新增唯一运行依赖为锁定的 `json5@2.2.3`：TypeScript 的配置解析器不完整支持
JSON5 的单引号/裸键，故复用专门解析组件，而非自行实现语法。配置读取每文件最多64 KiB，
manifest缓存128条，目录归属缓存256条；继续复用既有dependency closure与语义缓存预算。
JSON5 MIT notice 随 esbuild legal comment 保留。暖SDK导入100次的解析器层测试由800次
realpath降为0次；这是局部IO契约，不是端到端时延/RSS基线。

当前边界：解析精确依赖名、本地 `file:` 目录与工作区内已安装 `oh_modules` 包；使用显式
`typings/types/main` 源码或声明入口，不扫描外部目录或依赖store。仍不解包HAR、不求解或
下载远程版本、不支持一般package子路径/隐式index或自动SDK版本映射。
本批已补显式target选择及同模块sourceRoots自包名寻址；不扩张为跨模块sourceRoots引用。
标准锁文件以外的target-specific锁文件仍未覆盖；相关事项保持待办。

文档例外：计划、使用说明和TDD证据更新不改变运行行为；owner=本次任务维护者；
scope=本文件、README项目/SDK配置章节、本批docs/tdd/p1-*证据；expires=2026-09-14。
生产变更仍严格执行TDD。
