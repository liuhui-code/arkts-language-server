# ArkTS semantic worker 与真实取消执行计划

状态：In progress（T1/T2/T3/T4a/T4b/T4c 与部分 T4d GREEN，production composition 未启用）

日期：2026-09-06

依赖：P0/P1 基础语言能力、真实 stdio harness、immutable artifact 与性能证据 contract

## 文档变更的 TDD 例外

- 原因：本文件固化只读架构审计与后续 RED checklist，不改变运行行为。
- 影响范围：仅本文件。
- Owner：ArkTS Language Server maintainers。
- 到期日：2026-09-13；首个实现切片必须恢复严格 RED → GREEN。

## 1. 要解决的真实问题

当前 semantic API 返回 Promise，但 `LegacySemanticEngine` 在第一个 `await` 前同步完成项目枚举、
TypeScript Language Service 查询和结果映射。stdio、`didChange`、`$/cancelRequest` 与 semantic
查询又共享一个 Node event loop。因此现有 AbortController 只能在计算结束后丢弃旧结果，无法：

- 在 TypeScript 查询运行时处理 client cancel；
- 在全局查询运行时及时应用 didChange；
- 保证大型项目的 completion/definition 不阻塞协议、日志和生命周期消息；
- 把 scripted backend 的 cancellation GREEN 当作 production cancellation 证据。

关键调用链：

```text
stdio handler
  -> SemanticRequestRunner
  -> LegacySemanticEngine (async signature, synchronous body)
  -> SemanticDocumentStore synchronous enumeration/read
  -> TypeScript LanguageService synchronous query/mapping
```

当前 TypeScript host 未实现 `getCancellationToken`；仅向另一个 event loop 发送
`postMessage("cancel")` 也无效，因为该 worker 在同步 TypeScript 调用期间同样无法处理消息。
TypeScript 5.9.2 在 `createLanguageService` 时只获取一次 host cancellation token，
因此 T4 必须注入一个稳定 adapter 对象；该对象每次检查时原子读取当前请求的
SAB cell，不能为每个请求返回新 token。

## 2. 架构决策

采用有界、长驻、per-root 的 `worker_threads`：

- 每个 workspace root 一个单写者 worker，一个 TypeScript LanguageService/Program；
- 主线程只拥有 LSP transport、freshness lane、路由和最新 overlay journal；
- 每个请求分配独立 `SharedArrayBuffer(4)` cancellation cell；
- 主线程收到 didChange 或 `$cancelRequest` 时直接 `Atomics.store`，不依赖 worker event loop；
- TypeScript host 的 `getCancellationToken()` 与 workspace 自有循环同步读取该 cell；
- 每 root 最多 1 条执行中的 worker command、64 条 pending request；busy 时同 URI mutation
  只保留最新版本；queued mutation 另设 32 documents / 4 MiB aggregate hard cap，禁止无界
  全文 clone 队列；
- worker 退出、返回 terminal response 或 supervisor dispose 前，不释放 cancel cell/listener；
- root 数继续受现有 4-root LRU 约束，最终上限必须由真实 RSS/heap evidence 校准。

不采用请求级 worker：Program、DocumentRegistry、ArkUI virtual document 等不可 structured clone，
每请求重建会恶化冷时延和峰值内存。child process 保留为未来 hard isolation 选项；普通 IPC cancel
仍无法打断同步 JS，除非另建共享/原生取消通道。

## 3. 版本化 worker 协议

消息只能包含 allowlisted、bounded、可 clone 数据：

```text
mutation:
  { protocol, epoch, revision, kind, uri, documentVersion, text? }
  | { protocol, epoch, revision, kind: workspaceFilesChanged,
      rootUri, rootDirty, resourceDirty, resourceChanged, changes }

mutationAck:
  { protocol, epoch, appliedRevision }

request:
  { protocol, epoch, id, requiredRevision, method,
    uri, expectedDocumentVersion, args, cancelCell }

response:
  { protocol, epoch, id, appliedRevision,
    documentVersion, ok, value | error }
```

规则：

- query 不携带 `DocumentSnapshot.text`、AbortSignal、function 或 mutable Map；
- open/change 时发送一次最新全文，query 仅按 URI/version 引用 worker snapshot；
- mutation 必须无 revision gap 应用并 ACK；query 只能在所需 revision ACK 后 dispatch；
- response 的 epoch、revision、documentVersion 任一不匹配都 fail closed；
- outer `RequestFreshness` 保留为最后一道结果 fence；
- protocol/version/method/payload 大小、pending 数和单文档字节数全部硬限制；
- 不复用旧 `src/core/protocol.ts` 的 v6 union，它不覆盖当前语义能力且没有实际 owner。

