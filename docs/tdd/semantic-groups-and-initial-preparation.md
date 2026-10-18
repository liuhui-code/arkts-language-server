# ADR 0018：TDD 实施记录

父版本：`a111235bc4bfcb55b126752f95b3ba095f2996af`。
分支：`codex/op00-query-attribution`。Node：20.19.5。
原 dirty workspace 的 1763 个文件保存于 `.bench/sdk-init-groups-v3/baseline.sources.jsonl`；保留无关工作，不提交或推送。

授权：[ADR 0018](../adr/0018-semantic-groups-and-initial-preparation.md)。默认压力 4096MiB，可配置；项目首次初始化不进行压力准入或驱逐，仍观测真实内存。首次准备以后的工作继续遵守运行期压力策略和 500ms 目标。

按顺序实施并记录实际命令/退出码：压力默认与配置、初始化压力豁免与真实准备、SDK 共享、稳定组、延迟释放、增量/全局完整性，最后 focused 与完整 fast。未完成项不写成通过。

## 压力默认和首次初始化

- RED：`node --test --test-name-pattern='runtime pressure defaults' tests/semantic/semantic-coordinator.test.mjs`，`pressure-default-red.log`，exit 1，旧值 1073741824 与要求 4294967296 不同。
- GREEN：修改配置默认为 4096MiB；完整 coordinator 文件 **16/16**、exit 0 (`pressure-default-green.log`)，显式 768MiB 与非法值拒绝均通过。
- RED：`node --test tests/semantic/project-initialization.test.mjs`，`initialization-red.log`，exit 1，初始化后没有自动语义准备通知。
- GREEN：服务端 `initialized` 主动调用真实 readiness，初次准备使用 isolate-local 压力豁免；真实 SDK、52 个标准库和完整两源项目在 1MiB 压力配置下 ready。其后的 status 与显式恢复仍因运行期压力 degraded。`initialization-green.log`、`initialization-extraction-green.log` 均 exit 0。
- 为改变旧超长文件前保留初始化与精确跨文件定义 characterization (`initialization-characterization.log`，2 个选中 PASS)；GREEN 后把索引进度职责提取到 97 行独立模块，主 server 677→596，readiness 所有权提取后 legacy engine 874→869。这两个文件仍是 >500 行迁移债务。

## SDK 声明目录预解析与初始化追赶

- 原生 parser 观察器只记录真实 `createLanguageServiceSourceFile` 调用，不替换解析结果或输入。
- RED：`sdk-catalog-red.log`，exit 1；尚未导入的受支持 SDK API 解析次数 0，要求 1。
- GREEN：兼容声明预解析进同一 Registry 并保留 pin，未使用声明不进入 Program 根集合。`sdk-catalog-green.log` **2/2**、exit 0。
- `sdk-prefetch-use-qualified.log` **2/2**、exit 0：首次实际导入不新增该 API 解析；未通知 SDK 字节变化拒绝旧答案 (`-32803`)，显式 SDK 配置刷新后精确新 Location 与真实重解析通过。探索性的 `sdk-prefetch-use-green.log` 实际 exit 1，不是通过证据；它原本期待未通知 SDK 变化自动恢复，本片只承诺拒绝旧值并验证配置刷新恢复。
- RED：初始化后立即 open/change 会取消旧准备，但旧实现不追赶 (`initialization-catchup-red.log`，exit 1)。按当前输入重新准备后 `initialization-catchup-green.log` **3/3**、exit 0；总初始化耗时包含重试。
- 加入同一真实编辑竞争下的 SDK 预解析断言，再次 RED (`initialization-race-sdk-red.log`，exit 1)。已先运行的诊断不能绕过共享缓存，初始化补齐已存在 Registry 的声明目录。`initialization-race-sdk-green.log` **3/3**、exit 0。
- 首次完整 readiness 两文件资格检查曾为 **18/24 PASS、6 FAIL** (`readiness-qualification.log`，exit 1)。六项原假定初始化不会创建 Worker/Program，或把自动准备和显式准备的观察混算；必须按新启动策略保留它们原来的隔离、取消、重启与完整输入边界，随后保留原有隔离、取消、重启与完整输入边界完成资格修订，`readiness-qualified.log` **27/27**、`initial-join-qualified.log` **37/37**，均 exit 0。


