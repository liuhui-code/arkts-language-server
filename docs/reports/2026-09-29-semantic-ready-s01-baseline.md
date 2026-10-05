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

## 2026-10-03 追加：真实未保存引用编辑控制

本追加不改写上述 2026-09-29 基线。当前 server HEAD 是
`c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；Settings 仍为干净的
`ecc550dfaed880e04e38a2477eb7235cd50475b9`，使用 DevEco API24 兼容轨和
锁定的 `ohos-typescript@4.9.5-r10`。完整 source/build/SDK digest 和运行 flags
由[新增版本化 manifest](../../bench/references/manifests/settings-homeinitdata-edit-reference-api24.json)
固定（SHA-256 `ae25028f5a69839bc297a620785117cd907e85df65d2a91d18775ded2ef09d00`）。
目标是 `common/src/main/ets/sendable/HomeInitData.ets` 的 `HomeInitData`，
UTF-16 cursor `16:13`、`includeDeclaration=false`。先查得9处；`didChange`
仅在未保存 buffer 增加 `homeInitData = new HomeInitData();` 后立即查得10处，
新增 Location 为 `29:19–29:31`。磁盘/工程边界未变。
[编辑 oracle](../../bench/references/oracles/settings-homeinitdata-edit-reference-api24-no-declaration.json)
SHA-256 为 `b6e6f6058e780c1be14e6fc8fb7668c6afb95b1e85ea3e900bb77f6096d3b99f`。

| 新进程策略 | 首查9处 | 编辑后10处 | Node RSS peak | Node+sidecar RSS peak |
| --- | ---: | ---: | ---: | ---: |
| legacy | 7961.027 ms | 521.852 ms | 826675200 B | 870244352 B |
| indexed-batched | 4260.858 ms | 3082.670 ms | 604577792 B | 646336512 B |

两臂均为 **2/2 COMPLETE**，各自 oracle 的 missing/extra/duplicate/invalid 全0，
两臂规范化 Location 集合相等；正常自动诊断开启且最新版 v2 为空，
`inputUnchanged=true`。原始独立进程报告保存在本机忽略目录：
[legacy JSON](../../.bench/semantic-ready-s01/settings-edit-reference-legacy-final-20261003.json)
（SHA-256 `e742dfb9022bf230fd697fd7338a76d4aa7c81646c0a1a0abefffe4b3c69b446`）与
[indexed JSON](../../.bench/semantic-ready-s01/settings-edit-reference-indexed-final-20261003.json)
（SHA-256 `52ca75e4430c4725a7b3c263ba49f12432fa9491dbb3ceee876f7203313592e9`）。
请求的外部 RSS 采样实际间隔 P50 均为121 ms，不是精确50 ms峰值或 PSS。

在相同已构建产物、Settings checkout 和 SDK 上复现版本化的 indexed 输入：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-homeinitdata-edit-reference-api24.json \
  --out .bench/semantic-ready-s01/settings-edit-reference-replay-new.json
```

`--out` 必须换成尚不存在的文件；产物/source pin 改变时须先重新冻结输入，
不能把旧 manifest 当跨 build 可重放。legacy 对照用的
`.bench/semantic-ready-s01/settings-edit-reference-legacy-input-20261003.json`
是忽略的本机输入，不是已入库的可移植 manifest。公开 CLI RED/GREEN 20/20 通过
（macOS 进程采样获准）：预检拒绝重复的编辑 oracle Location，以规范化
文件+UTF-16 range 集合而非数量判断 `edit-reference` 是否真的变化；
移动位置但数量不变仍可通过。
此前控制还拒绝仅改注释却冒充 `edit-reference`，并在旧 v1 诊断被替代、
首次查询延迟时只等待最新版 v2 诊断。最终固定工作树另起的
`/usr/bin/caffeinate -i pnpm check:fast` exit0，1222/1222 tests PASS；
没有以此前在修改中途通过的1220项运行替代该复核。
两份真实报告均仅因 `READINESS_UNSUPPORTED` 以 exit1/`status=FAIL` 结束，
`gateStatus.latency=BLOCKED`。这是单次 candidate-ready correctness 控制，
不是 500 ms/P95、语义就绪、内存发布或 S01 毕业；原基线其它未测桶依然开放。

## 2026-10-04 追加：真实未保存公开 API 类型编辑控制

