# L08 查询输入核验：单次完整扫描

父 HEAD：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；继承 dirty 基线保留。
本切片不提高预算、不缩小输入范围、不取消 freshness 或正常诊断。
最终要求见[验收协议](../benchmarks/semantic-ready-acceptance.md)。

## 诊断与公开 RED

当前两真实进程[baseline v1](../reports/2026-10-10-resident-l08-baseline-v1.md)
完整精确，重复rename约924ms、零Program重建。三个已公布假说是输入
核验重复扫描、Program重建/驱逐、compiler/排队；本轮无trim/evict。

独立CPU归因保存在`.bench/l08-cpu-profile-v1/`和
`.bench/l08-cpu-attribution-v1.json`；NODE_OPTIONS明确开启cpu-prof，
只用于归因，绝不并入trace-off产品时延。semantic Worker真实调用栈
包含`realpath <- lookupIdentity <- current <- loadedConfigurationIsCurrent
<- rename`。全轮输入helper inclusive约11.1s，freshness约5.6s；
inclusive有嵌套，不相加、不解释成纯compiler CPU。完整同构输入中
helper先由freshness扫描、取得predicate后又立即扫描同一加载见证。

新增真实SDK层公开生产stdio回归（10次开发控制，非release样本）：

```sh
node --test --test-concurrency=1 tests/release/resident-semantic-latency.acceptance.mjs
```

未改生产源码先RED：0/1、退出1、46059.735622ms。12请求结果/完整编辑/
正常诊断/终态输入均正确；十次同快照rename的完整P95=994.548392ms，
原始906.695261～994.548392ms，未放宽500ms。独立等待正常初始诊断只
界定同快照控制，不把它宣称为首次新符号或整体semantic-ready。

登记真实RED：新增entry无layer，3/4退出1；登记real-sdk（非fast）并
同步175入口/real-sdk2。原严格列表后续再次RED，补两项真实SDK列表，
不删除发现检查。该实际外部SDK/Settings测试缺环境明确失败，不skip。

## 最小实现边界

把“捕获已经加载的见证”和“扫描验证当前性”明确分开。既有freshness
接口默认仍先验证后返回predicate，不改变其调用者合同；查询helper显式
使用capture模式，捕获
compiler/resolver/project的既有见证后执行一次完整最终验证。
捕获不读取或重stamp当前磁盘，不新增持久化/全局正确性缓存；revision、
unprovable、所有positive/negative/path/content见证、取消检查点和返回前
实际完整扫描保持。真实加载窗口和查询期间的新见证仍使旧predicate失效。

先在既有公开package/SDK陈旧输入合同GREEN保护下实施，再重跑新真实
500ms控制和原完整公开恢复/诊断合同；未通过时继续修复，不计为毕业。

修改前22/22公开输入/恢复/诊断及登记characterization GREEN，退出0，
37232.869689ms；不以此GREEN代替新时延控制。最小实现使用显式capture
模式，原调用者默认validate不变；resolver保持499行，无新增owner或缓存。

第一次修复后，输入/恢复/诊断及登记仍22/22 GREEN，退出0，
39020.402021ms。时延控制仍0/1 RED：十次P95=540.729705ms，
496.499411～540.729705ms，退出1，43188.311606ms。该轮与focused
并发，保留为开发失败/宿主负载污染，不删除或算正式产品样本；随后
同构建隔离复测，未因污染自动认定修复已通过。

隔离同构建重跑上述公开stdio命令：1/1 GREEN、退出0、
40227.577481ms；十次同快照完整rename P95≤500ms，全部编辑/正常诊断/
输入不变/产品退出0断言通过。仍仅开发控制，不宣称100请求/5会话、
总体ready或编辑/驱逐桶通过。当前固定构建已独立重放原15项完整序列，
trace-off/trace-on各15/15完整精确，八项配对检查全真；raw CLI1和
READINESS_UNSUPPORTED保留。重复rename467.7ms，正文编辑971.9ms、
重复incoming1278.2ms仍未达标；完整报告见
[当前复测](../reports/2026-10-10-resident-l08-input-freshness-v2.md)。
随后冻结全部1557份tracked/非忽略untracked输入（含源码、配置、测试、
工具、文档和301份benchmark输入），执行全新`pnpm check:fast`。
真实session46851终态1516/1516、根退出0、无fail/cancel/skip/todo，
2166120.94808ms。终态全部产品pins、源码/路径/内容摘要、175登记/
168fast入口和运行产物身份均相同；原始记录在
`.bench/l08-input-freshness-v2-frozen-inputs.json`、`-full-part-01..19.log`、
`-post-full-identity.json`及`-full-observation-state.json`。
第8段trace输出超观察上限，明确记录截断；不冒称逐字完整stdout。
这完成当前freshness切片的完整回归，不借用L07旧统计，也不等于L08毕业。

