# NAV-BIND-001：overlay变化导致整组模块解析缓存清空

状态：第二隔离候选已实现，针对性回归通过；普通性能、最终全量及Windows/UI未完成。
父提交1e3886df；工作树 `/private/tmp/arkts-binding-input-delta-20261119`。
证据I：主仓库 `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`。
本轮不合并、不部署，不改原Photos或用户缓存。

## 实际触发与根因

400个源码构成import环，先完成初始化和精确跳转。只打开Unused350.ts，内容不变。
真实物理/逻辑根别名出现后，`ScopeModuleBindings.begin`因整个aliases字符串不同，
清空401个解析条目。`ScopeDependencyGraph.update`无法保留旧binding的确切owner，
重做400个节点及解析。主要工作在后台diagnose，之后的typeDefinition已经热态。
因此只测最后一次前台请求会漏掉这笔成本。

公开RED使用冻结0a8898a0；同时收集diagnose/typeDefinitions所有新增Worker记录，
精确结果先通过，再因无关解析被重做而失败。不是伪造成功返回或仅私有方法测试。
`overlay-binding-input-red01/`保留完整首次现场；`binding-alias-public-red.log`
使用正式回归及显式整根symlink（Windows分支使用junction，尚未实机执行）。

## 实现

- 在实际resolver的overlay flag和physical→logical映射读取点，记录每份binding
  真正消费的正/负输入；重复读取不能覆盖第一次不同的值。
- 每次图更新先发布当前overlay权威，再允许current-node快路径。保留源码成员名
  变化时的保守失效；别名变化推进版本，但不无条件清空所有条目。
- binding复用先核对其自己的读取依赖，随后仍检查原source/config/SDK/path见证。
  finish继续清理未用owner；旧图版本和取消后的脏拓扑不复活。
- 长期回调由独立工厂创建，只捕获既有Store权威、别名Map和纯事实Map，避免闭包
  保留查询的workspace文档文本。没有新增AST、完整历史或valid布尔缓存。

实现位置：`scope-module-bindings.ts`、`typescript-module-resolution.ts`、
`scope-dependency-graph.ts`、`project-operation-scopes.ts`。
依据为既有ADR0019/0037/0044及0045 Proposed的按实际依赖维护派生数据约束；
不是改用watch-only合同，也没有改变编译器模块解析优先级或路径大小写规则。

## 验证与边界

`binding-alias-public-green01.log`：打开操作400→1个直接相关导入者；
401个缓存条目保留，后续前台精确跳转。原记录保留，不拿3秒左右的夹具总时长
当产品时延收益。

`binding-alias-expanded01.log`：69/69PASS，零跳过/取消，覆盖编辑/撤销/关闭/同版本
重开；每一步诊断及前台都不重做无关绑定，hover反映最新字节，磁盘不被编辑。
进一步检查点、整组证明修复后的最新候选在
`full-sdk-known-membership-expanded01.log`52/52PASS，包括语义组保留、真实取消、
成员首末核验和弱目录回退。不是最终全量检查或Windows实机。

最新冻结Worker0d609a5d919e890ac0b6b2333c4e383bb53de521970590d9213607a77c541590；
`runtime-m4-binding-and-membership-capsule-identity.json`含309份源码和全部产物哈希。
Node20.19.5、compiler4.9.5-r10、Native800e6628。没有改变超时、内存或规模阈值。

此切片减少已证实的不必要解析，尚不能宣称真实30K跳转降至500ms；
图反向边增量、M5、规模轴、真实Photos、Windows/UI和正式耐久仍开放。
