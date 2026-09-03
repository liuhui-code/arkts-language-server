# ArkTS Language Server 功能完备度与 E2E 执行计划

状态：Approved for execution  
基线：`integration/local-beta@ef8ab9533a97ebd000318435a56d8dba895b5488`  
计划分支：`plan/lsp-completeness-e2e`  
日期：2026-09-03  
优先级：功能正确性与完备度 > 发布产物一致性 > 大项目时延与内存

## 文档变更的 TDD 例外

- 原因：本提交只新增执行计划，不改变运行行为。
- 影响范围：仅本文件。
- Owner：ArkTS Language Server maintainers。
- 到期日：2026-09-10；从第一个实现任务起恢复严格 RED → GREEN。

## 1. 目标与成功定义

本计划要把当前“若干真实进程测试 + 单独发布脚本”收敛成一条可重复、
可诊断、能阻止回归的交付链：

```text
能力契约
  -> 真实 stdio LSP E2E
  -> 一次构建、一次打包
  -> 干净环境验证同一份产物
  -> 大型项目功能/时延/内存门禁
  -> 原样发布已验证的 bytes
```

完成本计划必须同时满足：

- 每个 advertised capability 都有真实子进程、`Content-Length` stdio transcript；
- 核心用户路径在源码 bundle 和安装后的不可变产物上运行同一套场景；
- 未实现的能力绝不 advertised；新增能力必须先出现稳定 RED transcript；
- completion、definition、diagnostics、hover、signature help、document symbols、
  workspace symbols、references、prepare rename/rename、code actions 达到下文的
  最小功能契约；
- CI 只构建一次，测试、安装和发布使用同一 artifact digest；
- 失败时保留 LSP transcript、进程退出信息、日志、索引状态和资源采样；
- 功能门禁全绿之后，大项目性能和内存阈值才具有发布阻断权。

非目标：本阶段不实现 SSH/remote、不实现自动更新器、不更换 `node:test`、
不为了测试重写整个语义内核，也不以 snapshot 全量输出替代精确行为断言。

## 2. 当前基线与已确认缺口

现有测试有一个重要优点：多数语义测试已经启动真实 `dist/server.cjs`，通过
真实 LSP framing 通信。问题不是“完全没有 E2E”，而是边界没有闭环：

1. `LspProcess` 对异常退出、协议错误、超时 waiter、bounded shutdown、双向
   JSON-RPC request id 和 progress token 的处理不可靠；扩大并发会放大假红/假绿。
2. 语义 fixture 分散，缺少固定 SDK、Harmony module、ArkUI DSL、未打开文件、
   non-BMP UTF-16、edit-apply-recheck 等统一 corpus。
3. completion 只验证 label；completion resolve/auto-import 尚未暴露；definition
   返回零长度 range；references、rename、code action 尚未形成公共能力。
4. installed artifact 只完整验证 workspace symbol；用户最常用的 completion、
   definition、diagnostics 等没有跨越安装布局边界。
5. release gate 会重复构建；CI 不上传可晋级的不可变 artifact，因而“测试通过的
   bytes”不等于“GitHub 发布的 bytes”。
6. 455 文件项目主要验证 catalog/workspace symbol；尚未验证索引期间的交互语义、
   RSS/heap、取消延迟和编辑 churn。

## 3. 测试体系目标结构

### 3.1 测试层级

| 层级 | 目的 | 允许替身 | PR 门禁 | 典型命令（目标） |
|---|---|---:|---:|---|
| L0 unit/contract | 纯转换、解析、状态机、端口契约 | 是 | 是 | `pnpm test:unit` |
| L1 protocol | scripted backend 的取消、新鲜度、shutdown | backend 可 scripted；进程必须真实 | 是 | `pnpm test:protocol` |
| L2 bundle E2E | production bundle + 固定微型 Harmony corpus | 不允许 semantic mock | 是 | `pnpm test:e2e:bundle` |
| L3 artifact E2E | 安装后的 release artifact + real sidecar | 不允许 rebuild/mock | 是 | `pnpm test:e2e:artifact` |
| L4 large/host | 固定大型项目、资源门禁、真实 Zed host | 不允许 | PR smoke + nightly/RC | `pnpm test:e2e:large` |

