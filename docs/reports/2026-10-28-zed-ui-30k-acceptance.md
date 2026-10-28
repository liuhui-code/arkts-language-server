# 30K真实Zed UI验收：权限前置阻挡，尚未开始

日期：2026-10-28。**当前状态BLOCKED：隔离副本和候选部署已准备，真实UI操作0次、UI执行时长0秒。**
没有用此前7204.609秒协议测试抵作UI时间，也没有用协议请求替代点击。
测试窗口未启动，不能声称候选已在Zed加载或UI验收通过。

后续用户明确授权：若UI仍阻塞，先将已验证候选及必要文档经正常分支/PR流程合回main并推送，
无需继续等待UI权限。本次合并前复核AX/screen仍false（06:06:22Z），因此进入该授权的合并路径；
**合并授权不改变本文UI0次/0秒及全部场景未执行的结论**，也不清除SDK超时或完整范围缺口。

证据根 **B=`.bench/zed-ui-30k-candidate11-20261028`**；进度`B/progress.json`，
逐项待执行矩阵`B/scenario-matrix.json`。本轮没有产品修复、合并或发布。

## 1. 权限和可用控制方式

| 实际检查 | 结果与证据 |
| --- | --- |
| 电脑控制工具表面清单 | `apps=[]`，仅Codex In-app Browser；没有原生Zed控制入口 |
| macOS `AXIsProcessTrusted()` | false |
| macOS `CGPreflightScreenCaptureAccess()` | false |
| System Events `UI elements enabled` | false |
| 只读查询Zed窗口名 | exit1，系统明确返回“osascript不允许辅助访问”`-1728` |
| 排除文件系统沙箱影响的同一只读复核 | 03:46:04–03:46:05Z，AX/screen仍false，窗口读取仍`-1728`；无按键/点击或TCC改动 |

原始证据：`evidence/ui-permissions-before.json`、`ui-permissions-recheck.json`、`ui-permissions-unsandboxed.json`。
中间沙箱内复核还返回过Apple Event `-10827`，也如实保留；不能把该控制环境错误算作语言服务器错误。
未改TCC数据库、未关闭保护、未用其他输入接口绕过授权；未截取未授权画面。

需要用户在macOS中开启：

1. **系统设置 → 隐私与安全性 → 辅助功能**：允许实际执行本会话控制命令的程序。
   系统报错中的调用方是`osascript`；实测宿主进程路径为
   `/Users/liuhui/.codex/packages/app-server-daemon/releases/0.164.0-x86_64-apple-darwin/bin/codex`。
   请核对系统列出的对应请求项，而不是只给Zed本身授权；具体列表显示名不能仅从进程树断言。
2. **系统设置 → 隐私与安全性 → 屏幕与系统录音/屏幕录制**：允许对应控制程序读取屏幕，供画面核验和证据保存。
3. 若“自动化”页列出该控制程序，请允许其控制System Events。当前已确认的拒绝是辅助访问；未将自动化权限另猜成已确认缺陷。

权限必须由用户开启，见[Apple辅助功能设置](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)、
[屏幕录制设置](https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac)。
已发送权限协作请求；开启后仍需重新实际检查，不能以等待一段时间代替授权或控制验证。

## 2. 现有安装与候选身份

工作分支`fix/partial-program-lifecycle-20261026`，父HEAD`17e923f0cb8c430b6a10793a0f3d2f9097febfec`，
候选包含未提交修复及保留的既有工作；HEAD本身不是最终candidate11全部修改的提交身份。
775份源/测试/脚本/配置输入与87份冻结运行产物逐项核对一致，见`evidence/candidate-preflight.json`。

