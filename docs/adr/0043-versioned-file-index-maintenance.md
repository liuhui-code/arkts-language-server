# ADR0043：文件事实版本化、增量维护与原子可见发布

- 起草：2026-11-03；交付复核：2026-11-04。状态：**Proposed；IX-00/01/02/03/04/05实施中，旧冻结候选已执行完整代码检查及30K连续协议长测；后续修复候选须重新验证，完整产品验收未完成；未追认 Accepted 或独立审批。** [2026-11-09实际验收范围](../reports/2026-11-09-photos30k-versioned-index-endurance.md)。
- 最新实施检查点（2026-11-11）：格式10/110最终候选已集成；Mac/Windows native检查及Windows公开LSP已通过，IX22完整Node与同候选规模/耐久验收仍在推进。保持Proposed，不追认审批或Accepted；[最新生命周期证据](../reports/2026-11-11-versioned-index-owner-metadata-retention.md)。
- 编号依据：只读核对 GitHub main `298d65f5d7f796c347fe8be5c739e428066489d8`，现有编号到0042；集成前再次核对。
- 问题：R-13，关联 R-02/R-08/R-20；不另建远端 issue。
- [执行计划](../plans/2026-11-03-versioned-index-maintenance.md)、[唯一 Feature Ledger](../plans/references-feature-ledger.md#idx-v1-feature-ledger)。
- [根因](../reports/2026-11-03-index-rewrite-root-cause.md)、[方案评审](../reports/2026-11-03-index-incremental-proposal-review.md)、[42份ADR审计](../reports/2026-11-03-index-versioning-adr-conflict-audit.md)。

## 1. 问题与范围

固定298d的 mixed-03 证据有77个私有写入代、31790个批提交、累计456706174应用层行计数，
目录逻辑峰12.45GiB。它们不是77次成功发布或物理写放大比。
128文件隔离复现中改1文件仍写128；已解析源过期后仍写到128才由最终检查拒绝。
现有 hash-first 能免除整库完整命中的解析/写入，miss仍整库写；refresh虽能按文件更新，
但清除全库 fingerprint，现行调度也丢失了具体变更集。

目标是让正常源码更新、删除、移动、大文件及大变更组都能增量维护，
不会因一个文件过期丢掉其余有效文件 facts，不再靠重复私有全库写入推进日常更新。
保留完整输入检查、官方语义验证及大规模功能限制的真实状态。
本ADR不处理无关答案缓存TODO、20K语义范围上限、SDK问题或客户端UI所有权。

## 2. 参考机制及本项目选择

借鉴 clangd 的文件facts归属、不可变读快照以及后台按文件缓存，
不照搬它允许后台索引滞后的语义取舍；不承诺全局查询与候选数量无关。
[clangd indexing](https://clangd.llvm.org/design/indexing)。

继续SQLite，采用**不可变文件facts＋发布组日志＋同库资格提交**。
不自研Merkle/B-tree存储引擎，不要求物理分片，不为每次编辑复制全量URI映射。
SQLite提供独立连接的事务快照；WAL不提供跨数据库原子提交，旧reader也可能阻止checkpoint推进。
[隔离](https://sqlite.org/isolation.html)、[WAL](https://sqlite.org/wal.html)。
这些资料只支持底层机制，下面的数据模型、协议和完整性证明是本项目的设计责任。

Context7已尝试SQLite resolve-library-id，传输失败，未获取query-docs；回退核对上述官方资料及
[FTS5](https://sqlite.org/fts5.html)。证据在`.bench/index-versioned-plan-20261103`，不伪称Context7成功。

## 3. 身份与权威

| 身份 | 含义与约束 |
| --- | --- |
| workspace identity / store UUID | 原物理工作区身份不改；每份物理data库有独立UUID，不跨库比较本地序号 |
| facts domain / file version | canonical URI、源码SHA、schema/extractor域及实际影响解析的配置决定facts键；不省略URI，不全路径小写 |
| manifest entry ID | 每次文件映射变更的唯一身份，不重复使用；同facts撤销再恢复也不能绕过ABA检查 |
| native input token | `(issuer session nonce, revision)`；仅发行会话内磁盘/成员/规则输入单调，不跨窗口比较数字，与文档/overlay及compiler版本分开 |
| published sequence / qualification ID | 前者标识DB可见模型；后者确认特定完整对账输入。两者都不等于磁盘永久最新或语义READY |
| resolver domain / Worker epoch | 保留既有owner、配置和线程世代，native序号不代替它们 |

缓存的解析结果不是有效性证明。路径身份、长度/mtime/SHA、命名空间和配置证明必须实际取得；
新证明可引用内容键相同的完整facts，但不能为旧resolver结果盖新戳或复活旧公开请求。
未保存overlay继续由DocumentAuthority和语义路径拥有，不把它持久化为磁盘索引事实。

## 4. 存储模型：发布日志就是版本化manifest

建议新格式与当前11/111不兼容，拟使用下一个可用schema版本（固定298d下为12/112）；
实施时重新核对编号，不把两种布局混装进同一schema。
表名是本次接口设计名，最终命名可随代码约定调整，职责和不变量不可省略。

| 对象 | 内容与约束 |
| --- | --- |
| metadata | workspace/store/domain、head_seq、namespace_epoch及资格摘要；是本库可见状态权威，不用单个全局qualification指针替代所有窗口资格 |
| file_versions | 完整内容键、immutable version ID、staging/sealed状态、各facts数量/支持资格；seal后不可改内容 |
| 各facts表 | symbols、exports、occurrences、identity、alias、binding、heritage/provenance及FTS全部绑定file_version；ordinal局部于版本 |
| publication_groups | group/attempt唯一ID、期望store/domain、staging/sealed/published/aborted、可空commit_seq、统计及原因 |
| manifest_entries | `(group_id, URI)`唯一；accepted→file_version、rejected→原因、removed→墓碑；记录期望原entry，分批暂存 |
| qualifications | 完整对账attempt、发行session/native token、已核验的head/准入集合摘要、scan-complete/rejected资格；与发布/确认原子提交，按发行会话寻址 |
| maintenance使用权 | 活动writer/parser及可复用staging的所有权；进程死亡依靠OS锁/现有监督，不靠PID或TTL猜测 |

完整manifest在逻辑上是：对每个URI，取本次head之前**最新已发布组**的entry。
不在每次提交时物化一整份URI→版本表；大组的entry也先分批落盘，最后只发布组头和metadata。
file_version独立于最初创建它的group：多个后继组可复用同一sealed版本。
创建group只记录来源，禁止以其删除级联删facts；GC先移除无用映射，再按全部有效引用判定版本回收。

点查的逻辑形式为：

```sql
SELECT e.* FROM manifest_entries e
JOIN publication_groups p ON p.id = e.group_id
WHERE e.uri = :uri AND p.state = 'published' AND p.commit_seq <= :head
ORDER BY p.commit_seq DESC LIMIT 1;
```

必须建立URI/组和已发布序号索引，测量EXPLAIN及历史版本影响，不能把示意SQL当作已优化实现。
全局facts查询只接受该最新entry引用的版本；墓碑/拒绝不得复活前一版facts。
不按文件重新实现跨文件符号绑定：既有动态binding/alias解析用同一可见集合重新验证，保持Unknown传播。

FTS仅作现有候选检索，**先验证可见版本，再LIMIT/去重/计数和rank_symbols**。
当前排序由index-core的rank_symbols承担，不新增受隐藏版本文档统计影响的bm25排序。
所有prefix、acronym、substring、export、reference、binding、heritage接口都须迁移；
只改一条search SQL不构成完成。FTS行及触发器与对应版本的插入/GC在同一事务维护。

## 5. 状态转换与提交

```text
文件：absent -> staging -> sealed -> 可被发布组引用 -> unreferenced -> GC
组：  staging -> sealed -> validating -> publishing -> published
                    \-> aborted / superseded / failed
```

SQL staging COMMIT只表示持久化草稿，不表示对查询可见。
多个小事务可构造一个大文件或大逻辑组，只有seal且数量/来源/资格验证完整后才可发布。
删除不在前台物理删一大份facts，而是发布removed entry；回收在后面完成。

提交算法：

1. 固定store/domain及输入token，捕获受影响URI的当前entry/read-set；事务外读取、解析和检查源码。
2. 用现有有界批次暂存facts/entry；完整版本可按内容键复用；不把半个版本当作命中。
3. 在读快照H中核对read-set、计数delta、namespace和已seal状态；输入fence仍在事务外实际执行。
4. 短`BEGIN IMMEDIATE`中检查物理store仍活动、domain/token有效且`head_seq=H`，
   分配新commit_seq，发布组头、计数/资格变更与head，单库事务提交。
   不在该事务内解析、读全项目源码、逐条搬facts或更新数万条活动head。
5. head竞争则退出写事务。只有核实受影响entry/read-set未变，才可在新读快照重新计算delta并重基准；
   同文件变化、缺失证明、namespace变化或域不兼容则拒绝，不以“编号更大”接收旧内容。
6. 原完整私有库bootstrap/恢复仍比较整个parent/store/generation，**不允许整库重基准**。

`publishing`准入与输入/取消按owner的同一顺序门闩判定：准入前已观察的相关变化必须拒绝；
准入后进入短不可取消提交区，新事件继续进入后继pending，不阻塞控制循环或抹掉事件。
若期间有新token，旧token收据不得解除新dirty；提交成功仍记published，不能事后改报cancelled。
组可见性的原子点是data COMMIT；准入不等于已提交或已回包。CAS/SQL失败保留明确失败终态。

大read-set核验在读事务，最后短写事务只CAS所依据的head，避免把大组的检查塞进写锁。
普通增量沿用原增量事务约束并核验版本消费EOF、实际行数/ordinal/去重、支持资格和FK/FTS事务维护；
bootstrap/迁移/完整私库仍执行quick_check、foreign_key_check及外部内容FTS integrity-check。
不把全库完整性扫描放进每个文件的短发布事务，也不静默删除完整构建原有检查；损坏/约束错误明确失败。
不能因不断竞争在同一请求中无限重试；未完成任务重新进入有界/公平调度，并记录冲突和结果。
源码不是原子FS快照，提交前fence不能证明提交后的磁盘永久不变；原查询最终新鲜度保护继续执行。

## 6. 新鲜度收据与兼容

新维护协议必须明确advertise `versioned-file-maintenance-v1` 能力；这是内部sidecar能力，非新增LSP能力。
启用新格式前须同时迁移父端、协议校验器、native状态与ReferenceIndexFreshness消费者。
没有能力时保留legacy0034/0042及0005水位路线，不从缺失字段猜测新资格。
新格式拒绝没有CAS/输入资格的旧refresh写入口，不留下旁路；旧格式旧API兼容行为保留。

完整资格收据至少包含：workspace、store UUID、facts域、native input token、reconcile attempt、
manifest head、qualification ID、scan-complete及拒绝状态。它来自同库已提交记录，而非owner的旧缓存。
父端仅当dirty token仍匹配、收据完整且指向当前已发布head时解除该次dirty。
后续事件、物理store换代或不相容配置会撤销它；结果仍通过原managed/overlay revision及compiler/final fence。
资格按发行会话/token及qualification ID寻址并受owner使用权保护。
另一窗口在同head上完成No-op对账不能覆盖/废弃本窗口仍有效的收据；不同窗口token也不得互相认证。
另一窗口真正推进head后，旧head收据不能认证新模型。store UUID更换时不比较两库generation大小，
完整迁移后新库序号从较小值开始也可按新域收据恢复，不能永久卡在旧水位。

**本方案保留完整对账资格的保守成本**：为清除完整引用路径的dirty，按现行完整扫描及
最终length/mtime/SHA合同确认准入集和源码；对账发现变化只解析/写变化文件。
普通精准delta可以先维护facts，但“写完单文件”不自动获得完整查询资格。
这是一条长期的完整性边界，不是日常大文件退回全库写的临时方案。
要进一步缩小完整输入检查范围，须另有可验证的依赖/输入证明决策，不在本次暗中采用0039已拒绝的目录证明。

No-op也必须完成适当输入确认：若facts/head相同，可只提交新qualification记录及引用，
无需伪增facts代或重写全库；重复同token可复用已验证终态。
若data变更已发布而完整对账尚未完成，当前完整资格保持pending/unknown；
旧qualification可作历史记录，但不得认证新head或解除dirty。
公共索引状态的warming/ready/degraded枚举不改，pending/unknown仅为内部资格细分；
资格不足不级联改变整个语言服务或健康Program的状态，合法局部查询仍走原路径。
“免写”仅指免facts bulk写，资格元数据/WAL实际成本仍记录。
namespace/规则不确定、漏watch恢复、overflow/重连、ignore/配置变化要求完整reconcile；
policy-skipped、正常ignore、I/O拒绝及scan-incomplete继续按0042分别处理，未知不能冒充完整空集。

## 7. 调度、取消与进展

每native进程每workspace一个maintenance owner，按URI合并pending并保留最新输入token和不确定性。
跨进程不假称只有一个任务：SQLite串行事务、既有publication锁及CAS协调所有writer。
达到既有传输/队列额度时收敛为needs-reconcile，而非丢通知后确认已覆盖。

控制面必须可读取changes/cancel/status，读取NDJSON的主循环不得同步解析大文档或等待SQL写完。
查询/status也不在控制循环执行SQL，使用独立读连接和有界reader executor，与维护写队列分开；
status从data读实际head/资格，不能把进程内旧值当最新状态。实际读IO/排队仍计时，取消ACK不冒充新鲜status。
实际parser沿0042最多4个在途单项、有界交付、单writer及原批次额度；慢首项不能形成无界reorder。
任务/负载/进度队列有明确所有者，终态优先结清且不能被进度刷屏饿死，stdout只写协议。

- 影响活动read-set的变化及时标过期；解析前后、等待槽、写批前、验证及发布边界检查。
- 不影响该文件/组的变化不取消它；取消一个逻辑组后，已seal且当前键有效的文件版本仍可复用。
- 同一原子组内任何必需输入过期，整组不发布；持续变化的热点不能饿死独立组。
- 单parser调用/SQL同步段仍非任意点抢占。控制面继续接收取消，返回后不写/发布已过期结果；
  join/关闭和故障退出仍可观察，不把ACK当作物理完成。
- query取消只取消订阅/查询，不能拥有共享后台索引任务；文件移动等权威事件仍保留mutation和close/reopen屏障。
- 发布成功后收到取消必须报告已发布的实际终态，不能改报“未写cancelled”；每attempt一个终态。
- 不自动重放旧LSP请求，不修改语义Worker的绝对期限、恢复预算/退避/熔断或0031同步清算。

## 8. 读者、GC与故障恢复

每storage操作先pin当前物理库和reader使用权，在一个读事务内读取head、可见facts和资格。
返回的servedGeneration沿用本库published序号含义；No-op qualification可变化而facts序号不变。
跨多个操作不能任意拿旧序号重新打开旧快照；按既有最终代次/资格检查拒绝混用。
旧读事务靠SQLite快照读旧页，新读事务只见新完整模型。

库内GC只回收：无已发布最新entry引用、无活动staging/任务引用的facts；已被替代的manifest entry；
以及证实owner已退出的未发布草稿。分批删除并维护FTS/FK，不把全部历史积到下一次重启。
借用版本/资格前登记owner引用，GC在同一协调事务核验；跨进程owner存活由受管OS使用权保护，
异常退出引用可在取得对应独占使用权后结算，不以心跳或SQLite引用计数单独证明进程已死。
owner使用不可重用的session ID，先持OS使用权再登记引用，正常结束在实际任务/连接关闭后释放。
GC只非阻塞尝试失主独占权；批删除事务内再次检查head/最新entry、活动引用和sealed/staging状态，
条件变化则跳过。不能用事务外扫描的旧列表直接删，也不能删除锁对象后让同ID重新取得使用权。
仍有引用的组头/资格保留；已无引用的旧组可删除。正常打开、成功提交后的低优先维护、关闭清算触发检查，
维护量沿用writer批次边界，不新增默认RSS或整盘配额。

最新墓碑在旧映射尚存时不得删除。清除该URI全部退休历史后，
只有没有活跃引用且absence CAS仍由namespace_epoch保护时才可回收墓碑；
create/delete/move及不明namespace事件推进该epoch，防止absent→present→absent的ABA。
对账发现的成员增删/移动在发布时也必须推进epoch，不依赖一定收到了watch通知。
同文件同facts重新发布也使用新entry ID；不得只比file_version。

长reader可让旧页留在WAL，逻辑GC不等于归还磁盘。PASSIVE/checkpoint观察和后台关闭保留，
不在前台做TRUNCATE/VACUUM；需要物理压缩时作为独立、可取消/可失败的维护工作验证。
不为压缩重新全量解析/提取facts，不周期性全库替换掩盖逻辑历史泄漏。
没有旧reader钉页时，回收页优先由SQLite复用，不承诺DB文件长度立即缩小；
全量真实变更/迁移暂存仍可能同时保留大量新旧facts，不能承诺峰值恒定。

沿用workspace lease、选库publication锁、物理库reader lease和SQLite锁：
选库pin后释放publication锁再做耗时工作；最终提交在publication共享锁内核对活动store；
不持SQLite事务等待publication锁。GC独占使用权取不到就跳过，不能等活动reader形成锁环。
整库发布不等待旧reader全部结束，旧库仍由0034安全退役。

崩溃前未发布组不可见；data发布事务成功而ACK丢失时，按attempt ID查询已提交终态，不重复写/二次回包。
重开恢复资格与head以data DB为准。control DB只决定活动物理store，不为每次增量双写权威head/fingerprint。
必要的control镜像必须是可丢弃提示，不能用于新格式资格恢复。
不删除真实缓存；DB/WAL/SHM整组退役、离线/未知身份保护及Windows占用延期继续遵循0028/0034。

## 9. 完整构建、迁移与回滚

自动完整私有库构建限于bootstrap、不兼容schema/extractor升级、已确认不能局部修复的损坏恢复。
现有显式管理force/rebuild保留其全量语义，作为主动完整构建例外；
不得让普通watch、日常编辑或大文件自动携带force来绕过增量。
membership/ignore变化先重发现差异；大文件、大组和普通watch不触发自动全facts重写。
配置若实际改变extractor域，全部键失配属于明确的兼容边界，不以旧facts冒充新域。

迁移在同一个0041已选择的cache根/workspace namespace中新建独立物理库；
不原地破坏11/111，不加第二个未受管cache根，不复制活动DB而丢WAL。
完整验证后通过0034控制事务切换，起点竞争失败仍保留现用库。旧库/旧reader按lease安全保留。
旧binary看到不支持的新格式必须明确失败，不能建空库、改头或发布旧私库覆盖新数据。
回滚不能直接把旧物理库当当前完整索引；应在隔离/受管位置按旧格式重建并重新认证后切换，
或保留可用语义路径并明确索引不可用。所有原始库及失败证据保留，真实缓存清理另需授权。

## 10. 与历史ADR的关系（实施后按能力生效）

| ADR | 显式关系 |
| --- | --- |
| 0034 决策1/4/7、取舍L78–79 | 新格式日常更新用组日志发布/data内资格，取代每次整库fingerprint失配全写；保留旧格式及bootstrap控制库切换、完整起点fence和安全退役 |
| 0042 §1首片不改schema、§3完整私库、M4 | 本ADR是后继M4设计，新增schema/读写接口；保留有界所有权、4parser、hash/source fence、完整控制路径，不追认其旧门禁通过 |
| 0005 Decision L481–490 | 新能力用完整对账提交收据衔接dirty恢复；legacy仍用原水位。改变的是协议表达，不降低“编辑前构建不能证明编辑后输入”的安全合同 |
| 0005信任边界、0001、0008–0010 | native仅词法候选；不接暂停语义facts、不新增TypeChecker、不把文件局部提取变成语义局部失效 |
| 0004、0019、0025、0035–0037 | 保留答案缓存失效、DocumentAuthority、输入证明owner、旧请求失败及原租约内独立终检 |
| 0020/0023/0026/0027/0031 | native任务取消域独立，语义恢复/同步清算、单终态及调度屏障不变 |
| 0028/0029/0041 | 新增库内版本GC；保留整个workspace安全回收、默认无RSS预算和同会话cache根 |
| 0033/0039/0040 | 不宣称修UI；不恢复Rejected目录内容证明；不改变合法请求的客户端所有权/生产背压 |

本表是明确的后继建议，不改写旧记录或Accepted状态；未迁移能力仍执行原合同。

## 11. 备选与取舍

- 只保留URI级refresh：实现小，但大文件事务、资格丢失、跨进程CAS及查询可见性缺口不完整。
- 日常大文件回退全私库：容易实现，但会重现本次写入/磁盘问题，不作为长期正常路径。
- 同库stage后一次更新全部URI head：facts分批但最终仍有大写事务，拒绝。
- 每次克隆全manifest、固定分桶或自研持久树：额外全局/桶复制成本或新树正确性负担；先用关系型发布日志。
- 物理文件shard或换Lucene/其他引擎：目前无证据需要承担额外文件/跨shard资格/Windows句柄复杂度。
- data/control两库同时提交当原子：WAL无此保证，拒绝。默认抬内存/超时/规模、删fence亦拒绝。

代价：schema及全部查询迁移、按URI选择最新发布entry的SQL/索引开销、历史GC和额外维护协议。
局部查询成本还受同URI历史版本、候选量和实际依赖影响；全量对账仍可O(N)读取/校验。
不凭架构名宣称整体O(1)，不保证任意大项目/持续输入下全局查询都立即完整可用。

## 12. 验收与当前状态

以执行计划IX-00–08和既有ledger为准：先公开接口RED，再最小实现GREEN；
所有查询/FTS、No-op、source fence、同文件冲突/独立重基准、ABA、大组、取消、GC、
跨提交强杀、双窗口及Windows占用均有对应场景，才可启用生产新格式。
最终同候选跑适用完整检查、规模配对及包含原失败的至少2小时单会话协议混合；真实Zed另列。

500ms是体验目标，不新增硬阈值；仅延续测试Node RSS 2048MiB停测豁免，不改变V8/系统机制。
455冷目录3秒项沿既有授权跳过，其他失败不据此豁免。
原设计交付仅含设计和ledger；后续用户已授权在隔离工作树实施，实际行为测试见下方续记及TDD收据。
没有因此获得自动部署、提交、合并或发布授权，ADR状态仍Proposed。

2026-11-04实施进度：用户已授权按计划推进；IX-00真实native RED、IX-01发布日志基础已实现，
完整facts/FTS/资格/GC及生产接通未完成，状态仍Proposed。详见[执行收据](../tdd/2026-11-04-versioned-index-maintenance.md)。

2026-11-04后继切片：同库文件facts分块/封存/复用、外键/发布触发器和拒绝/删除恢复已实现，
新旧存储19/19通过；实际全查询/FTS准入、资格、GC和生产接通仍未完成，不追认Accepted。

2026-11-04查询切片：符号/FTS/导出已按最新发布版本进行SQL过滤再排名/limit，22项回归通过；
refs/class等读取和生产接通仍OPEN。空export旧SQLite/MemoryStore差异保留，未改变旧合同。

2026-11-04实施续记：基本全读接口、同库issuer/revision资格、同head多收据及read-set/namespace ABA基础已落地；
最后存储聚焦63PASS、Clippy/release通过；资格核对仍为O(N)完整集检查，不替代最终磁盘fence。
owner/GC/迁移及Native/TS资格消费未完成，新格式未启用；不改变Proposed状态或历史取舍。

2026-11-04生命周期实施补记（仍Proposed）：owner记录绑定稳定锁文件对象身份，GC在取得相同对象独占权后才结算；
同名新文件、缺失/未知锁不证明死亡。OS使用权在SQLite关闭后释放，borrow与GC在同一SQL协调域排序。
分批逻辑GC与PASSIVE checkpoint可观测性已实现/局部验证；终态header/owner锁保留治理、Native调度、
生产迁移及Windows仍未闭环，不宣称新格式已可部署。未改变本ADR第8节及0028/0034安全边界。

2026-11-04控制器实施续记（仍Proposed）：隔离API已通过同namespace新旧格式切换/活动库维护，
受控source检查不持publication锁；最终permit同时覆盖活动physical store及data提交准入。
publication触发器逐成员复查的实际142→2830 VM步反例已修复为前置sealed/不可变约束，
最后1/129成员均125步；只是最终UPDATE工作量，不改变本ADR关于扫描/真实依赖成本的边界。
组件格式8及12/112私库样例尚未由Native/TS生产入口启用；partial及experimental物理布局、
完整迁移/回收/协议/规模/耐久仍待闭环，不追认Accepted或宣称128原生回归已修复。


2026-11-04 Native/读快照实施续记（仍Proposed）：显式协商的新维护协议已通过真实子进程
128文件冷解析128/编辑解析1/No-op解析及facts写入0；受控发布后异常与无终态线程退出按unknown清算、同会话新输入可恢复。
默认TS/LSP仍未切换；旧默认路径128解析反例保留，不把新API局部通过称产品验收。
读端新增QualifiedRead，将physical store/domain/head、指定issuer/revision资格和所有标准查询payload置于同一data读事务；
独立连接更新、物理库换代和回调异常对照已建立。此为第6/7节的落实，不替代最终磁盘/编译器fence。
changes/公平调度、独立reader、partial与producer升级、批writer/自动GC及迁移生命周期仍未闭环，
详细命令与已测/未测范围见TDD收据，未更改历史合同、状态或性能阈值。


2026-11-04实验布局补齐续记（仍Proposed）：新facts组件现在区分默认8与experimental108，
物理catalog仍按12/112隔离；v_occurrences实际采用对应rowid/WITHOUT ROWID，
打开前校验真实表布局，不能只有版本号不同。GC使用版本+ordinal处理occurrence，
继续有界删除并保留其他facts/FTS合同；这是既有实验配置迁移边界的落实，不把其改成默认配置。
真实RED、两个配置及保留的旧experimental迁移fixture失败详见TDD收据；
完整生产接通/自动回收与平台验收仍未完成，未追认Accepted。


2026-11-04变更调度实施续记（仍Proposed）：显式协商协议新增maintenance/changes，
保留URI/kind/input和不确定性；同URI合并最新、首次排队公平，不因无关文件变化取消稳定文件。
局部scope=file只发布data，不发完整资格；完整对账收据还须匹配owner最新input及未覆盖状态。
局部No-op仍检查原entry/namespace及physical store，不复活同字节ABA；case alias以canonical URI核验，保留文件名大小写。
此为第3/6/7节合同落实，未改变默认格式、语义/磁盘新鲜度或取消合同；结构global barrier正在补证。
有限child回归不是规模/真实UI/耐久结论，详细RED/GREEN及未完成范围见TDD收据。


2026-11-04结构屏障续记（仍Proposed）：观察namespace/configuration/overflow/reconnect不确定性后，
屏障必须持续到匹配最新input的完整对账资格，不能只清一次队列；后到精确URI意图仍保留但不越屏障发布。
显式成组移动使用namespace路径由同一发布组落地；独立通知不被默认为原子移动。
“移动后再编辑”真实child反例与修复已验证，未更改第5/6/7节完整性合同，未追认审阅状态。
公开有限交错验证不等于不确定性/持续输入下全负载公平或30K耐久，剩余范围见ledger及TDD。


### 2026-11-04 独立读取与取消实施边界（仍 Proposed）

第6–8节的读取合同以真实NDJSON回归落实：显式协商后的 `search`、`exports/search`、
`references/candidates`、`class-bindings/resolve`、`index/status` 进入独立reader executor。
当前每进程两个长期reader线程、四个等待槽，单连接单任务；这是显式并发/背压额度，
不是RSS预算、查询结果截断、超时或源码规模上限。满队列返回typed busy，不能静默丢请求。
维护writer与reader连接/任务分离，取消查询不能取得或取消共享维护任务的所有权。
初始化打开的连接转交首个reader，不额外保留一条主循环闲置连接钉住旧库。

每次读取按control选择并pin物理库，然后在一个data读事务中获取
`workspaceIdentity/storeId/factsDomain/head`、指定issuer/revision的qualification及业务payload。
`index/status` 的 `statusScope=data` 才是此时选定的权威数据快照；
旧 `status`/`maintenance/status` 的task状态不是该证明，其他进程更新后可仍显示历史ready。
同head另一issuer No-op不抹掉本issuer资格，head改变或换库后旧资格不能认证新库；
新库head较小不是回退错误。没有已观察input/匹配资格时返回stale；
bootstrap前legacy discovery显式返回format=legacy且snapshot/qualification=null，不能捏造完整证明。
这些数据库证明仍不能替代父端dirty/input、overlay/compiler及最终磁盘检查。

初始化返回 `readerEpoch`，读回复携带epoch与requestToken；取消必须匹配epoch、数字requestId及token。
调用方重用数字ID时必须使用新的逻辑token，且须等旧执行资源结束；未提供token时native生成唯一token。
需要执行期间主动取消的调用方须预先提供新token；省略token的诊断/兼容读取直到回复才获知自动token。
`index/cancel`只确认订阅取消是否接受；原查询有且只有一个cancelled终态，
正在运行的槽位仍持有至实际执行返回。排队取消移除待办；新input撤销旧input查询，不取消共享writer。
取消通过每查询独占的rusqlite InterruptHandle及SQL progress handler传达，作用域退出解绑；
晚到旧取消不能打断复用连接的新任务，同一取消owner不能同时绑定第二条活动连接。
公开read_snapshot必须拥有自己的事务；嵌套调用在安装进度回调之前拒绝，不能移除外层取消回调。
SQL以外不可中断同步段仍可能延迟实际关闭；不更改父端既有deadline/监督终止和恢复预算。

reader退出无终态时，先确认线程结束再最终收取结果，按真实资源失败结清并退役该槽，
不能把先观察到空channel误判退出。全部reader退役时，同时结清已接受等待队列，后续请求明确unavailable，
不无限重建；显式workspace reinitialize可产生新epoch，旧epoch取消不作用于新会话。
shutdown先为已接受订阅产生单一终态，连接/线程仍须实际close/join；
已向客户端取消后发生的真实存储/线程错误仍写stderr，不改报成功或重复终态。
可控SQL进度/非协作/线程故障回归不是原30K OOM或死循环现场复现，也不是真实Zed验收。

API核对：Context7 resolve rusqlite传输仍失败，原始返回见`ix02-reader-context7.json`；
实际以锁定rusqlite0.40.1源码和SQLite官方
[interrupt](https://sqlite.org/c3ref/interrupt.html)、
[progress handler](https://sqlite.org/c3ref/progress_handler.html)核对作用域与适用限制。
没有把失败的文档查询写成成功。默认TS/LSP仍未协商此能力，生产整链路尚未启用，
本节不改变ADR0026/0031取消终态、0042所有权或本ADR资格/最终证明合同，也不追认Accepted。


### 2026-11-04 长期parser所有权实施边界（仍 Proposed）

落实第7节的原4槽有界交付：现代maintenance owner持有一个按需增长至4的纯Rust parser池，
任务执行时移动整个所有权进入维护线程，实际完成后随内部终态归还，Producer仅独占借用。
每任务state绑定每个输入而非永久线程；普通取消不退出健康parser，旧槽位实际结果必须清算才可复用。
消费者unwind通过Drop清算借用，池仍在外层catch之外由该任务拥有；不借助跨任务Mutex及忽略poison恢复。
每输入纯解析异常有明确failed，修复输入后可使用健康池；OS/致命进程退出不靠此机制伪称可恢复。
维护线程无终态退出时，其自有Pool实际close/join在is_finished之前发生，才允许后续新输入惰性建立池。
workspace close按真实资源join；legacy未协商路径继续任务内close/join，不暗改默认协议。
这保留0042的4槽额度与0031单终态/真实清算原则，不新增RSS、文件或超时阈值；
只复用提取线程，不声称AST/SDK/Program常驻或默认LSP已接通，不改变ADR审批状态。
公开有限回归/可控异常不能代替30K原场景、规模或耐久验证；相关证据与剩余工作见TDD及ledger。


### 2026-11-04 有界file facts合批实施边界（仍 Proposed）

跨文件低层事务与语义发布组分开。普通独立URI量子继续按原作用域验证/发布，
cold/完整对账可将已解析小文件按原64文档及现行4096记录/4MiB估算额度合批。
原逐文件、逐家族多次commit会形成可测的额外事务开销；全项目单事务又扩大锁时长/取消与内存成本，
本实现采用SQL外准备和有界事务，单个大文件继续原分块，不改源码准入或截断结果。
64不是Program分组数量，批量writer不创建/重建语义Program。

小组的文件身份、pin、所有8类facts及封存在同一个data事务提交；这些sealed版本仍不可替代发布组和完整Q。
大文件每块/提交前可观察取消，已提交前缀留作未发布草稿，按既有owner/GC规则结清；
不得报告成已发布或物理零写。每批/文件current为有界内存判定，SQL外FS/完整source fence与最终CAS仍保留。
读取、FTS排名前可见性过滤及同快照资格合同不变；control DB不参与逐文件双写原子性。

公开fileWriteWork以SQLite实际commit/rollback回调观测；回调不执行SQL，作用域退出/异常展开解除。
它描述文件版本写入，不包含lookup/owner/manifest/Q全部事务，不是物理I/O或完整发布计数。
64简单文件576→1及Native cold128的128→2是该范围真实机制回归，尚不是30K时延、磁盘写放大或耐久收益证明。
此为第4/5/7/8节及0042有界所有权的落实，默认TS/LSP未协商，迁移/自动GC/完整验收仍开放，未追认Accepted。


### 2026-11-04实施补充：生产者迁移权限与存活旧会话

显式协商的 Native 初始化允许打开并 pin **结构、workspace/store及存储profile仍有效**的旧生产者库，
但只取维护状态提示；不执行旧domain的查询、inventory资格或读回调，不把旧facts重新解释成当前facts。
`migrationRequired`对应warming/可恢复迁移，不能计作reader资源失败并消耗退役额度。
维护在私库完整构建、source fence、publication CAS及admit均成功后切换；原库在失败时保持选中。
新库本地head可以小于原库head，身份比较必须包含store/domain，不能只比数字大小。

迁移权限在初始化时固定为当时观察到的旧生产者domain。之后不同domain接管时，
已存活owner的查询、普通file任务及完整对账返回`producer_superseded`，不能自动迁回自己的旧格式。
`CatalogMigration::begin_from`在publication共享锁内、创建私库之前复核权限，激活仍保留最终CAS；
提前检查用于免除明知失效的扫描，不能代替提交检查。显式管理API `begin`仍保留受控迁移能力，
Native日常路径只能使用`begin_from`。接管不是磁盘损坏，不应触发reader重建风暴。

这不是版本号排序或全局release激活服务：domain是内容身份，没有“更新”的数值顺序。
新进程显式启动/回滚可形成新的迁移权限；父端不得因superseded盲目循环重启。
不同存储profile/schema、损坏或workspace身份错误仍严格拒绝，本片不声称已实现任意旧schema迁移。
未完成的默认TS/LSP消费者及release激活流程不能由这些Native回归替代。

证据包括实际子进程旧domain初始化失败、初版反向覆盖成功的RED及单文件任务错误分类的RED；
修订后同会话坏输入失败/修复再升级、head5→1、拒绝旧facts回调、旧owner不能反向发布及迟到候选CAS均有回归。
详见[实施证据](../tdd/2026-11-04-versioned-index-maintenance.md#生产者迁移与存活旧owner边界ix-05)。


### IX-05回收控制器实施边界

`CatalogCollector`是versioned数据库上的长期维护连接，复用已验证的OS owner/对象身份、reader/workspace lease、
GC游标和有界事务；不让每个回收pass再创建一个owner。初始化及使用前核对物理选库，
跨库后拒绝新工作，不反向迁移；选库检查之后可能被peer切库，原库仍由lease固定，
结果带原store身份及检查后的still_selected提示，不冒充当前库新鲜度证明。
GC SQL及PASSIVE checkpoint不持publication锁；既有query读事务/活动pin保护继续有效。
逻辑清除不更新head、不制造新资格，不等于DB/WAL文件已经缩小。

2026-11-04本片仅实现公开Rust控制器及其回归；2026-11-05 Native自动调用的后续实现见下节。
后续调度必须把回收作为单writer lane中的有界quantum，优先消化有效输入、避免GC独占或饥饿；
复用连接并保留剩余工作/owner遍历进度，不能把一次work_items=0误当整个owner集合已经扫描完。
数据提交、清理失败、终态发送和实际资源关闭分别记录；不能因GC失败把已提交数据说成未提交，
也不能吞掉清理异常。关闭时停止新任务、等待实际占用清算，再关闭连接/资源。

当前GC仍保留published group提交收据、owner及稳定锁对象；清除facts不等于这些元数据均已治理。
后续任何元数据/锁回收必须先保护ACK丢失的重放、活动引用和OS锁对象身份，
不能为缩目录数直接删published头、删除可能仍被打开的锁inode，或靠PID/TTL判死。
自动对账、半初始化/ACK恢复、元数据保留与完整退役仍是IX-05未完成项。


回收可观测性边界：collect内部GC已提交后，末尾control选库读取仍可能失败。
调用返回Err不能证明没有发生回收；Native自动调度接入时必须保留完成/未知/未测的区分，
不能把GC观察错误覆盖为用户data未提交或零写入。本可达分支尚未做故障注入回归。


### IX-05实施中发现：使用记录的并发替换

[IDX-V1-LIFETIME-001](../reports/2026-11-04-cache-use-record-concurrency.md)复现了旧代码合法并发元数据写失败，
会阻断后继索引构建。补充落实0028的活动使用权/安全写入合同，不改变其保留策略、删除授权或Proposed状态。
使用记录写入采用每workspace稳定独占记录锁，和已有共享usage锁分离，不做锁升级；
临时文件增加原子序号和成功创建后的对象归属，失败创建/成功发布均不能清理他人的路径。
原nlink/symlink/reparse/身份检查保留，不靠接受nlink0处理竞态。锁inode不随单次操作删除。
新锁只同步合作的当前实现，不能把历史未升级进程描述为已受新锁保护；混版现场与Windows须另测。

自动对账的输入权威仍在父端既有workspace调度器；Native执行有界工作/资格签发，
父端接通自动后继，不让两层各自重复启动同input或自行制造issuer。该接线尚未实现，不能标已完成。

### IX-05：保留私有构建与重试前回收（2026-11-05）

协商维护的workspace owner只保留一个私有migration对象及其SQLite sealed facts，不缓存Program/AST。
当前输入完整读取/URI+SHA+domain匹配后可复用facts，但必须重新做最终source/namespace及发布admission/CAS；
父物理发布或权威head改变不能rebase，producer接管不能反向迁移，force明确放弃草稿。
失败try不选库，下一try先清理私库未获准Q；成功立即释放parent/candidate句柄，不能等builder销毁。

单个DB不意味着历史数据有界。重试写入前先建立完整keep集合，分批放弃本owner过期staging/pin并GC；
在metadata/facts量子之间观察取消，保留已提交清理进展，下次续清后再写。保留有效pin及最新published映射，
不绕过FTS/FK/身份保护，不删除活动库Q/提交收据，不以RSS是否立即下降判泄漏。
该私库清理不代替活动库collector自动调度；published头/墓碑/owner锁治理、物理峰值仍未完成。

[本片原因、反例及验证](../reports/2026-11-05-private-index-draft-retry-and-reclamation.md)。
这细化原文件facts复用/owner/GC约束，不更改0028安全使用权、0034新鲜度和0042完整结果合同；
ADR仍Proposed，默认TS/LSP和全目标验收未完成。

### IX-05：活动库自动GC与独立故障域（2026-11-05）

协商维护的workspace保留一个GC线程/collector，一次派一个有界量子；数据任务在控制循环外等待
该量子完成，取得写入权后不再派GC。每个完成输入产生回收机会，空闲继续剩余扫描/回收，
安静后每5秒探测已关闭/异常退出owner；不是RSS预算或请求超时。GC不要求先清空历史才放行输入。
零删除不等于owner遍历完成，必须检查明确wrap；跨进程并发继续走SQLite和既有物理身份/lease保护。

输入在尚未取得写入权时可以独立取消，不取消GC或越过其实际SQL完成；控制请求/reader查询不等待GC。
关闭停止新工作、取消输入等待、清算并join线程；不声称能抢占任意同步SQLite调用。
GC只清理合法历史，不制造head/Q或改写数据终态；错误允许部分工作已提交，统计不得造0。
普通SQL错误暂停到后续输入，GC线程致命故障在本workspace内停止自动恢复，不能随mutation无穷重建；
显式同进程工作区initialize开启新GC生命周期。状态/错误独立公开，Native状态不等于Zed已有告警UI。

[原因、IDX-V1-GC-001及回归](../reports/2026-11-05-automatic-versioned-index-collection.md)。
本片接通活动facts自动GC，不宣称元数据/墓碑/ACK及全部退役完成；不改变0028安全回收、0029默认无RSS预算、
0034新鲜度或0042完整性合同。ADR仍Proposed，默认LSP接线和完整验收仍须完成。

2026-11-05完整回归补充：自动GC暴露IDX-V1-GC-002，立即删除恢复从0解析/写入退为1。
没有复用租约的旧facts对GC是合法垃圾，不能以延后几秒回收或修改既有断言解决。
待实施方向为工作区拥有的有限近期文件内容租约，明确获取/替换/命名空间确认后释放及跨物理库/关闭退役；
不把内容命中当输入资格，不永久pin全部历史，不引入默认RSS驱逐。
目前仍是候选细化，需以删除恢复/一步撤销、更老历史回收和资源回归闭环后才能视为落地。
详见[根因与未闭环边界](../reports/2026-11-05-automatic-versioned-index-collection.md#idx-v1-gc-002自动gc缺少内容复用租约)。

### IX-05：内容复用租约落地（2026-11-05）

IDX-V1-GC-002后继实现以`CatalogReuseLease`持工作区cache owner/pin，复用既有schema/OS使用权和GC保护。
实际变更URI在发布前原子取得旧当前/拟发布sealed内容，释放本owner更老版本，每URI最多两版本；
支持一步撤销/重做和删除恢复，其他URI更新不驱逐它，不永久保留全部历史。
成功完整资格后按当前同事务收据逐批释放已确认removed/不存在URI的缓存pin；旧Q拒绝。
这里限制的是结构上的近期内容数，不新增默认RSS/字节预算，不承诺无限URI/大文件总占用恒定。
若永远没有成功完整对账，删除成员的缓存收敛仍未证明，须与父端对账/部分输入治理一起完成。

输入与GC经短时资源槽串行交接唯一cache所有权，锁内不运行SQL；GC识别peer物理替换后释放旧cache，
GC fatal在屏障释放前通知输入方并结清其缓存，不把旧物理库永久钉住。
内容缓存仍须实际URI/SHA匹配与原source/final fence，绝不是语义READY/资格；失败缓存更新不发布data。
资格后的清理失败单列，不撤销已经确定的数据终态；只删除本cache pin，保留其他活动owner。

[实现、既有删除恢复RED→GREEN、撤销/重做及GC退役回归](../reports/2026-11-05-index-content-reuse-lease.md)。
228输入完整检查进行中；仍Proposed，未追认Accepted，默认LSP/全部生命周期/规模与耐久未完成。

本owner每URI最多两个缓存版本，不约束其他合法owner/reader的版本数。历史缓存失效不等于当前输入证明失效。
完整回归另发现GC-003：后台回收被is_active误算成已接受输入，妨碍reader故障后的显式initialize。
已修正为：活动数据/待办继续阻止替换；后台GC由成功替换的旧owner Drop停止并实际join；
非法替换输入不销毁原owner。不得靠客户端重试抢空闲窗口，不取消真实资源关闭。
v1失败及受控RED保留，v2完整冻结核验中；[证据](../reports/2026-11-05-index-content-reuse-lease.md#idx-v1-gc-003后台gc不能否决显式工作区重建)。

v2已完成本片适用Rust冻结核验：228输入未变，Core/SQLite253、相关Native143、实验存储86/Native79，
fmt、双配置严格Clippy/release通过。仍是局部机制验证，未启用默认LSP、不追认Accepted。
Node现有适配器27项表征通过、隔离依赖已就绪；下一片接严格协议/URI/input/Q及默认客户端，
完整生命周期、规模/2小时/真实UI与Windows要求不缩减。

### 2026-11-05 父端桥接前置（仍 Proposed，未默认激活）

[IX-03/04实施证据](../reports/2026-11-05-index-node-protocol-bridge.md)新增严格输入、物理快照、
资格和终态解析模块及显式能力协商；Native能力应答补factsDomain，与readerEpoch绑定生产者/生命周期。
同head的新资格不等于新facts代，换物理库也不能沿用上一store资格；unknown与cancelled分开。
兼容初始化仅typed invalid_params可去除capabilities字段重试一次，不能从IO/非法身份失败推导旧协议。
旧0005的generation准入仍保留；新模块尚未接入实际父端新鲜度，禁止据此宣称默认完整性成立。
真实生产LSP默认接线RED被纳入快测，后续必须使其及原128增量断言真正GREEN。
这不变更已有取消/最终fence合同，不代表ADR已获评审或新格式默认上线。

### 2026-11-05 默认候选与No-op消费者（仍 Proposed）

[本片实现/失败记录](../reports/2026-11-05-default-index-maintenance-and-noop-freshness.md)。
隔离候选默认显式协商维护，旧Native按能力结果及有限初始化重试继续旧路径；没有部署放行或Accepted记录。
维护事件须在能力/identity确认后；早到终态有界保留，取消期限从发送起，独立读取消不拥有共享writer。
新模式读取以epoch/token及当前输入匹配，完整资格只从同data快照消费，旧JSON同名字段不能伪造父端证明。
No-op资格变化可清本次catalog对应dirty，不能借数字head未变永久拒绝，也不能伪增head；旧0005水位不变。
最终源码核验重走准入集，遍历计数不保证跨遍历单调；完整终态indexedDocuments来自最终集合长度。
当前只接通完整对账差异写与资格，不代表URI/持续输入、完整metadata/partial/迁移及规模耐久已闭环。
之前“尚未接通”段落为各片历史状态；本段更新当前候选，不抹去原失败/旧协议效率限制。

### 2026-11-05 输入权威、URI合并和任务接受（仍 Proposed）

[实施后继与独立反例](../reports/2026-11-05-index-input-delivery-and-directory-lifetime.md)。
父端先同步观测token并撤销旧证明，再异步送changes；读/对账等ACK，单在途与单有界URI后继。
超既有协议额度保留watch-overflow，完整对账不能变成静默截断。命名空间/配置沿保守完整核验、只写facts差异。
观察ACK、完整任务accepted、同data资格是三种状态；仅实际accepted才能消耗本Native的完整任务输入分配。
忙碌拒绝之后等真实任务终态，用同一attempt/input后继；取消未accepted订阅不拥有共享文件mutation。
file scope/uri明确传递，data-updated/unchanged不授予完整资格；早到终态/拒绝ACK窗口不得漏唤醒。
现存祖先证明可覆盖确实缺失的路径尾段；权限/I/O/dangling不能当缺失证明，未知归属根保守dirty。
已知外逃链接拒绝，严格包含排除exact parent；与0025命名空间恢复、0034完整性/磁盘权威约束相容，不删除校验。
旧0005水位、源fence/最终语义证明及0042资源额度不变；未追认Accepted或独立审阅。
本片保存/重连/未知目录入口、漏watch对账、全负载公平及完整生命周期/规模/UI仍按原计划开放。

### IX-03/05：保存、协议调用者与工作区退役边界（2026-11-05）

仍Proposed，未追认Accepted/审阅。[实施记录](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)。
生产catalog组合显式请求fileMaintenance；原适配器显式text refresh调用者保留默认旧协议，
不在同会话自动切换，也不允许旧写入口绕过新格式CAS/磁盘证明。此为0005旧API兼容的实现边界。
save与watch共用磁盘输入链，忽略save文本作为facts；能力声明有真实LSP公开回归及精确合同。
完整资格仍须对账，不把单文件发布等同全库READY或省掉最终源核验。
工作区GC只识别已知schema12/112与facts8/108布局、原身份/卷/活动锁和删除前fence；
owner空锁命名空间按稳定对象及逐文件快照保护，不允许任意目录/未知内容，完整组退役与部分删除重试。
管理端识别两种布局不授予producer跨布局写权。已有0028/0042安全规则与真实缓存保护继续生效。
上述修改先在独立副本通过局部回归，待冻结完整轮结束后集成；整体/平台/耐久未验收。

### IX-03/04：完整编译器回退与可选索引覆盖分离（2026-11-05）

仍Proposed。[后续证据](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)。
可选Native discovery未取得完整资格时不能缩小完整搜索，也不能把实际完整编译器回退自动标成不完整。
完整workspace覆盖已选中时不传该不完整augmentation，使用完整编译器结果；真正partial范围仍保留
有用提示与不完整标记，SDK/overflow等原因独立。原最终输入/旧请求/overlay/正确性合同不变。
公开target切换RED→GREEN，随后23项相关完整/partial/预打开恢复通过；没有改isIncomplete断言。
已有新旧协议trace消费者按实际收据/旧阶段区分，新的written/reused计数来自Native，不合成旧水位。
实验退役存在一次未定位unsafe-entry阴性，后续5轮通过不能关闭GC-004；最终全量仍在执行。

### IX-03/05：输入等待与退役runtime后继（2026-11-05）

仍Proposed，未追认评审/Accepted。[新增实施与RED/GREEN](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md)。
资源-only保留observer/语义失效但不排源码catalog；读订阅只等待自己的input观察，不拥有共享writer，
替代/取消/停止结清订阅，ACK不等于Program/checker返回或完整资格。持续全对账准入公平仍开放。
GC-004第11轮捕获正常shutdown后零字节cache-use.tmp；真实公开受控回归证明detach退役可先被进程退出切断。
后继由公开Control owner共同持有有界FIFO退役runtime，最后owner关闭sender并join；job内部Control不回持owner。
publication锁忙时prune延后，避免有界反压与生产者持锁形成等待环；不删除不明历史tmp、不绕活动WAL/身份fence。
单个executor/8等待任务为资源闭包队列额度，非RSS/文件上限；饱和/跨工作区延迟、强制退出残留仍须验证。
新代码先在独立next副本，旧集成全检源码冻结；局部GREEN不能代替后继完整/规模/平台与耐久验收。

### IX-03/05后继：延后退役进展、扫描失败恢复和ignore规则分层（2026-11-05）

仍Proposed；[逐次失败/修订与证据](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md#后继验证与修订不把中间green当成完整交付)。
退役try-lock忙不是完成：每namespace合并一个pending，公平轮转重试；无待办不空转，owner关闭drain资源后
不无限等外部锁，不绕reader/WAL保护。修订后本片Rust全量410PASS/1既有ignored及双布局相关/Clippy/release通过。
暂时枚举/源不可用后的新full references/anchor准入允许一次实际重扫；真实容量partial仍拒绝，
不复用失败partial作永久证明，不重放旧请求、不省最终新鲜度。与0020/0034现有恢复/磁盘权威合同一致。
测试cache/log不得放入被测源码枚举树制造自干扰；用户配置缓存入源码树的持续漂移仍是开放边界，
没有通过忽略namespace变化取得成功，也没有追认受管缓存排除已实现。
Native ignore规则事件单列catalogRulesChanged，只改变Native input/完整对账，不升级为SDK/Host mutation；
同数据资格/差异写/0005旧水位合同不变。公开规则忽略/恢复与分层路由已验证，非UI/规模与耐久验收。
旧集成全检2360/2365 FAIL；其余具体计数/取消/启动race未关闭，不以修订片GREEN替代整个计划。

### IX-03后继：目录类型/删除传播与完整准入（2026-11-05）

仍Proposed。[反例、实现及验证状态](../reports/2026-11-05-index-namespace-lifecycle-and-admission.md)。
现存目录按实际类型优先路由；文件名/后缀不证明文件类型。已删除源码URI按已知成员目录展开后代，
继续现有局部失效，不为普通文件删除全根重置；partial不升级complete。
缺失规则路径不能证明原先不是目录，送达namespace不确定性但不伪造SDK配置变化。
所有不明目录和完整资格仍实际reconcile，不用目录观察代替0034/0039源码/身份fence。
完全无事件且未发生后继对账前的新增源检测仍开放；不能拿目录提示恢复代替此结论。
完整任务准入应等待自己的input送达而非全局排空；未accepted取消不拥有共享mutation。
该片仍须最终全检、持续输入公平和原规模/耐久/平台验证，不追认Accepted。

IX-03 further boundary (still Proposed): a deleted non-source candidate cannot
prove its previous regular-file kind. Use namespace uncertainty, retaining the
resource-only existing-file changed path. Next-only23 focused cases pass;
direct kind replacement remains untested. See the namespace lifecycle report.
Actual old/new binary safety refusal2PASS is not old-format forward compatibility.
Current full archive/test OOM negatives require build isolation and full recheck.

INPUT-014 refinement, still Proposed: catalog rule URIs reach semantic delivery
as metadata, distinct from source facts. The store derives actual affected source
namespace members, retaining SDK ownership for ordinary rule changes. This
supersedes the earlier candidate implementation note that rule-only events never
send any semantic mutation; it does not supersede the no-SDK-reload decision.
No-op0 facts and unchanged SDK-owner/Worker controls are now public regressions.
See namespace lifecycle report for93-case evidence and remaining kind boundaries.

### INPUT-015 input domains and reproducible validation (still Proposed)

Resource names alone do not establish source-namespace exclusion. Only a current,
configured and physically disjoint regular resource namespace may bypass source
maintenance. Legacy/overlap/unknown/alias inputs reconcile conservatively; this
refines INPUT-006 without granting any new query-freshness authority or changing
SDK health. Complete/final fences and physical containment remain mandatory.
The current source roots may overlap resources: such input still has conservative
scan/reset cost. No O(1) claim or filesystem-kind history is inferred.
See namespace lifecycle report for105 public/related regressions and scope limits.
Validation must rebuild actual owned dependency code after timestamp-preserving
integration; a source hash plus Cargo Fresh is insufficient. ENV-001/002 retain
all earlier failures; canonical target isolation and fresh builds are mandatory
for the next assembled gate. No ADR acceptance/review history is fabricated.

### Final assembled candidate checkpoint (2026-11-08)

[Current check/scale evidence](../reports/2026-11-08-versioned-index-candidate-acceptance-progress.md): full pnpm checkfast2393/2393 PASS, source before/after identical. Parent298d; source snapshot c475777e9563966f47b75c66dbb36351b63e7a5023e78b6f01048ce6f75a7deb. Rust410PASS/1existing ignored, experimental28PASS, release/fmt/strictClippy PASS; original100K store cost PASS. The455 ignored release correctness entry was explicitly rerun and PASS with clean fixed455 hashes; measured cold3168.92ms exceeds3s and is timing-only user-waived, never labeled a timing pass.

Two calibration oracle failures were independently reproduced on old/current public responses, retained and corrected without product changes: consumer-local alias versus direct-origin rename and separate barrel API identity. Strict range/text/open-version checks remain. New round final-acceptance-03 calibrates17 operations PASS and is running the full serial matrix. SDK remains partial; phase complete is not SDK READY. Scale/2h/UI/Windows are still open; Proposed ADR status and no commit/push/deployment policy unchanged.

This is implementation evidence, not a new decision or review acceptance. ADR remains Proposed. No existing completeness, alias identity, SDK freshness or final fence contract is relaxed.

## 2026-11-08 冷共享目录并发创建澄清（不改审批状态）

[IDX-V1-INIT-001及RED/GREEN](../reports/2026-11-08-cold-cache-multi-root-initialization.md)：
共享cache的workspaces/.leases允许合法并发创建；NotFound后create_dir返回AlreadyExists时，
重新执行原不跟随链接/类型/reparse验证后才能接受，其他错误保持拒绝。
不改为全局互斥、不无限重试、不省安全检查；这是既有多使用者合同的实现修正，非新架构决策。
Native/公开LSP有稳定冷反例和修复对照，完整新候选及Windows仍待验证；原2402/2403失败保留。

### 2026-11-08 implementation evidence: GC read work is part of a writer quantum

Status remains Proposed. IDX-V1-GC-005 shows that a row/payload deletion bound alone cannot bound incoming
writer delay: an unindexed correlated anti-probe can scan every manifest row per file version while deleting zero.
The existing single-writer/GC handoff and transaction/OS-owner safety rules remain. Candidate selection must avoid
repeated full manifest scans; evaluate the non-NULL referenced-version set once in the same data transaction.
This is an algorithm repair, no larger budget/deadline, GC disablement, schema/format change or cache-proof bypass.
Retain rejected/removed NULL handling, staging references and live pins. Test read work on the real collector with
bundled SQLite VM-progress counts at increasing input sizes; do not rely solely on deleted-item counters or timing.
An O(N) scan of real reference inputs can remain; no constant-time claim for all collection/reconcile work.
[Root cause, RED/GREEN, closure/observation caveats](../reports/2026-11-08-versioned-index-gc-query-cost.md).

### 2026-11-09 implementation clarification: private SQL validation liveness (INIT002)

StillProposed, no approval/status promotion. Full private quick/FK/FTS validation remainsmandatory before format
and physical activation; no progress timeout or memory threshold israised. A scoped SQLite VMprogress hook
reports actual validation activity and receives cancellation, relayed under the current task/input identity.
No timer-only heartbeat; first stage/work then bounded report rate. Callback must not query its own connection.
The hook isremoved on success/error/unwind, and observer isowned by one attempt, not retained acrossdraftretry.
Real progress isactivity, not a percentage/completeness proof. Only the original complete terminal clearsdirty.
[Measured42.6s check /282ms actual activity gap, regression and remaining limits](../reports/2026-11-09-cold-photos-sql-validation-liveness.md).
This fills the existing control/progress contract; it doesnot relax identity/sourcefences/publication or replace
ADR0020 semantic query deadlines. SemanticSCALE003 and unmeasuredplatform/IO limits remain separate.


## 2026-11-09 完整 namespace 资格反例（状态不变）

仍 Proposed。最终审计重新执行 INPUT-010，
[公开两路径 RED 与边界](../reports/2026-11-09-complete-query-namespace-freshness.md)。
打开文档答案缓存可绕过当前磁盘成员证明；关闭驻留且避开缓存后，旧 Native qualification
仍授予2文件候选，Worker也复用旧complete成员集合，最终都漏掉新增调用者。
input ACK/数据库一致读不能单独证明完全静默的外部命名空间未改变。
本片尚未修复，不以原耐久完成关闭该既定计划项；不暗中恢复0039已拒绝的目录内容证明。
受管缓存入源码树的实际物理路径排除与所有权合同亦继续开放，不能靠测试夹具隔离宣称产品已支持。


## 2026-11-09 完整输入准入实施后继（仍 Proposed）

[根因、实现与原始 RED/GREEN](../reports/2026-11-09-complete-query-namespace-freshness.md#实施后继名称磁盘输入与-native-覆盖范围)。
Worker 实际枚举及完整查询磁盘字节观测，不是0039已拒绝的目录内容缓存。
父端按实际名称变化/仅字节变化区分对账触发，沿用单写调度器；后者不伪造 namespace 事件或丢精确URI待办，
两者都不发SDK/Host根级配置重置。打开文件的答案缓存也需新鲜完整输入证明，最终再次断言原请求。
Native Q 可能完整覆盖较小的 ignore 范围；只能在既有 CompleteScanInputs v2 的URI+source SHA集合摘要与
当前语义准入源码集合完全相同时裁剪候选；原有资格/绑定/编译器fence不能由摘要替代。
不匹配回完整语义搜索，不截断完整结果，不把索引其他功能一并降级。没有新增存储或跨库事务合同。
新的缓存证明属于Worker工作，必须先过既有前台/诊断屏障；受控公开调度RED→GREEN，非真实30K结论。
最终rename namespace fence、受管缓存源树排除与新候选完整验收仍未关闭；不据授权伪造审阅/Accepted状态。


### 完整查询前置校验的恢复身份（2026-11-09，状态不变）

输入摘要请求是显式完整查询的一部分，使用既有共享恢复预算/输入修复条件，而不是另开恢复通道；
普通状态观察仍不能发起探测。纯元数据成功不改变watchdog实际编译健康判定。
熔断可预期不可用公开返回RequestFailed/reason，不能包装成成功空集或未知InternalError。
受控公开RED→GREEN及5项回归见同一报告；热缓存后故障历史、最终rename/受管缓存排除和新候选全量验收仍开放。


### 2026-11-09 既有受管缓存源码树开放边界的可复现证明

状态仍 Proposed，没有追加审核记录或追认 Accepted。原开放边界现有公开 LSP RED
IDX-V1-CACHE-NS-001：源码树中的 Native-owned 缓存叶被纳入语义来源（5→7），
[证据与后继边界](../reports/2026-11-09-complete-query-namespace-freshness.md#idx-v1-cache-ns-001受管叶目录仍被当作源码)。
排除须依实际 Native 打开/租约和物理对象身份，覆盖扫描/事件/Worker 重放；
cache-use.json 或配置路径本身不是充分证明。不能排除整个配置根及其真实源码兄弟目录。
该项当前尚未实施，不改既有目录内容新鲜度、最终 fence 或 SQLite 发布合同。

### 2026-11-09 受管缓存排除：Native 所有权证明第一片

IDX-V1-CACHE-NS-001 原公开 LSP RED 仍保持；Native 实际 CacheLease→CatalogStore→
initialize/cache/namespace 的证明已实现，绑定持有目录对象而非 cache-use.json 或目录时间。
目录替换拒绝、旧 owner 不写入替代目录 metadata；legacy/versioned（根可等于源码根）有公开 Native 回归。
[调用链、证据及尚未接通的边界](../reports/2026-11-09-managed-cache-source-namespace.md)。
Node/Worker/Native walker/watch 的同源排除、恢复重放与最终整体验收未完成，不把此原语当完整修复。
ADR0043/0044 状态仍 Proposed；不修改 ADR0039 内容证明决策或 SQLite 发布/最终新鲜度合同。

### 2026-11-09 managed source namespace integration

IDX-V1-CACHE-NS-001 has public semantic 7-to-5 and Native scope 4-to-3 RED/GREEN
chains. Node live proof admission, root-scoped ordered policy/removal, mutation
coalescing, Worker data, Store/Native scan fences and watcher filtering are wired.
Both nested and source-root cache layouts preserve real source siblings, regain
qualified narrowing and keep the answer cache across private cache notifications.
Related pinned 153/153, later spelling/policy controls 29/29 plus actual LSP13/13,
and final layout controls 2/2 (7 filtered) are separately identified in
[the implementation evidence](../reports/2026-11-09-managed-cache-source-namespace.md).
Lifecycle replacement, actual Worker replay, overlapping multi-root and final
full/scale/soak remain unverified. ADR0043/0044 remain Proposed, with no invented
review or Accepted status; ADR0039 and final freshness/publication rules stand.


### 2026-11-09 implementation clarification: retired cache names are not ownership

Status remains Proposed. Single-root public replacement testing found a stale owner reopening
metadata and later a lock-only race. Every lazy cache reopen/read/write lane must validate the original
held directory identity; retirement must not acquire a new lease by a now-replaced pathname.
Live Control publication locking uses create=false and the original lock-file identity, including
post-wait recheck. Independent lock descriptions perform locking; a cloned handle only pins identity.
After owner mismatch, release actual held resources without initializing/pruning a replacement.
This preserves complete source enumeration, SQLite publication/freshness and ADR0039's rejected
observation shortcut; it grants no exclusion to unknown historical cache paths. Tested idle replacement
and actual semantic Worker replay are in the [namespace report](../reports/2026-11-09-managed-cache-source-namespace.md).
Multi-root overlap, Native owner failure and final complete/scale/soak remain unverified; no approval
or general adversarial-filesystem atomicity claim is implied.


### 2026-11-09 proposed refinement: source directory role outlives optional Native failure

Status remains Proposed. Actual public failure control showed generated cache callers entering a
complete reference result solely because the Native exit callback removed an unchanged directory's
source exclusion. The attested directory role remains owned by the workspace through optional
Native process failure, while failed index tasks/qualification remain unavailable. Physical identity
is revalidated on every scan; replacing the directory revokes exclusion by identity, not age, metadata
or process liveness. Workspace close/failed admission removes policy. This refines the implementation's
previous over-eager failure revocation; it does not keep a process lease alive, prove source freshness,
exclude arbitrary historical caches or relax any completeness/SDK fences. The [public RED/GREEN
and replacement control](../reports/2026-11-09-managed-cache-source-namespace.md) support this scope;
Windows and overlapping-root behavior remain unverified. This is not an Accepted/reviewed decision.


### 2026-11-09 confirmed overlap gap (Proposed scope constraint, not implementation acceptance)

The [public two-root counterexample](../reports/2026-11-09-managed-cache-source-namespace.md) proves
that owner-root-only registration is insufficient: a live B cache inside A can add private cache
callers to A's complete references. Owner identity and affected source roots must be represented
separately, and the same attested policy must reach semantic membership and Native full/point/final
source checks under an ordered invalidation boundary. This is not authority to exclude historical
siblings/whole cache parents or bypass identity/content fences. Exact propagation/lifecycle changes
must be proved against the new public RED, including concurrent initialization and real owner exit;
no Node-only partial repair may be declared feature-complete. ADR remains Proposed; no review or
Accepted status is implied. Complete ix11 gates were intentionally stopped, not passed.


### 2026-11-09 proposed cross-root implementation refinement (not review acceptance)

Owner and containing source-root are separate relations. Only currently attested exact leaf objects
may enter a per-root source exclusion set; unknown historical siblings/whole cache parents remain
source candidates. The same per-root set is carried to Worker membership and Native full/point/final
source views. Namespace changes retain existing input issuer/revision/ACK, cancellation, final
source/content fences and single terminals. No SDK configuration flag or memory pressure policy changes.
Native `managed-source-namespaces-v1` is an explicit additional capability; optional peer proofs are
part of an accepted namespace change, [] is withdrawal and null is invalid. Native validates same
configured pool/key/root/object and pins identity without minting a peer use lease. Existing old-scope
snapshots cannot serve during requalification; reader invalidation/epoch isolate late work. A complete
current qualification restores optional index availability; unprovable input keeps it explicitly
unavailable, without degrading the semantic SDK/Worker or emitting incomplete success.

Initial scope-overlapping catalogs wait for opening owners so the first build consumes the complete
staged set. External layouts and later reconciles keep existing independent progress. A policy change
before first build does not enqueue an extra full reconcile; later changes merge a successor. Stale
physical peer proofs are removed before later grants; process failure alone is not a directory-role
change. This complements ADR0020/0025/0026/0034/0036 input/lifetime rules and does not reinstate ADR0039's
rejected metadata freshness shortcut or weaken ADR0044's mandatory proof retention.

[Actual four public cases, Native held-read/null/forged-proof controls, limitations and raw evidence](../reports/2026-11-09-managed-cache-source-namespace.md).
Different-pool cross-root, real SDK layout, Windows/UI and new complete/scale/endurance gates remain
unverified. Partial scoped projection is not introduced. Status remains Proposed, no independent
review/Accepted record is inferred from authorization or these tests.


## 2026-11-09 候选澄清：候选资格与语义执行路径分层

Native候选索引变脏只撤销候选收窄资格，不代表必须使用全局Program或放弃分批验证。
源码命名空间首次观测安排对账时，语义层仍可在完整当前源码上执行不带索引种子的
分批验证；纯内存新增源码缺磁盘身份时保留原保守路径。所有输入证明、候选资格、
最终新鲜度与完整性检查继续有效。不能用清空证明、跳过终检或永久跳过索引准备换取恢复。
[实际误路由、公开回归及恢复后诊断缺口](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md)。
结果缓存仍要求当前完整Program与源码内容证明：分批查询返回完整结果不自动认证
已因编辑失效的常驻Program；缺SDK的partial状态不冒充可复用的完整缓存资格。
ADR仍Proposed，当前后继候选完整/规模/30K验收未完成；历史通过身份不重标。


### 首次观察与实际变更的区分（2026-11-09 Proposed细化）

上节“首次观测安排对账”收敛为：初次记录不能单凭previous缺失就标脏已匹配的Native资格。
实际名称/内容变化才推进输入失效；有真实资格却与当前源码证明不匹配时，按当前输入
合并一次对账，不将对账误作语义输入变更。当前完整sourceFingerprint仍是收窄候选的
必要条件；不存在的证明不能以undefined相等获得资格。过期/legacy/overlay候选至多参与
发现，不获得完整性授权。此细化替代前节首次无条件对账表述，保留其余fence与语义分层。
[实际失败、先RED后GREEN及剩余验收](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md#ix13停止与后继修正2026-11-09取代上面的运行中观察)。
ADR0036的未通知源码发现请求必须拒绝、后继请求可恢复及SDK证明不可洗白继续有效；
Store提前发现名称变化不能在核验旧负解析事实前销毁旧context。状态仍Proposed。


### 目录刷新收据与容量失败证明（2026-11-09 Proposed实施细化）

资格输入的第一次目录刷新应带不可变root/revision收据跨越原始workspace捕获及后续准备。
后续重扫不能替换它；版本不一致拒绝该请求，原最终新鲜度检查继续保留。仅比较最后
两次扫描不足以证明第一次输入有效。此项落实ADR0036/0044输入不可洗白约束，不允许
因源码重建更新原SDK事实。有效的容量失败证明可免重扫；证明失效时必须恢复真实枚举，
不能把已过期path-count/path-byte状态永久当作权威。上限与完整结果要求不变。
[公开先RED后GREEN、无效假设的撤回及剩余范围缺口](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md)。
没有借本次实现更改Accepted历史，ADR0043/0044仍Proposed，最终门禁与当前长测待完成。


### 2026-11-09 证明用途、当前资格与未变视图（Proposed实施细化）

完整源码观察与可选完整结果缓存是不同用途。Native候选收窄/完整编辑集仍要求本次完整
源码内容证明；legacy的可选结果缓存只在已知SDK partial时省略无资格的内容观察，未知/
过期Program不得套用该省略。正路径在观察字节后重新认证，缓存存取仍要求READY及当前
完整证明。内部captureSourceInputs=cache不是公开LSP配置；内部Worker ABI升至3，旧1/2
拒绝，公开LSP与Native格式不变。首次证明缺失/历史比较摘要绝不能授予本次收窄资格。
未知内容不是内容变化；实际名称变化仍推进失效和合并对账。

同一次查询刷新后的不可变root/revision收据与第一次view精确匹配且unchanged时，可以
复用该view，避免重复组装；仍实际枚举并保留原最终fence。不同root/version不得复用。
此为0043完整资格/0044必需证明约束的实施澄清，不用metadata替代内容新鲜度，不引入
此前未批准的部分scope projection。默认indexed全范围证明成本没有因这些局部修复消失。

诊断屏障仍在缓存Worker校验之前，但quiescence仅等已经语义交付的scope。仅LSP准备
阶段的任务撤销后不能再交付，不应因其未拥有的Worker资源阻塞前台。阶段与版本/epoch/
controller检查同时生效，实际Worker终态、共享恢复预算和finally恢复保留。
[公开失败、用途反例、阶段对照、ABI与限制](../reports/2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)。
ADR仍Proposed，完整门禁/当前规模/新长测未完成；不追认Accepted。


## 2026-11-10 验收补漏关联

IX14完整检查5个失败的根因与后继修复单独保留于
[准入与物理catalog报告](../reports/2026-11-10-final-gate-regressions-and-input-admission.md)。
namespace完整字节证明不替代语义owner准入；同一物理catalog的词法入口切换不应制造源码变更，
真实symlink retarget仍须重验。实现边界澄清见ADR0044末节；本ADR的增量事务、最终fence、
资格和发布合同不变，状态仍Proposed。针对性GREEN不得代替完整门禁及新30K验收。

## 2026-11-10 Expected paths versus live freshness proofs

SCALE004's independent20K probe measures11.245s in two complete-input captures inside a13.030s
rename. Each namespace capture makes60013 native realpath and20000open calls; these are actual
API observations, not inferred Program builds. See the [bounded evidence and controls](../reports/2026-11-10-unrelated-file-query-latency-regression.md).
Incremental persisted facts do not make full disk qualification or global queries constant-time.

The existing complete native enumeration excludes symlink descendants and witnesses ancestor directories.
Its lexical scan origin and canonical physical root may supply a member's EXPECTED physical path,
avoiding a separate initial canonicalization. Only complete native catalogs qualify; injected/partial
catalogs and unproved relative paths retain ordinary canonicalization. This expected path is not a
current proof: guarded reads still resolve the live path before/after reading and validate descriptors,
names, original tokens and contents. Final membership/request checks remain. Preserve filename case.

Alias-root, retargeted-directory, same-inode hardlink and cancellation regressions protect this boundary.
No cross-request valid=true, TTL, directory-mtime authority or removed final fence is introduced.
ADR0036/0044 source/read-window/old-generation rejection contracts remain unchanged. This is an
implementation clarification under the existing completeness constraints; status remainsProposed,
without invented review/acceptance. Performance and final whole-candidate acceptance remain pending;
old f33288b9/IX18/Photos27/scale28/density29/topology30 receipts retain their original identities.
### 2026-11-11 IX-05 successor: stable lock slots and distinct logical owners

Status remains **Proposed**; no review/Accepted status is implied. This successor
is implemented only in an isolated Windows next-source overlay, not the frozen
IX20 performance candidate or daily installation. Evidence: [GC-006 report](../reports/2026-11-11-versioned-index-owner-metadata-retention.md).

The empty-store public control proves64serial closed connections leave66owner
rows/paths despite256GC quanta, with only2live and no group/version references.
The first successor instead retains2live logical rows and3stable lock objects;
the same control is GREEN. Fifteen unchanged Windows protection cases also pass
(live borrowers, crash recovery, missing/replaced locks, scan progress and format
rejection). These are focused controls, not a full acceptance or migration proof.
After a baseline→next switch, the shared Cargo target was empirically shown to
run format8 against format9source; that replay failure is not a qualified new-code
result. A fresh dedicated next target then passed all17cases with actual format9,
2logical live owners/3slots and16published replay headers/2slots. Executable
hashes and original failures are retained in `fresh-target-qualified-summary.json`.
Never reuse the old shared workspace-artifact directory for the next candidate.

The identity model separates:

- A stable, immutable lock-slot pathname/object, held with an exclusive OS lock.
  Slots may be reused after successful nonblocking acquisition; no slot inode is
  removed, renamed or replaced to reduce directory size.
- A never-reused logical owner incarnation. A per-physical-store transactional
  sequence allocates a new incarnation; deleting a row does not rewind it.
- The immutable slot object identity recorded with each incarnation. Reusing a
  replacement object never proves the previous object's owner dead. The lease
  must be acquired outside SQLite transactions; its guard survives commit.

Claiming a slot may mark preceding incarnations on that same proven object dead;
unreferenced dead logical rows are deleted in bounded GC quanta. Creator FKs,
active pins, staged/published group owners and all existing replay receipts remain
protected. Slot reuse does not change a fact's creator to the new owner, revive
old pins, or authorize deleting a missing/unverifiable lock's history. Unknown or
nonzero/reparse/hardlinked paths are not adopted as slots. Failed acquisition is
an error, never an unbounded wait inside a SQL transaction.

The successor changes the component layout to9/109 rather than silently mutating
an active8/108 store. Before integration it must implement and test previous-format
parent pinning/private migration, preserve the old physical store/reader, reject
unknown formats before owner registration and prevent a producer from migrating
back over a peer. Current first-slice format rejection does not prove that upgrade
works. No product threshold or capability completeness guarantee is relaxed.

Alternatives rejected: dropping all owner rows (breaks creator/replay references),
unlinking dead-looking lock files (inode/ABA hazard), PID/TTL death claims, and only
pruning rows while accumulating one file per connection. Published receipt/header
retention remains a separate unfinished requirement: collecting empty group heads
must first define the committed-replay lifetime/fence; this successor does not
silently expire it or claim all metadata is bounded.

Context7 SQLite resolution failed with HTTP transport error. Official fallback:
[SQLite unlink/rename hazards](https://www.sqlite.org/howtocorrupt.html#_unlinking_or_renaming_a_database_file_while_in_use),
[WAL reader/checkpoint boundaries](https://www.sqlite.org/wal.html), and
[Rust File locks](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock).
These support stable-object and resource distinctions, not this application's
incarnation protocol; that protocol needs its own cross-process/failure regressions.
The online Rust page is newer than installed1.95; tested Windows1.95 behavior is
the execution evidence, not a claim of version-matched Context7 documentation.


#### Previous-layout successor checkpoint (2026-11-11, still Proposed)

The isolated9/109 successor now has an explicit private8/108 migration-parent
path with the previous lease ABI; current query opens remain strict. Identical
facts-domain text does not bypass migration. Public8→9 publication and held old
reader snapshot passed focused Windows tests. This is implementation evidence,
not a review/acceptance record or final integration. Experimental108→109 and
self-contained fixture qualification, final gates and affected endurance still
need their own terminal evidence. Retained group replay receipts have not been
expired or silently collected by stable owner-slot reuse.


#### Cross-profile migration evidence (2026-11-11)

Self-contained per-test copies of actual previous-producer8/108 data/control
fixtures now pass default8→9 and experimental108→109 public migration tests,
including failed source/admission followed by successful retry and old-reader
snapshot preservation. Windows successor workspace423PASS/1existing455fixture
ignored; relevant release buildPASS. The455correctness contract is not waived.
Mac isolated integration followed a2441-input drift check and backups; focused
20casesPASS actualformat9, strictfmt/ClippyPASS. The current Mac full gates are
still running, so this does not close final acceptance or change Proposed status.

This evidence narrows the previous upgrade-path uncertainty. It does not prove
old-peer8 concurrent head updates under every failure window, bounded committed
receipt history, all same-head qualification history, Windows realUI, or current
candidate2hour endurance. Those remain explicit validation/design work; no replay
expiry, identity bypass, unsafe unlink or implicit threshold was introduced.


#### GC006 committed receipt / resource ownership separation (Proposed, 2026-11-11)

A public16-publication control on actual format9 preserved current data, held
reader and old committed replay, but retained18owner rows despite only2live
connections and one current fact creator. Stable lock slots alone do not clear
the ownership references held by empty historical published groups.

The next minimal slice retains each published group ID/state/commit sequence as
the durable idempotency receipt. It does not expire receipts or reuse group IDs.
Within the existing bounded GC transaction, only a published group with no
remaining manifest entries and an owner already proven dead may detach its
resource-owner FK. Unpublished/staged/live-owner references and current fact
creator/pins remain protected. Query head/namespace/qualification and publication
identity must not change. Old SQLite read transactions continue to see their
previous snapshots. Current same-head qualification receipts are intentionally
retained under the existing exact token/replay contract; no TTL or watermark
pretends failed tokens were ever qualified.

Represent the detached owner explicitly as NULL, constrained to committed
published state; this is a component-layout change, proposed10/110. It requires
private migration from known8/108 and9/109, with the correct old lease ABI for
each. Normal query opens remain strict; incompatible physical layout/tag must be
rejected before owner registration. Do not patch active9DBs in place. Cache
management must recognize the exact known layouts and still protect unknowns.

Required regression: the actual18-owner RED becomes bounded by live leases and
referenced current creators while first committed replay stays1/head16/current
facts exact; budget1 makes progress without exceeding existing logical GC budget;
live/unverifiable/replaced locks do not authorize detach; staging/cancel/crash,
old-read snapshots, group-ID reuse rejection and real old8/9 private upgrade/peer
head fences remain valid. No API-wide replay expiry or unrelated cache policy.
Implementation belongs only in receipt-owner-next while W remains frozen for
its current check. This is not an Accepted/review record or a completed fix.


### 2026-11-11：GC006 资源引用与逻辑身份分离（当前隔离候选）

本节修正前述“将 owner 置 NULL”的中间提议；该提议未成为最终实现或已接受决策。
历史成功回放与 group ID 不复用要求保留创建者身份。实际格式9对照通过身份保持测试，
中间格式10原型A却失败，因此已封存并放弃原型A。

当前原型B保留 `manifest_groups.owner` 为不可变逻辑创建者，另设可空外键
`resource_owner`。仅当组已经 published/abandoned、没有剩余 manifest entries、
资源所有者经现有租约协议证明已结束时，预算内GC才可解除这个资源引用。
仍活跃或不能证实结束的所有者、当前 facts 创建者和 reader pins 继续保护资源。
组ID、状态、提交序号、精确历史回放及同head资格合同不变；不采用TTL、删除历史回执、
复用ID或删除锁文件来换取有界资源数量。逻辑回执本身仍可增长，不宣称所有元数据有界。

这是10/110组件布局变化，支持私有迁移真实8/9及108/109输入；普通查询打开旧布局仍拒绝。
旧8与9使用各自实际租约ABI。新格式必须检查逻辑身份列与资源外键的不同角色，
不能只改格式标签接受旧结构；布局不匹配在注册owner/获取锁槽前拒绝。

截至本检查点：隔离Windows原型B的17个Rust测试目标共41项通过；默认与实验布局的
迁移/失败重试/旧快照/错误布局测试各7项通过；四组真实旧写者8、9、108、109推进后，
新候选拒绝过期父版本（每组2项通过）。预算1、活跃引用保护、SQL失败回滚后重试、
原始创建者不可变均有回归。故障注入只证明对应事务失败，不替代真实进程崩溃测试。
这些集合有重叠，不相加称唯一测试数。证据：
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/owner-retention-control/terminal-owner-split-qualified-summary.json`。

新布局尚在隔离目录，未集成到冻结的Mac格式9候选，也未部署；其全目标回归与release
构建在进行中。Mac同源2462输入的正常权限 `pnpm check:fast` 另行运行，不能用于证明
格式10已通过最终验收。最终同候选全量、规模与两小时协议验收仍待完成；真实UI未验证。


### 2026-11-22 消费端重复协调修正

消费端观察内容/命名空间变化时，可用实时完整当前资格证明索引已包含该输入，避免
再次推进maintenance输入epoch撤销刚发布的资格。dirty owner、namespace观察及取消必须在await后重验；
legacy/warming/不完整/不匹配资格不能采用此路。语义结果与输入revision照常失效，
compiler与最终磁盘围栏不变。详见[实施证据](../reports/2026-11-22-reference-qualification-revocation.md)。