## 首次查询与初始化合流

- fixture 原继承显式关闭 resident fast path 的对照配置，不能作为生产优化证据。修正为 FAST_PATH=1 后，临时关闭 join 的真实控制仍 RED：`initial-query-production-control.log`，exit 1，SDK 在 owner/verifier 两个线程各解析一次。
- 启用可取消、按 root single-flight 的初始化 join 后，`initial-query-production-green.log` **4/4**、exit 0，首次实际引用精确且 SDK 只在 owner 解析一次，无 verifier；查询取消不会取消整个项目初始化。
- 配置变化会使正在进行的初始化追赶当前配置；旧 generation 不发布 ready。

## 稳定组、容量与全局扫描

- RED：`node --test tests/semantic/semantic-group-retention.test.mjs`，`stable-groups-red.log`，exit 1；真实 LSP 定义的 Program 根文件数为 `[6,6,6]`，期望模块加依赖 `[3,4,3]`。
- GREEN：读取项目真实 product/module/target 及传递依赖；复用 store 的 membership 目录结果，无重复预载无关文本。组 ID 在同一 compiler/SDK 配置域中稳定，内容、光标、候选列表不进入 ID；SDK/project 配置改变使所有旧域上下文退役。缺失/不完整图继续完整安全路径，不按文件数猜模块。
- 首次初始化串行预建前两个稳定交互组及完整范围 owner；显式 current/discovery 根配置保持其原有根语义。
- `groups-qualified.log` **43/43**、exit 0，覆盖旧 readiness、完整 LS 生命周期和新模块组。
- 扩展真实 LSP `[A,B,A,C,A,B]`：根文件数 `[3,4,3,3,3,4]`；全局引用精确包含 A/B/共享依赖；扫描及 C 准入不破坏 A，B 按 LRU 重建；普通 overlay 编辑移动定义到正确行且不创建 LS；全部 Programs 只解析一次 SDK。`groups-edits-qualified.log` **1/1**、exit 0。
- 独立扫描槽 RED：`scan-slot-red.log`，exit 1；分离一个串行槽后 `scan-slot-green.log` **17/17**、exit 0。请求结束只释放 lease；容量只替换同池未租用上下文，真实压力共同计数并优先回收扫描槽。
- LRU 压力回收 RED：`lru-pressure-red.log`，exit 1。压力重采样与成本排序解耦后，低于滞回目标就停止驱逐；不再因成本策略关闭而清空所有近期组。旧关闭成本对照同样验证压力重采样，`lru-pressure-green-2.log` **18/18**、exit 0。
- SDK 配置恢复 RED：`owner-recovery-red.log`，exit 1，同一 SDK 再次在独立 verifier 解析。正常预算且兼容 profile 的生产路由，miss 后通过原 owner 正常准备及完整原生查询恢复；未知/不完整结果不发布为完整。`owner-recovery-green.log` **6/6**、exit 0，配置恢复和初始化首次请求均不重复 SDK 解析。压力回退及显式禁用复用的比较路径仍保留隔离安全回退。
- 提取 compiler factory、resident proof lease、workspace view DTO 与 worker document request 职责；保持公开 characterization。当前 type registry 488、proxy 500；DocumentStore 1835→1791、legacy 874→869、server 677→596，后三个仍是 >500 行迁移债务。

## 性能观察与验收状态

`.bench/sdk-init-groups-v3/prepared-reference-probe.mjs` 在原 403 文件形状、真实已安装 SDK 下，分别计时初始化与就绪后完整请求。100 个未查询且未打开文件中的新符号，加 4 个原引用 oracle；每个响应精确比对 Location。查询不预填答案，关闭 trace/私有 parser 观察；运行前后绑定实际 dist 与原公开 transcript 哈希。

