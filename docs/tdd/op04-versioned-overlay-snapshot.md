# OP-04：有界版本 Snapshot 与真实增量解析

日期：2026-10-13（本轮日志 UTC 2026-10-12）。状态：IN_PROGRESS。
父 HEAD `a111235bc4bfcb55b126752f95b3ba095f2996af`，分支
`codex/op00-query-attribution`，叠加 OP-00/01/02/03a/06 工作树。
首个 Snapshot 实现及直接保护通过，相关批次三项超时；未完成阶段采纳或合入。

2026-10-15更新：Snapshot默认推广已REJECTED，显式1的有界实验及完整保护保留；
缺省／0恢复完整解析。当前构建十三完整相关文件79/79，下面早期缺省1措辞仅为
历史配置。六项ADR0015已授权默认优化不变，OP-04剩余磁盘delta等范围仍继续。

## 在途磁盘依赖的发布前输入修正

2026-10-16，当前production input
`ac4c136b69d74332c73ed8a9aa6c9dc562ec440070a2082679922f186050d863`，
semantic Worker `810176fa`；以下72358623整轮只资格化旧构建。原新整轮已
1861/1865、4FAIL；测试夹具修正后新整轮为1864/1865、1FAIL，详见下一节。
两种入口都保留：已打开调用方查询未打开依赖，以及从未didOpen的磁盘源查询。
不以合成didOpen、overlay或版本0代替磁盘输入。

真实framed-stdio反例在原生fstat返回后改写依赖，保持字节数并恢复mtime：
旧构建实际返回过期line0，当前磁盘定义已在line1，故不是超时或准备失败。
首次冷磁盘入口RED0/1；仅补发布前内容核验仍在该核验的真实读取窗口返回旧值，
第二次RED1/2。原始日志／见证保留于`.bench/op04-disk-dependency-fence-v1/`，
两个RED log SHA分别a2be8118、f3729d9f，不放宽-32803或完整位置oracle。

最小修复在原查询lease内、原READY认证后，逐一重读Store已纳入且非overlay的
workspace源，比较原始文本；既有reader额外核对最终命名路径stat，适用时核对
原realpath。新读取后再执行原最终SDK／配置输入guard，不挪走既有fence。
不匹配沿用输入不可用拒绝；显式READY撤销，下一次普通查询须返回当前line1并
恢复当前完整READY。不建立新的LS／AST／owner／缓存或开关。范围仍是原有
256文档／8MiB闭包、单文件4MiB及64KiB读取取消检查点，不声称固定64KiB内存，
也不把该闭包核验冒充所有隐藏Program源、一般graph／alias／配置变化的完整证明。

三个公开回归覆盖冷磁盘、打开调用方的最终读取窗口、显式READY拒绝／恢复；
十四个完整相关文件96/96、exit0、零注解，123647.800982ms，严格类型检查通过。
相关log SHA `06edfcf3a4370fddc2458eb260d7c9dab1f6aef19e16c9721199a56aba66645d`；
源码1747份，SHA `7a04271a79421079d22661314726cc668364c8f29b1d8c1c03f83bffd5087abe`。
八个改动源／测试文件均≤500行，type-engine正好500；九份既有超限债务及Rust未动。

完整安装API24、34源／32真实依赖hop，预登记旧／新／新／旧各两入口共8会话，
无trace／profiler／preload，正常诊断，原六默认及1024MiB／owner不变。
48完整语义结果、32当前READY、12诊断及8正常退出全部一致；真实编辑定义中位
opened2711→2634ms、disk2672→2620ms。四对采样RSS中opened正序1.2566超过
预声明1.10，其余约1.0116／0.9960／1.0160：资源比较假说FAIL，全部样本保留，
不重采、不称P95／PSS或净内存收益。作为已复现错误结果的必要正确性修复局部
保留，不把它算作资源优化采纳，也不恢复已拒绝的延后认证候选。

独立联合审计`.bench/op04-disk-dependency-fence-v1/audit.json` SHA
`6c0812bb7d60b5acd0a6df7b409809a33f5ba61c249ec6b1c52a9769f27eb36a`。
当前217总入口／210-fast；原完整check:fast为1861/1865、4FAIL，不能借用旧1862。
OP04仍IN_PROGRESS；一般delta／未知在途、复杂真实closure及OP00–06／L08原余项
继续。550ms／最终资源留L08，不前置阻塞此正确性切片，未提交或远端写入。

### 协调器磁盘夹具修正与完整回归

原`.bench/op04-disk-dependency-current-whole-v1/`完整运行已真实终态：
1865项／1861 PASS／4FAIL，exit1、signal null，零skip/cancel/todo，
2820050.121384ms。210个fast入口、1747份源码、完整SDK／生产构建／原pnpm
启动器前后一致，wrapper84390／collector84423／runner84459均已退出。
独立完整性audit SHA `daf7fc3c5fd5fa418dd97ce65581190cd0dd436bf0a61cefc15cb4ac994a5ec2`；
raw SHA `fcc4a6f2201961cb123f31ceb6f28056805c305e001535ee0b316236df28196f`。
这是原始FAIL，后续修正不改写它，也不宣称产品资源／P95／PSS通过。

四项均为原`workspace-file-change-coordinator.test.mjs`夹具只提供内存文本，
却未创建其声明的非overlay磁盘源；新发布前fence正确拒绝不存在的源。
三个可证伪假说为缺失磁盘夹具、目录alias误判、合法内存输入被破坏。先原样
复现18/22、4FAIL，再只创建真实文件并真实执行删除／alias重定向，22/22；
后两假说不支持。没有把源改标overlay、跳过校验或放宽原断言；生产ac4c136b、
六默认、预算及全部期限不变。父修订仍a111235b，命令：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/op04-disk-dependency-fence-v1/run.mjs coordinator-red \
  tests/workspace-file-change-coordinator.test.mjs
