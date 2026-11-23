# 引用结果缓存按查询证明准入：可执行设计

日期：2026-11-22；状态：已授权实施，第一种查询证明已接入；完整验收及泛化覆盖仍进行中。
对应 [ADR0047](../adr/0047-query-qualified-reference-result-cache.md)，问题 `REF-CACHE-QUAL-001`。
本文件位于当前隔离候选，主工作树及日常安装不改动。

## 目标与边界

让已证明完整且输入仍有效的引用结果可缓存，不再把全局READY作为唯一门槛。
全局SDK partial仍如实报告；SDK未知影响查询时仍拒绝缓存。
仅改现有references结果缓存，不引入定义缓存、持久化、细粒度失效或放宽完整性。
性能遗留项按既有ledger保留，不将此设计描述成已经改善30K。

## 当前链路与缺口

1. `semantic-worker-proxy.ts:references` → `reference-query-entry.ts:runWorkerReferenceQuery`。
2. `cachedReferenceResult`先查LRU；存在条目才调diskReferenceProof确认旧inputProof。
3. miss后 `referenceCacheAdmission`读取前置namespace及全局readiness。
4. `reference-candidate-selection.ts`取候选/覆盖证明；`reference-search-executor.ts`经锚点与各批验证后合并。
5. `reference-query-router.ts:publishReferenceResult`读取后置证明、assertCurrent，然后cache.set。
6. `diskReferenceProof`要求READY和全局identity/coverage；partial时即便完整Locations也不能store。

`SemanticReferencesOutcome.complete`目前只携带Locations/另一includeDeclaration结果。
`IndexQualification`已有store/domain/head/input/fingerprint，但只证明Native事实当前资格。
两者都缺“整次搜索为何完整、哪些语义输入负责”的可传递联合证明。
`ReferenceNamespaceAdmission.read`同时承担结果缓存准入和输入变化检测；不能因缓存不适用就删掉后置read。

## 建议数据模型（内部类型，不改变标准LSP Locations）

`ReferenceQueryProofV1`由专用构造器从内部验证器证据组装，并经worker协议schema严格校验：

| 组成 | 必需信息 | 发行条件 |
|---|---|---|
| query | root/anchor identity、authority、cursor、text hash、includeDeclaration | 实际compiler锚点匹配；不能用显示名代替身份 |
| environment | compiler/producer hash、project/config/target、selected SDK/component、stdlib identity | 与原load证据对应；unknown影响域明确 |
| universe | 完整成员/overlay namespace及实际内容指纹 | 覆盖增删/移动、nested-root overlay、目录负查找 |
| coverage | full-scope或qualified-index+exclusion链、各批和排除证明摘要 | 所有必要批次结清，无截断/未验证排除 |
| inputs | 实际读集、解析/负查找/全局环境依赖及原owner资格 | 读集仅为一部分，不能替代搜索全集/排除证明 |
| lifetime | 输入revision、owner/Worker代、配置代、最终验证收据及proofVersion | 原租约内独立final已成功；await后请求仍属当前输入 |

推荐单独内部结果envelope携带receipt，不向LSP返回；`otherReferences`须有独立includeDeclaration覆盖，
不能自动复制主结果的收据。第一步可保留旧string-proof变体兼容，两个变体不互相强制转换。
共享不可变metadata可按内容去重，但不能共享跨请求“磁盘仍有效”的判断。
Worker/owner替换先保守失效，不迁移闭包/AST以换命中率。

### SDK partial的发行规则

不把所有partial视为同一类：单独记录原因及影响域。全局mismatch只是环境条件。
发行器检查该符号解析、全部候选/排除、global/augmentation与依赖闭包是否仍可证明完整。
例如显式module-local声明的闭合搜索可成为正向夹具，但必须经真实编译器及未知SDK对照证明，
不能预先认为所有“项目内符号”都安全；SDK可通过增补、全局声明与绑定环境影响它。
存在未解析import、unknownambient、遗漏barrel/跨根、未完成批次或身份模糊则不给receipt。
不得将“SDK API24下得到的结果”冒称成“API20完整语义”；目标与实际SDK均纳入证明。

## 状态与执行顺序

### miss / store

1. 获取独立request token、真实当前输入观察和原lease；资格不足可继续普通计算，但不缓存。
2. 编译器锚点验证；完整候选/排除证明与所有批次绑定同输入，保留原final/source fences。
3. 成功merge之后仅在final结清、没有取消/世代变化时发行receipt。
4. 父端校验内部schema、请求/根/配置/overlay/revision与receipt一致，再写原LRU。
5. 中途变更使旧请求失败；不得靠重新capture到新revision为旧结果补票。

### hit / reject

