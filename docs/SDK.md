# EnhanceNCM 页面业务 SDK（试验版）

SDK 11 的主题接入、共享播放会话、生命周期及音频缓存边界见 [THEME_API.md](THEME_API.md)。示例：[最小主题](../examples/themes/minimal.js)。当前内置界面已使用共享播放服务；主题业务不依赖内置界面的 DOM。

业务源码位于 `src/sdk/transport` 和 `src/sdk/domain`，独立构建为 `EnhanceNCM/EnhanceNCM-sdk.js`。`EnhanceNCM/EnhanceNCM-page.js` 只负责入口、主题管理和公共设置；Spotify 界面位于 `src/themes/spotify`，构建为 `EnhanceNCM/Themes/Spotify/theme.js`。DLL 在 CEF 主页面上下文中先加载 SDK，再传入安装目录的主题目录快照，最后启动宿主。部署时 `msimg32.dll` 放在安装目录根部，公共脚本放在程序目录的 `EnhanceNCM` 下，主题放在 `EnhanceNCM/Themes` 下。可运行 `tools/install.ps1` 在客户端退出后安装并备份旧文件。无需启动 `api-enhanced` 服务，也不读取或保存 Cookie。

这是页面侧 SDK。`EnhanceNCM.js` 当前运行在独立的 Chromatic/QuickJS 环境，不能直接访问页面的 `window.EnhanceNCM.sdk`；若要从该脚本调用，还需单独实现跨运行时消息桥。Native 通道未就绪时会得到 `BRIDGE_UNAVAILABLE`，可等待 `EnhanceNCM.app.whenReady()`。

在任一已注入页面中，可在页面脚本或 DevTools 中调用：

```js
const song = await EnhanceNCM.sdk.songs.get(186016);
const songs = await EnhanceNCM.sdk.songs.getMany([186016, 186017]);
const searchPage = await EnhanceNCM.sdk.songs.search("周杰伦", { limit: 30, offset: 0 });
const audio = await EnhanceNCM.sdk.songs.getUrl(186016, "standard");
const lyrics = await EnhanceNCM.sdk.songs.getLyrics(186016);
const playlist = await EnhanceNCM.sdk.playlists.get(3778678);
const { items, more } = await EnhanceNCM.sdk.playlists.listByUser(123456, {
  limit: 30, offset: 0
});
const tracks = await EnhanceNCM.sdk.playlists.getTracks(3778678, {
  limit: 500, offset: 0
});
const me = await EnhanceNCM.sdk.account.getCurrent();
const created = await EnhanceNCM.sdk.playlists.listCreated({ limit: 30, offset: 0 });
const subscribed = await EnhanceNCM.sdk.playlists.listSubscribed({ limit: 30, offset: 0 });
await EnhanceNCM.sdk.playlists.addTrack(created.items[0].id, 186016);
await EnhanceNCM.sdk.playlists.removeTrack(created.items[0].id, 186016);
const likedPlaylist = await EnhanceNCM.sdk.playlists.getLiked();
const likedSongs = await EnhanceNCM.sdk.songs.listLiked({ limit: 500, offset: 0 });
const likedIds = await EnhanceNCM.sdk.songs.getLikedIds(); // 完整账号喜欢歌单的歌曲 ID
const dailySongs = await EnhanceNCM.sdk.recommendations.getDailySongs();
const recommendedPlaylists = await EnhanceNCM.sdk.recommendations.getRecommendedPlaylists();
const radar = await EnhanceNCM.sdk.recommendations.getPrivateRadar();
const radarTracks = radar ? await EnhanceNCM.sdk.playlists.getTracks(radar.id, { limit: 500 }) : [];
const roamingSongs = await EnhanceNCM.sdk.recommendations.getPrivateRoaming();
const heartSongs = await EnhanceNCM.sdk.recommendations.getHeartMode();
await EnhanceNCM.sdk.songs.like(186016);
await EnhanceNCM.sdk.songs.unlike(186016);
// 或 await EnhanceNCM.sdk.songs.setLiked(186016, true); // false 为取消喜欢
const playback = EnhanceNCM.sdk.playback;
const unsubscribe = playback.subscribe(state => console.log(state.status, state.current));
await playback.play(tracks[0].id, { level: "standard" }); // 需有播放权限
await playback.pause();
await playback.resume();
await playback.seek(30);       // 秒
await playback.setVolume(0.5); // 0–1
await playback.stop();
unsubscribe();
```

