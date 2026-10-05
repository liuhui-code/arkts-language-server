# S02 第六假说：隔离 compiler usage-site 来源 worklist

日期：2026-10-04。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；
工作树原有未提交改动均保留。本实验未接入生产，也未提交、推送或合并。
结论：**`new Base`／`new Derived` 的直接 usage-site 光标与独立 stock oracle
精确一致；一般构造调用形状及非构造符号仍未支持。S02 FAIL，S03 BLOCKED。**

## 假说与隔离边界

v5 已从 compiler 获得 `selection → ordered definitions → definition-origin
reference roles`，但 consumer 只接受单个 origin，因此继承用例的 `new Derived`
光标返回 `UNSUPPORTED`。v6 在隔离 bundle 中把直接 `new` 表达式的标识符
加入 selection，并允许一个 selection 联合多个有序 definition origin 的引用。
在这个 fixture 中，继承的调用光标需要**两个** origin；不能把它压成一个
constructor 身份，也不能用 class 名称或词法位置代替 compiler 定义关系。
`includeDeclaration=false` 对每个 origin 排除其 canonical declaration，再将
剩余 URI／UTF-16 range 规范化去重。提取进程只接收源码，不接收查询光标；
Program 退出后 facts-only consumer 在另一个进程回答，stock compiler 则独立
生成 oracle。v6 仍是一次性研究产物，事实格式和 bundle 均未进入生产。

builder 只接受已安装 `ohos-typescript@4.9.5-r10` 的 stock bundle SHA-256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
本次 v6 产物 SHA-256 为
`c05ec5eea6c50f3adc1eeb9c16cf80b9bec67f5978cc4c6f4318aa6ec9271621`；
v5 `39b79327c4c860f53d4619430582d21fbd8160c09a1460c63b6180cfff23ac27`
及 v4 `47b8cac9f213a7b9ed6da37a8fbb79f6ccab6cb89df1045c48cff9b8c3509463`
产物哈希未变。builder 使用新输出路径，不覆盖 `node_modules` 或生产 compiler。

## 公开 CLI 差分

“精确”指与 stock oracle 的规范化 URI＋UTF-16 range 集合相同，不只是数量
相同。表中的数字按对应 query 文件顺序列出 Location 数。

| Fixture / 查询 | v6 与 stock | 判定 |
| --- | --- | --- |
| `constructor`：`new Base`／`new Derived`，declaration false | 2 / 2 | 两个查询精确 |
| `constructor`：同上，declaration true | 3 / 4 | 两个查询精确；继承调用覆盖两个 origin |
| `constructor-edges`：`public constructor`，false / true | 3 / 3 | 两种 policy 精确 |
| `constructor-edges`：重载光标 | 2 / 5 | 精确 |
| `constructor-collision`：跨模块同名及别名 | 3 / 3 / 4 / 4 | 精确 |
| `constructor-heritage-counterexample`：继承别名／括号 | 0 / 1 | 精确 |
| `constructor-barriers`：自有构造与继承边界 | 5 / 6 / 2 / 3 | 精确 |
| `constructor-call-shapes`：含 `new Alias()` | 无 facts | `HOOK_UNSUPPORTED`、exit 42；不能将该 fixture 判为成功 |
| `ordinary`：四个非构造查询 | stock 3 / 2 / 3 / 2，v6 均为 0 | `UNSUPPORTED`／FAIL |
| `aliases`：四个非构造查询 | stock 9 / 8 / 8 / 1，v6 均为 0 | `UNSUPPORTED`／FAIL |

`constructor-call-shapes` 的提取在 `new Alias()` 的别名变量 origin 分支失败，没有写出
`facts.json`；既没有完整答案，也没有可声称精确的局部构造调用结果。
`new this()` 实际位于另一份 `constructor-barriers` fixture；该次测试没有将它作为
usage-site 光标验证，不能把它归因为上述失败。
ordinary 和 alias 的 stock 差分继续保留为负例，不能由直接 `new` 成功推断
普通标识符或重导出已被覆盖。

在上述小型 `constructor` usage fixture，提取指标为 `definitionCalls=3`、
`originStateCount=2`、`sharedWorklistPasses=1`、`internalGroupQueries=0`、
`perTargetFullFileScans=0`、`fullProgramPasses=2`、`candidateFileSearches=2`。
一次提取耗时 84.7 ms，提取进程 high-water RSS 105.1 MB。两次 full-program
遍历仍包括共享名称索引和 import map；这些是单个小 fixture 的观察值，
**不是**目标数／依赖数增长、Settings/API24 或 SDK 工作集的资源证明。

## 重放

从仓库根目录运行。`--out` 目标必须是不存在的新路径。builder 输出的产物
哈希应与上文 v6 哈希一致；每次 replay 使用新的 evidence 目录。

```bash
spike_dir="$(mktemp -d)"
node scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs \
  --variant usage-v6 --out "$spike_dir/ohos-ts-usage-v6.cjs"
node scripts/semantic/semantic-facts-spike/run.mjs --mode run \
  --hypothesis compiler-origin-reference-groups-v6 \
  --compiler-artifact "$spike_dir/ohos-ts-usage-v6.cjs" \
  --input tests/fixtures/semantic-facts/constructor.json \
  --queries tests/fixtures/semantic-facts/constructor-new-expression-declaration-policies-queries.json \
  --out "$spike_dir/usage-policy"
node scripts/semantic/semantic-facts-spike/run.mjs --mode run \
  --hypothesis compiler-origin-reference-groups-v6 \
  --compiler-artifact "$spike_dir/ohos-ts-usage-v6.cjs" \
  --input tests/fixtures/semantic-facts/constructor-call-shapes.json \
  --queries tests/fixtures/semantic-facts/constructor-call-shapes-queries.json \
  --out "$spike_dir/call-shapes"
node scripts/semantic/semantic-facts-spike/run.mjs --mode run \
  --hypothesis compiler-origin-reference-groups-v6 \
  --compiler-artifact "$spike_dir/ohos-ts-usage-v6.cjs" \
  --input tests/fixtures/semantic-facts/ordinary.json \
  --queries tests/fixtures/semantic-facts/ordinary-queries.json \
  --out "$spike_dir/ordinary"
node scripts/semantic/semantic-facts-spike/run.mjs --mode run \
  --hypothesis compiler-origin-reference-groups-v6 \
  --compiler-artifact "$spike_dir/ohos-ts-usage-v6.cjs" \
  --input tests/fixtures/semantic-facts/aliases.json \
  --queries tests/fixtures/semantic-facts/aliases-queries.json \
  --out "$spike_dir/aliases"
```

首个 replay 预期 `SLICE_PASS`、exit 0，但 `s02Gate=NOT_MET`；后三个
预期 FAIL、exit 42。其余精确行可用同一 CLI，按行成对替换
`--input tests/fixtures/semantic-facts/<fixture>.json` 与
`--queries tests/fixtures/semantic-facts/<fixture>-queries.json`；
`constructor-edges` 的修饰符／重载分别使用
`constructor-edges-supported-queries.json`／`constructor-edges-overload-queries.json`。

## 停止线

直接 `new` 只是窄切片。`new this()`、`super` 等更广构造调用形状、普通／alias
符号、implementations、跨模块 import/re-export、overlay 与配置变更、真实
Settings/API24 和 SDK、提取成本随规模增长及内存门禁尚未通过。v6 不能批准
S03 事实 schema、持久化、生产路由或默认策略；**S02 FAIL、S03 BLOCKED**。
