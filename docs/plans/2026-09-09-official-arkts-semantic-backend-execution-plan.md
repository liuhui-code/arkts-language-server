# Zed + ArkTS Language Server：官方语义后端与超大型工程低内存执行计划

状态：当前权威执行计划；Foundation、Backend Spike S1–S3 与 Backend Cutover 已完成；semantic
contract 34/34 PASS，lifecycle/memory PASS。Backend Cutover 的本地 `check:fast` 855/855、完整
`check:release` 与 PR #16 canonical `validate` 均已通过并合入 `3729edf`。Memory Runtime 的
单 Worker、Coordinator、L0-L3、metrics 与交付接线已在 `codex/memory-runtime` 完成，本地
`check:fast` 864/864、bundle-e2e 271/271、完整本地 `check:release` 与 PR #17 canonical
`validate` 均已通过，并合入 `68c8b51`。Rust Discovery 的修复后 canonical run
`34347649107` 已通过，PR #18 合入 `38f65e3`。Rule Gap canonical run `34349569571` 已通过，
PR #19 合入 `089419c`；没有 target-SDK golden 证明需要第二规则 provider。Product Gate 已从
该 merge 开始；benchmark infrastructure canonical run `34355082083` 已通过，PR #20 合入
`0e820e2`。完整 Linux/DevEco 测量证据继续单独验收。

计划基线：`e90cacb9ace47292ac0869d09b3a64f7c7fe2144`（P2.1b，PR #5）。

本计划接管 [P1/P2.1 历史执行计划](2026-09-07-large-project-reuse-execution-plan.md)
之后的工作顺序。旧计划继续保存已经合并的工程模型、references freshness、交付和测试证据，
但不再要求先做旧 P2.2；新的首要风险是验证 ETS-aware 官方语义前端能否成为唯一语义真值。

## 1. 目标与不可违反的约束

目标架构收敛为：

> 官方 ArkTS 语义前端 + 薄 SemanticCoordinator + 单语义 Worker + Rust/SQLite 全局发现。

项目竞争力不在重新实现 ArkTS compiler，而在保证语义正确的前提下控制重语义工作集、共享
稳定 compiler 状态、限制常驻 context，并让大 workspace 可发现而无需全部进入 TypeScript/
ArkTS Program。

强制约束：

- 每项能力恰好一个 authoritative owner。
- 生产进程只能有一个主 ArkTS semantic backend。
- `ohos-typescript` 与 `ets2panda` 不得同时常驻。
- Rust index 只召回 discovery candidate，不成为 definition/references/rename 的语义真值。
- 打开的未保存文本只由 `DocumentAuthority` 持有；context 回收不能丢失 overlay。
- correctness gate 优先于 memory 与 latency gate；不得靠截断 references/rename 降低内存。
- 所有行为、缺陷、重构、build/CI 与开发工具变更继续执行仓库 TDD 合同。
- 任一 Phase 未满足退出条件时，不进入下一 Phase。

## 2. 已合并基线

P2.1b 已由 PR #5 合入，merge revision 为
`e90cacb9ace47292ac0869d09b3a64f7c7fe2144`：

- affected suites：246/246；
- 本地 `pnpm check:fast`：827/827，0 fail/cancel/skip/todo；
- GitHub `validate` canonical release gate：SUCCESS；
- inactive target、单物理文件 overlay authority、watcher/fresh 一致性和 catalog-token lazy read
  已成为后端无关 contract 的现有基础；
- call hierarchy 的 rejected relative-call provenance 能沿 named/star/default re-export 传播，且
  不污染无关本地显式导出。

详细证据见 [P2.1b TDD 记录](../tdd/p2-reference-freshness.md)。

## 3. 目标架构与所有权

```mermaid
flowchart TB
    ZED["Zed Extension"] -->|LSP stdio| LSP["LSP Runtime"]
    LSP --> DOC["DocumentAuthority<br/>open overlay / text / version"]
    LSP --> PG["ProjectGraph<br/>module / target / SDK / visibility"]
    LSP --> COORD["SemanticCoordinator<br/>leases / working set / memory policy"]

    COORD --> WORKER["1 × Semantic Worker"]
    WORKER --> BACKEND["Primary ArkTS Semantic Backend"]
    BACKEND --> REG["Shared DocumentRegistry Pool"]
    BACKEND --> CTX["Resident Contexts<br/>initial max = 2"]

    LSP --> INDEX["Rust Sidecar"]
    PG --> INDEX
    INDEX --> DB["Single SQLite/WAL DB<br/>files / modules / symbols / exports / generation"]
    DB -->|discovery candidates| COORD
    COORD -->|semantic validation| BACKEND
```

| 能力 | 唯一 Owner | 其他组件边界 |
|---|---|---|
| LSP 协议、freshness、cancellation、Zed 集成 | `src/lsp/**` | 不拥有 ArkTS AST |
| 当前文本、overlay、document version | `DocumentAuthority` | backend 只读取 snapshot |
| module/target/SDK/声明依赖边界 | `ProjectGraph` | semantic/index 只消费 |
| ArkTS syntax、AST、checker、Program | 主 Semantic Backend | 禁止第二生产 parser/Program |
| completion/hover/definition/references/rename 基础语义 | 主 Semantic Backend | Rust 只召回候选 |
| `$r` 等项目资源存在性 | project resource provider | backend 可提供语言层类型 |
| 已证明缺失的 ArkTS/ArkUI 规则 | optional rule provider | 不得复制常驻 Program |
| workspace symbol/export discovery | Rust sidecar | backend 验证候选 |
| context lease、内存预算、trim/dispose 时机 | `SemanticCoordinator` | 不直接删 AST node |
| SQLite schema/generation/WAL | Rust sidecar | 不建立第二 export DB |