## 4. Cancellation cell 生命周期

每请求创建新的 4-byte cell，禁止复用以避免 ABA。Supervisor 返回 typed request handle，
调用方必须用 `cancel(reason)` 传首因，禁止从 AbortSignal 的 Error message 猜测：

```text
0 = active
1 = client cancelled
2 = content modified / superseded
3 = supervisor disposing / worker failed
```

cancel cell 与 `RequestFreshness` 都必须 first-cause-wins：client → mutation 仍是 client cancel，
mutation → client 仍是 content modified。freshness callback 曾会无条件覆盖首因；现已用 exported
typed `RequestAbortError` 和真实 stdio 双向用例修复（`dce6b63`），T6 可以传 typed reason，禁止
解析 error message。

Abort listener 只执行原子状态转换和 `Atomics.notify`。worker dispatcher 把当前 cell 暴露给：

- TypeScript `LanguageServiceHost.getCancellationToken()`；
- ProjectSet/membership 枚举循环；
- dependency closure、references/rename/result mapping 的周期检查点。

不能先向 client 返回已 dispatch 请求的取消、再让 worker 后台继续计算。已 dispatch 的 active
record/cell 只有在 worker 确认 terminal、worker exit，或 bounded dispose 超时并 terminate 后才能
释放；尚未 dispatch 的 queued request 没有后台计算，可在取消时立即从队列移除并拒绝。仅
waiting queue 的 64 cells × 4 roots × 4 bytes 为 1024 bytes，另有每 root 最多一个 active cell
（合计最多 16 bytes）；因此
supervisor-retained cancel cells 的原始共享内存总上限为 1040 bytes。Map/listener/消息对象开销仍需
由 heap evidence 测量。

## 5. 状态、崩溃与恢复

- 每 root 维护单调 `epoch`、`stateGeneration` 与 `wireRevision`；worker crash 后旧 epoch 全部请求
  失败。每次接受同 root mutation 都推进 `stateGeneration` 并使 root-dependent query stale；只有
  mutation 实际 dispatch 时才分配 gapless `wireRevision`，被 coalesce 的版本不得制造 revision gap。
- rename/code action 等有副作用语义的请求绝不自动重放。
- supervisor 只保留最新 open overlays 的有界 journal；busy 时合并同 URI 旧版本。
- queued mutation 最多保留 32 个不同 document、合计 4 MiB UTF-8；替换同 URI 时先扣除旧 bytes，
  超一个 document 或一个 byte 都 fail closed/restart-required，不得静默丢状态。
- 恢复使用 `restoreBegin -> <=32 documents / <=4 MiB chunks -> restoreCommit`；commit 前不接 query。
- replay 期间的新 mutation 在主线程按 revision 合并，commit 后顺序 flush。
- 若所有 open overlays 无法在批准的总 cap 内完整保存，root 标记 non-replayable；crash 后返回固定
  restart-required 错误，不得用部分 overlay 恢复制造错误语义。
- 允许一次立即 restart；滚动窗口内最多 3 次，超过后 root degraded，防止 crash loop。
- 新 worker 的 ProjectSet ready 前，全局查询 fail closed；本地/单文档能力可在 overlay 恢复后先用。

## 6. 查询完整性与调度优先级

必须 workspace-complete：references、rename、implementation。implementation 当前返回
`Location[]`，还不能区分“无实现”与“membership partial”，迁移时必须补 outcome contract。

不要求 workspace-complete：definition、typeDefinition、hover、signature、diagnostics、code
action、document symbol/highlight。但这些 TypeScript 查询仍依赖同 root Program snapshot，同 root
任意 accepted mutation 都必须以 `stateGeneration` 使其 stale。folding/formatting 是纯文档能力，
保留在主线程，不进入 semantic worker 调度。

completion 必须拆 lane：

- member/local completion 不得触发同步 root scan；
- auto-import 才依赖 ProjectSet，warming/partial 时用 `CompletionList.isIncomplete`；
- foreground completion/hover/definition 优先于 diagnostics 与 background warmup；
- worker 化只解决 event-loop lag，不自动解决查询自身的冷时延或全项目 Program 内存。

