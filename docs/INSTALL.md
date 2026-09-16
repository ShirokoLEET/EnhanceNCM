# EnhanceNCM 安装说明

适用于 Windows 10/11 x64、网易云音乐桌面版 x64。系统需已安装新版 Microsoft Visual C++ x64 运行库（提供 MSVCP140.dll、VCRUNTIME140.dll、VCRUNTIME140_1.dll）；本包只附带一个项目 DLL，不重复打包系统运行库。网易云自带的 msvcp120.dll/msvcr120.dll 不能替代这些依赖。当前验证版本为 3.1.39.205426；其他客户端版本的兼容性尚未验证。

1. 完全退出网易云音乐，包括系统托盘中的进程。
2. 打开网易云安装目录，确认能看到 cloudmusic.exe。
3. 将 build 目录中的全部文件和 EnhanceNCM 文件夹复制到该目录，合并同名文件夹。不要把外层 build 文件夹直接复制进去。
4. 启动网易云，在原版右上方点击 E，在“界面模式”选择 Spotify。

安装后的结构：

    CloudMusic/
      cloudmusic.exe
      msimg32.dll
      EnhanceNCM.js
      EnhanceNCM-sdk.js
      EnhanceNCM-page.js
      EnhanceNCM/
        Spotify/
          theme.js

这些文件都已编译或打包，使用者无需安装 Node.js、Visual Studio 或启动其他服务。复制到 Program Files 时可能需要管理员权限。

首次安装或替换现有插件前，请先备份同名文件；msimg32.dll 是本项目入口，不能与其他使用同名入口的插件直接覆盖混用。

Spotify 是主题名称，页面左上角品牌显示 EnhanceNCM。进入主题后不显示 E；通过主题标题栏的“返回网易云原版”按钮返回并切换其他主题。

新增主题：在 EnhanceNCM 中创建一个文件夹，放入符合 EnhanceNCM 主题接口的 UTF-8 theme.js，然后返回原版点击“重新扫描主题”，或重启客户端。保留其他已有主题文件夹，更新 Spotify 不会要求删除它们。

歌曲、待播列表、播放进度和音量默认恢复，恢复后保持暂停。

manifest.json 记录发布文件的 SHA-256，可用于核对文件完整性；它和本说明无需参与运行。

卸载：退出网易云，移除本包的 msimg32.dll、EnhanceNCM.js、EnhanceNCM-sdk.js、EnhanceNCM-page.js 和不再需要的主题文件夹；如曾备份同名插件文件，请恢复备份。不要删除网易云自带或系统目录内的其他 DLL。