## 4. SDK 配置合同：产品运行时与 Spike 输入分离

`OHOS_SDK_ROOT` 只表示开发、CI、Backend Spike 所使用的可重复输入，不是 Zed 用户必须设置的
运行时环境变量。产品运行时必须支持 Zed 一等配置。

用户级或项目级 `.zed/settings.json`：

```json
{
  "lsp": {
    "arkts-language-server": {
      "initialization_options": {
        "sdk": {
          "path": "/absolute/path/to/openharmony"
        }
      }
    }
  }
}
```

标准 LSP runtime update：

```json
{
  "arkts": {
    "sdk": {
      "path": "/absolute/path/to/openharmony"
    }
  }
}
```

服务端分别从 `InitializeParams.initializationOptions.sdk` 与
`workspace/didChangeConfiguration` 的 `settings.arkts.sdk` 读取。固定优先级：

```text
Zed initialization_options / didChangeConfiguration
    > workspace local.properties sdk.dir
    > ARKLINE_HARMONY_SDK_PATH（兼容入口）
    > platform discovery
```

显式配置无效时 fail closed，发布稳定配置诊断，不静默 fallback。SDK 改变必须取消对应 workspace
的旧请求、保留 open overlays、推进 ProjectGraph semantic identity，并重建而不是污染旧 context。

Zed 现有 `binary.env` 仍是兼容入口，但不是主产品接口：

```json
{
  "lsp": {
    "arkts-language-server": {
      "binary": {
        "env": {
          "ARKLINE_HARMONY_SDK_PATH": "/absolute/path/to/openharmony"
        }
      }
    }
  }
}
```

## 5. Backend 决策门

首选 `openharmony/third_party_typescript`（下称 `ohos-typescript`）。只有它在固定 spike budget
内不能通过 mandatory gate 时，才启动 `ets2panda` fallback spike；失败不能用更多 regex/
virtual rewrite 继续补洞。

```text
ohos-typescript spike
    ├─ semantic contract 100% + SDK/API + lifecycle/memory pass
    │      └─ 成为唯一 Primary Backend
    └─ fixed-budget blocker
           └─ 生成 spike failure report → ets2panda spike
                  ├─ pass → 整体替换 backend
                  └─ fail → 明确 unsupported toolchain
```

以下任一项即判定当前 backend 不通过：

1. mandatory definition/reference/rename identity 或 position mapping 失败；
2. 不能处理目标 SDK/工程实际使用的 ETS 语法；
3. 普通编辑触发不可接受的 SDK/全项目重建，且无可用生命周期控制；
4. context 连续创建/trim/dispose 后常驻内存无界增长；
5. 无法锁定 compiler revision、SDK declaration digest 和许可证身份。

## 6. Backend-neutral 生命周期

Coordinator 必须保持薄，不管理 AST 或估算 node 大小：

```ts
export interface SemanticBackend {
  openProject(input: OpenProjectInput): Promise<ProjectHandle>;
  dispose(): Promise<void>;
}

export interface ProjectHandle {
  query(request: SemanticRequest): Promise<SemanticResponse>;
  trim(): Promise<void>;
  dispose(): Promise<void>;
  stats(): Promise<SemanticContextStats>;
}

export interface SemanticContextLease {
  readonly contextId: string;
  query(request: SemanticRequest): Promise<SemanticResponse>;
  release(): void;
}
```

不变量：

```text
leaseCount > 0  => context 不得 dispose
open document   => 文本始终保存在 DocumentAuthority
disposed        => 下次按最新 ProjectGraph + DocumentAuthority 重建
index result    => 只是 candidate，按 capability 做 semantic validation
```

身份：

```text
SemanticIdentity =
    backend revision
  + SDK declaration digest
  + language mode
  + parser-affecting compiler options
  + ProjectGraph semantic boundary identity

RegistryIdentity =
    backend revision
  + SDK declaration digest
  + language mode
```

不同 SDK digest 或 compiler revision 不共享 registry。

## 7. 单 Worker 与内存策略

首版固定：

```json
{
  "schemaVersion": 1,
  "semanticWorkers": 1,
  "maxResidentContexts": 2,
  "defaultMemoryBudgetMiB": 1024,
  "sampleIntervalMs": 1000,
  "level1Ratio": 0.70,
  "level2Ratio": 0.82,
  "level3Ratio": 0.92,
  "level3TargetRatio": 0.85
}
```

数值是首版策略，不是实测结论；Product Gate 后才能调整。`ARKTS_MEMORY_BUDGET_MB` 可覆盖默认
budget。一个 worker 管理 registry/context，不能把 workspace root 数量映射成 worker 数量。