## 7. 首个无 sleep 的真实 stdio RED

新增 `tests/lsp-semantic-worker-responsiveness.test.mjs`，使用真实 `LspProcess` 和
Content-Length framing。blocking fixture 进入 references 后发标准 `window/logMessage` barrier，
再同步阻塞；内部 failsafe 仅防测试永挂，不作为性能断言。

Case A — 协议响应与 client cancel：

1. initialize/open v1，发 references id=10；等待 `worker request 10 entered` barrier。
2. 发畸形 documentHighlight id=11；它应由主线程立即返回 `-32602`。
3. 断言 id=11 必须先于 id=10；当前主线程同步实现会反序，形成稳定 RED。
4. 发 `$cancelRequest` id=10；必须收到 `-32800`。
5. 随后 cheap completion 必须成功，证明 worker 真正停止，而不是只提前回取消响应。

Case B — didChange freshness 与 mutation ordering：

1. 新 session 的 blocking references id=20 进入 barrier。
2. 发 didChange v2，不额外发送 client cancel；旧请求必须返回 `-32801`。
3. 发 completion id=21；结果必须来自 v2，证明 cancel cell、revision ACK 和 overlay 顺序同时生效。

唯一 focused 命令：

```sh
node --test tests/lsp-semantic-worker-responsiveness.test.mjs
```

## 8. 垂直实施 checklist

- [x] T1 Test seam：blocking server/worker fixture、临时 worker bundle helper；不得共写 repo
  `dist`（`e95a260`）。production responsiveness tracer 仍属于 T6，不因 seam GREEN 提前认领。
- [x] T2 Protocol：严格的 `worker-protocol.ts` document/workspace mutation、ACK、18-method
  query-by-reference、response/canonical error codec 与大小/epoch/id/revision/SAB 单测
  （`6a22536`）；对抗复审又补齐 object-`undefined` 省略、非递归 canonicalize/早停
  wire measure、65,536-node 结果上限、真实 `MessageChannel`、file URL 可转换性与
  NUL/encoded-separator 拒绝（`bba2e5a`）；canonical round-trip 又拒绝同一文件的 percent-encoding
  别名形成不同 scheduler identity（`742a924`）。Call Hierarchy 的 method-specific result codec
  与 supervisor method-aware response validation 已闭环（`1ef51ef`、`2c690c3`）；其余方法的
  method-specific result schema、realpath/symlink containment，以及 dispatcher/endpoint/production
  proxy 仍必须在 T5/T6 前闭环。
- [x] T3 Supervisor：per-root single-flight、64 waiting requests、mutation priority/coalescing、
  terminal cleanup、dispatch-time gapless revision、32 docs/4 MiB UTF-8 mutation cap、workspace invalidation
  aggregate cap、strict response fence、root isolation 与幂等 dispose/fail-closed state machine（`e4ecaf3`、
  `8ce9a16`）。加固后同时限制 32 个文档和 32 条 mutation records，不跨
  document/workspace barrier 合并；hostile accessor 不执行，malformed-overbound 不污染 root，
  client/content-modified 首因不被 fault 覆盖。该切片只证明注入 endpoint 上的
  确定性状态机，不是 production cancellation 证据；deadline 后不响应的 endpoint
  会成为 detached orphan，真实 endpoint 仍必须证明 hard termination 有界。
