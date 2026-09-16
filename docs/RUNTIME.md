# 运行时实现说明

2026-09-15 启动修复：Spotify 的持久化分支保留主题内部的 `isStandalone()`，由 `tests/spotify-startup.test.js` 使用实际主题发布包、直接入口和生产持久化模块验证。普通预览不启用持久化，不能替代此启动检查。

Chromatic 运行时由工作线程局部持有，DLL 固定到进程退出；`DllMain` 退出回调只发送停止信号，不等待线程或释放 QuickJS。热重载和正常释放先在 JS 线程调用 dispose 回调，再停止事件线程、清理待处理任务，最后按 Context → Runtime 顺序释放。脚本执行结果也在 JS 线程释放。`third_party/chromatic/src/core/script.{h,cc}` 包含此修复，构建前需在子模块目录运行 `xmake build chromatic-core`，再构建主项目 Release x64。不要用未包含该修复的旧静态库覆盖构建产物。

验证：Chromatic 的 `RuntimeLifecycle.*` 用例覆盖 25 次重载和重复 shutdown；`tests/dll-startup.test.cpp` 覆盖生产 DLL 加载、执行脚本与正常进程退出。2026-09-15 连续 5 次进程验证通过，页面侧全量 130 项测试通过。

当前目标是渐进替换桌面 UI。启动时按界面偏好直接选择前端，手动切换才重建主框架；同一时刻不保留两套前端 DOM/JS：

```text
msimg32.dll 代理 / DllMain
  ├─ cef_hooks.cpp       仅在 orpheus:// 主页面和精确的 about:blank#enhancencm 页面注入
  └─ enhancencm.cpp      独立 Chromatic/QuickJS 脚本运行时
       └─ EnhanceNCM.js  当前仅作 Native 侧扩展，不能访问页面 window

CEF 页面 V8：
  ├─ EnhanceNCM-sdk.js
  │    └─ src/sdk/{startup,settings,transport/*,domain/*}.js
  ├─ 目录快照：theme_files.h 扫描程序目录 EnhanceNCM 的直接子文件夹
  ├─ EnhanceNCM-page.js
  │    ├─ src/host/entry.js             解析前入口与崩溃恢复
  │    ├─ src/host/themes.js            目录主题注册、选择与加载
  │    ├─ src/host/theme-host.js        独立页启动与窗口初始化
  │    └─ src/host/ui/{switcher,tray-menu}.js  通用设置与托盘
  └─ EnhanceNCM/<文件夹>/theme.js       仅执行所选主题
       └─ Spotify 来自 src/themes/spotify/{music-styles,standalone}.js
```

`node tools/build-page.js` 分别生成 SDK、宿主和 Spotify 主题三个产物；MSBuild 会将发布文件集中到 build 目录，并保留主题层级。部署必须同时更新 DLL、两个公共 JS 与 Spotify 目录，可运行 `powershell -File tools/install.ps1`。此脚本要求客户端已退出，先备份再复制，不修改其他主题。源文件无需部署，不要直接编辑生成产物。

每个主题目录必须有 UTF-8 `theme.js`，通过 `EnhanceNCM.themes.register({name,mount})` 注册。目录名是持久化 ID（Spotify 兼容旧 ID `spotify`）；重启或设置中的重新扫描会发现新增、移除和更新的目录。扫描器把缺少/不可读/过大的入口作为错误条目返回；只有所选主题的源码会执行，错误不会因未选择的主题而中断宿主解析。原版设置在独立 ShadowRoot 中显示主题列表；进入主题后不挂载 E 或设置浮层。切换等待清理并重建页面，防止第三方全局状态残留；不是无缝音频热切换。主题接口与示例见 `THEME_API.md`。

UI 应只依赖 `EnhanceNCM.sdk`，不要直接使用 `APP_CONF`、`legacyNativeCmder` 或 webpack 内部模块。界面偏好仍使用 `enhancencm.settings.v1`（`{version,mode,themeId}`），兼容旧的 `enhancencm.displayMode.v1`。

`startup.js` 定义启动配置与存储初始化，宿主的 `entry.js` 在 HTML 解析之前分流。在原版主框架的初始 CEF 上下文中，如果偏好为增强模式，立即停止原版文档解析；等 Native 的上下文回调返回后，用空白 HTML 重建当前文档并挂载增强 UI。启动 URL 仍是 `orpheus://orpheus/pub/app.html`，没有启动跳转，也不下载或执行原版前端 bundle。`_entry.active` 用于区分同一 URL 下的原版和增强页，SQL 事件只由当前增强页接管。过晚注入、非主入口、原版偏好或无法写入恢复标记时保留原版；已移除等待原版导航可见 1.5 秒再跳转的逻辑。

