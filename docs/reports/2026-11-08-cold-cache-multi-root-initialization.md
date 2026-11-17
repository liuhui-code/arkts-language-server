# 冷缓存共享目录创建竞态：IDX-V1-INIT-001（2026-11-08）

状态：最小正式修复及定向回归通过；最终新候选完整检查、规模和耐久仍未通过/完成。
实施parent298d65f5d7f796c347fe8be5c739e428066489d8，未提交、部署或合并。
实现工作树`/private/tmp/arkts-index-versioned-maintenance-20261104`。
证据根`.bench/index-versioned-maintenance-20261104/readiness-init-failure-20261108`。

## 发现与范围

新证明容量修复候选完整checkfast2402/2403 PASS、1FAIL、0skip，3577.13s测试时长，完整命令3584.41s。
失败为`semantic-readiness-lifecycle.test.mjs:77`独立双根场景；断言在`initializeRoots:409`：
实际`index.catalog.terminal.phase=degraded`，预期ready。**这是原生索引catalog状态，不是该断言观察到语义READY退化。**
原完整失败未保存其Native错误帧，不能将后来复现的原因倒填为当时已知事实。
记录`dependency-failure-20261108/final-checks-integrated.json`及完整日志，sourceUnchanged=true。
Round06及density06严格前置失败，未启动新的规模或两小时负载。

原始完整8项文件的11轮清理前快照复测均通过；增加LSP字节观测、Native观测的各1轮也8/8通过；
原双根场景自然32轮通过。它们没有消除原失败，也不等价于全量稳定。
Native spawn观测读取二进制hash会增加两次启动之间的间隔，可能改变竞态窗口；不据此否认竞态。

## 可重复反例和证据强度

| 场景 | 修复前 | 修复后 | 证明范围 |
| --- | --- | --- | --- |
| 公开CacheLease双线程、64个全冷cache、各两个独立workspace | 首次64/64轮出现File exists；正式边界轮仍64错误 | 4项冷目录/类型/符号链接测试PASS | 确认目录创建有真实竞争；不是SDK/Program问题 |
| 已建workspaces、未建.leases的64轮 | 58轮出现File exists | 同一正式回归PASS | 共享.leases也存在相同竞争 |
| 两个真实Native进程，先证明输入循环可响应，再同时initialize同cache | 第3对出现id1/okfalse/error.code=io、File exists(os error17)；两个进程最后均exit0 | 64对、128次initialize全成功且全exit0 | 真实NDJSON入口；预初始化id0未知method是诊断就绪探针的预期错误，不算产品故障 |
| 原双根公开LSP场景，两个合法initialize写入同时放行 | 8/8 catalog degraded，8个真实Native io/File exists错误 | 8/8原精确语义/位置/生命周期断言PASS | 受控调度，不注入错误、伪造响应、改超时或在产品插sleep |
| 正式公开LSP冷/已建workspaces/两共享目录已建的3对照 | 1FAIL/2PASS，冷目录实际degraded且仅2文件 | 3/3 PASS，两个根语义ready、4文件、2个持久符号、两个Native正常close | 最近稳定公开接口回归及温态正对照 |
| 新公开3项+原生命周期8项+manifest4项 | 冷反例已记录 | 15/15 PASS | 定向组合，非全量2406项最终结论 |

**确认结论：**此竞态可以从公开LSP产生与原全量失败相同的catalog degraded；其根因与修复有真实API/进程/帧对照。
**限制：**原全量那一次没有底层帧，不能排除它还存在其他触发原因；新候选仍须完整复验。

## 调用链与顺序

1. LSP initialize/initialized携带两个workspaceFolders；两根共用配置的cache根，各自开启真实Native会话。
2. `DefaultWorkspaceSymbolService.openWorkspace:203` -> `SidecarWorkspaceIndex.open` ->
   `negotiateMaintenance`发`initialize`，带各workspaceRoot、同cacheDirectory和维护能力。
3. Native初始化打开受管store，`CacheLease::acquire`在`cache_gc/lease.rs:70–80`：
   取得namespace共享锁，再分别确保`workspaces`、`.leases`和workspace目录存在。
4. 两个创建者均可持共享锁，这是合法并发，不能改成全局互斥来掩盖。
   `cache_gc/files.rs::directory:21`先lstat；双方观察NotFound后均调用create_dir。
   一方成功，另一方遇AlreadyExists。旧实现直接转String错误返回，没有再次验证已由对方建好的目录。
5. Native返回`{protocol:1,id:1,ok:false,error:{code:"io",message:"File exists (os error 17)"}}`。
   `SidecarWorkspaceIndex.open`删除失败会话并closeAfterFailure；
   `DefaultWorkspaceSymbolService.openWorkspace:215–216` catch后failWorkspace，将该根进度设degraded。
6. 另一根可以成功索引2文件。`aggregateProgress`汇总两根，
   `startWorkspaceIndex:53–64`发degraded进度、记录workspaceCount2/indexedFiles2并结束进度。
   原测试预期ready/4files失败，尚未执行后续语义generation断言。

