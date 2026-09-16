# 贡献指南

先阅读 [开发说明](docs/DEVELOPMENT.md)和[架构](docs/ARCHITECTURE.md)。问题反馈请说明客户端版本、主题和复现步骤；提交日志前移除账号凭据。

- 界面变化放在 `src/themes/`；可复用的音乐和播放能力放在 `src/sdk/`。
- 入口、挂载与主题选择属于 `src/host/`；原生桥接与目录扫描属于 `src/inject/`。
- 主题使用 `EnhanceNCM.sdk` 和公开宿主 API，不直接调用客户端内部通道或 SDK 私有对象。
- 不直接编辑 `build/`。修改源文件后运行 `npm run check` 和 `npm test`。
- 原生变更需提供 Release x64 编译和启动验证结果；模拟浏览器测试不能替代实机验证。
- 公共接口变更同步 SDK 文档、示例及相关测试。不要在同一个变更中混入与问题无关的大规模格式化。

PR 说明写清楚问题、最终行为、验证结果和未验证场景。`third_party/chromatic` 的必要本地修改应保存在 `patches/chromatic/`，避免只存在于开发者工作目录。
