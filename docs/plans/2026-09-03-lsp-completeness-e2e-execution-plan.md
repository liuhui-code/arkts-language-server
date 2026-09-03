# ArkTS Language Server 功能完备度与 E2E 执行计划

状态：Approved for execution  
基线：`integration/local-beta@ef8ab9533a97ebd000318435a56d8dba895b5488`  
计划分支：`plan/lsp-completeness-e2e`  
日期：2026-09-03  
优先级：功能正确性与完备度 > 发布产物一致性 > 大项目时延与内存

## 文档变更的 TDD 例外

- 原因：本文件只新增或同步执行计划/checklist，不改变运行行为。
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

- [x] Lifecycle：initialize/open/incremental change/close/cancel/shutdown/exit。
- [x] Completion：本地/继承/imported receiver、字段/方法、1–2 字符前缀、kind、
  ranking、精确 replacement range。
- [x] Completion resolve：documentation/detail/opaque data；未打开文件 auto-import
  返回唯一 `additionalTextEdits`，应用后 diagnostics 为零。
- [x] Definition：local/import/alias/barrel/unopened/跨 module；range 精确覆盖名称；
  UTF-16 non-BMP 前缀不漂移。
- [ ] Diagnostics：syntax/type/ArkTS DSL，code/severity/range/version；快速连改、close
  后不得发布 stale diagnostics。
- [x] Hover/signature help：跨文件文档、overload、active parameter、trigger/retrigger、
  UTF-16 range。
- [x] Document symbols：hierarchical/flat，并覆盖 contract 声明的 symbol kinds。
- [x] Workspace symbols：catalog 中和 ready 后都可查询；overlay 优先；正确 kind/range；
  progress 按 token 匹配。
- [x] References：`includeDeclaration` 两种语义、跨文件/重导出/unopened/overlay、
  精确完整 range、取消。
- [x] Prepare rename/rename：placeholder/range、跨文件 WorkspaceEdit、非法名称/冲突、
  version 安全；应用后语义闭环全绿。
- [x] Code action + resolve：至少从稳定 diagnostic code 产生一个 quick fix；lazy resolve
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

- [x] G1/G2/M2 集成后显式、唯一地把全部 38 个 test/acceptance 入口归入五层，拒绝漏项、重复、
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
- [ ] G3e scripted protocol server 不再由多个 test process 共写
  `dist/scripted-semantic-server.cjs`；先用并发 child contract 观察 RED，再改为每进程临时
  artifact、同进程单次构建和有界清理。默认沙箱下的直接失败已确认是 `dist` 写权限边界；
  授权写入后 freshness 8/8 GREEN，但共享输出竞态仍须从结构上消除。

Wave 1 exit criteria：H/C/S/A focused tests 全绿；不存在共享临时产物；随后由集成轨
串行接入 package scripts，并运行 `pnpm check:fast`。本地 exit gate 已完成：fresh build
后 172 tests、0 failed、0 skipped，耗时约 83.7 s。H6e 是外部上传授权项，不阻塞本地
功能切片；授权前 CI 不上传任何 evidence 文件。

### 当前执行看板（2026-09-03）

- [x] G3d 运行时 no-skip 门禁完成并独立复验（`da0e285`）。
- [x] B4a bounded ProjectSet path cache 完成并独立复验（`052c670`）。
- [x] B1b/B2b/B3/B5/B6 completion resolve tracer 完成并独立复验（`600eb84`）。
- [x] B4b watched-files create/delete/rename 一致性完成并独立复验（`9fc8d22`）。
- [x] I2b installed completion-resolve/apply-and-recheck characterization 完成并独立复验
  （`c8774d7`）。
- [x] Wave 3 references/rename 从 fail-closed 设计推进到 bundle/protocol/installed 全链证据，
  capability 已按客户端事务能力条件广告（`c2d0a30`、`3264efe`、`20cecb3`、`8199a65`）。
