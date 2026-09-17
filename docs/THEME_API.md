# 自定义主题 API · SDK 11

主题面向页面侧 `EnhanceNCM.sdk` 编写，不需要复制当前内置界面的播放器逻辑。原生桥接、账号请求、缓存和播放业务保留在 SDK；布局、配色、图标、列表展示和交互反馈由主题决定。

主题现在从网易云音乐安装目录的 `EnhanceNCM/Themes` 文件夹自动发现。每个直接子文件夹是一套主题，入口固定为 UTF-8 的 `theme.js`（普通 JavaScript，不是 ES module；单文件上限 8 MiB）。文件夹名就是主题 ID 和列表名称，支持中文与空格；`Spotify` 特别保留旧 ID `spotify`。不需要修改注册表、宿主配置或重新编译 DLL。

```text
C:\Program Files\NetEase\CloudMusic\
  msimg32.dll
  EnhanceNCM\
    EnhanceNCM.js               Chromatic 侧脚本，保持独立
    EnhanceNCM-sdk.js           公共 API、播放、缓存与窗口服务
    EnhanceNCM-page.js          页面入口、主题管理、通用设置和托盘
    Themes\
      Spotify\theme.js          原有页面，现命名为 Spotify
      我的主题\theme.js
```

在网易云原版中点击右上方 **E → 界面模式**。进入主题后不显示 E；Spotify 和 AMLL 的窗口栏都提供“EnhanceNCM 设置”入口，可直接打开宿主设置浮层。Spotify 也可使用标题栏的“返回网易云原版”按钮，再切换其他主题。放入新文件夹后点击“重新扫描主题（刷新页面）”，或重启客户端；每次主页面上下文创建都会重新读取目录。当前不使用文件系统实时监听。没有入口或入口不可读的文件夹仍显示在列表中，并注明错误。

选择主题会等待旧 renderer 清理、保存主题 ID，再重建页面加载所选主题。第三方主题的顶层代码仅在被选中时执行。页面重建会结束当前 JS 播放会话；Spotify 默认恢复歌曲、队列、进度和音量，并保持暂停。目录主题切换不承诺无缝播放。主题删除、语法错误或注册失败会显示错误或通过启动恢复返回原版，保留主题 ID 便于检查；重新进入设置选择可用主题即可。

最小 `theme.js`：

```js
EnhanceNCM.themes.register({
  name: '我的主题',
  mount({ root, sdk, theme }) {
    root.innerHTML = '<h1>我的音乐</h1>';
    // root 是独立 ShadowRoot；sdk 是共享业务 API；theme 包含 id/name。
    return async function cleanup() {
      // 取消订阅、移除监听，并 await 释放主题创建的播放会话。
    };
  }
});
```

每个入口必须同步调用一次 `register`；`mount` 可以异步返回清理函数。CSS 可通过 ShadowRoot 内的 `<style>` 提供，资源可内联；宿主目前不提供文件夹相对 URL 的静态资源服务，也不解析 HTML 入口或 theme.json。完整可安装示例在 `examples/themes/Minimal/theme.js`，将整个 `Minimal` 文件夹复制到 `EnhanceNCM/Themes` 即可。设置浮层由页面宿主管理；主题可通过 `EnhanceNCM.ui.openSettings()` 打开它，并应提供返回原版的操作：先清理播放会话，再调用 `EnhanceNCM.ui.setMode("original")`。

公开管理 API：`EnhanceNCM.themes.list()` 返回只读的 `{id,name,error}` 列表，`select(id)` 选择并进入主题，`refresh()` 重载并扫描，`getActive()` 返回本页已挂载的主题 ID。`EnhanceNCM.ui.getSettings()` 仍兼容 `{version,mode,themeId}`。

主题代码与页面处于同一运行环境；此接口不是权限沙箱。Chromatic/QuickJS 的 `EnhanceNCM.js` 不使用这套页面接口。

## 能力边界

