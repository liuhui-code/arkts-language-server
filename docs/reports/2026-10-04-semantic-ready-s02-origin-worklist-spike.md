# S02 第五假说：隔离 compiler 定义来源 worklist

日期：2026-10-04。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；
平台 macOS x64、Node v26.3.0。工作树原有未提交改动均保留；本实验没有提交、推送或合并。
结论：**构造器的若干窄切片与 stock compiler 的 Location 集合精确一致；
`new Base` / `new Derived` 的 usage-site 查询仍不支持。S02 FAIL，S03 BLOCKED。**

## 假说与隔离边界

v4 的共享 worklist 以构造器关键字直接推断声明角色，导致 `public constructor`
在 `includeDeclaration=false` 时漏掉 stock compiler 返回的位置。v5 在同一隔离
bundle 上从 compiler 获得 `selection → ordered definitions → definition-origin
reference roles`，对每个 definition origin 保留独立搜索状态，候选位置则仍由
一个 worklist 共享。consumer 在提取进程退出后仅读取序列化事实；stock compiler
由另一个进程独立生成 oracle，查询位置不传入提取进程。

builder 只接受已安装 `ohos-typescript@4.9.5-r10` 的 stock bundle SHA-256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
本次 v5 一次性产物 SHA-256 为
`39b79327c4c860f53d4619430582d21fbd8160c09a1460c63b6180cfff23ac27`；
默认 v4 builder 产物仍为
`47b8cac9f213a7b9ed6da37a8fbb79f6ccab6cb89df1045c48cff9b8c3509463`。
builder 使用新输出路径，不覆盖 `node_modules` 或生产 compiler，也不修改
LSP、SQLite、默认引用路径、SDK 范围、worker 数及内存预算。

## 公开 CLI 差分

所有“精确”均指 URI 和 UTF-16 range 的规范化集合与 stock oracle 相等，
不只是结果数量相等；下列数字是对应 fixture 查询的 Location 数。

| Fixture / 查询 | Location 数 | 差分结果 |
| --- | --- | --- |
| `constructor-edges`，`public constructor`，declaration false / true | 3 / 3 | 两种 policy 精确，v4 的缺失位置恢复 |
| `constructor-edges` 重载光标 | 2 / 5 | 精确 |
| `constructor-collision` 跨模块同名及别名 | 3 / 3 / 4 / 4 | 精确，无跨 origin 混淆 |
| `constructor-heritage-counterexample` 继承别名／括号 | 0 / 1 | 精确 |
| `constructor-call-shapes` 构造调用形状 | 0 / 1 / 1 / 2 | 精确 |
| `constructor-barriers` 自有构造与继承边界 | 5 / 6 / 2 / 3 | 精确 |
| `new Base` / `new Derived` usage-site 光标 | consumer 0 / 0；stock 3 / 4 | **明确 `UNSUPPORTED`，整次实验 FAIL / exit 42；不返回部分结果** |

每次提取只有一个共享 worklist；观测指标为 `sharedWorklistPasses=1`、
`internalGroupQueries=0`、`perTargetFullFileScans=0`、`fullProgramPasses=2`、
`importTrackerFullScans=1`。两次 full-program 遍历分别包含名称索引与共享
import map，不能将其表述为“compiler 只遍历一次”。每个 origin 仍需要 compiler
完成符号关系判断；这些计数也不能证明未测试路径没有其它全域扫描。

这些小型 fixture 的一次性提取耗时约 85–102 ms，提取进程 high-water RSS
约 104.9–110.7 MB。它们不含真实 SDK 和 Settings 工作集，不能外推
生产延迟、峰值或 500 ms 目标。

## 重放

从仓库根目录运行；两个 `--out` 必须是不存在的新目录：

```bash
spike_dir="$(mktemp -d)"
node scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs \
  --variant origin-v5 --out "$spike_dir/ohos-ts-origin-v5.cjs"
node scripts/semantic/semantic-facts-spike/run.mjs --mode run \
  --hypothesis compiler-origin-reference-groups-v5 \
  --compiler-artifact "$spike_dir/ohos-ts-origin-v5.cjs" \
  --input tests/fixtures/semantic-facts/constructor-edges.json \
  --queries tests/fixtures/semantic-facts/constructor-edges-supported-queries.json \
  --out "$spike_dir/edges-supported"
```

预期该窄切片为 `SLICE_PASS`，但报告中的 `s02Gate` 仍为 `NOT_MET`。
将 `--input` 换成 `tests/fixtures/semantic-facts/constructor.json`，
`--queries` 换成 `tests/fixtures/semantic-facts/constructor-new-expression-queries.json`，
并使用另一个新 `--out` 目录，会得到 usage-site `UNSUPPORTED` 和 exit 42。
固定产物哈希由 builder 输出；不要用未锁定的 compiler 产物替代。

## 停止线

尚未通过多定义 usage-site、非构造符号、implementations、跨模块
import/re-export、overlay 与配置变更、Settings/API24 真实工程及 SDK、
提取成本随目标/依赖规模增长和内存门禁。v5 不能批准 S03 的事实 schema、
持久化、生产路由或默认策略；S02 的判定继续为 **FAIL**。