- [x] Wave 3 diagnostics code/code-action 只读设计审查完成；G1/Q1/Q2 尚待实现。
- [x] N0/Q0b versioned `TextDocumentEdit` 安全应用 helper（`5dc6517`）。
- [x] Q0a UTF-16 + ArkTS rewrite 的稳定 TS2552 spelling fixture（`c488c54`）。
- [x] G1 diagnostic numeric code 端到端保真，并同步机器可读能力证据
  （`e1a787f`、`c5d8b7f`）。
- [x] G1b 快速连改与 close 不发布 stale diagnostics 的无 sleep 真实进程门禁
  （`ade2a2f`；既有行为的 characterization，无虚构 RED）。
- [x] C-P0 1 字符仅本地、2 字符 workspace auto-import 的短前缀策略与精确 replacement
  （`0ecc337`）。
- [x] D1 unopened/overlay/alias/barrel/relative cross-module definition 精确范围门禁
  （`c4debfe`；既有行为的 characterization）。
- [x] E3a legacy document-symbol kind compatibility（`572039e`）。
- [x] R0a 项目成员全集与 256 文件内容窗口解耦；partial/revision/枚举资源释放契约
  （`c62b088`）。
- [x] I1 从 manifest 校验并无构建安装同一份 directory artifact bytes（`af2177c`）。
- [x] R0b TypeScript host 对完整成员集的 lazy/bounded 消费；300+ 文件窗口外 completion、
  lazy ArkTS definition、watcher 新鲜度、partial 降级及双硬上限均有门禁（`e52b2c9`）。
- [x] Q1/Q2 code-action 适配设计与 TypeScript 5.9 API 核验完成；有界 512 条/512 KiB、
  区分 stale/forged 的 resolve store 已落地（`2861aeb`）；真实 stdio list→resolve→apply→
  diagnostics clear tracer 已完成（`599b23a`）。
- [x] Q3 code-action forged/stale/cancel reliability 已完成（`370b927`）；installed artifact
  list→resolve→apply→diagnostics-clear smoke 已完成（`508a93a`）。
- [x] I2 不可变 artifact 上复用完整 semantic smoke 场景（`09f6352`）。
- [x] I3 正负控证明安装版只使用 immutable release 相邻 sidecar，不回退源码仓库
  （`9eeb742`）。
- [x] Q3/Q4 quick-fix reliability、条件 capability 广告与命名 evidence matrix v2
  （`370b927`、`d6163e7`）。
- [x] L1/C8/C9/W2 基本完备度切片：installed lifecycle、imported receiver kind、同名
  auto-import source identity、workspace-symbol kind（`68dad41`、`fbe3d6f`、`4b245df`、`eb0ef8c`）。
- [x] E1 跨文件 hover bundle + immutable installed transcript（`905f029`、`0011dde`）。
- [x] E2a Signature bundle：overload/nested/generic、active parameter、快速 didChange、LSP
  trigger/retrigger context 与 capability 字符集合（`0bd947c`）。
- [x] E3b-1 Document symbols bundle：12 类语义 kind、三层 hierarchy、flat fallback、老客户端
  Struct 降级、稳定顺序与精确 UTF-16 range（`423817a`）。
- [x] E2b/E3b-2 在 immutable installed artifact 上复用 signature/document-symbol transcript，并
  消除 feature matrix 对这两项的 `artifactGap`（`c1e39a5`）。
- [x] R0 references/rename fail-closed 审计：确认 TypeScript 返回能力可用，但当前 adapter 会
  静默丢弃 unopened/partial/越 root/不可映射位置，故能力继续保持 absent。
- [x] R0c-2 所有同 root open overlays pinned；跨 workspace 回收不淘汰未保存内容；didClose
  恢复 disk truth 并推进 root content revision（`927ffe3`）。
- [x] R1/R2/R3 references：barrel/import/unopened/overload 声明策略、精确 source-map range、
  403 文件跨 resident/lazy window、20,001 文件 partial fail-closed、取消/陈旧语义与 immutable
  installed artifact（`c2d0a30`、`9d4e623`、`e51eeab`、`52678fc`）。
