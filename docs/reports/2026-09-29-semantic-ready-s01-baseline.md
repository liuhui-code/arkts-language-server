# S01 Settings prepared-query 基线

日期：2026-09-29。阶段：**harness 已实现，候选就绪对照已采样；S01 未毕业**。
两个真实 suite 都报告 FAIL / `READINESS_UNSUPPORTED`；不宣称总体 500 ms。
本轮不推进 S02，不修改生产策略。工程入口见
[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)，
[TDD](../tdd/semantic-ready-prepared-suite.md)。

## 固定输入

- Server HEAD：`911ae43c274175614559b63f0311504747d8393d`，分支
  `codex/references-resident-fast-path`；dirty source 是前序改动，逐文件保护。
- Settings checkout：`.bench/real-projects/settings-ecc550`，commit
  `ecc550dfaed880e04e38a2477eb7235cd50475b9`，pre/postflight clean。
  工程 compile API23 / target20 / compatible20；本次是用户授权 API24 兼容轨，
  不替代匹配 SDK / DevEco 验收，也不修改工程配置/依赖/边界。
- SDK：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，
  API24，ETS `6.1.1.125`；声明 digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
- Node `v26.3.0`，pnpm `8.3.1`，compiler `ohos-typescript@4.9.5-r10`。
  实际 OS/CPU/RAM、产物/源码/backend/lockfile/gates hashes、flags 与启动参数
  全部写入 JSON；两次 `inputUnchanged=true`，服务正常 shutdown/exit0。
- Manifest：[without declaration](../../bench/references/manifests/settings-semantic-ready-s01-api24.json)、
  [with declaration](../../bench/references/manifests/settings-semantic-ready-s01-declarations-api24.json)。
  seed `20260929`，suite digest 分别
  `ca6708e0ecf678ddb106e570b5e3733e8ba7c0563e6add0e5213f8dbee4b6abe`、
  `63943ca4f09e78fef1edb55221d636f79e40b1c52873a5fb1095a196ab08b66e`。
  本次为固定顺序控制回放；seed仅记录，未用于随机选取/打乱场景。
  without-declaration池有3个 anchor，但只有2个符号拼写，constructor/class是不同域。

### 实际 flags

`indexed-batched`、batch roots64、`closure`、SDK `full`、retention `dispose`、
budget1024 MiB、trace0、anchor reuse0、resident fast-path0、constructor scope0、
conservative semantic units0、local export anchor0。
`ARKTS_*` 继承值先清除再显式注入；临时 index/logs 各 suite 独立。
本次与历史 opt-in 路径不同，不能以耗时比值直接宣称产品回归或优化收益。
LSP 请求 timeout 与诊断观察 timeout 都为 180000 ms，未延长。

## 可执行回放

同一已固定输入上执行；`--out` 必须是不存在的新报告路径，不覆盖证据。
完整旧 CLI 保留。macOS 需允许 sampler 只读 `ps` 目标 PID。

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-semantic-ready-s01-api24.json \
  --out .bench/semantic-ready-s01/settings-baseline-replay.json

node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-semantic-ready-s01-declarations-api24.json \
  --out .bench/semantic-ready-s01/settings-declarations-baseline-replay.json