增强页挂载后先使用原版下载目录、缓存目录和缓存容量调用 `storage.init`，再完成 `winhelper.initMainWindow`、`finishLoadMainWindow` 和 `app.appStartUpEnd`，同时通过 `os.getSystemInfo("monitor")` 与 `winhelper.setWindowPosition` 设置有效窗口尺寸（Native 初始仅 32×32，CEF 视口为 0×0）。位置写入 `enhancencm.window.v1`，恢复时限制在当前显示器工作区内；显式启动时调用 `showWindow("show")`、`bringWindowToTop`；`autorun` 保留后台窗口状态。再次启动已有实例时，监听 Native 的 foreground IPC 唤起窗口。播放与 UI 初始化共享同一个 `storage.init` Promise，防止窗口还在启动时点击播放导致 `LOAD_FAILED`。首次业务请求通过共享 Promise 初始化 Native `network.initAegis`，再执行原有加密与请求流程；初始化失败允许刷新重试，不发送未加密请求。客户端版本依据为 3.1.39.205426，更新后需验证这些内部接口。

`enhancencm.nativeStartup.v1` 只记录 `{version,storage:{downloadDir,capacity,cacheDir}}`。原版入口临时观察它自己的 `storage.init` 调用来同步配置，捕获后立即恢复通道，不采集其他命令参数。升级时若尚未记录路径，会用原版启动一次完成配置采集，此后直接启动增强页；不会猜测或覆盖用户的目录，也不清理旧缓存。

`enhancencm.restorePending.v1` 在停止原版解析之前保存，增强 UI 和窗口初始化成功后才清除。15 秒启动超时、文档重建或挂载失败会切回原版偏好并重载；异常退出留下的标记使下次启动使用原版。该设置只记录界面/未来主题偏好，不是歌单缓存。

原版 E 按钮进入实色设置页，手动选择增强模式导航至 `about:blank#enhancencm`；下次冷启动走直接入口。增强页“刷新界面”重载当前入口；“返回网易云原版”先保存原版偏好，直接入口重载当前主框架，旧独立地址导航回原版。两种入口均复用同一个 renderer 与 SDK。

验证：`node tools/check-entry-live.js` 检查当前直接入口、空原版脚本列表、空原版资源列表与已清除的恢复标记；显式 `--roundtrip` 会停止播放并验证返回原版、偏好保持、切回增强与刷新。`tests/entry.test.js` 覆盖解析前分流、上下文创建时序、旧设置迁移、非目标页面、恢复保护、Native 启动与网络初始化。

独立页不加载原前端 bundle，也不依赖其 `legacyNativeCmder` / `APP_CONF`；客户端会在新 V8 上下文提供 `window.channel.call`，适配层以与旧包装器相同的回调参数形态调用它。原版仍可通过该通道或旧包装器访问业务 SDK。独立页缺少运行时 `APP_CONF.apiDomain` 时使用经域名白名单约束的默认域名，登录态和加密仍由客户端 Native 通道处理，不复制 Cookie。Chromatic/QuickJS 与页面 V8 是不同进程/运行时，不应直接共享对象；确需 Native 脚本调用业务层时再设计显式 IPC。

首页调用 `sdk.recommendations.getRecommendedPlaylists()` 展示推荐歌单，并同时展示自己创建和收藏的歌单（各取前六份，查看全部进入对应分页列表）；首页不显示热歌榜歌曲或热门歌曲区。歌曲视图显示当前播放队列；普通歌单可通过歌单卡片或输入 ID 打开。点击任何推荐/自建/收藏歌单会立即将页面绑定到目标 ID 并清空上一歌单的歌曲，成功后填入目标数据；异步旧响应不会将页面带回热歌榜。普通歌单、喜欢歌曲和私人雷达均以 500 首分页；歌曲视图的主滚动区域使用 6px 窄滚动条。侧栏提供账号歌单和四个个性化推荐入口。首页提供全站搜索，列表页过滤已载入的歌曲或资料库歌单。专辑图来自歌曲详情，加载失败时保留本地占位图；主视觉用 CSS 绘制，不依赖外部素材。

