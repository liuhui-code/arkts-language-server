# OP-02 请求内 resident 输入指纹复用

日期：2026-10-12。状态：IN_PROGRESS。
父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`；分支仍为
`codex/op00-query-attribution`，保留既有 OP-00／01 改动。
范围由[后续计划](../plans/2026-10-11-query-performance-follow-up-plan.md)管理，
不以 550 ms 或最终内存指标作为本切片前置。

## 成本假说与选定计算

[OP-00](op00-query-layer-attribution.md) 三轮真实 B 观察的未查引用响应区间，
每轮实际 hash update1031／7636169 字节；这些累计差量不是独占调用成本。
源码显示 `inputsFor` 为 documents 和 overlays 分别计算文本 SHA-256，
`admit` 又比对 Program 的实际文本；完整 resident 查询前后均执行该流程。
通过真实 stdio 请求、显式私有 fixture 的原生 crypto 观察进一步确认：
同一 overlay 文本在一个完整请求内实际做六次 hash，调用方为两次 inputsFor
和两次 Program 文本对照。记录调用栈用于归因，不按私有方法名断言测试。

选定的是**实际字符串到 SHA-256 的纯计算**，不是文件存在、磁盘身份、配置
有效性、Program 覆盖或 admission 结论。复用按实际字符串值，不按路径、mtime、
旧版本或监听通知；新文本产生新计算，独立请求不共享复用表。

## GREEN 表征后的职责提取

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='resident-first references bypass candidate planning|L06 selected policy reuses the complete compiler' \
  tests/semantic/resident-session-references.test.mjs \
  tests/semantic/resident-session-interactive.test.mjs
```

现有公开表征 2 PASS／0 FAIL、exit 0，4491.746674 ms，另 20 项未选中。
随后从超长 language-service 提取 resident 引用的开始／结束 admission 与完整
searched-scope 合同，strict/build exit 0，同命令 2/2、4712.962053 ms。
最终回调在两个边界分别获取当前 generation／roots，不冻结查询中可能新增的
事实；配置／磁盘 guard 仍各自执行。3375→3369 行，剩余超限是迁移债；
新增查询模块51行、resident state221行，无新增超限源文件。

## 公开 RED→GREEN

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  tests/semantic/resident-input-proof-reuse.test.mjs
```

首个 RED：请求结果和 resident 路由完整正确，但所选 overlay 原生 hash 次数
为 6，预期 1；0 PASS／1 FAIL、exit 1，1613.336959 ms，零 skip/cancel/todo。
最小实现 GREEN：1/1、exit 0，3198.734991 ms；两个独立进程分别使用默认
复用和显式关闭，两种声明策略都完整、非答案缓存／无 verifier；每次独立
请求默认1次，关闭6次。不把旧构建样本 repin 为新构建证据。

实现仅在一次同步 leased resident reference 事务内保存指纹，最多512项、
4×1024×1024 个文本 code units（UTF-16 计数，不声称进程 RSS 硬上限）。
容量不足时仍计算原 SHA-256，不拒绝正确查询。所有正常、miss、scope 不完整、
错误及取消出口经 finally 清空；不新增 source/AST owner、跨请求缓存或 LS。

当前工作分支 `ARKTS_RESIDENT_INPUT_HASH_REUSE` 缺省／1 开启，显式0恢复
原重复计算，用于同构建反事实与回退；它只影响这次事务的纯 hash。六项已选
生产默认、配置／磁盘／覆盖 fences、预算／滞回和完整 fallback 不变。
新候选尚未合入 main，采纳／回退仍待后述真实对照和完整回归。

新 executable entry 的库存 RED：0/1、exit1，229.850334 ms，另三项未选中，
原因 unclassified entry。随后明确登记 bundle-e2e，实际库存188、unit-contract89、
bundle-e2e84；没有跳过新测试。四文件完整联合27/27、exit0，103167.563388 ms，
零 skip/cancel/todo；包括引用、交互导航／编辑／恢复／取消和库存。

原始日志 `.bench/op02-resident-{characterization,extraction}-v1.stdout.log`、
`.bench/op02-input-proof-{red,green,inventory-red,focused}-v1.stdout.log`。
crypto 观察保留真实 Hash.update 返回／异常和输入字节；Context7 核对
[Node 20 Hash.update](https://nodejs.org/docs/latest-v20.x/api/crypto.html#hashupdatedata-inputencoding)
的字符串 UTF-8 语义。观察器只进入显式 private fixture，不用于正常时延。

## 返回窗口的新鲜度保护

第二个垂直切片验证执行中的磁盘变化：首次输入 hash 后，在真实第二次
Hidden.ets lstat 前把该已加载、未打开文件改成含新增引用的文本。没有伪造
stat、返回旧数据、删除 scope 或关闭诊断；跨 Worker 的一次性 marker 防止
fallback 再次修改源文件。控制只允许当前 private fixture 的该确切路径。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='a return-time disk change cannot publish' \
  tests/semantic/resident-input-proof-reuse.test.mjs
```

