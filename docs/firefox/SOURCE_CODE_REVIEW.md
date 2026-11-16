# Firefox 源码复现

本源码包用于 `faketrader/feedsieve` 的 Firefox fork，Gecko ID 为 `feedsieve@faketrader.github.io`。manifest 声明桌面 Firefox 最低版本 140、Android 最低版本 142；Android 运行兼容性仍需真机验证。侧边栏入口为 `popup.html?panel=1`，安装时不自动打开。

构建环境为 Node.js 22 或更高版本，以及仓库声明的 pnpm 版本。源码包根目录执行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @feedsieve/extension zip:firefox
pnpm check:extension:firefox
```

Firefox MV3 扩展包和完整源码包生成在 `apps/extension/.output/`，文件名为 `feedsieve-<version>-firefox.zip` 和 `feedsieve-<version>-sources.zip`。源码包包含构建所需的扩展源码、workspace packages、公开名单和词库、配置及 manifest 检查脚本。

源码包不包含本地环境文件。生产构建固定使用官方 API `https://api.feedsieve.win`；`FEEDSIEVE_API_BASE` 仅在 development 构建中生效。