```

原RED及首次GREEN前缀分别`coordinator-red`／`coordinator-real-disk-green`，
raw SHA分别c2c5f396／1ca6e715，完整源归档与前后身份稳定。GREEN后提取共用
type-engine夹具至`tests/support/workspace-type-engine-fixture.mjs`119行；旧文件
1213→1120行，仍为迁移债，未机械拆测试或增加入口。六完整文件49/49、exit0、
零注解，96305.768059ms，包含三个真实framed-LSP在途拒绝／恢复及overlay、
SDK、重复通知／真编辑保护；raw SHA
`6edc1f9e0e5f172991df84ca8dbcc45feffc665328e2839f73ff3be3bba4baa3`。
前缀`coordinator-fixture-extraction-green`，生产／SDK／源码前后稳定。

修正后的新完整`pnpm check:fast`已真实终态：UTC2026-10-16 14:10:14–15:12:09，
1864/1865、1FAIL、exit1／signal null，零skip/cancel/todo，3700683.990766ms。
独立目录`.bench/op04-disk-dependency-fixture-current-whole-v1/`保留全部210入口、
1748份源码归档及原日志；source SHA
`a40d40d19e4a1761d6c6ca8f430378e2570190e27fb6664feb227c2324661ab5`，
raw SHA `8a9963943ce675dc240eed71ba3d7d0cbee2b878b5e355043066dd9938c15b47`。
SDK／生产构建／源码／pnpm启动器前后相同，wrapper3654／collector3683／runner3719
均已真实退出，0 ENOSPC。65份Rust输入未变，原focused证据继续复用，原完整命令
实际执行release build、0.32s；没有另称新Rust全测。独立audit SHA
`0ab1d0e0501e8052549ed4e361b47a2fc9cf9263f99e0811fba34680b9dce8bd`，
完整性PASS／whole FAIL；原四个协调器用例均在整轮通过。

唯一失败为原403文件`finds unopened rewritten struct references beyond resident and
lazy windows`，首次引用id2在20秒期限超时，用例20288.694716ms。保留原stderr中
index-error fallback及403源catalog ready，不从两行日志推定慢阶段或唯一原因。
该文件字节未改，前一同production整轮该用例29585.638617ms完整通过；两者是
各自真实结果，不把本次FAIL改成偶发PASS，也不宣称本轮测试夹具修改导致产品
回归或旧超时已修复。原四份完整oracle／20s期限不放宽，没有追加有利复测。
下一切片仍是冷Program／完整SDK重复准备及复杂真实closure的可证伪成本修正。

本轮旧测试1213→1120仍超限；其余九份已有债务未改：typescript-language-service
3241、document-store1835、run-language-server677、legacy-semantic-engine874、
semantic-worker-proxy522、semantic-worker-supervisor732、worker-protocol1901、
references-batching.test1349、semantic-characterization.test1606行；独立只读行数
审计保存在同目录`changed-source-size-audit.json`，全部较父HEAD不增长。
当前仍217总／210-fast，原1861/1865 FAIL保留；新whole尚未GREEN，不能请求合入。
没有重复正常性能采样或修改RSS1.2566假说，OP04／L08全部原剩余范围继续。

## 2026-10-16：真实编辑的 READY 准备解析作用域

当前production input `7235862384ee6fed2453fc45c49171c3859fc95bfb497d34f7bb96f87bbcd5ca`；
server仍`ef26b717`，semantic Worker改为`4f4f7c70`。本切片仅修改
`type-workspace-entry.ts`的准备接线及原`request-directory-proof-reuse.test.mjs`，
两文件均151行；没有改变九份既有超限债务文件或Rust。前一5e7bffc4的完整
1858/1858不覆盖本构建；十完整相关文件64/64后，当前原完整check:fast已
1862/1862、exit0，独立审计8c5cc269通过，详细终态见下节。

### 先归因，不把所有准备都叫 SDK 解析

原34源／32真实推断hop、完整安装API24 SDK，两入口各一次真实Seed编辑。
有限CPU观察仅在暖READY后启用，响应后立即停止；main／原semantic owner
共四份原profile保留于`.bench/op04-real-disk-edit-profile-v1/`，summary SHA
`0c2202fc9f433586107bb2cd49594da2d60b83d4ef6172088e56fe0f319a967a`。
Program构建采样约2.46–2.56s、解析1.14–1.16s、模块解析1.14–1.24s、
checker／binding／诊断0.30–0.38s。区间嵌套，不能相加；instrumented窗口
不是正常P95，函数名本身也不能划分SDK和项目源。

随后关闭CPU profiler，两入口各一次独立转发观察实际bundle原调用、不替换结果。
两边均重新创建255份SDK／10741499 code units、52份stdlib及61份其它声明；
项目35次创建覆盖34路径。其它声明包含自动纳入的开发类型，未删减合法覆盖。
232次其它声明的官方模块解析均未传cache。源码确认：ordinary query已有
有界同步作用域，但根READY准备直接调用compiler，绕过了该作用域。
`.bench/op04-real-disk-edit-origin-v1/audit.json` SHA
`34f885e9ddbc90888f15c7ff9ad776eebc287b549b91393c6c4b761bf144ad98`；
全部输入／构建稳定、原PID正常退出，观察不作为正常时延或物理释放证据。
Context7传输失败，改核对[官方Compiler API说明](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
与锁定r10声明／实际bundle函数头，没有用另一份compiler代替产品采样。

### 公开 RED → 最小 GREEN

父修订仍`a111235bc4bfcb55b126752f95b3ba095f2996af`，命令：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-reporter=spec \
  tests/semantic/request-directory-proof-reuse.test.mjs
```

真实stdio先准备完整READY，再修改未打开依赖；分别覆盖opened caller与从未
didOpen源，默认／显式0独立。完整定义新位置、推断number→string、当前只读
READY／相同完整覆盖、正常版本诊断及原生exit0均正确，但默认目录探测60次，
违反非零且≤2合同。RED为3/5、2FAIL、exit1，12846.853131ms。
`.bench/op04-ready-resolution-scope-v1/red-receipt.json`记录命令／父修订与原
tool输出转录；没有事前归档原stdout，不冒充完整raw来源证明。

最小实现仅让原semantic lease内的READY调用进入既有
`withRequestModuleResolution`。仍最多32次官方解析、32目录／32K code units；
首查真实见证、最终完整新鲜度、异常／取消finally清空及压力检查不变。
沿用`ARKTS_QUERY_MODULE_RESOLUTION_REUSE`缺省1／显式0，不新增优化开关；
不跨请求保留DTO、Program、LS或SDK AST，不重开S05／Snapshot推广。

GREEN为5/5、exit0；两入口默认均60→1，显式0仍60。十份完整相关文件随后
64/64、exit0、零skip/cancel/todo，102611.758005ms，包括SDK物理身份、嵌套根、
未知输入、创建／删除、取消、L2/L3与Worker恢复；strict／build／diff也通过。
related state SHA `30d64281703549ccbf20d47007dade8b3faffb6fe435f3e2ac6a0e5890529b86`，
raw SHA `c19f493e4e782aad223443ae778491f441fba2e7eec8d209a6979288f7ee5964`。
冻结1744份源码digest `c2c2c1c09c942090a16a027c2471de95f4d11d3407c105aad150572389169a39`；
source archive SHA `4d34f305b95391b367f0d683a08a6bb54ae17a6c24a4c3a80314ae659c91d72c`。

### 固定正常对照与尚未通过的资源假说

同当前构建OFF→default→default→OFF，每块两入口，8个独立进程，无profiler／
preload／trace／强制GC／并行回归。六默认及1024MiB不变，只切换已有模块／目录
组合；不把所有差值独占归因于新作用域。每格warm、真实修改及恢复，48份完整
definition／hover、32份当前READY、12份正常诊断及8个服务正常exit0均核对通过。
覆盖固定34项目／255SDK／52stdlib／402 Program源，两个真实编辑都更换Program
令牌；未打开入口的目标测量结束后才真正didOpen取诊断，依赖始终未打开。

| 真实修改／恢复definition，每组4个有限样本 | OFF中位／范围 ms | default中位／范围 ms |
| --- | --- | --- |
| opened caller／unopened dependency | 3427.55／3412.07–3550.74 | 2977.60／2947.44–2990.50 |
| source从未didOpen | 3421.40／3357.51–3643.90 | 2968.67／2896.50–3009.12 |

product RSS采样最大值四对ON/OFF为1.1595／0.9895／0.8039／0.9954。
其中一对约高16%，预声明的“各对≤1.10”资源假说本批不成立，不删慢值、
不追加有利重采，不称净内存收益或资源优化验收。保留既有有界策略的作用域
接线修正及局部功能结论；资源资格继续OP05／06，最终550ms／PSS不前置。
采样RSS不是连续峰值／PSS，PID退出不是native LS dispose／Registry清零或物理回落。
独立audit `.bench/op04-ready-resolution-scope-normal-v2/audit.json` SHA
`91d6076c6f753001a0c0de4498826443741d4de2456ae6cf5e33299977764ed9`。

normal-v1工具FAIL原样保留：沙箱不允许ps，首个RSS文件未生成，计划8／测量0，
仅启动未initialize服务PID96091且已退出。v2仅改失败留存／退出检查并在允许
本机采样的环境执行原固定8格；无产品改动、不混采v1、不放宽期限。
OP04整体仍IN_PROGRESS：本切片后编辑仍约3s，SDK／stdlib重解析、复杂真实closure、
一般delta／未知在途／配置、资源／生命周期／soak及原OP06门禁继续。当前无远端写入。

### 当前72358623完整回归终态

原collector UTC2026-10-16 05:25:15–06:18:01执行原Node20／pnpm
`check:fast`，209个fast入口完整保留；1862/1862、exit0／signal null、
零fail/cancel/skip/todo，3152490.27546ms。全程冻结源码，没有并行性能采样。
`.bench/op04-ready-resolution-scope-current-whole-v1/`保留原命令、suite、
source archive和完整raw；state SHA `875869c12b73b340baf4f9c992105e96b0d973d623207e9548047518883cbde2`，
raw SHA `73240682334dd989e036eb87247d7c2e048121dfbfa386d76759c8be3747d2ee`。
1744文件source digest `ce4d54ed78633fa0123b44042cc4e5428d2af10b61a403445cfec05149a3a2de`，
archive SHA `70b8a6049613877abee985db8a54cdbc4618863a6c71810e5f0c91d9ac2554ea`。
源码／SDK／全部产物／pnpm身份前后一致，wrapper97924／collector97953／runner98003
均已实际退出，0 ENOSPC。独立`integrity-audit.json` SHA
`8c5cc269e02d484105c884435a19e7338f7c9f440a248b5b3fc5ed77425d0dcb`。

