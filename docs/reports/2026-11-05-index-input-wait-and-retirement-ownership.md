# IX-03/05：精确输入等待、资源路由与正常退出退役所有权

日期：2026-11-05；parent `298d65f5d7f796c347fe8be5c739e428066489d8`。
ADR0043仍Proposed；IX-00–08整体ACTIVE，未验收，不提交、合并、部署或发布。
前序：[保存/兼容/退役](2026-11-05-index-save-compatibility-and-cache-retirement.md)。
本页所有原始证据位于 `.bench/index-versioned-maintenance-20261104/`。

## 候选隔离

完整集成检查冻结 `/private/tmp/arkts-index-versioned-maintenance-20261104` 的源码，
正常批准的进程采样权限、Node20.19.5/pnpm8.15.9，receipt `ix03-integrated-approved-checks.json`。
本页新增代码先只在独立Git副本 `/private/tmp/arkts-index-input-save-next-20261105`，
同parent；旧主工作区其他改动、日常安装、真实项目/缓存未操作。
新增代码没有因旧候选检查正在运行就冒称已经集成或完整通过。
Native/Node分别冻结核验，不把不同候选/工具链/协议结果拼成一份通过。

## IDX-V1-INPUT-006：仅资源变化不应排全源码catalog

直接根因：`registerWorkspaceFileInputs` 在区分资源/源码dirty前，就通知所有根开始catalog。
资源事件仍须进入语义新鲜度、诊断和取消链；它并不自动构成源码facts变化。
修复把catalog通知放在源码dirty集合之后，只排需要源码对账的根。
没有省略observer、resourceChanged、rootDirty或语义事件，也没有授予新的完整资格。

公开framed LSP受控端口回归覆盖resource/source/mixed/config四类输入，
用已应答workspace/symbol屏障核对处理顺序：observe先于semantic；resource-only无catalog，
其他三类保留catalog。此用例使用可观察端口，不冒充真实Native。
同批还跑真实Native128/129组合、真实编译器资源诊断和coordinator。

- RED：`ix03-resource-routing-red.log`，resource-only实际catalog根1、期望0。
- GREEN：`ix03-resource-routing-regressions.log`，四文件36PASS/0FAIL/0skip，107.08s。
- 类型/构建：`ix03-resource-routing-types.log`、`ix03-resource-routing-build.log`。
- 主文件：`src/lsp/register-workspace-file-inputs.ts`；回归
  `tests/lsp-index-versioned-maintenance.test.mjs` / `tests/fixtures/lsp/index-input-routing-server.ts`。

## IDX-V1-INPUT-007：旧输入查询等待了共享ACK/无关后继

直接根因：`VersionedMaintenance.read` 等待全局`flush()`及任务ready，
旧查询已被新输入替代，仍依赖被阻塞的共享changes ACK；共享mutation不是该读请求的私有任务。
修复由`MaintenanceInputs.waitForObserved(input, signal)`为精确input建立订阅：
已ACK立即准入；输入替代、订阅取消、owner停止或不再可能准入时结清并移除listener；
共享ACK和writer继续完成，最新输入仍可成功对账/读取。
完整任务在正式准入前/结束时成对登记admission，失败不能留下虚假的“将来会观察”。
读前/读后input、Native物理身份及资格校验保持，不重放旧查询。

ACK仅表示Native观察到input，绝不是TypeScript Program/checker已返回，也不是完整资格。
`flush()`仍用于完整对账，本片未证明持续输入下全局flush/完整任务准入公平性；
已经发出的无signal Native读取仍靠原末尾fence，不冒称主动取消了所有在途读。

- RED：`ix03-superseded-input-red.log`：旧search直到外部1s驱动超时仍未结清。
- GREEN：`ix03-input-observer-lifecycle.log`，队列12+生命周期16=28PASS，15.42s。
- 六文件相关：`ix03-observer-related.log`，47PASS/0FAIL/0skip，24.94s；
  真实Native/framed LSP及No-op原始证据 `ix03-observer-real-lsp/`。
- 受控侧进程hold-change-ack实际扣住ACK，driver应答证明旧search先于新observe；
  旧search先拒绝、不取消Native共享任务；释放ACK后同一Native initialize次数1，最新输入恢复。
- `events.getEventListeners`观察abort listener从1归零；只是订阅生命周期证据，非heap/RSS泄漏证明。
- 主文件 `src/index/maintenance-inputs.ts` / `versioned-maintenance.ts`；
  回归 `tests/index-maintenance-{inputs,lifecycle}.test.mjs`。