控制工具 RED 为“真实 return-window mutation 尚未执行”，0/1、exit1，
1604.961562 ms，另一项未选中；不是生产 guard 失效的证据。
增加真实边界控制后，完整文件2/2、exit0，5327.243837 ms，零注解。
实际 mutation 和 admit 拒绝见证通过：响应须为完整当前五位置或明确错误，
不得成功返回旧四位置。随后通知磁盘并发出 v2 overlay，五位置及最新空诊断
精确恢复，shutdown／产品exit0。保护在开启纯 hash 复用的当前构建执行。

扩展八文件完整联合 **41/41、exit0，89280.252224 ms，零 skip/cancel/todo**，
日志 `.bench/op02-input-proof-focused-v2.stdout.log`；包含无通知 SDK/package／
存在性、nested roots、候选期间编辑、独立取消及既有返回／ready 保护。
其中 readiness 的部分配置控制走 definition，交互输入控制部分关闭 R-09；
它们是原合同回归，不能全部冒充本次 references hash 复用路径的直接见证。
本次原生边界记录证明第一次为开始 admit 的 diskIdentity，第二次为返回 admit
的 diskIdentity；实际 `disk-source-changed` 拒绝，初次响应已由完整 fallback
返回当前五位置，没有发布旧四位置。不是仅在查询前修改文件的弱控制。

## 新构建有限反序校准

预声明 `.bench/op02-hash-reuse-calibration-v1-jobs.json`：先六个独立诊断 B
会话（三对，不含声明），再十二个正常 trace-off C 会话（两种声明策略各三对）。
ON/OFF 反序，仅切换本候选的1/0；resident-first固定1、六项原默认未显式覆盖。
manifest／out／stdout／metrics均为新路径；正式计时不启用 native 观察。
不追加有利采样、重跑直到PASS或同时运行重回归；全部原超时／慢值／DEGRADED保留。

源码input `3d6cc93f…`；semantic/reference-verifier/diagnostic-verifier 分别为
`18ffc320…`／`0a8231a1…`／`fae8dcaa…`。server仍为 `a2df8bb0…`，因为改动在
实际Worker/core，不改变主线程stdio入口；完整digest与工具源digest见清单。
Settings `ecc550df…`、文件输入 `4becf56c…`、API24／完整SDK digest `8098b8ab…`、
Node20.19.5、compiler4.9.5-r10、stdlib／lock／内存政策与原五场景池均不变。
这些是当前生产源码构建的新样本，不替换 OP-00／01 的旧pins。

六个 B 会话已终态：30/30 exact、实际CLI exit0、目标预查询0、三对所有pins／
driver／observer／完整原始Worker快照一致。三个OFF与三个ON的计数分别完全相同；
`.bench/op02-hash-reuse-owner-v1-audit.json` 保留全部逐文件digest、原始JSONL对应、
序列／累计单调性、实际PID独立性和switch／cache检查，审计PASS。

| semantic implementation响应→未查引用响应的累计差量 | OFF | ON |
| --- | ---: | ---: |
| hash update | 1031 | 255 |
| hash update输入字节 | 7636169 | 2151275 |
| statSync | 12063 | 12063 |
| lstatSync | 19775 | 19775 |
| native realpath | 12074 | 12074 |
| readFileSync | 0 | 0 |

hash次数减少约75.3%，输入字节减少约71.8%；没有减少两边真实配置／磁盘检查。
这些仍为累计消息区间，非RPC独占CPU或物理I/O。B的诊断时延不用于正常响应
收益判断；十二个C正常对照也已终态，18/18预声明会话全部保留。

C为60/60 exact、六对最新诊断相同、产品exit0，独立PID、全部前后pins、
有效flags及原始资源曲线审计通过；raw status FAIL／CLI1／DEGRADED仍保留。
必要输入 `@ohos.data.DataShareResultSet` 的TS2307没有被隐藏或改标READY。
新引用五对改善、一对变慢；四个非离群改善约21–28ms，编辑仍约4.10–5.41秒，
RSS五对较低、一对较高，无一致内存收益。两个大变动会话的未受此候选影响的
implementation也同向变化，不能将全部差异归因给hash。逐值、范围和全部原始
审计见[有限同构建报告](../reports/2026-10-12-op02-input-hash-reuse-comparison.md)。
不计算正式P95、不追加有利样本；修复后新源码不得借用本批pins毕业。

## 容量与真实取消控制

容量案例直接使用两个真实输入2355309／2457710 code units，单文件均低于
原4MiB读边界、合计超出4M memo边界。公开完整四位置、最新诊断及退出通过，
原生hash次数为[1,6]：超限文本诚实重算，不增长缓存或丢弃输入。
这是既有有界实现的表征，不虚构生产RED；单例1/1、exit0，2435.860334ms，
日志 `.bench/op02-input-proof-capacity-v1.stdout.log`。

