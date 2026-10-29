# 索引缓存生命周期：实现与验证

交付阶段说明：本文保留首次验证阶段的状态与证据；后续维护者授权的提交/PR合并及补充检查见
[合并候选验证](2026-10-29-cache-rss-merge-validation.md)。该授权不包含日常部署或删除真实缓存。

日期：2026-10-29。分支：`feat/index-cache-lifecycle-20261029`。
父提交：`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`；本轮为未提交候选，未合并、推送、发布或更新日常Zed安装。
决策：[ADR0028](../adr/0028-index-cache-lifecycle.md)，状态仍Proposed，实施授权不伪造审阅记录。
证据根：`.bench/index-cache-lifecycle-20261029/`；RED/GREEN见[TDD记录](../tdd/2026-10-29-index-cache-lifecycle.md)。

## 结果与范围

已实现测试隔离、workspace使用权、兼容旧库的只读预览、临时孤儿的重复观察、闲置/可选容量策略、
完整DB/WAL/SHM退役、失败重试及独立后台维护。真实用户缓存仅做preview：没有删除、登记missing观察、
checkpoint或VACUUM，前后完整stat清单相同。清理仅发生在隔离夹具和复制的8份历史缓存。

安装release/Worker目录回收仍属于[独立运行版本提案](../plans/2026-10-29-runtime-identity-and-release-lifecycle.md)，
本轮没有实现该提案的运行握手、激活告警或release回收。缓存key继续按规范workspace URI +既有v2命名空间计算，
不按server版本换目录；无需丢弃旧库或重新初始化schema来启用GC。

## 方案依据与安全合同

先通过Context7查询SQLite、Rust标准库和Node child_process，再核对官方资料及固定SQLite VFS源码。