首轮 `prepared-403-1.json`（exit 0）：初始化 7255.285ms，104 次完整引用 max 367.612ms、P95 306.828ms，0 次超过 500ms。仅该会话的观察；后续运行时代码已改变，必须重测，并完成本轮完整 fast 才能报告最终验证。旧 v2 的 1872/1872 结果不作为本轮证据。


## 联合回归发现的后台近期性与磁盘增量

- 首次联合检查 `prefast-qualified.log` **57/58**、exit 1：后台诊断更新 B 的 LRU 顺序，A→B→A→C 因而错误驱逐 A。真实并发回归暴露问题，不能只依赖单文件快速重放。
- `background-recency-red.log` exit 1；lease 增加“不晋升近期性”语义，仍保护执行所有权。后台只复用已驻留交互组；冷后台工作使用扫描 owner，不准入并挤掉近期交互组。`background-recency-green.log` **19/19**、exit 0。
- `group-disk-delta-red.log` exit 1：正确位置已更新，但 LS 被保守重建。稳定组启用既有完整 delta 证据保护的增量路径；未知、漏代、删除、reset 等仍重建。资格断言绑定当前模块 prepare 的 `newEntry=false`；独立完整 root 证书可以保守重建，不能用所有上下文创建总数冒充某个 LS 是否复用。
- `prefast-qualified-2.log` **58/58**、exit 0，涵盖新初始化/分组、readiness、生命周期、真实 compiler 取消、完整调用层级与 auto-import。


## 最终构建测量与 fast 环境资格

- `prepared-403-final-1.json`、`prepared-403-final-2.json` 均 exit 0，分别为真实独立服务进程；SDK 与请求 oracle 不变，关闭诊断插桩，producer/配置/包锁/dist/原 transcript 哈希前后相同。每会话 104 次完整响应（其中 100 个新符号未打开），总共 208 次精确 Location 比对，0 次 >500ms。
- 初始化分别 7527.368ms / 7162.235ms；max 433.694ms / 393.416ms；P95 341.495ms / 341.811ms。只证明这个已准备夹具和两次会话，不授予所有编辑/模块/压力恢复矩阵的整体性能资格。
- 第一轮 `pnpm check:fast` (`check-fast-1.log`) 因通用协议场景意外发现本机真实 SDK，自动初始化未完时触及原 5 秒请求期限；连续同因失败后主动中止，非整轮完成结果。没有提高期限，也不记成通过。
- 快速协议测试应显式、可重复地选择仓库 SDK，不依赖开发机安装内容。新增真实子进程环境合同 RED (`test-sdk-red.log`，默认 SDK 实为 undefined)；显式调用方 SDK 优先，真实 SDK 测量/验收仍明确传入实际 SDK。
- 抽取静态协议消息形状职责前，原 `lsp-process.test.mjs` **20/20** characterization、exit 0。通用 transport 固定默认夹具后，原 523 行缩到 487 行。`test-sdk-green.log` **86/86**、exit 0：包含 transport、显式 SDK 覆盖、两种 production CLI 启动与完整调用层级，保留原 5 秒请求期限。
- 第二轮完整 fast 与最终输入保全审计待实际结束后补记。


## 分组根清单的重复计算