`pnpm check:fast` 最终包含 L0、L1、L2；`pnpm check:release` 必须消费一次构建的
L3 artifact，并运行 L3、PR 规模的 L4。任何 required test 不得 silent skip。

### 3.2 统一微型 corpus

新增版本化 corpus：

```text
fixtures/conformance/v1/
├── corpus.json
├── workspace/
│   ├── build-profile.json5
│   ├── oh-package.json5
│   └── entry/
│       ├── build-profile.json5
│       ├── oh-package.json5
│       └── src/main/
│           ├── module.json5
│           └── ets/
│               ├── pages/Home.ets
│               ├── pages/ArkuiPage.ets
│               ├── pages/OtherConsumer.ets
│               ├── model/Profile.ets
│               ├── model/index.ets
│               └── services/Greeter.ets
└── sdk/openharmony/
    └── minimal deterministic SDK stubs
```

Corpus 规则：

- 使用 `/*@case.name*/` marker；materializer 复制到独立临时目录、剥离 marker，
  并以 JavaScript UTF-16 code units 计算 LSP position/range；
- 测试不得依赖本机 DevEco SDK、用户 HOME、repo cwd 或可变 cache；
- 只默认打开 `Home.ets`，其余文件用于验证 project file set 和 unopened files；
- 断言 required/forbidden candidates、symbol identity、URI、精确 range、code 和 edit，
  不 snapshot 全部 completion 或本地化错误文案；
- edit 类能力必须应用返回 edits，再用 diagnostics/definition/references 验证闭环。

### 3.3 统一真实进程驱动

`LspProcess` 和其上层 session 必须提供：

- 拆包/粘包、安全 UTF-8 framing；
- `response(id)`、`serverRequest(method)`、`notification(method)`、
  `progress(token)` 的无歧义匹配；
- spawn error、意外 close、截断 frame、非法 JSON 立即传播到所有 pending waiter；
- timeout 注销 waiter，close 幂等且有界，SIGTERM 超时后升级终止；
- stderr 有上限；错误携带 code/signal、最近收发消息、残留 frame；
- 初始化、shutdown/exit、临时 workspace、环境清理和 transcript 采集的公共 helper；
- 同一 conformance scenario 可接受 `bundle` 或 `installed artifact command` target。

### 3.4 不可变发布产物

发布链采用：

```text
build-artifact
  -> artifact-manifest.json + SHA256SUMS + archive
  -> artifact-basic-e2e（无源码、无 node_modules、禁止 build）
  -> artifact-large-e2e
  -> promote exact digest to GitHub Release
```

manifest 至少记录 commit、版本、平台、Node/Rust/pnpm toolchain、文件路径、size、
mode 和 SHA-256。installer 增加“从 artifact 安装/禁止构建”路径；acceptance 阶段
若触发编译应立即失败。

## 4. 基础功能完备度契约

### P0：发布前必须完成

- [ ] Lifecycle：initialize/open/incremental change/close/cancel/shutdown/exit。
- [ ] Completion：本地/继承/imported receiver、字段/方法、1–2 字符前缀、kind、
  ranking、精确 replacement range。
- [ ] Completion resolve：documentation/detail/opaque data；未打开文件 auto-import
  返回唯一 `additionalTextEdits`，应用后 diagnostics 为零。
- [ ] Definition：local/import/alias/barrel/unopened/跨 module；range 精确覆盖名称；
  UTF-16 non-BMP 前缀不漂移。
- [ ] Diagnostics：syntax/type/ArkTS DSL，code/severity/range/version；快速连改、close
  后不得发布 stale diagnostics。
- [ ] Hover/signature help：跨文件文档、overload、active parameter、trigger/retrigger、
  UTF-16 range。
