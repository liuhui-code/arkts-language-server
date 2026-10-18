# OP-00：默认 transient 统计候选的验证与回退

日期：2026-10-17。父 HEAD `a111235bc4bfcb55b126752f95b3ba095f2996af`，
分支 `codex/op00-query-attribution`。**本候选 REJECTED／已逐字回退**；
OP-00／L08 继续 IN_PROGRESS，原 403 文件冷引用超时未修复。

## 假说与公开 RED → GREEN

原 transient verifier 在 trace0 时仍调用两次 `programFileStats()`，触发
`getProgram()`、遍历源并构造内存／阶段元数据；这些字段仅由 trace 消费。
本切片检验移除该默认工作是否带来一致净收益。另两个方向为输入保护中是否
存在等价重复工作、完整依赖闭包能否减少批次；没有删除前后 load-window 保护，
也没有重跑已收口的 403／64↔128 对照或跨批保留 LS／AST。

生产基线 ac4c136b。先运行原 trace／完整结果／native Registry 发布前释放
三个完整表征文件，9/9、exit0、零注解。父修订与命令在
`.bench/op04-disk-dependency-fence-v1/op00-observation-characterization-state.json`。
随后真实子进程、Content-Length stdio 的未打开源反例：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/op04-disk-dependency-fence-v1/run.mjs op00-statistics-red \
  tests/semantic/transient-statistics.test.mjs
