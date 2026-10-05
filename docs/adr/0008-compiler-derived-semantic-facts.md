# ADR 0008：由 compiler 批量生成语义事实

日期：2026-09-29。状态：**Proposed；S02 可证伪验证后再决定生产采用**。

S02 checkpoint：`public-checker-binding-projection-v1` **FAIL**；普通导出/alias
切片exact，但constructor keyword的两种declaration policy漏2/3个位置。
提取Program退出后的facts-only新进程不能据此成为生产答案；S03阻断。
见[唯一实验报告](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)。
这否决所测binding投影假说，不证明所有compiler派生hook/投影均不可行；
重新研究需独立假说及本反例合同，S05仍可独立推进。

2026-10-03 的[独立v2实验](../reports/2026-10-03-semantic-ready-s02-resolved-signature-spike.md)
已验证 resolved-signature 对单一显式构造的7个查询精确；随后继承别名／括号
反例使它多出4个引用位置，故v2总体FAIL。修饰符、重载、`new`表达式光标及
其它必测也未获完整投影。原v1反例不撤销，S03仍阻断；不得靠继续增加语法
特例把v2包装成生产事实。

后续授权的[隔离 compiler-fork hook 实验](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md)
是第三个可证伪假说，**不是**采纳生产后端改动。产物与 pinned stock
compiler 分别记录 SHA；stock 独立生成 oracle。继承别名、重载两组回答
exact，但内部仍按 constructor 调用 `findReferencedSymbols`，共享索引
未减少这两组的候选文件搜索；因此是 `FAIL/NON_BULK`，不是批量事实来源。
S02、S03 门禁保持不变；一次导出 hook 调用不能替代逐目标成本证明。

2026-10-04 的[隔离 v4 worklist 实验](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md)
不再逐构造器执行完整搜索：同名跨模块、继承别名和重载的公开 CLI 差分
精确，名称索引及 import map 各共享一次遍历。但 `public constructor` 的
`includeDeclaration=false` 仍缺一个 stock oracle 位置；其它种类、真实
Settings/SDK 和规模资源未验证。故只把“多目标共享搜索可行”的窄切片记为
`SLICE_PASS`，**S02 仍 FAIL、S03 仍 BLOCKED**；不得把 builder 接入生产。

后续[隔离 v5 定义来源 worklist](../reports/2026-10-04-semantic-ready-s02-origin-worklist-spike.md)
使 `public constructor` 两种 declaration policy 与 stock oracle 各 3/3 精确，
并通过若干重载、同名、继承和构造调用 fixture；共享 worklist 的内部
逐目标分组及逐目标全文件扫描计数均为 0。但 `new Base`／`new Derived`
usage-site 仍明确 `UNSUPPORTED`，分别缺 stock 的 3／4 个位置。
小 fixture 资源数字不能推断真实 Settings/SDK。**S02 继续 FAIL、S03 继续
BLOCKED**，v5 的一次性 bundle 和事实格式不得进入生产。

[隔离 v6 usage-site 来源 worklist](../reports/2026-10-04-semantic-ready-s02-usage-origin-worklist-spike.md)
把直接 `new Base`／`new Derived` 光标的有序定义来源合并：false policy
各 2／2，true policy 分别 3／4，与 stock oracle 精确；继承调用需要两个
origin。其余窄构造器 fixture 保持精确，但含 `new Alias()` 的 call-shapes fixture
在别名变量 origin 处 `HOOK_UNSUPPORTED`、exit 42 且没有 facts；`new this()`
并非这次失败的触发点，普通和 alias 非构造查询仍失败。
小 fixture 的共享 worklist 计数和资源观测不证明 Settings/SDK 或规模门禁。
**S02 仍 FAIL、S03 仍 BLOCKED**；不得将 v6 产物或事实格式接入生产。

同日的[磁盘输入前置切片](../reports/2026-10-04-semantic-ready-s02-disk-oracle-slice.md)
让隔离 stock CLI oracle 保留列出源码的原路径和摘要，但简化 Host 尚未使用
所给 SDK、Harmony resolver、真实 membership 或生产编译选项；它明确输出
`HOST_PARITY_NOT_MET`，不能作为真实 Settings 等价证据，更不改变上述决策。

后续[生产宿主 stock oracle 对照](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md)
复用实际 DocumentStore／Harmony resolver／TypeScript LS 与 API24 SDK，
从 clean Settings 发现 1,496 个 project members；HomeInitData 的声明排除／包含
结果与既有 LSP golden 分别 9/9、10/10 精确；MenuController 构造调用
`90:17`、排除声明的 stock 结果也与已核验 golden 267/267 精确。源码、SDK 声明/编译选项和
默认工程配置均已摘要固定；当时的默认 v2 pin 将安装依赖作为拒绝条件。该 stock 切片只验证
**stock 半边**和默认工程选择，不解决 `new Alias()`、非构造与规模门禁。