取消案例在真实Worker首次native hash后建立有限5秒私有控制窗，再发送公开
`$/cancelRequest`。控制工具未执行的RED为0/1、exit1，4572.09899ms；并非
生产取消失败。实现真实控制后，首轮因测试误用terminalSnapshot读取transcript
而失败，保留日志；修正为diagnosticSnapshot后完整文件4/4、exit0，
9007.866645ms、零skip/cancel/todo。公开id50仅一次-32800，释放控制后后续
完整两位置正常恢复、两事务各有新hash，只有恢复请求命中resident，产品exit0。
日志 `.bench/op02-input-proof-cancel-{red-v1,green-v1,green-v2}.stdout.log`。

## 同大小同mtime替换的真实反例

同一返回窗把已加载Hidden.ets的`new TargetThing()`替换为等长`new ShadowThing()`，
真实恢复2020-01-01的mtime，确认size/mtime完全相同且ctime发生变化。
最初0/1控制RED因工具尚未恢复mtime；补齐工具后出现产品RED：成功返回旧四
位置，而当前应为三位置。完整文件4/5、exit1、11108.050161ms；重复单例0/1、
exit1、2220.768317ms，关闭hash复用也0/1、exit1、2310.710391ms。
它不是新hash memo独有的错误，不能用关闭优化掩盖。

请求trace明确显示结束admit拒绝disk-source-changed，随后完整transient fallback
却再次读取旧文本并缓存旧结果。根因为DocumentAuthority磁盘文档缓存仅用
mtime/size判等，弱于原生读取及admission token已有的dev/ino/size/mtime/ctime。
正常完整返回必须更新为三位置或明确拒绝，不能只证明resident guard触发。

修改前十项原取消/读边界/编辑回退表征10/10、exit0、5692.660652ms；将
有界磁盘读取和身份职责提取到workspace-disk-source后，strict/build及同十项
10/10、exit0、5915.293228ms。document-store1945→1860行，新模块93行；
保留剩余超限债。最小修复只将磁盘文档缓存指纹改用既有完整stat identity，
不增加读取、放宽边界、降低诊断或改变overlay权威。strict/build及完整五项
5/5、exit0、11442.350686ms、零skip/cancel/todo，当前三位置与结束拒绝均通过。
临时全请求trace诊断已清理；修复后关闭对照1/1、exit0、2490.10213ms，
另四项未选中。扩展九文件联合53/53、exit0、99268.346856ms，零skip/cancel/todo，
包括原八文件全部用例和document-store全部取消／读取边界表征。
日志 `.bench/op02-input-proof-same-size-{red-v1,green-v1,native-red-v2,off-red-v1}.stdout.log`、
`.bench/op02-disk-source-{characterization,extraction}-v1.stdout.log`。
修复日志 `.bench/op02-input-proof-same-size-fixed-green-v1.stdout.log`。
关闭控制 `.bench/op02-input-proof-same-size-off-green-v1.stdout.log`；联合
`.bench/op02-input-proof-focused-v3.stdout.log`。

当前修复构建source input `5248dc65…`，server/semantic/reference-verifier/
diagnostic-verifier为`d07c4143…`／`1b5e8324…`／`2a1e3198…`／`98d8be75…`，
完整实际pins见 `.bench/op02-corrected-build-v1-identity.json`。Settings／SDK／
sidecar／compiler／stdlib／lock／内存政策身份不变，旧3d6c对比不repin。
该冻结完整回归 `.bench/op02-whole-node20-v1*` 已终态：1610项、1608 PASS／
2 FAIL、exit1，2751949.605887ms，零skip/cancel/todo。两项分别为原403文件首次
引用id2的20秒超时，以及继承成员补全id2的5秒超时；没有结果diff证据。
before/after均1625文件、repo digest75ad4e27…，head/branch/Node/全部源码、
四产物、Settings、SDK、compiler等pins完全相同。完整日志SHA256为
`903b2e4895e80d0c37c9f137e18cbeeafe76ef0d7e6ef83a9f944500530e8c6c`；
根终态和逐身份审计见同前缀audit/state。该FAIL不被joint53或旧main GREEN替代。

恢复后只做一次原用例trace-on隔离观察，两个实际用例通过（20项未选中），
exit0、34368.673563ms。真实完整引用为13.68／16.24秒，各七批，完整SDK255源
每批不变；Program ready合计11.18／11.84秒、查询合计0.107／0.111秒。
补全3.705秒、完整三成员，诊断在补全后才执行，不能说该次受诊断排队阻塞。
日志 `.bench/op02-whole-two-failures-trace-v1.stdout.log` 及同前缀logs/server.log。
隔离PASS未复现whole超时、不是修复或唯一环境归因；没有重复整轮直到PASS。

## 请求内官方模块解析复用（2026-10-13）

OP-04 冷 CPU 栈的 native realpath 约492/482ms，主要来自模块查找的实际
lookupIdentity load-window 核验；栈权重不是重复实参次数，不据此删除 guard。
经 Context7 查询[Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)，
并核对锁定4.9.5-r10实际 d.ts/实现：createModuleResolutionCache 是官方 cache，
按目录/选项/模式处理解析；接口本身不证明已缓存输入仍然新鲜。