| Level | 触发 | 动作 | 禁止 |
|---|---:|---|---|
| L0 | `<70%` | 正常运行 | 无 |
| L1 | `70–82%` | 停 preload、清短期结果 cache、降低 discovery 优先级 | Program、overlay |
| L2 | `82–92%` | 对 cold/unleased context 调 `trim()` | leased context、DocumentAuthority |
| L3 | `>=92%` | LRU dispose cold/unleased context，释放空 registry bucket，直到 `<=85%` | leased context、未保存文本、进行中 rename |
| emergency | 无可淘汰对象 | 暂停后台并取消低优先请求 | 近似或截断 rename/references |

只有单 worker correctness/memory 通过，且 profile 证明 p95 瓶颈为 CPU 排队，且两 worker 产品总
PSS 仍过 release gate，才能实验第二 worker。

## 8. 分阶段执行与退出条件

| Phase | 目标 | 退出条件 | 估算 |
|---|---|---|---:|
| Foundation | 固定基线、SDK 配置、toolchain 与 contracts | baseline/配置 transcript 绿；lock 可重现；30+ corpus 就绪 | 1–2 周 |
| Backend Spike | 验证精确 revision 的 `ohos-typescript` | mandatory correctness 100%；SDK/API/lifecycle 无 blocker | 1–2 周 |
| Backend Cutover | 替换生产 semantic composition | 默认路径只创建一个 ETS-aware backend；legacy/virtual semantic path 退出 | 2–4 周 |
| Memory Runtime | 单 worker、registry pool、Coordinator/leases/L0–L3 | churn 无无界增长；freshness/cancel/overlay 全绿 | 2–3 周 |
| Rust Discovery | 在现有 SQLite 增加 exports/visibility/generation | 无第二 DB；>4096 正确 candidate 可发现并验证 | 2–4 周 |
| Rule Gap | 只补 contract 证明的缺失规则 | capability 单 owner；无第二常驻 Program | 1–3 周 |
| Product Gate | 1k–100k + dependency growth + DevEco 对照 | correctness、PSS、eviction、latency 全部过门禁 | 2–4 周+ |

总量按 11–22 人周准备。最大不确定性是目标 HarmonyOS SDK 与可锁定
`ohos-typescript` revision 的兼容性。

## 9. Foundation 可执行清单

### F0：冻结基线

- [x] 记录 P2.1b merge baseline：`e90cacb9ace47292ac0869d09b3a64f7c7fe2144`。
- [x] PR #5 canonical release gate 通过。
- [x] F1 clean parent：`c8234a0bebf0aa08d08f55b184c895f0c9b1dc67`；
  F2 clean parent：`07786a8`（PR #7 merge）。
- [x] 创建 `docs/toolchains/`、`docs/reports/`、`scripts/semantic/`、
  `tests/semantic-contract/`，且不提交 upstream checkout/cache。

### F1：Zed SDK 配置纵切（先 RED）

公开 seam 使用真实 child stdio 和 Content-Length framing：

1. `initializationOptions.sdk.path` 覆盖 workspace `local.properties` 与环境 fallback；
2. `settings.arkts.sdk.path` 热切换后，open unsaved document 保持真值，definition/completion/
   diagnostics 与 fresh process 一致；
3. 无效显式路径 fail closed，并产生稳定 `arkts.sdk.configuration` 诊断；
4. `{}` 清除 Zed override，恢复 `local.properties`/fallback；
5. 两个 workspace 的不同 SDK identity 不互相污染。

每个行为一条 RED→GREEN 纵切。实现不得让 Zed Rust extension 解析 SDK；extension 只转发 Zed 的
标准 LSP initialization options，SDK selection 仍由 server/ProjectGraph 唯一拥有。

完成证据（2026-09-09）：

- [x] `initializationOptions.sdk.path` 覆盖 `local.properties`；
- [x] `settings.arkts.sdk.path` 热切换并保留 open overlay；
- [x] 无效显式路径 fail closed，发布 `arkts.sdk.configuration`；
- [x] `{}` 清除 override 并恢复工程选择；
- [x] 既有单进程双 workspace SDK 隔离契约继续通过。

完整 RED/GREEN 与命令记录见
[`docs/tdd/foundation-zed-sdk-configuration.md`](../tdd/foundation-zed-sdk-configuration.md)。

### F2：锁定 backend revision 与 SDK digest

新增跨平台 Node CLI：

```text
scripts/semantic/lock-toolchain.mjs
```

输入：

```bash
node scripts/semantic/lock-toolchain.mjs \
  --sdk "$OHOS_SDK_ROOT" \
  --api-level "${TARGET_API_LEVEL:-24}" \
  --repo "${OHOS_TS_REPO:-https://github.com/openharmony/third_party_typescript.git}" \
  ${OHOS_TS_REVISION:+--revision "$OHOS_TS_REVISION"}
```

输出 `docs/toolchains/arkts-toolchain.lock.json`：

```json
{
  "schemaVersion": 1,
  "semanticBackend": "openharmony/third_party_typescript",
  "semanticBackendRevision": "40-hex",
  "sdkApiLevel": 24,
  "sdkDeclarationDigest": "64-hex",
  "packageName": null,
  "packageVersion": null
}
```