- [x] N1/N2a/N2b prepare/rename handler：精确 placeholder、consumer alias 语义、origin→barrel
  API 保持、versioned `documentChanges` 与全量映射/重叠校验（`3264efe`）。
- [x] N2c/N3/N4 alias 边界、越 root 原子拒绝、四类固定错误、事务型条件广告及 installed
  edit 应用门禁（`c70bc6a`、`7d322e0`、`20cecb3`、`8199a65`）。
- [x] R0c-3 同 workspace open/change/close/watched change 使 cancellation-resistant 的
  references/prepareRename/rename 返回 `ContentModified`；跨 workspace 与 document-scoped
  completion 保持隔离（`0445863`）。
- [x] 新增 protocol/bundle 测试纳入唯一 layer manifest 和命名 capability evidence，防止
  “测试存在但发布门禁未执行”（`9fe3a88`）。
- [x] E0b advertised capability 必须拥有 immutable artifact evidence，`artifactGap` 仅允许
  planned/absent 能力（`eb52afb`）。
- [x] E0c 同一 feature/layer/exact test 不得重复贴多个 claim；W1 installed 泛化标签已合并为
  单一诚实 claim（`4fe7746`）。
- [x] E0d installed semantic helper 只有在对应真实断言簇完成后才返回 12 个结构化
  `verifiedClaims`；portable acceptance 与 matrix 中同一 exact test 的 claim 集合必须 exact
  equal，rename claim 已覆盖冲突与 apply 后 diagnostics/definition/references 闭环
  （`e69d69b`）。
- [x] W1 production/installed workspace-symbol 全 kind、100 条完整 Location 上限、精确 URI/range
  与无需 resolve 的决策（`caf6121`、`e5766e3`、`503b758`）。
- [x] R4 changed overlay 下 references 两种 declaration policy 只返回 overlay truth
  （`b4ab0c1`）。
- [x] N5 同 scope 冲突固定拒绝且无 edit；immutable artifact 真正应用 consumer/origin/barrel
  edits 后，versioned diagnostics、definition 与 6 个 references 使用新符号身份
  （`d063582`、`967f026`）。
- [x] U1a 首切片：`$r` completion/definition、JSON key 精确 range、bounded fail-closed cache、
  基础 builder DSL 无误诊；resource watcher 只失效对应 workspace snapshot，不重建 TS engine
  （`6f5751b`、`ae05a07`）。
- [x] U1b/U2 测试先行：SDK symbol 基础能力 characterization 已 GREEN；missing-resource 与
  nested post-block tail 已形成两个稳定真实 stdio RED（`51c93bc`）。
- [x] 本批次集成门禁：fresh `pnpm check:fast` 为 298/298，0 failed、0 skipped、0 todo，
  耗时 150.2 s；immutable portable acceptance 为 4/4（本分支 HEAD 含 `0445863`、`9fe3a88`）。

#### 下一批 P0 基本功能 checklist（按依赖执行）

测试先行原则：测试/fixture 可以并行；一旦进入生产实现，所有修改
`typescript-language-service.ts` 或 capability adapter 的切片回到单一 owner 串行。

- [x] E0 Evidence：feature matrix 从“测试文件存在”升级为可核验的命名场景 claim；错误、
  缺失或重复 claim fail closed（schema v2，`d6163e7`）。
- [x] E0b Release evidence：release gate 拒绝 advertised capability 仅靠 `artifactGap`
  放行；只有 planned/absent 能力允许显式记录 gap（`eb52afb`）。
- [x] L1 Lifecycle installed：精确断言 incremental sync capability；执行 ranged didChange，
  查询证明 v2 生效，再在 didClose 后证明 overlay 被移除、disk truth 恢复。
- [x] C8 Completion receiver：imported/typed receiver 同时返回 field 和 method；kind 分别为
  `Field`/`Method`，replacement range 在 emoji 后仍精确（`fbe3d6f`；RED 为字段错误映射成
  `Property(10)`）。