UI 启动时通过 `account.getCurrent()`、`playlists.listCreated({limit:30,offset})` 和 `playlists.listSubscribed({limit:30,offset})` 加载账号昵称、自建及收藏歌单；两种网格均支持加载更多，侧栏“歌单”区按组列出已载入的自建和收藏歌单。`specialType=5` 不在自建歌单区重复显示，但计算分页 offset 时仍计入 SDK 返回的该条目。收藏歌单单独按账号保存 Native 页面快照，启动先显示旧内容再校验账号并后台更新，不使用浏览器本地存储。选择“我喜欢的音乐”调用 `playlists.getLiked()` 读取歌单信息，再用 `songs.listLiked({limit:500,offset})` 分页读取歌曲。翻页以请求窗口推进 offset，避免歌曲详情缺失时跳页或重复；列表顺序沿用 SDK，页面合并时按 ID 去重。读取数据可以直接加入 Native 播放队列。

个性化推荐已接入侧栏和首页快捷入口。`recommendations.getRecommendedPlaylists` 读取首页歌单，`getDailySongs` 读每日歌曲，`getPrivateRadar` 从账号个性化区块解析雷达歌单 ID 后复用歌单详情接口，`getPrivateRoaming` 读私人漫游批次，`getHeartMode` 基于喜欢歌单与起始歌曲请求心动推荐。SDK 只返回内容；`sdk.player` 会话负责播放来源、批次去重、队列末尾续播和过期队列保护；UI 负责推荐页数据、分页及账号刷新后的展示请求保护。动态模式沿用服务端顺序，不强制凑满 500 首；推荐歌曲仍须通过 `sdk.playback` 获取当前授权音源。雷达 ID 来自当前账号，不在代码里固定。

原版缓存分析：当前 3.1.39.205426 前端通过 `storage.execsql(requestId, sql)` 和 `storage.onexecsqldone(requestId, code, rows)` 访问 SQLite。启动时从 `persistentModel` 先恢复 `async:hostResource` 中创建/收藏歌单和喜欢歌曲 ID，以及 `page:playlist` 中上次歌单页面的曲目实体；即使一小时新鲜期已过，只要未到七天清理时间，旧模型仍可先显示并异步请求 `/user/playlist` 更新。实机重载中本地模型读取约 0.57 秒开始，用户歌单接口约 5.87 秒发出。`playlistTrackIds` 保存 ID、曲目版本与歌单更新时间，`dbTrack` 保存规范化歌曲详情；`requestCache` 主要在请求失败时回退，不是侧栏即时显示的核心。

增强页在同一原生数据库的独立表 `enhancencm_library_cache_v1` 保存按账号隔离的 SDK 响应（5 分钟有效，最多 200 条）和页面快照（创建/收藏歌单、喜欢歌曲及 ID、各歌单已加载曲目，七天可恢复）。启动先显示快照，再清除短期 SDK 响应缓存并后台刷新；失败时仍保留旧内容。首次没有增强页快照时，只读原版 `persistentModel` 的 `host` 与 `async:hostResource`，核对账号和七天清理时间，先恢复创建歌单及喜欢 ID；不会写原版表。确认切换账号或退出登录时撤下旧账号数据，身份未确认前禁用喜欢操作。原版 `dbTrack` 仅在歌曲版本匹配时读出并转换 `artists/album/duration`，其余详情向服务端补取；不将旧 `playlistTrackIds` 当作当前权威列表。Native 不可用时回退网络。只有独立增强页注册 SQL 事件，避免覆盖原版自身的数据库监听。

验证：`tests/library-cache.test.js` 使用真实内存 SQLite 和模拟 Native 回调测试跨页面缓存、版本匹配、请求合并、过期、账号隔离、喜欢失效及旧请求写回；`tests/recommendations-ui.test.js` 覆盖四个入口、500 首分页、动态续播、过期队列保护和失败重试。显式 `node tools/check-library-live.js --verify` 在当前增强页创建独立 SDK 实例，读取账号推荐并填充原生缓存，不导航、不播放、不修改喜欢。2026-09-14 实机载入 500 首后，用全新 SDK 实例再次读取，歌单及歌曲缓存命中且内容请求为 0；四个推荐接口均返回有效结果。

