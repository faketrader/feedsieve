# Firefox fork 维护

- `main`：上游最新正式 Release 对应提交的快进镜像。
- `firefox`：默认分支，承载 Firefox 适配、维护文档和工作流。
- 每天 12:34 UTC（新加坡/北京时间 20:34）查询上游最新正式 GitHub Release，也可在 Actions 手动运行。草稿和预发布版本不进入同步链路。
- 有新 Release 时将 `main` 快进到该 Release 对应提交，创建或复用 `main → firefox` PR，并显式调用 `verify` 检查合并结果。主分支发生分叉、超前或合并冲突时工作流失败，保留现有分支供维护者处理。
- 定时验证在独立工作流中执行；在对应运行摘要核对两端 commit，与 PR 最新状态一致且检查通过后，使用 **Create a merge commit** 合并。保留 `main` 分支。
- 日常功能 PR 以 `firefox` 为目标。Firefox 发布从 `firefox` 构建。推送与扩展版本一致的 `firefox-v<version>` 标签后，发布工作流直接创建 GitHub Release 并附加 Firefox ZIP 与源码包，不使用 Actions Artifact。
- 同步工作流使用 GitHub 内置令牌。仓库需启用 Actions，并允许 Actions 创建 PR。公开仓库长期无活动时，GitHub 可能暂停定时工作流，应检查 Actions 状态。
- 社区名单镜像任务由上游仓库执行，fork 随上游提交接收数据更新。

## 手动同步

```sh
release_tag=$(gh api repos/realchendahuang/feedsieve/releases/latest --jq .tag_name)
git fetch upstream "refs/tags/$release_tag"
git switch main
git merge --ff-only FETCH_HEAD
git push origin main
gh workflow run sync-upstream.yml --ref firefox
```

## 验证与发布边界

`verify` 执行代码检查、测试和扩展构建。Firefox 的浏览器运行兼容性、AMO 签名和发布验收需在适配阶段完成；分支同步通过仅代表对应工作流验证通过。