随后隔离 v6 hook 的公开 `production-extract` CLI 在小型 pin 工程上取得
同宿主 Program 数一致及构造器 facts-only exact；但 clean Settings/API24 的
1,496 成员真实提取返回 `FAIL/HOOK_UNSUPPORTED`、exit42，原因为
`ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN`，没有 facts 或部分答案。
因此小 fixture 成功不能推出 MenuController 267-location 的 hook parity，
更不能推出提取成本可接受。ADR 仍 Proposed，S02 FAIL、S03 BLOCKED。
后续默认关闭的诊断确认真实首个外部 origin 为 `new Array()` 所指的
compiler `lib.es5.d.ts`；小型混合工程可把它显式标成 `UNSUPPORTED`，同时
本地构造器两种声明策略与 stock exact，但产物仍为 `FAIL/PARTIAL`。
同一真实 Settings 输入的再次提取接着在 `ADJUSTED_BRANCH` 停止、无 facts。
后续确认这一分支在生产 Host 拒绝已声明本地 `file:` 包别名、报 TS2307 的
错误解析状态下出现；原同文件 2／3 位置不是可信 stock oracle。真实 stdio
LSP RED→GREEN 修复后，同一 Settings/API24 目标的 stock references 成为
跨 24 文件的 30／31 位置。已在修正宿主上重跑隔离 hook；不能把旧
`ADJUSTED_BRANCH` 继续当成独立语义反例或把局部结果标为 S02 PASS。
修正后重跑仍为同一原因码 exit42、无 facts。默认关闭的脱敏详情定位首个
失败为 `MenuCustomComponent.ets` 的 `new CustomUiInfo`，其 definition 是同文件
import binding，而非 `DialogPage`。该固定 checkout 声明 `@ohos/mpchart@3.0.15`
却没有已安装的 `oh_modules`；真实 LSP 对该文件的四处子路径导入均报 TS2307。
所以该符号在当前环境中不是可用的完整语义 oracle。补齐且锁定依赖后，
仍须证明 package alias 的声明链和允许的搜索范围，才能继续 S02 full-coverage
差分；不得把缺失依赖按名称猜成一个 constructor fact。
同 SHA 的隔离 checkout 已用官方 `ohpm install --all` 补齐声明的确切依赖；
真实 LSP 的四条 mpchart TS2307 消失，definition 到达包内 constructor。
默认生产 pin v2 对安装目录仍按设计 exit2 拒绝；显式 v3 `--pin-installed`
现已用公开 CLI RED→GREEN 固定安装包文件、链接拓扑、owner lock／manifest
与声明的本地 `file:` 目标，并在查询前后重算。真实安装后 Settings/API24
成功 pin 1,496 个工程成员；`DialogPage` stock 的 30／31 个 URI＋UTF-16
位置与未安装 checkout 的既有 oracle 全等。这只验证了环境与 stock 半边。
另一个公开 CLI RED→GREEN fixture 已证明 compiler 可进入已安装本地包，
在其文件确属 v3 pin 且存在于 Program、文本摘要一致时，实验 stock／hook
可对两种声明策略取得精确一致。hook 仅以工程成员选择查询目标，以工程＋
受控安装包文件搜索；包构造器不会变成新的工程查询目标。同名同版本但不在
规范 store 的游离 registry 包也被公开负例拒绝。然而完整安装后 Settings
v6 提取仍在 `TouchpadPointerSpeedComponent.ets` 的另一处
`ADJUSTED_BRANCH` exit42、无 facts。该工程的相对 controller 导入在固定
commit 中不存在，真实 LSP 报 TS2307；这不是已解析语义的独立反例。
该 fixture 不能放行 S02，更不能直接
把 `oh_modules` 并入工程成员或发布 hook facts。
因此“允许工程外定义”并非一行修复，也不得将局部事实当完整覆盖发布；
原决策状态和 S03 停止线不变。

## Context

完整结果缓存只加速同一查询。未查询过的符号若要复用准备成本，需要有效的语义投影；现有词法候选索引不能直接成为完整语义答案。

## Proposed decision

- 将 R-14 的提取可行性验证提升为 Must，而不是直接批准生产 schema 或重构。
- 在固定 `ohos-typescript` 后端内批量提取 compiler 派生事实，复用其绑定和搜索规则，记录所用后端源码/API 的依据。
- 使用一个完整正确上下文，或经等价验证的真实 project/module 边界。任意文件数分组不能证明完整语义。
- compiler 决定事实；Rust/SQLite 只存储和检索已验证投影。references、definition、implementation 等 query-kind 分别验证，不能共用未经证明的万能 symbol lookup。
- 持久 key 必须是 compiler 派生、带作用域和版本的同代稳定身份；不承诺跨任意源码编辑永久稳定，不持久化 `ts.Symbol` 对象或内存 ID。未知覆盖不能推断无引用。

## Rejected shortcuts

逐符号全工程 `findReferences` 预计算只允许作为测试 oracle，不能成为产品准备算法。对 identifier 调用 `getSymbolAtLocation` 后存位置不足以复现构造函数、别名和继承查询；在 Rust 补完类型推断或继承规则会形成第二个 TypeChecker。基准符号名或路径不得成为生产特例。

## Gate and stop condition

S02 差分覆盖构造函数、`new this`、`super`、别名重导出、继承成员、同名、overlay、SDK/配置变化及真实 Settings oracle。清空完整答案缓存并释放验证 Program 后，未查询符号仍须精确；同时报告提取总 CPU、时间及峰值内存。

任一必测语义不能等价即 S02 FAIL，阻止依赖事实的生产 schema、发布和路由。保留反例，再评估受控 LS 复用或上游 hook；不能用词法补丁制造完整证明。S05 在 S01 后可独立继续，不被这项提取失败阻断。

## Relations

延续 [ADR 0005](0005-index-proof-trust-boundary.md) 的 compiler 权威；复用有效 compiler 事实不等于词法索引作答案。[ADR 0004](0004-reference-result-cache-validity.md) 的有界完整答案缓存继续独立使用。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；依赖见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。