首次可从 upstream 默认分支解析 revision，但写入后所有后续命令只读取精确 SHA。digest 对相对路径
排序后的 `.d.ts`、`.d.ets`、`.json5` 内容与路径计算，不依赖平台 `sha256sum` 命令。空 SDK、路径
逃逸、符号链接竞态、非普通文件或超过预算必须 fail closed。

完成证据（2026-09-09）：

- [x] 实现跨平台 Node CLI、原子 lock 写入与已有 exact revision 复用；
- [x] digest 同时绑定规范化相对路径、长度与内容；
- [x] 首次无 lock 时通过 `git ls-remote <repo> HEAD` 解析一次；
- [x] 声明输入 symlink、空输入、非普通文件和文件/总量/数量预算 fail closed；
- [x] 已锁定 OpenHarmony API 24 / ETS `6.1.1.125` 本机 SDK：backend revision
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`，declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。

实现证据见 [Foundation F2 TDD 记录](../tdd/foundation-toolchain-lock.md)。

### F3：backend-independent semantic contracts

创建至少30个 manifest 驱动 case：

```text
tests/semantic-contract/
  syntax/
  completion/
  definition/
  references/
  rename/
  diagnostics/
  incomplete/
  unicode/
  project-boundary/
  manifest.json
```

mandatory case 至少包括：struct、string/comment 中的 `struct`、`this.` incomplete、non-BMP UTF-16、
declared/ghost/inactive module、alias re-export、cross-module rename，以及 P2.1b 的 target/overlay/
watcher/catalog-identity contracts。首次 DevEco 人工确认后固化
`tests/oracle/deveco-${TARGET_API_LEVEL}.json`，以后比较 symbol identity、URI、range、diagnostic code
与 edit，不比较“非空”。

完成证据（2026-09-09）：

- [x] manifest 驱动 34 个 mandatory case，覆盖全部 9 个 required categories；
- [x] 29 个 case 绑定唯一、已存在的精确公共 transcript/contract test name；
- [x] `struct`、string/comment token、`this.` incomplete、non-BMP UTF-16 以 raw fixture
  交给 Backend Spike，不通过 legacy rewrite 预处理；
- [x] declared/ghost/inactive module、alias re-export、cross-module rename、target、overlay、
  watcher、catalog identity 均进入 mandatory 集合；
- [ ] DevEco API 24 golden：等待首次受控人工确认，不生成推测结果。

结构、RED/GREEN 和延期 oracle 说明见
[Foundation F3 TDD 记录](../tdd/foundation-semantic-contracts.md)。

Foundation 退出命令：

```bash
pnpm check:fast
git diff --check
```

并验证 lock schema、case count、required categories。未满足则停止。

Foundation 退出证据（2026-09-09）：

- [x] `pnpm check:fast`：839/839，0 fail/cancel/skip/todo；
- [x] `git diff --check`；
- [x] toolchain lock schema、34 个 case 与 9 个 required categories 均由 fast gate 验证；
- [ ] DevEco API 24 golden 不属于自动化 Foundation 退出门禁，仍等待首次受控人工确认。

## 10. Backend Spike 清单

### S1：获取精确 upstream

checkout 位于未跟踪的 `.cache/upstream/ohos-typescript`，只 checkout lock 中的 SHA；记录 LICENSE
SHA-256、package name/version、build command 和实际 compiler API identity。不得把 upstream 源码
复制进 `src/`。

完成证据（2026-09-09）：

- [x] `.cache/upstream/ohos-typescript` 由 `.gitignore` 排除，并以 sparse detached checkout
  精确固定在 `9cc62fe98f47c0bf113676e3fb33fe932b493052`；
- [x] package identity：`ohos-typescript@4.9.5-r4`；
- [x] compiler build script：`build:compiler = hereby local`；
- [x] 已加载 `lib/typescript.js` 并验证 compiler `4.9.5`、`ScriptKind.ETS = 8`、
  `createLanguageService` 与 `createDocumentRegistry`；
- [x] LICENSE SHA-256：
  `a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47`；
- [x] toolchain lock、license digest 和
  [upstream identity report](../reports/ohos-typescript-upstream.json) 由 fast unit contract
  交叉验证；upstream checkout 不进入 production source graph。
- [x] `pnpm check:fast`：843/843，0 fail/cancel/skip/todo。

RED/GREEN 与可复现命令见 [Backend Spike S1 TDD 记录](../tdd/backend-spike-upstream-identity.md)。

### S2：独立 spike host

```text
scripts/semantic/ohos-typescript-spike/
  package.json
  backend-host.mjs
  run.mjs