| 主题需要的能力 | 公开接口 | 由谁管理 |
| --- | --- | --- |
| 队列、选曲、上下首、随机、单曲循环、连续推荐 | `sdk.player.createSession()` | 宿主持有一个共享会话 |
| 原生音频、进度、缓冲、音量 | 会话方法；底层 `sdk.playback` | Native 播放器 |
| SMTC 标题、艺人、封面、系统播放按钮 | `player.connectSystemMedia()` | 会话统一同步 |
| 歌曲详情、全站搜索、账号喜欢/取消喜欢 | `sdk.songs` | 业务 SDK，见 SDK.md |
| 账号、歌单列表、500 首分页 | `sdk.account`、`sdk.playlists` | 业务 SDK |
| 四种推荐内容 | `sdk.recommendations` | 服务端结果；页面决定展示 |
| 缓存封面地址 | `sdk.artwork.getUrl(url, size)` | Native 图片缓存 |
| 歌单缓存刷新与统计 | `sdk.cache.refresh()`、`getState()` | Native 数据库 |
| 艺人、专辑、时间格式、本地筛选 | `sdk.presentation` | 无 DOM 的纯函数 |
| 最小化、最大化、拖动、缩放、关闭 | `sdk.window` | 主题绑定自己的标题栏元素 |
| 桥接就绪、独立 ShadowRoot、卸载 | `EnhanceNCM.app` | 页面宿主 |

`src/sdk/domain/player-session.js` 是无 DOM 的播放会话，当前默认主题已使用它。`presentation.js` 提供展示辅助函数。其余业务接口在 `music.js`、`shell.js` 和 `library-cache.js`。主题不要依赖 `_native`、`_transport`、原版 webpack 模块、SQL 表或默认主题内部变量。

## 创建一个共享播放会话

```js
const sdk = await EnhanceNCM.app.whenReady();
const player = sdk.player.createSession({
  onError(error) { console.error('自动切歌或系统操作失败', error); },
  onMediaError(error) { console.error('系统媒体同步失败', error); }
});
player.connectSystemMedia();

const songs = await sdk.recommendations.getDailySongs();
if (songs.length) {
  await player.play(songs[0], { queue: songs, source: 'daily' });
}
```

每个页面只允许一个会话拥有原生播放器。默认主题自己创建会话；接管已有默认主题前先 `await EnhanceNCM.app.unmount()`。创建第二个会话会抛错，应共享已有会话或等旧会话成功 `dispose()` 后再创建。

`createSession` 的三个可选回调：`onError` 处理自动切歌和 SMTC 操作失败；`onMediaError` 处理媒体同步失败；`resolveSong(id)` 为同页通过底层 SDK 发起的播放补全歌曲对象，默认使用 `sdk.songs.get`。回调由宿主持有，切换主题后仍须有效。直接调用的异步命令应由调用方 `await/catch`。

### 会话状态

```js
const state = player.getState();
// {
//   song: Song | null,
//   queue: readonly Song[],
//   source: string | null,
//   shuffle: boolean, repeatOne: boolean,
//   dynamic: boolean, loading: boolean,
//   playback: {songId, playId, status, pendingStatus,
//              current, duration, volume, buffering, error}
// }
```

歌曲必须有正整数 `id`（安全整数或十进制字符串），通常还带 `name`、`ar/artists`、`al/album`、`dt/duration`。会话复制输入歌曲并冻结快照，不能直接修改 `queue`。进度更新保留未变化的歌曲和队列引用，可据此避免列表重绘。`current/duration` 的单位是秒，歌曲元数据中的 `dt/duration` 单位是毫秒。

```js
function render(state) { /* 用状态更新主题 DOM */ }
const unsubscribe = player.subscribe(render);
render(player.getState()); // subscribe 不会自动推送初始快照
// 移除这个主题时：
unsubscribe();
```

播放按钮应依据 `loading` 与 `playback.pendingStatus || playback.status` 显示意图，使用 `player.toggle()` 执行切换。`loading` 时点击会取消加载；已暂停时继续使用原生播放句柄。不要在每次进度更新时用 `innerHTML` 重建按钮图标，装饰 SVG 可设置 `pointer-events:none`。

### 会话方法