Native失败后正常exit0不是崩溃；这里没有OOM、watchdog或Worker退役证据。
索引初始化状态与语义Worker/SDK状态分层；本问题不等同于此前SDK缺声明、Program重试或4096证明配额问题。

## 最小完整修复与安全边界

只修改`cache_gc/files.rs::directory`的创建分支：
create_dir成功或错误类别恰为AlreadyExists后，**仍调用原directory(path,false)**重新取得lstat/type/reparse/symlink验证。
其他I/O错误原样返回。已有普通文件、符号链接、Windows reparse点不因此获准，身份/使用锁/源证明不删除。
不使用字符串匹配os error17，不添加重试sleep、全局锁、时间线预算或例外文件名。
不改变schema、facts域、内容键、GC删除权限、内存/V8/超时/规模配置。

Rust官方[create_dir](https://doc.rust-lang.org/std/fs/fn.create_dir.html)文档把路径已存在列为错误；
[create_dir_all](https://doc.rust-lang.org/std/fs/fn.create_dir_all.html)明确处理其他并发创建者。
本项目借鉴并发创建幂等语义，但受管单叶必须保留不跟随链接及类型验证，故没有直接用递归创建代替安全检查。
Context7 resolve Rust标准库传输失败，未成功query-docs；已核对当前官方文档1.99.1，
版本1.95.0文档URL本次工具不可达。实际构建/回归为rustc1.95.0、cargo1.95.0；不冒称查到其版本网页。

现有并发use-record测试先获取seed lease，已创建共享目录，因此主要覆盖温态写入，漏掉此次冷创建阶段。
新Rust测试不预热；另保留非目录/符号链接拒绝正对照，真实跨进程Native与公开LSP覆盖上层。
新公开fixture只缓冲两个短initialize写入并原样放行，记录实际PID/hash/帧/close；不伪造响应或放宽结果断言。
Windows路径含空格的NODE_OPTIONS和.exe选择已做测试代码兼容；**Windows未实机执行**，Unix符号链接测试不冒充Windows reparse测试。

## 版本、命令与证据

修复前Native SHA409b08c4cf8096c0e91854040602269690eb98a803c14ae1d9f50567588b61ea，保留`before/arkts-index-sidecar`。
修复后release SHA9c65ce088fe10621d5fd2b044d3703adfb61ac89a50658ca9f43beb0256258eb。
源码文件及旧hash见before目录；提取原案例的正文/helpers hash见independent-roots-extraction.json。

- `cargo test --locked -p arkts-index-sqlite --test cache_cold_namespace -- --nocapture`：
  初始RED、边界RED2FAIL/2PASS，原始cold-namespace-*-red.log。
- `cargo test --locked -p arkts-index-sqlite --test cache_cold_namespace --test cache_use_concurrency -- --nocapture`：9PASS。
- `cargo build --locked --release -p arkts-index-sidecar`：PASS，新SHA如上。
- Node20真实framed LSP：`node --test --test-concurrency=1 tests/semantic/cold-cache-multi-root-initialization.test.mjs tests/semantic/semantic-readiness-lifecycle.test.mjs tests/test-layer-manifest.test.mjs`：15PASS。
- 使用`ARKTS_TEST_EVIDENCE_DIR`保存正式3场景Native stdout/lifecycle及根状态。
  `ARKTS_TEST_NATIVE_BINARY=<证据根>/before/arkts-index-sidecar`可对照旧Native；其余代码/断言保持。
- 受控公开反例：`NODE_OPTIONS=--import=<证据根>/transport-capture-paired.mjs`、
  `ARKTS_NATIVE_INIT_PAIR_GATE=1`、`ARKTS_READINESS_FAILURE_CAPTURE=<新输出根>`，
  Node20执行`independent-roots-paired.test.mjs`；before/after日志和原始Native/LSP字节均保留。
- 原始Native双进程见`native-cold-pairs.py`与after脚本；输出根必须全新，禁止覆盖旧证据。

现有ADR：[0028决定1–3](../adr/0028-index-cache-lifecycle.md#决定)要求多使用者、使用权先于打开及安全对象验证；
[0043第7–8节](../adr/0043-versioned-file-index-maintenance.md#7-调度取消与进展)明确跨进程维护和生命周期。
本改动实现其合法并发约束，补充冷创建边界，没有替代既有决策或新建Accepted记录。
ADR0044健康证明状态修订与此竞态独立，继续按自身新鲜度/生命周期标准验证。

下一步：对包含两个修复的新源码重新执行适用完整检查、Native双配置和原455正确性；
Rust已改变，旧410/28及旧Native结果不再作为新源码完整通过证据。
随后才启动完整运行包79项的保存写入规模、全矩阵和原30K单会话2h。
保留现有SDK partial、完整30K引用/重命名、无事件新增/源码树缓存边界、真实UI/Windows未验收说明。
