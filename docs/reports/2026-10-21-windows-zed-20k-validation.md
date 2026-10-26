# Windows Zed 2 万源码压测：2026-10-21–22

当前 main **未达到 500ms 目标**。真实 Zed 的三轮正常数字编辑后首次引用为
20312.838 / 19378.408 / 19676.517ms，中位数 **19676.517ms**；重复结果查询
中位数20.864ms。七个分散文件首次补全为12.327–21.857s。
同一 Windows 构建的独立串行协议对照，2 万文件重命名中位8698.600ms、
应用重命名后的首次引用8986.648ms。两种客户端、编辑和并发请求状态不同，不能混池。

Zed 重命名功能因能力协商没有启用；原生索引因 Windows 盘符身份比较失败没有打开。
所有 semantic preparation 为 degraded。结果正确性、客户端功能可用性和性能验收分开记录。
本轮没有改产品代码、没有推送或发布版本，也没有重做已被用户跳过的455文件冷目录3秒门槛。

## 环境与真实输入

- LS：`e35459131366a32c48c10d1d74adef74357cd3dc`，1850项源码输入逐项SHA核对。
  Windows本机离线安装固定依赖并重建JS runtime和Rust release侧车。
- Windows10 10.0.19045；i5-7300HQ @2.50GHz，4逻辑处理器，约16GiB。
  Node20.19.5、pnpm8.15.9、Rust1.95.0；`ohos-typescript@4.9.5-r10`。
- Zed1.24.2，`fb69067729cb16a7f6135e2c1600c26a28c59659`，真实桌面会话1。
  使用新profile及本地开发扩展junction；固定扩展版本，未改用户默认profile。
  扩展/grammar使用已有可移植Wasm，本轮未在Windows重编Wasm，归档保留其字节与SHA。
- SDK：API24 /6.1.1.125 declarations-only。Windows1674文件前后SHA不变；与旧Mac
  1670项共同文件逐项一致，额外4项仅NOTICE/DECLARATIONS-ONLY文本。
  可识别SDK不等于项目READY：Blocker.ts保留缺失
  `@ohos.filemanagement.userFileManager`，2307，未伪造stub。
- 默认优化配置：1个semantic Worker，4096MiB压力预算，初始化豁免；无额外堆上限或强制GC。
  SDK路径、侧车位置和测试缓存/日志目录显式配置；没有性能调参开关。
- 专用目录：`D:\code\arkts-zed-20k-e354591-20261021`。
  真实Photos保持干净，旧LS checkout原有6项修改保留，未同步覆盖它们。

| 夹具口径 | 2048 | 20000 |
|---|---:|---:|
| 项目源码 / 含配置总文件 | 2048 /2053 | 20000 /20005 |
| 项目源码字节 | 73842 | 504690 |
| app模块 / 无app import的noise源码 | 19 /2029 | 19 /19981 |
| Target传递闭包（含自身） | 18 | 18 |
| 相对import边 / 最大扇出 / 最深边数 | 17 /1 /17 | 17 /1 /17 |
| Target字节 / 目标引用数 | 314 /4 | 314 /4 |

这不是把真实Photos复制成2万文件。它沿用旧规模夹具，多数新增文件仅为
`export const filler = 0`，不能代表真实2万大文件、深依赖、复杂ArkTS工程。
源码为.ts，Zed通过独立profile的file_types关联到ArkTS扩展。

## 计时、顺序及有效性

协议对照每轮新LS、新应用/index缓存，未清OS页缓存。计时为本机
`performance.now()`请求发送前至完整Content-Length响应解析完成，排除SSH往返。
初始化单独统计initialize发起至preparation终态，不把initialize RPC返回当成READY。
顺序为未打开补全/重复/定义→打开补全/重复/定义→两次真didClose/didOpen及补全/定义
→rename value→probe→应用四处WorkspaceEdit并发送didChange→首次references→重复。
目标`app/src/main/ets/Target.ts`；补全(3,42)，定义/rename/references(3,40)，零起始UTF-16。
rename RPC已完成才应用编辑，首次引用计时不重复包含rename RPC。