- [ ] Document symbols：hierarchical/flat，并覆盖 contract 声明的 symbol kinds。
- [ ] Workspace symbols：catalog 中和 ready 后都可查询；overlay 优先；正确 kind/range；
  progress 按 token 匹配。
- [ ] References：`includeDeclaration` 两种语义、跨文件/重导出/unopened/overlay、
  精确完整 range、取消。
- [ ] Prepare rename/rename：placeholder/range、跨文件 WorkspaceEdit、非法名称/冲突、
  version 安全；应用后语义闭环全绿。
- [ ] Code action + resolve：至少从稳定 diagnostic code 产生一个 quick fix；lazy resolve
  返回 version-safe WorkspaceEdit，应用后 diagnostics 清零。

### P1：P0 后推进

- [ ] ArkUI SDK provider：component/decorator/resource/attribute completion、hover、
  definition、diagnostics。
- [ ] Type definition、implementation、document highlights。
- [ ] Semantic tokens、inlay hints、call hierarchy 的需求验证与分级；Zed 已由
  tree-sitter 满足的能力不重复建设。
- [ ] 真实 worker cancellation、项目重载、配置/SDK 变化和多 root 隔离。

## 5. 首批垂直 tracer bullets

能力审计发现 `definitionProvider: true` 已经公开，但现有 adapter 丢弃目标
`textSpan.length`，把所有 definition 结果转换为零长度 range；现有所谓 exact 测试只断言
`range.start`。因此在新增 completion 能力前，先执行一个“已广告能力真实性”切片：

> 只打开 materialized `OtherConsumer.ets`，在 `profile.reference` 请求 definition；结果
> 必须恰好指向未打开的 `Profile.ets`，并且 `textInRange(range) === "Profile"`、range
> 非零、emoji 前缀下 UTF-16 位置不漂移。

该 transcript 必须先稳定 RED，再修复 core → public contract → LSP adapter 的 span 保真。
它不会新增 capability，只纠正当前已广告能力的虚假精确性。

随后执行 completion resolve/auto-import tracer：

> 只打开 `Home.ets`，在同一行含前置 `😀` 的 `Gree` 位置请求 completion；从未打开、
> 未 import 的 `Greeter.ets` 获得候选；调用 `completionItem/resolve` 后得到文档、detail
> 和唯一且 UTF-16 正确的 import edit；应用 edits 后 diagnostics 为零。

它应在真实 `dist/server.cjs --stdio` 上先 RED，原因包括当前没有
`resolveProvider`、`onCompletionResolve`、public resolve port、completion data/edit
映射和完整 unopened project set。GREEN 后形成的 ProjectSet、opaque completion data、
UTF-16 range 和 WorkspaceEdit codec 将被 references、rename、code action 复用。

## 6. 执行 checklist 与并行批次

规则：每个行为任务必须记录 parent revision、RED 命令与失败摘要、GREEN 命令；
一条测试对应一个最小实现。共享契约由集成轨串行修改；并行任务必须有互斥的
文件所有权，不允许覆盖其他任务的改动。

### Wave 0 — 计划与基线（串行）

- [x] W0-01 审计 advertised capability、public implementation、bundle/release 覆盖。
- [x] W0-02 审计真实进程 harness 的生命周期、framing、并发和诊断风险。
- [x] W0-03 审计 CI/release 是否验证并发布同一份 bytes。
- [x] W0-04 设计 L0/L1/L2 corpus 与首个 tracer bullet。
- [x] W0-05 运行并记录未修改基线：`pnpm check:fast`，93/93 通过，
  0 failed、0 skipped，耗时 73.6 s（parent `ef8ab953`）。

### Wave 1 — E2E 基础设施（可并行）

#### Track H：协议驱动可靠性

Owner files：`tests/support/lsp-process.mjs`、`tests/lsp-process.test.mjs`。

- [x] H1 子进程异常退出立即拒绝 pending response，并带 code/signal/stderr
  （`3c3469e`）。
  - RED：`node --test tests/lsp-process.test.mjs`
  - GREEN：同命令。
