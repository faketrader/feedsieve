# Firefox fork 维护

- `main`：上游最新正式 Release 对应提交的快进镜像。
- `firefox`：默认分支，承载 Firefox 适配、维护文档和工作流。
- 每周日 12:34 UTC（新加坡/北京时间 20:34）查询 `realchendahuang/feedsieve` 的最新正式 GitHub Release，也可在 Actions 手动运行。草稿和预发布版本不进入同步链路；上游尚无正式 Release 时任务正常结束，不改动分支。
- 有新 Release 时将 `main` 快进到该 Release 对应提交，并把该提交合入 `firefox`。合并结果必须通过 lint、类型检查、测试、Chrome 与 Firefox 构建及 `web-ext lint`。
- 验证通过后，工作流原子推送 `firefox` 分支和同版本发布标签，并派发 Firefox 发布。发生分叉、合并冲突或验证失败时，Actions 会报错并停止发布，不会创建或更新 PR。
- 社区 API 验证由 `pnpm verify` 使用仓库 Compose 启动 PostgreSQL；工作流不再另外创建占用同一端口的数据库服务。
- 日常功能 PR 以 `firefox` 为目标。定时同步发现上游新 Release 后，会合并并验证 `firefox`，自动创建同版本的 `firefox-v<version>` 标签，再直接创建 GitHub Release 并附加 Firefox ZIP 与源码包，不使用 Actions Artifact。人工推送同格式标签仍可触发发布。
- 同步工作流优先使用仓库 Secret `UPSTREAM_SYNC_TOKEN`；该细粒度令牌仅授权当前仓库的 Contents 和 Workflows 写入，用于同步上游可能包含的工作流变更。仓库还需启用 Actions。公开仓库长期无活动时，GitHub 可能暂停定时工作流，应检查 Actions 状态。
- 社区名单镜像任务由上游仓库执行，fork 随上游提交接收数据更新。

## 手动同步

```sh
release_tag=$(gh api 'repos/realchendahuang/feedsieve/releases?per_page=100' \
  --jq '[.[] | select(.draft == false and .prerelease == false)][0].tag_name // empty')
[ -n "$release_tag" ] || { echo '上游暂无正式 Release'; exit 0; }
git fetch https://github.com/realchendahuang/feedsieve.git "refs/tags/$release_tag"
git switch main
git merge --ff-only FETCH_HEAD
git push origin main
gh workflow run sync-upstream.yml --ref firefox
```

## 验证与发布边界

`verify` 执行代码检查、测试和扩展构建。GitHub Release 中的 Firefox ZIP 未经 Mozilla 签名，可在 `about:debugging#/runtime/this-firefox` 通过「临时载入附加组件」加载解压后的 `manifest.json`，Firefox 重启后失效。浏览器运行兼容性需另行验收。