原403用例总耗时34529.410688ms通过，源码仍1bcfe7fa、四份完整oracle和四个
20s请求期限未变；`interim-original-403-receipt-v1.json`的raw前缀亦已核对。
这不是单RPC时延或旧超时原因修复，不追加独立403／闭合64/128有利重采。
与前一whole相比仅本切片两个执行文件改变，各151行；其它九份超限债务文件
均未改变，旧完整行数审计仍适用。65份Rust／Cargo／toolchain输入也字节未变，
复用已资格化focused证据，没有重跑闭合100k；本轮原build实际重新核对release，
原生输出`Finished release profile`为0.31s，sidecar身份保持。

随后只同步治理文档，执行输入另做doc-only审计，不另起整轮追求有利值。
本切片功能与代码回归局部收口；OP04／L08整体仍IN_PROGRESS。正常对照的一对
RSS1.1595、约3s实际编辑、复杂真实closure及全部产品门禁不被1862项通过覆盖。
下一资源观察需保持owner存活，分别记native LS／Registry、live heap／自然GC与
PID RSS，观察真实驱逐和恢复；已有shutdown尾部不能当steady idle或物理回落。

## 2026-10-16：重复磁盘通知的独立输入切片

当前production input `5e7bffc48e95805f9da0ba3e0710260fb4b9f855c3e4b6137caf40fd451d120a`；
server `ef26b7176192911c3cb6eecaca104c36ef3189b4e0326b83b0406da6b0291545`，
semantic Worker `1cad2882edabbff210302ec086a1439560ef2b0c8737562ff28f6d892ec94357`。
仅处理字节及物理身份均不变的重复通知；实际编辑仍保守重建，不重开S05、
Snapshot推广、overlay-sync或已闭合403／64/128寻优。局部检查点之后，当前新
构建完整check:fast已1858/1858、exit0并独立审计；旧a6ae3b97的1837/1839 FAIL
保留原状态。这里只关闭代码回归缺口，整体OP04仍IN_PROGRESS。

真实stdio首条RED及一次有限确认均0/1、exit1：完整精确定义、当前READY、
未打开源、全文及dev/ino/size/mtime/ctime不变，但context create由1变2。
原trace确认eviction原因为`content-revision-change`，不是压力或alias reset。
原日志`.bench/op04-duplicate-disk-notification-{public-red,confirm-red}-v1*`。
父修订仍a111235b；改生产前，原取消、workspace-file-changes、coordinator、
session-reuse四份完整表征40/40、exit0，原alias/unknown保护原样保留。

最小实现`watched-source-notifications.ts`抽出原分类责任并加no-op证明：

- 仅已缓存、available、非overlay的普通已知changed源；物理路径及完整磁盘
  fingerprint必须与缓存一致。无可信fingerprint、符号链接或不确定输入保守处理。
- 用既有`readDiskSource`重读实际字节、比较全文；保留descriptor前后身份、
  realpath和最终lstat/stat。不是只看时间戳、大小、export文本或hash缓存。
- 单文件4MiB、64KiB分块／checkpoint／finally close不变；每批额外读取至多
  既有16MiB缓存界限，不增加旧全文／AST／LS缓存或跨批owner。
- 真写入／身份变化、创建／删除／未知／超限仍原invalidation/reset；rootDirty、
  配置、pressure、lease、overlay、取消及返回前fence不变。
- 沿用`ARKTS_L02_SAME_CONTENT_PROMOTION`缺省1／显式0；六默认、1024MiB、
  原滞回、单owner／最多2context／verifier1不变。S05/anchor/GC/recycle与
  overlay-sync仍OFF；Snapshot缺省／0完整解析、显式1有界实验。

五条新公开用例覆盖两入口无变化、显式0，以及两入口同大小／碰撞mtime+ctime
的真实内容变化。碰撞只在私有fixture的原生FS边界提供；真实read未伪造，
witness确认分类器实际重读，定义range由16–28变17–29并保守替换context。
无合成didOpen；已打开caller先等待正常v1诊断。库存原样RED216≠215后更新
216总入口／209-fast、bundle99。冻结12完整文件93/93、exit0、零注解，
140811.55204ms；`.bench/op04-duplicate-disk-notification-related-v1*`的state SHA
`7a42698ab82a40617db290240a7d4063ace1a541eeaf44d9868ebc09c11f8ddc`，raw SHA
`700fd49e57678c8cb174a6c137609dfb7abb0b54d8d8ac047702523935854df7`。
源码1744文件digest `f898e1429d7c56e0572dc0bd629e934ac0a55537e29637fa4e11b45694f2938c`；
归档／SDK／构建前后一致，strict/build及最终9项strict/syntax/diff均0。
旧75份产物保留原字节备份；sidecar／compiler／SDK／锁文件／stdlib／预算未改。
document-store1860→1835行，抽出完整分类责任，仍是超500迁移债务；新模块85、
fixture50、test120、manifest343、库存388行，均≤500。

### 完整安装SDK的有限正常对照

`.bench/op04-duplicate-disk-installed-sdk-v2/`预声明0→1→1→0，每块分别两入口，
8个新进程，trace0／无preload／无强制GC／无并行回归。新私有生成工程有34源、
32个真正传递推断类型的依赖hop，无无关filler，不是Settings。完整API24安装
SDK，READY覆盖34项目／255SDK／52标准库、402 Program源。每格warm、三次
无写入重复通知、number→string实际修改、恢复number；96完整定义／hover及
96当前READY精确，正常诊断一致，8服务PID正常退出。disk入口所有查询完成
后才真正打开caller取诊断；目标依赖始终未打开。

| 重复通知后definition；每组6个有限样本，ms | 显式0中位／范围 | 默认1中位／范围 |
| --- | --- | --- |
| caller已打开、依赖未打开 | 3496.17／3337.13–4246.53 | 79.14／67.63–82.96 |
| 查询源从未didOpen | 3429.90／3330.25–3498.04 | 77.06／73.64–82.74 |

真实修改仍3.27–3.48s，不宣称一般编辑增量收益或403修复。ON全会话采样product
RSS最大664–698MiB、OFF633–854MiB；四对比值0.9412/0.7970/1.0838/0.7773，
包含一对变高，不称整体净内存收益。实际采样P50约101–106ms、最大间隔259ms；
RSS不是PSS／连续峰值，PID退出不是native LS dispose／Registry清零／物理释放。
有限查询不是正式P95或soak。

v1原工具FAIL保留：计划8／执行3／余5未执行。它错把整个semanticGeneration
当Program身份；公开格式为epoch:appliedRevision:Program令牌:inputSHA。
无变化通知也必须前进appliedRevision。确认完整inputIdentity和Program令牌均
相同后只修资格断言，v2独立按原8格执行；不改产品或期限、不混采v1。v2同时
保护通知修订前进、相同内容的Program令牌／输入身份保持及真修改／恢复替换。

独立核对完整raw／源码归档／旧产物／新构建／8份report／RSS和退出，
`.bench/op04-duplicate-disk-evidence-audit-v1.json` SHA
`a20ba24f628df899ff40600ba987e371f839475fbe6f304e45026956e99c7b71`。
这是重复通知切片的局部资格，OP00–06／L08继续：实际changed-file细粒度准备、
未知／在途／配置、复杂真实工程、压力／生命周期／100+soak、完整产品证据与
新whole／分支PR。以下早期Snapshot及其它构建证据保留各自身份，不重标为新产物。

### 当前新构建完整回归终态