1. 按现有query键找entry；没有entry走miss。
2. 校验proof版本、环境/配置/target/SDK与owner存活，实际重验内容和目录证明。
3. 在当前请求final阶段重新核验并在发送前检查cancel/revision；成功才记录hit和发布。
4. 普通不存在/metadata驱逐→miss；输入已改变→旧请求content-modified；不可读/身份不明→保留既有拒绝。
5. 通过的hit不运行Rust候选搜索、引用planner/verifier或createProgram。
   可消费原始coverage receipt加当前等价输入；不要求旧SQLite读事务跨请求存活。

### invalidation / lifetime

保留根及物理重叠根的source、overlay开改关、SDK、config、包/锁文件失效。
无通知磁盘变更仍由实际namespace/content与目录/负查找证明检测；watch revision仅是快速拒绝提示。
文件移动恢复、符号链接改目标、同大小mtime回写都不可仅凭旧hash/epoch命中。
缓存entries+receipt按原entry/bytes容量计算；取消/evict/dispose解除引用，不能pin Program、AST、DB reader。
metadata容纳不下就不缓存，普通完整结果保持完整返回；不新增默认RSS驱逐策略。

## 实施切片（每片RED→GREEN，先不改变粗粒度失效）

### S0 现状表征

冻结当前源码/server/Worker/SDK及原始日志；公开用例证明partial闭合查询重复目前不store，
以及READY原缓存命中、取消、未通知变更的原行为。以缺少store/hit/新增batch作为RED，
不能用硬延时断言代替机制断言。保留原资格修复64项/六轮记录作为前候选历史。

### S1 查询证明生产

扩展内部verifier/batch/exclusion汇总，发行版本化receipt；严格worker编解码与父端验证。
首先仅观测，现有global-READY准入仍生效。用真正未知SDK/全局增补与跨文件反例验证拒绝。
`status:complete`但没有receipt不报伪错误，也不能新获缓存资格。

### S2 分离缓存资格与新鲜度

拆`reference-cache-admission.ts`为请求输入/final fence及receipt admission两项职责；
前后实际观察不因cache-ineligible丢失。接入现有LRU双proof变体与root invalidation；
partial只有拿到合格receipt才能store/hit。旧完整READY路径保持，禁止cacheable布尔旁路。
独立消费者取消、旧请求失效、单一终态、nested-root域维持原合同。

### S3 针对性回归与全量

公开child+framed stdio覆盖下表；TypeScript/协议schema与manifest检查；最终候选pnpm check:fast。
变更旧超500行文件时先表征再提取职责、总行数不增长；新源/测试/脚本不超500行。
无Native schema改动的方案不要求虚报Rust验证；若确需改Rust，增加focused cargo test和release构建。
失败定位修复后重新冻结，不能引用前候选全绿当当前候选通过。

### S4 真实/规模复验

固定输入/SDK/Node/运行模式；受控2048/20K/30K、实际Program规模与Native候选分别记录。
先partial正例/反例+READY对照，至少三轮串行，区分新进程冷、索引暖与同进程结果hit。
再实际Photos30K匹配当前选中SDK条件，验证真实符号是否确实具备receipt；不合格要说明缺哪项。
记录init、首次、重复、保存后首次、重复、关闭重开、热缓存后的无通知修改；精确位置比对。
记录cache拒绝原因、扫描/IO、Program/batch/候选、p50/p95/max及Node/native资源。
UI与Windows独立验收，不能由协议回放代替。500ms是体验目标，不新增硬门限。
此阶段才能给测量收益；若仍需全namespace扫描，明确保留O(N)输入观察成本，不承诺常数时延。

## 必须通过的公开验证矩阵

| 场景 | 必须观察的结果 |
|---|---|
| partial但查询闭合、未变输入 | 首次精确结果+store；重复exact hit；无新增引用batch/Program |
| READY原路径 | 结果与既有缓存合同不退化 |
| partial且未知SDK会影响符号/覆盖 | no receipt/no store；不能缓存截断Locations |
| resolved→unresolved与SDK修补/切换 | 旧entry拒绝；恢复后重新证明，不沿用旧完整性 |
| 新增未读文件含新引用/无通知新增 | 命中拒绝，重算包含新位置；不能只验证旧read set |
| 未通知改依赖/配置/SDK、同mtime同长度 | 旧结果不发布；保留磁盘权威 |
| 全局增补、ambient同名、barrel/alias、跨模块/根 | 原锚点及全集/排除都经对照；unknown拒绝缓存 |
| overlay未保存、nested-root、close/reopen版本重置 | 使用真实authoritative内容；失效域与freshness正确 |
| 路径替换/符号链接/Windows盘符身份 | 原身份合同保留；不得全路径lowercase |
| includeDeclaration正反、合法空结果 | 分别精确校验；未绑定符号的空结果不能冒充完整 |
| 取消/timeout/部分批失败/最终围栏失败 | 不store，不发迟到hit；旧请求单一终态 |
| 同key多个waiter、期间编辑、Worker换代 | 单waiter取消不串扰；变更/换代拒绝旧收据 |
| eviction/dispose/大结果/大proof | 有界元数据且无owner/AST/DBreader残留；不截断正确结果 |