- [x] H2 timeout 必须注销 waiter；迟到消息不得命中已失败请求（`f96586c`）。
- [x] H3a invalid JSON parse 错误作为 Promise rejection，不得炸 test runner
  （`0b2d1d7`）。
- [x] H3b waiter predicate 错误进入同一 transport failure 边界（`338e7da`）；
  header/framing 继续由 H3c 覆盖。
- [x] H3c malformed header/length/truncated frame 进入同一 transport failure 边界；header
  8 KiB、frame 16 MiB 默认上限，terminal error 对未来 waiter 保持 sticky（`050be68`）。
- [x] H4 close 幂等、有界；正常 shutdown/exit 优先，deadline 后升级终止
  （`95aa209`）。
- [x] H5a 区分 client response、server request 与 notification（`107f678`）。
- [x] H5b progress 严格按 token 关联，并迁移全部真实 caller（`0ccd06f`）。
- [x] H6a/H6b bounded stderr/error、去 payload transcript 与不可变 diagnostic snapshot
  （`8b15314`）。
- [x] H6c failure container 支持 provider，provider 失败不覆盖原始错误（`2ed1731`）；
  真实 child 失败保留有界 process/transcript/stderr 本地证据（`0cf6a38`）。
- [x] H6d layer runner 对 fast/artifact/large 失败保留安全摘要，原样传播 code/signal
  （`6f33f07`）；`failure.json` 不持久化原错误 message（`bb2bb83`）。
- [ ] H6e GitHub Actions 只上传 allowlisted `failure.json`；外部上传需用户明确授权后接线。

#### Track C：版本化 conformance corpus

Owner files：`fixtures/conformance/v1/**`、
`tests/support/materialize-conformance-workspace.mjs`、对应测试。

- [x] C1 marker 剥离后按 UTF-16 计算单点和 range，先用 emoji 前缀建立 RED
  （`2287b2b`）。
- [x] C2 materializer 使用独立 temp workspace，并随 corpus 复制固定 SDK；测试不读取
  有效 HOME/DevEco 环境（`2287b2b`、`85304c3`）。
- [x] C3 加入最小 Harmony manifests、Home/Profile/barrel/Greeter/negative consumer
  （`82483f2`）。
- [x] C4 加入隔离的 ArkUI page 与最小 deterministic SDK stubs（`85304c3`）。
- [x] C5 corpus schema 校验 marker 唯一性、shape、声明完整性和预期 URI
  （`a41a0b0`）；semantic identity 由对应功能 transcript 断言。

#### Track S：参数化场景/session

Owner files：新建 `tests/support/lsp-session.mjs`、
`tests/support/conformance-scenario.mjs` 及其测试；不修改 Track H 文件。

- [x] S1 用现有 `LspProcess` 建 initialize/shutdown helper；target 可注入 command/cwd/env
  （`bfe6644`）。
- [x] S1b session 正确识别 signal-exited child，并保持 close 幂等（`19b7ab8`）。
- [x] S2 同一 smoke scenario 可运行 repo bundle 和可注入公共命令 target
  （`5a07877`；最终 installed artifact 验收保留给 I1/I2）。
- [x] S3 建立 UTF-16-safe TextEdit 应用器并拒绝越界/重叠 edits（`599d32c`）；
  WorkspaceEdit 与 didChange 接线保留为 S3b。
- [x] S3b 安全、不可变地应用 `WorkspaceEdit.changes`，拒绝未知 URI 和未支持的
  `documentChanges`（`53cd4c0`）。
- [x] S3c 将应用结果发送为 didChange 并通过真实 bundle 重新查询，强制版本单调
  （`dded968`）。
- [x] S4 将现有手拼 URI 统一为 `pathToFileURL`，核心 transcript/lifecycle fixture root
  不再指向整个 repo（`bbca863`）。

#### Track A：artifact 结构与证据契约

Owner files：新建 artifact manifest/证据 helper 及其测试；暂不修改 package scripts、
installer 或 workflow，这些由集成轨在各 track GREEN 后接线。

