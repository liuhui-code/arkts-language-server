# Semantic-ready 治理文档整合记录

日期：2026-09-29。范围：用户要求补充 Feature Ledger、ADR、MoSCoW 与未来计划。
**仅文档；S01–S12 未实施。** 不创建/修改 GitHub Issue，不提交/push/PR/merge，
不改变 production defaults、SDK、真实工程、源码、tests、scripts、crates、config 或 artifacts。

## 实际基线与来源

| 项目 | 本轮只读记录 |
| --- | --- |
| HEAD | `911ae43c274175614559b63f0311504747d8393d` |
| 分支 | `codex/references-resident-fast-path` |
| 工作树 | 此前已有 source/test/script/docs 和用户 AGENTS 未提交改动；全部保留 |
| Node / pnpm / Cargo | `v26.3.0` / `8.3.1` / `1.95.0 (f2d3ce0bd 2026-03-21)` |
| package pin | `typescript` alias → `ohos-typescript@4.9.5-r10`；manifest pnpm `8.15.9`，未安装/升级 |
| lock SHA-256 | `ece84ab0afea7a411c453aac7371f0e47381455c5e3cc03f639adff9d2bf1131` |
| 附件 SHA-256 | `bc25fa32471793a723421e612d6e9bb7bb751e7b4674014f19f3cc4b691e727a` |
| 用户 AGENTS SHA-256 | `c5557997b071c23d6965ec240969333d0711a0412ebe2c30f075debffdd3028e` |
| 非 docs 保护范围 | 602 个 git tracked/可见 untracked 文件，排序记录 path+内容 SHA-256 后再哈希 |
| 保护范围聚合 SHA-256 | `eba4d2c11348b68778b6ba15384971f051234a46f7d946b0be3b081027f76931` |

Settings 沿用 [现有固定 manifest](../../bench/references/manifests/settings-menucontroller-constructor-literal-roots-api24.json)：
`ecc550dfaed880e04e38a2477eb7235cd50475b9`、API24/6.1.1.125，declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
这是授权兼容轨的历史输入引用，本轮没有加载 SDK、构建或重新测量。

## 文件落点与状态纠偏

- 当前顺序：[2026-09-29 plan](../plans/2026-09-29-semantic-ready-execution-plan.md)。
  旧 09-20 plan 保留全部 dated evidence，顶部只标接续关系；architecture 入口同步。
- [原 Ledger](../plans/references-feature-ledger.md) 保持唯一活跃台账，R-01–R-20 不重编号；
  新增 R-21–R-29。R-09 使用本地“已实现/default-off/未毕业”，不退回附件旧 Research 状态。
- [原 MoSCoW](../plans/references-moscow.md) 增加唯一当前优先级，将旧正文明确标作历史。
  R-13 保守增量和 R-14 spike 提升 Must；不是生产方案批准或性能 PASS。
- [ADR](../adr/README.md) 0007–0013 无编号冲突；0007 记录需求，0008–0013 Proposed。
  原 0001–0006 正文未在本轮修改，不自动 supersede transient/default/compiler authority。
- [入口](../plans/semantic-ready/README.md)、[产品](../plans/semantic-ready/product-contract.md)、
  [设计](../plans/semantic-ready/design-contracts.md)、[验收](../benchmarks/semantic-ready-acceptance.md)
  按职责拆分，未复制离线包第二份 Ledger/机器状态/运行时配置/工具。
- D-01–D-09 是本地草案，映射首批 S00/S01/S02/S05，后续 S03/S04/S06/S07/S08。
  #85 只作为父追踪链接，本轮不修改其旧正文/验收。其它能力随后独立拆单。
- S02 FAIL 阻断 facts/schema 下游；S05 仅依赖 S01。初次准备时延单列，正常编辑/新符号/
  新模块/回收查询仍受 500 ms；原 >3 GB、50%、DevEco/PSS 等门禁不关闭。

## 文档 RED 与验证

Parent 为上述实际 HEAD，且检查作用于保留前序改动的工作树。
整合前以下实际命令 exit **1**：五份预期治理文档缺失。
这是文档存在性 RED，**不是 LSP/性能 RED**，没有人为破坏源码：

```sh
node - <<'NODE'
const fs = require('node:fs'); const assert = require('node:assert/strict');
const expected=['docs/plans/2026-09-29-semantic-ready-execution-plan.md','docs/plans/semantic-ready/product-contract.md','docs/plans/semantic-ready/design-contracts.md','docs/benchmarks/semantic-ready-acceptance.md','docs/adr/0007-semantic-readiness-and-500ms-slo.md'];
const missing=expected.filter(p=>!fs.existsSync(p));
assert.deepEqual(missing,[], 'semantic-ready governance documents have not been integrated');
NODE
```

| 检查 | 本轮终态 |
| --- | --- |
| 存在性 RED 后复验 | PASS / exit0；原五份缺失文档全部存在 |
| 相对 Markdown 链接、ADR/R 编号、D 草案 DAG 和阶段状态 | PASS / exit0；18 文档、390 相对链接、R-01–29 连续唯一、7 新 ADR、9 草案无环；S01–S12 NOT_STARTED |
| 602 文件保护范围、AGENTS 与原历史正文 | PASS；聚合 hash/HEAD/AGENTS 与前置相同；Ledger、MoSCoW 与旧执行计划历史正文保留 |
| `git diff --check` | PASS / exit0 |
| `node scripts/bench/replay-references.mjs --help` | PASS / exit0；未出现拟议 `--prepared-suite` |
| 产品 `check:fast` / Rust / 构建 / real SDK / 性能 / memory / 平台 | NOT_RUN；本轮没有代码变更或请求合并 |

首轮依赖表自检 exit1：简化解析将 D-04 的“独立于 D-03”说明误当成前置。
把说明移出前置单元格后，实际依赖仍仅 D-02；无环/完整性复验 exit0。
相对链接检查包含历史文档链接；ID 检查拒绝重复 ADR、未知或循环草案依赖与未来阶段冒充已实施。
独立只读审阅未发现阻断性矛盾。以上都是文档/范围检查，不是公开 LSP 测试。

原 1133/1133 是 [此前源码切片](2026-09-29-settings-constructor-literal-roots.md)
的历史完整回归，不算新 readiness 产品测试。文档 GREEN 不代表任何能力已达 500 ms。

## 后续

下一可实施阶段为 S01：先扩展原 runner 的 prepared-suite/report 合同并固定实际失败基线。
S02 做可否决的批量事实实验；S05 独立测预算内复用。未满足前置不进入生产 schema/路由。
