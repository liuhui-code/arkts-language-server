# S02：Settings/API24 生产宿主 stock oracle 对照

日期：2026-10-04。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；
分支 `codex/s05-definition-compiler-trace`。已有未提交改动保留；未提交、推送或合并。
**HomeInitData/MenuController 的既有 stock 对照通过；后续发现一个真实本地
依赖别名解析缺陷并修正。S02 总门禁仍 FAIL，S03 仍 BLOCKED。**

## 范围和 RED→GREEN

新增独立 `production-oracle` CLI 路由。它不使用旧的简化
`createSpikeProject` Host，而是复用生产 `SemanticDocumentStore.prepare(position,
true)`、`LocalPackageResolver`、`TypeScriptLanguageServiceEngine`、明确选择的 SDK
和 full ambient profile。完整 project membership 必须与磁盘 manifest 的列出文件
逐路径相等；任一未列源码、SDK 不可用、查询不完整、引用越界或源码摘要变化均
失败，不把部分结果标记 `COMPLETE`。`productionApproved` 始终为 `false`。
原 `--mode oracle` 的简化 Host 及 `HOST_PARITY_NOT_MET` 输出保留，避免改写旧证据。

公开 CLI 测试先 RED：父修订上 `production-oracle` 为未支持模式，
`node --test tests/semantic-facts-disk-oracle.test.mjs` 为 3 PASS / 1 FAIL。
第二个 pin 工具先以明确的 `not implemented` stub 跑 RED，
为 4 PASS / 1 FAIL；不是缺 SDK、构建产物或文件路径。
最小实现后，双文件小工程和 API24 测试 SDK 的 references 精确；额外
`unlisted.ets` 被 membership mismatch 拒绝。pin 工具从同一生产文档存储发现
完整 membership，仅写相对路径和摘要，不复制工程源码。
SDK 声明及两个影响 ETS compiler options 的 SDK JSON 文件均在查询前后复核；
公开测试先证实仅修改 `oh-uni-package.json` 仍能通过旧声明摘要，再修复为拒绝输出。
项目 `build-profile.json5`/`oh-package.json5`/`oh-package-lock.json5` 的发现集合和
内容在 pin、查询前后复核；发现未锁定的 `oh_modules`/`node_modules` 直接失败。
公开测试验证项目 manifest 改动不会冒充精确结果。
聚焦 `node --test tests/semantic-facts-disk-oracle.test.mjs
tests/semantic-facts-spike.test.mjs tests/test-layer-manifest.test.mjs` 为
最终 **19/19 PASS**；生产 oracle 单文件公开测试 **5/5 PASS**。
`pnpm check` 和脚本入口独立类型检查通过。完整 `pnpm check:fast`
在允许 macOS 只读进程采样的环境中 **1,251/1,251 PASS**。
受限沙箱阻止 `/bin/ps`，使 prepared-suite/replay 的外部 RSS sampler
在 initialize 前等待 10 秒并假失败；相同的聚焦用例在可采样环境约 1 秒通过。
没有因此调宽 timeout 或跳过测试。
脚本入口 `.ts` 不在根 `tsconfig.json` 的 `src/**/*.ts` 范围内；另以相同
`strict`/NodeNext/ES2022 选项单独执行 `pnpm exec tsc --noEmit`，exit 0。

## 原始工程和结果

| 项目 | 固定值 |
| --- | --- |
| Settings checkout | `.bench/real-projects/settings-ecc550`，`ecc550dfaed880e04e38a2477eb7235cd50475b9`，前后 clean |
| SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`；API 24、ETS `6.1.1.125` |
| SDK declaration digest | `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`，由现有 `digestSdk()` 重新计算并与锁文件一致 |
| SDK compiler-options digest | `cacbef6c2a2ca62348931e16ea042726be47adf9b418aa1b26e667cfcc156dfa`；覆盖 `ets/oh-uni-package.json` 和 `ets/build-tools/ets-loader/tsconfig.json` 的存在性与字节 |
| project configuration digest | `126150e81d0bcf19653a44e62f4aabbde5912fd74c765283a5f37b049bbee515`；当前干净 Settings checkout 无安装依赖 |
| Node | `v26.3.0`，macOS |
| compiler | 安装的 `ohos-typescript@4.9.5-r10`（依赖名 `typescript`） |
| compiler runtime SHA-256 | `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| lockfile SHA-256 | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |
| 原始目标 | `common/src/main/ets/sendable/HomeInitData.ets`，`HomeInitData` 声明，UTF-16 零基 `16:13` |
| membership | 生产 DocumentStore 枚举 1,496 源文件；listed-source digest `8c7a89c217dffe5587d1b3dfd7d19a42774cbcf4f88694cb2aecda7e5fc03b0e` |
| 输入 | `.bench/semantic-ready-s02/settings-homeinitdata-production-oracle-project-pinned-20261004.json`；manifest SHA-256 `723d714c62624ae2ad1aa3da7e50b07a77ea08a89fdac0ae38b8a9e92e69c3d3` |