- [x] A1 artifact manifest 的路径、mode、size、digest contract（`a4abd5b`）。
- [x] A2 evidence directory 在成功时清理、失败时保留最小 allowlisted evidence
  （`83694ae`）。
- [x] A3 资源 sampler 定义 PID/RSS/CPU/时间戳、单飞与可靠停止契约（`f87b600`）；
  平台 probe 在 L3/L4 接线时实现。

#### Track M：能力广告契约

Owner files：`tests/support/capability-contract.mjs`、
`tests/lsp-capability-contract.test.mjs` 及对应证据。

- [x] M1 真实 production initialize 精确锁定已实现与必须 absent 的 capabilities
  （`81de320`）。
- [x] M2 machine-readable matrix 将 required/absent capability 与 protocol、bundle、artifact
  evidence 对齐；artifact 缺口必须显式记录（`11b52f2`）。

#### Track G：测试发现与分层门禁

Owner files：`tests/support/test-layer-manifest.mjs`、runner、package scripts 与对应证据。

- [x] G1/G2/M2 集成后显式、唯一地把全部 36 个 test/acceptance 入口归入五层，拒绝漏项、重复、
  无效路径及 release acceptance 混入 fast layer（`f484640`）。
- [x] G2 runner 从 manifest 稳定选择层，拒绝空选择和隐式测试发现（`d37c03e`）。
- [x] G3a package scripts 只通过 runner 发现 Node tests；`check:fast` 完成 typecheck、fresh
  build 和全部 fast 层，143 tests、0 failed、0 skipped（`f85af75`）。
- [x] G3b release gate 分别运行 artifact/large 层，不再直接使用 acceptance glob
  （`2ffb24c`）。
- [x] G3c fast 层禁止显式 Node test skip；真实 sidecar persistence 移入 artifact 层并在
  缺少 release binary 时明确失败（`ef6102c`）。
- [x] G3d fast/artifact/large 通过 Node 20 自定义 reporter 拒绝运行时
  skip/todo/cancelled；人类输出实时透传，机器摘要为 O(1) 计数且最多 4 KiB，缺失或畸形
  摘要 fail closed（`da0e285`）。

Wave 1 exit criteria：H/C/S/A focused tests 全绿；不存在共享临时产物；随后由集成轨
串行接入 package scripts，并运行 `pnpm check:fast`。本地 exit gate 已完成：fresh build
后 172 tests、0 failed、0 skipped，耗时约 83.7 s。H6e 是外部上传授权项，不阻塞本地
功能切片；授权前 CI 不上传任何 evidence 文件。

### 当前执行看板（2026-09-03）

- [x] G3d 运行时 no-skip 门禁完成并独立复验（`da0e285`）。
- [x] B4a bounded ProjectSet path cache 完成并独立复验（`052c670`）。
- [x] B1b/B2b/B3/B5/B6 completion resolve tracer 完成并独立复验（`600eb84`）。
- [ ] B4b watched-files create/delete/rename 一致性：并行实施中。
- [x] I2b installed completion-resolve/apply-and-recheck characterization 完成并独立复验
  （`c8774d7`）。
- [x] Wave 3 references/rename 只读设计审查完成；R0 completeness gate 尚待实现，能力保持
  absent。
- [x] Wave 3 diagnostics code/code-action 只读设计审查完成；G1/Q1/Q2 尚待实现。
- [ ] 本批次集成门禁：所有并行切片提交后运行 fresh `pnpm check:fast`。

### Wave 2 — 首个功能切片与 installed semantic smoke（部分并行）

#### Track B：completion resolve/auto-import（主依赖链）

Owner：一个端到端 owner 独占 semantic contract、project set、completion adapter。

- [x] B1a 真实 stdio list tracer：只打开 Home，未打开 Greeter 候选唯一、kind 正确，
  UTF-16 replacement `textEdit` 精确且保留 opaque data（`537b9ac`）。
- [x] B1b 写 completion resolve/auto-import/apply-and-recheck transcript 并观察逐步稳定 RED
  （`600eb84`）。
