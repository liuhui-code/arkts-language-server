# P2.1b：命名 references 的 target、overlay 与 watcher freshness

父 revision：`fdcfb43c3214e1779392a66fbaa18b534e856e52`。

当前状态：P2.1b 的行为切片、受影响回归、统一 `pnpm check:fast` 与冻结审查均已完成；
最终候选为827/827通过，PR 与合并证据待回填。第一次完整快速门禁793/798和冻结前
一次822/827均为有效 RED，不是通过记录。
P2.2 跨模块 rename 是下一功能切片。
本轮新增的 rename 用例只锁定“源码不可验证时不得返回编辑”的失败关闭边界，不代表
P2.2 的冲突、版本和原子 `WorkspaceEdit` 已完成。

## 验证边界

用户工作流通过真实 `dist/server.cjs --stdio` 子进程、`Content-Length` framing、标准
`textDocument/references` 与 document/watcher 通知验证。结果按有序、非空、无重复的
UTF-16 location 精确比较，不以“结果非空”或 URI 数量代替正确性。

scan/read 一致性和复杂度在更靠近缺陷的稳定公开接口验证：`SemanticDocumentStore.prepare`、
`ProjectFileAccessPort` 与 `TypeScriptLanguageServiceEngine`。这样可以把文件替换准确放在
“catalog 已发现、TypeScript 尚未按需读取”的竞态窗口，并可确定性计数 source-root
`realpath`，不靠不稳定的墙钟阈值猜测原因。生产接线仍由 `LegacySemanticEngine` 经
`SemanticTypeEngineRegistry` 把 document store 注入 TypeScript engine。

## 纵切 1：inactive target 不是 root file

Stage corpus 选择 `entry/src/tablet` 并保留 `src/main`；未打开的
`entry/src/desktop` 文件导入并使用同一个命名依赖 `SharedProfile`。references 只包含4个
active import/use、未打开 barrel 和 origin location，desktop 的2个 location 是明确负控。

这是既有产品契约的 characterization GREEN，不是缺陷修复。显式从 active 文件导入
desktop 文件时仍允许 dependency closure 到达它：source root discovery 排除 inactive
target，但不会把目录变成显式依赖的 denylist。

```text
node --test --test-name-pattern='does not search unopened inactive-target references' \
  tests/semantic/references-depth.test.mjs

pass 1
fail 0
```

## 纵切 2 RED：同一物理源码重复进入 Program

真实 server 先通过 Stage `entry -> file:../shared` 命名导入完成 warm-up，再通过两个软链接
URI 先后打开同一 barrel，并让未保存内容移动 reference。修复前 includeDeclaration 的两种
策略都会同时返回当前 alias overlay 和过期 canonical disk barrel：

```text
node --test --test-name-pattern='uses one authoritative named-module overlay' \
  tests/semantic/references-depth.test.mjs

includeDeclaration=false: expected 3, actual 4
includeDeclaration=true:  expected 4, actual 5
extra: shared/src/main/ets/index.ets:0:18-0:31
```

根因是 warm dependency closure/project membership 使用 lexical path，而 overlay authority
使用 physical identity；`file:` package entry 没有消费相同 authority。修复后，一个物理源码
只保留一个全局 authority，最近的 didOpen/didChange 获胜；从非 authority alias 发起请求时，
该请求自己的未保存内容仍是 request-local authority。didClose 按活动顺序恢复另一个 overlay，
最后恢复磁盘 canonical view，并且不产生重复 location。macOS `/var` 与 `/private/var` alias
也通过 canonical workspace identity 处理。

集成层另用一个 engine 实例锁定 `second -> first -> second` 切换。每次 authority 转移都必须
把前任 alias 放进该 lexical root 的 `removedPaths`，并使补全只出现当前 authority 的类型。
reset epoch 即使先由另一 alias 消费，后续 alias view 仍按持久 epoch 重建；只收到最新 owner
revision 的 engine 也不能继续使用旧 script。这两条回归防止“document store 已正确、TypeScript
Program 仍陈旧”的分层假阳性。