- 第二轮完整 fast 运行中，组件探针确认：128 模块/12,800 路径时，连续两次 `select` 约 498.897ms、495.038ms；重复生成全部根清单已几乎用完查询预算。这是合成组件 CPU 观察，不能当成真实 LSP 响应时延。
- 为修复后重新完整检查，主动中止第二轮 (`check-fast-2.log`)，不将中止轮记为整轮通过；该轮未发现新的断言失败。
- RED：`group-plan-cache-red.log`、exit 1，光标/内容变化仍产生新的根清单。用不可变构建图、物理根身份和有序 membership 路径验证纯元数据缓存，不缓存源文本、Symbol 或答案；仅内容 revision 改变不重复划分模块。缓存 key 弱持有构建图，配置清理会退役缓存。
- GREEN：`group-plan-cache-green.log`、exit 0；保留成员删除、target 改变和物理根改变的失效检查。加入未落盘合法 overlay 的公开 LSP characterization，变更前已 GREEN (`group-unsaved-red.log` 实际 exit 0，文件名不代表 RED)，不能冒充缺陷复现。
- `planning-qualified.log` **26/26**、exit 0；`planning-typecheck.log`、`planning-build.log` exit 0。`group-plan-profile.json` 同一新实现首次 446.858ms，之后 0.662/0.467/0.338ms，内容 revision 与路径数组实例更新仍复用；组件数据不能外推到全矩阵 500ms。
- 新源文件仍 <500 行；第三轮完整 fast 使用本次缓存实现，前两次 403 文件真实 SDK 测量需保留为各自输入绑定的数据，最终另行复测当前构建。


## 物理回退与采样资格

- 第三轮 fast 原沙箱运行 (`check-fast-3.log`) 暴露 5 项物理 verifier 占用测试仍使用默认复用路径，初始化后已经没有第二个 Worker；不得因此删除物理占用/RSS/取消恢复断言。将这些隔离回退合同显式设为 FAST_PATH=0，正常共享 owner 仍由新初始化合同覆盖。
- 原“cold root 不存在 owner”两项断言也已过时；`automatic-cold-qualification-red.log` 实际 **1/3**、exit 1。保留两种 resident-first 配置、精确 Locations、单次 dispatch 与完整响应，改为验证 server 初始化先于查询且复用 complete owner，没有新 verifier。
- 同轮产品/采样 CLI 报 `spawn EPERM`，后续 raw RSS 未产出，readiness 因采样未开始而 unobserved。这不是许可删除采样或伪造结果；中止沙箱轮，在可读取进程统计的执行环境重跑完整原命令。


## 自动准备后的重启与真实压力恢复

- `physical-cold-qualified.log` **10/10**、exit 0，显式隔离回退的原物理占用/RSS/取消检查与两种首次查询路由均通过。
- 第四轮在允许真实进程统计的环境运行 (`check-fast-4.log`)，原 `spawn EPERM` 消失；发现并定位旧工具的 `RESTART_FRESH_PROCESS_NOT_UNPREPARED` 防线与自动初始化冲突，未记成整轮通过，修订前中止。
- restart collector 接受严格公开协议验证的初始 READY，仍保留独立新 PID、上一进程已退出、Program UUID 新域、当前 overlay 重放、旧 completion UUID 拒绝、未打开目标和原生 RSS 分段。release validator 独立验证初始 READY 完整证明，并拒绝跨进程重用 initial/semantic/validation/handoff 中任何 Program UUID；新增 borrowed-startup-ready 负例。
- 第四轮 natural-L3 控制的真实初始状态由 runtime 压力阻断，改验 `resource-budget-exceeded`。首次 `restart-auto-qualified.log` **19/20**，随后 `l3-auto-qualified.log` **3/4**：旧恢复工具只认第一条查询之后的驱逐，遗漏自动初始化后已经发生、且此后没有重建的真实空 owner。
- 提取 `prepared-eviction-witness.mjs`：只接受同一真实 PID、当前启动/查询生命周期内的 L3→空上下文见证；任何后续 context create 或 worker start 都使见证失效。没有伪造一次新的 disposal，也没有跳过原生采样或原最小观察时长。`l3-auto-qualified-2.log` **4/4**、exit 0；query suite 497→487 行。
- `owner-pins-qualification-red.log` **0/2**：旧 trim 合同错误地要求 total refs 为零，实际 53 是保留的 SDK/标准库 pins。改验 project leases 必须为零、non-SDK refs 只能是标准库、total 必须精确等于 SDK+标准库 pins；`owner-pins-qualified.log` **2/2**、exit 0。
- `queue-auto-qualification.log` **1/2**：旧普通查询 trace 也硬编码 unprepared；保留 trace off/on 全 payload/最新诊断/队列边界，改验当前已初始化 owner 的 ready 证书及不新增 LS。
- 汇总 `restart-pressure-qualified-final.log` **22/22**、exit 0，包含所有上述真实子进程与 CLI 正负例。第五轮完整 fast 使用这些最终合同；源码冻结，不把前四个中止轮称为通过。