```

Spike 通过前禁止 production 接线：

```bash
! rg -q 'ohos-typescript' src/lsp src/composition
```

输出 `docs/reports/ohos-typescript-spike.json`，至少包含 backend/sdk identity、总 case 数、每 category
passed/failed、position mapping failure、重建/文件读取计数与 lifecycle memory runs。

强制 PASS：

```text
semantic_contract_failures == 0
position_mapping_failures == 0
target_visibility_failures == 0
```

失败时生成 `docs/reports/ohos-typescript-spike-failure.md` 并以固定非零码停止 A 方案；不得修改
virtual document 添加 workaround。只有此时才建立 `ets2panda` fallback spike。

S2a 完成证据（2026-09-09）：

- [x] 独立 host 直接加载锁定的 compiler module，不接入 LSP 或 production composition；
- [x] 3 个 syntax fixture 验证真正的 StructDeclaration，string/comment token 不被误解析；
- [x] incomplete this-dot 返回 value、refresh completion；
- [x] non-BMP fixture 在 UTF-16 position round-trip 后返回 Greeter completion；
- [x] 目标 API 24 SDK 的 @ohos.hilog declaration parse smoke 为 0 syntax diagnostics；
- [x] report hard-bound 为 64 KiB，context 在记录 stats 前已经 dispose；
- [x] 默认命令对 INCOMPLETE 返回 42；仅显式 allow-incomplete 可保存阶段证据；
- [x] `pnpm check:fast`：847/847，0 fail/cancel/skip/todo；
- [x] 其余 29 个公共 transcript 已由 S2b–S2d 转成 direct official-backend scenario；
  S2a 当时的 INCOMPLETE 状态未被改写或跳过。

this-dot 编辑尾部当前观测到 TS1003，但 DevEco oracle 尚未确认，因此 S2a 只以 completion
可用性作 gate，不把“无诊断”伪造成已确认合同。RED/GREEN 记录见
[Backend Spike S2a TDD 记录](../tdd/backend-spike-host.md)。

S2b core semantic batch 完成证据（2026-09-09）：

- [x] completion 直接覆盖 inherited member、imported receiver 与 unopened auto-import；
- [x] definition 直接覆盖 non-BMP 前缀、ETS struct member 与 alias re-export origin；
- [x] diagnostics 直接覆盖 TS2552 code 与精确 UTF-16 span；
- [x] Unicode identifier completion 验证过滤结果与 replacement span；
- [x] 8 个 scenario 均直接调用锁定 backend，所有 context 均在证据记录前 dispose；
- [x] 当前 [spike report](../reports/ohos-typescript-spike.json) 为 13 passed、0 failed、
  21 deferred，仍为 INCOMPLETE；
- [x] `pnpm check:fast`：848/848，0 fail/cancel/skip/todo；
- [x] references/rename 已由 S2c 直接执行；SDK hot switch、freshness 与 project-boundary
  留给后续 batch。

RED/GREEN 与可复现命令见
[Backend Spike S2b core contracts TDD 记录](../tdd/backend-spike-core-contracts.md)。

S2c references/rename batch 完成证据（2026-09-09）：

- [x] references 直接覆盖 barrel/unopened consumer 与精确 source span；
- [x] overlay version 更新后旧 reference 消失，新 reference 成为唯一真值；
- [x] 80 个未打开 consumer 的完整集合包含第 80 个文件，不受 resident window 影响；
- [x] 新 materialized target source 加入 root file set 后下一查询可见；
- [x] public/explicit barrel alias rename 覆盖所有 consumer 且不修改 origin identity；
- [x] non-BMP 后 prepare rename 返回精确 UTF-16 trigger span；
- [x] same-scope rename candidate 经独立 semantic validation 暴露 TS2451，允许上层原子拒绝；
- [x] 当前 [spike report](../reports/ohos-typescript-spike.json) 为 21 passed、0 failed、
  13 deferred，仍为 INCOMPLETE；
- [x] `pnpm check:fast`：849/849，0 fail/cancel/skip/todo；
- [x] SDK hot switch、diagnostic freshness、result-limit policy、partial-membership fail-closed 与
  project-boundary 已由 S2d 直接执行。

RED/GREEN 与可复现命令见
[Backend Spike S2c references/rename TDD 记录](../tdd/backend-spike-references-rename.md)。

S2d ownership-boundary batch 完成证据（2026-09-09）：

- [x] SDK context 切换只保留 DocumentAuthority 提供的 overlay，旧 SDK global 不泄漏；
- [x] cross-module definition 与 overlay diagnostic freshness 直接通过 backend；
- [x] invalid SDK 不发生隐式 fallback，并明确由 ProjectGraph 生成配置诊断；
- [x] backend 返回 129 个完整 completion candidate，LSP policy 截为 128 并标 incomplete；
- [x] partial/complete membership 对照证明 Coordinator 必须在 partial 时 fail closed；
- [x] declared/ghost/inactive/target-switch file set 按 ProjectGraph ownership 隔离；
- [x] overlay、watcher create/change/delete 与 catalog identity 均在下一 backend query 可见；
- [x] [spike report](../reports/ohos-typescript-spike.json) 为 `PASS`：34 passed、0 failed、
  0 deferred、position mapping failure 0、target visibility failure 0；
- [x] 所有 direct context 均在 report stats 前 dispose，报告不含本机绝对路径；
- [x] `pnpm check:fast`：850/850，0 fail/cancel/skip/todo；
- [x] 20 次 context lifecycle churn 与进程 memory 回落已由 S3 通过，允许进入 cutover。

RED/GREEN 与可复现命令见
[Backend Spike S2d boundary contracts TDD 记录](../tdd/backend-spike-boundary-contracts.md)。

### S3：lifecycle 与 memory spike

S2d 只关闭 semantic correctness gate。进入 Backend Cutover 前必须继续满足：

- [x] 同一 SDK/context identity 的 10 次稳定查询新增 snapshot read/materialization 均为 0；
- [x] 普通 overlay comment edit 虽使 compiler 重新请求 2,271 个 root snapshot，但共享 immutable
  snapshot pool 仅物化已变更文档 1 次，未重新物化 SDK declaration set；
- [x] 连续 20 次 context create/query/dispose 后 RSS 增长 0，heap 增长 1,456,160 bytes，低于
  96 MiB/32 MiB 固定门禁；
- [x] `cleanupSemanticCache()` 调用 1 次、`dispose()` 调用 21 次，所有 churn context 共享同一
  DocumentRegistry 与 snapshot pool；
- [x] 删除、SDK switch 与 target switch 的重建策略已由 S2d direct scenarios 证明保留最新
  DocumentAuthority overlay；
- [x] [lifecycle/memory report](../reports/ohos-typescript-lifecycle.json) 已进入 fast unit acceptance
  gate，要求精确 backend/SDK identity、20 个样本、固定增长阈值且不含本机路径。

S3 完成证据（2026-09-09）：目标 API 24 SDK 包含 2,150 个 declaration files；首轮真实运行
发现普通注释编辑会触发 2,271 次 snapshot 重新物化并 FAIL。修正为按 file path + version 缓存、
以 text equality 防御 identity 冲突后，稳定查询零物化、编辑仅物化当前文件一次，20 次 churn
通过。RED/GREEN 与复现命令见
[Backend Spike S3 lifecycle/memory TDD 记录](../tdd/backend-spike-lifecycle-memory.md)。

S3 任一项失败时 Backend Cutover 保持关闭；不得以 regex rewrite 或双 backend 常驻规避。

## 11. Backend Cutover 清单

新增 backend-neutral interface 与 adapter：

```text
src/semantic/backends/semantic-backend.ts
src/semantic/backends/ohos-typescript/
  engine.ts
  host.ts
  identity.ts
  registry-pool.ts
