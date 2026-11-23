# ADR0037：跳转需求、容量失败证明与同步输入验证范围


> 集成编号说明：本轮未提交实验原称ADR0034。远端PR #109已先合入ADR0034-private-catalog-publication，
> 因此本提案在合并前改号0037；既有实验、日志和候选哈希不变。ADR0035/0036保持原编号，
> 不改动已发布的私有catalog决策。

- 日期：2026-10-31；实施开始于2026-10-30。
- 状态：**Proposed；维护者已明确授权按方案实施，当前候选已实现；不追认独立评审或全量UI通过。**
- 关联：[ADR0032](0032-completion-item-identity-and-inferred-roots.md)、[ADR0033](0033-client-navigation-ownership-and-ui-input-context.md)、
  [实施计划](../plans/2026-10-30-navigation-work-reuse.md)、[21.562秒证据](../reports/2026-10-30-definition-21562ms-breakdown.md)。
- 父提交：`04282ed34ebab7cd01726bb0291af53bd278ff00`；不自动合并、发布或部署日常Zed。

## 证据及问题边界

真实Windows会话请求570的21562.433ms中，21292.850ms发生在父端准入至发送Worker。
Zed约12ms发送32个definition及32个typeDefinition；前方另有高亮/codeAction，定义和类型定义没有逐ID取消。
本条定义阶段62.081ms且Program零重建。前序一项约4057.663ms后失败，原现场缺少其完整内部阶段，
不能把这4秒全部追认为目录扫描。真实F12另有16427.801ms，不能将自动请求最大值等同一次F12。

本轮独立公开stdio反例：

- 三个相同位置定义实际dispatch三次；现有合并器只接入引用/详情，导航未接入。
- 20003源码容量partial，三次缺失定义使noise目录枚举2→5，单次约436–449ms；仍返回完整范围不可用。
- 配置见证同一路径在同一读取中重复验证；只扩大查询内部共享仍遗漏准备阶段的核验。
  必须共享准备事实，但不能把最终验证移到Program租约释放之后。

原真实UI、机制反例、Mac原64位置协议重放分别记录；重放不是新UI验收。

## 官方机制及适配

Context7本轮resolve TypeScript成功；对`/microsoft/typescript/v4.7.4`的查询包含旧测试基线，
只采用LanguageServiceHost概念，不将其示例或TypeScript7 Go接口当作实际4.9.5-r10实现。
实际函数与构建身份通过已安装`ohos-typescript@4.9.5-r10`源码及bundle核对。