UTC 2026-10-16 03:32:04–04:24:58，原公开collector执行原Node20／pnpm
`check:fast`，209个fast入口均在清单中，1858/1858、exit0／signal null、
零skip/cancel/todo，3159051.278707ms。没有并行性能采样或运行中源码修改。
`.bench/op04-duplicate-disk-current-whole-v1/whole*`保留完整命令／原始日志／
source archive／suite／启动器；不是focus子集或旧a6结果重标。
state SHA `96a28c09bbee6e391219ce8393053ea249933d4b46d3fcbb7ffbb85f0ea3845b`，
raw SHA `7d49d59d8f10582b92bf90ef80203e734b3e731b603f1f0141a01540f3e7acb7`。
源码1744份digest `d2259543162ca43ec87da97ac89dc6a2378272c2f58c7b8e34e52f9f888842e9`，
归档SHA `c60cad08331c9a87a12afd06d031c81a5b17675c54222a94283519985f941083`。
前后源码、SDK、server／workers／sidecar／compiler／锁文件／stdlib／预算及
原pnpm启动器均一致；根PID21269／21298／21334已实际退出，0 ENOSPC。
独立`.bench/op04-duplicate-disk-current-whole-v1/integrity-audit.json` SHA
`47ad6ddac062c6a90a73e1b754655f326a1e347544c53632c582fa7364bbb243`。

原403用例本轮34204.671201ms通过，四个20s期限与四份完整oracle原样保留。
原观察器的专用verifier用例也通过；其资格修正仍有独立RED/GREEN及默认路由保护。
两条中间receipt与raw前缀／源码身份核验在
`.bench/op04-duplicate-disk-current-whole-v1/interim-prior-failure-receipts-v1.json`，
SHA `a443df6de77a5fcc1e1a2c4dccea3c20459fa09050c6551e299cfa44863354c3`。
这是当前整轮通过，不证明以前403偶发超时原因已修复；未追加独立403或
64/128闭合语料重采，旧1837/1839及ENOSPC／counts=null均保留原构建状态。

同源码只读行数审计覆盖全部194个改动代码文件：128个新手写文件均≤500，
无新超限或大文件增长。九个既有超限文件仍是迁移债，表中按父HEAD整体比较，
不是仅本次notification切片的差值；行数本身不替代职责／行为表征审查。

| 仍超限的文件 | 父HEAD行数 | 当前行数 |
| --- | --- | --- |
| [typescript-language-service.ts](../../src/core/types/typescript-language-service.ts) | 3375 | 3241 |
| [document-store.ts](../../src/core/workspace/document-store.ts) | 1945 | 1835 |
| [run-language-server.ts](../../src/lsp/run-language-server.ts) | 792 | 677 |
| [legacy-semantic-engine.ts](../../src/semantic/legacy-semantic-engine.ts) | 926 | 874 |
| [semantic-worker-proxy.ts](../../src/semantic/semantic-worker-proxy.ts) | 560 | 522 |
| [semantic-worker-supervisor.ts](../../src/semantic/semantic-worker-supervisor.ts) | 894 | 732 |
| [worker-protocol.ts](../../src/semantic/worker-protocol.ts) | 1998 | 1901 |
| [references-batching.test.mjs](../../tests/semantic/references-batching.test.mjs) | 1517 | 1349 |
| [semantic-characterization.test.mjs](../../tests/semantic/semantic-characterization.test.mjs) | 1777 | 1606 |

行数审计`.bench/op04-duplicate-disk-current-whole-v1/readonly-source-size-audit-v1.json`
SHA `fa95cfb1ba33bdf5ba29df8074cb590c74921d7210405398b7a7c9111ffa2360`。
终态后只同步治理文档，另核验文档白名单／链接和执行输入未变；无新生产构建。
代码回归GREEN不是P95/PSS、native LS处置／物理释放、100+soak、三平台或L08 DONE。
实际内容变化后的准备仍约3.3s；下一切片回到这一成本及复杂真实closure，
不反复扩写已通过的重复通知／来源护栏，不重开被拒S05／Snapshot推广。
当前未提交、推送、创建PR或合并；远端交付仍需明确授权并遵守分支／PR流程。

## 合同与最小实现

经 Context7 查[官方 Snapshot 合同](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)，
并核对锁定 `ohos-typescript@4.9.5-r10` 的 IScriptSnapshot、
updateLanguageServiceSourceFile 和多版本 range 合并代码：Snapshot 文本不可变，
范围使用 UTF-16 code units；无法证明祖先时 undefined / 官方完整解析。
compiler SHA 仍 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

- `typescript-script-record.ts` 提取权威源码、virtualDocument、生成文本、
  Snapshot 与原版本/预算构造。仅相邻 documentVersion 的 overlay 连接祖先；
  跳跃、磁盘更新或未知来源不连接。
- `typescript-versioned-snapshot.ts` 最多八个 numeric delta；不保存 previous
  Snapshot、旧全文或 AST。计算生成文本的共同前后缀，由锁定 compiler 合并
  已知祖先范围；超出历史明确回退。API 返回 range 副本，不暴露内部历史。
- `ARKTS_VERSIONED_OVERLAY_SNAPSHOTS` 缺省/1 开启当前工作树候选，0 保持
  `fromString()`。不是已经采纳或合 main；原六项默认、1024 MiB、owner、lease、
  scope、SDK、诊断、reference proof/fallback、取消及 stdout 保持。

静态历史上限和 API 回退不是 heap/RSS 平台期。language-service 3369→3351行，
提取完整 script-record 责任，仍有超限迁移债务；新增 module36/54、fixture78、
test当前420/151行、公共fixture73行、resident GC fixture68行，均≤500。
公共 fixture 持有建立/关闭真实 child、当前定义/诊断及观察读取的完整责任；
已有14/14表征保护提取，31972.194058ms、exit0。前序 document-store 债务本轮未改。

## 表征与实际 RED / GREEN

Node20.19.5；真实 LSP API 编辑/当前 caller diagnostics 表征先1/1、exit0，
5448.734727ms，八未选中：`.bench/op04-script-record-characterization-v1.stdout.log`。
无增量 record 提取后 strict/build、同表征仍 GREEN（5461.906300ms）。

公开 stdio RED `.bench/op04-consecutive-snapshot-red-v1.stdout.log`：0/1、exit1，
1669.395660ms。完整定义与 v2 正常诊断正确，但真实 compiler getChangeRange
为 null（oldLength81/newLength82）。最小实现后 strict/build 与 ON/OFF1/1
GREEN（3211.846477ms），不是时间门槛调整。

私有 fixture 观察器只在内存中接线真实 bundled compiler 的 getChangeRange /
updateLanguageServiceSourceFile 调用，原函数、原结果不变，不改 compiler/dist文件。
parser 观察器缺行的 RED 是工具缺口，不冒充产品缺陷。观测后新 SourceFile
真实复用2/4未变语句，OFF0；delta start81/length1/newLength2 精确重建全文。
完整 witness：`.bench/op04-snapshot-fixture-extraction-green-v1.stdout.log`。
观察开销不作为正常性能证据，也不靠内部 server 单元调用代替公开请求。

新增 test 库存先因未分层 RED；登记 bundle-e2e 后联合5/5 GREEN，
entry189、bundle85。支持 fixture 提取前后保持 GREEN。

十三个直接真实 child / Content-Length stdio 用例通过：

1. 连续 UTF-16 编辑、真实 delta/AST重用和 OFF。
2. v1→v4 跳跃全解析/零重用；v4→v5恢复可信增量。
3. v1祖先跨八次编辑精确，第九/十次 undefined，当前 parent继续增量且结果完整。
   额外 ancestor API probe 与 compiler 消费行分开；仅观测器额外持一个旧
   snapshot 作功能反例，不能将这个 profile 用于正常资源测量。
4. Unicode插入/删除、API、2322精确range、语法错误、撤销；整份hover/diagnostics
   与独立OFF完整解析相等，不仅比较数量，不隐藏 malformed source。
5. close/reopen重置版本后的新全文、新v1通知与当前v2诊断；重开只等未来通知，
   不以旧 queued v1充数。