```

原完整 Locations 正确，但一个真实 reference verifier 的两次 Program 统计
产生 4 次所观测 `common.d.ts` 路径访问，RED0/1、exit1，1295.831894ms。
这是统计访问，不是 4 次 Program 构建或两个 verifier；初步进展中的解释已修正。
私有 preload 只转发实际路径运算及真实 `parentPort.postMessage`，不替换查询结果。

最小候选仅让 trace1 构造 `prepared/stats/memory/timings`，trace0 不填零，
父侧类型和消费端接受实际缺失字段。语义查询、完整 scope、最终 SDK／配置
输入 guard、`dispose → postMessage → terminate` 顺序及并发不改。
第一条 GREEN1/1，统计访问4→0；随后四个公开用例4/4覆盖两种 source 入口、
两个声明策略、实际 isolated anchor、正常诊断，以及 trace1 的真实阶段／源／
内存字段。该候选测试／fixture 已随候选归档，不再留在当前工作树。

## 原失败与受控功能复核

最初库存 RED3/4 后登记新入口；漏更新 bundle 精确计数，联合首轮37/39、exit1，
另一项为 initialize 阶段超时，单例墙钟1798951.995637ms。修正100→101后，
第二轮38/39、exit1，transient SDK 负向 lookup 用例在 response2 超时，
墙钟1829116.041688ms；其余断言及原期限不变。

两次分别与原生电源日志的1803秒睡眠重叠：07:43:26 Idle Sleep、08:19:40
Dark Wake Thermal Emergency，均 +0800。原始节选分别为
`.bench/op00-transient-statistics-v1/related-host-power.log` 和
`related-v2-host-power.log`。不把这些墙钟跨度当 compiler CPU，也不由单次
CPU_Speed_Limit22读数解释所有阶段或宣称产品问题已经修复。

第二轮失败 fixture 留下 server77846／sidecar77847，阻止文件结束；核对实际
父子身份后仅对该 server 发 SIGTERM，sidecar已退出。人工收尾记录为
`related-v2-orphan-cleanup.json`，不授予自动清理／native LS 或物理释放资格。
临时 caffeinate 断言仅关联对应进程，进程结束释放；没有修改永久电源设置。

原生 CPU speed 恢复100后，同范围、同期限、同断言的单次受控复核：
11完整文件39/39、exit0／signal null、零skip/cancel/todo，105727.234125ms。
源码1750份、生产08426c8c、完整 SDK 及产物前后相同；包括 SDK 在途变化、
原 READY 取消、完整多批／seed 拒绝、默认压力诊断、coalescing 和发布前释放。
前缀 `op00-statistics-related-awake-v1`，raw SHA
`88a5572d87bb392806aae05894100da181fd99c62f233a3db18cd81ac533b343`。
两个原 FAIL 原样保留；39项不是完整 check:fast，也不覆盖本机产品门禁。

## 固定完整 SDK fallback 对照

启动前冻结 `.bench/op00-transient-statistics-normal-v1/plan.json`，旧／新／新／旧
每块两入口，共8会话，每会话初查与真实依赖编辑各运行两个声明策略。
使用完整安装 API24、34源／32真实推断 hop；不是 Settings 或 403 语料。
trace／preload／profiler／强制GC关闭，正常诊断，1024MiB及原释放／并发不变。
**两边都显式 resident-fast-path0，以测 transient fallback**；不能授予默认
resident 路由时延。旧／新 native 分别从相同父目录的独立完整产物副本启动，
出生输入 ac4c136b／08426c8c 与当前 host-source 身份分别记录。

32份完整引用、8份完整 READY、12份正常诊断、8个服务和 sampler 正常退出一致。
完整 READY 覆盖34项目／255SDK／52stdlib／402 Program源、14能力，没有缩小 scope。
下列是候选／原版的分项 RPC 比值，>1为变慢；每格只有一次，顺序固定，不混池：

| 配对 | 初查不含声明 | 初查含声明 | 编辑后不含声明 | 编辑后含声明 | 采样 product RSS 最大值比 |
| --- | ---: | ---: | ---: | ---: | ---: |
| opened正序 | 1.0598 | 0.9860 | 1.0285 | 1.0158 | 1.0078 |
| never-didOpen正序 | 1.0174 | 1.2048 | 1.1933 | 1.0374 | 0.9844 |
| opened反序 | 0.9994 | 1.0097 | 1.0561 | 0.9530 | 0.9933 |
| never-didOpen反序 | 0.9871 | 0.9994 | 1.0028 | 0.9113 | 0.9802 |

正序磁盘两项慢约20.5%／19.3%，反序没有一致对应收益。统计工作减少的机制
成立，但本次正常 fallback 完整响应没有稳定净收益；不能只选反序、某个声明
策略或采样内存宣布采纳。不追加有利重采，不把 RSS 当 PSS／连续峰值，也不作
统计显著性、550ms 或原20s超时修复声明。按本候选自身比较收口，非前移最终门槛。

独立联合审计 `.bench/op00-transient-statistics-v1/audit.json` SHA
`f100d3bc815eb7205dc05fba63fe9b266a2bebaaaefaada63d4269ec1b6d3e0b`。
原源码／命令／raw／全部响应与 RSS／正常退出及每份产物 SHA 可重读。

## 决策与精确恢复

REJECTED／NOT_ADOPTED。候选完整1750份源归档和82个生成产物保留在
`candidate-archive.json`／`candidate-dist/` 及归档所指 JSONL；8个 owned 路径中，
6个原文件恢复本轮前字节，2个本轮新测试／fixture移出工作树。没有还原其它
用户或此前改动。候选8个手写文件均≤500行；当前十份既有超限债务均未触及。

恢复后全部1748份仓库文件逐字匹配本轮开始，source digest
`fe6b5d95a332c1329c57e64a7d6c2f1c98bd6e2873dc8d7acc2bd46750c70eff`，
全部82份生成产物逐字恢复，production回到ac4c136b，217总／210-fast恢复。
独立恢复审计 `restored-audit.json` SHA
`435453a963e517ee62ff5783b3995fcc502d00fe2792e099103361ec049fd50c`。
随后只同步治理文档，不重跑已撤回候选的 whole 或把39项升级为当前完整GREEN。

原 ac4c136b 的1864/1865、exit1／403首次引用20s超时继续有效；旧1862仅旧构建。
本轮未提交或远端写入，没有新的默认／预算／能力。下一独立切片继续完整 SDK／
stdlib 冷准备、现存 owner 的实际 Program 覆盖缺口与复杂真实 closure，先给出
公开可证伪成本反例；admission仍只消费已观察的 Program，不在 admit 中新建它。
完整 fresh whole／资源／生命周期／≥100循环／客户端／平台／PSS及336格仍在原范围。