## 纵切 3 RED：声明 source root 的首个文件永久不可见

selected target 声明 `sourceRoots: ['./src/tablet']`，但该目录在 warm model 建立时不存在。
创建目录及首个命名依赖 consumer 后发送标准 Created watcher，修复前 warm server 保持4个
location，fresh server 返回6个：

```text
node --test --test-name-pattern='declared target source root first appears' \
  tests/semantic/references-depth.test.mjs

warm:  4 locations
fresh: 6 locations
missing: entry/src/tablet/WatchedReference.ets import and use
```

根因是模型把“尚不存在但声明合法”的 root 缓存成 `source-root-unavailable`，而普通 source
事件不会重读全部 project profile。现在只在父路径物理身份已知、声明路径 contained 且确实
不存在时保留 prospective root；已存在非目录、权限错误、逃逸和 dangling symlink 继续
fail closed。

同一个真实 LSP tracer 继续覆盖 Created → 等字节且相同 mtime 的 Changed → Deleted。每步
warm 结果都与新进程精确一致：6、5、4个 location，证明 freshness 不依赖 size/mtime 猜测，
也不需要每个普通事件重建 project model。

## 纵切 4 RED：相对导入绕过 overlay authority

已存在的 workspace 文件通过 alias URI 打开并修改后，`./relative` import 仍绑定 canonical
disk 文件。修复前真实 LSP 的 definition 指向 canonical 文件第0行而不是 alias overlay 第1行，
completion 返回 `diskOnly` 而非 `overlayOnly`，diagnostics 还产生2339。

```text
node --test --test-name-pattern='open workspace alias owns' \
  tests/semantic/local-package-resolution.test.mjs

RED: definition/completion/diagnostics all observed the stale disk source
GREEN: pass 1, skipped 24
```

相对导入现在先完成 physical workspace containment，再咨询同一个 overlay authority map；只有
没有有效 overlay 时才返回磁盘 candidate。didClose 恢复 canonical disk definition、completion
和 diagnostics。两个 diskless open overlay 的既有真实 LSP 契约保持通过。

授权边界是 workspace-first，而不是“哪个 root 更宽就用哪个”。selected SDK 即使是 workspace
祖先，也不能让 workspace importer 的 `../` 逃出 workspace；lexical workspace symlink 即使
physical target 位于 SDK，也不能继承 SDK 边界。反过来，真实 SDK declaration 的相对导入仍在
SDK physical boundary 内解析，包含 TypeScript 的 dotted-relative declaration suffix 探测。

resolver 缓存 canonical root，但不缓存目标文件存在性或 overlay authority。100条已存在的
relative edge 总计约203次 `realpath`，即约2.03次/edge，避免退回每个候选重复 canonicalize root；
64-edge SDK import graph 在访问第65条 edge 前观察取消，且只有共享的第64-edge checkpoint，
没有因物理边界校验引入逐 edge cancellation 噪声。

## 纵切 5 RED：catalog 与大型项目 lazy read 之间存在 TOCTOU

302个 project member 的 corpus 让目标文件位于 eager 256-file/8 MiB snapshot 之外。catalog
发现该普通文件后、TypeScript 首次按需读取前，把它替换成 workspace 外部文件的软链接。
修复前 references 被误报为 `complete`，并返回3个包含外部内容产生的 location；这说明“扫描时
安全”没有约束“消费时安全”。

```text
node --test --test-name-pattern='rejects an unopened project member replaced' \
  tests/semantic/project-membership-language-service.test.mjs

RED: complete, 3 locations including post-discovery outside content
GREEN: { status: 'incomplete', reason: 'source-unavailable' }
```

生产路径新增窄的 `ProjectFileAccessPort`。每次 lazy read 必须同时匹配：

- canonical workspace root identity；
- catalog revision；
- discovery 时记录的 per-file admission token。

读取时再次确认 lexical final entry 为普通文件、当前 physical path 仍在 canonical root 内，并
校验打开文件描述符的 dev/inode 与读取稳定性。TypeScript lazy cache 也携带 token；token 缺失
或变化会丢弃旧 snapshot，并把 references 标记为 `source-unavailable`，不会返回“完整但漏项”
或越界结果。相同边界的 rename 回归要求失败关闭，但不验证 P2.2 的成功编辑流程。