## IDX-V1-GC-004：正常进程退出可以切断后台退役

### 实际失败，不以成功重跑消除

实验布局曾24/26失败，随后5轮26/26；当时原因未明，原记录保留。
本轮固定产物、最多15轮/首次失败即停：前10轮通过，第11轮exit101。
`ix05-gc004-observation.json`记录产物/测试哈希和逐轮结果；
`ix05-gc004-observation-11.log`保留实际目录清单。
正常public shutdown并wait exit0之后，工作区留下零字节
`cache-use.tmp-79525-1793831815757010000-14`，触发`unsafe-cache-entry`，
在owner内容保护断言之前即拒绝清理。目录/产物非用户真实缓存。

### 因果与证据强度

`catalog_files::retire`原实现每次spawn一个线程，立即丢弃JoinHandle；
退役线程执行store关闭、catalog prune及CacheLease Drop的cache-use原子替换。
`CacheLease::record_use → files::write_json`创建私有临时文件后写入/sync/rename。
进程main正常结束不会等待这些已分离线程；临时文件是未完成原子替换的实际证据。
原第11轮没有采到具体线程栈，不能声称已辨认是哪个退役job在哪条指令退出。

受控debug gate在退役仍持有store、尚未drop时暂停，通过真实Native公开协议触发。
`retirement_shutdown`断言正常shutdown不能先退出，释放gate后必须真正退出，
同缓存重开取得完整资格，最终公开GC删除完整工作区。
旧实现RED `ix05-retirement-shutdown-red.log`：进程先exit0，退役未结束。
这证明正常退出生命周期缺口；gate本身没有伪造原零字节文件，也不冒充原现场精确窗口。

### 正式修复边界

由所有公开Control owner持有一个进程级退役runtime；runtime仅静态Weak登记，
不会由全局强引用永久存活。一个executor、最多8个等待closure；满时反压资源生产者，
不是文件数、RSS、结果截断或新的产品超时限制。最后一个owner Drop关闭sender并join完成任务。
退役job只持有待关闭资源/独立cache lease，打开的内部Control不取得runtime owner，避免自join/循环引用。
启动executor失败为显式IO错误；job panic、executor不可用、join失败均有stderr事件，
不以丢弃任务伪装正常释放；异常executor的未交付job在调用方执行资源释放。

生产者可能持publication锁排队，故退役prune使用同一稳定锁inode的try_exclusive；
锁忙则保留旧库待后续安全回收，不能在持有有界队列反压时阻塞等该锁形成死锁。
SQL锁、reader lease、活动WAL保护、未知文件拒绝及删除前fence不变。
强制kill/OOM仍可能打断原子替换；本片不凭文件名授权删除历史可疑tmp，也不清真实缓存。
全局FIFO的跨工作区反压/尾延迟与饱和进展还需后续负载验证，不声称排队永远免费。

- 主实现：`crates/index-sqlite/src/catalog_retirement.rs`、`catalog_files.rs`、`catalog_control.rs`；
  begin/Drop/物理切换调用者显式使用活的Control，杜绝无owner后台任务。
- RED后首个shutdown GREEN：`ix05-retirement-shutdown-green.log`，1PASS。
- 五文件正常布局：`ix05-retirement-lifecycle-green-v2.log`，28PASS/0FAIL；
  中间v1私有module可见性编译失败保留，不算通过。
- 增强控制面仍可应答/完整资格及关闭：`ix05-retirement-query-and-shutdown.log`，1PASS，9.68s。
- Rust全量存储/双配置相关/Clippy/release冻结检查进行中：`ix05-retirement-checks.json`。
  旧通过不覆盖新增代码，待实际terminal再补结果。

## 完整检查与仍开放项

旧集成候选的完整check:fast仍运行，已出现两项constructor引用-32803失败：
`ix03-integrated-checkfast.log`。不得称整体GREEN。
固定该W产物的诊断复跑不改变断言/节奏，保留server日志及失败协议，
`ix03-constructor-probe-identity.json`、`ix03-constructor-observations.json`；
局部未再现不能推断已修复，根因仍待证实。
ignore/目录未知/重连/漏watch、持续输入公平、完整metadata/partial/迁移/ACK，
最终128/2048/20K/30K两类规模变量、原30K两小时、真实UI/Windows仍未关闭。
不把局部机制、debug gate或协议流量称UI验收，不更改产品阈值或旧新鲜度合同。