先增加真实 Worker 原生 stat 观察器，仅观察 private SDK 的确定 node_modules
路径，返回/异常不变。工具 RED `.bench/op02-module-lookup-observer-red-v1*`
0/1、exit1，是 preload 缺失、未启动查询，不冒充产品失败。最小观察器后
green-v1 1/1、exit0、1485.843063ms；20个真实 SDK 声明导入同一缺失模块，
40次真实目录stat，完整自文件定义/当前诊断仍正确。

在 GREEN 下提取完整 source-boundary 责任（lexical/physical root、diskless及
call-hierarchy路径失败），不缓存任何物理身份。strict/build通过，新source
5531d01d，三文件冻结26/26、exit0、49687.321780ms、零注解，所有pins一致。
log SHA `8db623d6166b923d063d2fae7d3d3eef13e86843ebe67a3a21ea08973a38ba9c`。

机制 RED `.bench/op02-query-module-resolution-red-v1*` 0/1、exit1，
1474.990996ms，仍40次 native lookup，本应在同步查询内复用。最小实现后
green-v1 1/1、exit0、2625.134154ms，默认2次／OFF40次，完整结果和诊断不变。
`QueryModuleResolution`只包裹现有 leased标准查询与其认证，第一 miss仍使用
真实 witnessed host，结束完整新鲜度扫描不变；最多32次解析后clear并走原解析，
正常/错误/取消出口finally清空。不是32个字节/对象的上限或进程RSS硬限。
相对/Harmony/package自定义路径不复用；本次 owner 切片尚未接入 transient verifier，
后述独立切片才接入并验证其真实加载保护；
不增加 owner/Worker 或跨请求 source/AST cache，不缩SDK/scope。
`ARKTS_QUERY_MODULE_RESOLUTION_REUSE`工作树候选缺省/1，0恢复原fallback；
原六项默认策略不变，未合main、未完成净收益采纳。

直接容量/变化恢复 controls-v1 1/1、exit0、6019.270326ms，四个独立真实child：
20导入OFF40／ON2，40导入OFF80／ON18，证明超限确实回到普通解析。
每组无通知missing→present后查询明确-32803、无result；切换到完整私有SDK副本
后新v2完整定义/UTF-16范围和当前诊断恢复，child exit0。不修改设备SDK。

冻结十二文件 `.bench/op02-query-module-resolution-focused-v1*`：83/83、exit0、
224872.742987ms，零注解；当前 source
`5160732d40ff4db1974c44e2219e11652402e361d8e1ef196ee37c45260e5315`，
生产/SDK/仓库前后相同。repo1639 digest
`ca6460be9e4e4652fa565e6759fa87f057f5e064915e6c7966de29438b35c09b`；
log SHA `df813735153eae7d79bd6f8af4a8b7e2bf16fbb880d9ea292dc90e3fc3941621`。
当前core3351→3282→3289仍有迁移债务；新module60/32、observer25、test434行，均≤500。

同构建有限 `.bench/op02-module-resolution-cold-off-on-v1*` OFF→ON各一次，
两项原5s继承补全/struct映射均2/2、exit0，每组17未选中，所有pins一致。
TAP用例（含初始化/关闭）OFF3764.1/3652.1ms，ON3703.8/3493.3ms，
不是RPC独占计时或正式P95，不将这两个方向的小差异全部归因给cache。
没有重跑至PASS或改变原期限；OFF也PASS，不能将全部变化归因给新cache，
更不能以四个隔离样本覆盖先前whole/403文件失败、550ms或资源门禁。
相关批次GREEN不是新whole GREEN，真实Settings净成本/资源对照及阶段采纳仍待执行。

## Transient verifier 请求内复用与加载保护（2026-10-13）

同一父修订，真实 stdio 两种声明策略分别创建独立 anchor／final batch Worker。
仅在 private fixture 启用原生 stat 观察，完整21个SDK源、范围、正常最新诊断
与 transient 生命周期不变。工具RED是缺少实际 entrypoint 身份；随后产品RED
显示四个独立verifier各40次探测。接入一次同步请求的解析scope后，各2次，
OFF仍各40；finally在postMessage前清空cache，不保留Worker/Program。
初期测试的batch事件数量/字段名错误单独保留，不冒充生产缺陷；正确联合
GREEN3/3、exit0、21732.718211ms，零skip/cancel/todo。

真实加载窗口另有正确性RED：仅在final references Worker的SDK node_modules
原生stat期间创建真实空目录，调用原生stat取得true，再移除这个确切私有目录。
调用前后目录均缺失，不伪造stat结果、不修改设备SDK。工具RED未执行控制；
`.bench/op02-transient-presence-guard-red-v1*`产品RED为成功返回两位置，未拒绝
不可靠加载（0/1、exit1、2613.260714ms，两项未选中）。