- [x] B2a 保留 completion `replacementRange/data` 到 LSP list（`537b9ac`）。
- [x] B2b resolve 后保留 `documentation/detail/additionalTextEdits/data`；公共 data 仅为 UUID，
  服务端 registry 绑定 URI/version/position 且上限 512 条（`600eb84`）。
- [x] B3 暴露 `completionItem/resolve`，真实 bundle 与 protocol transcript GREEN 后才
  advertising（`600eb84`）。
- [x] B4a ProjectSet 纳入未打开文件并按 canonical root 复用，避免每次 completion 同步
  重扫；4 roots/256 paths/1 MiB path bytes 硬限制与 LRU 已有 contract（`052c670`）。
- [ ] B4b 通过 `workspace/didChangeWatchedFiles` 增量维护 create/delete/rename；delete/rename
  必须把旧路径传给 `removedPaths`，notification 后的下一语义请求作为无 sleep 的一致性屏障。
- [x] B5 应用 completion 与 auto-import edits，didChange v2 后 diagnostics 清零，再精确
  definition 到未打开 Greeter（`600eb84`）。
- [x] B6 scripted cancel/forged/stale/shutdown contract（`600eb84`）。

#### Track D：definition 精确性（D0 先行；D1/D2 与 B 的共享契约合入后并行）

- [x] D0 在其他新增 capability 前先 RED：materialized corpus 中只打开带 emoji 前缀的
  reference，definition 精确指向未打开文件的完整名称 range（`e605033`）。
- [ ] D1 加 unopened、alias/barrel、跨 module、open target overlay。
- [ ] D2 加 emoji 前缀 UTF-16 source mapping。

#### Track I：installed artifact semantic smoke（与场景 helper GREEN 后并行）

- [x] I0 本地 installer characterization：从外部 cwd 启动安装后的命令，完成 completion、
  definition、diagnostics 以及 completion-resolve/apply-and-recheck transcript
  （`3b5f76c`、`c8774d7`）；该测试仍会从源码构建，不能替代 I1。
- [ ] I1 在禁止 build、无源码、无 node_modules、随机 cwd/clean HOME 环境安装 artifact。
- [ ] I2 对不可变 artifact 的 installed command 运行 completion、definition、diagnostics 与
  completion-resolve/apply-and-recheck transcript。
- [ ] I3 验证启动的是 artifact 内相邻 sidecar，没有 repo-relative fallback。

Wave 2 exit criteria：首个 tracer 在 bundle 与 installed artifact 两个 target 上全绿；
capability advertisement 与 transcript 一致；`pnpm check:fast`、artifact smoke 全绿。

### Wave 3 — 导航与安全编辑能力（可并行）

共享前置：ProjectSet、WorkspaceEdit codec、UTF-16 mapping 已由 Wave 2 保护。

进入本 Wave 前新增 correctness gate：项目成员全集与 256 文件/8 MiB 的有界内容快照必须
解耦。当前 TypeScript engine 会静默丢弃未加载文件中的 references/rename locations；在能
证明全局结果完整前不得 advertising，无法保证完整时必须 fail closed，不能返回成功但不完整。

- [ ] R0a 用 >256 文件 fixture 建立 project-snapshot completeness RED；snapshot 必须显式
  `complete/partial`，partial 全局查询返回 `RequestFailed`，不得返回部分成功结果。
- [ ] R0b 将 project membership 与 256 文件/8 MiB 内容缓存解耦；只在可证明完整的 snapshot
  上执行 references/rename，并记录 workspace revision。
- [ ] R1 References：`includeDeclaration=false` 返回 import、usage、barrel re-export 的完整
  `Profile` ranges，排除 declaration 与同名 shadow；结果稳定排序、去重。
- [ ] R2 References：`includeDeclaration=true` 只额外加入 origin declaration；覆盖 unopened、
  overlay、另一参与文件变更后的 stale、client cancel。
