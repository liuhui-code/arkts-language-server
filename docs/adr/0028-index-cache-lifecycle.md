# ADR 0028：项目索引缓存的使用权、遗留识别与安全回收

日期：2026-10-29。状态：**Proposed；用户已授权实现，审批状态不由实现结果自动改变**。
父版本：`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`。

## 证据与范围

[调查](../reports/2026-10-28-index-cache-directory-accumulation.md)发现12301个项目索引目录，
其中12256个已消失的临时项目占3.277GiB；30K项目单目录约9.895GiB需独立分析。
两处测试使用不存在的ARKTS_LSP_CACHE_DIR，通用LSP测试和直接spawn缺少统一隔离。
这是历史快照，不是本次重新统计；不将无打开句柄等同于已经授权删除。

本决策只管理index/workspaces缓存，与[安装版本回收设计](../plans/2026-10-29-runtime-identity-and-release-lifecycle.md)
分开。缓存key和workspace identity不变，不按每次server版本另建目录。
不清用户源文件/SDK/原始证据，不实现30K全量替换加速、活动WAL截断或VACUUM。
本轮仅在隔离夹具与历史副本apply，用户真实cache只允许只读preview。

## 成熟机制依据

- [SQLite WAL](https://www.sqlite.org/wal.html#the_wal_file)：WAL属于持久状态，必须与DB共同移动/处理；
  正常close也可能checkpoint，不能用普通读连接声称原目录零写入。
- [SQLite OS locking](https://www.sqlite.org/lockingv3.html)及固定bundled SQLite的unix/win VFS源码：
  legacy reader不认识新租约；回收端还必须取得DB pending/shared字节区间的互斥证明，不能拿WAL的BEGIN EXCLUSIVE冒充没有其他读连接。
- [systemd tmpfiles](https://www.freedesktop.org/software/systemd/man/latest/tmpfiles.d.html)：配置化闲置策略与活动锁保护分离，
  不照搬系统目录权限或仅按年龄删除。
- [Nix GC roots](https://nix.dev/manual/nix/2.30/package-management/garbage-collection)：可回收性由引用/使用关系决定，
  此处以workspace identity和实际使用锁代替安装profile根。
- Rust1.95的File共享/独占锁提供跨平台使用权；SQLite VFS字节锁是额外的legacy保护，不与flock混为一谈。
  Context7：/websites/sqlite_docs、/rust-lang/rust；实现报告保留具体源码/试验适用边界。
- [Windows目录改名规则](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)：
  子文件有打开句柄会阻止目录改名，包括清理器自己的DB句柄。真实Windows三种句柄探针及首轮失败保留在报告。
- [Node child close](https://nodejs.org/docs/latest-v20.x/api/child_process.html#event-close)：
  等待子进程及stdio关闭后再释放测试私有目录；发送kill本身不是退出证据。Context7：/websites/nodejs_latest-v20_x。

## 决定

1. **先阻止新增污染。** 通用LspProcess默认创建私有cache并在child close后回收；显式fixture cache由caller拥有。
   runner为不走该harness的子进程提供run-private cache；修正错误变量，不兼容一个原本不生效的拼写来掩盖测试错误。
   正常生产会话夹具删除caller-owned目录前须完成公开LSP shutdown/exit及实际close；
   仅SIGTERM父Node的exit/close不能证明其native子进程已完成EOF释放。故障退出测试仍单独保留，不能用sleep替代释放证明。
2. **使用权先于打开。** 每个受管SqliteStore连接在建目录/打开DB前取得workspace共享使用锁，连接实际关闭后才释放。
   目录迁移/删除前使用短暂namespace互斥和workspace独占锁；锁对象在受管管理区，不能在使用者存在时unlink换锁。
   删除workspace后保留其小型稳定锁文件，避免等待者与新打开者分裂到不同锁对象；它不是仍保留一份DB。
   所有打开路径包括后台catalog连接都经过同一入口，进程崩溃由OS释放锁，不靠PID/心跳TTL推断死亡。
3. **注册与兼容。** 新条目记录identity和最后使用时间，正常关闭更新last-use。
   回收识别不要求先迁移旧DB或重建索引；正常打开仍沿用既有schema兼容迁移。
   旧缓存正常被新server打开时记录实际使用并登记；未打开、未显式授权的legacy不凭历史年龄自动接管。
   legacy通过只读主DB身份探测、application_id、目录key重算和文件快照验证识别；身份仅在WAL时，
   在大小上限内复制完整DB/WAL到受OS锁保护的私有临时区解析；超限/不稳定/未知schema则保护。
   不使用普通SQLite连接在真实目录创建SHM。metadata-only immutable探测不作为完整性或当前generation证明。
   私有检查区可复用，正常完成删除快照，异常退出由下次取得锁者清理，不为每次探测永久增加目录。
4. **废弃临时项目。** identity必须属于当前可验证的本机临时根；临时根规范路径/文件身份可访问且稳定，
   源路径返回NotFound而不是PermissionDenied/其他IO错误，重复观察跨过可配置missing grace，删除前仍如此。
   普通根、离线盘/网络路径、失效的临时根、UNC等不能证明安全的情况保护并报告；一次NotFound不触发删除。
5. **闲置/容量。** 非活动、源根可访问且identity一致的已登记条目可按last-use闲置策略回收。
   默认闲置30天、临时项目缺失宽限24小时，是可配置保留策略，不是性能验收门禁。
   活动检查在apply时记录有效使用观察；它只用于保留期/LRU，不能依据观察超时认定连接已死。
   最后使用取正常打开/关闭记录与活动观察的较新值，覆盖长期打开后异常退出的保留期。
   容量上限默认不设；显式设置后在闲置合格项中按LRU回收到目标，保护项导致超额时报告budgetUnmet，不强删近期/活动项。
   仅完整、从头开始且没有未知大小的清单可以执行全局容量决策；分页不推测总量，保守报告budgetUnmet。
   容量计工作区文件逻辑长度，不把管理记录、私有检查区及延期trash冒充已纳入整盘硬配额；trash重试结果独立报告。
   legacy无可靠last-use，不用于推断普通项目的LRU；废弃临时legacy可单独选择纳入显式清理。
6. **默认与自动触发。** CLI默认只读preview，显式apply才执行；支持逐项原因、逻辑字节与分页游标。
   workspace索引成功打开后启动低优先级独立维护进程；关闭停止并等待该维护进程，不在关闭时启动新清理。
   自动模式仅处理已登记条目及此前显式授权的legacy临时孤儿，不自动接管全部历史legacy。
   legacy通过显式include-legacy清理登记授权；preview不登记。初次apply只记录missing观察，
   以后自动轮可在原宽限后完成；自动配置不能缩短已登记的最小宽限。源根恢复取消missing登记。
   变化的DB/WAL/SHM/使用记录或锚点重置观察，不能拿陈旧主DB时间绕过WAL更新。
   默认每批128、完整周期后1小时，分页轮间1秒；多窗口共享OS锁/游标/冷却状态。
   自动维护有可配置扫描批量、运行间隔及游标，不能在前台查询内扫描所有DB；本轮未部署到用户日常实例。
7. **原子退役。** 清理进程单实例；逐项重新核验目录、允许的文件集合、identity/key、mtime/size/文件身份、
   namespace/使用锁及SQLite字节锁。完整目录移入受管trash后才删除，DB/WAL/SHM作为整体。
   Unix保持SQLite字节锁至退役完成，取得该锁后不再打开/关闭同inode的其他DB描述符，避免fcntl锁被提前释放。
   Windows保留namespace/使用独占锁，在原子目录改名前关闭清理器自己的DB句柄；
   Windows原子改名对竞争的legacy打开句柄拒绝执行，成功后再次核对整组指纹，变化则保留trash，不删除。
   不跟随符号链接/Windows reparse，不删除含未知子文件的目录；路径与文件状态变化则延期。
   trash有退役证据，失败或中断后下一轮重试；没有证据的未知trash不得任意删除。
8. **失败可见。** 活动、离线、身份未知、权限不足、Windows占用、竞争和删除失败分别报告。
   失败不阻止语义服务、不吞掉错误冒充已回收；已完成删除不能因后续状态/报告写失败而丢失实际结果，issues独立报告。
   日志走stderr，CLI JSON和sidecar协议各用独立stdout模式。

## 备选与取舍

- 拒绝全清、仅按mtime/不存在删除、每次升级变namespace：损害复用且不能证明无人使用。
- 拒绝把SQLite写事务当跨版本读者保护：WAL读写并发，BEGIN EXCLUSIVE不代表其他连接已消失。
- 不用进程名/不可靠PID列表作为唯一保护：多窗口/重用/权限不可观测会漏判。
- 不在请求中做全量GC或数据库压缩；管理工作在独立进程、有界扫描并可重试。
- 历史legacy默认preview/显式迁移牺牲立即自动释放，换取不改变旧版活动会话与本轮真实cache。
- 不用关闭所有旧进程/删除WAL来解决Windows占用；完整组改名失败即延期，下轮重新验证后重试。
- 本地常规文件系统为支持边界；锁/身份无法确认的文件系统保守保护，不能声称任意外部程序都遵守租约。

## 验收

先RED再GREEN：独立/runner测试隔离、显式cache保留和异常退出清理；实际stdio LSP仍能索引/查询。
真实native CLI/协议覆盖遗留副本、错误key/identity、WAL整组、恢复源根、缺失宽限、离线/权限、
多个活动窗口、传统SQLite读连接、并发GC/打开、进程异常退出、symlink/reparse、Windows占用与重试。
preview前后原文件内容/size/mtime不变；apply不得删除活动30K缓存或其他保护项。
按成功/延期/未知/失败分别统计，不把条件跳过算清理成功。
最终执行check:fast、Rust焦点测试与相关release build；Windows实际可用时验证，未实测边界单列。
仍沿用500ms体验目标与用户授权的455冷目录性能门槛豁免，不修改产品堆/超时/规模阈值。

实施完成：最终check:fast2092/2092；Rust workspace212通过、455授权豁免项1忽略；
Windows原生23、公开CLI/LSP/隔离6及适用夹具2通过。真实cache仅preview，完整检查后原12301目录无新增/删除或受测stat变化。
这不改变本ADR的审批状态，不代表真实Zed/30K全量功能或任意网络/离线卷拓扑已通过。
实施与原始证据：[TDD记录](../tdd/2026-10-29-index-cache-lifecycle.md)、[验证报告](../reports/2026-10-29-index-cache-lifecycle.md)。
