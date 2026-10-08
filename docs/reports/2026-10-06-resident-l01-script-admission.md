# L01 Settings/API24：definition 冷 Program 重建的脚本晋升证据

日期：2026-10-06。状态：**归因证据通过；L01 性能 FAIL，安全/产品毕业仍未完成**。
本报告接续[诊断调度控制](2026-10-06-resident-l01-diagnostic-priority.md)，
不把用户定义跳转等待改写成自动诊断“已预热后”的毫秒数。

## 输入与复现

- 真实 `applications_settings` clean HEAD
  `ecc550dfaed880e04e38a2477eb7235cd50475b9`；两份预打开文档、正常
  自动诊断；固定 `MenuController` 248 位置 references 后，对此前未查询的
  `HomePageMenuManager.ets` 中 `HomeInitData` (`40:37`, 零基 UTF-16) 发
  `textDocument/definition`，期望一位置 `16:13–16:25`。完整路径/符号与
  oracle 见[最终构建的固定 manifest](../../bench/references/manifests/settings-resident-l01-script-fingerprint-final-api24.json)。
- DevEco ETS API24 `6.1.1.125`，SDK declaration digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`；
  Node `v26.3.0`，`ohos-typescript@4.9.5-r10`，server HEAD `72a2fa8`。
  API24 是兼容测试轨，不宣称匹配目标 API23 DevEco。最终 manifest SHA-256
  `d75a5e1624dc8a5ab59782f5b0fcb8cc7c422677c930a4d5e5352cb97620cf96`；
  它还固定了本次未提交工作树构建产物的 SHA，不把 HEAD 误称为完整源码版本。
- 命令：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-script-fingerprint-final-api24.json \
  --out .bench/semantic-ready-l01/hot-definition-script-fingerprint-final-01.json
```

该 `candidate-ready-control` 仍报 `READINESS_UNSUPPORTED`：没有绑定输入的
公开 semantic-ready 合同。CLI 因此退出 1，不是请求错误。原始 JSON 内
含请求以 50 ms 间隔采集的外部 Node PID RSS 曲线、LSP 时序、诊断、完整
规范化位置和前后输入 pin；本机实际采样间隔 P50 为 123 ms，
`inputUnchanged=true`。原始文件在本机 `.bench/semantic-ready-l01/`，
未作为产品性能门禁的已通过样本。

## 测量

在同一旧 bundle、三个独立新进程中打开 `ARKTS_REFERENCES_TRACE=1`，
先确认现象稳定（trace 会改变绝对耗时，不与 trace-off 产品时延合并）：

| 新进程 | definition 全协议 | compiler definition | 其中 createProgram | 其余全协议上界 | 精确结果 | Node RSS 峰值 |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 1,043.1 ms | 767.6 ms | 748.2 ms | 275.5 ms | 1/1 | 817,893,376 B |
| 2 | 1,029.8 ms | 781.3 ms | 761.7 ms | 248.5 ms | 1/1 | 770,846,720 B |
| 3 | 1,039.9 ms | 801.7 ms | 781.7 ms | 238.2 ms | 1/1 | 795,783,168 B |

“其余”是全协议减去 compiler definition 回调，**不**单独等于排队或
诊断耗时；首份 v1 自动诊断在第二请求开始后 152–187 ms 发布，第二份
在 definition 响应之后完成。此前[trace-off 对照](2026-10-06-resident-l01-diagnostic-priority.md)
为 824.4/703.9/691.0 ms，0/3 达到 500 ms。

新增默认关闭的 script-admission 事件后，第一条[原始回放](../../.bench/semantic-ready-l01/hot-definition-script-admission-trace-01.json)
显示第二文件的准备恰好新增 13 条 resident script、generation `257→270`，
随后 definition 的 Program 序号 `1→2`，`createProgram=824.8 ms`。
仅查看当前 128 条 lazy snapshot 缓存时无法证明其旧内容指纹，不能因此
把 `promotedFromLazy=0` 解释为从未读取。

随后在 trace-on 模式记录有界的历史 lazy 读取指纹，先得到
[构建中原始回放](../../.bench/semantic-ready-l01/hot-definition-script-fingerprint-trace-01.json)：

| 指标 | 结果 |
| --- | ---: |
| references / definition 精确位置 | 248/248；1/1 |
| 该次 prepare 新增 resident script | 13 |
| 已由 lazy host 读取 / 同源码指纹 | 13 / 13 |
| host generation | 257 → 270 |
| Program 序号 / 工程 SourceFile 首次观察 | 1 → 2；13 |
| Program roots / SDK SourceFiles | 1497 / 652，前后未增 |
| definition 全协议 / `createProgram` | 992.1 / 709.8 ms |
| Node PID / product RSS 峰值 | 827,195,392 / 876,621,824 B |

最终构建在全量 `pnpm check:fast` **1299/1299 PASS** 后，以独立新进程重放
[固定输入的最终原始结果](../../.bench/semantic-ready-l01/hot-definition-script-fingerprint-final-01.json)：

| 指标 | 结果 |
| --- | ---: |
| 输入前后 pin / 正常 v1 自动诊断 | 不变 / 两份均发布 |
| references / definition 精确位置 | 248/248；1/1，缺失、额外、非法位置均 0 |
| 第二份文档新增 resident script | 13 |
| 之前由 lazy host 读取 / 同源码指纹 | 13 / 13 |
| host generation | 257 → 270 |
| Program 序号 / 工程 SourceFile 首次观察 | 1 → 2；13 |
| Program roots / SDK SourceFiles | 1497 / 652，前后未增 |
| definition 全协议 / compiler 回调 / `createProgram` | 1004.7 / 768.5 / 749.4 ms |
| Node PID / product RSS 峰值 | 776,192,000 / 817,385,472 B |

最终结果的两项请求均为 `COMPLETE`、correctness 为 `PASS`；suite 整体
仍为 `FAIL`，唯一 readiness 原因是 `READINESS_UNSUPPORTED`，不能据此
宣称产品 500 ms 或 semantic-ready 门禁通过。外部 RSS 是整个 Node PID，
不重复相加 worker RSS。

没有未保存编辑或工程文件变更，context 未被 dispose；13 份被晋升文本的
源码指纹与之前 compiler lazy 读取相同。结合当前 host 在晋升时把
`getScriptVersion()` 从 `content-0` 改成 `1:content-0:<fingerprint>`，这高度
支持“仅因脚本驻留身份变化而使下次定义查询重建 Program”这一归因。
但日志仍是观察，不是干预式因果证明；尤其不能据此直接跳过真实文本、
工程配置或 SDK 变化时必需的重建。

## 下一步和边界

L02 仅在 L01 安全继续门禁允许后做**默认关闭**的同输入 A/B：同指纹
lazy→resident 晋升时尝试保留 compiler host version，其它真实变更仍递增；
比较完整 URI＋UTF-16 位置、诊断版本、Program 序号、全协议时延及外部
RSS。若 13 条不再触发 Program 重建且结果完全一致，才得到因果支持；
否则撤回假说。当前没有改变版本、语义范围、worker、预算或默认路由。
L01 compiler-in-flight 取消、长期资源安全和真实产品 P95/内存门禁仍开放。
