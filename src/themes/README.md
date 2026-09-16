# Themes

每个子目录对应一个主题源码。内置 Spotify 通过公共 SDK 获取业务数据，通过公开宿主 API 管理界面切换。

分发时每个主题位于 `EnhanceNCM/<目录>/theme.js`，源码模块由构建工具合并。增加第三方主题不要求重新编译 DLL。详见 [主题开发](../../docs/THEME_API.md)。