## 入向调用：同一次范围判断共享物理路径

父 HEAD 仍为 `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，继承 dirty
基线不动。新增真实 Settings 生产 stdio 入向调用控制（trace OFF，正常
SDK、完整 oracle、正常诊断、10 次重复，仍非 release 100 次/5 会话）：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 --test-name-pattern='Settings incoming calls' tests/release/resident-semantic-latency.acceptance.mjs
```

实际 RED：退出1，0 pass/1 fail/1 名称过滤 skip，53404.314992ms。
13 项请求均完整精确、输入不变、诊断正常、产品退出0；重复入向调用
P95=1411.626292ms（1386.762213～1411.626292ms），没有放宽500ms。
原始输出 `.bench/l08-incoming-latency-red-v1-output.log`。
诊断假说：完整成员刷新内重复路径/范围解析；诊断或队列；主线程结果
验证。独立 CPU 归因使用带 DEBUG 标签的临时 stdio-transparent launcher，
不作为产品时延样本。Node20 拒绝 NODE_OPTIONS cpu-prof 的尝试退出9、
未启动产品；直接 argv 归因则产品退出0、5/5 完整精确，raw CLI1 保留。
三个入向调用的 Worker 累计刷新 inclusive 3357.267ms，scopeFor
2339.197ms；compiler incoming 回调535.262ms，主线程结果验证3.005ms。
各 inclusive 指标存在嵌套，不相加。归因支持第一假说。

实现前特征回归：project-file-set-cache、harmony-project-model、其 budget
合同及两个公开 call-hierarchy/edit-call-inputs transcript 共101/101 GREEN，
退出0、43598.446457ms。最小修复让范围与准入共用本次实际解析出的物理
路径；不引入跨请求路径缓存，不删除完整扫描、不缩 scope、不取消未通知
变更核验。不以特征 GREEN 或归因报告声称新时延控制通过。

最小修复 `resolveSourceScope` 返回同一次物理解析的 scope/path，保留
unconfigured 早退及解析失败的 fail-closed；成员准入不再重复解析该路径。
类型检查与实际 build 均退出0。隔离时延复测仍 RED：退出1、0 pass/
1 fail/1 名称过滤 skip，51880.767854ms；13 请求的完整/精确/诊断/输入/
产品正常退出断言仍通过，重复入向调用 P95=1236.174474ms，原始
1207.698767～1236.174474ms。仅约12.4%开发改善，未达500ms、未毕业。
CPU 原始/派生归因保存在 `.bench/l08-incoming-cpu-v2/` 与
`.bench/l08-incoming-cpu-attribution-v2.json`；临时 DEBUG launcher 已从
dist 移除，精确快照保留在 `.bench/l08-incoming-profile-server-v2.snapshot.txt`。

共享单路径后，原101项再次 GREEN（43119.280750ms）。在该保护下抽出
physical-path-identity 与 project-source-eligibility；额外特征轮101/101
GREEN（43224.396989ms），其中 stdio 仍是此前共享路径构建，不冒称
该轮已运行抽取后的新产品 bundle。

第二个公开 RED 位于既有 project-target-membership 入口：99 成员的完整
刷新加读取产生297次真实文件物理解析，超过一次/成员的控制；退出1、
0 pass/1 fail/10名称过滤skip、386.531915ms。目录中途 retarget 到
inactive target 的特征用例先在原实现 GREEN（250.400207ms）。

最小实现由真实 opendir 普通文件条目和本次目录物理路径推导 leaf，
保留每文件 lstat、大小、身份、原范围双判断和完整枚举。目录打开前后
及关闭时复核物理路径；root 同时绑定本次 canonicalRoot。容器 witness
仅活在一次扫描，最多512项/64KiB路径文本，满后实时解析、范围不截断；
成功发布前逐项重新 realpath，失败的容器不缓存。注入枚举器始终只接受
未解析字符串，不能提供可信物理身份。新操作预算与中途retarget两项
GREEN（372.255168ms）；末尾容器retarget/恢复又得到3项 GREEN
（432.022419ms），均不代替公开stdio或完整回归。

