# OP-06：公开完整回归证据采集

日期：2026-10-15（相关运行UTC2026-10-14）。状态：本切片相关GREEN，OP-06/L08仍IN_PROGRESS。
父修订a111235bc4bfcb55b126752f95b3ba095f2996af，分支codex/op00-query-attribution。
不改生产owner、六默认、完整scope、1024MiB、原期限、550ms或原内存/样本门槛。

## 可重放入口

```sh
node scripts/bench/run-retained-regression.mjs \
  --prepared-suite PINNED-SUITE.json \
  --pnpm /absolute/path/to/pnpm.cjs \
  --out .bench/NEW-PREFIX
```

pnpm参数是可由当前Node执行的实际JS启动器，可为pnpm/pnpm.cjs/pnpm.js；不走shell。
例如本机现有`/usr/local/bin/pnpm`。固定执行原`check:fast`，不是自选测试子集。
suite用于冻结实际workspace/server/Workers/sidecar/compiler/stdlib/Node/SDK身份，
全部声明pins须与实际输入相同，不通过改写旧报告重新认证旧构建。
PID和退出来自真实child；stdout/stderr共同存为原字节`.stdout.log`，源码逐字
封存`-sources.jsonl`，前后仓库/构建身份、当前fast层完整选择与实际计数在`-state.json`。
schema沿用retained-regression-state/1，可用release CLI的`--regression-state`消费。