## 可观测性、回滚与验收

沿用cache.hit/miss/store；增加结构化refusalReason/proofVersion/coverageKind、输入校验耗时与batch计数。
禁止日志输出源文本，证明失败必须能区分eligibility、freshness、owner与schema问题。
接入验收：partial正例真实store→hit且无重做语义验证；所有反例拒绝旧结果；全量与精确对照GREEN。
不以命中率或偶发低延迟替代正确性；真实Photos若没有合格查询，不能宣称其缓存问题已解决。

提交边界：S0表征；S1生产/协议（旧准入不变）；S2消费+回归；S3/S4收据与测量文档。
新receipt消费回滚到旧global-READY路径时，清当前内存答案缓存；旧proof不得被新代码误认。
不修改SDK选择、目标API、超时/内存/规模上限或引用完整性合同。
本轮仅设计；未实施、未合并、未部署，也未为该方案运行新产品测试。

## 2026-11-22实施进度（不冒称全方案完成）

- S0：公开真实LSP RED确认SDK partial的闭合局部变量重复查询不store。
- S1：版本化`lexical-block`收据、严格字段解析/不可变复制、批次一致性已接入；
  函数体内直接let/const绑定、单声明、无语法错误/源码变换/简写属性联系才发行。
  该作用域本身证明其他文件不能出现同一绑定的引用，允许省去不必要批次。
  full-scope/qualified-index跨文件收据及SDK依赖读集泛化未完成。
- S2：现有LRU双准入已接入，不删除全局READY兼容路径。保留前后raw核验、原租约、
  根级通知失效；用现有解析器namespaceIdentity隔离实际观察到的配置代，并防cache-entry ABA。
  includeDeclaration另一策略需独立新收据。可选metadata不会挤掉合法主结果或pin AST/SQLite。
- S3：冻结129项相关/协议检查PASS，当前实际pnpm check:fast正在运行，不能沿用2758旧收据。
- S4：完整门禁通过后自动串行2048/20K/30K各3轮功能验证，使用新的隔离生成副本，
  保留原import闭包并追加局部probe；不冒充真实Photos、UI或两小时耐久。

SourceNamespace新增可选resolutionIdentity，表达已准入解析器owner/epoch而非磁盘有效性；
旧端缺失该字段不能取得新partial缓存资格。SDK partial/不匹配状态仍原样返回。
[详细实施证据](../reports/2026-11-22-query-qualified-reference-cache.md)。

### Second producer checkpoint

First producer full gate2767PASS and all nine scale sessions have completed.
Second candidate `/private/tmp/arkts-query-cache-inputs-20261122` is separate:
complete-Program exported project declaration receipt plus original actual
read/lookup evidence and independent final validation. Public RED→GREEN covers
SDK target mismatch, identified distribution, stale SDK bytes and source fence;
new full gate/scale/Photos receipts are not yet claimed. Remaining work is
coverage aggregation and index-qualified exclusion proofs, then final validation.
See the ADR implementation refinement and report for sufficient conditions and
explicit unsupported domains; this is not a blanket COMPLETE/READY bypass.

### Q4 binding/coverage implementation checkpoint

Native admitted qualification+fingerprint+binding digest now reaches parent cache
admission; required compiler anchors and all candidate batches must complete.
Distinct compatible Program receipts can combine; conflicting original identities
or stale publication facts fail the old request. Namespace/cache ineligibility
cannot suppress the final input failure.

Eligibility follows searched project bindings into actual SDK declaration
closures. Unsupported or unknown reachable types refuse reuse; unrelated Node
ambient failures no longer poison independent query proofs. All original byte,
configuration, namespace and final evidence is still checked, not watcher-only.
Rooted read dependency is separate from global READY. See ADR0047 refinements.

2048 calibration now PASS13 queries/7 hits after preserved failures and isolated
instrumentation. Freeze Q4 before related serial gates and actual check:fast with
normal process-sampling permission; then2048/20K/30K ×3 class-query checks and
actual Photos eligibility. No prior first-producer gate covers this final code.

### Final candidate progress

202 related checks and actual pnpm check:fast2787 PASS on frozen Q4.
All9 generated class scale sessions PASS,117 queries/63 actual hits, exact
saved/undone/unsaved/closed results and SQLite/CLOSED. Photos read-only check
is running. No UI/Windows/endurance claim;30K hot still~8.66s.

### REF-CACHE-QUAL-001 — final measured status

Implementation and202focused/2787full checks PASS;9generated protocol sessions
PASS (117functional/63true hits). Actual Photos29995 initialized partial in
96.37s, then first local references hit unchanged45s external protection and
was stopped by driver; no Photos cache hit claimed. Cache correctness coverage
is validated; Photos first-answer availability and scale-dependent hot latency
remain OPEN. No UI/Windows/endurance acceptance, merge or deployment.
See final report for identities, timelines and raw failure evidence.
