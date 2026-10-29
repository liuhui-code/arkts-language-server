# index 缓存目录数量与磁盘占用调查

调查源码：`main`，`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`。
Mac 磁盘清单：2026-10-28 11:28:46–11:29:09 UTC；打开文件快照：11:30:31 UTC。
本轮只调查。没有删除原缓存、执行 checkpoint/VACUUM、重启 LSP、运行会新建缓存的测试或修改产品代码。

结论：目录数量主要来自**本机测试的缓存隔离缺陷，加上没有全局磁盘缓存回收机制**。
不是同一个项目每次启动都随机生成一个缓存。占用大头另有来源：当前30K项目的单个索引目录。

**实际路径与统计口径**

```text
/Users/liuhui/Library/Caches/arkts-language-server/index/
  workspaces/<64位十六进制SHA256>/
    symbols-v2.sqlite3
    symbols-v2.sqlite3-wal   # 部分目录存在
    symbols-v2.sqlite3-shm   # 部分目录存在
```

共 **12,301 个工作区目录，12,301 个数据库**，另有88份WAL及88份SHM。
`du -sk`为13,822,164 KiB，即 **14,153,895,936字节，13.182 GiB**；与逐文件`st_blocks × 512`之和一致。
逻辑文件长度合计14,004,554,496字节；不要将逻辑长度和分配块相加，也不把磁盘占用当成RSS。
这是标准du/文件分配块口径，没有测量APFS共享物理extent的全盘去重占用。

| 分类 | 目录数 | 分配块占用 | 判定依据 |
| --- | ---: | ---: | --- |
| 源路径已不存在的临时项目 | 12,256 | 3.277 GiB | DB中的workspace URI、路径存在性 |
| 源路径仍存在的临时/隔离项目 | 21 | 4.129 MiB | 20份旧隔离工作树夹具、1份临时owner-boundaries夹具 |
| 当前仓库固定测试夹具 | 20 | 4.055 MiB | `arkts-language-server/fixtures/**` |
| 当前打开的真实30K项目 | 1 | 9.895 GiB | DB身份＋lsof持有进程 |
| 其他仍存在的项目 | 3 | 1.613 MiB | 原Photos、browser、服务器仓库本身 |
| 合计 | **12,301** | **13.182 GiB** | 同一时段磁盘快照 |

临时项目共12,277份，占目录数99.805%；其中12,256份源目录已消失。
目录创建时间覆盖2026-09-02至2026-10-27 UTC，不是本轮单次运行全部创建。
`lsof -nP -F pcn`退出0、无stderr，只发现一个缓存键被进程打开：
`918ea3844b4c50ce009afac7b2988e36d844086e8ffd23b18a557294a1cbe369`，
由`arkts-index-sidecar` PID92783持有，DB身份是
`file:///Users/liuhui/Documents/code/applications_photos_30k`。
其他12,300份在该快照没有观察到打开句柄；这不等于它们都失效或已经获准删除。
例如原Photos目录仍存在且可以继续复用。

**缓存键和复用规则**

`crates/index-sqlite/src/lib.rs:58`的`workspace_cache_location`：

```text
canonical_root = fs::canonicalize(workspace_root)
identity = path_to_file_uri(canonical_root)
key = SHA256(bytes("arkts-index-cache\0v2\0") + UTF8(identity))
database = cache_directory / "workspaces" / key / "symbols-v2.sqlite3"
```

| 变化 | 当前行为 |
| --- | --- |
| 同一物理规范URI、同一个cache base重启/再次打开 | 使用同一目录和DB；已有generation被读取，然后重建当前新鲜度 |
| 能规范化到同一URI的路径别名 | 共享键；Node与Rust都进行物理路径规范化 |
| 项目复制到新的实际路径、移动根目录、不同临时随机路径 | 不同identity，因此新键；旧目录不会随源项目消失 |
| 修改源码、文档关闭重开、切换SDK/配置 | 这些值不在磁盘目录键中；可触发索引/语义状态更新，不因此直接换目录 |
| 更新server commit、Node版本、普通schema迁移 | 这些值不在当前键中；支持的旧schema在原DB内迁移 |
| 改`ARKTS_INDEX_CACHE_DIR`或平台缓存根 | 使用另一父目录；同一键可以在不同父目录各有一份 |
| 将来改变硬编码namespace/layout版本 | 可以换键/文件布局，但不是每次应用版本更新；本轮没有发现这种原因造成的重复目录 |

本次逐库读取到12,301个不同workspace identity，与目录数完全相等；
每一个目录键都与上述v2公式匹配，**重复identity为0，键不匹配为0**。
所有文件名均为`symbols-v2.sqlite3`，但内部schema分别有2/4/5/6/8/9/11。
文件名中的v2与当前schema11是不同概念，旧schema留存本身不能证明升级新建了另一目录。
没有发现corrupt/quarantine等额外目录族，也没有看到按PID、启动时间、Git SHA或SDK路径生成键的代码。