- [x] C9 Completion ranking：local 优先于 auto-import，重复请求排序与 `sortText` 稳定；同名但
  语义不同的 auto-import 不误删，并以 workspace-relative module source 区分（`4b245df`）。
- [x] W2 Workspace symbol kind：overlay 的 interface/enum/property/constructor/module/type/variable
  不再统一降级为 Variable；未知 sidecar kind 保守降级为 Variable（`eb0ef8c`）。
- [x] E1 Hover depth：unopened dependency、import alias、JSDoc tags、emoji UTF-16 range，并加入
  immutable artifact smoke（`905f029`、`0011dde`）。
- [x] E2 Signature depth：
  - [x] E2a 转发 LSP trigger/retrigger context；覆盖 overload、nested/generic、active parameter、
    快速 didChange（`0bd947c`）。
  - [x] E2b 加入 immutable artifact smoke（`c1e39a5`）。
- [x] E3b Document symbols depth：
  - [x] E3b-1 补全公开 kind、深层 hierarchy/flat fallback、稳定顺序与 UTF-16 range
    （`423817a`；RED 为 `export const` 被静默丢弃）。
  - [x] E3b-2 加入 immutable artifact smoke（`c1e39a5`）。

可并行组：`E0`（证据契约）、`L1`（installed test-only）、`W2`（独立 symbol codec）可互斥
推进；`C8 → C9 → E1 → E2 → E3b` 共享 TypeScript/LSP adapter，按此顺序串行。

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
- [x] B4b 通过 `workspace/didChangeWatchedFiles` 增量维护 create/delete/rename；delete/rename
  把旧路径传给 `removedPaths`，notification 后的下一语义请求是无 sleep 的一致性屏障；
  open overlay 优先，事件与 removed paths 有硬上限，过载后只重建对应 root engine；动态注册
  是 best-effort，客户端不响应也不阻塞 indexing/completion（`9fc8d22`）。
- [x] B5 应用 completion 与 auto-import edits，didChange v2 后 diagnostics 清零，再精确
  definition 到未打开 Greeter（`600eb84`）。
- [x] B6 scripted cancel/forged/stale/shutdown contract（`600eb84`）。
- [x] B7 一字符非 member 请求只查本地 scope；两字符才允许 workspace module-export
  completion，并精确替换对应 prefix（`0ecc337`）。

#### Track D：definition 精确性（D0 先行；D1/D2 与 B 的共享契约合入后并行）

- [x] D0 在其他新增 capability 前先 RED：materialized corpus 中只打开带 emoji 前缀的
  reference，definition 精确指向未打开文件的完整名称 range（`e605033`）。
- [x] D1 加 unopened、alias/barrel、relative cross-module、open target overlay，并锁定完整
  非零 target range（`c4debfe`）。
- [x] D2 emoji 前缀与 ArkTS rewrite 后的 UTF-16 source mapping（`e605033`、`c4debfe`）。

#### Track I：installed artifact semantic smoke（与场景 helper GREEN 后并行）

- [x] I0 本地 installer characterization：从外部 cwd 启动安装后的命令，完成 completion、
  definition、diagnostics 以及 completion-resolve/apply-and-recheck transcript
  （`3b5f76c`、`c8774d7`）；该测试仍会从源码构建，不能替代 I1。
- [x] I1 在禁止 build、无源码、无 node_modules、随机 cwd/clean HOME 环境校验并安装
  directory artifact；runtime bytes/mode 与 manifest 一致（`af2177c`）。archive、签名和 CI
  promotion 仍由 Wave 5 负责。
- [x] I2 对不可变 artifact 的 installed command 运行 completion、definition、diagnostics 与
  completion-resolve/apply-and-recheck transcript（`09f6352`），并覆盖 quick-fix
  list→resolve→apply→diagnostics-clear（`508a93a`）及 incremental change/close/disk restore
  lifecycle（`68dad41`）；与源码安装复用同一 helper，4/4 artifact acceptance GREEN。
