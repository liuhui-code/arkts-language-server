# OP-02：同步请求内有界目录存在性复用

日期：2026-10-15（早期运行UTC2026-10-14）。状态：选定模块／目录组合ADOPT，
OP-02独立切片DONE；OP-06／L08 IN_PROGRESS。
父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，分支 `codex/op00-query-attribution`。
范围由[后续计划](../plans/2026-10-11-query-performance-follow-up-plan.md)管理。
这是生产成本切片，不是整轮超时的唯一原因证明，也不以最终550ms/PSS阻塞前序计划。

## 冷启动反馈与三个假说

原公开collector整轮仍是1718/1727、9FAIL；失败及完整log不覆盖。
原五文件此前一次24/24并未复现整轮失败，故不把隔离PASS当修复。
先在原full SDK、原5秒期限的真实生产stdio冷补全中测量，再选择成本中心。

Node20 `inspector.Session` 在实际semantic Worker中采集原CPU profile，
Profiler.stop后保存完整字节及hash，区间按真实parentPort响应划分。
首区间3848.326ms、3045样本；parseSourceFileWorker栈约1418ms，
加载时lookupIdentity相关栈约900ms，结束freshness扫描仅数十ms。
包含启动/后台工作及采集器开销，不是RPC独占CPU或正常产品时延。