`songs.search(keyword, {limit,offset,needCorrect})` 复用当前前端 `/api/search/song/list/page`，将 `data.resources[].baseInfo.simpleSongData` 映射为可播放的歌曲对象，返回 `{items,total,more,queryRewrite}`。Spotify 首页搜索框调用全站搜索，回车提交，支持继续加载；其他视图保留已载入列表的本地筛选。

账号读取失败与歌曲业务分别处理：未登录时提示返回原版登录，空歌单显示空状态，失败可刷新重试，某一账号接口失败不阻止其他页面使用。刷新账号资料库会清除短期响应缓存、保留页面快照直到新数据成功返回，并使旧异步请求结果失效；切换视图不会让延迟返回的喜欢歌曲覆盖当前歌单。页面从完整喜欢歌单读取歌曲 ID，为各列表及当前播放歌曲显示账号喜欢状态；身份或状态未就绪时禁用爱心。点击爱心调用客户端 `/api/song/like`，成功后更新状态和喜欢歌单，失败保留原状态。旧的本地设备收藏已停止读写（旧存储数据未删除）。

独立 UI 通过 `sdk.playback` 控制原生 `audioplayer`，不创建 HTMLAudio，也不直接获取播放 URL。播放/暂停、继续、进度和音量调用 SDK；当前状态、缓冲与进度由 `subscribe` 和 `getState` 同步。拖动进度时即时预览位置，释放后提交 `seek`，最终位置以 Native 回报为准；音量拖动合并处理中间值，静音通过设置音量为 0 实现，取消静音恢复最近非零值。

队列、上一首/下一首、随机播放与单曲循环已从 UI 提取到 `sdk.player.createSession()`。默认 renderer 订阅会话更新显示，并使用 `sdk.presentation` 处理常用展示格式。收到 `ended` 后按当前模式切歌，同一 `playId` 的结束事件只处理一次。异步调用按代次隔离，等待加载时可以取消，过期 URL 或暂停/继续回调不覆盖新歌曲。业务层按授权音源构造 `load` 参数，监听 `onLoad` 后调用 `play`；协议来自客户端 3.1.39.205426，升级后需重新验证。

点击刷新或返回原版会先等待 `playback.stop()`，停止失败则保留页面并提示，SDK 保留播放句柄以便重试。卸载会取消订阅并停止播放；外部直接关闭/刷新页面的 `pagehide` 只能尽力发送停止命令，无法保证异步回调完成。通过宿主持有共享 player 可在同一页面切换主题而保留队列和音频；SDK 快照只代表当前页面会话，尚不能读取原版跨页面的播放队列，进入独立页前仍建议暂停原版音乐。登录操作、全站搜索和创建/编辑歌单尚未迁移。真实 Native 音频、账号权限和私有协议兼容性仍需客户端验证。

开发和验证：

```powershell
node tools/build-page.js
node --test tests/sdk.test.js tests/playback-races.test.js
node tools/preview-music.js
```

预览默认在 `http://127.0.0.1:53871`，端口可由 `PORT` 环境变量覆盖。它复用生产 renderer、Native 传输适配器及播放 SDK，使用 `tools/preview-native.js` 模拟 `channel.call/registerCall` 和播放事件，不发出声音、不访问真实 Native 或账号。歌单与封面为演示数据。`?offline`、`?empty`、`?unavailable` 分别预览连接失败、空歌单和无播放权限。

`tools/preview-library.js` 提供账号演示数据，可用 `?signedout`、`?noliked`、`?emptycreated`、`?likederror`、`?libraryerror` 检查未登录、空状态和独立错误；`?manycreated&manyliked&sparse` 提供分页和缺失歌曲详情场景。运行 `node --test tests/library-ui.test.js` 验证账号歌单浏览、Native 播放、分页偏移、搜索、喜欢/取消喜欢、刷新重试和过期请求处理，使用相同的 Playwright 环境变量。

安装有 Playwright 及其 Chromium 时运行 `node --test tests/music-ui.test.js`。也可用 `ENHANCENCM_PLAYWRIGHT` 指定 Playwright 模块路径、`ENHANCENCM_CHROMIUM` 指定浏览器可执行文件。测试覆盖导航、搜索、收藏、Native 命令及事件联动、循环与自动切歌、取消加载、停止失败重试、竞态、卸载及 1440/1024/768/390 像素布局，并断言界面不构造 HTMLAudio。截图保存到忽略目录 `out/music-ui/`。这些工具和测试不参与生产脚本打包；通过模拟桥接不代表真实客户端已经出声。