- [x] I3 验证启动的是 artifact 内相邻 sidecar，没有 repo-relative fallback
  （`9eeb742`）：withhold 相邻 binary 时明确 degraded/空结果，恢复后 1/1 ready 且精确 symbol。

Wave 2 exit criteria：首个 tracer 在 bundle 与 installed artifact 两个 target 上全绿；
capability advertisement 与 transcript 一致；`pnpm check:fast`、artifact smoke 全绿。

### Wave 3 — 导航与安全编辑能力（可并行）

共享前置：ProjectSet、WorkspaceEdit codec、UTF-16 mapping 已由 Wave 2 保护。

进入本 Wave 前新增 correctness gate：项目成员全集与 256 文件/8 MiB 的有界内容快照必须
解耦。当前 TypeScript engine 会静默丢弃未加载文件中的 references/rename locations；在能
证明全局结果完整前不得 advertising，无法保证完整时必须 fail closed，不能返回成功但不完整。

- [x] R0a 用 >256 文件 fixture 建立 project-membership completeness RED；membership 显式
  `complete/partial`，且与有界内容窗口解耦（`c62b088`）。partial 全局查询的
  `RequestFailed` 接线保留给 R0b/R1。
- [x] R0b 将 project membership 与 resident 内容窗口解耦，并由 TypeScript host lazy 消费
  complete snapshot、记录 membership/content revision；lazy snapshot 默认限制为 128 文件/
  8 MiB（`e52b2c9`）。本项不启用 references/rename。
- [x] R0c 全局查询完整性与 freshness：
  - [x] R0c-1 partial/unknown membership 对全局查询整体返回 `RequestFailed`，不得返回空数组或
    部分结果。
  - [x] R0c-2 所有 open overlay 保持 pinned；`didClose` 后恢复 disk truth 并推进 workspace
    content epoch（`927ffe3`）。
  - [x] R0c-3 watched create/delete/rename 原子更新 membership revision；root-dirty 立即降级
    partial，重枚举成功才发布新 complete snapshot；open/change/close/watcher 使同 root 的旧
    全局请求返回 `ContentModified`（`9fc8d22`、`0445863`）。
- [x] R1 References：`includeDeclaration=false` 返回 import、usage、barrel re-export 的完整
  `Profile` ranges，排除 declaration 与同名 shadow；结果稳定排序、去重（`c2d0a30`）。
- [x] R2 References：`includeDeclaration=true` 增加全部 canonical declaration，覆盖 unopened、
  overload、client cancel、root-scoped freshness 与 immutable artifact
  （`9d4e623`、`52678fc`、`0445863`）。
- [x] R3 References：403 文件跨 resident/lazy window、未打开 ArkTS struct rewrite、emoji
  range 精确；20,001 文件 partial membership 整体 `RequestFailed`（`e51eeab`）。
- [x] N0 扩展安全 edit helper 支持 versioned `documentChanges`，原子拒绝 version mismatch、
  unknown URI、resource operation、overlap/out-of-bounds，且不改变输入（`5dc6517`）。
- [x] N1 Prepare rename：精确 range + placeholder；不可重命名目标返回固定 `RequestFailed`，
  不泄露 TypeScript 本地化文案（`3264efe`）。
- [x] N2 Rename：覆盖局部 import alias 与 declaration→barrel→consumer 跨文件语义；保留
  TS `prefixText/suffixText`，只返回稳定排序的 versioned `documentChanges`（`3264efe`）。
- [x] N3 Rename fail-closed：非法名称为 `InvalidParams`；不完整/越 root/不可映射为
  `RequestFailed`；stale/superseded 为 `ContentModified`；client cancel 为 `RequestCancelled`。
- [x] N4 只有支持 `workspace.workspaceEdit.documentChanges` 且声明事务失败处理的 client 才
  advertising `{ prepareProvider: true }`；bundle/installed transcript GREEN 后接线
  （`20cecb3`、`8199a65`）。