## 官方机制核验

Context7本轮resolve Rust标准库失败（HTTP transport）；没有伪称得到内容。
官方Rust [`JoinHandle`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html)
明确drop即detach，join等待线程及析构结束；
[`sync_channel`](https://doc.rust-lang.org/std/sync/mpsc/fn.sync_channel.html)
明确有界FIFO/满时反压与断连语义，本片据此实现所有权和结束屏障。
Node20官方[`events.getEventListeners`](https://nodejs.org/download/release/v20.19.5/docs/api/events.html#eventsgeteventlistenersemitterortarget-eventname)
用于测试订阅移除；沿用此前Context7失败后官方补证，不引入第三方队列框架。

## 后继验证与修订：不把中间GREEN当成完整交付

### GC-004：补齐延后prune进展

首个owned-runtime片通过253存储/28正常Native/27实验Native及双Clippy/release，
但后续完整Rust轮 `ix05-retirement-final-checks.json` 仍失败：
`maintenance_draft_policy`显式force后旧private DB五秒未退役。
直接原因是try_exclusive忙时仅跳过，之后没有新的prune触发。
另两项shutdown/EOF失败为测试fixture两个并行用例使用相同前缀+nanos，实际撞目录；
为两种场景分别命名，不把AlreadyExists/被另一fixture删除错误当产品损坏。
这些失败和原始日志保留，首个owned片不能称最终GREEN。

后继runtime为每个工作区合并一个待prune请求，轮转公平重试；有输入先关闭资源/排队，
无新输入但仍有待办时20ms调度重试，无待办直接阻塞接收而非空转。
此为内部调度间隔，不是新的失败期限/性能验收硬线；不扩大已有预算或结果范围。
同namespace多个closure只保留一个使用权，不按每次编辑永久积累待办。
队列断连前处理全部已接收资源关闭，最后尝试pending prune后释放pin；
关闭不无限等外部进程锁。正常运行锁解除后会自动重试，不靠用户再次编辑。
现有reader/SQLite占用保护不变，不能删除仍被有效reader固定的库；Windows实际平台仍未验。

- 新受控shutdown+EOF：`ix05-retirement-shutdown-and-eof.log`，2PASS。
- 原force/peer、reader和GC反例：`ix05-retirement-prune-retry-green.log`，11PASS。
- 最终本片Rust冻结 `ix05-retirement-v3-checks.json`：**完整workspace410PASS、0FAIL、1既有ignored**，
  585.58s；正常Native29PASS、实验27PASS、双严格Clippy、release及fmt通过。
  crates源码前后哈希一致。此成绩覆盖本片Rust，不覆盖后续Node或整体IX00–08。

### INPUT-008 / OBS-002：语义成员扫描失败恢复与测试输入隔离

旧W候选的完整checkfast实际结束：2365项，2360PASS/5FAIL/0skip，4049.20s。
receipt `ix03-integrated-approved-checks.json` 的checkfast项及完整log保留；
独立Rust/后续检查继续，不以此宣称全量通过。
两项constructor失败的公开普通固定产物重放在第4轮再现（两个独立bounded系列均如此）：
semanticPreparation报告`project-membership-incomplete`，同时Native已报告5文件ready。
见 `ix03-constructor-probe-raw-4/`、`ix03-constructor-v2-raw-4/`及对应observations。

真实触发线索由独立插桩捕捉，不从时间相关性推断：
`ix03-namespace-exceptions.jsonl`记录5次枚举异常，其中4次有完整路径，全部是
fixture源码树内部`*-cache/workspaces/<key>`在枚举期间发生目录变化；
1次为打开枚举时发生变化，未采具体目录，不补猜。
`workspace-source-enumerator.close → scanProjectMembership → prepareRoot/prepareFromCurrent`
按现有namespace fence正确拒绝完整性；但后续references/anchor准入仅使用缓存partial，
没有复用交互入口已有的可恢复理念，形成输入已稳定后仍失败的独立生命周期缺口。

正式实现：`workspace-membership-admission.prepareCompleteProjectWorkspace`对
`enumeration-error`/`source-unavailable`在新full query里完整重扫一次，再重新捕获/准入；
失败仍拒绝，path-count/path-byte真实容量partial不改、不重扫凑成功。
references和anchor共用；无新source/config mutation、无Worker重建、无旧请求自动重放，
最终源/配置/代次证明照常执行。与0020恢复及0034新鲜度约束一致，不降低0043资格要求。

公开framed LSP用真实目录或源码lstat的EACCES受控失败（Node preload，仅隔离测试）建立RED：
原因修复后仍-32803；Native不受该Node文件系统注入影响。
修订后directory/source × legacy/batched四种情况全部通过，未恢复时仍-32803，
恢复后精确4个引用位置与一个Worker保持。不是强制真实磁盘EACCES/原始缓存竞态的同一证据。
`ix03-membership-retry-red.log`、`ix03-membership-retry-green.log`、`ix03-membership-all-raw/`。

fixture同时把缓存/日志移到workspace外的独立sandbox兄弟目录，保留全部源码/精确Locations、
constructor scope、取消和变更后fence断言，没有忽略目录变化、接受错误或绕过完整性。
插桩候选含恢复后17项通过且记录5次瞬时扫描异常（`ix03-constructor-instrumented-v3.log`）；
普通候选17项通过（`ix03-constructor-new.log`）。两者时延不合并。
相关五文件功能25项通过；同轮metadata manifest快照少更新了bundle总数，保留28/29的阴性，
随后新增入口总数311/bundle160按实际清单修正，最终66项中四项清单合同通过。
早期插桩v1复合语句错误/v2局部变量名错误的日志均保留并标无效，不用于精确归因。

**仍开放**：用户显式把持续写入缓存放入可扫描源码树时，仍可能遇到真实namespace漂移。
本片修复瞬时失败恢复与测试布局，不承诺持续变化的输入可被判为完整；
尚未实现两个扫描器共享的受管缓存排除合同，不把该边界写成已解决。

### INPUT-009：Git ignore规则变更送达Native，和SDK配置分层

旧父端只注册source/package/resource watch，coordinator过滤.gitignore/exclude，
因此规则改变后没有任何新Native input或完整对账；不是SQLite必须全写。
真实Native/LSP组合RED `ix03-ignore-red.log`：等30s仍无configuration资格。

正式增加`catalogRulesChanged`父端标志，保留工作区词法边界、仅重查Native准入规则；
归一为Native configuration不确定性，不传成SDK/configurationChanged或rootDirty给Worker。
仅规则变化不发送语义mutation；混合source/resource事件仍按原顺序完整发送；
Native observer在语义dirty捕获之前，实际full reconcile只提取/写facts差异。
规则只按已注册根归属，不采信工作区外事件，不改变真实文件名/URI身份大小写。
新增动态watch `**/.gitignore`、`**/.git/info/exclude`，声明有公开注册回归。

最终 `ix03-ignore-final-regressions.log`：**66PASS/0FAIL/0skip**，122.49s，
含真实Native128/129组合、根.gitignore及.git/info/exclude忽略/恢复、配置No-op，
受控真实framed LSP端口7种resource/source/mixed/config/rules/mixed-rules/outside输入，
观察仅规则事件不推进语义mutation，其他语义事件未遗漏；真实Native与受控端口证据分别标注。
忽略时只改成员，facts写0；恢复至多写该文件1，未重写整库；同head No-op规则保持。
原watch回归13项先GREEN，提取共享watch fixture后仍GREEN；
`lsp-workspace-file-changes.test.mjs` 660→493，helper183，未机械切产品代码/改变断言。
`ix03-ignore-types.log`、`ix03-ignore-build.log`通过；源码/用例仍未集成进冻结W。

### 旧全检其余三个失败：不凭局部重跑关闭

完整W还出现：off兼容磁盘复用context数5≠6、definition取消未及时落在检查内、
half-open用例初始化1500ms queue-deadline（phase idle）随后未收到预期准备通知。
`ix03-three-late-failure-controls.log`局部仅前者失败；后两项局部通过不能覆盖全检阴性。
新Node/native与W独立检查并行使用宿主，未控制CPU争用，不用这些时延作性能A/B。

context计数已在有限5轮第5轮再现，`ix03-context-count-replay-5.json`：
baseline在disk-type-error步骤沿用了context2，而该轮其余disk/SDK/L3均按原策略重建，
完整Locations及version3错误/version4修复断言通过；reused仍3，baseline5。
另外一次同断言baseline6通过（`ix03-context-count-replay.json`）。
这是已定位到具体步骤的观察，尚未证明是调度合并、诊断预先应用或policy问题；
不把6改5/改范围来获取GREEN，不扩展成无关缓存优化。
其它两个失败的触发调度/宿主因素尚待隔离补证，不默认都为环境问题。