依次检验三个可证伪假说：重复加载身份查询、首次SDK解析、整轮调度/资源竞争。
本切片验证第一项的一个具体重复模式；解析未修改，第三项及原9FAIL唯一原因未证明。
Context7核对[Node20 Inspector](https://nodejs.org/docs/latest-v20.x/api/inspector.html)
和[Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)，
另检查锁定4.9.5-r10实际ModuleResolutionHost/resolveModuleName类型。
官方接口本身不授予缓存新鲜度；新鲜度仍来自原实际load-owned见证与结束检查。

私有采集RED-v1缺preload，未启动产品；green-v1误以为Worker preload时argv已含入口，
产品补全成功但未产生profile。改用实际workerData识别后green-v2 1/1，原失败保留。
原recorder未冻结observer字节，不能声称完整preload来源证明；原profile/hash/响应元数据
保留供开发归因，不作为release证据。独立审计
`.bench/op02-directory-proof-prior-evidence-audit-v1.json`，SHA
`bcd430f8e53d98b960401626f104d9a72da60076ca18a76b16c0cfc0db4cf6af`。

## 公开RED→GREEN与最小实现

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-reporter=spec \
  tests/semantic/request-directory-proof-reuse.test.mjs
```

真实私有SDK的60个声明导入同一缺失模块。RED-v1 0/1、exit1，1547.871007ms：
完整定义/当前诊断正确，但目标目录原生stat为58次，超过约定的至多2次。
log SHA `b6c68093e0c192d20902f73167b4476407d28a90113c67a0329b449f7b545d3c`。

仅修改50行的`typescript-query-module-resolution.ts`：在既有同步query作用域内
复用实际witnessed host返回的directoryExists布尔值，最多32目录、32K UTF-16
code units。首次查找仍完整执行原load-window检查；超限路径普通查找。
官方模块解析仍最多32次后clear/fallback，未扩大其容量或改Harmony/相对解析。
正常、错误、取消均finally清空；不跨请求/LS/Worker保存，不增语义owner。
完整结束新鲜度/SDK/配置/物理身份检查、原预算和完整fallback都不变。
复用沿用`ARKTS_QUERY_MODULE_RESOLUTION_REUSE`缺省/1，显式0完全恢复原路径，
无新开关；六项默认、1024MiB、indexed-batched/closure/full SDK不变。

green-v1仍FAIL：实际降至1次，测试误要求恰好2次；保留该记录。
将性能合同改为实际首查非零且≤2，非内部实现次数锁定；RED的58仍违反同一上界。
green-v2 1/1、exit0，2802.10281ms：默认1次，关闭120次；
创建先前缺失目录后，两种模式均-32803、无旧result，产品正常退出。
log SHA `af387bbfd92ad2aa05e88c4a7510a578ae09177b940473642abacfd060d9483a`。

库存RED 3/4、exit1，明确新entry未登记。加入bundle-e2e后库存200，
unit97/protocol8/bundle88，其余7；fast193，没有排除新测试。
首轮七文件57/59：旧transient观察也误要求恰好2次，库存layer count漏更新。
原两FAIL保留，独立audit SHA
`a90cf4694d526cf321d7bbf35dd4132694de6668de9dbf11cd19140c0047bf50`。
修正同一非零上界与库存后，同七文件59/59、exit0、185536.407455ms，零注解。
包括真实transient每verifier默认1/OFF40、临时true→absent和负向加载间新事实
两种真实窗口拒绝/恢复，以及取消、完整scope、SDK切换和同大小同mtime替换。
log SHA `2f2714b36f77d3580f32bd82ca967280d8e455fce8dbb94b1593b61d02ee121d`，
audit SHA `e835c9797a219fcbdddafeef42494933b7ba8dfe2aa12b07b56a9a73024717d6`。
strict/build、diff检查通过，本批手写源/测试≤434行；未修改已有超限生产文件。

## 固定正常冷启动ABBA

不启用profiler，四个独立真实进程，固定default/OFF/OFF/default，一次无重试。
API24/6.1.1.125/full SDK、原5秒期限和默认预算不变；原server log保留。
request.completed冷补全分别2975.88 / 3302.92 / 3531.34 / 3231.64ms，
四次都返回title/save/build及原生exit0。请求结束Node RSS分别
342499328 / 361504768 / 361893888 / 348778496 bytes，
只是原日志该时刻PID RSS，不是外部峰值、产品总和、PSS或回收证据。

关闭组同时关闭既有官方解析复用；比较的是当前组合，不把差值全归给新目录切片。
私有harness receipt在运行后捕获，不补造为preflight冻结；只能有限标签对照，
不是完整payload或产品P95/净内存采纳。log SHA
`d7a951ae0257c993109ed19b3f8d85ee206404f2a2f03071e6cff055f49a4872`，
原四日志/退出cohort audit SHA
`8fe4aee74959eb0a6f391753db0ebf8f0ff6530ff7db4905fd8857988566c73d`。

## 原失败文件与新构建资格

实际优化后原五文件一次、无observer/期限放宽：24/24、exit0，125127.814846ms，
零注解。403文件case仍33452.101094ms总耗时（不是单请求时延）；
编辑auto-import诊断case4698.108113ms。原完整9FAIL不被该隔离结果改写。
log SHA `a738d3889e062edf922f297bed144289e9cacdd297ad40157403f8925be3e276`，
audit SHA `73bfc0caabadbcd0d0706a1b0ed8c7628680b35b3c7242db3de4a7016b9383f4`。

59/59、ABBA与24/24均冻结1689文件，repo SHA
`e96e0a007f0d1ba047be0512606a4f238fbf2705636ce76eb6c7e5d545293d5e`，
source archive SHA `46a5bab6e46cffb2c452b86ab91154dedb92d54a7dbf1f7c051d93e111678063`。
production input `2303c3e7e11d8743332e9a8e507503d8fb1aebd6c69d757727fff2a810902856`；
server仍e832f9b6，semantic Worker543ea244、reference verifier37f44d98、
diagnostic verifierc0c3d597已改变，不能借旧构建GREEN。
原backend/sidecar/SDK digest未变，前后完整身份与真实测试PID退出已独立核对。

下一步冻结新源码/文档执行一次真正完整check:fast；不是重复旧失败批次追求有利结果。
其它OP-00–05采纳/资格审计、OOM/nativeLS/Registry/≥100循环、真实客户端/平台、
DevEco/PSS及历史>3GB/50%、完整正例/原336格仍需完成。
OP-02/OP-06/L08未毕业，未合入或push；最终550ms与内存合同不改。

新whole前磁盘仅约413MiB，未直接启动。核对旧OP-04 GC诊断为TERMINAL、
两个原PID不存在、lsof无打开文件、14份原证据hash一致后，仅删除两份自有
可再生成SQLite缓存784195584 bytes；无WAL/SHM/journal，不删数据集/raw。
删除前DB hash与原证据保留，无逐字节备份，可从输入重建缓存。
cleanup receipt SHA `f13374c65e13b544b1e60e1f780d02a66ebd24a62088a9eb4afcce63edea776a`；
随后可用约2.1GiB，仅容量观察，不将磁盘风险当旧超时唯一原因。

## 后续真正完整回归检查点

上述新构建整轮已1750/1751、1FAIL、exit1、零注解，全部身份稳定，
独立audit SHA48234d0b233bdde6ec0a201dab29bf7dfccd905ccbf7b32ecc4efe5a169fdfdf。
原九失败对应case逐项PASS，当前唯一失败为pin用例复用已有RSS输出，
不是新的目录复用或语义错误。隔离RED→GREEN后只修正该测试独立输出，
主工作树相关15/15保留原资源字节和全部保护，详见[OP-06记录](op06-pin-output-isolation.md)。
原整轮不改写、新完整检查仍需运行，不据此关闭OP-02或L08。

随后修正pin的新whole仍1750/1751，但唯一失败为原403文件含声明id4超时；
原20秒期限及全部输入保持。新增SDK候选Map虽减少探测，却在固定正常四组
未证明净收益，已撤回，不撤销本目录切片或六默认。
撤回后八文件65/65保留原guard与完整scope；当前完整回归不借局部GREEN升级。
完整数据和下一冷Program准备切片见[SDK候选审计](op02-sdk-relative-candidate-review.md)。

## 2026-10-15：选定模块／目录组合采纳

原12会话manifest／完整report／stdout／metrics重新核对，60/60位置与24份正常
诊断保持原身份18449053；原FAIL／DEGRADED及慢值不改标。新引用／新增引用
快慢各3/3，删除引用6/6快；RSS三升三降。原四进程ABBA的cohort／日志／实际
退出原hash亦全等，但来源仅有限标签／时点RSS和事后harness资格，不能升级
为独立峰值、完整payload或当前5cf9d618性能，2303c3e7身份单列。

当前五完整保护文件36/36、exit0、零注解，138664.066821ms；source／SDK／产物
稳定、真实PID退出。前缀 `.bench/op02-resolution-directory-adoption-related-v1*`；
log SHA `93cafc4b714f6b0d005da5f4c4f96774b56fb89bb938ecc5c0b8f42db4bb4cfd`，
audit SHA `1cf78a745ba5e9627fd701923d7f272a035098da8ff49edcbcf9c713e74d2bb5`。
目录容量／实际创建、SDK与nested hash窗口、取消／同大小替换、package／scope
及库存均直接通过；其它原输入保护当前十文件84/84和最近生产whole1757/1757
另保留。五相关源／保护文件与该whole归档仍字节相同，新工具headwhole未跑。

采纳当前有界同步query组合，保持缺省1／0回退、32次官方解析、32目录／32K
code units和所有出口清空，实际首查／结束freshness不复用。减少已观测重复
查找及局部成本改善支持采纳，不宣称整体稳定提速／内存收益或550ms达标。
SDK候选Map仍撤回。独立采纳audit
`.bench/op02-resolution-directory-adoption-integrity-v1.json` SHA
`356305f195538bd2c355996b20e8dfaba23dd173679b56f3c73cb9c7411d6bc5`。
纯hash、官方模块／目录组合和撤回候选已完成各自决定；不新增可选热点延长
OP-02，不减少全目标。OP-00其余归因／OP-03／04／05及OP-06原门禁仍继续。
