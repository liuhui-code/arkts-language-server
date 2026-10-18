# OP-02 请求内输入 hash 复用同构建对照

日期：2026-10-12；采纳审计2026-10-15。状态：纯hash子切片ADOPT／DONE，
OP-02其余切片IN_PROGRESS，非产品毕业。

## 冻结范围

沿用完整 Settings `ecc550df…`、API24 SDK、Node20.19.5、锁定 compiler4.9.5-r10，
原 scope／五场景／独立完整位置 oracle、正常诊断与六项默认优化。
只切换 `ARKTS_RESIDENT_INPUT_HASH_REUSE=1/0`，resident-first固定1，预算1024MiB。
[计划](../plans/2026-10-11-query-performance-follow-up-plan.md)及
[TDD](../tdd/op02-resident-input-proof-reuse.md)管理本候选，550ms最终判定仍在OP-06／L08。

新源码input `3d6cc93f…`，semantic/reference-verifier/diagnostic-verifier分别
`18ffc320…`／`0a8231a1…`／`fae8dcaa…`；stdio server保持`a2df8bb0…`。
完整pins和源digest见 `.bench/op02-hash-reuse-calibration-v1-jobs.json`。
严格预声明六个诊断B和十二个正常C，反序执行，18/18已终态；未追加有利样本。
正常C关闭trace及native观察，不与重测试或源码修改并行；全部慢值／失败状态保留。

## 实际输入操作与保护

六个真实B独立进程30/30 exact；三对actual Worker累计响应区间计数一致：
hash update1031→255（约75.3%减少），输入7636169→2151275字节（约71.8%减少）。
stat12063、lstat19775、native realpath12074不变，readFile为0。该区间可能包含
其它工作，不能当RPC独占CPU、内核I/O或完整Worker生命周期。
审计 `.bench/op02-hash-reuse-owner-v1-audit.json` 保留全部raw JSONL和文件digest。

公开stdio的所选overlay文本6→1，两种声明策略与关闭控制一致；返回期间真正改动
已加载磁盘源后，结束guard拒绝旧四位置，完整fallback返回当前五位置和v2诊断。
纯hash按实际字符串、仅一次事务复用；512项／4M code units有界，不缓存磁盘有效性。
容量及取消的当前验证进度见TDD，不用源码设计意图代替每个验收项。
后续同大小同mtime控制发现fallback文档缓存旧文本问题，关闭hash复用也失败；
结束resident guard本身正确拒绝。该修复产生新源码／产物身份，下表保留原冻结
对比的机制与成本证据，不自动成为修复后构建的采纳或回归证据。
当前修复source input5248dc65的strict/build、五个直接用例、关闭对照和九文件
联合53/53均通过；新冻结whole1608/1610、两项原期限超时、exit1、前后全部身份
一致。完整回归仍FAIL，其它直接输入保护及候选判断待审计，阶段保持IN_PROGRESS。

## 十二个正常完整LSP会话

60/60请求完整精确，六对最新诊断相同，产品exit0，全部前后pins一致；
独立PIDs、有效flags、外部RSS原始峰值／无重复PID计数和实际采样间隔已审计。
raw status全部FAIL／CLI1，因为必要输入仍DEGRADED；当前缺失
`@ohos.data.DataShareResultSet`的2307保留，不重标READY或正式SLO。

下表均为 **OFF / ON**；时间ms，Node采样峰值MiB。小样本不计算正式P95。

| 声明策略／反序对 | 未查新引用 | 新增引用后 | 删除引用后 | Node RSS峰值 |
| --- | ---: | ---: | ---: | ---: |
| 不含声明 r1 | 934.5 / 913.9 | 4399.5 / 4474.0 | 4109.2 / 4099.9 | 1078.5 / 1076.7 |
| 不含声明 r2 | 940.7 / 918.3 | 4442.6 / 4454.2 | 4183.5 / 4119.6 | 1071.2 / 1085.4 |
| 不含声明 r3 | 979.2 / 1062.9 | 4516.6 / 5143.3 | 4144.8 / 4830.3 | 1090.0 / 1066.3 |
| 含声明 r1 | 1063.9 / 1035.8 | 4759.7 / 4730.7 | 4416.5 / 4439.7 | 1090.3 / 1083.4 |
| 含声明 r2 | 1125.1 / 1103.1 | 4970.5 / 5017.5 | 4750.6 / 4777.1 | 1079.3 / 1071.8 |
| 含声明 r3 | 1411.9 / 1142.1 | 6227.8 / 5413.4 | 5789.7 / 5285.3 | 1079.9 / 1073.7 |

新引用五对更快、一对更慢，前四个非离群的改善为约21–28ms；
不含声明r3则变慢约84ms，含声明r3更快约270ms。与此同时，不含声明r3的
未受此hash候选影响的implementation也慢约251ms，含声明r3则快约369ms；
保留跨会话变动，不把这些共同变化全部归因给本候选或未经观测的设备原因。

编辑ON仍约4.10–5.41秒，OFF约4.11–6.23秒，方向亦混合。
Node和产品RSS都是五对较低、一对较高；Node最大一对增加约1.3%，无一致内存收益。
实际间隔和完整资源曲线逐会话保留；Mac RSS不是PSS，也不是原最终内存门禁。

C全量证据审计 `.bench/op02-hash-reuse-lsp-v1-audit.json`；原始
`.bench/op02-lsp-{no-declaration,with-declaration}-{on,off}-r{1,2,3}-timing-v1*`，
B原始 `.bench/op02-owner-no-declaration-{on,off}-r{1,2,3}-inputs-v1*`。
重放须新建manifest／out／metrics路径，不覆盖本批证据。

## 判断与下一项

实际重复计算减少成立，四对约2%的新目标改善支持继续完成候选审计，但不证明
稳定整体提速或内存改善。所有慢值、DEGRADED和旧whole12FAIL保留。
容量／真实取消已通过；完成同大小替换修复及其它直接变化保护、fresh whole后，
结合有效构建身份与有限同构建证据明确采纳或回退；
不再用重复该批次来追求有利数据，不以最终550ms阻塞OP-03／04。

## 2026-10-15 采纳范围

采纳单事务实际字符串SHA复用，保持缺省1／独立0、512项／4M code units及
所有出口清空；不缓存物理检查或有效性。重复计算减少、新目标5/6较快支持
有限采纳，编辑／RSS方向混合仍保留，不承诺稳定整体提速或内存收益。

当前新增SDK／并发嵌套根直接边界与原容量／取消／同大小替换／package／scope／
alias保护十文件84/84；最近冻结whole1757/1757中相关6生产文件仍字节相同。
原18会话全部manifest／report／stdout／metrics／Worker原计数重新核对hash，
audit SHA `383773a255e1b7714026db4d34713dfa5b474544cee2a721c0b625f8f5c6db73`。
上述成本只属于原3d6cc93f构建，不升级为当前5cf9d618性能；所有FAIL／DEGRADED
和慢样本保留。新工具headwhole、其它OP-02组合采纳及L08仍未完成。