第一次实际新构建时延仍 RED：13请求完整精确、诊断/输入/退出均正确，
P95=1130.125909ms（1083.972830～1130.125909ms），退出1、52410.549593ms。
source `60378e08fb93abbdd9964af183c59f4dc772dc3f250fde46590269e63d816c6c`，
server `195eb1c8aac00f3c9ce771bf41f331d284f3b894b323f1ae41f5e1d6bdb98372`，
worker `c2614bb60870195ef9fb0993fa4a7e4ab43e1d7aa9284a09a61a3ec432176b2c`。
原始输出 `.bench/l08-incoming-directory-evidence-latency-v1-output.log`。
随后113项 focused 112 pass/1 fail（51497.804384ms）：实际源根解析5次
违反既有4次上限。未改断言/预算；目录准入的新鲜物理解析与打开检查
共享后，原用例1 pass/50名称过滤skip GREEN（694.384562ms）。后续新
bundle 必须另跑完整 focused；1556旧全回归不得作为新源码回归。
document-store 已从2048降到1945行，剩余超500行债务仍须继续迁移；
新职责文件44/72/约78行、模型388行、改动测试均≤500行。

源根预算修复/root物理身份绑定的新实际构建：114/114 focused GREEN，
退出0、51369.336088ms，无fail/cancel/skip/todo。随后重新 CPU 归因，
raw CLI1/DEGRADED、产品退出0、5/5完整精确、输入不变全部保留；
原始 `.bench/l08-incoming-cpu-v3/`，派生
`.bench/l08-incoming-cpu-attribution-v3.json`。临时 DEBUG launcher 同样
已移出dist、精确快照归档，不把额外启动器时延/RSS作为产品收益。
三个 incoming 累计 refresh inclusive2467.776ms，resolveSourceScope
1589.383ms，其中 relative栈1406.138ms、native栈16.149ms；compiler
incoming541.129ms。inclusive不相加，profile全轮含初始准备。
真实Settings声明32个模块；剩余scope成本主要是线性模块匹配的路径比较。

第三个操作预算 RED：先新增嵌套模块特征和129模块的公共 scopeFor
成本合同。初次特征错误期待声明顺序获胜，而已有load按物理路径长度
降序排序；这是测试预期错误，不记产品缺陷，原失败输出另存。
修正为最深owner在任意声明顺序获胜、最深owner unavailable不得回退
祖先后，原实现特征 GREEN；成本实际 RED：单次warm查询130次
path.relative，1 pass/1 fail/7名称过滤skip、退出1、1226.545779ms。
父HEAD不变；原输出 `.bench/l08-incoming-module-lookup-red-v1-output.log`。

最小实现给既有ProjectSnapshot加≤256模块的物理根索引，从当前物理
source向祖先逐级查找，保持最近/最深owner（包括unavailable）及旧
Windows路径大小写比较规则，invalidate仍丢弃整个旧snapshot。
不缓存source当前性、scope不变、原scopeFor继续实际解析当前source。

索引的全部模型合同36/36 GREEN（1998.106352ms），类型检查/build
退出0。新实际trace-off产品控制仍 RED：P95=700.524174ms，原始
674.232595～700.524174ms，退出1、44860.080409ms；13请求完整精确、
输入不变、正常诊断、产品退出0断言全部通过。相对最初1411.626292ms
仅是约50.4%开发时延改善，500ms门槛未达，非正式release收益。
source `ca4bf29ac6f608f006ff38d3d81f9faf8198a0aa01298bd7c410919439febd07`，
server `f16ed83c3817e1cb26fa6a45441f325464afc71c1d6eef3d01e229e8600e8ead`，
worker `3b01aa6ad591a18786f74835655cc09ab32452b0137113dafc68c51da4438f04`。
原始 `.bench/l08-incoming-module-index-latency-v1-output.log`。
当前模型406行，document-store1945行（比继承2048减少103，仍是超限
债务）；新三个模块44/72/78行，两个修改的合同测试246/368行、实际
SDK控制86行。新源码仍须完整focused/whole，不借用旧1556统计。

