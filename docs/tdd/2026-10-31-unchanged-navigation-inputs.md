# 同输入关闭重开：实施与TDD

父HEAD `04282ed34ebab7cd01726bb0291af53bd278ff00`；工作树含已验证ADR0037候选，未覆盖其他已有修改。
新证据根 `.bench/navigation-close-reopen-20261031/`，baseline-identity含800输入及原候选产物SHA。
[ADR0035](../adr/0035-unchanged-source-authority-transitions.md)审计0010/0019/0022/0025/0029/0032/0037，无默示废止。
不提交、push、合并、部署日常Zed或删除真实缓存。

## 首个公开RED

Node20.19.5：`node --test --test-concurrency=1 tests/semantic/navigation-close-reopen.test.mjs`。
`unchanged-reopen-red.log` exit1：Program1→2，正确定义保持。
夹具默认强制resident fast path=0，和实际默认30K不同；原失败保留，不冒充同一owner场景。
修正夹具为产品默认的未配置值后，`default-reopen-red.log`仍exit1、Program1→2，
全部semantic.prepare.complete的newEntry=false、resetReason=null；不属于LS退役/Worker换代。
这把缺口定位为 retained owner 内的编译输入delta，而不是所有SDK重新解析。

## 假设与观察

1. DocumentStore删除记录/closure，后续重新准备：保留为准备成本假设，不据此归因整段1秒。
2. 同内容delta先删除script、推进版本，再安装相同source：与保留LS但Program变化相符，优先最小验证。
3. 解析generation/owner被替换：此次公开反例newEntry=false且无reset，不支持作为直接原因。

后续每个GREEN、反例及最终检查在此追加；上一轮2147/2147不覆盖本轮产品变化。

## 最小GREEN与表征

`default-reopen-green.log`：首项1/1、Program不换代，仍通过完整定义位置检查。
已交付且字节相同的驻留输入不再先remove再安装；received revision及owner applied revision继续推进。
当前查询根或明确稳定根之外仍原样更新；未交付/未知/移除及真实变更不被过滤。
`pre-refactor-characterization.log`：原15/15（group closed input delivery、semantic group retention、versioned overlay disk）。
随后将成员移除的clock/cache配对提取到同一compiler-input模块，LS3077→3073行，剩余体量债务记录保留。
`refactor-and-authority.log`：新旧17/17；`freshness-controls.log`新增两项后4/4。
四项覆盖同内容关闭重开、不同磁盘/未保存overlay、未通知依赖变化、SDK实际lookup后修改和配置恢复。
测试客户端回应真实进度创建；没有用未回应server请求的驱动作为正常客户端对照。
`pnpm check`通过；完整最终检查及30K性能对照尚待最终候选。

`physical-boundary-control.log`首版负例期望空数组失败；实际编译器对无法解析模块返回本文件import binding，
不是越界目标。未改产品，补明确的MissingTarget控制并逐字段比较本地绑定URI/range，
`physical-boundary-control-v2.log`5/5：同字节父目录移出工作区后不能继续返回依赖定义，恢复并通知后精确恢复。
`final-scoped-regressions.log`88/88包含当时4项新测试及namespace、原始源码/SDK证据、保存同步、
独立请求/旧句柄和快层发现性；物理边界第五项单列收据，不冒充已在该88项中。
最后将同版本关闭重开加强为连续三轮，后续最终检查覆盖该版本。

## 最终验证

`pnpm check:fast`：2152/2152、exit0，0失败/取消/跳过/todo；测试体3402206.127ms。
Node20.19.5、pnpm8.3.1，完整日志/进度/日志SHA见check-fast-final.log和final-check-summary.json。
完整检查后的801源/测试/配置、82运行产物/标准库、SDK3956输入及30K源码核验无差异。
sdk-discovery-driver.cjs为完整检查新生成的测试夹具，预检旧副本与新编译结果SHA单列，不当作运行时变更或哈希一致。
3轮交替正常对照及独立2轮计数见comparison.json/filesystem-comparison.json；每轮69响应逐字段一致。
重开中位1136.739→140.757ms；原多秒突发、degraded及全范围限制保留，未宣称Windows/UI通过。

## 额外诊断失败：NAV-INPUT-001

完整检查后补动态import类型负查找：Main同文本关闭重开，nested/Lazy.ets从缺失变为存在且无通知。
negative-creation-probe.log先在基线断言失败exit1；保留v1脚本，控制版继续跑旧/新候选和冷会话oracle。
两版首次/重复hover均-32803，显式Created通知和配置控制后与冷会话一致。
negative-creation-controls.log/summary均保留失败标志，exit1；不属于上述2152项，也不当作功能成功。
这是既有恢复缺口，具体缓存/证明所有者尚未定位，记录TODO并关联ADR0025，不修改其合同或顺带做无关缓存优化。