- [x] R4 References overlay：didChange v2 增删引用后，两种 `includeDeclaration` 请求只返回
  overlay truth，排除 stale disk range；已登记 `references.bundle.changed-overlay` claim
  （`b4ab0c1`）。
- [x] N5 Rename semantic safety：目标 scope 已存在新名称时整体 `RequestFailed` 且无 edit；在
  immutable artifact 应用 origin/barrel/consumer edits 后，diagnostics/definition/references
  使用新名称形成语义闭环（`d063582`、`967f026`）。
- [x] Q0a 新增 `QuickFixConsumer.ets`：ArkTS `struct` rewrite 与 emoji 后的 `greting` marker
  可重复 materialize；TypeScript 5.9.2 探针确认 TS2552 与唯一 `spelling` fix（`c488c54`）。
- [x] G1 Diagnostics：贯通 TypeScript numeric `code`，用含 emoji 且经过 ArkTS virtual
  rewrite 的 `greting` marker 稳定断言 `TS2552`（`e1a787f`）；related info/data/tags 后置。
- [x] Q0c Code-action resolve store：服务端 UUID-only 记录，active+tombstone 合计 512 条、
  active payload 合计 512 KiB；文档失效后保留无 payload stale tombstone（`2861aeb`）。
- [x] Q1 Code action list：服务端按当前 snapshot 的 code + source-mapped range 重算匹配，
  只返回唯一 `spelling` quick fix 的 title/kind/diagnostic/opaque UUID，不在 list 返回 edit
  （`599b23a`）。
- [x] Q2 Code action resolve：只信上限 512 条、绑定 URI/version 的服务端记录；重新计算并
  核对完整 action fingerprint 后返回 versioned `TextDocumentEdit`，应用后 didChange v2
  diagnostics 清零（`599b23a`）。
- [x] Q3 Code action reliability：伪造 UUID/过期版本拒绝，伪造 title/kind/diagnostic 无效，
  client cancel 为 `RequestCancelled`，shutdown 清空 registry；全部测试不使用 sleep
  （`370b927`）。
- [x] Q4 只有声明 code-action literal/data/resolve-edit 与 versioned documentChanges 支持的
  client 才广告 `{ codeActionKinds: ["quickfix"], resolveProvider: true }`；installed GREEN 后接线。

Wave 3 exit criteria：references、prepare rename/rename、code action 仅在各自 bundle、
installed transcript 与 reliability matrix 全绿后 advertised。

### Wave 4 — 现有能力深度与 ArkUI（可并行）

- [x] E1 Hover：unopened dependency、alias、JSDoc tags、UTF-16 range，并通过 immutable
  installed artifact；SDK provider 专项仍归 U1/U2。
- [x] E2 Signature help：
  - [x] bundle 覆盖 overload、nested/generic call、trigger/retrigger、快速 didChange
    （`0bd947c`）。
  - [x] immutable installed artifact smoke（`c1e39a5`）。
- [x] E3 Document symbols：
  - [x] E3a 客户端未声明 `symbolKind.valueSet` 时把 ArkTS Struct 降级为 Class；现代客户端
    保留 Struct（`572039e`）。
  - [x] E3b bundle 覆盖全部公开 kind、三层 hierarchy、flat fallback、稳定顺序与 UTF-16 range
    （`423817a`）。
  - [x] immutable installed artifact smoke（`c1e39a5`）；ArkTS component hierarchy 已由
    installed corpus 覆盖，更多 SDK component 语义仍留给 U1。
- [ ] U1 ArkUI language features（ArkUI provider 与 virtualizer 分离 owner）：
  - [x] U1a `$r("app.string.ti")` 唯一补全 `title`，replacement range 精确；definition 指向
    固定 `string.json` key range；watched resource 后下一请求无 sleep 使用新 snapshot
    （`6f5751b`、`ae05a07`）。
  - [x] U1b-1 `@Entry/@Component/@State`、Column/Text 与普通 `Text(...).width` 的
    completion/hover/definition 已由真实 stdio characterization 锁定（`51c93bc`）。
  - [ ] U1b-2 nested `Column() { ... }.width(...)` 需要保留 receiver 类型的 lowering；
    diagnostics 为零且 width completion/hover/definition 精确。当前稳定 RED 为
    TS1128(`.`) + TS2304(`width`)。
