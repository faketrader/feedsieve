# Firefox 源码复现

构建环境为 Node.js 22 和仓库声明的 pnpm 版本。源码包根目录执行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @feedsieve/extension zip:firefox
```

Firefox MV3 扩展包与源码包生成在 `apps/extension/.output/`。构建不读取 `.env`，生产 API 地址由版本库中的 WXT 配置固定。
