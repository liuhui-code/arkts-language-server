# 运行产物身份、版本激活与历史残留回收设计

日期：2026-10-29。状态：**Proposed，供评审；未实施、未做新增运行验证**。
父版本：`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`。
用户目标：每次使用能够确认实际运行版本；历史残留及时回收；无法安全切换或清理时至少明确告警。
本文件中的行为和命令均为建议设计，不能作为当前产品已具备的能力。

范围补充：项目索引缓存现由独立的[ADR 0028](../adr/0028-index-cache-lifecycle.md)及
[实现验证报告](../reports/2026-10-29-index-cache-lifecycle.md)承接；
该实现不意味着本文的release回收、运行版本握手或激活告警已经完成。

## 1. 当前事实与缺口

| 现有机制/位置 | 已具备 | 尚缺什么 |
| --- | --- | --- |
| `scripts/install-local.sh:165–221` | 按内容指纹复制独立 server/Worker/native release | 本地安装和 portable 清单未统一；没有会话引用与历史 release 回收 |
| `scripts/install-zed-windows-runtime.mjs:40–91` | Windows 独立 release，已有文件逐项比较 | 无当前进程身份握手、旧会话告警或回收协议 |
| `scripts/artifact/build-portable.mjs:88`、`tests/support/artifact-manifest.mjs:8` | 清单已有 commit、平台、工具链及文件 size/mode/SHA256 | 安装只复制运行文件，清单本身没有随运行文件保留；运行时不验证这份清单 |
| `scripts/install-zed-local.mjs:486–487` | 分别原子替换 launcher 和扩展链接 | 两个替换不是一个事务；现有 launcher 固定到旧 release，更新不能替换正在运行的 server |
| `editors/zed/src/lib.rs:17–82` | 支持 binary.path、managed launcher、PATH | 显式路径/profile 可指旧版；扩展版本字符串不能证明所启动 server/Worker 身份 |
| `src/semantic/semantic-worker-proxy.ts:91–94` | 优先使用 server 相邻 Worker | 缺失时回退 `cwd/dist`，可能混用另一构建，不能成为安装模式兜底 |
| `src/semantic/semantic-worker-host.ts:200–253` | 同一 host 固定路径；退休未退出时拒绝新建 | started 仅计数/threadId；没有实际产物身份握手 |
| `src/semantic/semantic-worker-retirement.ts:23–30` | 等待真实 exit，保留退休句柄 | 仅解决同会话 Worker 退出，不负责历史安装与跨会话进程 |

`build-runtime.mjs`另生成诊断 Worker；当前安装清单只包含语义与引用验证 Worker。
临时诊断属显式实验路径，不能因此断言默认安装已经漏掉一个必需 Worker。
新清单应从实际运行模式声明所需角色，启用某角色就必须打包、校验并握手，不能运行时碰运气查文件。

上一轮 Windows 最新版只部署到独立 profile，日常安装仍旧；见
[Windows 实测报告](../reports/2026-10-29-windows-zed-30k-init99.md)。
Mac 默认安装与该父版本产物 SHA 一致；当前是否运行必须另查实际进程，不能用磁盘文件代替运行证明。

## 2. 官方机制与适配边界

经 Context7 resolve/query，并核对官方页面，采用以下机制；后续具体策略属于本项目设计。