原版页面会显示右上角的半透明 E 控件。点击它进入跟随原版深浅配色的透明设置层，选择 EnhanceNCM 音乐后会导航到深色的独立页面，卸载原前端；侧栏只显示一次 EnhanceNCM，标题栏在最小化/最大化/关闭按钮旁以图标提供“刷新界面”和“返回原版”（保留悬停提示与无障碍名称），Spotify 和 AMLL 还提供“EnhanceNCM 设置”按钮。模式选择持久化，重开客户端恢复上次的原版或增强界面；可通过 `EnhanceNCM.ui.getSettings()` 查看 `{version:1,mode,themeId}`，当前主题 ID 为 `spotify`，供以后加载更多主题使用。也可调用 `EnhanceNCM.ui.setMode("original" | "enhanced")` 和 `EnhanceNCM.ui.openSettings()`；后者会在当前支持的主题页按需打开同一设置界面。增强页加载失败会提供返回原版入口，并防止下次无限自动跳转。独立播放器已使用 `sdk.playback`，不再创建 HTMLAudio。进入独立页前仍建议暂停原版音乐：当前 SDK 无法恢复原版跨页面的播放队列。独立页的刷新/返回按钮会先等待 Native 停止；直接调用 `ui.setMode` 的调用方仍应自行先 `await playback.stop()`。标题栏已接入原生窗口控制，退出按钮会停止播放并关闭客户端。

首页显示推荐歌单、自建歌单和收藏歌单；侧栏下方的“歌单”列表同时展示已载入的自建和收藏歌单。歌曲视图默认加载热歌榜前 500 首，也可通过侧栏加号输入其他歌单 ID。普通歌单、“我喜欢的音乐”和私人雷达均按每页 500 首载入，支持继续加载；缺少歌曲详情时仍按曲目 ID 页大小推进偏移。自建和收藏歌单分别通过 `playlists.listCreated()` 与 `playlists.listSubscribed()` 每页读取 30 份，支持点击进入歌曲列表和继续加载。`specialType=5` 已有独立入口，不在自建歌单区重复列出。账号昵称由 `account.getCurrent()` 提供，可点击账号旁的刷新按钮重新读取；底部悬浮提示只显示错误，常规加载状态保留在相关页面内。

独立界面的搜索框目前仅在当前已载入的歌曲、自建歌单或收藏歌单中筛选；全站歌曲搜索已提供 SDK 方法，但尚未接入该搜索框。歌曲旁和播放器中的爱心调用账号喜欢/取消喜欢接口，状态从完整的账号喜欢歌单读取；“设备收藏”入口已移除，页面不再读写旧设备收藏数据。未登录、空歌单和接口失败都有对应状态与刷新入口。播放支持暂停、上一首/下一首、随机播放、单曲循环、拖动进度、音量及待播清单。点击播放栏封面或麦克风可打开歌词页；有时间戳时跟随播放，点击歌词行可跳转。音频加载与播放交由客户端原生引擎，仍受账号播放权限限制。开发预览和浏览器验证方法见 `ARCHITECTURE.md`。

`songs.get`、`songs.getUrl` 在无结果时返回 `null`；`getMany`、`getTracks` 返回数组。`playlists.get` 返回服务端 `playlist` 对象；`listByUser` 返回 `{items, more}`。`getTracks` 先读取歌单 `trackIds`，再按歌单原顺序查询当前页的歌曲详情；服务端未返回的歌曲会被略过。单次最多查询 1000 首，默认每页 500 首。歌曲 URL 受登录态、版权及会员权限约束，`audio.url` 可能是 `null`。

独立页确认当前账号后，通过原生 `storage.execsql` 缓存歌单元数据、用户歌单列表和已载入的歌曲页，缓存有效期为 5 分钟，按账号隔离、最多保留 200 条缓存记录。重复并发请求会合并；页面重载后仍可使用原生数据库缓存。歌曲详情优先读取原版 `dbTrack` 中版本号与当前歌单曲目版本一致的内容，其余才请求服务端。原版表只读，增强缓存写入独立表 `enhancencm_library_cache_v1`；不改写原版请求缓存格式。原版页面调用 SDK 时不安装 SQL 事件监听，缓存仅用于独立增强页。