- [ ] N0 扩展安全 edit helper 支持 versioned `documentChanges`，原子拒绝 version mismatch、
  unknown URI、resource operation、overlap/out-of-bounds，且不改变输入。
- [ ] N1 Prepare rename：精确 range + placeholder；不可重命名目标返回固定 `RequestFailed`，
  不泄露 TypeScript 本地化文案。
- [ ] N2 Rename：先覆盖局部 import alias 语义，再覆盖 declaration→barrel→consumer 的跨文件
  语义；保留 TS `prefixText/suffixText`，只返回稳定排序的 versioned `documentChanges`。
- [ ] N3 Rename fail-closed：非法名称为 `InvalidParams`；不完整/越 root/不可映射为
  `RequestFailed`；stale/superseded 为 `ContentModified`；client cancel 为 `RequestCancelled`。
- [ ] N4 只有支持 `workspace.workspaceEdit.documentChanges` 的 client 才可 advertising rename；
  支持 prepare 时广告 `{ prepareProvider: true }`，全部 bundle/installed transcript GREEN 后接线。
- [ ] G1 Diagnostics：先只贯通 TypeScript numeric `code`，用含 emoji 且经过 ArkTS virtual
  rewrite 的 `greting` marker 稳定断言 `TS2552`；related info/data/tags 留给 G1b。
- [ ] Q1 Code action list：服务端按当前 snapshot 的 code + source-mapped range 重算匹配，
  只返回唯一 `spelling` quick fix 的 title/kind/diagnostic/opaque UUID，不在 list 返回 edit。
- [ ] Q2 Code action resolve：只信上限 512 条、绑定 URI/version 的服务端记录；返回 versioned
  `TextDocumentEdit`，应用后 didChange v2 diagnostics 清零。
- [ ] Q3 Code action reliability：伪造 UUID/过期版本拒绝，伪造 title/kind/diagnostic 无效，
  client cancel 为 `RequestCancelled`，shutdown 清空 registry；全部测试不使用 sleep。
- [ ] Q4 只有声明 code-action literal/data/resolve-edit 与 versioned documentChanges 支持的
  client 才广告 `{ codeActionKinds: ["quickfix"], resolveProvider: true }`；installed GREEN 后接线。

Wave 3 exit criteria：references、prepare rename/rename、code action 仅在各自 bundle、
installed transcript 与 reliability matrix 全绿后 advertised。

### Wave 4 — 现有能力深度与 ArkUI（可并行）

- [ ] E1 Hover：unopened dependency、alias、JSDoc tags、SDK、UTF-16 range。
- [ ] E2 Signature help：overload、nested/generic call、trigger/retrigger、快速 didChange。
- [ ] E3 Document symbols：全部公开 kind、ArkTS component hierarchy、flat/hierarchical。
- [ ] U1 ArkUI：component/decorator/resource/attribute completion 与 definition。
- [ ] U2 ArkUI：真实 DSL 无伪 diagnostics，错误 decorator/resource 有稳定 diagnostics。
- [ ] W1 Workspace symbols：完整 kind 映射、resolve 需求评估、installed overlay/cancel smoke。

Wave 4 exit criteria：P0 功能 checklist 全部 GREEN；生成机器可读 capability report，
任何 advertised-but-untested 或 required-but-unadvertised 都使 CI 失败。

### Wave 5 — build once / test once / publish same bytes（串并结合）

- [ ] P1 单次 staging build 生成 archive、manifest、checksums。
- [ ] P2 installer 支持 `--from-artifact`/`--no-build`；acceptance 中发现编译即失败。
- [ ] P3 CI `build-artifacts` job 上传 immutable artifact。
- [ ] P4 独立干净 job 下载同一 digest，运行 L3 artifact E2E。
- [ ] P5 GitHub Release 只能 promote 已通过的 digest，不允许重新 build。
- [ ] P6 `if: always()` 上传 transcript、logs、manifest、process/resource evidence。
- [ ] P7 Linux/macOS blocking matrix；若承诺 Windows，再提供原生 launcher/package job。
- [ ] P8 对最终 Zed WASM 至少 validate/instantiate；nightly/RC 增加真实 Zed host smoke。