| 官方依据 | 可复用的机制 | 不照搬的部分 |
| --- | --- | --- |
| [Nix profiles](https://nix.dev/manual/nix/2.30/package-management/profiles) | 构建输入区分独立 store 路径，profile 原子选择 generation，允许回滚 | 不引入 Nix；本项目 artifactId 是产物清单摘要，不冒充 Nix store hash |
| [Nix GC](https://nix.dev/manual/nix/2.30/package-management/garbage-collection) | 由引用根决定可回收对象；历史 generation 仍引用就不能删除 | 本项目增加显式活动会话根，不能只看文件日期或误认为“有新版”就可删旧版 |
| [VS Code 更新](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#extension-auto-update) | 更新安装与运行宿主重启分开；提示用户重启宿主 | 不宣称 Zed 提供同样的自动重启 API |
| [VS Code cleanup 源码](https://github.com/microsoft/vscode/blob/main/src/vs/platform/extensionManagement/node/extensionManagementService.ts) | 过期项先记录待删除，再由 cleanup 处理；清理失败保留证据 | VSIX 下载缓存的容量策略不等于活动安装/进程回收策略 |
| [Node 20 Worker](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html#event-online) | online 仅表示开始执行 JS；应用层握手单独确认身份 | 身份通过不等于 Program/SDK READY |
| [Node terminate](https://nodejs.org/docs/latest-v20.x/api/worker_threads.html#workerterminate) | terminate 返回的 Promise 与 exit 对齐，确认退出后才交接 | 强终止不能保证 Worker finally 完成；不据终止请求已发出就释放全部引用 |
| [Rust File locks](https://doc.rust-lang.org/stable/std/fs/struct.File.html#method.try_lock_shared) | 共享使用锁/独占回收锁，Unix/Windows 使用各自 OS 原语 | 锁可能是 advisory；所有管理入口必须遵守合同，不能把锁当作对任意外部改写的防护 |

Context7 库：`/microsoft/vscode`、`/nixos/nix`、`/nodejs/node`。
Rust 标准文件锁自 1.89 提供，仓库固定工具链为 1.95；不要求提升工具链。
这里提供机制依据，不将其他工具的具体计数/容量/超时直接复制成本项目门槛。

## 3. “最新”的权威定义

“最新”指**当前 profile 最近一次成功激活的目标 artifact**；不是目录修改时间、相同版本号，
也不是每次启动自动下载 GitHub main。Git 更新后仍需完成构建/安装，才改变运行目标。
离线可以使用该已验证目标；如果远端更新状态未知，不能宣称已经与 GitHub 最新同步。

区分三种身份：

- `buildId`：实际构建输入摘要，覆盖源码、脏工作树有效输入、锁文件、编译器及构建选项；commit 仅作来源元数据。
- `artifactId`：稳定序列化的最终产物清单摘要，覆盖文件相对路径、大小、mode、SHA256 与平台/协议信息。
- `activationGeneration`：某 profile 的单调安装激活序号；回滚也是新序号，不靠 commit 大小或时间排序。

先把 buildId 嵌入程序，再构建并生成产物清单；artifactId 不反向嵌入它所摘要的 bundle，避免循环摘要。
同一 commit 的不同脏树、工具链或平台可能有不同 artifactId；不能仅比较 commit 或 `0.1.0-local-beta.1`。
外部 SDK 路径/声明身份另记运行输入，不能把 SDK 更新误判成旧 Worker，也不把 SDK 目录纳入安装 GC。

显式 `binary.path`/版本固定仍由用户选择：显示 `pinned/external` 及实际身份；与 managed target 不同则告警，
不偷偷覆盖用户设置。普通 managed 启动必须解析当前 profile 目标，不能再隐式 PATH 或 cwd 回退。

## 4. 一份产物清单，一处激活指针

复用并收敛现有 artifact manifest 校验，而非再造独立哈希列表。
清单随 release 保留，至少列出 server、启用的 Worker 角色、native、运行配置、标准库、
平台/Node 兼容范围、Worker/native 协议与扩展桥接 ABI；扩展 WASM 和 grammar 有独立摘要及兼容映射。
安装模式禁止额外模块从 checkout/node_modules/cwd 混入；显式开发模式另行标记，不静默启用。

每个 profile 有一个原子替换的激活记录，包含：

```text
profileId, activationGeneration, artifactId, releasePath,
extensionArtifactId, bridgeAbi, previousVerifiedArtifactId
```

managed launcher 使用稳定入口读取该记录，不再永久写死某个 server release。
Windows 三行启动文件同样指向稳定入口并带 profile 位置；不依赖 Unix symlink 来实现 Windows 激活。
候选构建、复制、全部校验、公开 stdio 安装烟测全部成功后，才以同文件系统原子替换提交激活记录。
并发安装用安装锁串行；读者看到完整旧记录或完整新记录，不看到半写文件。
替换失败保留旧激活，不用先删旧文件再写新文件制造空窗。

Zed 扩展链接是另一个外部加载点，不能声称它与激活记录跨两个路径原子提交。
先准备扩展快照并验证新旧桥接兼容，再更新链接/激活；加载中的旧扩展只能在兼容桥接 ABI 内继续。
不兼容时明确提示重载扩展/语言服务，不能假装整条链已经切到新版。
日志分别记录“部署的扩展 WASM 摘要”和“客户端报告的桥接 ABI”；没有证据时，实际已加载扩展摘要记 unknown。

## 5. 启动校验和 Worker 握手

启动链：`Zed → profile launcher → 固定 artifact 的 server → 同 artifact 的 Worker/native`。

1. launcher 读取一次激活快照，取得 release 使用权，并校验 server/入口清单后启动。
2. server 启动报告期望与实际 artifact/build/commit、profile/激活序号、Node、PID/出生时间、绝对路径。
   不在每次请求重新 hash；按使用角色在启动/首次载入时验证对应固定安装文件，SDK/项目新鲜度走原合同。
3. 轻量 Worker 启动层在接收语义任务前独立计算自身文件摘要，读取嵌入 buildId，报告角色、协议、会话 nonce、
   世代、实际路径及摘要。不能只把 parent 传来的 expectedId 原样回传当验证。
4. parent 与被固定的清单逐项核对，成功后才承认 identity-verified，才发送语义任务。
   online、身份通过、引擎准备、Program 可用、semantic READY 是不同状态。
5. 引用/诊断等嵌套 Worker 使用同一合同；native 启动前验证二进制，协议初始化核对支持的身份/协议。
6. 文件缺失、SHA 不符、角色错配、未知协议一律明确失败并收回该次启动；不去 cwd/PATH 搜另一个 Worker。
   不把安装错误送进既有“崩溃后自动重建”循环反复尝试同一损坏 artifact。

身份检查不依赖远端在线；现有只读本地清单检测的是混包/损坏，不抵抗同一用户主动篡改清单与全部文件。
发布下载的真实性继续由已验证下载/发布来源承担，不能把 SHA256 本身说成签名认证。

## 6. 已运行旧版本：明确告警，再由客户端安全切换

当前会话始终固定在一个 artifact；同会话恢复 Worker 继续用该版本与新 epoch，不能只替 Worker 跨版本。
发现 profile 激活序号/目标改变时，运行状态变成 `update-pending`，它不是项目 `degraded`。
通过 profile 文件变化通知，并在管理检查点补查激活序号，避免只依赖可能丢失的 watcher。
告警按 session/目标 generation 去重，不每次补全/跳转弹窗。

示例：`当前仍运行 9d47e55 / artifact A；此 profile 已激活 artifact B。请重启 ArkTS 语言服务以生效。`
已建立 LSP 时使用标准 window/showMessage，详情写结构化日志；启动前错误由 stderr 和 Zed 的启动失败展示承接。
提供实际/期望路径、身份、原因和下一步动作，不能只写“版本异常”。

LSP 没有通用“让任意客户端重启自己”方法。本轮设计至少确保告警；
由 Zed 的语言服务重启流程重建连接并重新 didOpen，恢复未保存文档，不杀 Zed、不代用户保存/丢弃编辑。
除非经 Zed 实际 API 与 UI 验证，不承诺自动无感升级；不通过退出循环迫使编辑器无限重启。
新会话重新读取激活目标并完成握手后，才报告已运行最新 managed artifact。

## 7. 历史残留的回收规则

磁盘旧 release、仍运行的旧会话、已失去客户端的孤儿进程分开处理。
回收仅限安装器拥有的根目录和已登记 profile；不扫描删除任意名字相似的目录/进程。

### 7.1 引用根和使用权

保留：所有登记 profile 的当前目标、每个 profile 一个已验证回退版本、显式 pin、
活动 server/Worker/native 会话及未完成安装事务。
测试 profile 完成后由测试驱动显式注销；普通用户 profile 不能因长时间没使用就被猜测为废弃。

会话记录至少含 profile/artifact/session nonce、PID+进程出生时间、真实启动路径、受管客户端/子进程身份。
PID 单独、心跳超时、父 PID 不存在、旧 mtime 均不能成为杀进程或删 release 的充分依据。
使用权从“启动前解析目标”覆盖到“所有产物使用者实际退出”，包括独立 native；Worker 线程不重复当成进程。

启动注册、激活和 GC 候选确认共享管理互斥；活动 release 持共享使用锁，GC 须取得独占锁再复核引用根。
锁文件放管理状态区，不随 release 重命名/删除而更换锁对象。
跨平台锁薄封装使用现有 Rust 工具链；Node 侧通过会话生命周期桥接持有，不引入全局常驻更新服务。
独立 native 使用者也须持使用权；不能因 server 退出就假定 native 已退出。
桥接意外死亡时，还必须核对会话登记的真实进程身份；不能单凭独占锁变得可取得就删除仍活跃文件。
无法证明未使用、权限不足或锁语义不可靠时跳过并告警，不能乐观回收。

### 7.2 自动清理触发与处置

安装成功后、下一次启动的后台管理阶段、会话关闭后触发有界清理；进程崩溃遗留由下一次管理轮补收。
没有新事件就不为清理启动常驻 daemon，不在用户查询临界链删除大目录。
每轮记录待删数/字节、已释放、受保护与失败原因；有遗留则记录下次重试，不能只吞掉异常。

| 残留类型 | 处置 |
| --- | --- |
| 同 artifact 的重复安装 | 验证后复用一份目录，不新增副本 |
| 无根、无使用权的旧 server/扩展 release | 锁内二次核验，标记/移入受管 trash，再有界删除 |
| 中断安装的 staging/tmp | 证明对应事务已结束或进程已死后回收，不能凭年龄删除活动构建 |
| 其他窗口仍在使用的旧版本 | 保留文件并通知该会话更新，不跨窗口强杀 |
| 客户端已断开的受管孤儿会话 | 先经身份匹配控制通道/原有关闭链退出；截止后仅可终止已证明的本会话进程树并记录原因 |
| 无记录的历史进程/未知目录 | doctor 报告路径/PID/出生时间，身份不明不自动杀删；旧版缺观测能力需一次迁移核对 |
| Windows 文件仍被占用/访问被拒绝 | 标记 deferred、保留路径与错误码，实际退出后或下轮重试 |

孤儿判定须同时有客户端连接已失效/关闭证据与服务身份，不把“旧版本但用户仍在用”视为孤儿。
关闭使用现有取消/排空/dispose/实际 exit 约束；强终止不替代 Registry 正常结清的证据。
Native SQLite 在退出时可能仍做工作，沿用现有截止与失败记录，不为安装清理暗改产品超时。

项目 index/WAL、SDK 缓存、用户项目源文件、诊断原始证据不在该 GC 范围。
运行 artifactId 不应直接成为项目索引新 namespace，避免每次升级再生成一份 30K 数据库；
索引按现有工作区身份/兼容性和 schema 合同复用，迁移与缓存配额另行设计。

## 8. 可观测状态与诊断入口

安装状态：`staged → verified → active → superseded → collectible → trash → deleted`。
失败候选不进入 active；pinned/in-use 是回收保护原因，不等于损坏。
会话状态：`starting → identity-verified → running → update-pending → draining → exited`；
身份错配转 `installation-invalid`，清理无法确认退出保留 `retiring`，不当成 exited。
它们与项目 semantic readiness、SDK 输入质量及 Worker 故障恢复状态分层。

拟新增 `arkts-language-server doctor --json`：只读列出当前 profile 期望目标、安装/运行身份、所有受管会话、
pin/回退、待清理大小及保护原因。默认不联网、不清缓存、不终止进程。
受管清理提供 dry-run；显式外部 binary.path、遗留启动器与无法认证的实际已加载扩展均醒目标为未知/覆盖。
旧扩展+外部旧 server 完全绕过新启动链时，新 server 无法凭空告警；安装迁移审计/doctor 必须揭示这个边界。
日志使用 session/PID/启动时间/artifact/Worker 世代关联，stdout 继续只承载 LSP/内部协议。

## 9. 实施切片与验收

先记录 Proposed ADR，沿既有 ADR 0020 的实际退出/旧 epoch 隔离约束补充安装生命周期；
不以本提案追认 Accepted，也不重写旧 ADR 的验收历史。

1. **身份闭环**：统一并随安装保留 manifest；禁止安装模式 cwd 回退；所有启用 Worker/native 身份校验与握手。
   先以随机 cwd 的真实安装+stdio LSP 建 RED：同版本不同构建、旧 Worker 混入、文件缺失/损坏、协议不符、延迟握手。
2. **目标激活与告警**：稳定 profile 启动入口、原子激活、既有会话 update-pending、实际/期望身份输出。
   覆盖并发/失败安装、切换中启动、离线、回滚、二进制覆盖、多个 profile 和多个活动窗口；
   Zed 重启语言服务后未保存文本必须仍与最新 didOpen/didChange 一致，不以空初始化代替。
3. **使用权与 GC**：先用 characterization 固定现有安装/退出行为，再补真实锁竞争、启动与 GC 交错、PID 复用、
   桥接/父进程崩溃、native 独存、旧版无登记、Windows 占用/拒绝访问、staging 和 trash 失败重试。
   明确断言当前/回退/其他窗口版本未删，无根旧目录确实回收，清理失败仍有可查终态与原因。

每片通过实际安装入口验证，LSP 行为走真实子进程 Content-Length stdio，不能只测清单函数。
最终候选执行 `pnpm check:fast`；涉及 Rust 的焦点 cargo test 和相关 release build；Mac/Windows 实装验证。
性能只量化新增固定安装文件校验与管理开销，不扫描项目/SDK，不修改产品内存、V8、查询超时和规模阈值。
500ms 仍为体验目标；455 文件冷目录门槛沿用既有授权跳过，不能把它改写成全量检查通过。

`install-zed-local.mjs` 当前 498 行、proxy 493 行、LSP composition 500 行；
实施须先提取内聚职责并保留 characterization，不直接往这些文件堆逻辑或机械切文件。
本提案不解决现有 99% SQL 全量替换、SDK 超时、30K 完整引用/重命名范围限制，不把身份可信当作功能验收通过。