这种缓存存的是文档/符号、export、引用出现位置与绑定、别名、检索索引等；
不是TypeScript Program、SDK AST或结果缓存的磁盘快照。
全路径身份保存在`metadata.workspace_identity`，打开时再次核对（`lib.rs:1471`）。
不同副本即使内容相同也不直接合并DB：绝对URI和工作区所有权不同，不能为了去重删除身份验证。

**创建与关闭调用链**

| 阶段 | 当前源码位置与动作 |
| --- | --- |
| 选择缓存根 | `src/composition/production-services.ts:17,57`组装服务，调用`resolveIndexCacheDirectory`；`src/index/cache-directory.ts:10`读取`ARKTS_INDEX_CACHE_DIR`或Mac默认路径 |
| 编辑器初始化完成 | `src/lsp/run-language-server.ts:193`→`startWorkspaceIndex`；`src/lsp/workspace-index-initialization.ts:57`调用`workspaceSymbols.start` |
| 每个root开始索引 | `src/workspace/default-workspace-symbol-service.ts:43,174`→`index.open(workspace, cacheDirectory)` |
| Node路径和协议 | `src/index/sidecar-workspace-index.ts:126`规范化root/cache并向sidecar发送initialize；`src/index/workspace-uri-identity.ts:19`递归创建缓存根 |
| Rust定位DB | `crates/index-sidecar/src/main.rs:158`→`workspace_cache_location`→`SqliteStore::open` |
| 实际创建hash目录 | `crates/index-sqlite/src/lib.rs:134,137`的`fs::create_dir_all(parent)`；以READ_WRITE/CREATE打开固定DB，启用WAL并检查schema/identity |
| 项目/服务关闭 | `DefaultWorkspaceSymbolService.dispose`(`:154`)→`SidecarWorkspaceIndex.close`(`:380`)→`SidecarSession.shutdown`(`:689`)→native shutdown(`main.rs:417`)；取消任务、关闭连接、释放session，不删除持久化DB目录 |

因此打开项目便可能产生缓存，不要求用户先点一次跳转。
`catalog_replace.rs:80`起的新generation事务清理/替换DB内部旧文档行，再激活当前generation；
没有为每个generation创建另一个hash目录。

**测试来源与已确认配置错误**

1. `tests/semantic/project-module-resources.test.mjs:270`创建随机`arkts-module-model-*`，
   `:311`却传入`ARKTS_LSP_CACHE_DIR`；匹配该路径家族的数据库有**3,001份**。
2. `tests/semantic/project-target-membership.test.mjs:420`创建随机`arkts-target-membership-*`，
   `:460`也使用`ARKTS_LSP_CACHE_DIR`；匹配**2,018份**。
   当前产品、脚本没有读取这个变量的逻辑；实际支持的是`ARKTS_INDEX_CACHE_DIR`。
   两类路径共**5,019份，全部源目录已不存在**，合计约0.646 GiB分配块。
   工厂的`after`只删除自己的临时root；实际落在用户全局目录的索引不在其清理范围。
3. 还有直接遗漏隔离的用例。`tests/lsp-call-hierarchy.test.mjs:1273`创建临时root，
   `:1275`直接`new LspProcess()`；匹配stale-disk家族293份。
   `tests/lsp-session.test.mjs:40,47`仅设置临时日志目录；session-change家族252份。
   `tests/support/lsp-process.mjs:66`合并继承环境，没有自动分配私有index目录。
   `scripts/run-node-test-layer.mjs:77`起只为测试运行摘要创建/删除目录，没有统一隔离index根。
4. 已正确隔离的例子也存在：`tests/support/semantic-readiness-lsp.mjs:56`指定fixture内cache；
   两小时混合测试的`.bench/30k-three-fixes-20261027/soak-harness/protocol.mjs:17`
   将index写入各次证据目录。不能把所有测试或最近两小时协议会话都归为全局污染来源。

这是依据当前代码与实际DB身份确认的写入路径缺口，不只是猜测“可能测试太多”。
但没有逐次创建审计日志，无法把每一份历史DB精确归到某次运行、某个commit或某次退出原因。
本轮没有重跑这些会污染全局的测试来制造更多目录。GitHub Linux/Windows CI也不直接写本机Mac缓存。

**当前有哪些清理机制，为什么仍积累**

- 有：同一规范root复用固定DB；打开时核验identity并执行受支持schema迁移；
  generation内事务更新和SQLite页复用；关闭时结清进程/session资源。
