# 取消默认 RSS 预算：TDD 与验证记录

日期：2026-10-29。父版本 `9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`，
分支 `feat/index-cache-lifecycle-20261029`。保留已有索引缓存治理修改；不提交、部署或重启用户进程。
决策：[ADR0029](../adr/0029-opt-in-rss-memory-budget.md)。
证据根：`.bench/default-unbudgeted-memory-20261029/`。

## 第一个垂直切片：公开失败，再实现无预算

RED 使用真实子进程、Content-Length framed stdio；fixture 的主语义 Worker
通过仅测试 preload 报告 8192MiB RSS，不实际分配这些内存。
环境变量 `ARKTS_MEMORY_BUDGET_MB` 从子进程环境明确删除，避免测试 helper 的1024MiB默认污染。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='an unconfigured RSS budget' tests/semantic/project-initialization.test.mjs
```

父版本产品代码 + 新测试结果：1 FAIL，公开状态为 degraded，
`unavailableReasons:["resource-budget-exceeded"]`；预期 READY。
原始 `default-public-red.log`。名称筛选导致另外9项未运行，不能称全文件通过。

最小实现只改 `config/semantic-runtime.json`、`coordinator/runtime-config.ts`、
`coordinator/memory-policy.ts`：缺省预算为 null，分类器返回L0并解除旧L3滞回；
显式正数预算保留。构建后同命令 GREEN：1 PASS，另外9项未运行，
`default-public-green.log`。之后将公开fixture的resident开关固定为真实默认，重新验证。

## 第二个垂直切片：错误显式配置不能静默越界

扩充配置接口的已有回归：正数分数MiB合法；0、负数、空白、NaN、Infinity、off、null、
小于一字节、超过安全字节整数的预算必须报错。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='runtime pressure defaults' tests/semantic/semantic-coordinator.test.mjs
```

`explicit-invalid-red.log`：Missing expected exception。
实现只补转换后安全正数字节校验；`explicit-invalid-green.log`通过。
最终协调器 `coordinator-final.log`：21/21 PASS，含无预算大RSS样本、旧L3 latch解除、
显式分级/滞回、活动lease、清理与公平淘汰等既有对照。

## 公开功能、热态与生命周期对照

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='RSS budget|no RSS budget' tests/semantic/project-initialization.test.mjs
```

`public-budget-and-reuse-v2.log`：3/3所选 PASS，另外9项未运行。

- 相同受控RSS：未配置预算完整READY；显式4096MiB首次准备READY，运行期degraded且L3驱逐可观测。
- 无预算串行6轮编辑/撤销/关闭重开，217次真实协议请求；31次每种定义、引用、重命名、悬停、
  补全、详情、readiness，精确校验完整位置、编辑及未保存内容。
- 每轮未变化输入的重复查询具有同一Program/输入身份；稳定owner数1，只有1次主Worker创建，
  没有RSS驱逐；末次metrics租约及verifier活动任务为0，shutdown/exit为0。
- 原始逐请求耗时、generation、真实heap与合成RSS分别在日志及 `public-mixed-evidence.json`。
  不把测试报告RSS8GiB当实际8GiB压测，也不把6轮当30K长期稳定或无泄漏证明。
- `public-budget-and-reuse.log`保留初次混合用例的错误期望：在import局部绑定发rename
  得到合法别名编辑，测试原先误认为全局rename；改从声明发起后精确验证完整编辑。
  没有为此修改产品rename语义或放宽断言。

## 最终候选验证

固定Node20.19.5/pnpm8.15.9，输入和产物SHA见 `candidate-identity.json`。
TypeScript `typecheck.log`与测试清单 `manifest.log`均退出0。

```sh
PATH="$PWD/.bench/index-cache-lifecycle-20261029/tool-bin-node20:$PATH" pnpm check:fast
```

Windows隔离副本21/21协调器、3/3所选公开预算/热态用例PASS，9项名称筛选未执行；
关键源码SHA与Mac一致，重新构建产物哈希和全部日志保留在`windows-results/`。
另用既有compiler/Registry观察seam，在Windows无预算/合成高RSS下补2/2生命周期诊断PASS：
初始化1次构建后20次热定义不增加，编辑新增1次后10次热定义不增加；配置和关闭项目引用归0。
3次snapshot失败项目租约均0，第4次同版本成功；一次注入致命退出后同会话恢复且只替换1次。
脚本`budget-lifetime-diagnostic.mjs`、`windows-lifetime.ps1`及完整状态/事件在证据根保留，
这些插桩/故障证据不冒充真实OOM或30K长期稳定。
最终完整fast **2096/2096 PASS，exit0**；失败/取消/跳过/TODO均0，
Node测试阶段3239841.38ms。`check-fast-final.log`、`check-fast-receipt.json`保留完整收据，
所有预算产品源码、测试和server/Worker/native SHA与开跑时一致。
细节见[实施报告](../reports/2026-10-29-default-unbudgeted-memory.md)。
本轮没有Rust改动；此前缓存治理的native验证是其既有收据，不冒充本轮重新执行。
455文件冷目录3秒门槛继续按维护者先前授权跳过，不将其标成通过。