### Wave 6 — 大项目时延与内存（P0 功能全绿后）

- [ ] L1 PR 的 455 文件 artifact E2E 加 completion/definition/diagnostics 与索引中交互。
- [ ] L2 nightly 10k–100k 文件、多 module/root、generated/dependency 噪声 corpus。
- [ ] L3 采集 cold/warm p50/p95/p99、cancel latency、peak/steady RSS、Node heap、sidecar RSS。
- [ ] L4 打开/修改/关闭 churn 与 idle reclaim soak；验证无单调内存增长。
- [ ] L5 固定 runner 连续建立至少 10 次基线，再启用相对回归阈值。
- [ ] L6 初始阻断预算：warm workspace symbol P95 < 100 ms；ready 后 completion/definition
  P95 < 250 ms、P99 < 500 ms；取消生效 < 100 ms；索引期间前台请求不得停顿 > 500 ms。
- [ ] L7 内存阻断采用绝对安全帽 + 相对基线：combined RSS 不超过已批准 hard cap，且
  peak/steady RSS 不得较稳定基线回归 > 10%；阈值及 runner identity 写入 evidence。

如果硬件或 corpus 改变，必须新建基线 PR；不得通过放宽阈值修复产品回归。

## 7. 并行依赖图

```text
Wave 1:  H harness ───────┐
         C corpus ────────┼─> S scenario ───────┐
         A artifact spec ─┘                     │
                                                v
Wave 2:              B completion tracer -> shared ProjectSet/Edit contracts
                                      ├────────> D definition
                                      └────────> I installed semantic smoke
                                                │
Wave 3:                  references | rename | diagnostics/code-action
                                                │
Wave 4:                  hover | signature | symbols | ArkUI
                                                │
Wave 5:                  immutable artifact + CI promotion
                                                │
Wave 6:                  large-project latency/memory gates
```

最大并行原则：只并行无共享写入的 track；涉及
`src/contracts/semantic-engine.ts`、`src/lsp/run-language-server.ts`、`package.json`、
`scripts/check-release.sh`、workflow 的修改由集成 owner 串行完成。

## 8. 每个任务的证据模板

在对应 `docs/tdd/<task-id>-<slug>.md` 记录：

```text
Parent revision:
Public boundary:
Assumption:
RED command:
RED observed failure:
Minimal GREEN change:
GREEN focused command:
Regression command:
Artifact digest (when applicable):
Remaining risks:
```

合并前最低命令：

```sh
pnpm check:fast
```

触及 Rust/sidecar、installer、artifact 或 CI 时还必须运行对应 focused test 和
`pnpm check:release`；大型 fixture 命令必须显式传入固定 revision 的路径。

## 9. 失败证据与可观测性

所有 artifact/large E2E 失败时保留并上传：

- tested archive、manifest、checksums、安装后 tree/mode/symlink；
- TAP/JUnit、每 stage 命令/退出码/耗时/tool versions；
- 去敏后的 LSP tx/rx NDJSON transcript；
- server log、sidecar stderr、exit code/signal、最后 progress/status；
- index metadata/SQLite integrity 摘要；
- Node/sidecar RSS/CPU 时间序列、峰值、最终 process tree；
- fixture git SHA、OS/kernel 和环境变量白名单。

成功时清理临时资产；失败时保留到 CI evidence directory，并由 `if: always()` 上传。

## 10. 停止条件与变更控制

- 新能力若无法通过 public transcript，不得通过修改 capability assertion 来假绿。
- flaky test 必须先最小化和修复，不得简单增加 sleep/timeout 或重跑次数。
- 性能优化若改变语义结果，先补 characterization test，再单独推进。
- 任一 parallel track 发现需要修改其他 owner 文件时先暂停并交给集成轨。
- 每个 Wave 结束必须更新本 checklist、能力矩阵和实际命令；未满足 exit criteria
  不进入下一 Wave。