`sdk.cache.getState()` 返回本页命中、未命中、写入、原版歌曲详情命中及失败计数。`await sdk.cache.refresh()` 验证当前账号后使其增强缓存失效；界面的刷新歌单、刷新喜欢、刷新账号及刷新推荐按钮均使用它。喜欢/取消喜欢成功后也自动失效，过期请求不能重新写入旧缓存。SQL 不可用时内容请求仍可回退到网络；账号登录检查和播放音源权限检查不缓存。

`songs.search(keyword, {limit: 30, offset: 0, needCorrect: true})` 使用当前 PC 前端的 `/api/search/song/list/page` 搜索歌曲，返回 `{items, total, more, queryRewrite}`。`items` 是按搜索结果顺序整理的歌曲对象（保留歌词片段与 `alg`），可继续分页；关键词会去除首尾空白，不能为空且最长 200 字符。`limit` 范围为 1–100。搜索不要求登录，但播放搜索结果仍受账号权限约束。Spotify 主题在“现在就听”右上角提供全站搜索，回车提交并支持分页；其他列表保留本地筛选。

`songs.getLyrics(id)` 使用当前 PC 客户端的 `/api/song/lyric/v1`，返回 `{lines, synced}`。每行包含 `{time, text, translation?}`，时间单位为秒；优先解析 LRC，缺失时使用逐字 YRC 的行时间，纯文本歌词返回 `synced:false` 和 `time:null`，无歌词返回空数组。歌词页只在打开时获取，切歌时忽略过期请求，同页已成功获取的结果复用。歌词页背景按当前歌曲封面像素取主色调，文字使用高对比度配色；取色失败时使用中性深灰，切歌后旧封面的取色结果不会覆盖新歌曲。

`account.getCurrent()` 通过当前客户端会话读取账号，返回 `{userId, profile, account}`，无登录信息时抛出 `LOGIN_REQUIRED`。`playlists.listCreated({limit,offset})` 只返回当前账号创建的歌单（包括 `specialType=5` 的“我喜欢的音乐”），结果为 `{items, more}`；它会跳过订阅的歌单，`offset` 和 `more` 均按创建的歌单计算。`playlists.listSubscribed({limit,offset})` 返回当前账号收藏的歌单，按服务端 `subscribed === true` 筛选，结果同为 `{items, more}`；默认每页 30、最多 1000，`offset` 和 `more` 按收藏歌单计算，而非混合列表的页码。这两个方法都读取客户端 `/api/user/playlist`，需要登录。`playlists.getLiked()` 返回“我喜欢的音乐”歌单摘要，找不到时返回 `null`；`playlists.getLikedTracks({limit,offset})` 和 `songs.listLiked({limit,offset})` 返回该歌单中当前页的歌曲详情，找不到时返回 `[]`。后两者复用歌单 `trackIds` 的原有顺序。`songs.getLikedIds()` 读取完整喜欢歌单的歌曲 ID（字符串数组，不请求歌曲详情；没有喜欢歌单时返回 `[]`）。`songs.setLiked(id, boolean)` 经当前账号调用客户端 `/api/song/like`，`songs.like(id)` / `songs.unlike(id)` 是快捷方法；成功返回客户端响应，失败抛错，未登录抛出 `LOGIN_REQUIRED`。账号读写均受权限限制。

`playlists.addTrack(playlistId, songId)` 与 `playlists.removeTrack(playlistId, songId)` 使用当前 PC 客户端的 `/api/v1/playlist/manipulate/tracks`，分别以 `op: "add"` 和 `op: "del"` 添加或删除当前账号创建的歌单中的一首在线歌曲。调用前会读取当前账号与目标歌单并核对创建者；收藏的他人歌单会抛出 `PLAYLIST_NOT_OWNED`，不会发送修改请求。成功时返回客户端响应并使该账号的 SDK 歌单缓存失效；重复添加、歌曲不存在等服务端错误按原始错误码抛出。