2048三轮1/2/3，20000正式汇总取2/3/4，均串行。首次20000场与早期Zed证据封存有资源
干扰重叠，原始13项全部保留，另补第4场；不拿受干扰场作为纯计时资格。
普通正式78项有14项>500ms；包含保留场、Program和memory诊断，共9场117项选定oracle均正确，
所有协议场次LS正常退出且夹具/runtime哈希不变。功能正确不等于性能通过。

Zed计时来自透明stdio relay收到实际请求帧至收到完整响应帧，不是键盘到像素绘制时延。
它会额外自动请求高亮、codeAction、resolve等；没有人为改成单请求的编辑器环境。
普通协议、插桩诊断、Zed数据分开。初始化watchdog180s、单请求120s仅用于留取失败证据。

## 正常文本的真实Zed结果

第6场profile在2万文件下完成，冷进程准备为 **82393.132ms**，degraded。
实际将字段初值1→2→3→4，每次完整重放didChange后，与预期全文逐字节比对才发引用。
三次均为正常ASCII源码；查询仍是value、(3,40)，每次返回预期4处引用。
数字编辑计时与引用RPC独立，引用时长可以包含尚未完成的编辑应用和自动请求排队。
内部各段尚未插桩，不将其19–20秒推测分摊。

| 操作 | N | 中位ms | 最大ms |
|---|---:|---:|---:|
| 热态成员补全 | 3 | 251.538 | 263.243 |
| 热态定义 | 3 | 242.204 | 732.346 |
| 页签关闭重开补全 | 3 | 243.662 | 255.628 |
| 数字编辑后首次引用（MISS） | 3 | 19676.517 | 20312.838 |
| 同文档版本重复引用（HIT） | 3 | 20.864 | 23.950 |

上述15次所选结果oracle正确，4次>500ms；定义也有732.346ms慢样本。
页签关闭重开期间，Target的**实际didClose次数为0**：引用结果视图仍持有文档。
因此该行只是前台页签重开，不能冒充真正文档关闭后冷重建。真正didClose对照见下一表。
结果缓存HIT与Program/AST复用不是同一口径；原始日志留有MISS→STORE→HIT事件。

第5场另测7个固定分散目标；每个只测一次，不能作为每文件多轮中位数：

| noise/src/main/ets 下目标 | 位置 | 首次补全ms |
|---|---|---:|
| F0017.ts | (1,0) | 12831.207 |
| F0192.ts | (1,0) | 21780.975 |
| F1024.ts | (1,0) | 12327.068 |
| F4096.ts | (1,0) | 21807.377 |
| F8192.ts | (1,0) | 21856.745 |
| F16384.ts | (1,0) | 21555.507 |
| F19980.ts | (1,0) | 21762.250 |

七次均返回128项、包含当前文件filler，isIncomplete=true；没有接受编辑或逐项穷举补全集合。
这些noise文件未编辑，但第5场app Target已含下述IME异常输入；因此这是该实际状态的记录，
不是干净工作区的随机补全验收。第6场正常数字编辑与此状态完全分开。

## Windows独立串行协议对照

单位ms，三轮中位/最大；初始化2048为19642.789 /
19767.190，20000为
64933.849 /65521.932。

| 顺序 / 操作 | 2048 med / max ms | 20000 med / max ms |
|---|---:|---:|---:|
| 1 disk-first-completion | 176.071 / 180.888 | 283.918 / 289.533 |
| 2 disk-repeat-completion | 103.612 / 107.940 | 211.724 / 222.842 |
| 3 disk-definition | 109.740 / 115.898 | 214.793 / 216.164 |
| 4 open-first-completion | 109.599 / 110.349 | 219.192 / 228.237 |
| 5 open-repeat-completion | 182.385 / 185.669 | 416.683 / 760.924 |
| 6 open-definition | 96.436 / 99.204 | 207.533 / 212.185 |
| 7 reopen-completion | 294.932 / 295.827 | 416.223 / 418.621 |
| 8 reopen-definition | 170.051 / 173.347 | 409.901 / 411.004 |
| 9 reopen-completion | 277.656 / 279.739 | 406.655 / 682.582 |
| 10 reopen-definition | 172.101 / 178.452 | 404.947 / 412.252 |
| 11 rename | 1372.514 / 1382.352 | 8698.600 / 8859.626 |
| 12 renamed-references-first | 1219.608 / 1242.817 | 8986.648 / 9316.114 |
| 13 renamed-references-repeat | 9.981 / 10.556 | 7.989 / 15.102 |

