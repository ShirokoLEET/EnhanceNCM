# 播放列表与退出恢复

## 原版客户端的保存位置

分析对象是当前机器安装的网易云音乐 3.1.39.205426，依据本机前端源码和实际文件，未修改原版数据。

| 内容 | 当前版本的保存方式 | 本机证据 |
| --- | --- | --- |
| 当前待播列表 | 本地 Native 文件 | `%LOCALAPPDATA%\NetEase\CloudMusic\webdata\file\playingList`，JSON 的 `list` 字段；检查时有 216 项 |
| 上次待播列表 | 本地 Native 文件 | 同目录 `lastTimePlayingList`，检查时有 2838 项 |
| 音量、静音前音量、播放模式 | 本地持久化配置 | 原版 `onVolumeUpdate` 更新持久化对象；`volumeWatcher` 启动时读取并调用 Native 设置音量 |
| 当前歌曲与播放位置 | 本地 `lastPlaying` 持久化对象 | 包含 `current`、`resourceDuration`、`resourceId`、`trackId`、`quality`，启动时用于恢复歌曲 |
| 跨设备接续 | 另有按条件启用的云同步功能 | `async:playingListHandoff` 处理播放源、播放状态及队列变更；`shouldUpload` 受登录状态、实验分组和下发配置的 `enable` 控制 |

源码明确选择 `file` 播放列表实现；`replaceCurPlayingList` 写 `playingList`，`replaceLastTimePlayingList` 写 `lastTimePlayingList`。本地文件里的条目包含显示顺序、随机顺序、歌曲实体、来源和歌曲 ID，不只是云歌单 ID。

因此，本机退出恢复依赖本地数据，不能把待播列表简单说成“只保存在云端”。账号创建/收藏的歌单和跨设备接续是不同的功能。这里确认了云接续代码存在及其启用条件，没有假定当前账号已开启云接续。

检查用源码副本在 `out/client-sources/app.chunk.d4e863d.js`。搜索 `playingList`、`replaceCurPlayingList`、`lastPlaying.initFormatter`、`onVolumeUpdate`、`volumeWatcher`、`async:playingListHandoff` 可定位相关逻辑。

## EnhanceNCM 配置

现有配置使用浏览器配置键 `enhancencm.settings.v1`，不是单独的磁盘 JSON 文件。新增 `playback`，并保留原有 `version`、`mode`、`themeId`：

```json
{
  "version": 1,
  "mode": "enhanced",
  "themeId": "spotify",
  "playback": {
    "rememberVolume": true,
    "restoreQueue": true,
    "restorePosition": true,
    "autoPlay": false,
    "volume": 0.35,
    "previousVolume": 0.35
  }
}
```

`volume` 为 0～1；0 表示静音，`previousVolume` 记录取消静音时恢复的音量。示例中的 0.35 不是强制默认值。按本次选择，`autoPlay` 固定为 false：恢复后暂停，不自动打开音频流。

记住音量、恢复歌曲及待播列表、恢复进度统一默认开启，设置页不再显示播放恢复开关。旧配置中的关闭值不会禁用恢复；`getPlaybackSettings()` 返回启用状态，`setPlaybackSettings({...})` 继续支持保存音量，但恢复开关统一为 true。恢复后保持暂停，不自动播放。

## 队列与进度

队列存在 Native SQLite：`%LOCALAPPDATA%\NetEase\CloudMusic\Library\webdb.dat` 的独立表 `enhancencm_player_session_v1`，以账号 ID 为键，未登录使用 `guest`。它与短期歌单响应缓存分离，刷新资料库不清除它，不写原版的队列文件。

每份快照保存歌曲 ID、歌曲展示资料、队列顺序、当前歌曲、进度秒数、来源、随机和单曲循环状态。最多支持 10000 首；不保存临时音频 URL、Cookie、播放句柄或续播函数。重新播放仍经过当前账号的音源授权流程；私人漫游和心动模式的续播函数由来源类型重新建立。

歌曲/队列变化合并后写入，进度约每 5 秒保存。正常退出、刷新或返回原版时，先等待快照保存，再停止 Native 播放，防止停止事件的 0 秒覆盖最后进度。异常终止只能恢复最近成功写入的进度。保存失败时正常退出流程保留页面，允许重试。

启动可先按本地缓存账号恢复暂停状态，联网确认账号变化后撤下旧队列并读取对应账号。迟到的读盘结果不会覆盖用户新选择的歌曲。点播放才重新加载音源，并在发出播放命令前提交保存的 seek 位置。

## 验证

自动测试覆盖跨页面恢复、静音、退出保存顺序、账号隔离、迟到读取、配置开关、坏数据、保存失败重试、临时音源字段剔除、SQLite 持久化及 seek-before-play。

实机命令 `node tools/check-player-persistence-live.js --save-and-exit` 会改变播放状态并退出客户端；重启客户端后运行 `--verify`。2026-09-14 验证了 500 首队列、同一歌曲、43 秒位置、23% 音量和播放模式；冷启动未打开音频流，点击后从保存位置播放。测试后已暂停并恢复测试前音量。