`sdk.recommendations.getRecommendedPlaylists()` 使用当前 PC 客户端的 `/api/homepage/block/page`，从 `HOMEPAGE_BLOCK_PLAYLIST_RCMD` 区块返回首页推荐歌单摘要数组，包含 `{id, name, coverImgUrl, playCount, alg}`；区块缺失时返回 `[]`。请求使用客户端的 `cursor`、`extInfo` 和 `newStyle` 参数，不要求 SDK 预先验证登录；登录状态可能影响服务端给出的推荐内容。它不返回歌单歌曲，歌曲可继续用 `playlists.getTracks(id, {limit,offset})` 获取，也不同于私人雷达。

`sdk.recommendations` 另提供四个当前账号的个性化入口，均只获取内容，不自动播放：

- `getDailySongs({version: 3, limit: 30})` 返回每日推荐歌曲数组；默认使用客户端 `/api/v3/discovery/recommend/songs` 的 `data.dailySongs`，需要兼容客户端另一分支时可指定 `version: 1` 读取 `/api/v1/discovery/recommend/songs` 的 `recommend`。
- `getPrivateRadar()` 从 `/api/pc/customize/block/page` 的 `CUSTOMIZE_PLAYLIST_MGC` 区块取得当前账号的主雷达歌单 ID，再返回该歌单详情；区块不存在时返回 `null`。ID 不写死；歌曲详情可继续调用 `playlists.getTracks(radar.id, {limit,offset})`。
- `getPrivateRoaming({imageFm: 1, mode, sourceIds})` 从 `/api/v1/radio/get` 返回一批私人漫游歌曲，重复调用可取下一批。`sourceIds` 如需指定，应传歌曲 ID 数组。
- `getHeartMode({playlistId, songId, startMusicId, count, type})` 调用 `/api/playmode/intelligence/list`，返回按服务端顺序排列的推荐歌曲数组，保留 `alg`、`recommended` 标记。默认使用当前账号“我喜欢的音乐”歌单、其中第一首歌曲和歌单歌曲数量；也可指定歌单/种子及 `type: "fromPlayOne" | "fromPlayAll"`。无喜欢歌单或无种子歌曲时返回 `[]`。服务端缺少 `songInfo` 的条目会再查询歌曲详情；无详情时保留最小 ID/标记对象。

私人雷达是真实歌单，但每日推荐是当天歌曲集合；私人漫游和心动模式是动态推荐序列，不是固定歌单。以上接口需要当前客户端已登录，不绕过播放权限；这是客户端私有协议，更新客户端后需重新验证。

增强界面的侧栏和首页快捷入口已接入四个入口，支持本地搜索、账号爱心、播放与队列。每日推荐按接口当天结果显示；私人漫游和心动模式每次只取服务端一批，不强行请求至 500 首。动态模式保留推荐顺序、对重复歌曲去重，提供“下一批推荐”，到队列末尾自动取下一批；用户切换播放来源后，旧请求不能接管新队列。空结果、未登录和失败均可在界面查看并重试。

传输层直接使用客户端注入到每个页面的 `window.channel.call("network.aegisEncrypt", callback, [options])` 与 `network.fetch`；如果通道尚未出现而原版包装器可用，则回退到 `legacyNativeCmder.call`。原版使用运行时 `APP_CONF.apiDomain`，独立页使用受白名单校验的默认 XeAPI 域名。Native 客户端处理登录态与响应解密；不复制 Cookie。这个内部协议并非网易云公开稳定 API，客户端升级后应重新做只读验证。网络或业务失败会抛出带 `code` 和 `path` 的 `EnhanceNCMError`，不会自动回退到 EAPI 或普通 `fetch`。

`sdk.playback` 是当前客户端原生 `audioplayer` 引擎的业务封装，使用已有 `songs.getUrl` 获取当前账号可用音源，然后按当前前端的 `audioplayer.load → audioplayer.onLoad → audioplayer.play` 协议播放。它提供 `play(id, {level})`、`pause()`、`resume()`、`stop()`、`seek(seconds)`、`setVolume(0..1)`、`getState()` 和 `subscribe(listener)`（返回取消订阅函数）。状态包含 `songId`、`playId`、`status`（`idle/loading/playing/paused/ended/error`）、`current`、`duration`、`volume`、`buffering` 和 `error`。底层单实例拥有当前音频，高层 `sdk.player.createSession()` 统一管理队列、上下首、随机/循环、推荐续播与 SMTC；新主题优先使用高层会话。无播放地址会抛出 `PLAY_UNAVAILABLE`，不会绕过会员/版权限制。这里的音频命令与事件名均为私有协议，不保证跨客户端版本稳定。