`tests/playback-interaction.test.js` 在鼠标按下与松开之间插入进度事件，检查暂停点击没有丢失。播放进度不能通过 `innerHTML` 重建未变化的播放/静音图标，否则 Chromium 会因按下的 SVG 节点被移除而取消 click。装饰性按钮 SVG 使用 `pointer-events:none`，使按钮本身接收指针事件，即使图标因状态变化被替换也保留点击目标。

`tools/diagnose-playback-live.js` 默认只读当前增强页的播放与按钮状态；显式 `--probe` 测试一次程序点击，`--probe-pointer` 将实机鼠标按住 450ms 再松开，`--probe-pause` 会先恢复当前暂停歌曲以验证播放期间的暂停点击。操作模式会短暂影响播放，结束后在同一歌曲仍有效时恢复原播放/暂停状态，不切歌或重载页面。工具记录指针事件、原生命令、回调、状态事件至忽略目录 `out/playback-diagnostics/`，结束后卸载临时监听。2026-09-14 实机复现修复前只有 pointerdown/pointerup，没有 click 或暂停命令；应用指针目标修复后出现 click、audioplayer.pause 和对应 onPlayState=2。

`third_party/chromatic` 是原 `lib/chromatic` 整目录迁移，现已在主仓库的 `.gitmodules` 中登记为 Git submodule，固定于 `91cd9c32d7c732d2fca204d6a05f5422443b6a34`。新的检出需运行 `git submodule update --init --recursive`。其 `src/injectee/config.cc` 仍有原本的本地未提交改动，不包含在主仓库记录的提交指针中；如构建需要该改动，应先在 Chromatic 仓库提交并推送，再更新主仓库的 gitlink。

## 桌面系统集成与封面缓存

主题 API 与完整示例见 `THEME_API.md`、`examples/themes/minimal.js`。播放会话模块不访问 DOM；主题通过 `getState/subscribe` 读取稳定队列快照并绑定按钮。`app.unmount()` 返回 Promise，会等待异步 renderer 的清理；共享会话的视图只取消订阅，宿主在退出时释放会话。`tests/player-session.test.js`、`tests/theme-lifecycle.test.js` 与 `tests/theme-example.test.js` 分别验证无 UI 的播放行为、异步生命周期和切换视图不重启音频。

音频缓存由 `audio-source.js` 管理：每次起播检查当前账号/权益，同页同音质的非试听授权地址在 `expi` 与 5 分钟中的较短期限内复用。用实际码率（kbps）、MD5 和歌曲 ID 调用 `storage.queryNewCacheTrack`，将查询状态传入 `playback.audioCache`；type=4 加载时补齐原版非试听 `playInfoStr` 和 `X-SONG-INFO`。加载完成后，直接记录 Native 的 `openWholeCached/preloadWholeCached`，避免把“查询完整”误报为“已播放缓存”。试听、过期、账号/权益变化和加载失败会避开旧授权复用；查询异常仍可加载授权流。原版实验分组及跨页离线授权流程未照搬，文件缓存不替代授权。

`tests/audio-source.test.js` 覆盖缓存命中、元信息格式、重复地址复用、权限/音质/期限变化、试听隔离、部分缓存、错误匹配、查询失败及加载失败后的重试。显式 `node tools/check-audio-cache-live.js --verify` 对当前暂停歌曲的同一原生句柄测试，会短暂播放后恢复暂停及位置；不切歌、不重载页面。2026-09-14 实机 Native 返回 `openWholeCached:true`，再次选曲查询到缓存 100% 且完整播放元信息存在，地址请求计数保持 1、复用计数变为 1。

`sdk.window` 沿用当前客户端 3.1.39.205426 的 `winhelper.showWindow`、`dragWindow`、`sizeWindow`。标题栏支持最小化、最大化/还原、空白处拖动和双击；四角与右侧支持缩放，原生 `winhelper.onSizeStatus` 同步窗口状态。退出按钮会先停止播放、清空系统媒体信息，再调用 `app.exit`，不会模拟原版“关闭到托盘”设置。