当前实际索引bundle的六个入口 focused 最终116/116 GREEN，退出0、
51941.067881ms，零fail/cancel/skip/todo；含真实stdio调用图/编辑/取消/
替换/陈旧输入恢复，以及上述目录/容器安全合同。完整观察输出
`.bench/l08-incoming-module-index-focused-v1-output.log`，当前分类
`.bench/l08-incoming-scan-optimization-v1-state.json`。当前whole NOT_RUN、
入向开发时延FAIL、正式releaseEligible=false，main未修改。

## 目录身份：完整单次扫描内的祖先见证

接续goal turn先重读当前工作树，source/server/worker与上述700.5ms
控制完全相同；Settings、SDK、backend/lock、stdlib、预算身份也不变。
父HEAD仍为 `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
排序假说为目录realpath/遍历、compiler输入核验/回调、诊断队列/重建。
新CPU v4：5/5完整精确、输入不变、产品退出0，raw CLI1/DEGRADED
保留；三个 incoming 累计 refresh1222.443ms，其中native510.599ms，
relative189.332ms；compiler incoming528.171ms。全轮其它输入指标含
准备，不当作每请求数；inclusive不相加，带额外launcher的数据不作
时延/RSS验收。原始/派生保存在 `.bench/l08-incoming-cpu-v4/` 与
`.bench/l08-incoming-cpu-attribution-v4.json`，DEBUG启动器移出dist归档。

公开操作预算实际RED：51源文件/55打开目录，170次目录realpath，
退出1、0 pass/1 fail/13名称过滤skip、389.125691ms。命令：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 --test-name-pattern='bounds whole-directory resolution' tests/semantic/project-target-membership.test.mjs
```

最小实现仍完整opendir枚举，实际非symlink DirEntry以已绑定父目录推导
物理路径；每层目录开前/开后/结束验证BigInt dev/ino/mtimeNs/ctimeNs。
根仍绑定本次canonicalRoot并实际realpath；inode信息无用时保留native
检查。所有祖先结束验证才可发布complete，实际lstat非目录/身份/条目
变化均显式partial；仍保证异常/取消关闭所有已开句柄。没有跨扫描缓存、
新预算、额外文件数限制、范围裁剪或诊断关闭；原末尾容器见证继续验证。
新预算/原leaf与两个retarget四项GREEN，533.596641ms。新增同路径目录
替换遗漏新member的安全特征先因fixture的备份仍在合法source范围而
错误期待少一个file失败；这是测试oracle错误，不记产品RED。备份移到
该fixture工程外后，同路径替换显式partial、再次完整扫描纳入新源均
GREEN（250.709669ms），没有修改产品忽略规则。

类型检查/build退出0。隔离真实SDK十次控制仍RED：13请求完整精确、
输入不变、正常诊断、产品退出0断言通过，P95=567.315920ms，原始
545.743489～567.315920ms，退出1、45696.183353ms；500ms门槛未放宽。
source `739a6dc978236737c4a7ba9a0f28ce8fd3e75e011336d600badc09bacabc4d2b`，
server `f16ed83c3817e1cb26fa6a45441f325464afc71c1d6eef3d01e229e8600e8ead`，
worker `7999d95e24787aee56d2f4a52a77db6d9861a6a89e1cc5dc5ed6e20d73d3cca1`。
原始 `.bench/l08-incoming-directory-identity-latency-v1-output.log`。
新enumerator106行、修改的target-membership测试440行；document-store
未再增加，剩余1945行债务保持。旧116或1556不冒作这份新源码回归。

目录身份新bundle六入口完整focused118/118 GREEN、退出0、
52231.964548ms，零fail/cancel/skip/todo，原始
`.bench/l08-incoming-directory-identity-focused-v1-output.log`。
真实时延仍567.3ms RED、当前whole NOT_RUN、L08仍未完成、未合main。

新CPU v5保持739a6d来源：5/5完整精确、输入不变、产品退出0；raw
CLI1/DEGRADED保留。三个incoming refresh799.810ms，native23.463ms、
relative182.172ms，compiler incoming533.154ms；全轮输入核验1741.324ms
包含初始/其它请求，不除以incoming数。inclusive不相加，profile/额外
launcher不作为产品性能。原始与派生归因在 `.bench/l08-incoming-cpu-v5/`
及 `.bench/l08-incoming-cpu-attribution-v5.json`，DEBUG launcher归档移出dist。