Native 播放层仅在页面 `channel.call/registerCall` 可用时工作（不依赖 `legacyNativeCmder`），在原版页面调用可能与原版播放器争用全局设备/事件，优先在独立页使用。UI 订阅当前会话状态并在挂载时读取 `getState()`；订阅本身不立即触发初始快照。队列和循环由 `sdk.player` 会话在 `ended` 时处理，主题无需重复绑定结束事件。`seek()` 返回只表示命令回调完成，位置以 `onSeek/onPlayProgress` 为准。`getState()` 不代表跨页面持久化状态。切换页面前应 `await stop()`；停止失败会保留原播放句柄并进入错误状态，允许调用方重试。默认主题拥有会话时，卸载会取消状态订阅并停止原生播放；共享会话模式下，主题只释放视图，由宿主负责最终停止。

播放控制中的 `pendingStatus` 为 `playing`、`paused` 或 `null`，供按钮在等待时按最新操作意图切换；`status` 保留最近确认的状态。播放/暂停命令的回调或对应 `onPlayState` 任一到达即结束等待，同一歌曲较旧请求的回调和事件不能覆盖新请求。两者都未返回时，5 秒后抛出 `TIMEOUT` 并清除等待状态，允许重试。新控制会结束被替代请求的等待；其 Promise 返回当时快照，不表示旧操作最终生效。UI 在原生确认开始播放后立即退出加载状态，后续暂停保留当前播放句柄和进度。

运行 `node tools/build-page.js` 生成页面脚本，再运行 `node --test tests/sdk.test.js` 验证参数、请求形态和结果处理；测试使用模拟桥接，不需要登录。

音频缓存已使用原版 `storage.queryNewCacheTrack` 按歌曲、码率与 MD5 查询，并向 Native 传递非试听的 `playInfoStr`。同页相同账号/权益/音质的有效授权地址可以复用，期限不超过音源 `expi` 与 5 分钟中的较短值；首次、过期、权益变化仍获取新授权，`resume()` 不重新获取。试听不进入全曲授权复用记录。`playback.getState().audioCache.openWholeCached === true` 表示 Native 确认本次打开完整缓存；查询到 `cached=100` 本身不代表加载已完成。`sdk.audioCache.getState()` 提供查询及地址复用计数，`clearMemory()` 仅清除页内授权记录。跨页面离线授权流程尚未移植。详见 THEME_API.md。

`sdk.artwork.getUrl(url, size = 320)` 为 UI 生成稳定的 `orpheus://cache?` 图片地址，size 是 16–1024 的 CSS 像素整数；Native 负责缓存和回源。`sdk.systemMedia.createSession(onAction)` 提供 `update(song, playbackState)`、`clear()`、`dispose()`，按原版流程预加载 Native 图片缓存后同步 SMTC/任务栏封面，同时更新窗口标题与托盘提示，清空时恢复默认名。`sdk.window` 提供窗口状态查询/订阅、最小化、最大化/还原、拖动、四角/右侧缩放与关闭。详见 `ARCHITECTURE.md`。


直接启动时，宿主在挂载后调用 `sdk.window.initialize()` 完成 Native 主窗口启动通知；主题无需重复调用。`sdk.window.subscribeActivate(listener)` 订阅已有实例的再次启动事件，取消订阅函数与其他窗口事件一致；`sdk.window.activate()` 显示并置前当前窗口。

Spotify 主题的“歌曲”显示当前播放队列，待播侧栏最多展示前 100 首，完整队列保留。歌曲行和待播歌曲支持右键下一首播放、添加到账号创建的歌单；自己歌单中的歌曲还可从歌单删除。`sdk.player.getActiveSession().insertNext(song)` 将歌曲移到当前歌曲后，下一次切歌优先播放它（包括随机模式），不打断当前播放。

## 主题共享服务（SDK 12）