最小修复启用verifier自身的LoadedConfigurationWitness，并在cache清空后、
成功postMessage前完整检查当前输入。初版已经拒绝但丢失错误类型（-32603）；
私有Worker失败协议携带inputUnavailable并还原原有错误类，公开响应才正确
映射为-32803。默认/OFF两个独立child均拒绝、无result；随后v2 Unicode编辑
恢复精确两位置与最新空诊断、exit0。未增加READY毕业条件或改变查询期限。
上述真正GREEN日志为`.bench/op02-transient-presence-guard-green-v2.stdout.log`。

GREEN下先提取11处既有输入fence的共同责任，不缓存有效性；冻结三文件18/18、
exit0、50898.506409ms、全部身份稳定，日志SHA
`fb63abc29134dde0b6ec0cc84e02200ce903cb8975c0f542787d6bee901d8d0d`。
core3289→3282仍超限；新增/改动helper35、runtime204、parent205、observer41、
transcript337行，均≤500，不把提取当成迁移完成。

strict/build通过；新source `184490536ab824f45dc6ef631cdede821378424f15b241b73e775ffb7e3b9429`。
有限原期限三例`.bench/op02-transient-module-original-deadlines-v1*`：3/3、exit0，
42061.790627ms，另19项未选中，生产/完整SDK/仓库前后身份一致。
403文件两种声明及重复查询均完整（用例34470.6ms含初始化/全部查询/关闭）；
继承补全3828.6ms、struct定义3454.9ms同样是用例时间，非RPC独占耗时。
这次隔离PASS不覆盖旧whole失败、不证明550ms或真实净收益。
随后冻结16文件`.bench/op02-transient-module-resolution-focused-v1*`完成
115/115、exit0、419761.650966ms，零skip/cancel/todo，全部生产/SDK/仓库身份
前后一致；repo1639 SHA `fbaa62e0ee3df40c52798424e6731350cab769d5cd86e40311e11a7d804f9497`，
log SHA `3eac12cc9c7b4b84afad203387c5f96bfa4f7198753f7b320df0946e0836ad17`。
包含真实403文件、取消/恢复、SDK/package变化、batch scope及当前编辑合同。
相关GREEN不是新whole GREEN；后述真实净成本对照仍不代替正式采纳。

## 当前模块解析候选的真实同构建对照

预声明`.bench/op02-module-resolution-real-calibration-v1/jobs.json`，两种声明
策略各三对反序ON/OFF，共12个独立会话，串行、固定原五场景，不追加有利
样本、不重跑至PASS。只切换`ARKTS_QUERY_MODULE_RESOLUTION_REUSE=1/0`；
hash复用固定1，其余当前候选/六项默认保持一致。完整Settings/SDK/原oracle、
1024MiB、正常诊断不变；trace/native观察/CPU profiler/强制GC均关闭。
source仍18449053，完整生产身份见state，repo1639 SHA
`e4be49160e61ab8f3bb2f3bb3b7f481bf8cde9ef44be642427f40d0c4183a4d2`。

12/12实际终态，60/60精确完整结果、24份正常最新诊断，独立PID、完整位置
集合、版本、开关、指标文件、原始RSS去重/峰值和前后pins审计PASS；产品exit0。
`.bench/op02-module-resolution-real-calibration-v1/audit.json`保留逐文件digest与
实际采样间隔。raw均FAIL/DEGRADED、CLI1，必要输入DataShareResultSet的2307
仍在，不改标READY、不用这些样本计算正式post-ready P95或放宽原门禁。

下表OFF/ON，时间ms、Node进程RSS峰值MiB；Worker threads不重复计RSS。

| 声明策略/反序对 | 新引用 | 新增引用后 | 删除引用后 | Node峰值 |
| --- | ---: | ---: | ---: | ---: |
| 不含声明r1 | 916.8/837.6 | 6156.0/5540.7 | 5717.1/5465.5 | 1047.2/1004.5 |
| 不含声明r2 | 941.9/958.2 | 6126.4/6095.8 | 5911.6/5748.8 | 1119.5/1131.8 |
| 不含声明r3 | 910.0/898.1 | 6096.7/5886.6 | 5946.7/5671.1 | 1116.5/1130.8 |
| 含声明r1 | 884.5/885.1 | 5907.5/6005.9 | 5682.4/5569.4 | 1123.8/1116.2 |
| 含声明r2 | 951.5/978.1 | 6183.6/6224.2 | 5885.7/5872.2 | 1119.6/1128.6 |
| 含声明r3 | 968.4/947.0 | 6203.2/6208.6 | 5949.6/5863.2 | 1123.1/1118.9 |