## 合入主分支前的回归修复

- 第五轮完整 `pnpm check:fast` 实际 exit 1：1885 项中 1794 通过、91 失败（`check-fast-5.log`）。这不是合并通过证据。父版本仍为 `a111235bc4bfcb55b126752f95b3ba095f2996af`。
- 真实回归一：未配置完整模块图时，交互准备提前求值成员目录，别名的 lexical paths 污染共享目录。将成员快照改成按需求值，只在真实完整分组图可用时扫描。公开 worker 别名/编辑/取消恢复合同 `alias-membership-green.log` 通过。
- 真实回归二：共享 owner 的恢复覆盖了已有 owner 的有效性失败，抢在完整安全回退之前再次使用旧状态。只允许没有完整范围 owner 时恢复；已有 owner 的 miss 继续走原回退。`warm-fallback-qualified.log` 29/38，原 package/SDK/type 输入失败已恢复；余项继续逐一修复，不把此轮称为全绿。
- 真实回归三：新声明源目录出现后，重建完整范围 owner 仍携带失效项目配置。重建根 owner 时验证配置；失效或不可证明则重载，创建同配置模块组不重置其他组的配置见证。原 named-target 公开引用 RED 在 `merge-bounded-4.log` 已通过。
- 真实回归四：运行时 RSS 重采样仍受旧成本排序开关控制。移除该关联；LRU/成本观测开关不再决定是否读取真实压力。`merge-state-diagnostics.log` 中原容量/L3/别名案例均通过，唯一剩余失败是随后修订的诊断采样时序。
- 原分批、anchor、取消、调度和 verifier 物理占用实验显式关闭 resident fast path，普通生产 LSP 测试保持默认。需要部分/冷状态的实验先等待真实自动准备完成，再通过公开 L3 控制释放 owner；没有新增跳过产品初始化的后门。最初辅助函数误发不支持的 level0 控制导致两轮定向失败（`merge-regressions-2/3.log`），已删除该错误请求。
- 驱逐恢复合同检查 proof-only miss 必须先于真实 replacement context create，创建前不能有 resident hit，随后必须有完整 compiler references；保留真实驱逐与两种声明策略的精确 Location 集合。不能把后续新 owner 的合法命中误认成复用已驱逐对象。
- SDK profile 比较先等待本次 didOpen 的公开诊断完成，再启动 definition/completion/references，并仅观察该诊断阶段。无通知磁盘编辑必须拒绝旧索引身份，保留完整 membership 回退和精确新位置。`merge-recovery-6.log` 选中的 8 项全部通过（86 个登记项，其余因 name pattern 未执行）。
- Rust：`cargo test -p arkts-index-sqlite` exit 0，19 个测试可执行项共 72 项通过；`cargo build --release -p arkts-index-sidecar` exit 0，见 `merge-rust-tests.log` 和 `merge-rust-release.log`。
- 合入前继续运行无 name filter 的回归与新的完整 fast；此前中止或失败轮次不能替代最终结果。

- 最后一组不使用 name filter 的输入/成员/驻留/LRU/压力/别名公开回归 `merge-focused-final-7.log` **42/42**、exit 0；类型检查 `merge-typecheck-final.log`、`cargo fmt --all --check`、`cargo clippy --locked --workspace --all-targets -- -D warnings` 全部 exit 0。此前 `merge-final-focused.log` 的 9 项失败均有上述后续合同及 `merge-recovery-6.log` 覆盖，不借用失败轮次作最终证据。