watcher/refresh 同步维护该协议：成员内容身份变化会推进 catalog revision；有效 Changed 刷新
token；普通文件被替换为 in-workspace symlink 时从 membership 移除；Created 恢复合法普通文件。
被拒绝的 dangling/outside/inactive-target alias 不进入 warm catalog，warm 与 fresh membership
保持一致。

该 port 按 `(root, revision, path)` 查询 document store 当前 catalog，不把完整 token map 复制
进每个 workspace view，也不延长旧 catalog 生命周期。它只约束 complete project membership；
SDK declaration 和解析器明确承认的外部依赖仍使用各自既有的 resolver 边界。

## 纵切 6：大型 membership 的确定性复杂度

1000文件 Stage corpus（`main` 与 selected `tablet` 各500）显示 membership 判定在每个文件上
重复 canonicalize 两个 source root：

```text
node --test --test-name-pattern='snapshots active physical source roots' \
  tests/project-file-set-cache.test.mjs

RED: main root realpath=1005, tablet root realpath=2008
GREEN: each active root realpath <= 4; membership paths=1000
```

project model 现在为一次配置 snapshot 计算 physical source roots，并通过内部 WeakMap 与 scope
关联，不扩大公共 `HarmonyProjectScope` 数据形状。相同 catalog epoch 还复用同一个 frozen
`ProjectMembershipSnapshot` 及 paths 数组，避免每次 prepare 重新分配 O(N) membership；revision
只在 membership 或成员身份确实变化时推进。

这些测试锁定 I/O 次数与对象复用，不宣称真实大项目 p95/p99 或 RSS 已达标。eager document
snapshot 仍受256文件/8 MiB预算约束，未新增全量 resident cache、第二套索引或常驻进程。

## 纵切 7 RED：调用层级越界失败需要实际调用 provenance

既有 outgoing call 测试要求：被选函数确实调用一个解析到 workspace 外的目标时，请求必须
原子失败，不能返回看似完整的空数组。物理解析边界变严格后，TypeScript provider 看不到该
目标，第一次统一门禁把结果退化成 `[]`。简单按“当前文件存在任意越界 import”失败也不正确：
type-only import 与未使用的 value import 并不是所选函数的 outgoing edge。

修复在受限解析被拒绝时保留 module-specifier provenance，并把 provider 返回的 unresolved call
expression 与对应 import 绑定。只有被选函数实际调用该 import 时才返回
`source-outside-workspace`；type-only 越界 import 的无调用函数仍返回 `[]`，含未使用越界 import
但只调用本地函数时仍精确返回本地 edge。越界源码从未读入 Program，安全边界与结果完整性
因此同时成立。

## 第一次统一快速门禁：5类有效 RED

候选第一次完整运行 `pnpm check:fast` 的结果为793/798。5个失败分别保护不同契约：

1. outgoing call 的真实目标越界时被误报为成功空结果；
2. SDK dotted-relative import 不再找到 declaration suffix；
3. object-property completion 的确定性 checkpoint 从基线4增至80，暴露逐候选检查；
4. alias reset 先由另一个 lexical root 消费后，后续 root 携带错误 removed path；
5. lexical engine 只收到最新 owner revision 时没有重建，首次 definition 即为空。

收口没有放宽边界、取消阈值或断言：alias delta 按 lexical root 过滤；workspace 与 SDK importer
分别选择其物理边界；SDK relative graph 共享64-edge取消节奏；outgoing 越界按实际 import-call
provenance 决定。793/798只证明统一门禁找到了局部测试未覆盖的集成问题，最终冻结候选仍必须
重新完整运行门禁。

## 冻结前统一门禁 RED：re-export provenance