新引用和新增引用各三对更快/三对更慢；删除引用六对更快，约0.23–4.64%，
但编辑仍5.47–6.22秒。RSS三低三高，无一致内存收益；未受同一计算影响的
前置implementation也存在会话变化，不能把全部差异独占归因给cache。
判断：原生重复减少成立，删除引用方向有局部净改善；不宣称总体稳定提速、
内存改善或550ms达标。保留有界工作树候选继续保护/回归，不扩大cache或
修改物理guard；当前whole GREEN、剩余直接窗口和正式采纳仍待完成。
新`.bench/op02-transient-module-resolution-whole-v1*`整轮验证接着串行启动，
不与本批正常计时重叠，终态出来前不授予PASS。

该整轮现已终态：**1640/1642 PASS、2 FAIL、exit1**，零skip/cancel/todo，
生产/完整SDK/仓库前后身份一致。log SHA
`769ee6544dc7bd2306ba47f8a0605b9d82513ff58cc293eb989e431a93717ef2`；
source仍18449053，repo1639 SHA
`f2b743ace2197aab4308a88e4b796ecf636a7e3296cdaefd53f12d62124dde41`。
三个原超时在本整轮均通过、期限未变：403文件引用用例36731.5ms，继承补全
4042.9ms、struct定义3952.3ms（均为用例时间，不是RPC独占耗时或P95）。
剩余两个失败是`references-batch-search-coverage.test.mjs`的悬空Poison.ts
加载与800个缺失相对路径在Absent目录创建后的查询，实际均-32803、无完整结果。
前者旧测试期待未证明配置下的fresh fallback成功；后者相对候选不经过本次
官方模块cache，五个叶文件加缺失子目录可能越过4096见证上限。两项原因仍需
关闭对照/实际见证验证，不能改断言或关闭返回保护把whole改标GREEN。

## 2026-10-13：缺失叶容量与 legacy 返回保护

父版本仍为 `a111235bc4bfcb55b126752f95b3ba095f2996af`，不修改原始1640/1642
whole FAIL。有限关闭对照 `.bench/op02-loaded-lookup-cache-off-red-v1*` 同样
0/2 PASS、exit1；排除官方模块cache误用，21个未选中不计执行覆盖。

容量修复只保留实际 native false 叶查询前后观察到的父目录完整epoch：
不是推测listing、memo物理检查或扩大4096路径上限；深缺失祖先仍保留实际
首个缺失路径。已保留epoch发生变化则失效，绝不被后续加载盖成新epoch。
原命令 `node20 --test --test-concurrency=1 --test-name-pattern='negative descendants share'
tests/semantic/references-batch-search-coverage.test.mjs` 在关闭模块cache下1/1 GREEN，
15412.8ms，22个未选中。source
`781b524216d8f0faa198684a2ab3a9c6c34453a0c75bab57f693735345d2bbae`；log SHA
`1a7e3e52d7ae94600641588365b3c75683b2e90b7a12edc41b9bcbe8d3128cf6`。
冻结原三个保护文件19/19、exit0、零注解，source同上且所有前后身份一致；
log SHA `21acf1ed9578081539246f1b40f4fcaa0191e2e86fc5565304844c1d3e4b0c09`。

新增真实LSP控制 `new SDK facts between negative leaf loads`：最终transient
Worker的native stat确实观察Probe0.ets ENOENT；下一叶Probe1.ets的实际lstat
前创建Probe0.ets，不伪造stat/realpath返回值。旧控制缺失marker的工具RED单列
`.bench/op02-negative-owner-window-tool-red-v1*`，不是产品失败。
完善私有FS控制后 `.bench/op02-negative-owner-window-green-v1*` 1/1 GREEN，
6021.2ms、3个未选中；缺省和关闭cache都-32803、无成功结果。完整SDK副本
配置切换、v2 Unicode overlay后两位置及最新空诊断恢复、进程exit0。
source仍781b5242、全部pins稳定，log SHA
`d334b8cb25a6a68d3d961969d4f8d5300a653891cb553979e490da677ce0709a`。

悬空symlink的旧成功期望不能通过关闭新保护恢复：加载身份真实不可验证。
改成两种策略均明确拒绝、然后实际修复link目标并通知后恢复的公开合同，
先于生产改动运行 `node20 --test --test-concurrency=1
--test-name-pattern='an unprovable loaded lookup' tests/semantic/references-batch-search-coverage.test.mjs`。
`.bench/op02-unprovable-legacy-fence-red-v1*` 0/1、exit1：legacy在配置不可验证
时仍返回6个成功位置，证实另一处实际缺口；不是简单修改旧断言让测试通过。
RED log SHA `a06611ee77dd55e2fcb7cb6817f83f1c06db8e59512d325a2734c2bcbcd62253`。
最小修复在既有owner query lease和计时范围内，于legacy references返回前
执行原有完整输入检查；resident双admit及transient结束fence保持。
strict/build GREEN；该用例两种策略/声明政策均明确-32803、无partial，修复
真实目标、watch通知及v2 overlay后完整Location集等于fresh legacy、最新诊断
为空、实际配置失败原因仍可观察。`.bench/op02-unprovable-legacy-fence-green-v1*`
1/1 GREEN、4879.7ms、22个未选中，所有前后pins稳定；source
`ef30254b3145dd8553a033466b2e67c5601f8729414e12d0dabf6aecd839e64f`，log SHA
`88494b4d9e2da908db6a0f545728870929b2546bd3f123412f2d18dba4ffeb84`。
type-engine500行，改动未触及core3282行迁移债务；fixture/test/helper均≤500行。
下一步冻结包含原失败文件的完整相关批次，再做fresh whole；局部GREEN不关闭
阶段采纳、并发/multi-root保护或OP-06/L08最终资源/时延门禁。