这是 S01 的一个独立 `edit-public-api` 控制样本，不重写前面的 `edit-reference`
证据。Settings checkout 仍为干净的 `ecc550dfaed880e04e38a2477eb7235cd50475b9`；
源码 `common/src/main/ets/sendable/HomeInitData.ets` SHA-256
`8159f9be58985d71e76cb7507fb1bf421a47cacb6aaf99cbddb9e6efc703774f`。
server HEAD `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`，本轮 dirty 输入摘要
`d5c07e5133abc5722af87282ec8961da09f90328b12a91bf1996761c4d2231a5`；
`dist/server.cjs` SHA-256
`a27fad38ba94f4315473e58577ceba9526b9bb8d0e4b48fba179112e0d9f6ad4`，
semantic/verifier Worker SHA-256 分别为
`e1302435980e8848d41da5f2260a963ae3b4637e96efcb199068946ee56df202`、
`12b44f6c546fb4f2c8b1213976bca56dc32c4b50347a9ce5fb89786a5b301d6e`；
sidecar SHA-256 `18f871605571c246ce5667f5aa65c9f4b3b851235c87ae83cf794fbb85adf6b1`。
Node `v26.3.0`、compiler `ohos-typescript@4.9.5-r10`。DevEco SDK API24 兼容轨
ETS `6.1.1.125` 声明摘要
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`；
不把它称为目标工程 API23 的同版本 SDK/DevEco 验收。

[最终 indexed manifest](../../bench/references/manifests/settings-homeinitdata-edit-public-api-api24.json)
SHA-256 `208a655cdcaf86c9cbeaf7f0e518c6c3a884394a6aae20df30a1ab700cec1925`
固定 source/SDK/backend/bundle、`indexed-batched + closure + full SDK`、
trace-off、正常自动诊断与 180 秒原 deadline。`HomeInitData` class cursor 是
零基 UTF-16 `16:13`，`includeDeclaration=false`。先查原文件，再发未保存的
`didChange` v2：将第 18 物理行 `public deviceName` 的公开类型
`string | undefined` 改为 `string | null | undefined`，编辑范围零基 UTF-16
`17:21–17:39`；不增加行、不改 Settings 磁盘/工程边界。改变的是公开成员类型，
不是注释或只增加一个引用。编辑后的[独立 oracle](../../bench/references/oracles/settings-homeinitdata-edit-public-api-api24-no-declaration.json)
SHA-256 `4e455643b4261c3766ba9e60fbfda81fa9894a1b41ae37f57ef9e92ac73e53af`。

| 新进程策略 | 原 snapshot：9处 | 未保存公开 API 编辑：9处 | Node PID peak RSS | Node+sidecar observed peak RSS |
| --- | ---: | ---: | ---: | ---: |
| legacy | 9163.725 ms | 740.101 ms | 823205888 B | 869490688 B |
| indexed-batched | 4562.509 ms | 2986.512 ms | 600780800 B | 641855488 B |

两臂均为 **2/2 COMPLETE**、各次 `missing/extra/duplicate/invalid=0`，并且
legacy 与 indexed 的两个规范化 URI+UTF-16 Location 集逐项相等。编辑没有改变
class 引用位置，因此 9→9 是经完整位置比较得出的结果，不以数量相等冒充 exact。
legacy 使用首查 oracle 作编辑后预期并在新进程证明其仍精确；随后固定上述编辑
oracle，最终 indexed manifest 又独立回放一次。两臂均观察到最新版 v2 自动诊断
0 条、正常 shutdown/exit0、`inputUnchanged=true`；v1 被 v2 取代，不要求补发旧版。
候选 catalog 两次均为 ready（1846/1846，skipped 1），仍不等于 semantic-ready。

原始独立进程报告是本机忽略的
[legacy JSON](../../.bench/semantic-ready-s01/settings-public-api-legacy-authorized-20261004.json)
（SHA-256 `a74e94b4eb7335c3f22a66e1bc83876bc5b1a2a5d1dd9702cac69dbab9c145c3`）和
[最终 indexed JSON](../../.bench/semantic-ready-s01/settings-public-api-indexed-final-20261004.json)
（SHA-256 `9136be20e61b1a13c9d25c64045da511dfb90d441616e8d7e246946a5bdc270c`）。
完整 Locations、时间线、RSS 样本、有效 flags 与进程信息都在报告中。采样请求间隔
50 ms，实际 P50 为 legacy 128 ms / indexed 127 ms；上述 RSS 是观测峰值下界，
不是精确 PSS、DevEco 比值或最终内存门禁。首次 sandbox 回放在 RSS sampler
`ps: spawn EPERM` 时停止，0 个请求，原始阻断报告 SHA-256
`93a73be6ea58f040e669cafba49c203eb93fa41e84332354d28325bfbeed81fc`；
获准只读外部采样后用全新进程完成上述两臂，没有放宽采样或 deadline。

复放最终 indexed manifest（`--out` 必须是新的不存在路径；所有 pin 必须匹配）：

```sh
/usr/bin/caffeinate -i node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-homeinitdata-edit-public-api-api24.json \
  --out .bench/semantic-ready-s01/settings-public-api-replay-new.json
```

legacy 对照仅把同一输入的 `ARKTS_REFERENCES_STRATEGY` 改为 `legacy`，当时输入
SHA-256 `1806efa764580f93daaaf40f82afcf0a46c8baf8b0913787f1c61137bd1fd3e1`；
其编辑预期仍指向首查 oracle，两个 oracle 的规范化 Location 集完全相同。
最终版本化 manifest 采用新编辑 oracle；两次真实报告自身都证明 pre/postflight
输入一致。最终 suite 均 `status=FAIL` / `READINESS_UNSUPPORTED`，
`gateStatus.latency=BLOCKED`。这是单次 candidate-ready 编辑正确性控制，
不是 semantic-ready、P95 ≤500 ms 或 S01 毕业；其他尚缺的能力和生命周期桶不变。