2026-09-09 的冻结前完整运行得到822/827；4个失败子用例及其父套件均属于同一根因：
caller 对 `./Bridge` 的相对解析成功，而真正的越界 failure 记录在 bridge 文件的
`export ... from` 上。原实现只读取 caller 自身的 failure map，因此 named/star/multi-hop/default
re-export 调用被错误报告为完整空数组。

现有真实 stdio 用例就是正确回归 seam，未新增私有实现测试。修复按具体导出名递归传播
named/star/default re-export failure，并保持本地显式 named/default export 优先；因此无关的被拒
re-export 不污染合法本地 outgoing edge。聚焦复验：

```text
node --test --test-name-pattern='fails indirect calls to outside imports closed|keeps local barrel exports precise' \
  tests/lsp-call-hierarchy.test.mjs

pass 16
fail 0
```

## 取消语义回归

安全读取的第一版错误地对 physical path 执行 I/O，绕过了 cancellation 测试在 lexical path
上的确定性注入；候选期一次完整门禁因此暴露6个既有 cancellation failure。修复保留 lexical
I/O/checkpoint，同时用 realpath、admission token 和已打开 fd 身份做安全验证。聚焦套件恢复：

```text
node --test tests/document-store-cancellation.test.mjs

pass 9
fail 0
```

该中间门禁不作为最终门禁证据；后续完整运行也曾在独立复审发现新 blocker 后主动中止，不能
记录为通过或失败。只有候选冻结后的最终统一运行才回填下方清单。

## 当前聚焦证据

已记录的 GREEN：

```text
node --test tests/semantic/references-depth.test.mjs
# 6/6

node --test tests/harmony-project-model.test.mjs
# 18/18

node --test --test-name-pattern='open workspace alias owns' \
  tests/semantic/local-package-resolution.test.mjs
# 1/1 (24 skipped by the name filter)

node --test --test-name-pattern='rejects an unopened project member replaced' \
  tests/semantic/project-membership-language-service.test.mjs
# 1/1

node --test --test-name-pattern='advances the catalog revision|refreshes an admitted lazy source token' \
  tests/project-file-set-cache.test.mjs
# 2/2

node --test tests/document-store-cancellation.test.mjs
# 9/9
```

冻结候选全部受影响套件：

```text
node --test tests/harmony-project-model.test.mjs tests/lsp-call-hierarchy.test.mjs \
  tests/project-file-set-cache.test.mjs tests/project-resolver.test.mjs \
  tests/semantic/local-package-resolution.test.mjs \
  tests/semantic/project-membership-language-service.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs tests/semantic/references-depth.test.mjs \
  tests/semantic/typescript-cooperative-cancellation.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs tests/workspace-path-consistency.test.mjs

pass 246
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 84290.399736
```

另外的最邻近 regression 覆盖未变 epoch 的 snapshot 对象复用、watched regular→symlink 移除、
dangling source-root create、nested watcher 越界、relative dependency 物理边界、active lexical
path 指向 inactive physical target 的拒绝、`second -> first -> second` authority、SDK dotted
relative/boundary/cancellation，以及调用层级的实际 call/re-export provenance。

最终统一门禁：

```text
pnpm check:fast

tests 827
pass 827
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 480869.10933
```

冻结审查执行 `git diff --check`，检查新增调试输出、跳过/放宽断言、未登记测试文件与越界读取
入口，未发现P0/P1；`tests/workspace-path-consistency.test.mjs` 已进入 `unit-contract` 层。

## 集成收口

- [x] 冻结候选后重跑全部 affected suites，并记录准确结果。
- [x] 运行 `pnpm check` 与 `git diff --check`。
- [x] 运行统一 `pnpm check:fast`，记录准确通过数、失败/取消/跳过/todo和耗时。
- [x] 冻结复审确认无 P0/P1。
- [ ] PR CI 通过并合入 `main`，回填 PR 与 merge revision。

本次使用 documentation-only 例外：reason=同步已观察的 RED/GREEN 与待办状态，不改变运行行为；
scope=`README.md`、本执行计划与本 TDD 记录；owner=P2.1b 维护者；expires=2026-09-14。
生产代码、测试、build/CI 或工具变更仍执行 mandatory TDD。