```

实际采样命令使用 `/usr/bin/caffeinate -i` 包装以上 runner，防系统睡眠。
两个命令均 exit1：`PREPARED_SUITE=FAIL`、`READINESS=READINESS_UNSUPPORTED`。
原始 artifacts（本机 `.bench`，不是已提交证据）：
[第一组 JSON](../../.bench/semantic-ready-s01/settings-baseline.json)、
[第二组 JSON](../../.bench/semantic-ready-s01/settings-declarations-baseline.json)。
其中 `requests` 保留完整规范化结果/diff，`timeline` 保留协议时间线，
`memory.samples` 保留原始独立采样曲线，`serverEvents` 保留运行日志。

## 就绪与时延

两个进程 catalog 都由 `index.catalog.terminal` 证实 ready：1846 文件，skipped1。
进程启动/采样/initialize/catalog 合计分别 **12.425 s / 9.223 s**。
这不是 time-to-semantic-ready；后者为 null，准备期间 target queries=0。
当前没有 generation/input/capability-bound 的服务器公开语义就绪合同。
不存在通过 sleep、catalog 或测试提前查询目标池来认定 semantic-ready 的做法。

位置均为 zero-based UTF-16；两种 declaration policy 分新进程，不混为 unseen。

| 同 snapshot 首次 / 编辑请求 | cursor | declaration | exact Locations | 实际完整响应 |
| --- | --- | --- | ---: | ---: |
| MenuController constructor | MenuController.ets 90:17 | false | 267 | 126714.222 ms |
| MenuController class | MenuController.ets 70:13 | false | 247 | 7466.730 ms |
| HomeInitData class | HomeInitData.ets 16:13 | false | 9 | 5299.094 ms |
| constructor 未保存 body edit 后立即请求 | 90:17 | false | 267 | 124880.936 ms |
| MenuController class（独立进程） | 70:13 | true | 248 | 6991.013 ms |
| HomeInitData class（独立进程） | 16:13 | true | 10 | 5532.416 ms |

`MenuController.ets` 位于 `common/src/main/ets/core/controller/`，
`HomeInitData.ets` 位于 `common/src/main/ets/sendable/`。
body edit 只把97行 `return this.menu?.key as string;` 加成括号表达式，
不增删行/目标 occurrence；输入为 pinned TextEdits，磁盘文件未改变。

| repeated-snapshot 对照 | 请求数 | P50 | P95 | max | >500 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| without declaration | 30 | 2.137 ms | 2.889 ms | 3.031 ms | 0 |
| with declaration | 20 | 2.112 ms | 2.806 ms | 3.163 ms | 0 |

日志分别有30/20条 `references.cache.hit`：这说明已有 exact-result cache
有效，不证明未缓存首查、未打开模块或编辑后也达标。所有请求当前只是
candidate-ready control；报告的产品 latency gate 仍 BLOCKED。
首次桶只有3/2条、编辑桶1条，不能将 nearest-rank P95 当 release 统计结论。
不将缓存50条与慢首查/编辑混为一组平均值。

## 正确性、诊断与内存

**56/56 请求 COMPLETE，URI+UTF-16 range exact，missing/extra/duplicate/invalid 均0**。
没有 references timeout/error/crash/OOM；这不代表整个 suite PASS。

普通自动诊断保持开启。第一组 MenuController version1 未在180s内被 observer
匹配，诊断观察 gate FAIL，整个 correctness gate FAIL；Home version1为空，
MenuController version2有原有 TS2307。第二组两份 version1 诊断被观察到，
Home为空，MenuController为1条 TS2307，因此观察 gate PASS。
该 PASS 只证明发布被观察到，不证明 SDK 语义/诊断 golden 已毕业。
TS2307 指向 line19:28–51 的 `@ohos.systemparameter`；保留未解决记录。
第一组期间也有 didChange，不能凭 observer 超时断言服务器从未发布过旧版诊断。
现有公开合同在 references 期间 quiesce 诊断、变更后只发布最新版；
因此这里的FAIL是本次baseline observer未匹配，不是已诊断出的生产诊断回归。
后续诊断新鲜度验收需区分被取代版本与最后有效版本，不能要求补发过时诊断。

| 外部 RSS（bytes） | 第一组 | 第二组 |
| --- | ---: | ---: |
| Node PID peak | 910729216 | 809508864 |
| Node+Rust sidecar peak | 954933248 | 854122496 |
| sampler peak（独立，不加入产品） | 127746048 | 121176064 |
| harness event peak（独立，非全程精密 peak） | 133472256 | 144416768 |
| 样本数 | 1889 | 178 |
| 实际间隔 P50 / P95 / max | 148 / 159 / 252 ms | 141 / 150 / 164 ms |

请求采样间隔为50ms，实际间隔较大，以上是 **observed peak 下界**，不冒充精确50ms峰值。
Node whole-process RSS只计一次，不叠加 Worker thread RSS。
macOS RSS不替代 PSS、DevEco、post-eviction 或原最终50%/原 >3GB门禁。
没有强制GC、heap snapshot、修改预算或延长超时。

## 覆盖缺口与阶段出口

- 当前只有 references 的合法 Location oracle；definition/implementation等实测 NOT_RUN。
- 已运行 first-unseen-symbol、repeated-snapshot、edit-body；其他5桶 NOT_RUN/BLOCKED。
- 三个实际 cursor 全在 common；其它模块的 occurrence 不是已验证 cursor oracle。
  不把 didOpen 后的查询称为 first-unopened-module；缺独立 oracle 时明确 BLOCKED。
- references/public-API edit 的新 snapshot oracle、真实 eviction/restart 控制尚缺。
- harness 已支持显式规划桶，无法验证的 unopened/eviction/restart不发请求且标记 BLOCKED；
  未规划的桶不出现在 summary 中，**不能据此默认为 PASS**。
- 无 semantic-ready 信号：ready FAIL；产品 latency/memory BLOCKED；平台/lifecycle NOT_RUN。
  S01最小可运行工具/失败基线已交付，但完整桶验收未完成，S02未自动启动。

公开 focused初轮27/27；review 补两个公开RED并修复后 **29/29 PASS**。
硬化的是未执行桶/capture failure不能报PASS、编辑后不同目标需要新oracle；
两份真实 manifest 未触发这些边界，完整回放数据未重写。typecheck/build/native prerequisites PASS。
本轮最终 `/usr/bin/caffeinate -i pnpm check:fast`：**1147/1147 PASS，exit0**，
零 fail/cancel/skip/todo，Node测试 duration `1542727.009706 ms`；不挪用历史1133/1133。
whole gate前后452份受验source/test/script/config/benchmark输入字节未改变；
本轮开始时357份非本阶段生产/配置等保护文件字节未改变。
最终SDK/源码/产物/backend/lock/gates pins同时匹配两份实测报告，
`git diff --check`与文档链接检查PASS。回归GREEN不改变两份实际suite的FAIL。
没有提交、push、创建 Issue/PR 或合并。