- [ ] T4 TS cancellation：
  - [x] T4a 稳定 token adapter + per-root `run(cell, operation)` 生命周期；拒绝 nested scope，
    entry/finally 设置/清空 active cell，无 active 时固定为 not-cancelled（`3d8f07f`）。对抗复审随后
    用伪造 `SharedArrayBuffer.byteLength` getter 复现 exact-cell 绕过和校验期重入；协议现改用 intrinsic
    byte/max-byte-length brand check、拒绝 growable cell，并固定为单元素 view（`367988c`）。focused
    protocol + scope 为 `30/30`，测试层登记为 `5b5fcde`。
  - [x] T4b host bridge 真实证据：无 sleep 的 RED 由
    `tests/semantic/typescript-cancellation-bridge.test.mjs` 建立；在 TypeScript lazy
    `getScriptSnapshot` 中同步翻转 SAB 后，当前 `findReferences` 仍正常返回，只有 scope exit
    checkpoint 抛取消。GREEN 将同一稳定 `ts.HostCancellationToken` 注入 Language Service host，
    已证明异常在 `engine.references` 栈内成为真实 `ts.OperationCanceledException`（`42eead1`）。
    该提交只完成 host bridge；dispatcher composition 与自有 mapping 循环检查点仍不能据此宣称
    production request 已可取消。
  - [x] T4c DocumentStore 取消：第一批 membership slice 已引入 core-owned
    `SemanticOperationControl`，完成逐 directory entry checkpoint、iterator/descriptor 穷尽清理，
    并把 refresh 改为 local candidate → old-authoritative reconcile → 不可中断 commit；取消后旧快照
    仍有效且重试可检出 delta，partial candidate 不推断 removals（`990b5aa`）。剩余 dependency
    第二批又完成 `prepare`/`prepareDiskSnapshot` boundaries、64 KiB 分块 disk read、descriptor
    首因保留，以及 cold BFS/warm cached-closure 的取消 rollback/retry（`90e871e`）。最终 assembly
    checkpoint 的事务范围随后扩展到 watched-delta 消费之前，取消后的第一次 retry 恰好发布 removal、
    第二次为空，真实 TypeScript 不再保留已删除 definition（`8ed16a3`）。workspace hydration 已把
    aggregate remaining bytes 下推到 descriptor `fstat` 后、buffer allocation/read 前；超预算文件
    不进入 cache/undo log，预算释放后可 fresh retry（`3b5a9d2`）。cold dependency BFS 已复用同一
    budgeted loader，并拒绝发布 byte-truncated warm closure；未改盘的第二次 prepare 仍会重新 preflight，
    A 缩小后可读取此前拒绝的 C 并形成完整 warm closure（`52b9a4b`、`9b18cc8`）。未来 TypeEngine
    自身可取消后，watched delta 还需 revisioned peek/ack，不能直接在 engine 成功前消费。
  - [ ] T4d 所有可达数千结果的自有 mapping/sort 循环在 TS 调用前后检查，
    纯内存循环每 64 项检查一次；dispatcher 仍保留 cell 以映射 first-cause。首批只覆盖真正无界的
    references、rename、diagnostics/documentSymbols，再处理 implementations、completion raw scan、
    inlay/documentHighlight 和 definition；Call Hierarchy 已有 16/256/64/2048 硬上限，只需最后接入
    cadence。references 已消除跨 definitions 的 `flatMap` 聚合，并在 TS boundary、nested mapping、
    sort comparator 和成功返回前使用 request-local 每 64 项 cadence；真实 SAB 用例证明第 64 项取消、
    第 65 项未访问且 fresh-cell retry 稳定返回 130 项（`bfe65f7`）。rename 也已覆盖
    getRenameInfo/conflict/findRenameLocations boundaries、130-location mapping、sort/overlap scan，
    同样证明第 64 项取消且不发布 partial edit（`5bb65fa`）；class-conflict preflight 内部 AST/symbol
    遍历目前只有调用前后 boundary，待 profiling 后再决定是否细分。host token 与 owned-loop
    `checkpoint` 是两个独立注入项，core 不反向依赖 semantic scope。diagnostics 已移除 eager
    `flat()` 并逐项映射；documentSymbols 改为显式迭代 DFS，覆盖 150,000 宽 unknown container、
    1,000 层深树、每 64 节点取消与 fresh retry（`9eddcf1`、`3d69963`、`7eee8b1`），测试唯一登记
    到 unit layer（`69fd2e3`）。completion raw scan 已合并 filter/slice/map 为单次迭代，每 64 raw
    entries 检查并在收满 128 个匹配项后停止（`9e971f9`）。implementations 已用同一 request-local
    cadence 串起 definition/implementation provider boundaries、declaration Set、raw filter 和共享
    candidate mapper；三个隔离用例先在父实现下 3/3 RED，再达到 5/5 focused GREEN（`f8cb383`）。
    inlay provider/raw mapping/displayParts 与 documentHighlight provider/group/span/sort 也已用隔离
    RED 锁定 provider boundary 和每 64 单元 cadence（`39c052f`、`8c2a649`、`8d59011`）；LSP 的
    排序后 1,000 项/256 KiB budget 未前移，避免改变完整结果。definition/typeDefinition 也已各自
    激活 request-local work；4 个 public-entry RED 覆盖 provider-return、每 64 candidate mapping、
    第 65 项不访问、无 partial publication 与 fresh retry，并移除 shared mapper 的 no-op work 默认值
    （`b4b3fbc`）。completion resolve 的 core 以 7 个独立 RED 覆盖 details provider、两个 display
    parts 阶段、action/change/text-change owned loops，并保持 first-safe、短路、same-file/non-new-file
    与完整 edit 顺序（`acfc7fd`）。以上仍只证明 TypeScript core；Call Hierarchy cadence，Registry/
    ArkUI/Legacy/LSP 后段 owned loops（包括 definition/typeDefinition merge/mapping、completion resolve
    post-map、inlay/highlight mapping/sort/byte accounting），以及 resolve edit all-or-none count/UTF-8
    byte budget、line-start index/native join 边界尚未闭环，因此 T4d 保持未勾选。
  - [x] Completion bounded-result contract：LSP 先截断再登记 resolution（`e860cfa`）；统一 semantic
    `CompletionList`（`15fed96`）；TypeScript 与 ArkUI 分别建立 truthful 128-item provider 边界
    （`5bb2033`、`2543058`）；Registry 在跨 provider 去重前分别执行 quota 并传播 provider/overflow
    incompleteness（`5d039d0`）。真实 stdio 首尾 resolve、127/128/129、ArkUI quota 外 exact
    definition/diagnostic 与 mixed-provider identity 均有回归保护。
  - [ ] Completion range cost：复用 UTF-16/CRLF/ArkTS rewrite characterization，引入 line-start index，
    将最多 128 项的 range mapping 从 `O(items × file size)` 降为 `O(items × log lines)`，并把相同
    fallback range 提出循环。