实际运行的单进程双查询：排除声明得到 9 个 Location、包含声明得到 10 个。
与已有的 `settings-homeinitdata-api24-no-declaration.json` 和
`settings-homeinitdata-api24-with-declaration.json` 按
`(workspace-relative path, start/end line/UTF-16 character)` 集合比较，分别
**missing=0、extra=0**，不是只比数量。查询未修改原工程。

本次 stock Program 观察到 2,261 个 SourceFiles，其中 1,496 个工程文件、
652 个 SDK SourceFiles；仅 1 个 SDK ambient *root* 引入其余声明。
最终补强后的两个查询合计约 7.681 秒，进程 high-water RSS 770,244,608 字节。
这些是独立 oracle 工具的进程指标，**不是**生产 LSP 的请求 P95 或外部采样峰值，
不能据此宣称 500 ms、50% 内存门禁或原 >3 GB 复现通过。

### MenuController constructor 真实目标

同一 clean Settings checkout、API24 SDK 和默认工程选择下，另以
`common/src/main/ets/core/controller/MenuController.ets` 中的构造调用
`new MenuController(menu)` 为目标：UTF-16 零基 `90:17`，
`includeDeclaration=false`。这不是 `MenuController` 类声明光标 `70:13`。
pin 输入为 `.bench/semantic-ready-s02/settings-menucontroller-production-oracle-project-pinned-20261004.json`，
查询列表为 `.bench/semantic-ready-s02/settings-menucontroller-production-queries-20261004.json`；
生产 DocumentStore 仍发现 1,496 个源码成员，源码、SDK 声明／编译选项和项目配置摘要
与上表相同。独立 stock compiler 返回 **267 个完整 Location**，与已有已核验
`bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json`
按相对路径及 UTF-16 起止位置 exact 比较：**missing=0、extra=0**。

本次单查询 stock Program 为 2,261 个 SourceFiles（1,496 工程、652 SDK、
113 其它）；耗时 7,975.3 ms，进程 high-water RSS 为 785,113,088 字节。
这仍只是独立 stock oracle 指标，不是生产 LSP P95 或外部 RSS 峰值，
也没有测 `includeDeclaration=true` 的构造函数目标。
可用以下命令重放已 pin 的输入；pin 工具不会覆盖已有 manifest：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-oracle \
  --input .bench/semantic-ready-s02/settings-menucontroller-production-oracle-project-pinned-20261004.json \
  --queries .bench/semantic-ready-s02/settings-menucontroller-production-queries-20261004.json
```

这消除了该目标 **stock 半边**缺少生产 Host 基线的障碍；不能单凭
267/267 推断 hook parity 或 S02 PASS。

### 同宿主隔离 hook 提取

新增公开 `production-extract` CLI 路由，以 pin 的 schema-v2 工程输入驱动隔离
v6 compiler hook；stock oracle 继续由安装的原版 compiler 独立运行。
小型 pin 的 SDK／工程 fixture 先有公开 CLI RED，再实现为 GREEN：修正隔离
bundle 的默认 lib 路径，使 hook 与 stock 的 Program SourceFile 数从原先的
55 对 3 恢复一致；排序后的 Program roots 与 compiler options 的 SHA-256
也逐项相等。构造器 facts-only 查询与 stock 精确，磁盘 oracle 聚焦测试
**6/6 PASS**，`pnpm check` PASS。这个小 fixture 通过不代表真实工程通过。

真实 Settings 用同一 production Host 输入边界，从 clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`
checkout pin 出 1,496 个工程成员：
`.bench/semantic-ready-s02/settings-menucontroller-production-hook-pinned-20261004.json`。
本轮隔离 hook bundle SHA-256 为
`c05ec5eea6c50f3adc1eeb9c16cf80b9bec67f5978cc4c6f4318aa6ec9271621`。
该**新 seed-pinned manifest 本身**另在独立 stock 进程重放同一构造光标：
267/267 exact，missing/extra 均 0；Program 2,261 SourceFiles（1,496 工程、
652 SDK），耗时 8,212.0 ms、进程 high-water RSS 729,661,440 字节。
它与上一 stock 进程的 7,975.3 ms／785,113,088 字节是两次独立观测，
均不是 P95，也不能与失败的 hook 提取直接作内存收益比较。
相比之下，hook 完整提取约 10.5 秒后，CLI **exit 42，`FAIL/HOOK_UNSUPPORTED`**，原因
`ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN`。失败证据保存在
`.bench/semantic-ready-s02/settings-menucontroller-hook-extract-20261004.json`；
没有生成可供事实查询的 facts，也未返回部分成功。
不覆盖既有证据的失败重放命令（预期 exit 42）：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-extract \
  --input .bench/semantic-ready-s02/settings-menucontroller-production-hook-pinned-20261004.json \
  --compiler-artifact .bench/semantic-ready-s02/usage-v6-production-20261004.cjs