- [ ] U2 ArkUI diagnostics：
  - [x] 基础合法 DSL 为零，普通 syntax diagnostic 使用 numeric code；拼错 `@Componet`
    已 characterization 为 TS2552 + 精确 UTF-16 range（`6f5751b`、`51c93bc`）。
  - [ ] 缺失 resource key 仅在完整 resource snapshot 上返回稳定
    `arkui.resource.not-found`、Error、精确 key range；partial/unavailable index 不得误报。
- [x] W1 Workspace symbols：
  - [x] W1a 真实 production server + `AllKinds.ets` overlay 覆盖全部公开 kind/name range；
    scripted kind codec 不能独自作为 production evidence。
  - [x] W1b immutable installed command 保留并断言 struct/property/method kind 与 range。
  - [x] W1c 记录无需 `workspaceSymbol/resolve` 的决策：结果上限 100 且已携完整 Location；
    cancellation 复用 deterministic protocol evidence。

#### Wave 4 当前并行派工（2026-09-03）

| 轨道 | 首条公开 RED | 初始 ownership | 与其他轨的约束 |
|---|---|---|---|
| F-ArkUI-resource | missing key diagnostics 真 RED | `src/core/arkui/**`、diagnostic contract 与独立测试 | 与 virtualizer owner 分离；只有完整 snapshot 才能报 missing |
| F-ArkUI-tail | nested builder tail 真 RED | `arkts-virtual-document.ts` 与独立 tail 测试 | 保型 lowering；不得过滤 TS1128/2304 |
| F-Test-runtime | scripted server 共写 repo `dist` | build helper、4 个 protocol caller、并发 contract | 每进程 temp artifact；不改产品代码 |
| F-Artifact-evidence | 12 个 installed claims 的执行绑定 | installed helper、portable acceptance、feature matrix | `e69d69b` 已完成；待统一 portable 4/4 复验 |
| F-Workspace/References/Rename | P0 深度与 artifact 闭环 | 对应独立 bundle/installed tests | 已完成，最终统一 full gate |

顺序门禁：四轨可并行建立稳定 RED；production semantic core 严格串行；每轨 focused GREEN 后
由集成 owner 更新 layer/evidence matrix，最后统一运行 `pnpm check:fast` 与 portable artifact E2E。

Wave 4 exit criteria：P0 功能 checklist 全部 GREEN；生成机器可读 capability report，
任何 advertised-but-untested 或 required-but-unadvertised 都使 CI 失败。

### Wave 5 — build once / test once / publish same bytes（串并结合）

2026-09-03 只读审计：当前 `check:release` 先构建一次，artifact 层中的 source installer
acceptance 又调用 installer 两次，而每次都会重建 JS、sidecar、WASM；因此每类交付 bytes
在一条 gate 中至少构建三次。portable directory artifact 能证明“安装时不重建”，但 CI 尚未
上传/下载该 artifact，也没有 digest promotion。公开发布还被 `PROVENANCE.md` 中
`UNLICENSED`/禁止公开分发声明阻塞，P5 不得在许可决策前推进。

- [ ] P1 单次 staging build 生成 archive、manifest、checksums。
- [x] P2 installer 支持 `--from-artifact` 的 consume-only 路径；acceptance 用 poison
  `pnpm/cargo/esbuild` 保证安装时不编译，并校验 bytes/mode/digest；最终 archive 输入接线归 P1/P4。
- [ ] P3 CI `build-artifacts` job 上传 immutable artifact。
- [ ] P4 独立干净 job 下载同一 digest，运行 L3 artifact E2E。
- [ ] P5 GitHub Release 只能 promote 已通过的 digest，不允许重新 build。
- [ ] P6 `if: always()` 上传 transcript、logs、manifest、process/resource evidence。
- [ ] P7 Linux/macOS blocking matrix；若承诺 Windows，再提供原生 launcher/package job。
- [ ] P8 对最终 Zed WASM 至少 validate/instantiate；nightly/RC 增加真实 Zed host smoke。