| 身份层 | 实际记录 |
| --- | --- |
| 本机Zed CLI版本 | `Zed 1.25.3 – /Applications/Zed.app`；CLI帮助原文另存 |
| 现有Zed进程 | PID91860，2026-10-27 07:55:30本地时间启动；只读观察，未重启/退出 |
| 现有LSP/原生索引 | Node92778的父PID为91860；native92783的父PID为92778，均为默认旧安装，不是本次候选 |
| 默认扩展 | ArkTS `0.1.0-local-beta.1`，release目录`eb601694…a18474b7`；WASM SHA256`3776f76d011d2e3b2fafc5df67a6361558704107d51c9bbfa284b4889a5da774` |
| 默认launcher | `~/Library/Application Support/Zed/extensions/work/arkts/bin/arkts-language-server`，marker v1；SHA256`2dfc4917100d959744587f2aeacfad8a345c217615e0dc7cfd7e5599c28834d8` |
| 默认launcher目标 | `~/.local/libexec/arkts-language-server/0.1.0-local-beta.1-f672888291183081cc957e9d291bb3c372ee8f91f582ec8211e4128eb34dc400/bin/arkts-language-server` |
| 默认server磁盘SHA256 | `118d7575dfbb6cbd65ae87037e64a95fee03fad9d69d759cd785684643270b81`，匹配现有LSP命令路径 |
| 默认Worker磁盘SHA256 | `d600e3c40ac2acdeab70c8521b87ba6c80af75c39aad492aab57fe1531595462`；未附加旧进程，不能仅凭磁盘哈希证明已加载的线程字节 |
| candidate11 server SHA256 | `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665` |
| candidate11 Worker SHA256 | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` |
| 候选原生索引SHA256 | `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`，复制已有验证二进制，未改Rust |
| 候选Node | 固定本机v26.3.0的PATH，不加V8/内存/超时参数 |
| SDK磁盘身份 | API24/component6.1.1.125，44894文件与此前验证快照零差异；仅磁盘身份，不证明API完整或已被新Zed选择 |
| **测试实际启动server/Worker** | **未启动，PID/世代/已加载身份未测**；不能将staged哈希写成已在Zed加载的验证 |

完整manifest、launcher正文/路径/哈希见`evidence/default-installation-before.json`、`deployment-staged.json`。
SDK逐文件复核见`evidence/sdk-preflight.json`。
运行期Worker是Node内线程，后续不能把线程重复计为独立进程RSS，也不能只凭`ps`计数断言线程数。

## 3. 隔离部署及回退

- 原项目`/Users/liuhui/Documents/code/applications_photos_30k`只读；全新副本为`B/project`。
  13900ETS＋16100TS=30000项目源码、30287原文件，与此前协议测试输入和当前原项目字节一致；无symlink。
- 只在副本增加`.zed/settings.json`（因此多一份测试配置，源码数仍30000）。配置指定候选launcher和原SDK路径，
  将ETS/TS均关联ArkTS及指定LSP，防止M004的TS文件误测Zed内置TypeScript服务；该配置仍需UI加载验证。
- 测试用户数据目录`B/zed-user-data`；扩展已复制到该profile，launcher指向`B/local/libexec/...`中的候选副本。
  复制既有冻结dist/config、原生索引和现有扩展/grammar，不重新构建/改写已验证产物，不触碰默认扩展软链或launcher。
- launcher shell语法、marker解码、`--print-log-path`检查通过，日志指向`B/logs/server.log`。
  这是**非语义CLI预检**，没有LSP初始化/Worker/功能请求，不算任何UI或语义功能通过。
- 只配置产品现有队列trace及Worker metrics路径，无compiler改写、协议注入、强制GC、堆/超时开关。
  PATH固定Node26.3；已检查继承的相关内存/超时/驻留实验覆盖为空，见`launcher-sanity.json`。

Zed本机`--help`已确认`--user-data-dir`和`--new`；启动命令保存在`B/launch-command.txt`，**尚未执行**。
在权限可用后创建独立测试实例/窗口，核对实际PID、项目根、LSP父子关系与候选产物；
通过命令面板`editor: restart language server`仅重启测试文件所属服务（若需要），并记录此明确的setup重启。
依据[Zed配置文档](https://zed.dev/docs/configuring-languages)、[官方重启命令](https://zed.dev/docs/troubleshooting)。
Context7 resolve传输失败，未成功query-docs；失败与官方回退见`evidence/research.json`。

回退不需要改回默认安装：测试前后它均保持原样。仅关闭经过PID/项目根核验的测试窗口/实例，保留本次证据；
不得按名称杀全部Zed/Node，不得退出现有PID91860或丢弃其未保存内容。

## 4. UI场景及原212/255回归

下表均是待执行计划，**实际状态全部NOT_RUN、实际UI次数0**；原协议前缀只用作复现依据。

| 场景 | 待执行的真实操作与检查 |
| --- | --- |
| 隔离启动与服务重启 | 界面确认扩展、工作语言、项目根和信任；必要时UI重启LSP后验证实际候选身份 |
| 打开/跨模块/跳转/返回 | Picker、AlbumSelect、AlbumDataImpl及不同模块；定义的可见目标文件、声明和光标必须正确 |
| 引用 | 界面发起查引用；保留错误/结果，完整30K不可用不记成功；之后独立验证局部跳转 |
| 补全与详情 | 逐字输入真实成员前缀、选择详情，背景诊断混合；记录列表和详情可见响应，不靠RPC-ok代替正确性 |
| 编辑/保存/撤销重做 | 连续输入及短语法错误、保存和多次撤销；随后立即跳转，检查未保存权威及当前诊断 |
| **M004原212保存后跳转** | AlbumSetPageActionBar.ets编辑/撤销、追加`\n// persisted unsaved soak 211\n`并UI保存，再开AlbumDataImpl.ts查genAlbumsInfo；记录实际版本与前置warm状态 |
| **M005原255关闭返回磁盘** | 先从Picker跳ScreenManager.getInstance建立依赖，打开ScreenManager.ts加overlay；外部磁盘变化/恢复单列夹具事件；UI撤销、关闭，再跳转和重复 |
| 关闭重开/多标签 | 热点与不同模块交错，界面开关/重开，检查最新文本、延迟和Worker生命周期 |
| 移动恢复/删目录 | 项目树移动ThirdSelectConstants.ts至utils/soak_moved，界面改import并跳转；恢复文件/import、实际删空目录再重复 |
| 取消/前后台交错 | 导航或引用期间Esc、换目标、关结果/继续输入；实际出现`$/cancelRequest`才计取消覆盖，未发则未覆盖，不注入协议 |
| 空闲后恢复/持续混合 | 自然忙闲、跨模块/编辑/补全/开关/文件系统混合；记录真实次数/时间，不新设硬性UI时长门槛，不主动重启掩盖累计问题 |