主题不应引用 `_libraryCache`、`_settings`、`_playerPersistence` 或 `_coverColors`。对应公开入口：

| 服务 | 公共入口 |
| --- | --- |
| 按账号隔离的页面快照 | `sdk.librarySnapshots`，保留 `lastAccount/read/save/rememberAccount/forgetAccount` 接口 |
| 播放恢复协调器 | `sdk.persistence.attach(player, options)` |
| 播放偏好 | `sdk.settings.getPlayback()` / `sdk.settings.setPlayback(change)` |
| 封面配色 | `sdk.coverColors`，与公共 `sdk.artwork` 配合使用 |

页面宿主在 `EnhanceNCM-page.js` 中提供 `EnhanceNCM.app.whenReady()`、`mount()`、`unmount()` 和 `isStandalone()`。`EnhanceNCM-sdk.js` 本身不挂载 DOM，也不提供 `app` 对象。

## 正在播放兼容服务（SDK 14）

`sdk.settings.getNowPlaying()` 返回 `{webApi, fileOutput}`；`sdk.settings.setNowPlaying({webApi, fileOutput})` 校验并持久化两个开关，同时通知 Native 服务。两个开关默认都是 `false`。主题通常只调用公开设置接口，不需要访问 `_nowPlaying`。

启用后，原生层在本机 `127.0.0.1:9863` 提供与 `now-playing-service` 兼容的接口：`/api/query`、`/api/query/player`、`/api/query/track`、`/api/query/progress`、`/api/query/hasSong`、`/api/lyric` 和 `/api/ws/lyric`；`/query*` 也保留为兼容别名，并提供封面转换、输出模板设置及常用系统信息路由。WebSocket 事件名为 `Track`、`Lyric`、`PlayerPauseState` 和 `PlayerProgress`。

文件输出位于安装目录的 `EnhanceNCM/Outputs/`：`title.txt`、`author.txt`、`cover.jpg` 和 `custom.txt`。`custom.txt` 默认模板为 `{author} - {title}`，模板设置保存在 `EnhanceNCM/Settings/settings-output.json`；两个开关保存在 `EnhanceNCM/Settings/settings.json` 的 `nowPlaying` 节点中。模板可使用 `author`、`firstAuthor`、`title`、`album`、`duration` 和 `durationHuman`。写文件采用原子替换，适合 OBS 等直播软件轮询读取。

## 本地音乐（SDK 13）

`sdk.localMusic.read(absolutePath)` 通过客户端读取文件存在状态及元数据，返回带 `localPath` 的歌曲对象，ID 使用 `local:` 命名空间。可传给 `sdk.player.getActiveSession().play(song)`，或 `sdk.playback.play(song)`；本地播放直接使用 Native 文件源，不请求在线歌曲 URL。文件路径支持 Windows 绝对路径、UNC 路径和 `file://` URL。

`sdk.localMusic.subscribeOpen(listener)` 监听客户端的 `ipc.onipcmessagerecived`（消息 2）和 `app.onplaylocalmusic`；`getStartupPaths()` 读取客户端启动时待打开的音乐路径。宿主在主题挂载前订阅、挂载后处理，统一将本地歌曲加入播放队列。拖入时优先使用客户端原生事件，也接受 DOM 提供的绝对文件路径；普通浏览器不提供本地路径时会提示使用“打开方式”。

本地歌曲支持暂停、进度、切歌、下一首播放和队列保存；文件被移动或删除时提示失败。本地文件不直接对应在线歌曲 ID，主题会禁用账号爱心、在线歌单增删及在线歌词查询。文件解码能力以网易云原生播放器为准。

`sdk.localMusic.getArtwork(song)` 返回原版使用的 `orpheus://localmusic/pic?<路径>` 地址，由客户端提取内嵌封面；没有封面时主题保留占位图。`sdk.localMusic.getLyrics(song)` 通过 `orpheus://localmusic/lyric?<路径>` 获取本地歌词，失败后尝试 Native 读取同目录同名 `.lrc`；缺少歌词返回空结果，读取失败可重试。歌词使用与在线歌曲相同的解析器，支持逐行高亮和点击定位。`sdk.songs.getLyrics(localSong)` 也支持完整本地歌曲对象。
