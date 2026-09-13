/**
 * 单 article 的扫描管线：提取 → 检测 → 标注/折叠/豁免。
 * 只处理传入的这一个节点；调度（脏集合、分片、防重入）由 PageScanController 负责。
 */

import { toHandleSet } from '@feedsieve/detector';
import { contextFromPath, extractFeedItem, tweetSelectors } from '@feedsieve/x-adapter';
import { runDetectionPipeline } from '../detection/detection-pipeline';
import { recordDetection } from '../detection/detection-log';
import {
  scanRevision,
  type PageScanController,
  type PendingBadge,
} from '../detection/page-scan-controller';
import { getBundledEntries } from '../community/community-store';
import { hideCellsSoon } from '../platform/remove-tweets';
import type { ContentState } from './page-state';
import type { Badges } from './badges';
import type { BlockedFold } from './blocked-fold';
import type { ManualActions } from './manual-actions';

/**
 * 最近一次公开最终名单随扩展打包，作为离线兜底。
 * 社区名单走运行时同步（background SW -> storage.local -> 这里建索引），
 * 服务器快照永远是权威来源。
 * 名单 JSON（2 MB+ 级）不进 JS chunk，作为打包资源运行时 fetch（替换原来
 * 的静态 import——它会同步锁住 content script 的 JS 解析三个入口各一份）。
 */
let builtinList: ReadonlySet<string> = toHandleSet([]);
void getBundledEntries()
  .then((entries) => {
    builtinList = toHandleSet(entries as never[]);
  })
  .catch(() => {
    // 打包资源缺失属异常；保持空集，社区名单同步通道仍可用
  });

export function createScan(deps: {
  state: ContentState;
  controller: PageScanController;
  fold: BlockedFold;
  badges: Badges;
  manual: ManualActions;
}) {
  const { state, controller, fold, badges, manual } = deps;
  const { markCell } = badges;
  const { attachManualAction } = manual;

  /**
   * 单个 article 的提取 + 检测 + 标注。
   * 只处理传入的这一个节点；调度（脏集合、分片、防重入）由 PageScanController 负责。
   */
  function scanOne(
    rawArticle: Element,
    context: ReturnType<typeof contextFromPath>,
    pendingBadges: PendingBadge[],
  ): void {
    const article = rawArticle;
    const element = rawArticle;
    // X 虚拟列表可能在扫描排队期间把节点回收掉
    if (!element.isConnected) {
      controller.forget(element);
      return;
    }
    const item = extractFeedItem(element, context);
    if (!item) {
      controller.dropSnapshot(element);
      return;
    }
    const handle = item.author.handle.toLowerCase();
    controller.remember(element, handle);
    const bio = state.bioCache.get(handle);
    // revision 快照：虚拟列表复用同一 article 时跳过已标注过的输入
    if (!controller.hasChanged(element, scanRevision(item, bio))) {
      return;
    }

    const input = {
      handle: item.author.handle,
      postId: item.postId,
      displayName: item.author.displayName,
      text: item.text,
      bio,
      links: item.links,
    };

    // 自己的帖子：永不折叠也永不标注（selfHandle 未知时防御性不跳过；
    // 后面 blockedCache 等检查都不得先于它，避免自己拉黑自己这种数据异常
    // 把帖子藏起来）。
    if (state.selfHandle && handle === state.selfHandle) {
      return;
    }

    // 用户已经显式拉黑的账号高于检测开关/白名单保护：X 若又把它渲染出来，
    // 直接以非破坏性的方式折叠该 cell，而不是插入一个会再次改变高度的提示条。
    // 被拉黑者本人主页豁免折叠，理由见 shouldFoldBlockedTweets。
    if (state.blockedCache.has(handle)) {
      const cell = article.closest(tweetSelectors.timelineCell) ?? article;
      state.pageMarked.delete(handle);
      state.notifyPageMarkedChanged();
      if (fold.shouldFoldBlockedTweets(handle)) {
        hideCellsSoon([cell], 0);
      }
      return;
    }

    // 检测 / 增强 / 分层 / 分类推导统一走 detection-pipeline（可独立单测的单元）
    const result = runDetectionPipeline({
      input,
      community: state.community,
      builtinList,
      keywordHeuristics: state.keywordHeuristics,
      catalog: state.keywordCatalog,
      strength: state.strength,
      uiLanguage: state.uiLanguage,
    });
    const isProtected = state.allowCache.has(handle) || state.followingCache.has(handle);
    if (isProtected) {
      // SPA 路由切换不会清 pageMarked：保护名单里的账号重现在扫描里时，
      // 把残留的旧条目就地清掉（DOM 装饰保持原状，无需在这里动它）。
      if (state.pageMarked.has(handle)) {
        state.pageMarked.delete(handle);
        state.notifyPageMarkedChanged();
      }
    }
    if (isProtected || !state.detectionEnabled || result.presentation === 'ignore') {
      attachManualAction(article as HTMLElement, handle, result.evidence);
      return;
    }

    // 本地规则质量观测：只有真正到达页面的命中才计数（见 detection-log.ts）
    void recordDetection({
      handle,
      ruleId: result.detection!.ruleId ?? result.detection!.source,
      source: result.detection!.source,
      category: result.category ?? 'other',
      reason: result.detection!.reason,
      fingerprint: result.evidence.contentFingerprint,
    });

    // 标注打在外层时间线格子上（PureTwitter 同款目标层）；找不到才退回 article
    const cell = article.closest(tweetSelectors.timelineCell) ?? article;
    markCell(
      cell as HTMLElement,
      result.detection!,
      result.category ?? 'other',
      result.evidence,
      pendingBadges,
      item.text,
      item.author.displayName,
    );
  }

  return { scanOne };
}
