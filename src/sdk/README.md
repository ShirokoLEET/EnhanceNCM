# SDK

主题无关的公共能力。`transport/` 适配客户端通道，`domain/` 管理业务、播放会话、缓存与恢复，`domain/music.js` 汇总 `EnhanceNCM.sdk`。

不依赖 `src/host/` 或具体主题。模块加载顺序在 `tools/build-page.js`，接口见 [SDK 文档](../../docs/SDK.md)。