## 2026-10-13：整轮1642/1643与 source-root 模型重载

包含原失败文件的17文件冻结批次 `.bench/op02-negative-owner-legacy-focused-v1*`
已139/139、exit0、零skip/cancel/todo，source ef30254b及全部前后身份一致。
log SHA `48d3e6b74519017664a2997e10b677c5bf18e3ff522360237179532417644371`。
随后串行fresh `pnpm check:fast` `.bench/op02-negative-owner-legacy-whole-v1*`
已终态**1642/1643、1 FAIL、exit1**，同源码及repo1639 SHA
`ad27ac4813e50a6cdd032c16c92db01e3a6e6777e8387bfd1f31d3f9665ef8a1`，
全部生产/SDK/仓库前后身份一致、零注解；log SHA
`868bf5ae0749d9e74554266669bee6758fb43aa196260c21cfc006dc3f95437d`。
悬空link、800路径/目录创建、新SDK叶之间创建文件均在整轮通过；三个原期限
用例也通过：403文件引用36357.7ms、继承补全4192.4ms、struct定义4008.8ms。
这些是用例时间，原20s/5s RPC期限不变，不是550ms/P95或唯一原因证明。

唯一新FAIL是原 `references-depth.test.mjs` 的
`refreshes named references when a declared target source root first appears`：实际
创建entry/src/tablet及首个源文件、发送watch创建通知后，warm查询line388返回
-32803。有限一次原命令RED `.bench/op02-source-root-first-created-red-v1*`
0/1、exit1、5个未选中，1421.2ms、全部pins稳定；log SHA
`ac8f20e9892ab9bfdf5a944c6fcf1beec8f57881c31c04306dc9c58cbd381e80`。
仅现有trace对照同阶段失败，不是超时或等待未结束。

私有原生观察器首次使初始请求在另一阶段失败，单列为工具干扰
`.bench/op02-source-root-first-created-trace-v1*`，不拿它解释产品原因。
临时分层诊断在真实原LSP用例中确认：compiler=true，resolver=true，项目模型
predicate=false。新LS创建后仍复用旧模型首次加载的prospective source-root
缺失见证；原返回保护正确拒绝，但缺少新上下文的模型重载。
最小修复在现有createContext中invalidate项目snapshot/graph并由新上下文实际
重新加载；不放宽物理比较、不对旧cache restamp、不增owner/Worker或预算。
临时DEBUG代码已从生产源码清除，strict/build GREEN，type-engine保持500行。

断言未改的原创建→同大小同mtime修改→删除合同
`.bench/op02-source-root-first-created-green-v1*` 1/1、exit0、5312.7ms、5个未选中，
全部warm结果等于各自fresh完整oracle，前后全部pins稳定；source
`c2a50003472141cad29c8d7b8823fe80a39474d6387a2d0685b333f7063906ed`，log SHA
`8a992fa998c068864ec3b5e4fd20509befaa28f6f230318f4720786fb958961b`。
20文件冻结相关保护已173/173、exit0、626300.98767ms，零skip/cancel/todo，
包含原失败文件、target membership与同内容晋升。source c2a50003、全部前后
生产/SDK/仓库身份稳定；repo1639 SHA
`57f064ebdbead759098a272bcc3a90de35cedb57caceca352fdeefa5a343f13e`，log SHA
`cc08c464954e532c80bc9968839d88339c6b7a892da4486afbe6cc31bcc29ea9`。
OP-00中途失败请求证据已24/24后冻结构建；当前完整check:fast终态
**1648/1648、exit0、2551850.295631ms、零skip/cancel/todo**。证据前缀
`.bench/op02-source-root-model-reload-whole-v1*`；真实根退出且production/SDK/repo
前后身份一致。source仍c2a50003，repo1640 SHA
`670ca8ea71af9830df660f826714d43c9b6925c09304407e079e61795e93d2ce`，log SHA
`862da85ca90f3274aea3bfc344c74fe7585fc4a4ec805c682a74a16fac5bcc4e`。
原source-root创建合同5923.578015ms CASE、403文件引用34914.295455ms CASE，
均在原期限下通过；CASE总时长不是单RPC/P95。历史FAIL不改写，不归因于
唯一设备原因或某单一优化。不宣布OP-02或L08 DONE，采纳及其余直接窗口待审计。

## 阶段剩余工作