| 参考 | 本项目采用 | 边界 |
| --- | --- | --- |
| [SQLite WAL](https://www.sqlite.org/wal.html) | DB/WAL/SHM完整组；私有副本读取WAL-only身份 | 主文件immutable只证明身份，不能证明语义generation新鲜 |
| [SQLite locks](https://www.sqlite.org/lockingv3.html)及bundled3.53.2 VFS | OS级DB锁保护不认识新lease的legacy reader | WAL的BEGIN EXCLUSIVE不能代替无其他读者证明 |
| [Rust File locks](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock_shared) | 使用者共享锁、回收者独占锁，崩溃由OS释放 | 不用PID或心跳超时判断死亡；普通本机文件系统为验证范围 |
| [systemd tmpfiles](https://www.freedesktop.org/software/systemd/man/latest/tmpfiles.d.html)、[Nix GC roots](https://nix.dev/manual/nix/2.30/package-management/garbage-collection) | 使用权保护与保留策略分离，删除前重新证明 | 不按目录mtime/不存在直接删除；不引入系统daemon或Nix依赖 |
| [Windows目录改名](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information) | 关闭清理器自己的DB句柄后原子改名，再验证整组指纹 | 保留管理锁；竞争legacy打开由Windows改名拒绝，变化保留trash |
| [Windows文件身份](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle) | volume serial + file index，拒绝reparse/未知身份 | 不全路径小写，不声称完整UNC支持 |
| [Node child close](https://nodejs.org/docs/latest-v20.x/api/child_process.html#event-close) | 等待维护进程实际close，测试目录在close后清理 | kill已发送不等于资源已经释放 |

删除需要同时成立：受管目录/允许文件布局、application_id及支持schema、metadata identity与key一致、
来源证明、保留策略、namespace/workspace独占使用权、SQLite legacy占用检查、删除前整组文件身份/大小/mtime复核。
不跟随symlink/reparse或删除硬链接文件。不支持/不稳定输入保护并报告。
Unix在取得SQLite fcntl字节锁后不再打开/关闭同DB的其他描述符，避免进程级锁被提前释放。

临时项目缺失还必须验证当前本机临时锚点可访问、规范路径和设备稳定、最近存在父目录仍在该锚点内，
且源路径错误确为NotFound。普通根缺失、离线卷、权限错误、UNC或未知URI不当作临时孤儿。
两次观察包括完整DB/WAL/SHM/使用记录指纹；WAL更新或源根恢复会撤销旧证明。

## 默认行为与入口

- 默认`ARKTS_INDEX_CACHE_GC=auto`。workspace索引成功打开后，由独立低优先级native维护进程执行，
  每批128项、分页轮间1秒、完整周期冷却1小时。多窗口共享锁/游标/冷却状态；关闭停止并等待维护进程。
- 新SqliteStore在打开DB前持有共享lease，connection关闭后才释放；正常打开/关闭记录last-use。
  有效活动检查另记使用观察，只影响保留期，不把观察过期当作死亡。
- 已登记缓存默认闲置30天；本机临时项目缺失默认24小时且至少两次稳定观察。
  legacy默认保护。显式`clean --include-legacy`可登记临时孤儿授权，后续自动轮在原宽限后完成，
  不自动接管其他全部legacy。普通legacy没有可靠last-use，仍保护。
  旧缓存被新server正常打开后会登记当次使用，继而遵循正常活动/闲置策略，不为GC先清空或重建索引。
- 默认没有容量硬上限；显式MAX_BYTES对闲置合格项按LRU选择。
  只有完整清单可决策全局容量，分页/未知大小报告budgetUnmet，不猜测或强删活动/近期项。
- preview不写受检缓存目录；身份仅在WAL时，最大16MiB可配置私有DB/WAL复制。
  复用的私有检查区有OS锁，正常结束清除快照；崩溃后下一取得者清理，超限/忙碌保护。
- 回收写durable intent后整组移入受管trash；失败下轮重验重试，未知/变化trash不盲删。
  结果JSON分别记录protected/observing/eligible/removed/deferred、原因、逻辑字节及issues。
  删除成功后即使管理记录写失败，也保留实际删除结果并单独报告错误。

示例（第二条会修改选定缓存，**本轮未对用户原目录执行**）：

```sh
arkts-language-server --index-cache preview --include-legacy --limit 20000
arkts-language-server --index-cache clean --include-legacy --limit 20000
```

配置、CLI选项及恢复部署方式见[README](../../README.md#logs-and-cache)。日常安装后才会启用自动维护；
需要使用本候选时可按原流程运行`pnpm zed:install`，再由用户重启语言服务。此报告不宣称已部署。
`ARKTS_INDEX_CACHE_GC=off`关闭后台维护，显式preview/clean仍可用。

## 实现位置

| 职责 | 文件/入口 |
| --- | --- |
| 测试私有cache及child close清理 | `tests/support/test-index-cache.mjs`、`lsp-process.mjs` |
| 正常生产夹具公开shutdown及native释放证明 | `tests/support/production-session-lifecycle.mjs`、`tests/index-cache-cli.test.mjs` |
| runner直接spawn隔离及Windows reporter URI | `scripts/run-node-test-layer.mjs` |
| 受管cache key保持不变、SqliteStore租约 | `crates/index-sqlite/src/cache_location.rs`、`lib.rs`、`cache_gc/lease.rs` |
| 身份/布局、WAL私有探测、来源锚点 | `cache_gc/inspect.rs`、`identity_snapshot.rs`、`source.rs` |
| 观察、闲置/LRU、活动观察 | `cache_gc/decision.rs`、`activity.rs`、`mod.rs::collect` |
| OS占用证明、Windows真实文件身份 | `cache_gc/sqlite_guard.rs`、`windows_identity.rs` |
| 退役/重试、自动游标/报告 | `cache_gc/retire.rs`、`automatic.rs` |
| native CLI、server CLI、后台子进程所有权 | `crates/index-sidecar/src/cache_cli.rs`、`src/index/cache-cli.ts`、`cache-maintenance.ts` |
| 成功打开后启动及dispose | `src/workspace/default-workspace-symbol-service.ts`、`src/composition/production-services.ts` |

原超限文件仍有迁移债：index-sqlite/lib.rs从1743缩至1695行，sidecar/main.rs从754缩至712行；
分别提取cache location和stdio职责。references-depth.test.mjs从815缩至804行，提取正常夹具关闭职责。
新增源文件/测试/脚本均不超过500行，既有500行runner测试没有增长超过限制。

## 实际验证

Mac：macOS26.6.2 /25G83，x86_64，Rust1.95.0；焦点测试和首次Node检查用Node26.3.0，
最终完整Node检查改用仓库固定Node20.19.5、pnpm8.15.9。LSP使用仓库隔离conformance SDK夹具；
未运行真实Photos/SDK语义压测，不将缓存生命周期测试当作其功能验收。
Windows：`windows-pc`，Node20.19.5、Cargo1.95.0，隔离目录
`D:\DevSetup\diagnostics\index-cache-lifecycle-20261029\source-v2`。没有改动日常Zed/真实缓存。

| 检查 | 结果/原始证据 |
| --- | --- |
| `cargo test --workspace` | 212 passed /0 failed /1 ignored，`rust-workspace-v2.log`；455冷目录性能项按用户授权豁免 |
| native缓存焦点Mac | 25/25，`cache-final-v2-focused.log`，含1个辅助子进程测试入口 |
| native缓存焦点Windows | 23/23，`windows-final/v2-rust-focused.stdout`，平台适用项不同，含同一辅助入口 |
| Windows已有路径/Store身份合同 | 均通过，`v2-rust-identity.*`、`v2-rust-store-contract.*` |
| Mac/Windows native release build | 通过，`release-build-v2.log`、`windows-final/v2-release-build.*` |
| Windows最终Node bundle及公开CLI/LSP/隔离 | 6/6，`windows-v3/v3-node-focused.stdout`；无超时 |
| Windows适用的命名模块夹具关闭回归 | 2通过，4非匹配项未执行，`windows-v3/v3-named-fixture.stdout`；未声称Windows符号链接overlay场景已测 |
| Mac公开CLI/LSP/隔离及原失败模块 | 12/12，`orderly-teardown-green.log`；新增shutdown后实际native租约已结清证明 |
| 固定Node20实际portable安装 | 1/1，`installed-node20.log`，随机cwd、不依赖源码目录 |
| `pnpm check:fast`最终固定Node运行 | **2092/2092通过，退出0，0失败/取消/skip/todo**；3223.885秒，`check-fast-final-node20-v4.log` |

首轮失败全部保留：Windows native7失败（自持DB句柄阻止改名），Node1失败（盘符reporter地址）；
修复后重新在source-v2完整跑适用焦点检查。Mac完整Rust首轮1失败是WorkspaceMismatch被映射成Io，
恢复typed error后完整重跑通过。沙箱下首次Node26检查的进程采样spawn EPERM失败，
在确定环境限制后停止该测试子树，保留`check-fast-final.log`与`sandbox-check-stop.json`；未当作完整通过。
首次允许采样的Node20全量运行又发现3个真实夹具关闭竞态：references-depth虽先await server.close，
该方法却只SIGTERM父Node；native稍后处理EOF、写cache-use记录，与rm目录竞争而ENOTEMPTY。
`teardown-repro-red.log`重现相同错误。正常夹具改走已有公开shutdown/exit并等待actual close，
不是加sleep/重试或取消关闭记录；异常终止测试保留。新回归验证shutdown后实际native preview不再active。
该已失败全量运行保留`check-fast-node20.log`，停止后从头重跑最终版本；不是以局部GREEN替代全量结果。
随后v3全量完整结束：2091通过、1失败、0取消/skip/todo，耗时3228秒。
唯一失败是清单仍断言旧264项，本轮新增3项实际267；不是功能用例失败。
精确总数、层数量及3个新文件的归属断言同步更新，保留唯一性/完整性检查；
`manifest-count-green.log`4/4通过。再次从头执行最终v4 check:fast：2092/2092通过，退出0，
0失败/取消/skip/todo；不把v3改写为完整通过。未更改产品超时或放宽正确性断言。

Windows修复候选ZIP的SHA256：`948e0679b2ffa85c77a5284989952ce38645859757df5063c9d02c251ba3f58c`，
逐文件输入：`candidate-v2-input-manifest.json`。之后产品Runtime/Rust源码不变，补了文档及正常会话夹具关闭回归。
Windows最终测试快照`candidate-v3.zip` SHA256：
`f6fcfa49f58362ccf6aec2b90eb3fe2b633401538279d82e7fa36bcba8022b23`；
逐文件输入`candidate-v3-input-manifest.json`，复用原v2 native产物，最终身份另见`final-input-identity.json`。
最终产品/构建/测试代码与Windows v3快照的唯一差异是清单测试的精确数量及新增文件归属断言；
Runtime/Rust及Windows实际运行的公开缓存/会话测试代码不变，三项产物哈希仍一致。

| 产物 | Mac SHA256 | Windows SHA256 |
| --- | --- | --- |
| server.cjs | `2e3681cd222ea5ae2b7e99871a94106c2b1dda5680d43f0a36366f532b81bb11` | `ce4e22b734096dd1774f344bd181633ef2b0fde90ae7a7045ab9c4c9511033ad` |
| semantic-worker.cjs | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` | `31ee0c734be704df4494a50b475c9021cd12443587c6a484280fc745e1d997b5` |
| release native | `f081d507b45ae99bac44450d9273db3b7f4752b196f95ab188ae622387421ba0` | `c2dcb9372753bf3f1daf9c11dec478ca856bbbe678871caa4bdbce3738832bb1` |

## 真实目录只读预览与历史副本

受检原目录：`/Users/liuhui/Library/Caches/arkts-language-server/index`。
首轮受沙箱锁描述符权限限制，全项Operation not permitted；保留`historical-validation/real-preview.*`。
允许锁检查后的preview耗时18.418秒（管理命令、非用户查询）：

| 当前只读结果 | 数量 | 逻辑字节 |
| --- | ---: | ---: |
| 全部目录 | 12301 | 8671460536 |
| 临时源缺失、尚无宽限观察 | 12256 | 3371206272，约3.140GiB |
| 其他legacy，last-use未知而保护 | 45 | 5300254264 |
| 已删除原缓存 | 0 | 0 |

`potentialBytes`表示符合临时来源证明、可进入观察的潜在量，不是已授权/已满足删除条件。
30K key `918ea384…cbe369`为legacy-last-use-unknown，完整保留，当前逻辑5291745280字节。
没有把当前锁可取得解释为该项目不再使用。此前调查的3.277GiB是分配块、9.895GiB是当时30K占用；
时间和口径不同，不能据此宣称本轮释放了空间。
证据：`real-preview-unrestricted/{command,summary,before,after,changes}.json`及完整`preview.stdout`。
全树stat/inode/mtime清单前后一致；选中原文件内容SHA256也相同，未对整个5GB30K DB做内容哈希。
stat清单覆盖路径、类型/mode、size、mtimeNs、inode、device及分配块，不比较只读访问可能改变的OS atime。
完整检查结束后再次只读复核：目录仍为12301，新增0、删除0、所有受测stat项变化0，
选中原文件SHA256全部一致。证据`real-after-final-check-result.json`、`real-after-final-check.json`；
验证了本轮全部测试没有继续向用户缓存根写入新目录，也没有更改已有缓存数据/管理文件。

历史副本8份覆盖schema2/4/5/6/8/9/11及一份DB/WAL/SHM，保留原URI/key。
`historical-validation/selection.json`、`historical-seed.zip`可复跑；仅副本使用显式grace0：
第一轮8 observing /0删除，第二轮8 removed /909344逻辑字节；不能省略第一次观察。
完整组和原始哈希保持可查。复现脚本`verify-history.py`硬性拒绝原目录apply，`preview-real.py`只允许preview。

## 已验证边界与遗留

实际覆盖：活动多连接/窗口、旧版真实SQLite读者、占用解除重试、并发清理、异常进程退出、
缺失恢复、WAL变化、离线/不支持URI、错误key/schema/未知文件、Unix symlink/权限失败、
Windows占用、trash中断模型及失败重试、容量完整/部分清单、自动游标/冷却及实际stdio结果正确性。
离线卷用不可达/非临时URI等保守路径验证，没有物理拔盘；Windows未另做网络共享、杀毒占用或Zed UI长测。
未验证临时根内部的自定义嵌套挂载及其卸载历史；现有来源证明不携带历史源卷信息，不能宣称覆盖该场景。
无支持锁/文件身份的网络文件系统、UNC扩展、超限WAL-only身份继续保护，不声称全部平台输入可回收。

清理不解决30K全量SQL替换慢、SDK超时、完整引用/重命名限制，也不清SDK/源码/安装release。
容量治理对不完整分页采取保守策略，不是严格磁盘配额；受保护项可使budgetUnmet持续存在。
容量口径为受检workspace文件逻辑长度，不含管理记录、私有检查区及延期trash；trash重试结果另列。
删除workspace后保留`.leases/<key>.lock`稳定锁文件，避免锁对象被unlink后并发使用者失去互斥；
该小型管理元数据的数量可随历史workspace增长，本轮不以危险的unlink回收它。
500ms仍为允许波动的体验目标；没有调整产品超时、V8、内存或项目规模上限。
