# 开发、测试与发布

## JavaScript

使用 Node.js 22.13 或更新版本（需要 `node:sqlite`）。

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run preview
```

`npm test` 会先构建脚本，然后运行全部 JavaScript 测试。原生目录扫描测试仅在 `out/theme-files-test.exe` 已编译时运行，否则报告 skip；CI 不声称覆盖原生层。可通过 `ENHANCENCM_PLAYWRIGHT` 和 `ENHANCENCM_CHROMIUM` 复用已有测试工具。

## 原生构建

1. 安装 Visual Studio C++ v145、Windows SDK、Node.js 和 xmake。
2. 执行 `git submodule update --init --recursive`。
3. 执行 `npm run deps:patch`。脚本会检查并应用 `patches/chromatic/runtime-lifecycle.patch`；已应用时不会重复修改，版本不匹配时停止。
4. 在 `third_party/chromatic` 执行 `xmake build chromatic-core`。
5. 检查 `chromatic-deps.props` 的包版本和 xmake 缓存路径。当前文件保留已验证构建的包哈希，不同机器的包哈希可能不同，需要匹配本机安装结果。这部分尚未实现自动依赖发现。
6. 用 Visual Studio 打开 `EnhanceNCM.slnx`，构建 Release / x64。

工程源码从 `src/inject/` 编译，构建后自动执行脚本打包与 `tools/package-release.js`。安装路径与旧版兼容。Win32 工程配置仍保留，但当前依赖与发布流程只验证 x64。

Chromatic 补丁包含 QuickJS 生命周期修复及 fmt 头文件兼容修复。请先应用补丁再编译静态库，不要只复制旧库。

## 发布

完整 Release x64 构建会生成 `build/manifest.json`，记录发布文件 SHA-256。仅运行 `npm run build` 不更新已有清单；仅修改 JS 后可执行：

```sh
node tools/package-release.js x64/Release/msimg32.dll
```

此命令复用指定 DLL，不代表重新验证了原生代码。若改动 `src/inject/`，必须先重新编译 DLL。

退出网易云后，运行 `powershell -File tools/install.ps1` 安装。脚本备份文件到 `out/deployment-backups/`，不覆盖其他主题。发布前还应实机确认启动、切换主题、播放、退出及恢复。`tools/check-*-live.js` 是显式运行的本机诊断工具，CI 不调用这些工具。

## CI 范围

`.github/workflows/checks.yml` 在 GitHub 托管 Windows runner 上运行分层检查与 JS 测试。使用普通 `pull_request`、只读仓库权限、不保留 checkout 凭据，Actions 固定到提交 SHA。此工作流不上传发布包、不部署客户端，也不构建 DLL。


本地封面缓存原生回归测试：在 VS x64 开发者命令行中执行 `cl /EHsc /std:c++20 /utf-8 /Fe:out/artwork-cache-test.exe /Fo:out/ tests/artwork-cache.test.cpp src/inject/artwork_cache.cpp`，再运行 `node --test tests/artwork-cache.test.js`。该测试验证 PNG 读取、缓存键复用、未知地址与写入方法拒绝及并发读取；仅加载测试程序时创建回环图片端点。

更新原生部分时应退出客户端以替换 DLL。