```

因此当前只能确认 stock 对该构造光标是 267/267 exact；尚不能确认
Settings hook 同样精确，更不能比较 hook 的提取成本／峰值与任何发布内存门禁。

### 首个真实提取失败的定位（诊断切片）

在相同的 clean Settings checkout、API24 SDK 和 seed-pinned 1,496 文件输入上，
新增**仅失败时**的 origin 诊断；原 `HOOK_UNSUPPORTED`、exit 42 和无 facts 的
fail-closed 行为不变。公开 CLI 测试先因失败产物缺少 `failureDetail` 为 RED，
再以小型 SDK 外部定义 fixture 达到 GREEN；相关测试 23/23、`pnpm check`
通过。失败详情只包含 workspace/SDK 相对路径或外部路径的短哈希、数值 span，
不记录源码或外部绝对路径。

真实回放使用输入
`.bench/semantic-ready-s02/settings-menucontroller-production-hook-pinned-20261004.json`
（SHA-256 `976d4969f771f9ef82be3cd78b7b5da87ffba22c89ce7817bdff7f74fb43cc04`）、
新建的隔离 bundle
`.bench/semantic-ready-s02/usage-v6-origin-diagnostic-20261004.cjs`
（SHA-256 `7fa2db1ddfc63a24f829539312195fdd98de4360450136ea66501469b425c47c`），
输出 `.bench/semantic-ready-s02/settings-menucontroller-origin-diagnostic-20261004.json`
（SHA-256 `0ad5c296eb1d993d7b037518ec43ff5d1b3298ce234e437bdd1087d305fd264e`）。
重放命令：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-extract \
  --input .bench/semantic-ready-s02/settings-menucontroller-production-hook-pinned-20261004.json \
  --compiler-artifact .bench/semantic-ready-s02/usage-v6-origin-diagnostic-20261004.cjs \
  --out .bench/semantic-ready-s02/settings-menucontroller-origin-diagnostic-20261004.json
```

该命令预期仍 exit 42；重放时须将 `--out` 换成尚不存在的文件，
CLI 会拒绝覆盖既有证据。
首个失败为 `OUTSIDE_SEARCH_ROOTS`：selection 是
`common/src/main/ets/ability/AbilityContextManager.ts` 的 UTF-16 `27:41`
处 `new Array()`，源偏移 968、长度 5；definition 的外部身份哈希
`c0b64ca1a0e355a3` 与本机已锁定 `ohos-typescript@4.9.5-r10` 的
`lib.es5.d.ts` 路径匹配，definition span 为偏移 57143、长度 5。
这表明首个障碍是**编译器标准库 origin 不在项目搜索根中**，并非已证明的
SDK 组件声明问题。直接把外部定义加入 roots 也不能算修复：当前 origin
worklist 只接受 constructor/class 来源，facts 转换仅接受被固定的工作区文件，
生产 references 对工作区外结果另有不完整性边界。此回放未生成 facts，
不能推断 MenuController 267 个引用的 hook 等价性、提取资源或 S02 通过。

### 外部 origin 保守降级切片与真实工程复核

再用同一生产宿主小 fixture 同时包含本地 `Local` 构造器及标准库
`new Array()`。公开 CLI 先 RED：原 hook 对外部 origin 使整次提取 exit 42，
没有可验证的本地 facts。隔离 v6 worklist 随后只将外部 origin 的 selection
标为 `OUTSIDE_SEARCH_ROOTS`／未知；该 selection 的 facts-only 查询明确返回
`UNSUPPORTED`，**不是**完整的空引用。本地 `Local` 的
`includeDeclaration=false/true` 两组结果均与独立 stock oracle 的完整位置集
精确相等。混合提取仍以 `FAIL/PARTIAL_UNSUPPORTED`、`coverage:PARTIAL`、
`productionApproved:false` 和 exit 42 标记，只有局部实验事实可供差分；
外部-only 旧用例仍 exit 42 且没有 facts。三组聚焦测试 24/24、`pnpm check`、
`git diff --check` 通过；三份手写文件分别 452／431／300 行。未修改生产路径。