M004基准查询零基71:13，原声明108:16–108:29；M005基准查询Picker零基53:20，
原ScreenManager声明81:9–81:20。编辑后的正确位置须按实际当前文本核验，不能固定旧行号判通过。
源文本计算的预期位置（未调用LSP）在`planned-target-positions.json`。
原动作211/212和255原始操作/请求已提取为`original-candidate6-action212.json`、`original-candidate10-action255.json`；
这些包含事故清理时的close，应与触发错误前的正常关闭分开，不能机械把所有close当原因。
即使后续最小UI场景通过，也须说明是否真正达到fallback/overlay/disk前置状态；不能冒称完整254动作历史已重放。

## 5. 计时、资源与本次结果

沿用[500ms体验目标](../benchmarks/interactive-latency-assessment.md)：看典型体验、分布、频率和持续影响，
不因偶发超过目标自动判功能失败/阻塞交付，不新增替代硬数值。严重慢响应、超时、错误与不可用仍如实保留。
UI计时应从实际输入动作到正确可见响应，RPC耗时另报；计划、准备/CLI/原协议测试均不计UI时长。

后续需要同时记录Zed PID、Node PID（含Worker线程）、Worker heap和原生索引，Node RSS只计一次、tree RSS非PSS。
记录实际进度终态、自动恢复/退役原因、队列与请求版本、可观测CPU/FD及空闲资源趋势；未测的阶段不猜测归因。
仅豁免测试Node RSS2048MiB提前停止；产品4GiB、V8、超时、正确性和native5120/tree6144MiB、
系统free15%、磁盘1024MiB、45s有请求无响应等既有保护口径不变。**测试未启动，采样与保护尚未实际运行。**
预检系统free63%、可用磁盘约70495MiB；这不是候选运行期资源表现。

| 结论层 | 本次实际结果 |
| --- | --- |
| 通过的准备检查 | 原/隔离30K字节一致、候选775/87身份一致、staged server/Worker哈希正确、grammar哈希、launcher语法和独立日志路径 |
| 控制环境失败/阻挡 | AX和屏幕读取未授权，窗口访问被拒；不是新增产品功能失败 |
| 实际UI动作/时长/成功率 | **0次 / 0秒 / 未测**，没有UI起止时间或可见响应证据，不能填100% |
| 最新候选UI中的错误/时延/资源/恢复/索引终态 | **全部未测**，未启动测试Zed/LSP；不能报“0错误、无OOM、进度结束”作为验收结果 |
| 原212/255及其他UI场景 | **全部未覆盖**，不以先前协议通过替代 |
| 完整30K引用/重命名 | 既有范围缺口保留；本轮UI未测，不计成功 |
| SDK超时 | 既有真实SDK层11pass/2原180秒控制取消保留；不是本轮UI实测，不由500ms软目标豁免 |

下一步是用户开启上述系统权限后复核真实控制/画面读取，再启动独立测试窗口和资源采集，执行场景矩阵。
当前只可报告“部署就绪、UI验收被权限阻挡”；原两小时协议报告及其原始失败记录继续保留。