第五个操作预算公开RED：99完整源文件单次refresh发生1209次
path.relative；退出1、0 pass/1 fail/15名称过滤skip、386.562476ms。
父HEAD不变，命令为同一target-membership入口加
`--test-name-pattern='bounds repeated rooted path comparisons'`。
最小实现仅比较已经由path.resolve/native得到的绝对归一化路径，
使用带separator边界的containsResolvedPath，按host path.relative规则
仅win32大小写折叠。scope仍实际解析当前source；不接受raw user path。
源的词法/物理两侧、根/容器/目录身份及未通知变更验证保持；没有缓存
有效结论、放宽scope、移除文件或改正常诊断。已有model36/36 GREEN
（2023.937913ms），scope共享根名前缀main-shadow不得入选、原改指向/
同路径替换与新预算共5项GREEN（659.957948ms，12名称过滤skip）。
所有模型inside调用已核对resolve/native前置；泛用raw路径helper未替换。

Node20类型/build通过后，同构建隔离执行两个原实际SDK控制：0/2、
退出1、88977.112957ms。rename十次完整编辑P95=562.082218ms，原始
506.361422～562.082218ms；incoming十次完整payload P95=501.779541ms，
原始488.860942～501.779541ms。两case均在完整精确/输入不变/产品退出
0断言后才因时延失败，incoming正常诊断PASS；不四舍五入501.8为PASS，
不删除rename新失败或用此前单轮GREEN代替当前门禁。
source `cf24dc172c55624dddbb66f476e015c62f9946e3256d6e9236237cb0ce97d66b`，
server `ea7588fa31dc8356fa27c5c08d7863e60ee3efc5bec2b850e457bd93f91cdc9a`，
worker `3355c9f35d162fc4c71ed5104f09c46bfc1ffe2ffebc26aeab0fe913dfc8366e`。
原始 `.bench/l08-resolved-path-latency-both-v1-output.log`。
helper9行、model405、eligibility72、enumerator106、target-membership483，
document-store1945未再改；新源码仍须新的完整focused与whole。

当前cf24dc bundle六入口完整focused120/120 GREEN、退出0、
52084.808324ms、零fail/cancel/skip/todo，完整观察stdout与当前分类在
`.bench/l08-resolved-path-focused-v1-output.log`、
`.bench/l08-resolved-path-final-state-v1.json`。当前whole仍NOT_RUN、
两个真实开发时延控制仍FAIL，全部原门禁保持，L08未完成、未合main。
后续只读代码核对发现rename同事务在getRenameInfo后和complete edits
返回前各调用一次完整loadedConfigurationIsCurrent；不是prepareRename
子调用。下一切片先保护public早退/冲突/取消/输入陈旧/完整编辑合同，
再评估统一返回前核验，不能删除最终完整事实扫描或漏掉失败分支。
修改超限TSLanguageService须有GREEN特征与同变更职责抽取，不机械拆分。

## 重命名事务完整输入校验去重复

