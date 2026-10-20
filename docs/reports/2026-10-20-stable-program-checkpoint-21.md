> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos checkpoint-21：保留围栏的身份复用与成员resolve

正常串行三对对照完成：**新版312次全部≤500ms，312组完整结果与16一致**。
扩展公开补全恢复用例已确认本版回归，**checkpoint-21整体不可采用**，修复在隔离副本验证。
这是固定Photos工作负载的资格，尚非所有规模、READY、长时或全能力验收。
本版全fast在确认恢复回归后主动中断：已见856个通过标题，未完成全量资格，
进程exit-15，日志和原因保留。旧16全fast1918/1921、3项失败保持原记录。
未推送或发布。

## 固定版本、环境与场景

- Mac、Node v20.19.5，锁定`ohos-typescript@4.9.5-r10`，同SDK1670个输入。
  父提交`3add697043380612efe71cef074e5de292422fe2`；两候选均为未提交冻结工作树，
  不能写成同一个git版本。16为670源码/82runtime，21为671源码/82runtime。
  完整manifest和源码快照位于`.bench/stable-program-v1/checkpoints/`。
- native继续使用冻结旧baseline，SHA
  `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`，无Rust变化。
- 原Photos只读，574个原输入；执行于`<isolated-fixture>`。
  577个夹具输入及完整文件集合、SDK、源码及两个runtime前后严格核验无变化。
- 每场新进程、独立空应用缓存；全部串行，正常计时期间不运行build/其他测试。
  OS文件缓存和其他桌面负载不受控；内存为250ms进程树RSS采样，不是PSS或精确峰值。
- 初始化全部degraded2307，缺少`@ohos.filemanagement.userFileManager`，不能写成READY。
  查询的当前输入证明保持独立，degraded不直接转成查询失败或成功资格。

三套工作负载各三对，顺序16/21、21/16、16/21，共18个进程、624次操作：

| 套件 | 每场 | 内容 |
| --- | ---: | --- |
| fixed | 13 | 未打开/打开补全和跳转、两次关闭重开、重命名、首次及重复引用 |
| workflow | 35 | 原随机计划每模块首个固定目标，共7文件，未打开/打开/重开补全及跳转 |
| resolve | 56 | 相同7目标的35次工作流，每次补全列表后追加真实`completionItem/resolve`，共21次 |

每条记录包含文件、符号、UTF-16位置、完整输入/编辑/顺序、打开次数/版本、首次/重复、
原始协议和完整结果。resolve没有LSP position参数，记录真实原句柄、列表operation及
`listPosition`，不伪造请求字段。比较仅排除经句柄不变断言验证的进程内opaque `data`，
其余字段、列表顺序、定义/引用Locations和rename编辑完整比较，不只比较标签或数量。

## 正常响应结果

| 套件 | 16超过500ms | 21超过500ms | 新版最慢一次ms |
| --- | ---: | ---: | ---: |
| fixed：39次/版 | 2/39 | 0/39 | 473.368 |
| workflow：105次/版 | 0/105 | 0/105 | 340.032 |
| resolve：168次/版 | 3/168 | 0/168 | 267.210 |

此前的16同目标三次均慢，本轮旧16有一次438ms；保留每一次实测，不重采样。
不能以这三轮估计正式P95或承诺有足够500ms余量。两个慢操作全部逐次值如下：

| 操作与目标 | 16三次ms | 21三次ms | 中位数变化 |
| --- | --- | --- | --- |
| fixed op12：`PhotoBrowserActionBar.ets`，`visibilityQQ`，57:12，改名后首次引用 | 519.663 / 438.055 / 520.448 | 458.597 / 471.652 / 473.368 | 519.663→471.652 |
| resolve op37：`ThirdDeleteOperation.ts`，`callback`，列表32:12，关闭重开后详情 | 1184.846 / 1175.655 / 1184.335 | 78.676 / 91.219 / 92.070 | 1184.335→91.219 |

完整路径分别是`feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`
及`common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts`。
首次引用发生在重命名`isVisibility → visibilityQQ`并应用didChange后；两次返回均精确4处。
重开resolve使用该次重开补全刚生成的服务端句柄，没有复用已关闭文档的旧句柄。

另六个模块重开resolve中位数：browser209.105→101.287、editor213.425→101.922、
formAbility211.794→99.839、thirdselect195.397→73.801、timeline209.771→106.996、
ServiceExt231.260→125.490ms。原35次套件两版本轮均达标，不宣称所有操作均有收益。

逐次[operations.csv](local-performance-evidence.md)、
[全部慢项](local-performance-evidence.md)、
[完整汇总](local-performance-evidence.md)保留源字段和原始证据路径。
24场原始协议、逐次记录、源码/runtime、脚本及正确性日志已封存为
[1318成员有界归档](local-performance-evidence.md)，
每成员SHA核验，见[归档清单](local-performance-evidence.md)。
归档38768265 bytes，SHA256 `579e6b28c8a298b8ca3c42925d67b5f585eb579c49f01297378307d6705f47d8`。
48个记录的root/native子进程PID全部退出，见[退出核验](local-performance-evidence.md)。
排除可再生index及当时尚未结束的全fast日志；其后中断终态另存补充证据，不覆盖归档。
见[中断原因](local-performance-evidence.md)、
[进程终态](local-performance-evidence.md)、
[原始全fast日志](local-performance-evidence.md)。
构建后75生产runtime和671源码仍完全相同，一个辅助driver被重建；严格82项核验
失败也保留于[原核验](local-performance-evidence.md)
及[差异说明](local-performance-evidence.md)。