记录器等待真实[Node20 close事件](https://nodejs.org/docs/latest-v20.x/api/child_process.json)
后关闭日志并检查终态。失败spawn、非零或信号退出、缺根总计、空执行、SDK/源码/
启动器漂移和证据读取失败均保留原事实；记录失败不声称任务还在运行。
缺日志或未验证根总计时不补造计数，日志摘要也不填空文件hash。
绝不覆盖已存在的state/raw/archive；启动器前后字节不同不能认证稳定运行。
releaseEligible始终false；collector PASS只是该完整回归证据资格，非最终产品毕业。

## 公共RED→GREEN

所有前缀位于`.bench/`，Node20命令为`--test --test-reporter=spec`执行
`tests/retained-regression-collector-cli.test.mjs`；指定名称时其余是过滤项而非whole。
原日志、state、SDK/产物与逐字源归档保留；没有运行已完成10k/100k性能批次。

| 反例 | 最小公共行为 | 原始前缀 |
| --- | --- | --- |
| 缺公开采集入口 | 原MODULE_NOT_FOUND，真实可执行边界归档完整状态 | `op06-regression-collector-cli-{red,green}-v1` |
| 前面绿色总计、后面未完成 | counts保持null、真实child exit0保留、外层拒绝 | `op06-collector-missing-root-summary-{red,green}-v1` |
| postflight SDK失效 | 真实exit/计数/日志完整，after=null及原因，TERMINAL/FAIL | `op06-collector-postflight-failure-{red,green}-v1` |
| 启动器运行中变化 | 前后hash都保存，不能稳定PASS | `op06-collector-launcher-drift-{red,green}-v1` |
| exit0却0测试 | 原0保留，不冒充完整入口执行数 | `op06-collector-zero-count-{red,green}-v1` |
| 实际OS spawn ENOENT | 原错误与close事实保留，不能FINALIZING/崩溃丢状态 | `op06-collector-native-spawn-error-red-v2`、`green-v2` |
| 实际postflight库存命令失败 | 原completed child/counts保留，afterRepo=null、repoStable=false | `op06-collector-postflight-inventory-error-{red,green}-v1` |
| 原始raw log丢失 | 原exit保留，log/counts=null及原因，TERMINAL/FAIL | `op06-collector-missing-original-log-{red,green}-v1` |

原生退出23即使早期label绿色仍FAIL且保留code23；实际SIGTERM也不能成功。
拒绝覆盖在启动child之前完成，原文件字节与“未调用”见证都保护。
外部pnpm-boundary fixture是真实Node程序，但其输出和prepared query proof是合成
数据，仅资格采集/消费工具，不是实际check:fast运行或真实产品时延/平台证据。

spawn-error-red-v1真实7/8、exit1，原ENOENT确实发生；控制器后采样期间修复源码，
repoStable=false、包装exit2原样保留，不借作全程冻结证据。随后固定单例v2在
相同旧实现上真实0/1选中FAIL、7过滤、source/SDK稳定；恢复修复后完整8/8。
log SHA分别959fb2534afd5c5ad2b920cc5cc4e106209d3beeaaa304987406710539d7235d/
95c689c2fd2d23a629eea0f88ca13389975301fa556e714632189f1c7f3e5c73/
8a2423a863e07494ea3b07aca43f0ebe13b8c58b42d1bbd60d9c721c9493ff68。

## 实际互操作发现的输入指纹不一致

公开collector→release CLI端到端反例真实FAIL，reason为REGRESSION_ARCHIVE_INVALID，
原诊断log SHAe768d49d8eeb50be78b6f9beb8ee656307d327fac84640f9ca5540c15cbdd86c。
旧消费者和合成fixture都把production输入误算成路径/NUL/bytes/NUL；实际
capturePreparedIdentity的既有规则为路径/NUL/byteLength/NUL/bytes。
此前工具合成PASS未检出，不能证明真实采集可消费，也不改写旧结果的hash。
只修消费者及独立fixture向原生产规则对齐，逐文件/repo/库存/完整构建绑定全部
验证保留，没有删sourceInput检查。真实采集接口和公开消费接口同构建/平台19/19
GREEN，log SHAab4ffda1e63e096d1629c6f0b1c959ed431e8945ffc6536eca4d8d2f2e07ab24。
这是工具互操作，不授予合成3平台或fake-pnpm实际产品回归通过。

## 冻结相关回归

新增库存195→196、unit93→94，原精确库存3/4 FAIL保留。
九文件正常相关回归100/100、exit0/signal null，零skip/cancel/todo，66406.107327ms，
UTC2026-10-14T16:16:09.697Z→16:17:31.972Z；前后source/SDK/产物全部相同。
包括collector、regression消费者、原矩阵/RSS消费、Node根失败诊断、native前置
与原证据/库存；不是当前全部fast入口的whole。
`.bench/op06-regression-collector-focused-v1*`，log SHA
17c02b35abb37cf75a8bdefcf2385b994d12a8e3d932255c581f7579ab484a91，
独立terminal-audit SHA4d7a73e56602981677bf05ab9998f5dfa0432527fbd3242e8153b979e1a760c3。
1679个源文件archive SHAfb63a338edf25064ccc202587f74a73dfe85ec9df412a76c9ccac66b652005c0，
repo digest ee289c82a58358fd3ea484f155ce184862337cf120f4dc3591dc36a8555b3f93；真实根PID退出。
pnpm check/Node syntax/diff通过。新collector/test/fixture为133/270/13与17行，
consumer/相关test为146/269行，均≤500；旧1606行迁移债未增，没有Rust修改。

## 剩余原范围

2026-10-15更新：首轮真实公开采集已完成，1727项1718 PASS/9 FAIL、原exit1、
零注解；完整原日志/根统计/源码/SDK和PID退出经独立审计一致。
完整性audit SHA8b986396ef17f9628fcd792ee7ea4aba93d8e069050db77d3a7a5bf253c61471，
实际回归仍FAIL，不能把采集器完成当成整轮GREEN。随后原始RSS文件留存/绑定
公开RED→GREEN落回项目，相关73/73及原失败有限序列24/24均身份稳定，但未
复现原超时，不宣布修复；详见[资源文件TDD](op06-raw-resource-artifact.md)。
以下“下一步运行”保留前一检查点的历史语境；当前下一步是原9FAIL快速复现和
全部原资源/生命周期/平台/最终矩阵，不重新启动旧任务或重标旧证据。

下一步用公开命令冻结当前源码运行真正check:fast，不把fake-pnpm/100相关升级成
当前whole。原1711/1712资源资格FAIL、无总计退出和所有旧失败保留；采样区间
修复后的freshwhole仍未完成。只有原始真实终态和全部前后身份一致才能合入PR。
继续真实产品绑定、外部raw资源/OOM/≥100交替循环、生命周期/portability、
DevEco/PSS、历史大峰值/比例与全证据releaseEligible=true及336格矩阵。
OP-00–05仍按自身合同推进，不被最终550ms/PSS前置阻塞；OP-06/L08不标DONE。

## 标准失败尾部的消费检查点

真实1752/1754 whole的标准失败详情位于SPEC根摘要后；collector实际计数保留，
consumer原先误判摘要非终态。[公开CLI RED→GREEN](op06-failed-spec-tail.md)现在
仅允许非零整数／无信号退出及fail>0的标准失败尾部，仍判FAIL且保留实际counts。
zero-exit／signal／非法exit／绿色摘要／任意尾部均拒绝；八文件80/80、身份稳定。
不改旧失败或产品资格；下一步新冻结whole与全部原最终范围继续。
