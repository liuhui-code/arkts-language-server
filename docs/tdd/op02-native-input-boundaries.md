# OP-02：原生输入hash中的SDK与并发嵌套根边界

日期：2026-10-15。父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`，
分支 `codex/op00-query-attribution`。本直接合同相关GREEN；纯hash子切片采纳，
整个OP-02／OP-06／L08仍IN_PROGRESS。没有生产代码改动，不是新的产品故障修复。

## 真实公开边界

Node20：`--test --test-reporter=spec tests/semantic/resident-input-proof-boundaries.test.mjs`。
真实生产LSP、Content-Length stdio和锁定compiler，私有完整profile/API24 fixture
SDK；不修改设备SDK、不stub compiler或语义引擎。正常六默认／1024MiB／一个
owner／最多两个contexts／完整fallback保持，公共引用请求仍20秒。

两项合同都独立执行hash复用缺省与显式0：

- 实际semantic Worker首次hash已进入后，修改其正在使用的私有SDK声明。
  旧resident证明必须被disk-source-changed拒绝，不能发布resident hit。
  新transient verifier实际SDK SourceFile为1，文本从28变为76 code units，
  完整返回2个位置，与无preload、关闭resident的fresh独立进程全等。
  显式重配置到新SDK副本、v2新增引用后完整3位置及最新诊断也与fresh全等。
- 两真实嵌套workspace roots共享nested/Target.ets；父caller通过./nested/Target，
  子caller通过自己的./Target，都是合法根内依赖。实际hash进行中编辑子root
  的权威overlay，主进程未知方法的原生-32601帧屏障后释放Worker。
  父请求必须ContentModified／无result／只一个终态；新请求不含／含声明分别
  完整5／6位置、子文档v2诊断为空。该负方法只同步私有测试流，不新增能力。

所有位置来自明确源码事实，不按计数截断。第二项直接覆盖进行中的overlay和
multi/nested roots，不把其它capability或泛化回归当成此hash路径的直接覆盖。
实际hash计数包含被观测字符串及同case其它事务／Worker，不解释成RPC独占CPU。

## 真实中间失败与诊断：全部保留

首SDK反例及复测均0/1：-32603而非测试期待-32803，原生SDK guard已经正确
拒绝旧Program。三项假说分别为私有屏障重复、真实compiler异常和跨Worker分类
丢失；有界探针看到同PID thread1已占屏障，fallback thread2再次独占创建。
修正私有观察器为首次进入后不再次暂停嵌套Worker，原结果／异常仍透传。
这仅修正测试观察器；临时DEBUG marker已移除，没有改生产判定。

随后新verifier实际加载76 code units并正确返回完整2位置，测试仍因过严的
“一定拒绝”期望FAIL。原计划允许重新验证或明确拒绝，故补上新声明加载、
旧证明零hit及fresh完整oracle断言，不只是删除错误码检查。
SDK当前合同首次1/1，6408.4906ms；audit SHA
`42c882c1300795628c82b0c14d6997971a85562b284e07cc040d1061fcd08f26`。

新增入口未登记的库存RED3/4保留，补bundle-e2e后与原六控制三文件11/11。
嵌套首版1/2为未声明合法跨根依赖的TS2307，在hash之前失败；目标改到双方
合法共享目录，全部caller仍保留。次版1/2为私有Worker暂停时要求3秒提前响应，
未捕获产品最终结果；改为主进程帧屏障、释放Worker后按原20秒合同核验。
这些是工具／fixture／期望错误，不宣称SDK不兼容或产品哈希失效。

原证据前缀（`.bench/`，原日志／exit／源归档／audit不覆盖）：

- `op02-input-sdk-boundary-characterization-v1`、`repro-v2`、`barrier-probe-v1`
- `op02-input-sdk-boundary-after-private-barrier-v1`、`characterization-v3`
- `op02-input-boundary-inventory-red-v1`、`op02-input-sdk-boundary-inventory-green-v1`
- `op02-input-nested-overlay-characterization-v1`、`v2`、`v3`

当前两项完整文件2/2、exit0、零注解，12070.122732ms；两模式都完整恢复。
log SHA `9fe3440afb01fa6a8095abb08a65f132806a8b5d42e4bafb67458eda169ee9e9`，
audit SHA `45c5583fc569d6039bf8358e052e573411193631617ad6bad540cf295fd0dd91`。

## 相关验收和采纳边界

十完整文件84/84、exit0／signal null，零skip／cancel／todo，247351.873691ms。
含原六hash／容量／取消／同大小替换、SDK／package／缺失路径／scope／压力、
别名协调器、嵌套candidate保护和库存；源／SDK／产物稳定、真实PID退出。
前缀 `.bench/op02-input-boundary-related-v1*`，log SHA
`b81f7b6957cdd86e0ecff387f16fcebf7befca7d464d82db6f24ef1af9e035a0`，
audit SHA `64bb567acab287504296aaba0e2e9b292a7e48431e94503cc0709b1efaf15b25`。
新test241／observer70／manifest335／库存test380行，均≤500；strict／syntax／
diff通过。库存208/unit101/protocol8/bundle92/fast201，其余7不偷列为fast。

原固定18个成本／时延会话及全部原生计数文件重新核对，pure-hash采纳audit SHA
`383773a255e1b7714026db4d34713dfa5b474544cee2a721c0b625f8f5c6db73`。
只采纳单事务有界实际字符串SHA复用；原新目标5/6快、编辑／RSS混合、
FAIL／DEGRADED和原3d6cc93f身份保留。当前production5cf9d618没有变化；
最近whole1757/1757不覆盖新工具head。其它OP-02组合、fresh whole、OP-00–06
原资源／生命周期／soak／客户端／平台／PSS／全证据正例与336格仍待完成。