| 方法 | 行为 |
| --- | --- |
| `play(song, {queue?, source?, loadMore?, level?})` | 指定歌曲并起播；传 `queue` 时替换队列与来源，不传时保留队列。默认标准音质 |
| `toggle()` | 暂停、继续或取消正在加载的播放；没有歌曲时不自动选歌 |
| `pause()` / `resume()` | 显式原生暂停/继续 |
| `next()` | 下一首；普通队列手动到末尾会回到开头，动态队列请求下一批 |
| `previous()` | 当前已播放超过 3 秒则回到开头，否则上一首 |
| `setShuffle(boolean)` | 有限队列开启时先一次性打乱播放顺序，之后上下首沿该顺序移动；关闭时恢复原顺序。存在动态提供函数时保持服务端顺序 |
| `setRepeatOne(boolean)` | 仅自动结束时重复当前歌曲；手动下一首仍切歌 |
| `seek(seconds)` | 提交定位，最终进度由原生事件确认 |
| `setVolume(0..1)` / `toggleMute()` | 设置音量，静音后恢复最近非零音量 |
| `append(songs, expectedSource?)` | 追加并按 ID 去重；来源不匹配时忽略结果 |
| `clearContinuation()` | 清除来源和下一批提供函数，保留当前歌曲与队列；适用于账号切换 |
| `stop()` | 停止音频，取消未完成的播放/续播意图，保留歌曲及队列供再次播放 |
| `connectSystemMedia()` | 一次性连接 SMTC；重复调用不重复注册 |
| `clearSystemMedia()` | 清除当前系统媒体信息；页面导航前使用 |
| `dispose()` | 取消监听并停止音频、释放 SMTC；失败时可再次调用重试 |

播放、控制与定位等异步会话命令完成时返回会话快照；`dispose`、`clearSystemMedia` 返回 `Promise<void>`。设置模式、连接系统媒体与清除续播函数为同步方法。底层 `sdk.playback` 仍可用于调试或低层集成，但主题优先使用共享会话，避免另外创建 SMTC 会话或重复处理结束事件。

## 动态推荐与主题无关

```js
const songs = await sdk.recommendations.getPrivateRoaming();
if (songs.length) {
  await player.play(songs[0], {
    queue: songs,
    source: 'roaming',
    loadMore: sdk.player.recommendationLoader('roaming')
  });
}
```

`recommendationLoader` 支持 `roaming` 和 `heartmode`，返回 `(state) => Promise<Song[]>`。心动模式用当前歌曲与队列第一首作为下一批种子。提供函数只依赖 SDK，不依赖某个主题的 DOM 或视图状态；当前主题卸载后仍可续播。

自定义来源也可以提供相同签名的 `loadMore`，每次返回一批歌曲即可。会话合并同时发生的续播请求，按 ID 去重；切歌、停止、切换来源或释放会话后，旧批次不会接管新队列。没有新歌曲时抛出 `NO_RECOMMENDATIONS`，用户可稍后重试。每日推荐和雷达是有限列表，不需要动态提供函数。

## 挂载与切换主题

`app.mount(renderer)` 为主题创建 ShadowRoot，并调用 `renderer({root, sdk})`。renderer 可以异步返回清理函数；`await app.unmount()` 会等待清理完成，也会等待被取消的异步 renderer 返回并清理。新挂载会等待正在进行的卸载。

可运行的轻量示例位于 `examples/themes/minimal.js`，不参与生产打包。加载示例后：

```js
const sdk = await EnhanceNCM.app.whenReady();
await EnhanceNCM.app.unmount(); // 退出默认主题，并等待它释放自有会话
const player = sdk.player.createSession();
player.connectSystemMedia();
await EnhanceNCM.app.mount(EnhanceNCMExampleTheme(player));

// 后续主题切换：清理当前视图，保留 player，由下一个 renderer 继续订阅。
await EnhanceNCM.app.unmount();
await EnhanceNCM.app.mount(EnhanceNCMExampleTheme(player));

// 退出音乐页面时由宿主释放共享会话。
await EnhanceNCM.app.unmount();
await player.dispose();
```

共享模式下，renderer 清理函数只释放自身订阅、DOM、事件和未完成的数据展示请求，不停止共享音频。宿主在账号切换时调用 `clearContinuation()` 并刷新账号数据，在真正退出时负责 `dispose()` 和 `pagehide` 的尽力清理。停止失败时应允许重试，不继续创建新播放会话。

默认 renderer 也支持由包装函数传入 `player`，便于后续主题宿主接管；内部 `_renderMusic` 仅用于内置主题和预览，不属于第三方主题的稳定 API。默认自行创建会话的模式下，卸载仍会停止播放。跨主页面导航或重启客户端不会保留 JS 会话，不能据此恢复原版队列。

## 展示、窗口和账号操作

