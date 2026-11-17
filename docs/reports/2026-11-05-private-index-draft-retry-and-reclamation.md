# IX-05：私有索引草稿重试、复用与回收

状态：局部已实现；219份Rust/Cargo输入冻结核验通过。ADR0043仍Proposed，整链路未完成。
工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`；parent
`298d65f5d7f796c347fe8be5c739e428066489d8`，未提交候选。
证据根 `.bench/index-versioned-maintenance-20261104`，日期按Mac本地2026-11-05；原始UTC日志仍为11-04。
本片没有部署、改真实缓存、重启Zed或操作真实Photos源码。

## 原因与修复

此前取消/最终输入检查失败会丢弃整个私有构建对象。已完成的小文件事实也随之失去复用机会，
下一次冷构建重新提取所有文件。不能把未发布的事实当当前结果，但可以在重新核验输入后复用内容相同的事实。

现在每个协商维护的Native workspace owner保留至多一个`CatalogMigration`，在协调线程间移交唯一所有权。
取消、错误及catch内unwind后归还；成功激活、显式force、父发布/权威head变化、producer接管或workspace关闭则放弃。
`retainedBootstrapDraft`仅表示空闲槽中有对象，不是任务进行中无草稿，也不是资源已物理释放的证明。

`maintenance_executor::launch/poll` → `maintenance_engine::run` → `Target::bootstrap` /
`DraftLease` → `maintenance_retry_inputs::prepare` → `CatalogMigration::prepare_reuse/try_activate`。
具体源码是`crates/index-sidecar/src/maintenance_{executor,engine,target,retry_inputs}.rs`及
`crates/index-sqlite/src/catalog_migration.rs`、`versioned_draft.rs`。

重试先完整枚举/读取当前输入，比较canonical URI、SHA和facts domain，只保留匹配的sealed版本；
重新生成当前manifest差异，删除、改变和新增文件不会复活旧事实。当前匹配不是新鲜度证书，
最终namespace/source fence、owner/input admission、父物理发布身份及其权威head CAS仍全部执行。
新建冷任务保持原流式提取；重试仍需O(N)当前内容读取/核验，不承诺整个操作与规模无关。

`try_activate(&mut self)`允许保留失败对象，但每次尝试先清理以前未获准的私库资格行，
防止较晚成功选中同一物理库后，把以前被source/admission拒绝的资格一并对外暴露。
成功后立即退役candidate和parent句柄，不等builder被drop；失败不能擅自把候选rebased到新parent。
这些只作用于私库，不删除活动库的有效资格/提交收据。

## 新暴露的资源问题与回收边界

仅限制一个私库文件并不能限制里面的历史事实。真实Native回归先证明：取消后改变文件并重试，
结果正确，旧的未发布版本却仍因本owner的pin/staging引用留下。原始RED为
`ix05-draft-native-reclamation-red.log`，明确报`obsolete unpublished prefix version 0 survived retry`。

现在完整当前内容预检之后、写任何新facts之前，执行私库回收：

1. 分批建立完整desired keep集合，验证每个ID属于本owner的sealed pin；缺项/取消不会先释放其他pin。
2. 每事务最多64个元数据变更：仅废弃本owner未获准的staging/sealed组，释放不在keep中的pin。
3. 对无引用的失败partial版本显式进入collecting；使用既有GC，每quantum最多4096逻辑工作项/
   4MiB估计facts载荷，维护FTS/FK，不用级联一次删大文件。单个不可分割超大行的旧例外保持。
4. 每个quantum之间检查取消。已提交清理不会因取消撤销；下一次重试继续清理，再允许写新facts。

已发布最新映射、活动pin仍受原保护，私库也不绕过这些触发器。
上次私有published映射仍可能保护被替换版本，直到新映射发布并经后续GC清理。
本片减少无用facts累积，**不构成物理字节硬上限**，不承诺DB文件/RSS立即下降；
SQLite空闲页复用、WAL/checkpoint及磁盘真实峰值需要后续规模实测。
published group收据、owner/稳定锁对象和墓碑保留策略尚未治理，不能宣称所有元数据有界。

成功回收向stderr记录`maintenance.draftReclaimed`，含attemptId/input、quantum、pin/group/facts/version计数。
它们是逻辑删除数，非实际物理写字节。回收失败/取消可能已有部分提交；未返回完整统计时不将其当0。
`quanta`统计metadata分阶段批次和既有GC调用次数，不包含keep集合构造、单独partial释放、
输入核验等所有SQL操作，不能当全任务事务总数；尚未对这些额外操作做完整阶段计时。
此路径只在重试私库使用；活动库`CatalogCollector`的自动调度尚未接通，两者不得混称已完成。

## TDD及可复现证据

所有命令在上述独立worktree执行，parent均298d65f；RED来自逐步dirty候选，并非声称干净parent能编译新API。
完整候选身份见`ix05-draft-v1-frozen.json`。中间RED未逐个冻结全部源文件，不补造其源码hash。

| 场景 | RED / GREEN证据 | 结果 |
| --- | --- | --- |
| 实际64文件提交后取消，改1/删1/增1 | `ix05-draft-prefix-native-runtime-red.log` / `ix05-draft-prefix-native-green.log` | 重试从写/解析128变为66，复用62 |
| 最终fence前未通知改/删/增 | `ix05-draft-prefix-and-fence-green.log` | 首次拒绝发布；重试写/解析2，复用126，私有head1→2 |
| 失败source及失败admission后成功 | `catalog_migration_retry` | 失败input旧Q不随成功激活暴露 |
| 成功后builder仍存活 | `ix05-draft-parent-pin-red.log` / `ix05-draft-parent-pin-green.log` | 原parent数据DB从仍被钉住变为实际退役 |
| 另一producer接管 | `ix05-draft-superseded-retention-red.log` / `...-green.log` | 拒绝反向构建，0解析，旧private数据DB退役 |
| obsolete prefix事实回收 | `ix05-draft-native-reclamation-red.log` / `...-green.log` | 正确结果且旧未发布版本查找为None |
| 70份私有版本、keep1 | `ix05-draft-reclamation-green.log` | 放弃70组，释放/删除69版本，其facts逐批删除；keep仍可读 |
| 无效keep、清理取消再续、大文件partial | `ix05-draft-reclamation-all.log` | 存储4项通过，已提交GC保留进展；大文件前缀至少4096facts确实删除 |
| 显式force、同producer peer先发布 | `ix05-draft-native-policy.log` | force写/解析128；peer后写/解析0、复用128，沿用peer物理store |

复现：

```sh
cargo test --locked -p arkts-index-sqlite --test catalog_migration_retry --test catalog_draft_reclamation
cargo test --locked -p arkts-index-sidecar --test maintenance_draft_reuse --test maintenance_draft_policy
```

上述是Rust公开库和真实Native NDJSON，不是公开LSP、Zed UI、30K或2小时耐久。
协议测试中的可控gate仅用于debug取消窗口，不等于复现真实系统卡死/OOM。
DB文件退役断言没有证明`.owners`/稳定锁目录完全为空；RSS也不是本片回收判据。

另存独立线级重放`draft_wire_replay.py`及`ix05-draft-wire-replay-result-v2.json`，
目录`draft-wire-20261104T170952Z`保留128份初始源码身份、改变后的源码、parser trace、逐帧
`transcript.jsonl`、`receipt.json`和`native.stderr.log`。
实际debug binary SHA256为`3fd77a71e2c35811eabacfb9f9785462aabd46f515b0510ccce5ec83d5dfe324`，
同样证实取消→输入2资格成功、parser_call66、写66/复用62及五组符号数量。
stderr实际记录回收1个未获准组、2个pin、2个版本、20条facts，8个quantum。
这是在完整检查并行运行期间的单次debug诊断，不作为普通release时延/内存基线。
v1线级重放结果保留，但未断言parser_call计数；v2明确加入66次实际parser调用断言，未改产品源码。

## 完整检查与剩余工作

冻结检查驱动`draft_checks_v1.py`、逐条命令/耗时/返回码`ix05-draft-v1-checks.jsonl`；
新借用lint的失败保留在`ix05-draft-preflight-clippy.log`，修正测试借用后再冻结，未放宽lint。
`ix05-draft-v1-receipt.json`确认219输入在全部9项检查期间未改变：

| 本轮冻结候选 | 实际结果 | 墙钟时长 |
| --- | --- | --- |
| Core/SQLite完整包 | 248PASS（Core63、SQLite185），含原100K成本回归 | 293.640s |
| 默认Native27份相关完整文件 | 130PASS | 236.268s |
| experimental存储23份完整文件 | 81PASS | 107.501s |
| experimental Native17份相关完整文件 | 66PASS | 163.769s |
| fmt / 两配置workspace all-targets Clippy -D warnings / 两配置release | 全部exit0 | 收据逐条记录 |

默认release SHA256 `d55375d8e447c2c12a672fb1951a03fd43b8e9f11280b9a209ec0fb26b0f3593`；
experimental `bfff9fc068ace7f4d8e94e1baa7a256003894c50bbbd05030a8c14969c3dfc54`，
分别归档在`artifacts/draft-default`、`artifacts/draft-experimental`，未安装到日常环境。
历史212输入结果继续保留，不当成本轮219输入检查。新增代码/测试均≤500物理行。
已改存量源码超限债务仍Core lib1131、SQLite lib761；另有3份未改旧测试超限，具体清单见收据。

默认Node/LSP尚未协商新维护协议，原默认128文件RED仍未关闭。
IX-03/04父端URI/token/收据、自动对账、活动库GC、公平调度、partial/schema/ACK恢复、
元数据治理、最终pnpm、规模、30K2小时及真实Mac/Windows验收均保留在完整目标中。
不调大阈值、不裁剪结果、不把这些待办降格为后续无关工作。
