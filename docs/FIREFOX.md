# Firefox 支持

本仓库维护 `faketrader/feedsieve` 的 Firefox fork，与 Chrome 版共用代码，构建目标为 MV3。Firefox Gecko ID 为 `feedsieve@faketrader.github.io`，沿用已有 fork 的扩展身份和本地存储。

manifest 声明桌面 Firefox 最低版本为 140，Android 最低版本为 142。Android 的侧边栏、弹窗和 X 页面操作仍需真机验证。

## 构建

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @feedsieve/extension build:firefox
pnpm check:extension:firefox
```

产物在 `apps/extension/.output/firefox-mv3/`。校验脚本会检查 MV3、Gecko ID、权限、`sidebar_action`、`background.scripts`、MAIN world 网络桥和入口文件。

生成 Firefox 扩展包和完整源码包：

```sh
pnpm --filter @feedsieve/extension zip:firefox
pnpm check:extension:firefox
pnpm dlx web-ext@10.6.0 lint --source-dir apps/extension/.output/firefox-mv3 --output text
```

产物位于 `apps/extension/.output/`，文件名为 `feedsieve-<version>-firefox.zip` 和 `feedsieve-<version>-sources.zip`。源码包包含扩展源码、workspace packages、公开名单和词库、根配置、许可证、隐私政策及构建文档。复现步骤见 [源码构建说明](FIREFOX-AMO-BUILD.md)。

源码包不包含本地环境文件。生产构建使用固定官方 API `https://api.feedsieve.win`；`FEEDSIEVE_API_BASE` 只在 development 构建中生效。

## 本机调试

### about:debugging

1. 打开 Firefox，地址栏输入 `about:debugging#/runtime/this-firefox`
2. 点「临时加载附加组件」，选择 `apps/extension/.output/firefox-mv3/manifest.json`
3. 从扩展菜单打开工具栏弹窗，或在弹窗中点击侧边栏按钮
4. 改代码后重新 build，在 about:debugging 里点「重载」

### web-ext

```sh
pnpm dlx web-ext@10.6.0 run --source-dir apps/extension/.output/firefox-mv3
```

`web-ext run` 会用临时 profile 启动 Firefox 并自动加载扩展；关闭终端后临时扩展消失。

## 平台配置

| 项           | Chrome                                 | Firefox                                                                         |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------- |
| 侧边栏       | `side_panel` + `sidePanel` 权限        | `sidebar_action`，入口为 `popup.html?panel=1`，安装时不自动打开                   |
| 后台         | service worker                         | `background.scripts`（事件页，空闲会停）                                        |
| 权限         | storage / unlimitedStorage / sidePanel | storage / unlimitedStorage                                                      |
| Gecko ID     | —                                      | `feedsieve@faketrader.github.io`                                                 |
| 最低版本     | —                                      | 桌面 Firefox 140；Android 142                                                   |
| 数据传输声明 | 商店隐私权表单                         | `browser_specific_settings.gecko.data_collection_permissions`                   |

`getChromeSidePanel()` 在 Firefox 下用 `browser.sidebarAction` 模拟 `open` / `close`，调用方无需分支。两者都要求用户手势，从 content script 转发点击时可能失败，界面按「侧边栏打开失败」提示。

## 上游发行

上游 `realchendahuang/feedsieve` 的 AMO 条目为 [FeedSieve 福滤娃](https://addons.mozilla.org/zh-CN/firefox/addon/feedsieve-fuluwa/)，使用 Gecko ID `feedsieve-official@feedsieve.win`。上游的提交记录、第三方条目说明和浏览器验收记录见 [v0.18.1 的 Firefox 文档](https://github.com/realchendahuang/feedsieve/blob/v0.18.1/docs/FIREFOX.md)。

本 fork 的 GitHub Release 使用 `firefox-v<version>` 标签，附带上述扩展包和源码包。源码包构建继续使用 `feedsieve@faketrader.github.io`。