- 有限反序对比已经完成；保留全部慢值及DEGRADED，不重跑追求有利结果。
  同大小替换修复产生新源码／产物身份，原对比仅适用于所记录构建。
- 当前同大小替换最小修复已GREEN，补齐symlink、扫描中新事实、SDK/package／缺失路径
  与并发overlay／multi/nested等本候选直接路径见证；现有通用回归不冒充直接覆盖。
- 根据相同输入净成本判断采纳或回退；当前c2a50003已取得完整GREEN，
  仍不豁免剩余正确性及采纳审计，后续改码合入前需与实际head匹配的完整检查。
  历史whole1589/1601、1608/1610、1640/1642、1642/1643 FAIL均保留；
  当前原期限通过不改写它们，也不证明过往超时的唯一原因。

本批未增加既有 OP-01 的超限源文件：legacy-semantic-engine917行、proxy550行、
worker-protocol1927行；对应迁移与表征记录保留在 OP-01 TDD。language-service
本批3375→3369的剩余债务也不能因新增51行模块而视为清零。

配置、磁盘和覆盖扫描的独占成本仍未解决。本首切片不把所有核验都改成一次，
不宣布 OP-02 DONE，更不授予 OP-06／L08 的最终时延、内存或就绪毕业。

## 2026-10-15：冷启动加载目录重复成本切片

[同步请求内有界目录存在性复用](op02-request-directory-presence.md)从真实冷CPU
profile选择load-window重复路径，而非删结束guard。新增公开RED原58次目标目录
stat→默认1/OFF120；既有32次模块解析容量不变，presence只在同一query内保留
32目录/32K code units，所有出口清空、超限普通查找，原结束完整检查不变。
七文件59/59，原五失败文件一次24/24均冻结新production2303c3e7；
固定四进程正常ABBA冷补全默认2.98/3.23s、关闭3.30/3.53s，仅当前组合有限
标签比较，不是新切片独占收益、完整载荷或P95/PSS。原57/59与整轮9FAIL保留。
原源码/产物/SDK身份审计和私有observer/harness来源限制见新记录；
下一步新whole、剩余直接保护和采纳审计继续，OP-02仍IN_PROGRESS。

## 2026-10-15：纯hash子切片采纳／DONE

新增[真实SDK／并发嵌套根边界](op02-native-input-boundaries.md)在默认／0对照中
证明：原生hash中SDK变化拒绝旧resident，再由新verifier实际加载新声明并完整
返回，与fresh独立进程相同；嵌套overlay变化后父请求ContentModified、无result，
新请求两声明策略完整5/6位置及最新诊断正常。没有生产代码改动或公共期限放宽。
原私有观察器重复创建屏障的工具FAIL、过严SDK拒绝期望、未配置合法嵌套依赖
及释放屏障前等待的测试FAIL均保留；不冒充产品缺陷或SDK不兼容。

十完整文件84/84、exit0、零注解，247351.873691ms，全部源／SDK／产物稳定，
真实PID退出；audit SHA
`64bb567acab287504296aaba0e2e9b292a7e48431e94503cc0709b1efaf15b25`。
最近冻结whole1757/1757中的6个相关生产文件仍字节相同；新工具headwhole待跑。

原固定18会话完整manifest／report／stdout／metrics及原Worker计数文件重读，
digest与原两个audit全等；90个原完整结果、原native输入计数和反向慢值均保留。
独立采纳audit `.bench/op02-pure-hash-adoption-integrity-v1.json`，SHA
`383773a255e1b7714026db4d34713dfa5b474544cee2a721c0b625f8f5c6db73`。
采纳请求内实际字符串SHA复用，保持缺省1／独立0、512项／4M code units和
所有出口清空。限定收益为重复纯计算减少，原新目标5/6更快；不宣称编辑／RSS
稳定收益、当前构建新P95或物理内存毕业。旧3d6cc93f计时不重盖当前5cf9d618。

纯hash子切片DONE不等于整个OP-02DONE：官方模块解析／目录组合采纳与其余
实际计算热点另审计，SDK候选Map继续REJECTED。OP-00其余范围、OP-03／04／05
和OP-06全证据正例／完整矩阵／真实客户端／三平台／PSS／生命周期仍继续。

## 2026-10-15：OP-02选定切片完成

[模块／目录组合](op02-request-directory-presence.md#2026-10-15选定模块目录组合采纳)
已按原固定12正常会话／四冷ABBA及当前36/36保护完成有限ADOPT；新／新增引用
3/3快慢、删除6/6快、RSS混合，不宣称整体或当前构建性能。原18纯hash会话和
直接84/84保护另保持；SDK候选Map因无净收益REJECTED，不重新开启。
主计划逐项索引容量、开始／结束、执行中新事实、SDK／package／symlink／同大小
替换、并发overlay／multi/nested／取消／scope与代码回归证据。以上完成原选定
复用切片及采纳决定，不新增可选计算热点为OP-02完成条件。
OP-00其余归因及OP-03／04／05／06和全L08目标仍继续，新工具headwhole未跑。