```

`semantic-backend.ts` 不得 import TypeScript、ohos-typescript、SQLite 或 LSP types。先以真实 LSP
transcript characterization RED 驱动 production composition 切换；只有 capability transcript
GREEN 后才能继续 advertise。

退出条件：

- production graph 恰好一个 `SemanticBackend`；
- 默认路径不再实例化 vanilla `LegacySemanticEngine`；
- `ohos-typescript` 与 `es2panda` 不能同时 active；
- engine constructor 不直接 `createDocumentRegistry()`；
- ETS-aware parser 通过 mapping contracts 后，
  `src/core/virtual/arkts-virtual-document.ts` 不再承担生产语义改写并从该路径删除；
- `pnpm check:fast` 与 `pnpm check:release` 全绿。

当前证据（2026-09-09）：production package 已锁为 `ohos-typescript@4.9.5-r4`；默认 composition
只有一个 official backend factory；shared registry pool 已接入；virtual rewrite 文件已删除；
SDK runtime configuration、module resolution、definition/references/rename、struct call hierarchy、
ArkUI 与 formatting 回归均已关闭。macOS lexical/physical workspace alias 下的 overlay close
membership 回归已固定；conformance SDK 已补官方 ETS loader 配置。本地 `pnpm check:fast`
855/855 PASS，完整 `check:release` 通过，其中 artifact 6/6、真实 455-file large fixture 1/1。
RED/GREEN 与完整适配边界见 [Backend Cutover TDD 记录](../tdd/backend-cutover.md)。PR #16 的
canonical `validate`（run `34331750083`）用时 7m03s 通过，本 Phase 已关闭。

## 12. Memory Runtime 清单

提交 `config/semantic-runtime.json`，实现：

```text
src/semantic/coordinator/
  semantic-coordinator.ts
  context-lease.ts
  memory-policy.ts
  metrics.ts
