# S02 第四假说：隔离 compiler 多目标 worklist

日期：2026-10-04。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；
原工作树已有未提交改动，本切片未提交、推送、合并。结论：**三个窄切片精确，
但 `public constructor` 的声明过滤仍失败；S02 FAIL，S03 BLOCKED。**
`SLICE_PASS` 只表示该 fixture 的精确差分和局部成本合同通过，不是阶段通过。

## 隔离边界

新 [builder](../../scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs)
只接受已安装 `ohos-typescript@4.9.5-r10` 的 bundle SHA-256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`，
在新路径以 `wx` 创建一次性 compiler 产物；本次产物 SHA-256 为
`47b8cac9f213a7b9ed6da37a8fbb79f6ccab6cb89df1045c48cff9b8c3509463`。
没有覆盖 `node_modules`，没有修改生产 backend、LSP、SQLite、默认策略、
SDK 范围、worker 数或内存预算。实验 CLI 的提取子进程不接收查询位置；
独立 consumer 不加载 compiler，oracle 子进程使用未修改的 r10。

与 v3 逐构造器调用 `findReferencedSymbols` 不同，v4 先在一次共享遍历中
枚举构造器并建立文件名称表，为每个目标保留独立的 compiler `State`，
把初始搜索汇入 worklist；候选位置按文件／名称缓存，动态继承／导入搜索
继续执行到完成。import tracker 在首次需要时共享构建，另计一次全文件遍历。
各目标仍分别执行 compiler 的符号关系判断和去重；**这不是“语义工作只做一次”**。
内部指标在下列用例为 `internalGroupQueries=0`、
`perTargetFullFileScans=0`、`sharedWorklistPasses=1`；
`fullProgramPasses=2` 明确包含名称索引和共享 import map，不把它说成一遍。
尚未证明所有次级 compiler 路径都没有隐藏的全域扫描。

## 公开 CLI 差分

| fixture／查询 | consumer 位置数 | 与 stock oracle | 结果 |
| --- | --- | --- | --- |
| 跨模块同名 `Widget`、别名导入，两个目标各查两种 declaration policy | 3 / 3 / 4 / 4 | missing 0、extra 0；两组互不混淆 | `SLICE_PASS` |
| 继承别名／括号继承 | 0 / 1 | missing 0、extra 0 | `SLICE_PASS` |
| 重载构造 | 2 / 5 | missing 0、extra 0 | `SLICE_PASS` |
| `public constructor` | 2 / 3 | `modified-false` 缺 `edges.ets` UTF-16 `1:9–1:20` | **`FAIL`** |
| `new Base()` / `new Derived()` usage-site | 0 / 0 | stock 分别有 3 / 4 处；consumer 明确 `UNSUPPORTED`，不返回部分结果 | **`FAIL`** |

最后一个失败不是生成 worklist 后新增的原始 reference 漏项：v3/v4 对八个
现有 fixture 的原始 occurrence tuples 相同。stock 的 definition→references
路径把 `public constructor` 的 keyword 留在 `includeDeclaration=false` 结果中：
其 canonical definition span 与 keyword span 不同，后者也未标记 `isDefinition`。
当前序列化事实却按“constructor keyword 等于 canonical declaration”删掉它。
该差异必须由 compiler 派生的 query/definition provenance 证明后才能修正，
不能按 modifier 文本猜规则或改 oracle。负例的 `report.json` 保持退出码 42。

固定 r10 的只读核对进一步确认：该光标的 Go To Definition 是整段
`public constructor() {}`（offset 23–46），而非 keyword（offset 30–41）；
从 definition 起点与从 keyword 起点执行 compiler 搜索，会产生不同的
`isDefinition` 标记。`new Child` 又可能返回两个 definition。所需事实不是
每个 constructor 的单一 `isCanonicalDeclaration` 位，而应至少能表达
`selection → ordered definitions → 各 definition 入口的引用与角色`；
不能通过只让当前 keyword 多保留一个位置来宣称一般等价。
新增公开 CLI 负控还确认继承 usage-site 的两个查询共调用三次 stock
`findReferences`（分别一／两个 definition），而 v4 只覆盖声明处选择，
因此两者均明确不受支持。该缺口已固化在现有单文件 fixture，不以空结果冒充成功。

同名用例还记录 `fullProgramPasses=2`、`importTrackerFullScans=1`、
`candidateFileSearches=4`、`onDemandFileNameTableScans=0`；重载用例有
`sharedPositionReuses=2`。stock compiler 无 hook 返回 `HOOK_UNAVAILABLE/42`；
把 v3 逐目标产物交给 v4 CLI，即使位置精确也返回 `NON_BULK/42`。
这些计数只证明所测小 fixture 的工作方式，不是 Settings/SDK 的 CPU、RSS
或多目标扩展性结论。本次没有外部内存曲线或真实 Settings 回放。

原始本机证据保存在 `/private/tmp/arkts-s02-v4-root.QcV7ps/`；四份
`report.json` SHA-256 依次为 collision
`5b49079afc61bd33c79402a22fe250a974f160d313ebebfa985dad6044333b86`、
modifier `c2267e89c86d8d5176799b73d20bbc8b938513407c38c8e7dd9c61ef8e9f072a`、
heritage `fdba1ff69c04bf61fff8f3ca7be3a3eadcb086c438c0ce672d81e32a589d7b74`、
overload `eaea3dccb68b3885ad7f93e6ec4dc4cf6bcd9c061d4571d5afb60e2ab8089564`。
usage-site 负控为
`414c671266624b4747d47e3f375a9e8bb193fe60f100e724ceeaf46484a50305`。
该 `/private/tmp` 路径不是持久发布物；可用下列命令重新生成新证据：

```sh
s02_tmp="$(mktemp -d /private/tmp/arkts-s02-v4.XXXXXX)"
node scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs \
  --out "$s02_tmp/typescript.cjs"
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode run --hypothesis compiler-bulk-reference-groups-v4 \
  --compiler-artifact "$s02_tmp/typescript.cjs" \
  --input tests/fixtures/semantic-facts/constructor-collision.json \
  --queries tests/fixtures/semantic-facts/constructor-collision-queries.json \
  --out "$s02_tmp/collision"
```

公开 CLI 按 TDD 先 RED：未知 v4 曾被用法检查拒绝（exit 2），v3 产物的
事实也曾被 consumer 拒绝（exit 2）；接线后 stock／v3 负控和 v4 正例按
各自状态返回。具备 macOS 进程采样权限的 `pnpm check:fast`
**1235/1235 PASS**；其启动后新增了 usage-site 负控，因此最终工作树又单独运行
`node --test tests/test-layer-manifest.test.mjs tests/semantic-facts*.test.mjs`
**36/36 PASS**。`pnpm check` 与 `git diff --check` 通过。新增 builder／v4
测试分别 266／207 物理行，低于 500 行上限。沙箱内 `ps` 被拒绝时整套快检
的 RSS 采样相关用例会在 initialize 前超时；同一 prepared-suite 测试在具备
只读进程采样权限时 **20/20 PASS**，该环境错误不计作产品回归。

## 停止线

S02 尚缺 `public constructor` 的声明政策等价、完整 constructor/call shapes、
非构造符号及 implementations、overlay／配置／SDK 变化、真实 Settings
压力、提取总成本／内存扩展性和无隐藏全域扫描审计。任一失败仍阻止 S03
事实 schema 与生产路由。本切片不准入默认路径；不能把暂缓 500 ms 阶段目标
解释为放宽语义正确性或资源安全。
