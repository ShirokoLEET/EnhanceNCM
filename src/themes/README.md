# Themes

每个子目录对应一个主题源码。内置 Spotify 通过公共 SDK 获取业务数据，通过公开宿主 API 管理界面切换。

`amll/` 是 AMLL 主题：直接复用 `third_party/amll` 中来自 `amll-page` 的 React 播放器 UI，通过公共 SDK 接入播放、歌词、搜索、每日推荐和播放恢复。运行 `npm ci`、`npm run build`，输出 `build/EnhanceNCM/Themes/AMLL/theme.js`。将整个 AMLL 输出目录复制到客户端 `EnhanceNCM/Themes` 下，重新扫描后选择 **AMLL**。主题不依赖运行时 CDN 或本地开发服务器。

AMLL 原始 UI 源码及许可证见 `third_party/amll/NOTICE.md`；SDK 目前仅提供逐行歌词，AMLL 按行同步，暂无逐字时间和音频频谱数据。

AMLL 默认进入 Player 首页，复用上游首页、歌单详情、歌单/歌曲卡片和底部播放栏。推荐歌单、我的歌单、收藏歌单以及歌曲分页均来自 SDK。选歌只更新播放栏；点击底部“歌词”按钮才打开歌曲界面，点击“关闭歌词”、上方收起条或按 Esc 返回之前的浏览页面，保持播放状态。

首页歌单和歌单详情会先恢复当前账号的页面快照，再在后台请求 SDK；请求成功后才替换列表，失败时保留快照。启动时不清理 SDK 的短期响应缓存，首页的“刷新歌单”和详情重试才会主动刷新它。

分发时每个主题位于 `EnhanceNCM/Themes/<目录>/theme.js`，源码模块由构建工具合并。增加第三方主题不要求重新编译 DLL。详见 [主题开发](../../docs/THEME_API.md)。