- [VSCode导航状态取消](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts#L111)：
  请求绑定编辑状态，结果应用前再检查取消。用于ADR0033的客户端边界，不声称本扩展能改Zed核心。
- [VSCode请求队列](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/requestQueue.ts)：
  优先级和编辑屏障独立；[按seq取消](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/tsServer/server.ts#L173)
  可删除排队项，或取消在途操作。
- [clangd调度](https://clangd.llvm.org/design/threads)：失效读取取消、连续更新合并、输入顺序与AST归属。
  不照搬每文件线程，不并发共享当前可变Program/checker。
- [TypeScript按需计算](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)、
  [rust-analyzer增量与快照](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)：
  借鉴稳定输入与需求生命周期，不能据此把本项目未通知的磁盘变化视为不可能。
- [LSP取消](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)：
  每ID独立终态；标准definition参数没有F12/自动链接的可靠区分。

## 决定

### A. 共享等价计算，保持独立请求

导航统一注册模块接入现有InFlightRequestCoalescer，不新建结果缓存。
键由方法/URI、workspace、文档版本和精确UTF-16位置组成；disk保留原权威源解析和最终校验。
定义与类型定义不共享结果，不同位置不互相替代。每个消费者保留自己的取消与唯一终态；
只有最后一个消费者离开才取消底层工作，等待任务真实结清。

导航的在途失效scope为workspace：依赖、配置、编辑及关闭事件撤销旧订阅，最后订阅撤销同步移除旧操作键。
因此同源版本不变、或关闭后以同版本重开，也不能加入旧输入的在途计算。
不新增跨请求完成结果缓存，不顺带修改暂停的引用缓存失效TODO。

### B. 只复用有见证的容量失败

成员枚举器在原目录关闭验证完成后，交出真实path/physicalPath及BigInt dev/ino/mtime/ctime观察。
捕获不增加另一轮realpath，避免破坏原有物理源根扫描界限。
仅`path-count-limit`/`path-byte-limit`保留容量失败证明；验证现有目录真实路径及前后身份，
并要求支撑失败的overlay-only成员仍存在。已由磁盘枚举证明的成员，不因打开同文件overlay而重扫。
目录事实元数据受现有成员路径字节额度约束，溢出回到原枚举，不创造新的产品RSS限制。
注入的路径迭代器没有真实目录见证，不获得此证明。

定义局部结果为空时，在完整准备/预载前检查该失败证明。仍有效就返回原完整范围不可用错误，
不把未知符号变为截断空成功；不扩大入口/Program或预读无关源码。
目录增删/重命名、链接身份、配置代次或必要overlay变化使证明失效，走原重试。
`source-unavailable`/`enumeration-error`不缓存为容量失败，原文件内容修复即使目录mtime不变也可重试。
显式全量引用/重命名等仍走原完整性路径；此次不提高20K规模上限。

### C. 一个同步导航操作交接证明，原租约内完成最终核验

withSynchronousInputPreparation只包围无await的导航适配调用。
准备期间的原始配置/命名空间事实加入同一验证范围；实际引擎查询仍在现有语义租约中执行。
withRequestInputValidation继承这些事实与首次观察，在其原位置清空观察缓存，再进行全新最终union scan。
最终阶段暂时关闭准备/已验证结果复用；每个owner的代次与revision仍需匹配。
租约返回前完成最终核验，不把这一步延迟到外层导航适配器退出。

只对验证扫描共享同path/mode的实际lookup结果；actual load的before/after guard始终直接读取。
复用与已有文件身份观察共同计入原32MiB请求元数据额度，溢出普通读取。
成功、失败、取消及完整范围回退均清除范围；不同请求无TTL、无“版本不变就认定磁盘不变”。
原生realpath、符号链接、缺失父目录、SDK及磁盘字节终检保持；文件名大小写保持原规则。

### D. 保留调度和客户端边界

既有foreground/completion优先级、有限公平、mutation/global屏障与Worker监督预算不变。
同一方法中的不同有效位置仍需分别处理；这些请求全部未取消时，单Worker仍有总服务成本。
服务端不能猜测F12，也不通过重启Worker、提高上限或丢弃合法任务“解决”排队。
Zed自动需求取消与晚到结果不抢焦点仍归ADR0033，未实现即明确OPEN。

## 拒绝方案

- 恢复同method+URI latest-wins：再次误取消独立F12。
- 只接合并器就称原64个不同位置全部优化完成：不同位置不等价。
- 所有partial永久缓存、只按mtime/年龄重试或每次清空全部缓存：无法证明恢复和边界。
- 直接删除每次请求的最终校验、跨请求复用“有效=true”：丢失无通知变更保护。
- 将整个异步请求包进一个全局验证范围，或在Program租约释放后补终检：错误生命周期及并发隔离。
- 抬高队列、超时、规模、RSS/V8阈值，或每次创建Worker：不解决总服务成本。

## 验收

公开child-process/stdout framed transcripts覆盖：相同/不同位置与方法、单消费者/全部取消、
依赖与配置变化、同版本关闭重开、disk来源、异常SDK修改后的拒绝与恢复。
原始SDK在编译器已产生定义后才真实修改，旧定位即使看似正确也必须被最终围栏拒绝。
容量partial覆盖真实20003文件枚举、无通知目录删除/新增声明恢复、同inode不可读源码修复。
已有路径/源根扫描边界、命名空间生命周期及输入证明用例保持，不放宽断言制造GREEN。
最终check:fast、固定输入三轮对照与UI覆盖分别报告；455冷目录3秒门槛继续按用户授权跳过。
500ms仅为体验目标，持续多秒排队、未知SDK与完整30K功能限制不作为成功。

## 实施收据（2026-10-31）

公开相关回归103/103；最终`pnpm check:fast`2147/2147，exit0、无取消/跳过/todo。
800份冻结源/测试/配置与最终产物SHA一致，完整日志及身份见
`.bench/navigation-work-reuse-20261030/final-check-summary.json`。
固定驱动、SDK和隔离30K项目的三轮交替协议对照，69份完整响应逐字段一致（含原有错误）；
最坏定义6466.262→3563.904ms。原64请求键全部不同，不能将此收益归于请求合并。
关闭重开未改善，初始化degraded、全范围错误及索引未完成如实保留。
[实施报告](../reports/2026-10-31-navigation-work-reuse.md)分别列出结果、资源和未覆盖项。
Windows/真实Zed UI未重验，ADR0033仍OPEN；此实施收据不等于独立评审或Accepted。

后续[ADR0035](0035-unchanged-source-authority-transitions.md)专门处理关闭重开时的同输入compiler版本；
不改变本记录的独立消费者/旧生命周期失效、容量证明及每请求最终围栏。上述2147收据仅覆盖原冻结候选。

## 2026-11-01 corrective evidence — local verified, full CI pending

The final await in call-hierarchy preparation is being checked against existing
request freshness and source-authority fences. The intended correction adds the
missing publication-time check; it does not move compiler input validation out
of its lease or change request coalescing and cancellation ownership.

See the [recursive review receipt](../reports/2026-11-01-recursive-ide-review.md).
Corrected public fixture RED 1/4 became focused GREEN 12/12; TypeScript check
passed. The initial fixture assertion defect remains separately recorded.
This is final-publication fence evidence, not real-compiler/UI qualification;
the missing Rust toolchain blocker is now resolved, with fresh complete CI
still pending.
This addendum does not change the decision status, historical verification
counts or remaining acceptance limits.

Final integrated local validation passes 263/263 across 34 complete files,
including all 19 previously failing files; typecheck/build pass and frozen inputs
match. Original full 2134/2222 FAIL is preserved; fresh full locked-toolchain CI
remains pending on the authorized draft PR. No approval status is changed.

### 2026-11-19 C的执行细化：显式最终消费，不是通用有效性复用

原位置清空物理观察、租约内最终核验与每owner原始资格不变。M2只复用同final
阶段完整保留观察的事实比较，活owner/epoch与取消仍检查。M3仅对有已登记必须
消费者的Native成员证明省掉额外顶层重复；消费者在原位置执行完整raw观察，
后置SDK/配置和目录围栏不移动。每个消费者须结清原owner+epoch/revision义务；
同revision新证明不可代替，未结清拒绝旧请求。无消费者/未知/混合输入保留原序。
这不是打开整个final阶段的memo，也不跨阶段借观察或移出原租约。
[顺序、反例与验收边界](../reports/2026-11-19-final-membership-observation-order.md)。
本ADR维持Proposed及既有审阅历史，142+46项聚焦通过不等于最终完整/UI验收。


### 2026-11-19 synchronous preparation coverage (Proposed implementation refinement)

Background diagnosis and the actual compiler completion-details branch hand their
original synchronous preparation proofs to the existing query lease's independent
final union, like navigation/list completion. Preparation scope never spans await;
current/final observations are distinct, actual-load guards raw, all owners and
32MiB metadata fallback retained. Cached-detail namespace admission remains on its
original early-return path, outside the new compiler-branch scope. No running
diagnostic preemption, fairness, mutation/global barrier or cancellation deadline
changes. Fewer repeated proofs reduce service time; priority alone cannot bound
a long already-running diagnosis. Public RED/GREEN and post-compiler mutation
refusals plus ordinary Photos evidence: [NAV-PREP-001](../reports/2026-11-19-synchronous-diagnostic-and-details-preparation.md).
This is not Accepted review or whole/UI/endurance acceptance; prior decisions and
verification history remain intact.


2026-11-19 NAV-PREP-001 follow-up: hover and signature help also use the existing
synchronous original-proof handoff; current/final phases, raw load guards, lease
and cancellation/scheduling contract unchanged. Independent public cost RED4raw
passes/1600noise lstat ->GREEN2/800; expanded41/41 plus cohesive completion
extraction32/32. Photos hover median8132.65 ->2862.77ms, signature7375.71 ->2747.43ms;
remaining hot definition~2.6s unchanged. One serial session/version, not UI/endurance.
Prior0f wholecheck2681/2682FAIL and frozen selected proof recheck1PASS8not-selected
remain distinct; historical exact environment mismatch unproven, no validator
relaxation. New041bd03a complete check pending; all remaining A-plan gates open.
[Evidence and limits](../reports/2026-11-19-inspection-preparation-and-checkfast-followup.md).
ADR status/review history unchanged.


2026-11-19 NAV-PREP-001 document inspection follow-up: document symbols,
highlights and inlay hints now hand original synchronous preparation facts to the
existing query lease; independent final/load guards unchanged. Public cost RED
4raw member passes ->GREEN2; expanded43/43PASS plus TSC/build. Frozenb02394a2
complete check and ordinary pair02 pending; initial closed-file calibration was
a preserved harness failure, not a product latency sample. Actual installed
compiler navigation-tree probe shows a narrower syntax read set, but source-only
product routing remains unimplemented and must retain target/config/path proofs.
[Evidence and boundaries](../reports/2026-11-19-document-inspection-preparation-and-read-set.md).
No ADR status/review or overall acceptance change.


Document inspection ordinary pair03 completed: exact full responses equal across
all6samples/method; document symbols median7711.64->2656.28ms, highlights7593.24
->2781.89ms, inlay7548.57->2580.25ms. Native30000READY, SQLite/owned close PASS,
source hash unchanged; one process/version, protocol only, SDKpartial. Init~71s
and hot definition~2.6s unchanged. Prior calibration failures preserved separately.
Watch registration-gap public accept/reject, partial+READY controls and existing
watch/directory regressions36/36PASS; old silent-source query refused and successor
fresh in same Worker, not proof of all M5 cases. No new blind reset or watch-only
freshness shortcut. Current b02394a2 full check still pending; previous full FAIL
retained. [Watch coverage](../reports/2026-11-19-watch-recovery-entry-audit.md).


### 2026-11-19 syntax-only document symbols (Proposed implementation refinement)

Document symbols now consume the open snapshot, physical target/root identity and
actual parser/SDK configuration in a bounded syntax owner, not semantic project
membership/Program/readiness. Existing final raw union, shared-cell cancellation,
parent freshness and semantic state/deltas retained. This is actual dependency
selection before consumption, not ignoring historic proofs after preparation.
SDK/target late mutation refuses old results; unrelated source changes do not
invalidate this syntax result. No new Worker, watch-only contract or READY claim.
Public final53/53PASS, TSC/build PASS. Photos30K exact16symbols: control median
2681.03ms ->7.77ms (first candidate37.43ms), allsixfullresponses equal. One process
per version, protocol only; init~73s and hot definition~2.6s remain. Candidate
Native/SQLite/close PASS; control SQLite60s FAIL retained, series WITH_FAILURES.
[Design, failures, lifecycle and limits](../reports/2026-11-19-syntax-symbol-input-ownership.md).
Full check pending; ADR status and historical review remain unchanged.


2026-11-20 M4 containing-origin refinement (implementation/evidence, status unchanged):
bindings retain the descriptor identity that produced the containing import list;
first post-resolution current() and independent final raw union validate it.
Qualified regular project reads only; SDK/overlay/unknown origins keep existing
before/after capture. Candidate/negative/package/physical-target guards and target
confirmation unchanged. Public64-source RED320lstat ->GREEN64, expanded101/102
with original20K references5s timeout retained. One ordinary Photos initialization
101149->84438ms is a single pair amid unassigned run variance, not a guarantee.
[Factory correction, cost evidence and remaining work](../reports/2026-11-20-binding-containing-origin-and-owned-syntax-factory.md).

### A-plan refinement: final member metadata is only a first-side observation (2026-11-20)

The final union still clears all query/preparation observations and performs a
fresh member scan. A successful exact owner/epoch/revision member validator may
lend its final regular-leaf metadata ONLY as the first side of a later resident
source validation window. The consumer must independently perform its later raw
leaf observation and preserve the original physical-directory proof and terminal
namespace fence. This is not permission for requestFileIdentity or configuration
validation to consume final metadata as a complete freshness result.

Records collected during a member scan remain provisional until its entire
namespace/scope validation succeeds. Failure/cancellation cannot activate them;
weak/missing identity, unknown parent, absent completed owner, budget exhaustion
or an earlier consumer order keep the original full observation path. Records
are request-local, charged to the existing phase metadata accounting, and cleared
on terminal cleanup. No receipt survives into another command or changes expected
source bytes. The generic takeCompletedRegularSourceObservation remains query-only.

Public references cost RED:64regular source files require128resident-final lstats
per prepared request; candidate uses64 while returning the same3locations. Actual
body edits, same-path replacements, changed later metadata and failed/cancelled
producers are independent rejection controls. This refines observation scheduling,
not the best-effort disk authority contract, product deadline or capability scope.
See [implementation evidence](../reports/2026-11-20-resident-final-source-window.md).
Existing ADR status and review history are unchanged.

### Retained reference lane and failure stage (2026-11-20)

The resident-first/retained-reference Worker lane also contributes preparation
facts to its actual synchronous query, whose independent final input fence stays
inside the original resident lease. QueryModuleResolution uses the existing
request phase; preparation and before/after resident admission do not create
unrelated observation lifetimes. The async isolated verifier lane is unchanged.

Preserve the distinction between an inadmissible cached Program BEFORE actual
reference computation (complete fresh fallback remains valid) and input invalidation
AFTER computation starts (the current request terminates, never silently reanswers
through fallback). A typed SemanticResultInvalidatedError retains the original
input failure cause and uses the existing public workspace-incomplete error path.
A fresh request/configuration may recover; no new Worker/recovery budget, timeout,
readiness bypass or result-cache contract. Existing pre-query SDK fallback and
partial-SDK unreconfigured refusal remain regression constraints.

Public cost oracle320->192regular leaf observations, exact3locations; independent
final member fence retained. This is an implementation refinement of C, not a new
accepted/reviewed status. [Evidence](../reports/2026-11-20-resident-reference-preparation.md).

The post-computation guard also covers the prepared-context reference callback,
not just a successful resident-proof hit. A controlled admission miss followed by
an SDK change at that callback's real final fence reproduced the same-request
fallback error; the current request now fails, while pre-computation misses retain
their complete fallback. Stage state is invocation-local; final validation remains
leased. Final105/105frozen regressions and raw counterexample are in the linked
2026-11-20 report. This does not certify the original explicit-opt-out20K5s tail.

### 2026-11-20 implementation clarification: deferred reference dispatch

The isolated reference lane separates synchronous input admission from asynchronous
verifier dispatch. Preparation, candidate identity admission and their original
final union execute synchronously; only a successful union returns a dispatch
closure. No verifier promise/job may be created before that boundary succeeds.
This applies the existing original-input contract, without changing ADR status or
inventing a review record. Search completion still validates current disk inputs.

A Store-owned strong membership proof may lend its original source identities to
candidate admission only for the same canonical root and catalog revision. The
transport identity array is immutable and its association is Worker-local/weak;
legacy or weak authorities retain raw leaf checks. The association stores a raw
predicate, never a cross-request validity answer. Outside a preparation phase the
same predicate rechecks original namespaces and leaves; it cannot refresh/rebase
onto newer input. Failed post-search freshness is a request failure, not an
incomplete-candidate signal permitting a same-request search on newer inputs.
Pre-search admission misses may still select the complete search route.

Source digest memoization is likewise pure derived-data reuse: a weak actual
SourceFile key and exact source text retain one digest after all existing
provenance/stamp/alias admission checks. A newly allocated evidence wrapper does
not require hashing unchanged bytes again. This cache proves neither freshness
nor completeness and retains no Program owner.

Evidence and limitations: [reference admission and digest reuse](../reports/2026-11-20-reference-entry-handoff-and-digest-reuse.md).

### 2026-11-20 implementation clarification: invalidation terminal classification

A final fence failure after semantic computation remains a stale-result terminal
(content-modified/-32801),not an admission-incomplete signal (-32803). Worker
classification preserves the specific SemanticResultInvalidatedError before its
SemanticInputUnavailableError base class. Client cancellation/disposal precedence
and pre-computation incomplete-input fallback remain unchanged. This enforces the
existing original-input contract; ADR status/review history is unchanged.
[Gate reconciliation and evidence](../reports/2026-11-20-input-validation-gate-reconciliation.md).


### 2026-11-20 shared binding composition refinement (implementation evidence)

Shared immutable resolution owners use the existing request-local composition
receipt, versioned by their binding catalog. Original child witnesses register
before success; false/throw are not retained. Finalization bypasses the receipt
and still observes original facts independently. Existing metadata budget/fallback
and owner lifetime remain. This refines existing same-phase composition, does
not relax final/load authority or change ADR status/review history.
[RED/GREEN and limits](../reports/2026-11-20-binding-proof-composition.md).


### 2026-11-20 M4 graph delta / cache-retention refinement

Completed private fact passes may hand exact immutable before/after role catalog
identities and copied known-source deltas to the graph. This receipt attests
producer lineage, not disk freshness. Required current proof walks may also emit
stale consumer deltas; final raw validation and original loaded witnesses remain.
Node reference transitions retain/release binding,source and SDK metadata caches;
validation does not keep an otherwise unused cache owner alive. Uncommitted
drafts clear on error/cancel; partially committed graphs stay rebuilding until
reconciled. These metadata references do not replace Registry AST leases.
Known project topology changes update reverse edges/effects; unknown lineage,
membership and external/SDK reachability retain complete fallback. No watch-only
or cross-request-valid consistency change; no ADR state/review promotion.
[Implementation, REDs, controls and limits](../reports/2026-11-20-graph-delta-handoff-implementation.md).


### 2026-11-20 M4 saved-input producer-lineage refinement

Saving an open source changes two independent inputs: authoritative overlay bytes
and physical catalog admission. Compiler contentRevision intentionally excludes
hidden disk writes; it must not be repurposed to prove that the disk catalog is
unchanged. Source fact selection consumes an exact Store-issued catalog lineage
plus complete overlay metadata delta,or uses the existing full pass.

Catalog producers record known same-member regular changes and carry complete
refresh differences. Snapshot publication commits bounded32step/512path metadata
history; unknown transitions,overflow,name/eligibility uncertainty,reset or gaps
retain full reconciliation. These are optional delta-cache bounds,not project
limits. No AST/text/validity bit or unbounded old-snapshot chain is retained.

This refines M4 delta selection,not ADR0019/0044 raw freshness or the existing
compiler-content version contract. Every original load witness,current/final
physical proof and old-request refusal remains. An old captured catalog discovered
stale in ensure is rejected; only a separate fresh capture may recover. No claim
that public unnotified first-attempt availability improved.

Alternatives rejected: equal compiler version as disk authority; always full
source facts on every save; expanding compiler versions for hidden disk input;
merging incomplete histories; trusting watch names without original final proofs.
This uses existing Store snapshots/watch/refresh ownership rather than a second
input database. Public RED02 distinguishes overlay-only/disk-only controls from
save; final frozen-V regression2PASS3FAIL and W19/19targeted PASS are retained.
30Kordinary/full/Windows qualification is pending. Status/review history above
is unchanged. [Cause, boundaries and evidence](../reports/2026-11-20-saved-input-fact-delta.md).


### 2026-11-20 independent lookup authority and physical open-save renewal

A resolved binding's witness/dependency/lookup collections are closed after its
resolution. Same-phase composition is versioned by replacement of overlay/script
authority,not unrelated binding-cache insertions. The graph's broader topology/
fact revision still changes on every original mutation. Initial interleaved
imports control preserves first registration and removes98additional
compositions; both hot requests retain99/99independent final observations.
No cross-request valid bit or final memoization is introduced.

Physical membership and compiler overlay authority remain separate: a known
regular open source may renew complete physical evidence while its compiler
bytes still come from the overlay. Existing renewal checks all original names
and unaffected tokens,retire the old proof,and retain raw current/final namespace
and leaf checks. Open-source renewal additionally requires no reset uncertainty;
unknown/membership/failed-proof cases retain full reconciliation. This refines
M4 producer coverage; it does not allow a stale request or source origin to rebase.

Alternatives rejected: constant unversioned composition keys,global cache-action
versions for immutable children,compiler version bumps for hidden disk changes,
removing final checks or treating watch events as physical freshness. Count
regressions are not millisecond gains. W30Kstill7.8–8.6s saved first and2.7s hot;
X25public cases pass but broader/ordinary/full qualification remains pending.
Original V2737/2738full failure remains. Status/review history above is unchanged.
[Measured costs, controlled race and proof boundary](../reports/2026-11-20-saved-query-phase-cost-and-open-renewal.md).


### 2026-11-20实现记录：不可变组路径派生元数据（不改变决策状态）

NAV-SCOPE-PATH-METADATA-001沿用M1：组发布的绝对paths冻结后，共享词法identity索引与保留重复拼写的条目。
弱键只拥有纯路径元数据；可变数组/相对路径回原推导。磁盘、符号链接边界、原始输入证据、
两阶段核验与取消/调度合同不变。不构成跨请求有效证明，也不是watch-only新鲜度。
公开回归热396成员792次重复规范化→0，77项针对性检查PASS；当前Y全量与30K收益尚待验证。
详情见[实现与证据](../reports/2026-11-20-hot-query-proof-and-scope-paths.md)。


### 2026-11-22 当前完整索引资格与引用入口协调（实施验证中）

引用入口仍观察磁盘并失效语义结果，但不能仅因首次观察新内容就撤销已合格的当前Native输入。
实时完整指纹、store/domain/head、READY qualification及await前后owner均一致时，省去重复协调；
不满足仍保守回退，current/final围栏不变。目录生命周期同样要求完整URI+内容指纹。
[因果证据与公开RED/GREEN](../reports/2026-11-22-reference-qualification-revocation.md)。
本补充不更改本ADR状态，不将2752前候选门禁算到新父进程，也不宣称UI或耐久完成。