## PR #96 的本地完整检查与 Linux 差异

- 提交 `70baf45c44c92e06ac390a15def80af87372469d` 的第六轮完整 `pnpm check:fast` **1885/1885**、exit 0（`check-fast-6.log`）。运行期产品源码、脚本、配置、Rust 与原始引用完整性 oracle 的 hash 全程未变；两处测试 fixture 在其测试执行后增加可选大小写复现，差异列于 `whole-6.end-audit.json`。该结果只归属于本轮源码，不替代下面新增 Linux 修复的验证。
- 首次 Linux release CI [39142722562](https://github.com/liuhui-code/arkts-language-server/actions/runs/39142722562) 因 30 分钟 job 上限取消，同时已暴露实际回归，不能归类为全部通过。Windows 安装 CI 通过。
- Linux SDK 解析计数 RED：预解析使用 `ts.sys` 的操作系统大小写规则，实际 LanguageService host 省略该方法时按不区分大小写生成 registry path，导致 cache key 不同。新公开 framed-stdio fixture 在 Mac 强制 compiler 的 case-sensitive system probe，复现 **2 次解析而非 1 次**；`linux-sdk-canonical-red.log` exit 1。预解析改从实际 acquisition host 读取规则，保持与同一 LS 一致；独立工作区 6/6 通过，第一次 Linux 定向 CI 的 6 项初始化用例也全部通过。
- CI 下载的 `.fixtures/nim-uikit-harmony` 是嵌套 Git 仓库，默认源归档将其目录当作文件读取，产生 EISDIR，并连带使多项证据用例无法启动。将下载夹具缓存加入 ignore；原生 producer/source archive 仍完整记录仓库执行源，夹具继续使用独立 pins。新增公开 collector RED 与 24/24 GREEN；隔离工作区的 node_modules/target 临时 symlink 用独立 Git excludes 排除，不改变产品验证。
- 合成 Darwin RSS consumer 用例重新调用 `preparedMemory()` 时被宿主 Linux 平台覆盖，修正合成 fixture 的平台标签；真实 RSS 采样不改写平台。
- 第一次 Linux 定向 CI [39145860059](https://github.com/liuhui-code/arkts-language-server/actions/runs/39145860059) 仍发现 `stat` 活进程 → `status` 退出进程无 VmRSS 的真实竞态。新增公开 probe 注入文件系统合同，root/child 退出与 PID 复用为 RED，仍存活但缺失 VmRSS 必须拒绝。parse 失败时仅做一次身份/退出状态复查；只对证实已退出的进程返回 not-found/跳过，不能补零 RSS。22/22 GREEN。
- 两次 Linux 执行均停在构造函数合同之后、162091 字符的单条 OP03A 诊断输出之前；改成查询/Location/事件数量摘要，保留所有原始完整结果与路由断言，并使用独立 Linux 分支复查。临时诊断 workflow 不合入产品 PR。
- 新增 probe 条目先让 manifest audit RED，再登记到 unit-contract；完整登记为 223 个入口。修复集在主工作区的类型检查与 **85/85** 不使用 name filter 的定向回归通过（`merge-linux-fixes-focused.log`）。最终 Linux 完整结果及当前提交 403 文件真实 SDK 复测结果以 [PR #96](https://github.com/liuhui-code/arkts-language-server/pull/96) 的验证记录为准。

- 第二次真实 Linux 定向执行 [39146890436](https://github.com/liuhui-code/arkts-language-server/actions/runs/39146890436) **SUCCESS**，SDK/归档/真实 RSS/重启/中断/全部 anchor 合同通过；固定代码下仅收缩该诊断输出即越过原停滞点。Linux 控制分支仍独立，产品 PR 的完整 release driver 与原 job 上限均保持原配置，随后在最终提交上重跑。