2万普通第一场未删除：rename8509.119、首次引用8986.976ms，并有578.163ms首次打开补全。
正式2万第4场也保留682.582ms第二次真重开补全，未筛选掉慢样本。
本夹具N增加9.77倍，初始化约3.31倍、rename约6.34倍、编辑后引用约7.37倍；
依赖闭包与引用数不变。只取两个N端点，不据此宣称O(N)、O(N²)等复杂度。

## 实际Program和内部可测范围

独立Program诊断观察真实官方createProgram返回，共7次：初始化app19、noise19981、
全局20000；两次文档真重开各app19；rename及编辑后首次引用各全局20000。
每个Program实际含255 SDK文件、113个其他库文件；全局总SourceFile为20368。
补全组19与全局搜索20000不能混为有效依赖数。统计是Program输入/构建数，不是解析次数。

诊断场rename RPC9247.826ms，其中createProgram4495.734ms；首次引用10105.717ms，
其中createProgram4508.234ms。后者是含Host回调的嵌套墙钟区间，不能与RPC相加，
也不能把插桩占比套到普通8987ms或Zed19677ms。
排队、磁盘读取次数、SDK解析次数、候选数、验证批次及其它独占阶段本轮**未测**。

与旧Mac不作同条件性能收益比较：OS/硬件不同，Mac其他库52而本轮113，尚未逐文件溯源。
共同SDK声明字节一致也不能抵消这个Program输入差异。Windows内2048/20000的库输入保持固定。

## 内存与CPU口径

每个唯一PID统计Windows WorkingSet64，另存PrivateMemorySize64及累计CPU秒；每轮标称500ms
采样，实际有CIM开销并保存采样起止。LS和Worker是同一Node进程，线程共享页只计一次。
本轮侧车初始化失败退出，没有持续驻留的原生索引进程；未捕获其短暂启动峰值，记为**未测**，
不是0。下表不能当作完整索引正常启用后的整棵产品树上限。

| 普通三轮指标 | 2048中位/最大 | 20000中位/最大 |
|---|---:|---:|
| LS含Worker采样Working Set峰值MiB | 665.19 /669.34 | 1205.02 /1363.12 |
| LS累计CPU秒的末次采样 | 26.875 /27.141 | 91.219 /92.000 |

CPU是进程全部线程累计，不是每次RPC独占CPU，也不是4核归一化利用率。
另1场独立trace/heap内存诊断，不混入普通时延：准备后空闲末值991.95MiB，rename期间
1339.18MiB、约1s后1339.57MiB，首次引用期间1457.83MiB、约1s后1482.11MiB，
最后2s空闲末值610.31MiB。单场、采样下界，不推断长期泄漏或峰值精确边界。
短至几毫秒的重复查询没有完整期间样本时保持未测，不能用完成后样本补造期间峰值。
Zed第5场request.completed事件边界根RSS最大2569.38MiB，不是连续采样峰值，
不与上表合并。未观察到OOM或6GiB采样保护触发。

## 错误、失败与定位证据

1. **原生索引身份失败。** catalog terminal为degraded，discoveredFiles=0、indexedFiles=0。
   独立公开NDJSON initialize用11.777ms成功返回小写`file:///d:/...`，Node realpath为`D:`；
   strictEquivalent=false、path.relative为空。当前
   `src/index/workspace-uri-identity.ts:isEquivalentWorkspaceIdentity`做大小写敏感的path.resolve
   字符串比较，native身份因此不被接受。与语义SDK降级是不同问题；未测修复后的性能收益。