- [ ] T5 State：worker 独占 SemanticDocumentStore/TS engine，sync/query-by-reference 与无 gap ACK。
  Call Hierarchy 的 protocol v2 strict request/result codec 已先行完成（`1ef51ef`）；随后 supervisor
  已按可信 active method 做 method-aware response decode，超限 collection 在 element descriptor 扫描前
  拒绝，固定 schema 不再遍历未知 descriptors（`2c690c3`）。仍无 dispatcher、endpoint 或 production
  proxy，不能把 codec/supervisor GREEN 当作 worker state 已接线。
- [ ] T6 Integration：production services 切换到 worker proxy；复用已完成的 typed first-cause
  freshness（`dce6b63`），并把 `SemanticEnginePort.dispose()` 升级为可等待的 async disposal；
  保持现有 freshness/global completeness 行为，全量 handler 不一次性重写。
- [ ] T7 Recovery：epoch restart、bounded atomic overlay replay、non-replayable fail-closed。
- [ ] T8 Artifact：构建 `dist/semantic-worker.cjs`，portable manifest/installer/sealed acceptance 验证
  相邻 worker bytes；缺失或篡改必须明确失败。
- [ ] T9 Real evidence：接 process tree probe 与 Node heap preload，记录主线程/worker/sidecar RSS、
  heap 和 cancel latency；包含 4 MiB 近 EOF completion range mapping、>512 mixed-provider completion
  以及 resolve 大 edit/display-parts all-or-none 场景；连续至少 10 次后才设阻断阈值。

推荐 ownership：T1 测试、T2/T3 transport、T4 cancellation 可先并行建立 RED；T5/T6 由单一
integration owner 串行；T7 在基础请求 GREEN 后接；T8/T9 最后接入 artifact/large runner。

## 9. 退出门禁

按顺序全部通过才算完成：

```sh
node --test tests/lsp-semantic-worker-responsiveness.test.mjs
pnpm check
pnpm build
pnpm test:protocol
pnpm test:e2e:bundle
pnpm check:fast

# Sealed acceptance is consume-only. Build it from a clean committed worktree
# into a non-existent child of an absolute temporary directory first.
test -z "$(git status --porcelain)"
sealed_parent="$(mktemp -d)"
sealed_output="$sealed_parent/arkts-language-server-sealed"
pnpm build:artifact -- --source-root "$PWD" --output "$sealed_output"
ARKTS_SEALED_ARTIFACT_DIR="$sealed_output" pnpm test:e2e:artifact:sealed
```

此外必须满足：无 skip/todo/cancelled test；worker 缺失/崩溃/协议畸形/queue overflow 明确 fail
closed；installed artifact 实际触发 worker；原始响应顺序 tracer GREEN；清除所有临时 debug
instrumentation。完成前不得宣称 production cancellation 或 100k 项目前台延迟已经解决。
