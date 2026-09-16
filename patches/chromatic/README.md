# Chromatic 项目补丁

`runtime-lifecycle.patch` 基于本仓库固定的 Chromatic 子模块提交，包含：

- 先执行脚本 dispose，再关闭事件线程、清理任务和释放 Context / Runtime。
- 在 JS 线程释放脚本执行结果。
- fmt 头文件兼容调整。

运行 `npm run deps:patch`；脚本检查补丁是否已应用，不会覆盖不匹配的本地改动。应用后在子模块中重新构建 `chromatic-core`。补丁不会改变主仓库的子模块提交指针。