## 初始化与内存

| 套件 | 初始化中位数16→21，ms | 采样进程树峰值中位数16→21，bytes |
| --- | --- | --- |
| fixed | 14291.464→14204.769 | 822349824→823558144 |
| workflow | 14389.338→14466.884 | 832589824→821506048 |
| resolve | 14198.547→14139.182 | 816406528→827179008 |

初始化仍约14秒，单列而不计为交互500ms通过。三套RSS变化方向不一致，不能宣称
总体降低常驻内存。Worker共享Node PID只计一次，native子进程按PID去重。
该采样是测量工具，产品运行期压力策略尚非整个进程树统计。

## 实现和正确性证据

六场独立trace共208次完整结果与同版正常场相同，探针无溢出，输入哈希均未改变。
[阶段原始汇总](local-performance-evidence.md)
记录实际函数读点和Program计数。fixed op12的完整身份读取为：

| 实际diskIdentity调用 | 16 | 21 |
| --- | ---: | ---: |
| Program观察 | 1280 | 640 |
| 当前准入中的实际读点 | 640 | 0（复用本查询正身份，准入逻辑仍执行） |
| 独立最终联合扫描 | 640 | 640 |
| 合计 | 2560 | 1280 |

仍为640个磁盘输入（项目283/SDK305/其他52），当前overlay另计1个项目文件。
resident文本复读两版均0；raw workspace终检仍实际读取255份项目文本。
因此本次收益是减少重复物理身份工作，不能声称削减必要输入或终检。
带探针op12为698.496→629.636ms，单独记录而不代替正常459–473ms。

resolve op37实测Program从641个文件（项目284/SDK305/其他52）降为469个
（项目138/SDK279/其他52）；项目根284→138，SourceFile对象本次新观察14→0。
该resolve套件content-revision reset1→0、创建context10→9；原35次套件两版
本轮均reset0、context9。均为单场独立诊断，不能当作解析器调用次数，不能给
未测的正常运行内部阶段分配独占占比。

21保留16的当前输入准入、合法symlink身份、READY失败传播及独立最终联合围栏。
在此基础上，仅无实际read时移除读后检查；同步查询阶段共享成功物理身份元数据，
上限8192、溢出直读、终检先清空再独立扫描，finally丢弃，未跨请求共享有效性。
成员resolve与列表使用同稳定组范围，未知或非成员保持完整安全回退。

满256份raw文本窗口的关闭文件delta经既有token/read权威验证字节、physicalPath及SHA，
仍限制256个missing delta、8MiB合计；交付元数据供原LS失效/惰性读取，查询后及最终
围栏复核，不扩大raw窗口。真实final-read期间等宽改写和同inode父目录retarget均拒绝
-32803，恢复FS与watcher后精确返回新答案。不是以旧stat或watcher必达代替当前证明。

私有组合十四个完整文件86/86、全fast三失败对应四项修复4/4；移入后的七个完整公开
文件23/23，types/build exit0。18个移入文件保留前后SHA。超限旧债LS3178、
type-engine500、document-store1774未增加，Legacy791→787；详见
[TDD实施记录](../tdd/stable-program-optimization.md)、[ADR0019](../adr/0019-stable-programs-and-request-inputs.md)。

8250文件生成夹具恢复虽保留原LS、8254个SourceFile对象，诊断仍约4.4s。
对象复用不等于解析调用次数，不能据此判定大规模500ms已通过；实际文本读次数
和Program同步成本继续核验。跨组完整合并、整条逻辑请求共享、active组初始化优先、
运行期统一资源、递增规模/随机/长时和完整全fast验收仍开放。

后续完整公开`project-membership-language-service`第一例发现：300个填充文件使
`ZzzRemoteTarget.ets`落在256预载外，正常watcher+didChange后全局补全返回-32803。
冻结16、19同例各1通过（各8名称过滤skip），冻结21稳定1失败（8skip），完整
Photos312项成功仍保留，但不能授予本版整体采用资格。真实worker拒绝栈证实
旧配置见证中该源文件53字节的lookup身份，在合法增量后仍与新54字节比较。
这是满窗口delta保留LS后暴露的旧source lookup生命周期问题；需要实际重新读取
已变更项目源并重建其读事实，完整配置及其他路径的原始证明保持。修复结果另录。

## 复现

保留的冻结runtime需配合同一SDK、夹具及原始manifest；不要覆盖任何已有run目录。

[Detailed commands and examples remain in the local original report.]

脚本`run-incremental21-pairs.py`固定上述18场和完整比较；正常500ms阈值与120/180秒
防挂死watchdog分别记录。exit2表示功能正确但超过500ms，不能当作性能通过。
阶段探针必须单独运行，不能把其耗时当正常响应，也不推断未测阶段。
