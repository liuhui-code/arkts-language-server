# S02 compiler facts spike：隔离公开 CLI TDD

日期：2026-09-29。Parent revision：`911ae43c274175614559b63f0311504747d8393d`。
范围仅独立 spike、fixtures、测试和治理文档；生产行为不变。

## RED → GREEN

| 命令 | 实际 RED | 最小 GREEN |
| --- | --- | --- |
| `node --test tests/semantic-facts-spike.test.mjs`（初始单例） | CLI 正常运行但明确 `NOT_IMPLEMENTED`/exit42；不能回答未查过的函数，1 FAIL/exit1 | 单次批量绑定提取；提取子进程退出；facts-only 新进程回答；另一个 compiler 子进程作 oracle |
| 同命令（alias known-range characterization） | 2/3 PASS：按 JSON 字符串排数字造成 `16` 排在 `9` 前；另有人工期望 import span 的一列录入错误 | 独立核对原文修正期望为22–30；位置按路径 ordinal、行列数字排序；不改 oracle |
| `node --test --test-name-pattern='comparison rejects\|experiment rejects' tests/semantic-facts-spike.test.mjs` | 0/3 PASS/exit1：额外/重复 ID 被忽略；query 缩短或 source 注释改变后仍错误 SLICE_PASS | 冻结 source/query/事实身份，核对双方完整计划分母及 compiler identity；变化 exit2、保留部分证据但不发布 PASS |
| `node --test --test-name-pattern='extraction host forbids' tests/semantic-facts-spike.test.mjs` | 1 FAIL/exit1：调用全工程 references 未被阻止 | spike host 两个 references 入口禁止调用；提取使用该 guard，实际调用数0 |
| `node --test tests/test-layer-manifest.test.mjs` | 3/4 PASS/exit1：新测试未分层 | 注册 unit-contract；公开 audit126 entries、unit63 |

第一次实现的 LICENSE.txt 路径错误导致 ENOENT；修正为实际 LICENSE，
这是工具实现错误，不计 semantic RED。首次使用 fs.watch 的负例因宿主 EMFILE
不能运行；改用5ms观测 evidence 创建的 polling 后，上表3个真实 RED才成立。
Polling 不用于产品准备、性能采样或伪造 ready。

## Characterization 和停止线

普通导出、import/re-export alias、namespace string、shorthand、同名隔离的
known ranges 与 compiler oracle 双重精确校验。两种 declaration policy 分开。
oracle 跟随生产 `definition → findReferences`，并同时过滤 compiler isDefinition
及 canonical definition spans，不能使用 alias 光标原始 findReferences 替代。

构造函数测试 **GREEN 地验证假说 FAIL**：class control 相等；constructor false/true
各漏2/3个位置，返回 UNSUPPORTED而不是complete空结果。测试通过不计S02语义PASS。
提取不预查询目标；consumer不加载compiler、不持有Program或答案cache。
另有删除原输入后仍可消费事实、诊断error不能PASS、拒绝覆盖已有证据等公开负例。

## 验证

```sh
node --test tests/semantic-facts-spike.test.mjs \
  tests/ohos-typescript-spike.test.mjs tests/test-layer-manifest.test.mjs
pnpm check
```

最终 frozen source 的 focused：**41/41 PASS、exit0**，0 fail/cancel/skip/todo；
Node duration `35992.067456 ms`。新测试10例，既有spike27例，registry4例。
`pnpm check` PASS/exit0。第一轮同focused为40/41：旧 façade外部RSS测试
因沙箱 `spawn EPERM` 失败；获准只读ps后完整重跑通过，未延长deadline或删测试。

本阶段未重跑整套 `pnpm check:fast`，未请求合并；S01的1147/1147是历史独立证据，
不能算成本阶段whole gate。修改的手写script/test都≤500物理行；既有924行spike
测试未修改或增长。实际回放、资源口径和S03阻断见
[唯一S02报告](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)。