```

必须通过公开行为：

- lease=1 + L3 不 dispose；
- lease=0 + cold + L3 dispose；
- L2 先 trim；
- resident contexts 永远 `<=2`；
- dispose 后下一请求按最新 graph/overlay 重建；
- open overlay 跨 rebuild；
- worker count 恒为1；
- 20轮 context create/trim/dispose 无无界常驻增长。

metrics JSONL 至少含 worker/context 数、RSS、heapUsed、external、arrayBuffers、projectFiles、
openDocuments 和 leaseCount。Node worker thread memory 不与 process RSS 重复相加。

当前证据（2026-09-09）：

- [x] 唯一生产 worker multiplex 所有 workspace root，production composition 不在协议线程创建
  official backend；
- [x] `SemanticCoordinator` 唯一拥有 context set，lease pin、LRU、L2 trim、L3 dispose 与重建
  contract 均通过；
- [x] runtime 固定 `semanticWorkers=1`、`maxResidentContexts=2`，支持
  `ARKTS_MEMORY_BUDGET_MB` 覆盖 budget；
- [x] metrics JSONL 覆盖进程内存、worker/context、project/open document 与 lease；
- [x] 20 轮 context:req/trim/dispose 后 resident context 为 0；
- [x] 1 MiB 压力测试证明 Level3 后最新 open overlay 可重建并完成 completion；
- [x] Zed initialization/runtime SDK 路径切换、SDK identity 日志、所有语义能力与 artifact
  adjacency 回归通过；
- [x] bundle-e2e 271/271，`pnpm check:fast` 864/864；
- [x] 本地完整 `pnpm check:release` 通过：artifact 6/6、真实 455-file large fixture 1/1；
- [x] canonical PR `validate`（run `34340965128`）通过，PR #17 合入 `68c8b51`。

RED/GREEN、回归分类与复现命令见 [Memory Runtime TDD 记录](../tdd/memory-runtime.md)。在最后一项
该 Phase 已关闭，Rust Discovery 从 `68c8b51` 开始。

## 13. Rust Discovery 清单

只扩展现有 `index-sqlite` migration，禁止 `export-index.db`、`exports.sqlite` 或第二 workspace
metadata DB。逻辑 export schema 包含：workspace/generation/file/module、exported name/folded name、
symbol kind、declaration identity、import specifier 和 target scope。

验收：

- 旧 generation 在新 generation commit 前可查询；
- commit 原子切换；cancel 不暴露 partial generation；
- 5000 exports fixture 的正确 candidate 位于4999，仍能由 Rust prefix query 召回，再由 semantic
  backend 验证并产生正确 import edit；
- 不通过调大现有4096常量掩盖 discovery 缺口。

Rust 变更运行 focused crate tests、`pnpm check:fast` 和相关 release build。

当前证据（2026-09-09）：

- [x] 现有 `symbols-v2.sqlite3` 原地迁移到 schema v3；旧 generation/symbol 保留，未创建第二 DB；
- [x] export metadata 与 workspace symbols 在同一 WAL transaction/generation 中提交；
- [x] MemoryStore 与 SQLite store 的 export prefix query 契约一致；
- [x] 真实 sidecar `exports/search` 返回严格解码、URI rebasing、generation 与 completeness；
- [x] 5000-export fixture 的 `ExactNeedleExport` 位于 ordinal 4999，Rust 重启后仍可召回；
- [x] 单 semantic worker 只接受名称与 module source 匹配、且
  `getCompletionEntryDetails()` 验证成功的官方 completion entry；
- [x] 真实 LSP completion/resolve 产生指向 `ManyExports` 的 import edit；4096 常量保持不变；
- [x] CI RED run `34345757995` 的 5 秒 catalog/debug-binary 时序已移除：真实 Rust 子进程负责
  ordinal 4999 的规模与持久化证据，真实 LSP 通过密封 protocol fixture 验证 production
  `exports/search` 请求、官方 semantic validation 与 resolve edit；
- [x] `cargo fmt`、三 crate clippy/tests、release sidecar build 全绿；
- [x] `pnpm check:fast` 867/867；完整本地 `pnpm check:release` 通过：artifact 6/6，
  455-file large 1/1（cold 597.73 ms；warm first 3.90 ms；repeated P95 2.39 ms）；
- [x] canonical PR `validate`（run `34347649107`）通过，PR #18 合入 `38f65e3`。

RED/GREEN 与复现命令见 [Rust Discovery TDD 记录](../tdd/rust-discovery.md)。该 Phase 已关闭，
Rule Gap 从 `38f65e3` 开始。

## 14. Rule Gap 清单

提交 `docs/semantic-capability-matrix.json`，每项只能是单个 owner。初始 owner：syntax/types/
completion/definition/references/rename 均为 primary backend；resource existence 为 project resource
provider；ArkTS restrictions 与 ArkUI structural rules 先保持 unassigned。

只有 golden 明确证明 primary backend 缺少目标 SDK 的 diagnostic，才能引入
`ets2panda-linter` 或 ACE ArkUI rule provider。若不能共享 parser/Program，则只允许后台/按需或
禁用，不能在普通编辑中新增第二常驻 Program。

当前证据（2026-09-09）：

- [x] `docs/semantic-capability-matrix.json` 对每项 capability 只接受一个 string owner；
- [x] syntax/types/completion/definition/references/rename 的唯一 owner 为 `ohos-typescript`；
- [x] resource existence 的唯一 owner 为 `project-resource-provider`；
- [x] ArkTS restrictions 与 ArkUI structural rules 保持 `unassigned`，未在无 golden 的情况下
  引入 `ets2panda` 或 ACE provider；
- [x] normal semantic sources 只有一个 `createLanguageService()`，没有 `createProgram()`；资源
  provider 不创建 Language Service、Program 或 DocumentRegistry；
- [x] `pnpm check:fast` 869/869，0 fail/cancel/skip/todo；
- [x] canonical PR `validate`（run `34349569571`）通过，PR #19 合入 `089419c`。

RED/GREEN 与复现命令见 [Rule Gap TDD 记录](../tdd/rule-gap.md)。该 Phase 已关闭，Product Gate
从 `089419c` 开始。

## 15. Product Gate 清单

生成两组确定性 fixture：

1. unrelated growth：workspace 1k/10k/50k/100k，active dependency 固定200；
2. dependency growth：workspace 固定100k，active dependency 200/1k/5k/10k。

固定 cold(3)、warm(10)、stress(5) 工作流；stress 访问20 module、回到第一个、触发 L3、再请求
completion。Linux 采集 `/proc/<pid>/status` VmRSS 与 `smaps_rollup` PSS；macOS 本地采样仅作开发
反馈，正式可比 gate 在固定 Linux runner 上执行。

产品 PSS：Zed process tree + ArkTS server process + Rust sidecar；Node process RSS 只计一次。
DevEco 对照固定 IDE/JDK/SDK/workspace/config 和进程集合，不含 emulator/build/device manager，
除非两边都启用同类任务。

初始 release gate：

```json
{
  "schemaVersion": 1,
  "devecoComparison": {
    "steadyPssRatioMax": 0.75,
    "peakPssRatioMax": 0.85
  },
  "unrelatedWorkspaceScaling": {
    "pss100kOver10kMax": 1.25
  },
  "postEviction": {
    "pssOverInitialWarmMax": 1.20
  },
  "correctness": {
    "allowedContractFailures": 0
  },
  "latencyRegression": {
    "warmP95OverBaselineMax": 1.25
  }
}
```

这些是产品发布目标，不是当前性能预测；不能为让结果通过而自动放宽。

当前证据（2026-09-09）：

- [x] `generate-large-fixture.mjs` 严格生成确定性 topology，拒绝覆盖已有目录；
- [x] unrelated 1k/10k/50k/100k（active=200）与 dependency 100k×200/1k/5k/10k 已本地生成，
  实际文件总数分别验证为 161,000 与复用 200 档后的新增 300,000；
- [x] `product-benchmark-workflow.json` 固定 cold/warm/stress=3/10/5、交互步骤、20-module stress
  与进程计数边界；
- [x] Linux `process-memory.sh` 从 `status`/`smaps_rollup` 严格读取单 PID RSS/PSS，输出 bytes；
- [x] `memory-release-gates.json` 与 `assert-release-gates.mjs` 已实现所有 correctness、PSS、
  scaling、eviction 与 latency gate，identity/workflow 不一致时 fail closed；
- [x] [Product Gate benchmark protocol](../benchmarks/product-gate.md) 固定生成、环境、工作流、
  进程归属和最终命令；
- [x] macOS 上完成 API 24、455-file 真实工程与 10k/100k 的 3/10/5 生产 stdio E2E；100k
  completion/definition/references/edit/L3 rebuild 全绿，详见
  [Mac Product Gate 摘要](../reports/macos-product-gate-summary.md)；
- [x] 455-file 真实工程打开真实 `TeamAvatarPage.ets` 后完成 member completion、跨 module
  definition、4-location references、prepareRename 与 2-file/4-edit transactional rename；过程中
  发现并修复 `oh-package.json5` 裸 `../module` 本地依赖解析缺口，详见
  [真实工程语义 E2E 证据](../reports/macos-real-project-semantic-e2e.json)；
- [x] 隔离 Zed 1.18.0 profile 打开 100k workspace，catalog 100000/100000，Zed 自动语义请求、
  server/sidecar 进程链及 `.zed/settings.json` 自定义 API 24 SDK 均已验证；
- [x] 修正 fixture ownership：无关文件位于声明 module 之外；10k/100k 的 semantic project
  file count 均固定为 201，steady RSS 比率 1.034；
- [ ] macOS L3 后 RSS 回落仍为 initial warm 的 1.282，高于 1.20 目标；需用 heap/PSS 继续区分
  live retention 与 allocator retained pages；
- [ ] 固定 Linux/cgroup 环境完成 Zed + server + sidecar 的 3/10/5 测量；
- [ ] 同一 identity 下完成首次 DevEco UI workflow 与进程归属确认；
- [ ] `memory-zed-arkts.json` / `memory-deveco.json` 通过两行 release gate；
- [x] benchmark infrastructure 的 `pnpm check:fast` 876/876，0 fail/cancel/skip/todo；
- [x] benchmark infrastructure canonical PR `validate`（run `34355082083`）通过，PR #20 合入
  `0e820e2`；
- [ ] 最终 measurement evidence PR 通过同一 canonical gate 并合入。

当前 host 为 macOS，不能提供计划要求的 Linux `smaps_rollup` PSS；禁止把本地 RSS 或占位 JSON
标记为 release PASS。RED/GREEN 与复现命令见 [Product Gate TDD 记录](../tdd/product-gate.md)。

## 16. 完成定义与开放输入

最终发布必须同时满足 semantic correctness、memory、DevEco comparison 和 latency/cancellation。
顺序固定：

```text
语义正确性 > 结果完整性 > 内存 > 时延 > 能力数量
```

当前仍需在相应 Phase 提供或解析的外部输入：

| 输入 | 何时需要 | 规则 |
|---|---|---|
| `OHOS_SDK_ROOT` | F2/S1 开发或 CI | 不作为 Zed 产品配置 |
| `TARGET_API_LEVEL` | F2 | 默认24，但写入 lock 后固定 |
| `OHOS_TS_REVISION` | F2 | 可首次解析，随后只用40位 SHA |
| `ets2panda` revision | A 方案失败后 | 未失败不得提前引入 |
| DevEco/JDK/version/config | Product Gate | 写入 benchmark manifest |

每一 Phase 的实现使用独立分支和 PR；只有当前 Phase exit gate 全绿并合入后，才开始下一 Phase。