`sdk.presentation.artists(song)` 返回艺人显示文本，`album(song)` 返回兼容两种字段的专辑对象，`time(seconds)` 返回 `m:ss`，`filterSongs(songs, query)` 按歌曲/艺人/专辑进行已载入列表的本地筛选。全站搜索使用 `sdk.songs.search`，不是 `filterSongs`。

封面元素的 `src` 使用 `sdk.artwork.getUrl(album.picUrl, 320)`；不自行增加时间戳。歌词使用 `sdk.songs.getLyrics(id)`，返回已解析的行及同步标记；播放进度仍以共享 player 会话为准。歌词页通过 `_coverColors.sample` 对当前封面取样，设置 `--lyrics-color-background`、`--lyrics-color-inactive`、`--lyrics-color-active`、`--lyrics-color-passed`；未取到颜色时使用中性深灰。窗口标题栏调用 `sdk.window.drag()`、`toggleMaximize()`；按钮调用 `minimize()`、`close()`；拖动前排除交互控件，缩放使用 `resize(edge)`。关闭前先停止会话。完整签名见 SDK.md 与 `shell.js`。

账号爱心使用 `songs.getLikedIds()` 读取完整 ID 集合，`setLiked(id, boolean)` 写入；请求未完成时阻止同一歌曲重复写入，成功后更新显示，失败保持原状态。SDK 已负责喜欢操作后的缓存失效。账号刷新应丢弃旧视图请求结果。主题自行管理这些展示状态，业务接口无需重复实现。

## 缓存事实与限制

| 数据 | 当前行为 | 与原版关系 |
| --- | --- | --- |
| 歌单列表、歌曲元数据 | 原生 SQLite，5 分钟、账号隔离，版本匹配时读 `dbTrack` | 同一原生存储；增强缓存使用独立表，策略不完全相同 |
| 封面 | `orpheus://cache?` 与原版 SMTC 预加载流程 | 复用原生图片缓存 |
| 授权播放地址 | 同页、同账号与权益快照、同请求音质，在有效期内复用；`resume` 不重新取地址 | 页内最多 32 条，取音源 `expi` 与 5 分钟较短值 |
| 音频字节 | 按歌曲 ID、实际码率和 MD5 查询原生缓存，继续由 `audioplayer` 加载 | `onLoad.openWholeCached` 确认此次实际打开了完整缓存 |

音源选择已提取到 `audio-source.js`。使用原版 `storage.queryNewCacheTrack({songId,bitrate,md5})` 查询，bitrate 单位为 kbps；核对歌曲 ID、码率和 MD5 后才承认 `cached === 100`。原生加载仍使用 type=4，补齐原版非试听 `playInfoStr` 与 `X-SONG-INFO`，由客户端管理缓存文件及播放信息写入。缓存文件存在但元信息缺失时仍可在新授权后使用文件，写入时机由 Native 决定。

首次起播或授权记录过期时获取新授权地址；重复播放可使用页内仍有效的授权记录，同时检查当前账号与权益快照。账号/权益/音质变化、退出登录或加载失败均不复用旧授权。试听以及 `freeTrialPrivilege.resConsumable && userConsumable` 的完整试听结果不进入可复用全曲授权记录，也不写全曲 `playInfoStr`。缓存查询失败或不完整时使用已授权音源交给 Native 加载。此实现没有照搬原版的实验分组与离线授权流程；跨页面仍需首次授权，缓存文件本身不授予播放权限。

`sdk.playback.getState().audioCache`（高层会话中为 `state.playback.audioCache`）包含：`urlSource`（`network/memory`）、`cachePercent`、`cacheComplete`、`hasNativePlayInfo`、`openWholeCached`、`preloadWholeCached`。查询字段是起播前快照，未查得时百分比为 null；两个加载字段来自原生 `onLoad`，客户端未提供时为 null。主题可用 `openWholeCached === true` 显示本次缓存命中，不能仅凭查询完整就断言已加载。

`sdk.audioCache.getState()` 返回 `urlRequests/urlReuses/cacheChecks/completeHits/cacheErrors`；`completeHits` 统计查询到的完整缓存，不等于实际加载次数。`clearMemory()` 只清除页内授权复用记录，不删除原生缓存文件。页面退出后授权记录自然消失。

联网请求播放地址不代表整首音频重新下载。不能用歌单缓存命中计数、`dbTrack` 或封面加载成功作为音频命中证明；本次缓存命中也不代表下次无需联网授权或一定可离线播放。
