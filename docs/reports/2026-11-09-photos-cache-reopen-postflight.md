# Photos 30K：保留长测缓存重开与离线校验超时

重开的6个功能动作正确，LSP/Native正常退出；默认脚本随后在60秒外部数据库检查上限失败。
原始轮次保持 **FAILED**。相同关闭数据库的独立只读完整性/外键检查后来 **82.01秒完成、退出0、输出ok**。
这是补齐结构证据，不是把原失败改写成成功，也未修改产品超时、断言或内存策略。

## 输入、身份与证据保护

- 沿用冻结候选与SDK，79项运行产物及SDK元数据重开后复核一致；未重新构建或部署。
- 隔离Photos根：`final-acceptance-13/harness/project`，30060输入与重开前相同。
- 重开前用APFS clone保留已关闭的整个长测缓存：
  `.bench/index-versioned-maintenance-20261104/photos-followup-13/formal-index-closed-archive/`。
  原正式日志/控制收据/结果未改；原cache路径随后作为本次重开的工作缓存，不能将其当前内容当作原时间点快照。
- 原始重开结果：`final-acceptance-13/protocol-runs/retained-formal-index-reopen/result.json`。
  本轮为新LSP/Worker进程保留磁盘索引，不是原进程内Program/答案缓存命中，不是UI。

## 功能、时间与关闭

| 请求ID | 操作 | 耗时ms | 结果 |
| --- | --- | ---: | --- |
| 2 | workspace/symbol | 254.09 | oracle通过 |
| 3 | definition首次 | 1311.64 | 精确目标通过 |
| 4 | workspace/symbol重复 | 81.68 | oracle通过 |
| 5 | definition重复 | 46.90 | 精确目标通过 |
| 6 | workspace/symbol重复 | 70.69 | oracle通过 |
| 7 | definition重复 | 46.72 | 精确目标通过 |

定义目标为`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`的
`ScreenManager.getInstance`，位置见原始请求；不是三轮独立启动的统计量。
Native完整终态为30000/30000，ready事件距本轮开始8629ms；SDK部分声明限制原样保留。
无功能finding、保护停测或未结束进度。shutdown应答、exit0、无干预；主Native与启动缓存GC均exit0。
按实际runtime-binding PID75476及Native/tee75481–75484只读复核均已退出。
短进程的原始输出schema为arkts.index-cache-gc.v1，活动工作区protected、删除0；先前“能力探测”分类更正。
不能把GC进程或新会话Worker算作原会话自动换代。

## 为什么重开写了8文档，而不是0或30000

原始Native完整资格终态：同store `catalog-10064-18e6262aa3e3de18-0.sqlite3`、head635、
reusedDocuments29992、writtenDocuments8、factRowsWritten3239；文件版本写入域2次commit callback。
这些是应用层计数，不是物理写字节或所有元数据事务数。

不能因为最终项目源恢复一致就预设关闭时的缓存已同步到最终磁盘。
逐项比较归档与当前DB的新发布组：**18个可见映射的旧内容SHA均与当前磁盘不同**，
新映射的内容SHA全部与磁盘一致；其中10个目标sealed版本已存在于归档，另8个版本ID在归档不存在。
因此本次是修正18个映射、复用其中10个版本并新写8个文件事实，未重写全项目。
这里只证明旧索引内容与最终磁盘的实际差异及修复；不凭计数推定每个差异发生在哪个清理/取消时间点。
精确文件、旧/新version、内容SHA及磁盘SHA在`retained-reopen-eight-file-content-proof.json`。

## 外部校验失败与补证

`observation/cache-observation.mjs:55`在所有已知服务进程关闭后执行：

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

数据DB的`/usr/bin/sqlite3 -readonly -nofollow`检查60.003秒被外部脚本SIGTERM，ETIMEDOUT，无输出；
control DB正常。没有返回损坏消息，也不能因此宣称结构检查已完成。

第一次独立诊断使用同样只读SQL，加`/usr/bin/time -l`：137.66秒后SQL输出ok，但包装器读取
`kern.clockrate`被沙箱拒绝，外层exit1。这份记录保留为非PASS，未用包装器退出码替代SQLite退出码。
随后去掉额外包装器，直接运行相同SQLite检查：82.01秒、SQLite exit0、stdout仅ok、stderr空，
无诊断干预；文件dev/ino/大小/mtimeNs在检查前后完全一致，且匹配前一次关闭状态。
两次独立诊断均以明确的180秒外部观察预算运行，不改产品配置，也不更改原脚本60秒结果。
前序读取可能影响OS缓存，不能用137/82秒推导性能优化或把等待时间归因于IO/GC/锁。
具体内部阶段/页访问/VM次数未测；只是确认完整检查有限时间完成、没有报告结构/外键错误。

## 当前结论与继续条件

功能与离线结构证据已补齐，但默认验收脚本未通过这一事实保持。
串行控制器`photos-followup-13/execution.json`为STOPPED_FOR_DIAGNOSIS；原冷索引前台/后续诊断/Native规模复核未启动。
后续只能在核对源恢复、产物、关闭和同一数据库补证后，独立继续未执行项；不能盲目重启原控制器覆盖失败。
不因此修产品代码，不提高产品阈值；真实UI/Windows及原全量引用/rename限制仍未闭环。

证据根`.bench/index-versioned-maintenance-20261104/photos-followup-13/`：
`retained-reopen-functional-and-reuse.json`、`retained-reopen-eight-file-content-proof.json`、
`retained-reopen-integrity-supplement.json`（包装器失败）、`retained-reopen-direct-integrity.json`（直接检查PASS）、
`retained-reopen-identity-and-restoration.json`及原始controller.log；原逐请求/Native生命周期/资源在重开运行目录。
