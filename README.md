# EnhanceNCM

网易云音乐 Windows 桌面客户端的主题宿主与 JavaScript SDK。默认提供 Spotify 风格主题，界面品牌为 **EnhanceNCM**。

支持账号歌单、全站歌曲搜索、个性化推荐、歌词、播放队列和歌曲右键操作。音频通过客户端原生播放器播放；可用音源仍取决于账号权限。

## 安装

退出网易云后，将发布包中的全部文件复制到 `cloudmusic.exe` 同级目录。自行构建时复制 `build/` **里面的内容**，不要嵌套外层目录。所需文件包括一个 `msimg32.dll`、公共脚本及 `EnhanceNCM/Spotify/theme.js`。

已验证的客户端版本：Windows x64 **3.1.39.205426**。需要系统安装新版 Microsoft Visual C++ x64 运行库。原版右上角 **E → 界面模式** 可切换主题。[完整安装与卸载说明](docs/INSTALL.md)

## 项目分层

```text
src/
├─ inject/               DLL、CEF 桥接、主题目录扫描、Native 脚本
├─ sdk/                  公共 SDK：传输、音乐 API、播放会话、缓存
│  ├─ transport/
│  └─ domain/
├─ host/                 页面入口、挂载生命周期、主题管理、通用设置
│  └─ ui/
└─ themes/
   └─ spotify/           Spotify 主题视图、交互和样式
```

| 层 | 职责 | 产物 |
| --- | --- | --- |
| Inject | 将公共脚本和主题目录信息接入客户端 | `msimg32.dll`、`EnhanceNCM.js` |
| SDK | 提供主题无关的账号、歌曲、歌单、播放与存储能力 | `EnhanceNCM-sdk.js` |
| Host | 选择并挂载主题，管理入口、恢复与退出 | `EnhanceNCM-page.js` |
| Theme | 使用 SDK 渲染界面 | `EnhanceNCM/<主题>/theme.js` |

构建配置位于根目录，`tools/` 提供构建和诊断工具，`tests/` 保存测试，`docs/` 保存设计说明。`build/` 是发布目录，`out/`、`x64/` 是本地产物，不提交 Git。

## 开发

页面和主题开发需要 Node.js **22.13+**，CI 使用 22.21.0。

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run preview
```

- `npm run build`：重新生成 SDK、宿主和主题脚本。
- `npm run test:unit` / `npm run test:ui`：分别运行单元测试和浏览器测试。
- `npm run preview`：启动本地演示，使用模拟账号和音频桥接。

原生 DLL 需要 Visual Studio C++ x64 工具链（当前 v145）、Windows SDK 和 xmake。按[开发说明](docs/DEVELOPMENT.md)初始化 Chromatic 子模块并应用仓库内补丁后，构建 `EnhanceNCM.slnx` 的 **Release / x64**。成功后自动生成完整 `build/` 及校验清单。

## 文档

- [架构与依赖边界](docs/ARCHITECTURE.md)
- [开发、测试与发布](docs/DEVELOPMENT.md)
- [SDK 接口](docs/SDK.md)
- [主题开发](docs/THEME_API.md)与[最小主题示例](examples/themes/minimal.js)
- [播放恢复](docs/PLAYBACK_PERSISTENCE.md)
- [贡献指南](CONTRIBUTING.md)

GitHub CI 校验 JavaScript 分层、构建和浏览器测试；原生 DLL 构建及客户端实机验证仍需 Windows 开发环境。第三方 Chromatic 代码保留其原有许可；仓库当前尚未声明项目整体许可证。