- 没有发现：全局工作区目录注册表、last-used登记、TTL、LRU、总字节/目录数预算、
  删除已消失root的定期GC、用户可预览的清理命令、旧namespace/schema文件目录的自动清扫。
- `src/index`中的`cleanup`主要清理请求监听器和取消状态，不是删除磁盘缓存。
  内存压力预算和Program/AST驱逐也不是这套磁盘目录的回收策略。
- 持久化DB在关闭后保留是复用设计；测试随机root持续变化、清理又只覆盖临时源码，
  再叠加没有全局GC，就使无主的目录持续积累。

证据上的判断：**一项目一目录正常；12,256份已消失临时root留在用户默认缓存是隔离/生命周期治理缺口**。
不是12,301个Worker或Program仍活着，也没有发现同一root按启动次数无限复制目录的证据。

**30K单目录的大体积要单独处理**

| 文件 | 逻辑字节 | 约合 |
| --- | ---: | ---: |
| `symbols-v2.sqlite3` | 5,291,745,280 | 4.928 GiB |
| `symbols-v2.sqlite3-wal` | 5,322,739,272 | 4.957 GiB |
| `symbols-v2.sqlite3-shm` | 10,354,688 | 9.875 MiB |

这个目录占全局分配块约75.07%，且仍由PID92783持有。
即使将已消失临时root的3.277GiB处理掉，也不会解决此9.895GiB的主体占用。
另有87组WAL/SHM在本次lsof中没有持有者；未测其历史退出原因，不直接归因为OOM或数据库损坏。

产品代码启用WAL，但未见显式`wal_checkpoint`、`journal_size_limit`、VACUUM/auto-vacuum配置。
这不等于SQLite没有自动checkpoint。普通checkpoint可以回写并复用WAL，而不缩短文件；
大写事务、读者阻挡等也能影响WAL。仅凭5.32GB的文件长度不能断言其全是未提交/未checkpoint数据、
永久泄漏或当前卡死；本轮没有测checkpoint进度、事务持有、freelist和各表实际有效页。
这些机制与安全维护边界以[SQLite WAL官方说明](https://www.sqlite.org/wal.html#avoiding_excessively_large_wal_files)为依据。
回收DB内部空闲页与跨工作区目录GC又是不同问题，见[SQLite VACUUM说明](https://www.sqlite.org/lang_vacuum.html)。
Context7本次连接失败，以上只回退到SQLite官方资料，没有采用未经核验的三方建议。

**治理建议，仅提议，本轮未实施**

1. 优先修正两处错误变量，并在共享子进程测试harness/runner统一提供私有index根和正常/异常退出后的清理所有权。
   显式测试生产默认路径的用例单独处理。验收应比较本机默认cache清单，确认普通测试不再增加目录；
   缓存持久化/重开测试在自己的隔离根内验证复用，不能为清理而取消持久化覆盖。
2. 产品侧补磁盘缓存生命周期：登记workspace identity与last-use、持有lease/锁，提供用量与dry-run预览；
   在保留活动目录的前提下，用可配置总占用/数量预算和闲置策略淘汰。root暂时不可达或外置卷离线需要宽限，
   不因一次不存在或普通关闭文档立即删除，也不机械按本次大小编造新硬阈值。
3. 对当前大索引另做受保护的存储诊断，再评估空闲/关闭时checkpoint、有限WAL保留及离线压缩。
   维护必须遵守连接/读者/事务边界，避免把阻塞维护放到每次用户查询或敲键路径。
   不直接unlink活动WAL/SHM，不用清空所有缓存或跨root合并数据库来掩盖问题。
4. 历史残留可先生成候选清单，区分“源已消失”“闲置但可复用”“活动中”；
   真正清理前重新核验持有者和目录边界。这里没有执行清理，也没有将快照中无句柄等同于删除授权。

**证据与可复查范围**

证据根：`.bench/index-cache-audit-20261028/`。
`directories.ndjson`保存每个hash目录、文件长度/分配块/mtime/inode、DB身份/schema、root存在性和键重算结果。
`summary.json`、`classified-summary.json`、`fixture-prefixes.json`保存统计；
`open-files.json`保存限定该缓存根的lsof PID/文件证据；`du-k.tsv`保存磁盘总量。
`inventory.py`、`open_files.py`、`commands.md`保留复查方法。
只读主DB可能落后WAL：其中12,218份从主文件读身份，83份从私有DB+WAL副本读取；
副本期间源文件size/mtime均稳定。没有用可能较旧的generation判断当前READY状态。
元数据读取0失败，但未执行全库integrity_check，不能宣称12,301份数据完整性已全验证。
`read-only-verification.json`复核12,477个原文件的size、mtimeNs、inode均未变化，目录数仍12,301。
这是时间点调查，没有重放历史进程、计量长期增长斜率或测量清理后收益。
