# Inject

原生 DLL 入口、CEF 接入、主题目录扫描及 Chromatic 运行时。Visual Studio 工程位于仓库根目录；源码迁移不改变 DLL 导出或注入行为。

本目录的 `EnhanceNCM.js` 运行于独立 QuickJS 环境，不是页面脚本。构建方式见 [开发说明](../../docs/DEVELOPMENT.md)。
