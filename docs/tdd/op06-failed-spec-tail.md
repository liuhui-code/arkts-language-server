# OP-06：完整回归失败尾部保留实际计数

日期2026-10-15，父修订`a111235bc4bfcb55b126752f95b3ba095f2996af`，
分支`codex/op00-query-attribution`。工具切片GREEN；OP-06／L08仍IN_PROGRESS。

## 实际缺口与公开反例

真正1752/1754失败whole的原SPEC根摘要后还有标准`✖ failing tests:`、两个
失败详情、实际child-exit及pnpm ELIFECYCLE。collector保留了真实计数，但
release消费者将任何非空尾部一律视为摘要非终态，丢掉实际失败计数。
旧原日志／源码归档／失败身份不改；来源见[package存在性TDD](op02-package-metadata-presence.md)。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-reporter=spec \
  tests/semantic-release-regression-cli.test.mjs
```

通过实际公开release CLI执行的合成receipt复用原真实失败尾部形状，要求实际
counts与exit保留且仍为REGRESSION_EXECUTION_FAILED／FAIL。合成archive、pins、
平台和日志只资格消费者，不冒充实际产品执行或三个平台通过。
RED原9/10、exit1，实际为REGRESSION_SUMMARY_NOT_TERMINAL；完整源／SDK身份稳定。
log SHA `a2c7dfdabe4f7dc22aa2d6eda915f97f7629e530f62fabcdbbef7c19e76614b2`，
audit SHA `fbfc44a8217cee6a4e3ed684b4b0425b3ff2e9ad7b69f04c4b210064b1ebdc3e`。

## 最小GREEN与拒绝保护

只接受实际整数非零exit、signal为null、摘要fail>0且以标准失败标题加换行
起始的非空尾部；其余仍拒绝SUMMARY_NOT_TERMINAL。后续所有digest、实际counts、
源归档完整性／新鲜度、完整fast选择、构建／SDK／平台校验均保持。
标准失败计数保留，但最终执行检查仍返回FAIL，绝不转为绿色或releaseEligible。
无信号完成、绿色摘要、任意追加内容等保护有公开characterization。

首GREEN10/10、exit0，随后增加zero-exit／signal／非法exit／绿色摘要负例。
八文件联合80/80、exit0、零skip/cancel/todo，52872.281023ms；覆盖collector、
矩阵、产品内存／资源原文、失败退出诊断与库存。全部前后源／SDK／产物一致，
实际测试PID已退出。前缀`.bench/op06-failed-spec-tail-{red,green,related}-v1*`。
相关log SHA `d496c8b59a468f00af9552f3481e8f9b096e7f56ad22532e9e16abb1b8be767f`，
audit SHA `1c7c7fbfdb75ced0df691b15c5c888c76110ed38dfbeb7b3a1effac27f9c1f10`。
consumer149／test334行，均≤500；pnpm check、Node syntax和diff通过。

## 继续范围

生产input仍5cf9d618、六默认／1024MiB／完整SDK／原期限及生命周期不变；
当前新源码未借旧whole取得完整GREEN。下一步冻结当前源码／文档、新pins，
运行真正完整check:fast；不是重复旧失败whole碰运气。
全部原OP-00–06采纳／资源／生命周期／soak／客户端／三平台／DevEco-PSS／
历史峰值与336格及全证据正例仍继续，最终550ms不前移，无毕业／合入／push。

## 真实整轮收据的公开消费

新真正whole1757/1757、exit0、零注解，source／构建／SDK／启动器前后稳定，
独立terminal审计通过，详见[metadata切片检查点](op02-package-metadata-presence.md#当前真正完整回归检查点)。
用实际release CLI只传原whole-state，不提供旧query或合成query/build：原根1757
计数、log／archive SHA全部保留，source与完整fast选择验证通过；receipt与整份
report仍BLOCKED／exit1，准确原因为REGRESSION_PRODUCT_BUILD_MISSING。
证明真正收据已可消费，不用补造当前prepared报告取得PASS；其它平台也不借本机。
实际报告和milestone独立audit在同whole目录，audit SHA
`109bb48ba26071f8365c848c37caf91296693c87d4cf2710cdbf057acda8712b`。
所有原剩余合同继续，releaseEligible=false，未毕业或合入。
