# S02：compiler-derived binding projection v1 可证伪结果

日期：2026-09-29。结论：**所测假说 FAIL，阻断依赖它的 S03 生产事实发布/路由**。
普通导出与alias切片通过，但必需constructor query-kind不能等价。
这不是“所有compiler-derived facts都不可行”的证明；受控LS复用或上游投影hook
仍可另立假说。没有接入生产、修改默认策略或宣称500ms达标。

用户在S01失败基线后明确要求下一阶段。本轮只进行独立S02实验；
不把S01 READINESS_UNSUPPORTED/覆盖缺口重标PASS，不跨入S03。

## 固定环境与API

HEAD `911ae43c274175614559b63f0311504747d8393d`，分支
`codex/references-resident-fast-path`；原dirty tree保留，未commit/push/PR/merge。
Node `v26.3.0`、pnpm `8.3.1`，Darwin25.6.0/x64，12 logical CPUs、16GiB RAM。

实际包为 `ohos-typescript@4.9.5-r10`（npm alias `typescript`），runtime version4.9.5：

| 固定输入 | SHA256 |
| --- | --- |
| runtime | `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| public d.ts | `c07b95f8b5fa57133ddca45e56ddf0c246a3cca2a1ad82ab228f4b63f37638ae` |
| Apache-2.0 LICENSE | `a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47` |
| spike+host脚本身份 | `89eeeedf6f68cdde169eb4df4ca66881356f0bae20c2880b785bdff68e662e81` |

包元数据没有可靠upstream commit；不伪造SHA。标准库由现有spike host加载，
没有SDK；这是小型ETS语义可行性/反例，不是Settings或真实SDK压力证据。
host复用 `createSpikeProject`：ETS ScriptKind、ES2021、ESNext、NodeJs、skipLibCheck。

核查固定包 `lib/typescript.d.ts`：Program.getSourceFiles2450/getTypeChecker2474、
getSymbolAtLocation2596、getShorthandAssignmentValueSymbol2602、getAliasedSymbol2643、
forEachChild5671、LanguageService.findReferences6762。未找到公开bulk references/facts
export API。runtime虽有FindAllReferences内部实现，也不是一次全符号投影接口。
其中 `typescript.js:140741` 的string span处理和正式shorthand绑定说明必须使用
compiler语义，不可仅按identifier文本或对象property symbol分桶。
[官方Compiler API文档](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
和[Language Service文档](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
仅作参照；本实验以固定fork源码/实际输出为准。

## 实际工具与约束

`scripts/semantic/semantic-facts-spike/run.mjs`提供extract/query/oracle/run：

1. extract只接source输入，不接目标query池；一个LS/Program遍历compiler AST，
   读取原始/aliased/shorthand value绑定，输出同代declaration-span/content identities。
   host禁止references/getReferencesAtPosition入口，实际调用0。没有N次全仓预计算。
2. facts写JSON；extract调用dispose后退出。不同新PID仅凭JSON回答事后目标；
   不加载compiler、不保留Program、不使用完整答案cache。
3. 再由另一个新PID用完整fixture compiler oracle逐目标校验。
   oracle沿用生产definition→findReferences与declaration过滤规则；调用单列。
4. source/query/事实digest及compiler identity一致，全部planned IDs必须出现且唯一。
   变化不能认证PASS；诊断error是ENVIRONMENT_BLOCKED；未知选择是UNSUPPORTED。

数据只表示 `public-checker-binding-projection-v1` **假说**，不表示可信生产事实或
完整queryProjection；全程productionApproved=false。serialize/release能独立消费
是一项必要条件，不是语义充分条件。没有新的DB、RPC、Rust规则或第二checker。

## 三个串行、独立回放

原始文件位于 `.bench/semantic-ready-s02/{ordinary,aliases,constructor}-public-binding-v1/`，
每组保留facts.json、consumer.json、oracle.json、report.json及PID、输入/脚本digest。

| fixture | requests / result | exit | compiler提取内部wall | 提取完整child wall | facts实际字节 | 提取OS high-water RSS |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| ordinary | 4/4 exact，SLICE_PASS | 0 | 579.767ms | 1018.330ms | 4,878 | 182,435,840B |
| aliases | 4/4 exact，SLICE_PASS | 0 | 565.218ms | 1005.756ms | 8,635 | 182,652,928B |
| constructor | class exact；2constructor失败，FAIL | 42 | 574.290ms | 998.652ms | 4,159 | 179,290,112B |

提取Program含52/54/51 SourceFiles（包含标准库）；不是对应数量的project/SDK源码。
提取PID分别47361/47398/47412；consumer47362/47399/47415；oracle47363/47400/47416。
oracle分别4/4/3次findReferences；提取0/0/0次。
提取CPU user/system分别987177/103739、961029/98774、962159/96646微秒。

RSS为OS在内部采集点之前的进程high-water，含startup，排除之后dispose/序列化；
不是外部RSS曲线、PSS或完整产品峰值。child wall包含启动、处理、dispose和输出。
consumer内部三组总wall1.163/1.411/1.149ms，但它不是LSP时延或500ms产品证据。
每组只有一个回放，不报告P95、性能毕业或完整工程资源结论。

## 精确反例与停止决定

反例 `tests/fixtures/semantic-facts/constructor.json`，未增加工程规模：

```ets
export class Base {
  constructor() {}
}
export class Derived extends Base {}
new Base()
new Derived()
```

查询 `model.ets` UTF-16 `1:3`（zero-based constructor keyword），compiler结果：

| declaration policy | compiler oracle | facts consumer | exact diff |
| --- | --- | --- | --- |
| false | 4:4–4:8、5:4–5:11 | UNSUPPORTED，0位置 | missing2、extra0 |
| true | 上述两处 + 1:2–1:13 | UNSUPPORTED，0位置 | missing3、extra0 |

class-name control `0:13`本身exact，但不能替换constructor请求；它的3个位置
并非constructor true的3个位置。这证明“一个canonical symbol bucket适配所有query-kind”
没有通过门禁；并非findReferences数量太多或SDK不匹配导致本次FAIL。
普通alias含已知namespace string内部range、shorthand、同名隔离，两种policy均exact；
不能将这项局部成功扩为constructor/implementation/Settings证明。

按[ADR0008](../adr/0008-compiler-derived-semantic-facts.md)停止：

- S02所测public-API binding投影假说FAIL；S03生产facts/schema/publish/read BLOCKED。
- 不把constructor换成class、不补词法继承规则、不偷偷逐目标findReferences做准备。
- implementation、完整new this/super/own-constructor barrier、override/augmentation、
  Unicode/overlay与Settings压力均NOT_RUN；原Settings267及247/248 oracle不变。
- 后续可独立推进S05预算内LS复用；若重试S02，须明确新compiler派生hook/投影假说
  及反例合同，不能以本次ordinary切片放行S03。

可执行复现（输出目录须新建/不存在已有证据；**预期exit42/FAIL**）：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode run --input tests/fixtures/semantic-facts/constructor.json \
  --queries tests/fixtures/semantic-facts/constructor-queries.json \
  --out .bench/semantic-ready-s02/constructor-replay
```

验证：focused41/41、pnpm check、diff whitespace通过；
详见[TDD](../tdd/semantic-ready-facts-spike.md)。完整fast本阶段NOT_RUN，不复用S01旧whole gate。
预算、SDK、产物、项目边界、deadline、生产diagnostics和结果完整性均未改。
范围postflight：除明确获准的spike/registry/治理文件外，原1060份tracked及untracked
文件内容清单摘要前后一致：`7e907cde7586d56c0740a59a9c1aa5246ef225cab77e00042963867d8aced417`。
本轮修改的8份手写script/test分别175/50/75/138/195/163/253/289行，均≤500。