2. **Zed重命名不可用。** 原始initialize里documentChanges和prepareSupport=true，
   但workspaceEdit.failureHandling缺失。`register-semantic-capabilities.ts:594`的
   supportsTransactionalRename只接受transactional/textOnlyTransactional，结果没有renameProvider。
   因此Zed没有发rename/prepareRename请求，不能把驱动等待120s当成服务器rename超时。
   协议客户端直接调用成功与Zed功能不可用可以同时成立，不能用其8699ms冒充UI重命名。
3. **SDK/project degraded。** 首个阻断2307如上，全部实验未取得READY资格。
4. **IME异常输入。** 第5场原意输入注释，实际Target行末变成` 、、 、、`，
   未提交的字母组合被Esc取消；源快照与didChange已留存。
   该场两次异常编辑后引用23292.809/21517.811ms，正确返回4处，但不是正常注释编辑。
   第6场使用已逐字节验证的数字编辑独立补齐，没有把这两项混入正常编辑中位数。
5. **resolve错误与取消。** 第5场340条RPC响应中155条completionItem/resolve返回
   -32602 `Completion item is unknown or stale`，最长972.060ms；另38条为客户端取消-32800。
   离线协议重放显示：133条resolve发送前其文件已关闭、13条客户端版本已变、9条发送时
   客户端版本未变。后9条服务端处理时的状态及淘汰原因未插桩，不能一概断言为产品bug。
   第6场22条错误均为自动高亮/codeAction被客户端取消，没有上述stale resolve错误。
6. **初始化等待/编辑器后台。** 最终正常场自动语义请求与约82s初始化重叠；第5场
   codeAction最长82471ms、高亮82140ms。不能把重叠请求时长相加成CPU或初始化分项。
   第5场Zed自身记录4条后台hang，最长332.786ms；不是LSP阶段计时或像素卡顿证明。
7. **准备工具失败保留。** 源码tar文件名不一致、ScheduledTask账号名映射失败（后改SID）、
   Restricted Mode、扩展被市场自动更新、日志共享冲突、内存求和/PowerShell元数据序列化、
   光标未定位、脚本执行策略及活跃日志tar读取失败均有原始日志。错误工具场次未混入普通时延。
   已改用本地junction、测试进程焦点守卫和完整文档输入核验。没有修改系统持久执行策略。

## 证据、复现及后续范围

本地完整封存：`.bench/windows-zed-20k-20261021/`；Windows同名专用checkout的bench目录。
原始数据不推送，报告不包含Photos源码。

- `ui-evidence-sealed/zed-6/`：正常数字编辑、core操作、完整wire、Zed日志及测试窗口截图；
  `zed-5/`为随机补全与IME异常场次，`zed-1..4/`保留准备/工具失败。
- `baseline-evidence-complete/runs/`：9场117项请求、完整响应、文档编辑/快照、逐PID内存、
  真实Program返回；`native-identity-probe.json`是公开接口复现。
- `analysis/operations.csv`、`analysis/zed-operations.csv`、`analysis/zed-clean-summary.json`：
  逐次耗时、路径、符号、位置及统计；原始输入状态以wire和document-events为准。
- `REPRODUCE.md`、`session.mjs`、`drive-zed-edit.mjs`、`drive-zed-core.mjs`、
  `drive-zed-basic5.mjs`、`zed-desktop.ps1`及生成/分析脚本可复现。
- 两类最终archive逐文件SHA核验：UI118项，协议163项；最终源码1850项与SDK1674项另核验。

优先级：先解决Windows索引身份与Zed能力协商这两项功能限制；对随机补全12–22s和
正常编辑后引用19–20s补测队列、输入验证、Program更新及自动请求竞争的独占阶段。
现有证据只能确认慢请求与全局Program范围，尚不能把全部时延归因于SDK重解析、磁盘读取
或分批验证。500ms、READY、更大真实代码体量、干净工作区随机文件重复轮次及长期压力仍未闭环。