实施依赖：P1a release-topology RED（禁止 seal 后任何直接或间接构建）→ P1b deterministic
archive/SHA256 → P8a WASM validate/instantiate → P3/P7 平台 artifact → P4 consume-only
独立 job → P6 allowlisted evidence（外部上传需授权）→ 许可解除后 P5 promote exact digest →
P8b nightly/RC Zed host smoke。

### Wave 6 — 大项目时延与内存（P0 功能全绿后）

2026-09-03 只读审计：现有 455 文件测试只验证 workspace-symbol；所谓
`assertDefinitions` 没有发送 `textDocument/definition`，也没有 didOpen，因此 completion、
真实 definition、diagnostics 均未覆盖。“索引中查询”也未证明 response 先于 ready。
resource sampler 只有注入式 PID 的 unit contract，尚未采集真实 Node/sidecar process tree、
Node heap 或 churn；没有机器可读 raw samples/runner identity/十次基线。下面各项在 P0 其余
四项完成前只允许构建测试基础设施，不启用性能阻断阈值。

- [ ] L1 PR 的 455 文件 artifact E2E 加 completion/definition/diagnostics 与索引中交互。
- [ ] L2 nightly 10k–100k 文件、多 module/root、generated/dependency 噪声 corpus。
- [ ] L3 采集 cold/warm p50/p95/p99、cancel latency、peak/steady RSS、Node heap、sidecar RSS。
- [ ] L4 打开/修改/关闭 churn 与 idle reclaim soak；验证无单调内存增长。
- [ ] L5 固定 runner 连续建立至少 10 次基线，再启用相对回归阈值。
- [ ] L6 初始阻断预算：warm workspace symbol P95 < 100 ms；ready 后 completion/definition
  P95 < 250 ms、P99 < 500 ms；取消生效 < 100 ms；索引期间前台请求不得停顿 > 500 ms。
- [ ] L7 内存阻断采用绝对安全帽 + 相对基线：combined RSS 不超过已批准 hard cap，且
  peak/steady RSS 不得较稳定基线回归 > 10%；阈值及 runner identity 写入 evidence。

#### Wave 6 可执行并行轨

- [ ] A Large semantic landmarks：固定 revision 的 marker manifest；先验证 BuildProfile
  versioned diagnostics，再验证 RHS definition 和 TeamRepo member completion；索引中场景必须
  以 response-vs-terminal 顺序证明真实重叠。
- [ ] B Performance evidence contract：raw samples、nearest-rank p50/p95/p99、fixture/artifact/
  runner identity、至少 10 次独立 run、绝对/相对 verdict；不得先填假 baseline。
- [ ] C Real resource probes：macOS `ps`/Linux `/proc` 可注入 parser，按 PID+start identity
  发现 server/sidecar tree；通过 Node preload 采 heapUsed/heapTotal/external。
- [ ] D Immutable large command：large 层只从 manifest-installed command 启动并记录
  server/sidecar/manifest SHA-256，不再直接消费 repo `dist`/`target`。
- [ ] E Provider latency/cancel：A/B/D 后按 provider 采 30 个 warm raw samples；cold 进 nightly
  10 runs；取消门禁处理“100 ms 内完成”与 `-32800` 的合法竞态。
- [ ] F Churn/reclaim：A/B/C/D 后执行固定文件集 open→change→versioned diagnostics→close，
  用多轮 post-quiescence plateau/slope 判定泄漏，不要求 RSS 单调下降、不以延长 sleep 假绿。
- [ ] G Gate integration（单一 owner）：最后才修改 layer manifest、package scripts、release
  driver/workflow，拆分 PR smoke 与 nightly，并接入经授权的 allowlisted evidence 上传。

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