6. 真正删除磁盘文件后的diskless overlay；同内容v2晋升不制造parser update，
   v3实际编辑仍有精确delta/2个未变语句复用，OFF完整解析。当前整份hover/
   diagnostics相等。首个表征错误把change-row字段用于update-row，修正为
   两种receipt独立断言；这是测试错误，不冒充产品RED。
7. 仅诊断启动的 resident Worker GC checkpoint：真实查询/当前诊断前后正确，
   一 resident context、零 lease/transient，GC 后连续编辑仍由原 compiler 消费
   精确 delta；不增加生产 GC 策略，也不当性能样本。
8. 真实 L3 通知后的 context.evict/新 contextSequence；恢复全文不认证旧祖先，
   新上下文连续编辑恢复 ON 精确 delta/2个语句复用，OFF完整解析。
9. 私有 SDK number→string→number 配置切换：实际声明 URI/range、当前类型及
   诊断正确；新 SDK context 不沿用旧 delta，随后连续编辑恢复增量。
10. 同一 workspace 真正关闭旧 child、不同 PID 重启；磁盘旧文本不覆盖新 overlay，
    新 v1 全文/诊断正确，新 v2 编辑 ON 增量、OFF完整解析。
11. 连发 v2/v3/v4、同时定义/hover：最新 string 类型、2322精确range及整份通知
    与 OFF 相等。实际 compiler 两侧均返回 null，未物化版本不认证错误祖先。
12. 磁盘依赖 number→string、打开未保存 number overlay、关闭返回 string 磁盘：
    精确当前定义 URI/range、hover和最新诊断逐版相等。disk parser-update receipt
    本次为空，不把空行当实际增量消费或 Program identity 证明。
13. tablet→desktop→tablet profile 通知与连续编辑：完整目标补全及 resolve、
    自文件定义/hover/诊断与 OFF 相等，inactive 类型不泄漏；当前 SDK/scope 不缩减。
    仅移除逐会话 opaque UUID 作跨会话比较，格式及实际 resolve 句柄另外保护。
    部分补全标识符的2304/2552通知不隐藏，精确range及整份payload保持。

queued / disk 独立首轮1/1、exit0、2831.773661/3829.199745ms。target fixture
首轮缺文件、随后把工程全局补全当当前文档诊断、以及错误查询前缀的日志
均保留（target-fixture-red-v1、target-characterization-v1/v2），不是产品故障。
按现有范围分离补全与当前文档查询后v3首轮1/1、exit0、3880.382382ms；
后续同 target 连续编辑真实ON delta重建全文、OFF null，不增加全根诊断支持。
新库存先缺 layer RED，再显式190 entries / bundle86；不取消库存保护。

`.bench/op04-close-reopen-characterization-v1.stdout.log`：5/5、exit0，
14111.381425ms，零skip/cancel/todo。各RED、GREEN、表征原日志均保留。

## 冻结相关回归：不是 GREEN

`.bench/op04-versioned-snapshot-focused-v1-{state.json,stdout.log}` 保留十五文件
完整命令与终态：140项137 PASS / 3 FAIL、exit1，489796.922434ms，零注解。
source `9cbb9a1b15fe4ff5752a94ea2a10f6f3bce0286a91c787c2a9be59cb3adc4749`；
server/三个新workers/Settings/SDK/compiler/stdlib/sidecar/Node/lock/memory gates
前后相同。repo1632文件 digest
`2b2625f11628f50d231fcfd78e2b09f2290fd738d9ef943acbec82b864ee932a`。
日志 SHA `d161c5639f7b070b38dbb33104134c43ee45abb80b17556bf9131a6d2f5d0627`。

三项原期限失败，没有缩减scope、SDK、payload或改timeout：

- 403文件：不含声明首次约17.85s及cache通过，含声明首次id4原20s超时。
- inherited-this继承补全id2原5s超时。
- struct-source-map定义映射id3原5s超时。

其它resident references/implementation/interactive/rename/call hierarchy、
package/SDK/target与输入修改、native hash新鲜度、取消/压力恢复、诊断调度、
真实 query-bound ready（含五进程100 repeat 控制）和库存保护通过。
不据此授予whole GREEN，未直接测试的Snapshot组合继续待执行。

## 有限诊断与剩余目标

依diagnose技能先提出可证伪假说：冷Program/SDK成本、候选冷启动附加成本、
在途诊断等待。随后原三个失败用例只做一次同构建OFF→ON分段诊断，
原5s/20s和完整SDK保留，不循环到偶然PASS。
`.bench/op04-cold-boundary-off-on-v1-*` state/raw logs/summary已终态：两边各
0/3、exit1、十九未选中，所有前后pins不变。OFF不含声明16.386s完整，
含声明超时；ON不含声明即超时。“仅开关导致全部失败”未获支持，不能排除
附加成本或其它工作树变化，也不能宣称候选无回归。

OFF七个完整batch各SDK255，Program-ready合计13.319s、query127.55ms。
含声明另有2.519s anchor/definitions0，六个完成batch的准备13.756s，第七未结算。
ON六个完成batch准备15.433s、query31.74ms，第七未结算。queue约0.68–1.99ms。
这些是已结算完整/部分区间，不把缺尾部当零，不当互斥CPU或正常P95。
两项5s冷交互两侧均停在约2.5–3.3ms host prepare后 compiler获取，原日志
无diagnose开始/完成行；不能据此归因诊断抢占或伪造compiler完成耗时。
原失败loop不改写；下面保留后续冷compiler观察，修复后仍须回到原期限。

## 冷 compiler CPU 观察：未证明超时已修复

