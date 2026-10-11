# L03 references 压力准入

日期 2026-10-08。接续 [多根自动回收](l03-automatic-pressure-recycle.md)，
本切片统一三种 references 路由的既有实验性 L3 停止线，不代表按实际
字节成本准入已经完成。最终内存、时延及长期压力验收仍在 L08。

## 公开 RED 与最小修复

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，RED 前源码输入
`02e07c902bc97434d62a9b95f26c016cdca05919a03d5abeb0bec4f12e7474e1`。
已有实验停止线只向 legacy L3 fallback 传入 `maxBatches=1`；indexed
和 batched 路由忽略同一压力资格，仍开始 verifier batch。

先补一个真实 Content-Length LSP 子进程用例：三个合法文件，保留正常
v1 诊断，以小夹具 1 MiB 策略触发实际 RSS L3 驱逐。显式确认 compiler
计划超过一批后，旧 indexed 路径仍返回六处 Locations，拒绝断言 RED。
不是 SDK、初始化或计划未命中；原始转录在
`.bench/l03-indexed-admission-red.log`，0/1 FAIL，1,650.990223 ms。

```sh
node --test --test-name-pattern='rejects multi-batch.*indexed-batched' \
  tests/semantic/semantic-l3-reference-admission.test.mjs
```

最小实现只区分共同的 `pressureAdmission` 与 legacy 专用的
`pressureFallback`，把既有 maxBatches 参数同时传给 indexed/batched。
计划仍覆盖原合法范围；多批时返回显式 `-32803` 资源预算错误，无成功
结果、无空数组或部分 Locations，且 `references.batch.start` 为零。
已有 batch executor 的 fallback 继续携带同一停止线，未增加预算 owner、
checker、缓存、Worker 并发或 RSS 叠加。

保留原双开关 `ARKTS_BENCHMARK_CONTROL=1` 与
`ARKTS_L01_PRESSURE_ADMISSION=1`，仍默认关闭，没有新增实验开关。
首次修复 1/1 PASS，688.749227 ms。

## 允许通过与恢复合同

首次 GREEN 后依次追加 characterization，直接通过，未伪造额外 RED：
三种路由在实验开启的 L3 下都拒绝多批；缺少 benchmark 或 opt-in 的
indexed 路径仍返回完整六处引用。单批 indexed 查询在 L3 下允许通过，
两种 includeDeclaration 策略分别精确返回六处和五处 Locations。
references 阶段不重新准入 interactive resident context。

拒绝或成功之后，definition 仍精确定位，未保存 v2 的正常版本化 2304
诊断仍发布，shutdown 退出 0，无 Worker fatal。夹具 SDK version 为
`test`，属于未验证、plain-TypeScript-compatible 合同；不是原生 API24
产品验收。1 MiB 和 batch roots 1 仅为功能干预，不调整真实工程的
1024 MiB 策略或声明新的文件数硬上限。

## 当前验证与剩余工作

`pnpm check` 和 runtime 构建 PASS；七文件串行 focused **50/50 PASS**，
0 fail/cancel/skip/todo，退出 0，146,643.322164 ms。包括八个 L3 用例、
十四个 batching 用例、retention、六个 resident references 合同、十三个
recycle 用例、coordinator lease/压力及 production Worker。
完整转录 `.bench/l03-indexed-admission-focused.log`，结构化身份与计数
`.bench/l03-indexed-admission-summary.json`。

本切片源码输入
`525d59687739787c3add6a99a43fa58b33bc3eb6fc19ae90fb0a4bae6d2da476`，
semantic Worker
`f7cf3f0cc472eaf036ee52bda28d5d28181d4825be6ac9fe1ccdfad445b3980e`。
server 主产物未变；行为修复位于新 Worker。type engine 499 行，测试
343 行，均不超过 500；其余既有超限文件本切片未修改。

当前源码 whole **NOT_RUN**；前轮多根源码的 1380/1380 whole PASS 保留，
不冒称本构建完整回归。合并前仍须 fresh `pnpm check:fast`。
本切片仅统一既有保守停止线，不把 batch 数当作真实分配字节；单批
成本、candidate/anchor 准备和诊断重叠、统一 soft budget 与成本感知
驱逐仍属后续 L03 工作，不用最终资源目标阻塞它们。