`sdk.systemMedia.createSession` 用 `player.setSMTCEnable`、`player.setInfo`、`player.setMiniPlayerState` 同步 SMTC，用 `player.onaction` 将系统播放/暂停/切歌交给当前队列。直接入口按原版 `setTaskBoardWindowConfig` 的资源调用 `winhelper.setWindowIconFromLocalFile` 设置 `app_min.ico`，使任务栏悬浮缩略图标题行恢复应用图标；还通过 `trayicon.setIcon`、`trayicon.wasInstall`、`trayicon.install` 初始化托盘图标。监听 `trayicon.onclick` 与 `trayicon.onrightclick`，右键使用 `winhelper.launchWindow` 打开自绘 HTML/CSS 托盘小窗，由同源 storage 事件将操作交给当前队列，若小窗未就绪则在增强页右下角显示回退菜单，不使用 `winhelper.popupMenu`。`app.setThumbnail` 带上 300/301/302 三个按钮，`player.onthumbnailaction` 将其交给当前队列（原版桥接会自动拼接 `on` 前缀）。曲目改变时向 `trayicon.setToolTip` 与 `winhelper.setWindowTitle` 发送“歌名 - 歌手”，无曲目时恢复“网易云音乐”。相同元信息不随进度重复提交，过期请求不能覆盖新歌曲。歌词页复用此播放进度，按当前歌曲请求客户端歌词接口并跳过切歌后的过期响应。`cover-colors.js` 从当前封面取样生成歌词背景与高对比度文字色；Native 缓存图不可读取时尝试 HTTPS 小图，失败回退中性深灰，同一封面本页复用颜色并防止过期结果覆盖切歌。

所有 UI 封面通过 `sdk.artwork.getUrl` 生成稳定的 `orpheus://cache?` 地址，交给网易云原生图片缓存。同一封面的列表、卡片和播放栏复用 320 CSS 像素的尺寸；网易图片域名按设备缩放生成 JPEG thumbnail 参数，不附加时间戳。缓存命中、有效期与淘汰由客户端管理，首次加载或缓存过期时仍可能联网。

任务栏缩略图与 UI 封面现在使用同一个 320px Native 缓存键。切歌选中目标歌曲时先发布 `loading` 状态的标题/封面（播放按钮保持暂停），不再等待音源鉴权和音频加载完毕；封面预载与 Native 元信息提交并行。托盘右键自绘小窗参考原版布局，只保留歌曲名、上一首/播放或暂停/下一首/喜欢一排控制及退出，大小为 212×132 CSS 像素。右键时同步读取桌面物理鼠标坐标，以图标点击处为窗口横向中心，并在工作区内约束位置；不再固定在屏幕最右侧。窗口创建时可见，再设置 Native 尺寸限制和位置；关闭时直接销毁。音频文件缓存与封面图片缓存彼此独立，封面首次请求仍可能需要联网。

SMTC 封面遵循原版 `app.chunk.d4e863d.js` 的实现：按 `108 × devicePixelRatio` 缩放为 JPEG，先用 `Image.src = "orpheus://cache?" + url` 完成 Native 缓存预加载，再将同一 HTTP URL 交给 `app.setThumbnail` 和 `player.setCover`。失败时恢复默认图，切歌/卸载时取消过期预加载。单独传 HTTP URL 或仅判断 Windows Thumbnail 对象存在，不能证明实际封面显示正确。歌曲列表视图显示 6px 窄滚动条；首页、侧栏与队列隐藏滚动条，仍可正常滚动。

验证：`node --test tests/shell.test.js` 检查协议、缓存地址稳定性及异步同步；浏览器用例检查窗口交互、SMTC 按钮、缓存 URL 和隐藏滚动条后的滚动。`tools/inspect-playback.js` 只读检查原版源码，`--save app.chunk` 保存到忽略目录 `out/client-sources`。`tools/check-shell-live.js` 是显式的实机操作测试，会切换界面、窗口状态并短暂播放；`--cover` 会刷新独立页并尽量恢复当前歌曲。`tools/inspect-smtc.ps1` 默认只读检查 Windows 媒体会话，仅显式传 `-Action` 才发送系统媒体命令。这些工具均不进入生产包。


2026-09-14 直接入口实机验证：完全退出后启动，初始 CEF 视口为 1200×820，原版脚本和 bundle 资源列表均为空；原生存储、在线歌单、首次播放/暂停、窗口控制、原版/增强页往返及配置重新采集通过。100 项自动测试通过。旧脚本备份位于安装目录 `EnhanceNCM-backups/direct-entry-20260914-180313/`。