在**同一** clean Settings/API24 1,496 成员输入上构建新的隔离 bundle
`.bench/semantic-ready-s02/usage-v6-partial-unknown-20261004.cjs`
（SHA-256 `c0aaf33ffee4fa5fc23d90afd9c9e9b7b89a9446fdbad46b88be6d090bf052b5`）
并重新运行 `production-extract`。产物
`.bench/semantic-ready-s02/settings-menucontroller-partial-unknown-20261004.json`
（SHA-256 `523314ee789e723eb0047af2ffd2a7feaf1d6fa02a3d5425b8cccec33291d3ec`）
仍为 exit 42／`FAIL/HOOK_UNSUPPORTED`、**无 facts**；这次首先遇到的是
`ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH`。因此小 fixture 的局部事实
精确不等于 Settings 整体提取进展；本轮没有 MenuController hook 267-location
差分、提取阶段内存曲线或新生产能力。不可把下一失败靠按名称/语法特判跳过；
若再研究，先定位该 compiler definition 的真实节点类型和查询覆盖语义。

### `ADJUSTED_BRANCH` 的宿主缺陷与修正

隔离 hook 的首个 `ADJUSTED_BRANCH` 在
`feature/developeroptions/src/main/ets/controller/UsbDebugSwitchController.ets`
的 `new DialogPage`，UTF-16 零基 `203:25`。当时 stock compiler 仅返回同文件
import specifier `32:2`，排除／包含声明时分别只得同文件 2／3 个位置。
**这不是可信的完整语义 oracle**：该文件的已声明本地依赖键是
`@ohos/settings.uikit`，目标 `file:` 包 manifest 名为 `uikit`；生产
`LocalPackageResolver` 错误要求两者相等，使真实 import 报 TS2307。
OpenHarmony 的[依赖别名说明](https://github.com/openharmony/docs/blob/master/en/application-dev/arkts-utils/arkts-dynamic-import.md)
将依赖键作为导入别名，目标名相同只是建议；本项目仍以真实 LSP 测试验证
所需的静态子路径导入，而非仅凭该动态导入文档推断全部行为。
先前 CLI 标记的 `COMPLETE` 只表示其查询执行完毕，不能证明解析正确。

真实 stdio LSP 的最小 Settings 式 fixture 先稳定 RED：definition 错指本文件
import binding，正常诊断有 TS2307。只对**已声明的相对／`file:` 本地依赖**
放宽子路径 target-name 相等条件后，同一 LSP 测试 GREEN：definition 指向
目标 `DialogPage` class，TS2307 消失。安装包仍要求名称相等，未声明依赖、
路径穿越及包外 symlink 的负向测试保持通过。这个修复没有改变 index 的
最终语义权威或 references 默认策略。

使用同一锁定输入（SHA-256
`976d4969f771f9ef82be3cd78b7b5da87ffba22c89ce7817bdff7f74fb43cc04`）
和两策略 query manifest
`.bench/semantic-ready-s02/settings-dialogpage-production-queries-20261004.json`
（SHA-256 `1f0413504e1f108e8021d50e8ef7e08974a8a96b728d54f92f9f5f5df1bb6e21`）
重放修正后的生产宿主 stock oracle：排除声明为 **30 个位置／24 个文件**，
包含声明为 **31 个位置／24 个文件**，后者包含
`feature/uikit/src/main/ets/menus/Menu.ets:4689:2` 的显式
`constructor` 关键字（class 名称在 `4688:13`）。
Program 仍为 2,261 个 SourceFiles；独立进程单次双查询约 8.014 秒、
进程 high-water RSS 777,752,576 bytes。这不是 LSP P95 或外部 RSS 峰值。
进一步的真实 stdio LSP fixture 在独立 `legacy`／默认进程中分别查询
`includeDeclaration=false/true`，规范化 URI＋UTF-16 范围为 3／4 个位置，
两策略逐位置 exact；包含声明时既有 `uikit` class，也有 entry import／调用
和 re-export。原生 SQLite catalog 已 ready，两次请求均接受 index，fallback=0；
definition 指向目标 class，正常诊断无 TS2307。这个小 fixture 的 index
差分不能替代真实 Settings 30／31 个位置的默认策略 LSP 差分。
同一真实 stdio fixture 改为显式 `constructor()` 后，legacy 与默认策略的
两种声明策略仍逐位置 exact，跨模块调用未丢失，诊断仍无目标 TS2307；
但默认策略两次均报告 `candidate-ineligible`、index accepted=0，安全地走
完整保守回退。这固定了当前能力边界，不把安全回退误报为索引准入。
修复后另以同一固定 Settings 输入重放原 HomeInitData 两策略和
MenuController 构造 no-declaration oracle，仍分别为 9／10／267 个位置，
与各自既有 golden 的 missing/extra 均为 0；这些是三个独立 stock 检查，
不代表真实工程所有导入或生产默认 indexed 路径已经验收。

真实工程的公开 LSP 差分随后使用修正后的两个 DialogPage/API24 精确
oracle。每种声明策略各在新的 legacy／默认进程中执行一次
`didOpen → textDocument/references`，保留正常自动诊断和原生索引。
`includeDeclaration=false` 两策略各返回 **30 个有效 Location**；
`includeDeclaration=true` 各返回 **31 个**，包含目标显式构造函数关键字。
四次结果与对应 stock oracle 的 URI＋UTF-16 范围均
**missing=0、extra=0**；每次均有 15 个诊断，其中目标
`@ohos/settings.uikit` 的 TS2307 为 0。旧“仅 2／3 个本地引用”的错误
确已在真实 LSP 消失。这是 Settings/API24 的精确差分，不冒充 DevEco
或项目所声明 API23 SDK 的等价结论。

这也暴露出单次冷请求的性能失败：legacy 请求 **8,037 ms**、产品进程树
外部采样峰值 RSS **827,109,376 B**；默认 indexed-batched 请求
**93,298 ms**、峰值 **789,233,664 B**。默认路径日志为
`references.index.fallback: candidate-ineligible`，实际执行完整保守批处理；
它不是 indexed proof 被接受的 30-location 真实工程案例。两份原始时间线／
50 ms RSS 样本保存在 `.bench/semantic-ready-s02/settings-dialogpage-lsp-{legacy,indexed}-20261004.json`。
包含声明的独立进程回放中，legacy 请求 **9,317 ms**、外部采样进程树
峰值 RSS **832,028,672 B**；默认 indexed-batched 请求 **94,639 ms**、
峰值 **799,465,472 B**。默认路径仍为同一 `candidate-ineligible` 完整
回退，index accepted=0。原始报告位于
`.bench/semantic-ready-s02/settings-dialogpage-lsp-with-declaration-{legacy,indexed}-20261004.json`。
这些均为单次进程观测，不能外推 P95、50% 内存门禁或 500 ms 达标。
为拆解约 94 秒冷延迟，另在新进程打开 trace 并用同一 30-location
oracle 回放一次：结果仍 30/30 exact、15 条正常诊断，请求
**95,401.63 ms**、外部采样产品进程树峰值 RSS **765,558,784 B**。
`candidate-ineligible` 后的保守计划覆盖 1,496 个 member/candidate 文件，
顺序运行 **24 个 transient-worker batch**，没有 semantic-unit expansion。
24 批总耗时 91,014.69 ms，其中 Program ready 合计 81,733.91 ms，
`createProgram` 计时合计 68,680.45 ms；worker startup 合计 5,748.20 ms，
compiler 引用查询合计 2,133.18 ms。candidate selection 为 4,306.98 ms
（其中 anchor resolve 2,745.09 ms），计划 18.23 ms、合并 0.4 ms。
每批 Program 为 599–1,237 个 SourceFiles，原始 191 个 batch Location 合并
为 30 个唯一结果。`getProgram` 与 `createProgram` 计时嵌套，不能相加；
`getTypeChecker` 调用计时约 0.41 ms 不能解释为整体类型检查零成本。
这一次因果归因是**24 次重复 compiler 准备**，不是单个巨大 batch
或 `findReferences` 本身。原始逐阶段 trace 和 50 ms RSS 样本在
`.bench/semantic-ready-s02/settings-dialogpage-lsp-indexed-trace-escalated-20261005.json`。
重放默认路径（将 `--strategy` 改为 `legacy` 可复现对照）：
`--out` 必须指定一个尚不存在的结果文件；下面是一次新回放的示例路径。

```sh
node scripts/bench/replay-references.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file feature/developeroptions/src/main/ets/controller/UsbDebugSwitchController.ets \
  --symbol DialogPage --line 203 --character 25 \
  --oracle bench/references/oracles/settings-dialogpage-api24-no-declaration.json \
  --out .bench/semantic-ready-s02/settings-dialogpage-lsp-indexed-new-run.json \
  --mode A --strategy indexed-batched --exclude-declaration \
  --catalog-state ready --idle-ms 0
```

下一项性能诊断是定位 `candidate-ineligible` 的具体 index/proof 条件，
建立公开 LSP RED，再评估安全修复；不能直接降低合法搜索范围或按名称放行。
只读追踪已将它精确定位：index catalog ready、查询 generation 与已提交
generation 均为 1，但返回 `supported=false`、`complete=false`、无
`declarationIdentity`。实际 anchor 是显式构造函数关键字 `4689:2`，
SQLite 的 export 行覆盖 class 名称 `4688:13`，现有直接 import fallback
也不适用于该构造位置。因此候选接口返回 unsupported，planner 按合同进入
完整保守范围。不能把构造函数位置直接改成同名 class export 行：继承、
`new this` 与显式 constructor barrier 可使两种语义搜索范围不同。
显式构造器与别名依赖的公开 stdio LSP fixture 已固定 legacy 精确位置
和当前完整 fallback；后续仍需先证明 compiler-verifier 锚点身份及继承／
`new this` 边界，再考虑 index 准入。目前没有可证明安全的准入修复。
可重放：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-oracle \
  --input .bench/semantic-ready-s02/settings-menucontroller-production-hook-pinned-20261004.json \
  --queries .bench/semantic-ready-s02/settings-dialogpage-production-queries-20261004.json
```

因此旧的 2／3 本地位置不得用于 hook 差分；下一次隔离提取须使用修正后的
stock exact set，确认真实工程完整提取与成本。此前 `ADJUSTED_BRANCH` 是在
错误解析宿主上观察到的失败，不应继续被视为独立的 compiler 语义反例。
使用原隔离 v6 bundle 和修正后的生产 Host 重新提取，仍以 exit 42／
`ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH` fail-closed，没有 facts。
原错误产物只保留原因，丢弃失败 selection/definition；5,121 个候选中
`DialogPage` 排第 815，不能认定重跑仍在同一符号失败。随后先建立公开
CLI RED，再增加默认关闭的 `ARKTS_S02_FAILURE_DETAIL=1` 脱敏观测：状态
仍为 exit42／`HOOK_UNSUPPORTED`、无 facts，flag 关闭时不输出该详情。
使用同一 Settings 输入的新产物
`.bench/semantic-ready-s02/settings-adjusted-detail-20261005.json` 表明首个
失败选择实际是 `feature/uikit/src/main/ets/component/MenuCustomComponent.ets`
中的 `new CustomUiInfo`（零基 UTF-16 `778:42`，offset 28821、长度 12），
compiler definition 指向同文件 import binding（`19:9`，offset 826、长度 12）。
固定 checkout 的 `feature/uikit/oh-package.json5` 声明了版本依赖
`@ohos/mpchart: 3.0.15`，该文件从其子路径导入 `CustomUiInfo`；但当前
checkout 没有任何 `oh_modules`／`node_modules` 目录。真实 LSP 对这份文件
的正常 `didOpen` 发布了 4 条相应 TS2307，零基 UTF-16 import 范围为
`19:29–86`、`20:26–87`、`21:22–87`、`22:27–88`。因此先前猜测的
`DialogPage` 不是首次失败者，而此 `CustomUiInfo` 失败属于**依赖未安装
的测试环境**，不能据此归咎 hook 的已解析语义；当前文件也不能作为 S02
完整语义 oracle。其他已验证目标的 exact 结果不因此作废。即使将来补齐
锁定依赖，仍须证明安装包及其声明进入允许的语义范围，并重新检验
alias→构造器身份。本轮只增加诊断，不按名称特判或更改 hook 提取结果。

为验证环境判断，另从同一 `ecc550df...` commit 建立独立、未改源码的
`settings-ecc550-deps` checkout，使用 Mac 上的 `ohpm 6.1.2.268` 从官方
registry 执行 `install --all`，成功安装工程声明的
`@ohos/hypium@1.0.16`、`@ohos/lottie@2.0.23`、
`@ohos/mpchart@3.0.15`。根、uikit 和 phone 的生成 lockfile SHA-256
依次为 `5fe2f1cf84552f3d086d1c0fbe524bea3382846e6731ef092c00901661a638b5`、
`6fa1bb01540bfafa9de4f5a3aa917e10ea31d81f712f9410d5fee2f743d8a809`、
`abf92766b9a928adc34f430ce5a02e56e736d7d93976eff092d65e85a9e5e4cd`。
原始 checkout 未动；安装依赖的 checkout `git status --short` 仍为空。
在该新 checkout 中，真实 LSP 打开同一文件后，四条 mpchart TS2307 全部
消失（总诊断 10→6）；`new CustomUiInfo` 的 definition 落到已安装的
`oh_modules/.ohpm/@ohos+mpchart@3.0.15/.../customUiData.ets:29:2–49:3`。
这支持“原失败由缺少安装包触发”，但不能证明整个 hook 已满足 full coverage。
现有 `pin-production-workspace.mjs` 对任何 `oh_modules` 明确拒绝：对这个
安装后 checkout 实跑 exit2，`installed dependencies are not pinned`，没有
产生 manifest。随后以公开 CLI RED→GREEN 增加**显式**
`--pin-installed` v3 模式，默认 v2 模式继续拒绝安装目录。v3 对安装目录
文件字节、链接原文及受控物理目标、声明本地包目标树、owner manifest 与
registry lock 行做有界摘要，并在 stock 查询前后重算；越界／损坏链接、
未固定目标、缺 owner/registry lock、lock／内容漂移均拒绝。安全复核发现并
修复了 registry 链接指向未哈希目录、本地无 lock 的目标字节未 pin、
本地包 `.git` 入口及无安装链接的 `file:` 依赖漏扫，均有公开负向测试。
同 SHA 的安装后 Settings 在 v3 下成功 pin（1,496 个工程 member），
其 `DialogPage` 生产宿主 stock 查询仍为 30／31 个引用。随后对排除／包含
声明两组结果做 URI＋UTF-16 逐位置差分，与既有 30／31 oracle 均
`missing=[]`、`extra=[]`；这只证明
**环境固定＋stock 半边**，不证明包源码已成为完整 hook facts 或 S02 PASS。
固定输入为
`.bench/semantic-ready-s02/settings-dialogpage-installed-v3-20261005.json`，
manifest SHA-256 `86dbf491ad3937dd7b70e56ad9e839cd6a5099d6e9cd2359a6a19a55f793a8cb`，
installed dependency digest
`fe8fbc78776ca38813fc7396de7c11d493a15340d05f383bf75d84dfa62d3817`。
可重放命令：

```sh
node scripts/semantic/semantic-facts-spike/pin-production-workspace.mjs \
  --workspace .bench/real-projects/settings-ecc550-deps \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file feature/developeroptions/src/main/ets/controller/UsbDebugSwitchController.ets \
  --out .bench/semantic-ready-s02/settings-dialogpage-installed-v3-20261005.json \
  --pin-installed
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-oracle \
  --input .bench/semantic-ready-s02/settings-dialogpage-installed-v3-20261005.json \
  --queries .bench/semantic-ready-s02/settings-dialogpage-production-queries-20261004.json
```

pin CLI 故意不覆盖已有输出；重 pin 须把 `--out` 和随后的 `--input`
一起改成新路径。公开 CLI
`tests/semantic-facts-installed-package-scope.test.mjs` 先 RED：stock compiler
已追入 `local-widget/index.ets`，但 oracle 报 `outside pinned membership`。
GREEN 实现对 v3 pin 的包文件另建语义集合：只接纳实际进入 Program、物理
位置在已验证包根内、源码文本和哈希一致的 `.ets/.ts`。工程 membership 不变，
hook 的项目 query-selection roots 与项目＋包 search roots 分离。测试要求
`selectionSourceFiles=1`、`indexedSourceFiles=2`，所有 selections 仅在工程
文件，包内构造器不成为新查询目标；同时 stock／facts-only 在排除／包含
声明两种策略的 URI＋UTF-16 位置完全一致。一个同名同版本的游离实体包
曾可借用 lock 行取得 pin；公开负例先 RED，再约束它必须处于精确规范
registry store 路径，现在 GREEN。默认 v2 继续拒绝安装依赖。
聚焦公开测试（installed scope、installed pin、disk oracle、worklist hook）
45/45 PASS；`pnpm check`、`pnpm build` 与 `git diff --check` PASS。
更新实验 hook 后，首次完整 `pnpm check:fast` 仅因 v4 bundle 的旧固定
SHA-256 断言失败；刷新该确定性断言后，同一当前工作树完整快速门禁
**1282/1282 PASS、exit0**。这不替代真实 Settings S02 全等价或内存门禁。

随后重放真实安装后 Settings：实验 v6 artifact
`.bench/semantic-ready-s02/usage-v6-selection-split-20261005.cjs` 的 SHA-256 为
`02a8ed2376f78393fb03a8fe7abcb3eaff7f0807266bc3f921e0351c9a839ba3`。
执行：

```sh
ARKTS_S02_FAILURE_DETAIL=1 node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-extract \
  --input .bench/semantic-ready-s02/settings-dialogpage-installed-v3-20261005.json \
  --compiler-artifact .bench/semantic-ready-s02/usage-v6-selection-split-20261005.cjs \
  --out .bench/semantic-ready-s02/settings-installed-split-hook-20261005.json
```

15.36 秒后明确 exit42 `HOOK_UNSUPPORTED`／
`ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH`，无 facts。失败输出 SHA-256
`3db35b48e64b1441b74bd5bd741831f3a28dd3b4911ece1b54a333956434f055`；
首个失败 selection 位于
`product/phone/src/main/ets/Setting/Touchpad/view/TouchpadPointerSpeedComponent.ets`
offset 1044／length 30，definition 为同文件 offset 726／length 30。
继续只读核查发现该位置是 `new TouchpadPointerSpeedController()`，定义是
同文件 `import { TouchpadPointerSpeedController } from
'../controller/TouchpadPointerSpeedController'` 的 import binding。固定 commit
及安装后磁盘均没有相对目标 `.ets/.ts/.d.ets/.d.ts/index.ets`；真实子进程
LSP `didOpen` 报 TS2307，UTF-16 范围 `15:47–15:93`。因此这又是未解析
导入的环境不完整案例，**不是**已证明的完整语义 hook 反例。hook 对非
constructor/class 的 import binding 拒绝并未发布部分 facts。绝不能把小
fixture GREEN 当成 S02 PASS。安装目录仍不
进入普通 ProjectMembership；真实 Settings 的 `source-unavailable` 也尚未
证明由该包边界直接触发。
安装后对同一真实文件的 `new CustomUiInfo` 作探索性公开 LSP references：
包含／排除声明均返回 `-32803 References require a complete workspace
snapshot`，没有 `Location[]`，请求分别约 4.1／6.0 秒。日志显示 document
prepare 的 project membership 为 complete、1,496 文件；原生 catalog 在
索引 1,846 文件后 degraded、跳过 35 项，index proof unsupported/partial，
安全 fallback 计划 24 批。两次请求都只记录第 0 批 `batch.start`，随后
直接 `request.completed`，没有 batch fail 原因或错误类型。虽然包源码不在
ProjectMembership 枚举内，原有日志**不能证明**它直接触发此错误。此请求
是明确失败，不能误报为零引用或成功的完整结果。
随后以公开 LSP RED→GREEN 添加仅在 `ARKTS_REFERENCES_TRACE=1` 时的
`references.batch.incomplete` 事件；trace 关闭时无新事件，LSP 错误行为
不变。安装后 Settings 的一次新进程回放显示第 **0/24** 批失败原因为
`source-unavailable`，请求约 **6,094 ms**，仍返回 `-32803`、无 Location。
该批 Program 853 个 SourceFiles（335 project、405 SDK、113 other），
`createProgram` 3,556.5 ms、引用查询 53.7 ms、整批 4,457.6 ms。
事件只输出枚举原因和计划计数，不输出源码／完整路径；因此仍未识别
具体缺失的 source，不能把 `source-unavailable` 自动等同于 mpchart 包。
S02 仍 FAIL、S03 仍 BLOCKED；修正宿主不等于 hook 毕业。

可重放命令：

```sh
node scripts/semantic/semantic-facts-spike/pin-production-workspace.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --out .bench/semantic-ready-s02/settings-homeinitdata-production-oracle-project-pinned-20261004.json

node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode production-oracle \
  --input .bench/semantic-ready-s02/settings-homeinitdata-production-oracle-project-pinned-20261004.json \
  --queries .bench/semantic-ready-s02/settings-homeinitdata-production-queries-20261004.json
```

pin 命令故意拒绝覆盖已有 manifest；重放时需将 `--out` 和 `--input`
同时改成一个尚不存在的路径。最终 `git diff --check`、Settings checkout clean
和所有本切片手写脚本/测试不超过 500 物理行，另行复核。

## 停止线

`PRODUCTION_HOST` 只说明此 stock oracle 在**默认工程选择、无 overlay**下复用
了生产文档存储和语义引擎，并在此目标上与真实 LSP golden 精确一致；manifest
目前没有编码 product/target/editor project selection，不能推广为任意配置
或未保存状态的宿主等价。项目配置 pin 仅覆盖本工具支持的默认工程选择；
默认 v2 遇安装包即拒绝，显式 v3 可固定安装环境但尚未放行包源码
facts。SDK 声明、ETS compiler
options 和上述项目配置已由 CLI 在查询前后校验。本次固定 Settings checkout
的 Git HEAD 和 clean 状态另经外部复核；CLI 尚未把 Git revision 或编辑器选择
锁进 manifest。

实验性 v6 hook 现已能消费同一生产工程宿主／锁定输入，并在小 fixture
上与 stock 精确；但真实 Settings 提取明确 `HOOK_UNSUPPORTED`，此前
`new Alias()` 及非构造查询的反例亦未解除。下一硬门是先解决该真实
提取失败，再验证 MenuController constructor 的 267-location hook 差分及
其它必测种类、overlay、SDK 和资源。没有完整 S02 等价性与成本证据，
**不得进入 S03 或改生产默认路径**。