父HEAD仍为`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。真实公开RED为
上述同构建双控制退出1：rename P95=562.082218ms，完整编辑、输入不变
及产品退出断言均通过，失败点仍是原500ms门槛。独立Node20 CPU v6
归因使用同cf24dc源码/SDK/Settings，5/5完整exact、输入不变、产品退出0；
CLI退出1/root DEGRADED仍保留。四次rename采样inclusive2626.516ms，
其中loadedConfigurationIsCurrent1980.542ms；嵌套时间不能相加，额外
launcher/trace只用于归因，不作SLO/RSS毕业证据。原报告、CPU摘要和
launcher归档为`.bench/l08-rename-cpu-v6-report.json`、
`.bench/l08-rename-cpu-attribution-v6.json`、
`.bench/l08-rename-profile-server-v6.snapshot.txt`，临时dist launcher已移除。

改动前真实child-process stdio五入口37/37 GREEN（99306.738026ms）。
最小实现把rename同事务两次完整扫描改为统一finish处的一次；任何
getRenameInfo之后的结果（含冲突、membership、空/越界/不可映射源等
失败分支）返回前仍核验全部当前compiler/resolver/project加载事实，
查询追加的事实也必须通过。没有缓存有效结论、删除最终扫描、缩小
scope/结果、改预算或关闭诊断；公开prepareRename保留原校验。
首次控制因沙箱禁止ps、外部RSS没有首样本而退出1，原始记录保留；
获准进行进程采样后同控制1 pass/1名称过滤skip、退出0，P95=280.427702ms。
该版本再跑上述37/37 GREEN（98454.440774ms），才进行职责抽取。

GREEN下将完整原子rename事务抽到`typescript-rename-query.ts`115行，
LS类仅提供原source/版本/membership/输入authority；不增加owner/cache。
TSLanguageService由3447降到3378行，剩余超限迁移债仍记录，未机械拆分。
抽取后Node20 check/build与diff检查通过，原五入口37/37 GREEN、退出0、
98191.819638ms、零fail/cancel/skip/todo，完整stdout已存
`.bench/l08-rename-extraction-focused-v1-output.log`。

抽取后的真实同构建两控制2/2 GREEN、退出0、82612.338482ms；每项10次
完整exact/输入不变/产品退出0，incoming正常诊断PASS。rename P95=
276.957878ms，incoming P95=493.081850ms；后者仅约7ms余量，不宣称
稳定正式达标，也不删除此前501.779541ms失败。原始全样本/产品pins在
`.bench/l08-rename-extraction-latency-both-v1-output.log`，当前分类在
`.bench/l08-rename-extraction-final-state-v1.json`。source36defd53e、
server仍ea7588fa、worker1ee35549；完整摘要以原始诊断为准。
这里只是各10样本/1会话candidate-ready-control，不是100样本/5会话或
正式ready认证。当前源码whole尚未完成，将在冻结全部输入后重跑
Node20 pnpm check:fast；旧1556不能代替。原必要SDK输入、动态认证、
336格、内存/soak/平台门槛保持，L08未完成、未合main。

## 完整回归终态失败与冷加载异常分配切片

上述36defd53e冻结Node20 check:fast已真实终态退出1：1565项、1563 pass、
2 fail、零cancel/skip/todo、2338117.765755ms。失败均为原5秒公开stdio
边界：继承成员补全、rewritten struct定义映射。1583全repo输入、18产品/
SDK pins、179登记/172fast、5产物、19 harness及branch/main refs终态全等。
原始终态、输入向量和分类为`.bench/l08-rename-whole-node20-v2-*`。
18段观察中第6段43076 tokens超过30000返回预算，观察截断明确保留，
不称逐字完整stdout；根统计和两条失败详情未截断。文档追加发生在
上述终态复核之后，不称追加后全repo文档摘要仍是冻结值。

同源同权限隔离两个原用例2 pass/17名称过滤skip（8750.42756ms），
原整个测试文件19/19、无skip、26267.104103ms；两个真实SDK冷用例
各约4.2～4.3秒。未放宽5秒、换小SDK或预查答案，也不把整轮FAIL改PASS。
独立CPU归因首轮查询通过但SIGTERM收尾无CPU文件，失败观察保留；临时
脚本改用标准shutdown/exit后4个CPU文件实际落盘，两产品退出0。
CPU来源/摘要与脚本归档在`.bench/l08-cold-sdk-cpu-v2-attribution.json`、
`.bench/l08-cold-sdk-profile-probe-v2.snapshot.txt`，临时mjs已移除。
两Worker的createProgram采样inclusive3480.831/3383.054ms，其中
lookupIdentity1750.768/1751.047ms；最终完整校验51.530/94.589ms，
diagnostics2.746/15.903ms。嵌套时间不相加；归因不代替SLO/内存或
证明整轮超时必然由某个单一原因造成。

Node20官方Context7文档及本地v20.19.5 API探针确认lstatSync的
throwIfNoEntry:false使ENOENT返回undefined，ENOTDIR仍抛错，lstat仍
观察链接本体。新public真实Worker/stdio预算入口在semantic-readiness
既有登记中；只在私有fixture的SDK文件系统边界计数，没有LS私有mock。
首个仅直接SDK模块的fixture意外GREEN，明确不是反例；补成实际SDK
形态的相对声明依赖后，在完整精确SDK定义/真实Worker观察之后，978个
预期lstat ENOENT异常超过64预算，真实RED退出1、1 fail/13过滤skip，
1650.866468ms。父HEAD仍1b910152，原生产SDK/工程不改。

最小实现只避免预期ENOENT的异常分配：两次实际缺失观察、64祖先界限、
存在路径的lstat/native/stat/link完整身份、悬空链接与未知错误保护、
加载前后完整stamp及所有当前事实的最终扫描均保持；不缓存有效结论。
LoadedConfigurationWitness198行，test384行，FS preload41行，均≤500。
同原预算1 pass/13名称过滤skip、退出0、1112.033864ms；完整定义断言不变。
类型/build/diff检查通过。联合原冷查询/ready/未通知变更/取消恢复六入口
已终态65/65 GREEN、退出0、107686.497312ms、零fail/cancel/skip/todo；
两个原5秒冷用例各3818.125646/3816.697981ms，原边界不变。
悬空链接、缺失祖先共享和已观察目录缺失子项守卫3/3 GREEN，退出0，
33491.924667ms；其余20项仅名称过滤，不能称全文件通过。

当前source82e141f7、server9510101a、worker0266950a；同构建真实SDK
开发控制2/2 GREEN、退出0、78697.103743ms：rename P95=213.312540ms，
incoming P95=448.483314ms。每项10次/1会话，完整exact/输入不变/产品
退出0及incoming正常诊断通过；仍是candidate-ready-control，不是正式
100样本/5会话认证。原始联合、守卫和控制输出分别在
`.bench/l08-lstat-no-throw-focused-v1-output.log`、
`.bench/l08-lstat-no-throw-absence-guards-v1-output.log`、
`.bench/l08-lstat-no-throw-latency-both-v1-output.log`，分类/全样本/pins见
`.bench/l08-lstat-no-throw-current-state-v1.json`。
新生产源码已不同于36defd53e，其失败整轮永久保留为此前切片，新whole
仍NOT_RUN；全部原L08门槛保持，未提交/推送/经PR合main。

## 物理父目录复用实验：无实际收益，已撤销

父HEAD仍1b910152。f8c2155a同源码入向控制另一次447.788132ms通过，
不能消除此前558.350474ms失败或证明某个波动原因。trace-off加独立CPU
launcher仅用于归因：13真实请求完整exact/诊断/输入/退出检查通过，
实际重复请求中membership采样inclusive190.386–301.177ms，
loadedConfigurationIsCurrent180.229–244.701ms，编译器入向查询
10.904–22.799ms。校准窗口有oracle边缘成本，嵌套inclusive不相加，
不把profiler响应时间认证为产品SLO，也未证明宿主/先前rename是根因。
原始`.bench/l08-incoming-f8-cpu-window-v1.json`及同前缀profiles保留。

真实Worker/stdio的SDK叶路径预算fixture首个40声明形态意外GREEN，
不是RED；96声明形态才实际97次native解析>原64预算RED。
该历史反例的复现命令（使用归档的当时测试/fixture形态）：
Node20 `--test --test-name-pattern='same-scan physical leaf'`
`tests/semantic/semantic-readiness-lifecycle.test.mjs`，准确案例/原始结果
见`.bench/l08-physical-scan-red-v1-output.log`。单扫描有界regular-file父
路径复用使计数97→0，全部96叶lstat/stat和末尾native复核不省略。
第一轮联合146/147实际FAIL：父目录完整mtime把计数fixture的兄弟写入
也当成身份丢失。缩为regular-file父dev/ino/mode/native身份后，实验
source3edd9560联合149/149 GREEN、204223.335079ms；两轮输出均保留。

该实验隔离真实控制仍1/2，rename249.762038ms PASS、incoming
710.246248ms FAIL，十个入向样本均>当时500ms，完整exact/正常诊断/
输入/退出断言先通过。11组冻结向量终态相同，不把149项回归当性能收益。
同方式CPU再次归因配置核验200.130–218.636ms，与基线区间重叠，
没有建立真实收益；原始`.bench/l08-physical-scan-cpu-window-v2.json`
和`.bench/l08-physical-scan-latency-v2-output.log`保留。

因此只撤销本轮父目录复用代码及其性能预算测试，不还原其它既有修改。
LoadedConfigurationWitness恢复198行的原行为；原末尾全事实核验、
load-window/ENOENT/未通知变更保护不变。两条有价值的公开负例保留：
晚期SDK父路径retarget不能用相同hardlink叶stamp认证、声明大小写
未通知变更不能保留旧身份。fixture35/test412行，原实现及当前550ms
合同联合151/151 GREEN，见下面链接的当前记录，而非实验149项。
临时CPU launcher/probe归档后移除，拒绝代码快照亦保留，分类摘要
`.bench/l08-physical-scan-rejected-v1-state.json`。
当前验收授权仅为550ms，最新控制incoming596.4ms仍失败，详见
[550ms合同记录](l08-semantic-readiness.md)；没有合main或宣传实验成功。