经Context7核对[Node20 CPU profile](https://nodejs.org/docs/latest-v20.x/api/cli.html#--cpu-prof)
后，仅对原继承补全/struct定义各运行一个真实冷child。原5s判定保留，另设30s
晚完成观察上限只作诊断。本次均在5s内返回完整正确结果，4225.92/3952.13ms；
不能以两个单次PASS覆盖之前OFF/ON六次失败。
`.bench/op04-cold-compiler-cpu-v1/`保存state、原stdio、server/stderr、四个
main/Worker profile和cpu-summary，生产pins前后仍9cbb9a1b。此trace/profiler
结果不进入正常P95。Worker加权inclusive栈：Host同步3354/3306ms，
createProgram3027/2967ms，其内解析SourceFile1524/1525ms、模块解析1228/1244ms；
它们有嵌套，不可相加当互斥CPU。主线程约96–97%采样为idle。
native realpath self约492/482ms，支持检查解析/路径核验成本，不支持唯一归因
Snapshot、诊断队列或未经观测的设备原因；新鲜度guard不能凭成本移除。
同四份 profile 的 `native-realpath-ancestry.json` 进一步将 exclusive realpath
样本映射到实际栈：主要是 lookupIdentity 的 directoryPresence、模块候选及
fallback fileExists load-window 核验。不是API调用次数或重复实参证明；下一
OP-02切片先为官方请求内解析复用建立公开计数反例，不能据profile删除guard。

## 逐次诊断屏障与新冻结回归

collector原先supersede前版observer，快速编辑只保留最新诊断。新增可选
`waitForEditDiagnostics: true`：本版实际RPC及ready验证之后等待相同URI/version
的真实通知，再开始下次编辑，不在RPC之前等诊断以预热查询。只接受真正edit
场景的true；缺通知即停止，未执行计划继续留在分母；默认不串行、不改产品LSP。
协议fixture只验证工具合同，不当compiler或性能证据。

公开CLI RED `.bench/op04-edit-diagnostic-barrier-red-v1.stdout.log`：0/1、exit1，
1526.043697ms，本应[2,3]却只有[3]；最小实现后屏障文件5/5 GREEN，再保护
缺通知、默认路径、非法参数。`pnpm check` exit0。冻结七文件
`.bench/op04-edit-barrier-focused-v2*`：86/86、exit0、119182.041820ms，零注解；
包含六个真实Snapshot用例、完整payload/release消费者、真实compiler五进程100
repeat与库存。1633文件前后digest
`b18f430ad32d555e83e24a46bd2f1fc8db9acdfecc822a56bbee5aa4f82571ef`，
生产/SDK等pins不变；日志SHA
`b9b90dde777064dc008d19dbc087bb44ff71bbb2321a1b8dc1bae8be25dfab92`。
v1控制器误给不存在的readiness测试路径，未启动测试，exit1/state保留；v2更正
路径执行，不冒充产品回归、不覆盖原失败。collector/validator474/262、屏障test308、
协议fixture193行，均≤500。

## 400 次真实编辑：结果一致，净收益未成立

`.bench/op04-settings-alternating-edits-v1/{plan,state,audit}.json`预声明并完成
OFF100 → ON100 → ON100 → OFF100，一次/组、不追加有利样本，source9cbb9a1b。
完整Settings ecc550、API24 SDK、锁定compiler、六项默认优化、1024MiB和正常
诊断不变；resident-first/hash reuse固定1，仅切换Snapshot。trace/profiler/
preload/强制GC关闭，不与重测试/仓库修改并行，全部前后仓库/产物pins一致。

真实`HomeInitData.ets`每组50个initializer/body及50个公开字段type编辑/撤销。
定义查询始终选构造调用，独立oracle来自冻结源码的精确声明范围。每组102请求
exact、101份当前诊断、100个逐次屏障，产品正常exit0；共408请求、400编辑、
404诊断，两个方向整份definition/ordered diagnostics相等。只覆盖一个小的
真实定义目标，不推广成全能力或所有文件收益。

下表是描述性统计，不是正式SLO。RPC与didChange→结果+诊断分开计时；原
prepared-suite 180s采集上限保留，原5s/20s回归期限不变。13.36s长值未删除，
不能因最后返回正确而计成原5s验收PASS。

| 会话 | 编辑RPC P50/P95/max ms | 编辑+诊断P95 ms | Node RSS peak/idle MiB | Worker heap peak/tail MiB |
| --- | ---: | ---: | ---: | ---: |
| OFF正序 | 136.4 / 2689.5 / 13358.9 | 6185.1 | 2091.9 / 416.5 | 2252.9 / 272.4 |
| ON正序 | 135.4 / 2882.0 / 2954.9 | 6532.7 | 2400.5 / 885.8 | 1982.3 / 412.8 |
| ON反序 | 138.2 / 2923.3 / 2990.1 | 6750.9 | 2458.8 / 900.8 | 2275.4 / 560.3 |
| OFF反序 | 152.2 / 3011.8 / 3131.9 | 6962.0 | 2560.1 / 410.9 | 2277.4 / 264.2 |

Node peak来自外部按PID采样，idle是末次屏障后约5s窗口中位数；指标及整个
process tree原始样本已归档，无Worker RSS重复相加。目标间隔50ms，实际中位
133–140ms、P95 141–149ms、最大246ms，可能漏短峰值。heap仅semantic Worker
isolate，未强制GC，不是GC后live heap，不能与RSS相加或当PSS。每组末次采样
lease/transient均0，不等于Registry零残余或生命周期毕业。

每种状态两会话/200编辑，合并RPC P95 OFF2910.68、ON2892.65ms；正序ON较慢、
反序较快，未证明稳定整体提速。两组ON idle RSS/heap较高是待查资源信号；未
观测retaining path/GC后存活，不叫泄漏。八个numeric范围也不能证明compiler
AST/symbol/Program保留有界。以下独立 GC 诊断区分保留和收集时点，不改写
这四组正常数据；不重跑正常序列至有利，不猜测回退guard或改变原六项策略。

四份raw仍DEGRADED/FAIL、CLI1；必需输入缺`@ohos.data.DataShareResultSet`的
2307保留，不伪造READY。audit仅认证冻结/完整性/同输入payload比较，
`releaseEligible=false`；未授予550ms、PSS/DevEco、whole或全能力矩阵毕业。

## Resident GC 归因：不启用生产强制回收

依 diagnose 先列三个可证伪假说：收集时点/heap容量、旧对象持续保留、终态不同。
新增 private preloader 只在指定真实 semantic Worker、显式 marker 和 idle fence 后
执行两次 native GC；before/after context/project/open-document 数量必须一致，
失败明确 INCONCLUSIVE。不驱逐、不 trim、不改 Worker owner/lease/默认开关。
公开 stdio 实际 RED `.bench/op04-resident-gc-observer-red-v2*`：0/1、exit1，
6519.485540ms，查询及 v2 诊断已正确，缺 GC receipt。v1 误注册导致零选中，
不是产品 RED；第一实现 green-v1 命名日志实际6/7、exit1，亦保留失败。
Worker preload 时 argv 尚未包含入口名；将入口核验移到轮询后，green-v2
1/1、exit0、4467.565439ms，两个 switch 的真实 receipt COMPLETE。

`.bench/op04-settings-resident-gc-v1/{state,audit}.json` 一次 OFF100→ON100，
同一完整 Settings/SDK/source9cbb9a1b，206查询/202当前诊断整份相等，child exit0。
每组100次编辑和约5s正常 idle 后才显式 GC；trace/GC 开销不进入正常P95。
两个组 GC 前后 contextSequence9、一 context、零 lease/transient，期间没有
trim/evict/create，GC 后再次查询精确。所有前后仓库/生产 pins 一致。

| 模式 | GC 前 Worker used/total MiB | GC 后 Worker used/total MiB | Node RSS 前/后 MiB | 两次 GC ms |
| --- | ---: | ---: | ---: | ---: |
| OFF | 255.8 / 295.0 | 199.4 / 216.6 | 427.2 / 367.2 | 120.8 |
| ON | 264.4 / 767.3 | 199.9 / 218.1 | 799.2 / 415.4 | 150.8 |

下一条实际 runtime RSS349.1/358.9MiB。GC 后 live heap 仅约0.44MiB差异，支持
该目标的垃圾/容量/收集时点解释，不支持大量持续保留的结论；不能推广成所有
生命周期无泄漏，也不能用强制 GC 达成正常550ms/PSS门禁。root 原 TS2307
DEGRADED 保留；audit 仅归因/完整性 PASS，`releaseEligible=false`。

## 新边界相关回归

L3、SDK、restart 新用例各首次独立1/1、exit0，3128.915207/3520.491059/
4494.213954ms。冻结九文件 `.bench/op04-snapshot-boundary-focused-v1*`
59/59、exit0、169392.083217ms，零 skip/cancel/todo；source/产物/SDK pins 不变。
repo1634 digest `0ad271e057a0541357d4fb3557eaa6123ece507db3756fa8d78af666770b9826`，
log SHA `b3c4fb53a9318b475460c35babf56c934a12b42733e6de07301627d22360126d`。
这是相关 GREEN，不包含之前三个原期限失败，不能替代新 whole GREEN。

提取公共 fixture 后再冻结十文件
`.bench/op04-snapshot-input-boundaries-focused-v1*`：62/62、exit0、
179952.963809ms，零注解；生产source仍9cbb9a1b，所有生产/SDK及repo pins一致。
log SHA `e521fdc98a40c3702813ddf8d2b19f408bc17f5698510e5fd8a361e2415bd1a5`。
`pnpm check`再确认exit0，原冷失败及whole NOT_RUN不由这个批次覆盖。

OP-04还缺其它未知/在途编辑窗口、磁盘细粒度失效/一般配置组合、原冷超时修复、
净收益审计、整轮GREEN及采纳/回退。diskless/同内容晋升和所选
定义路径400编辑正常对照已完成，不冒充其它组合或全能力100-cycle soak。
其它OP未完成项保留，全目标不缩小；550ms/原内存/soak/平台只在OP-06/L08。
不合并、不push；按原分支/PR与新完整GREEN要求继续。

## 已证明暖 owner 的相邻 overlay 同步实验

2026-10-13，父 HEAD 不变。OP-00 六个真实编辑 verifier 的 getProgram
4.47–4.77s 是本切片输入，不把最后消息或线程退出当释放证明。
`ARKTS_REFERENCES_OVERLAY_SYNC=1` 显式实验，缺省/0 关闭；既有六项默认不变。
它只在原 coordinator 低压力、owner/epoch/revision、lease 条件内，消费已完整
观察的暖 Program。owner、roots、成员和 aliases 必须一致；实际改变的 overlay
必须来自相邻版本，非 overlay 文本必须与旧 Program 一致，实际配置 fence 保留。
资格不是当前 Program 证明：先更新原 engine/Host，并观察 native getProgram，
随后仍执行完整开始/结束 admit 和 searched-scope 校验。没有新 LS、context、
永久 verifier、旧全文/AST 缓存，也不启用旧 S05。admit 本身仍不构建 Program。
实验 trace 的 programBuilds 为 null，不能冒称编辑不换 Program；成功查询前后
sameProgram 只认证本次已准入 Program，不表示跨编辑对象相同。

公开 stdio 首轮 `.bench/op04-warm-overlay-reference-red-v1*` 缺新 resident
proof，0/1、exit1。初实现 green-v1、补齐实际暖 owner 的 warm-precondition-v1
均1/2、exit1；guard-diagnostic-v1 指向 overlay-sync-documents-changed。
不同查询的预备文档视图不是新增合法 scope：改为比较 overlay 数量，并逐个核对
当前磁盘文档和旧 Program 的真实文本，green-v2 2/2、exit0，4028.290516ms。
source bade3c7b，log SHA6413279c64ef11f23debb5bc9641bf1d05efff04ee180a7af776398487c0727c。
这些原失败、命令、前后身份和日志不改写，不将早期 fixture 当已证明暖 owner。

定义 anchor 的公开表征5/5通过（27个明确未选中），随后在 GREEN 下提取
queryAdmittedDefinition 到同一 resident proof module，保留动态 service 访问、
单定义和前后 Program/输入 fence。主 language-service 3282→3274行，仍是迁移
债务；新 proof module80行。三文件完整回归45/45、exit0、236054.468086ms，
全部身份稳定；`.bench/op04-resident-proof-extraction-green-v1*`，source adfeadda，
log SHA7b39fdf1aa531b532104dea104ca0f7b3c72ab0856244256f4f7e61925af52dd。

之后逐个真实公开表征：冷 owner3/3、v1→v4跳跃4/4、实际L3驱逐5/5、
关闭/重开版本重置6/6。冷上下文不凭空新建 owner；不可信版本和驱逐保持
完整 fallback，两种声明策略精确。重开先消费旧 v1 通知，再核对新 v1 的2322
及准确范围，不以旧通知充数。各 characterization-v1 前后身份稳定。

### 未通知磁盘反例与最小修复

新增磁盘 Hidden.ets 修改（同大小、恢复mtime）并叠加已知 v2 overlay，实际
漏掉两处新磁盘引用：disk-guard-characterization-v1 6/7、exit1。依 diagnose
先声明磁盘旧内容、实验接受旧 Program、旧索引缩小三个可证伪假说，再只切
实验开关。OFF-counterfactual-v1 / ON-diagnostic-v1 均0/1、exit1，六未选中；
ON 已明确 overlay-sync-disk-document-changed，两边仍只验证2/4成员后返回成功。
根因是既有回退候选信任了未通知修改前的索引，不是相邻编辑资格漏判。

首修强制补全未覆盖 scope，反例7/7，但 indexed-coverage-compatibility-v1
2 PASS/2 FAIL（九未选中），破坏合法缩小及 semantic-unit 合同，故撤回该实现。
最小修复使用既有 store-owned projectFileIdentities：索引开始/结束核对实际
闭合磁盘成员的 dev/ino/size/mtime/ctime；overlay 权威不按磁盘覆盖。发现身份
变化才清除候选和种子，完整 scope 重验；在途变化不发布部分成功。
没有新增跨请求身份缓存或提高预算，原合法索引缩小合同保持。

清除临时诊断控制后固定 ON/OFF 两个进程回归；最终两文件20/20、exit0，
零注解，所有production/SDK/repo身份稳定，
`.bench/op04-index-source-snapshot-guard-green-v1*`；source
d6d525cf6d8ed9acf9a30a4d87940497175d06519f0f9514137162ded140d8d3，log SHA
7078ff9668d52e9dce3d630a1dd172e5429acfd054d6f3946b506b3cc9bd8da6。
source/测试/新模块分别3274/350/80/43/471行，超限大文件仅 language-service，
本切片减少8行；旧其它迁移债务不被这个局部提取清除。

当前实验仍未采纳。trace-off真实工程净时延/资源、≥100编辑、其它冷/未知/在途
输入组合和新全量回归继续执行。旧C2工具whole1663/1663不覆盖本新生产source。
完整OP-00–06及L08范围不缩减；550ms和最终PSS/soak/平台门禁仍在L08。

随后完成同source的[正常真实引用对照](../reports/2026-10-13-op04-warm-overlay-reference-comparison.md)：
两策略OFF→ON/ON→OFF四进程24/24请求、16当前诊断完整且两对整份payload相等，
所有输入/仓库身份及独立audit PASS。编辑RPC5.56–5.97s→2.12–2.25s，
ON观测Node峰值829–836MiB低于OFF1070–1101MiB，但idle799–811MiB高于
OFF477–489MiB。1374原始RSS样本核对PASS仅内部一致；非PSS、非泄漏结论。
raw仍DEGRADED/FAIL、CLI1，实际child均exit0；不授予550ms或完整资源毕业。
≥100编辑/趋势、其它边界、新whole及采纳/回退继续，实验不默认开启。

随后四组100编辑已完成，416/416 exact、408当前诊断，两方向整份payload相等。
前两组中位5582/6002ms、P95 5772/6848ms；含声明ON中位6479/P95 7403ms，
原未执行OFF恢复后独立补100，中位5640/P95 6353ms。最后一组隔约12小时，
不声称完全连续设备状态。仅ON前11/10次维持<3s，不能按短样本采纳。
第三组RSS原FAIL是timestamp50ms倒序；独立Worker和harness单调时钟证实约195ms
墙钟偏移，原raw不改、不重跑第三组、不给其资源PASS。三组合法RSS仅内部
一致，不是PSS；four-group独立审计functional PASS/resource FAIL，详见报告。
完整100引用交替与最新诊断合同已覆盖这两个策略，仍不替代其它能力soak。
随后固定15编辑独立trace已19/19 exact、17当前诊断，前后身份与raw独立audit
PASS：实际L2 trim之后，第12编辑level2 resident miss，随后L3驱逐；context2–4
创建后inputs-incomplete并各L3驱逐，RPC约1.9s退回5.0–5.2s。它是本窗口的实际
链，不是正常400序列全部慢值的唯一原因、native释放或GC/PSS证明，详见报告。
未来RSS单调采集公开RED/GREEN及九文件97/97通过；原RSS FAIL不洗掉。
下一步OP-05资格/恢复净成本校准、余下边界/新whole；实验default-off、未采纳，
原完整目标继续。

新d6及单调RSS工具whole现已终态1643/1673、30 FAIL、exit1、零注解，全部
source/产物/SDK/repo身份与独立raw/archive审计一致。七个overlay同步/磁盘
guard用例在该整轮通过；其它29原期限超时和1首次补全-32803仍保留，不能按
局部GREEN允许合入。首次补全原用例单跑PASS，不等同修复。完整证据与下一
固定复现见[OP-06记录](op06-release-sample-evidence.md#当前d6与新工具完整回归fail保留)。


## 2026-10-15：当前长序列采纳审计与默认回退

旧9cbb／d6长序列负向结果不重标。当前0fb92f3e包括后续请求内module／directory
证明策略、metadata边界与native verifier发布前dispose，不能把旧成本直接授予
当前默认。因此先运行原十完整公开表征63/63，再冻结当前独立OFF100→ON100→
ON100→OFF100，每组一次、原100个body/API交替编辑、180s采集期限／完整SDK／
oracle和六默认不变；overlay-sync0、trace／queue trace／profiler／preload／强制GC
关闭。目录 `.bench/op04-current-snapshot-adoption-v1/` 保存启动前cohort-plan、
四个manifest及源码archive。生成大JSON最初两次输出被截断，未落盘／未启动产品；
之后用apply_patch stdin生成，未改变计划／输入／采样次数。

四组均102/102完整定义、101份当前诊断、100个逐版屏障，两个方向完整payload／
ordered diagnostics相等，共408/408／404／400。真实LSP exit0，原CLI均exit1，
报告FAIL／DEGRADED，缺必要DataShareResultSet声明2307保留；资源原始账户审计
PASS不代表PSS／最终ready。Node/CLI/sampler实际PID均退出，不是物理释放证明。

| 序列 | 编辑RPC P50/P95/max ms | 编辑→完整诊断P95 ms | 观测Node RSS peak/idle MiB |
| --- | --- | --- | --- |
| OFF正序 | 89.152 / 2002.766 / 2183.740 | 4814.649 | 1604.836 / 471.563 |
| ON正序 | 89.529 / 1984.492 / 2107.106 | 4770.020 | 1584.008 / 380.547 |
| ON反序 | 89.671 / 2011.694 / 2163.313 | 4824.984 | 1921.184 / 504.945 |
| OFF反序 | 89.096 / 1275.270 / 2044.620 | 2091.156 | 1682.863 / 803.781 |

上表仅本单定义目标的candidate-control描述，不是正式SLO。两状态各两会话／
200编辑，合并P95 OFF1958.199／ON1996.217ms；正序约0.9%提速，反序约57.7%
变慢，峰值正序约1.3%降低、反序约14.2%升高，idle则ON较低。不能只取中位数／
正序或idle宣布整体收益，不把GC前heap当live retention。末次native记录都为
一owner／一context、零lease／transient，不证明没有泄漏或Registry零残余。
实际RSS采样中位98.4–99.1ms、P95 109.9–111.2ms、max142.8–221.3ms，非目标
50ms连续峰值；各完整原始sample／metrics散列及账户重算。idle按原5s标记窗口，
采样/墙钟offset漂移均<2.2ms，保留窗口判定限制，RSS不当PSS。
四份manifest/report/stdout/metrics/RSS及终态audit全部重读，联合审计SHA
`b61dac5a98c05ddbde408e82ed82588efcc78ebd8246385e436c892e6e45dbdc`。

结论：有界Snapshot的功能／native解析复用合同成立，但默认推广没有稳定净
收益，REJECTED／本候选默认决策收口；保留显式1实验，不再悬置缺省开启。
这不是要求先达550ms／PSS，而是按本候选的可证伪净收益规则回退；六项ADR0015
已授权默认完全不变，overlay-sync继续0，旧S05不重开。

公开TDD父HEAD仍a111235b。新增缺省／0同一v2定义／hover／完整2322诊断比较，
真实compiler必须完整解析；原0fb默认实际消费增量，RED选中0/1／另11未选中，
exit1，前缀 `.bench/op04-snapshot-default-rejection-red-v1*`，log SHA
`da54096ba6e067cf178367bea41ac519247560e838c01f9fe9f7fdecf6291eaf`。
最小实现只把script-record的缺省1去掉，只有精确1开启。第一轮两完整文件9/14
FAIL保留：旧五项把undefined当增量ON；把原增量侧参数明确为1，原delta重建、
真实AST重用、八代祖先淘汰、完整payload／诊断及原期限均不弱化。新默认专用
用例继续覆盖undefined／0，含原公开定义和跨fixture完整规范化对比。

两完整文件14/14、exit0，继而十三完整相关文件79/79、exit0／signal null、
209137.838472ms、零skip/cancel/todo，源码／完整SDK／产物稳定、真实PID退出。
前缀 `.bench/op04-snapshot-rejection-current-related-v1*`，log SHA
`dfb5abd018b89965bc6c139a0d07b0d6294e72cd2d8063e97d83ff86056619d4`，
audit SHA `037770f1947cc6ddf5730e6ea228e8914a6c89f54bc90989cb85393130f31d96`。
六项默认引用／显式关闭fallback／默认压力诊断保护通过，strict／build／diff检查
通过。当前production1ab95acd、server9c52c111、semanticWorker f7998096／
referenceVerifier bb44c7b2／diagnosticVerifier b4bdcb61；与测量source0fb分开。
修改script-record36／test451行，不增加超限；未触及core3256／supervisor732债。

仅Snapshot默认推广决策已收口；OP04整体仍IN_PROGRESS，独立磁盘细粒度delta、
其它未知／在途和一般配置组合、当前新whole及全部OP03/05/06和L08范围继续。
原全量1757仅5cf9d618历史身份，不升级覆盖当前1ab95acd，也未合并／推送main。

### 2026-10-15：全量失败定位及私有GC结果原子发布

原公开collector只执行一次完整`pnpm check:fast`，全部202个fast入口，Node20；
`.bench/op04-snapshot-rejection-current-whole-v1/whole*`原始终态1794/1795、
exit1／signal null、零skip/cancel/todo，2674334.6193ms。唯一失败为GC用例
`Unexpected end of JSON input`：父进程见最终路径存在时，Worker同步写入尚未
完成。不是产品查询／GC执行失败。源码／SDK／产物／原pnpm启动器前后一致；
终态audit SHA `a35ca1d19d59824e85a8f63b350bebff2ae1160835e808655a197afb55787d9d`。

TDD父HEAD a111235b，真实framed-LSP及实际两次GC不替换。新增仅私有用例加载的
`resident-gc-slow-publish.cjs`：原始结果字节写一半后标记并暂停300ms，再写余下；
公开用例在标记出现时断言最终路径不可见。Node20选中该用例执行，RED0/1／
另11未选中、exit1，原最终文件半写时可见；前缀
`.bench/op04-resident-gc-publication-red-v1*`，audit a8202020。

最小修复只在私有`resident-worker-gc.cjs`先以wx写同目录临时文件，再以linkSync
原子独占发布，最后清理自有临时文件；不吞JSON异常、不加读取重试、不延长原
5s期限、不改变GC次数／owner／预算或产品代码。原完整receipt、真实PID/thread、
context1、零lease／transient、后续定义／诊断／增量复用及临时文件清理断言保留。
两完整文件14/14后，十三完整相关文件79/79、exit0／signal null、零注解、
209805.598752ms，前后源码／SDK／构建稳定；前缀
`.bench/op04-resident-gc-publication-current-related-v1*`，log SHA
`31008cd3ef353cca805b9b8e1f1edca7eba43c13343373778d41b09ccdc0b103`，
audit SHA `207ad90006dba4da20e50ffca8cd9e439b8f6d7d930962b63d05891107d6215b`。
Node20 strict及diff检查通过。新增fixture26、GC71、support74、test457行；
core3256／supervisor732债未动，production1ab95acd及六默认完全不变。

只证明该已复现的测试发布竞态修复，不证明产品物理内存恢复，也不宣称旧77/78
生命周期问题已定位。原1794/1795 FAIL保留，修复后的新whole待执行；OP04及
OP03/05/06、L08剩余合同继续，不把局部79/79或历史1757当当前全量通过。

### 修复后原完整回归终态

同日原公开collector在独立目录
`.bench/op04-gc-publication-current-whole-v1/whole*`执行一次完整`pnpm check:fast`，
真实会话31187已exit0／signal null；最终1795/1795、零skip/cancel/todo，
2671965.974116ms。GC发布用例4534.762022ms通过，未重跑原失败目录。
全部202个fast入口及原Node20／pnpm命令、完整源码archive、SDK／构建、suite与
启动器前后一致，原根PID86148已退出，独立terminal audit SHA
`b38d39c45acaa01b402ae8ab5c06ec0d2fec7c41f9052d5724884b6677974486`。

当前production1ab95acd代码回归GREEN，原1794/1795 FAIL原样保留；没有并行
性能测试或运行中源码编辑。本轮旧生命周期用例通过不证明其历史偶发原因修复；
根进程退出不证明所有LS／Registry或物理内存释放。OP04其余切片及OP03/05/06、
L08完整合同继续，不改六默认、550ms门槛，也未合并／推送main。
