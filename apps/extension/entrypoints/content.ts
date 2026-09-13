import { noteTimelineHealth } from '@feedsieve/x-adapter';
import { PageScanController, type ScanCallbacks } from '../src/lib/detection/page-scan-controller';
import {
  createKeywordHeuristics,
  subscribeKeywordRules,
} from '../src/lib/detection/keyword-rules';
import {
  KEYWORD_PACK_SYNC_MAX_AGE_MS,
  subscribeKeywordPackCatalog,
} from '../src/lib/detection/keyword-packs';
import { subscribeCommunity } from '../src/lib/community/community-store';
import { createFollowingSync } from '../src/lib/community/following-sync';
import {
  createQueueSupervisor,
  QUEUE_HEARTBEAT_KEY,
} from '../src/lib/queue/queue-supervisor';
import {
  getPersistentBlockQueue,
  setPersistentBlockQueue,
  type PersistentBlockQueueState,
} from '../src/lib/queue/block-queue-store';
import { getUiLanguage, subscribeUiLanguage } from '../src/lib/platform/i18n';
import { createContentState, MARK_ATTRIBUTE } from '../src/lib/content/page-state';
import { createBlockOne } from '../src/lib/content/block-core';
import { createBlockedFold } from '../src/lib/content/blocked-fold';
import { createManualActions } from '../src/lib/content/manual-actions';
import { createBadges } from '../src/lib/content/badges';
import { createScan } from '../src/lib/content/scan';
import { createStateSync } from '../src/lib/content/state-sync';
import { createXhrIngest } from '../src/lib/content/xhr-ingest';
import { createBlockQueueRunner } from '../src/lib/content/block-queue';
import { registerContentMessageHandlers } from '../src/lib/content/messages';
import { ensureStyles } from '../src/lib/content/styles';

/**
 * Phase 1 content script：黄框标注（带理由）。一键拉黑 = 当前页面全部黄框账号。
 *
 * - ISOLATED world（冻结决策）
 * - 标注绝不改动页面内容显示，也不破坏 X 布局。
 *   借鉴成熟方案（PureTwitter / TBWL）：
 *   1. 黄圈打在 article 的外层 cellInnerDiv 上 —— 纯 border，无背景色；
 *      绝不往 article（CSS grid 容器）里塞元素。
 *   2. 理由徽章作为 cellInnerDiv 的块级子元素排在推文下方，不覆盖任何内容。
 * - MutationObserver 只发现候选节点，WeakSet 去重，debounce 批量扫描
 * - XHR 桥（xhr-bridge.content.ts，MAIN world）通过 CustomEvent 送来
 *   GraphQL 权威数据：在这里缓存 rest_id（拉黑 API 必需）与 bio（检测增强）。
 * - 页面黄框集合 pageMarked 是会话内内存态：拉黑成功即移除，
 *   页面刷新后重新扫描重建（不需要跨页面持久化）。
 *
 * 本文件只做装配（状态 / 控制器 / 各模块的创建与接线）；实现分布在
 * src/lib/content/ 各内聚模块（page-state / scan / badges / manual-actions /
 * block-core / blocked-fold / block-queue / state-sync / xhr-ingest / messages / styles）。
 */
export default defineContentScript({
  matches: ['https://x.com/*'],
  main() {
    const state = createContentState();
    // 扫描调度 / 节点索引 / revision 快照 / MutationObserver 全部收敛到 PageScanController；
    // 检测与标注通过 callbacks 注入。scanOne / flushPendingBadges 依赖 controller，
    // 先以占位绑定创建，模块装配完成后再回填（回调只在 observe / fullRescan 之后
    // 触发，回填必然先行完成）。
    const scanWiring: {
      processOne: ScanCallbacks['processOne'];
      flushBadges: ScanCallbacks['flushBadges'];
    } = {
      processOne: () => {},
      flushBadges: () => {},
    };
    const controller = new PageScanController({
      processOne: (article, context, pendingBadges) => {
        scanWiring.processOne(article, context, pendingBadges);
      },
      flushBadges: (pendingBadges) => {
        scanWiring.flushBadges(pendingBadges);
      },
      noteHealth: (ok, reason) => {
        noteTimelineHealth(ok, reason);
      },
    });
    const fold = createBlockedFold(controller);
    const { blockOne } = createBlockOne(state);
    const manual = createManualActions({ state, blockOne, fold });
    const badges = createBadges({ state, runBlockNow: manual.runBlockNow });
    const scan = createScan({ state, controller, fold, badges, manual });
    scanWiring.processOne = scan.scanOne;
    scanWiring.flushBadges = badges.flushPendingBadges;
    const sync = createStateSync({ state, controller, fold });
    // Following 全量同步（分页循环 / draft 原子替换）收敛到 following-sync。
    const followingSync = createFollowingSync();
    const xhrIngest = createXhrIngest({
      state,
      controller,
      followingSync,
      resetPageDecorationsForHandles: sync.resetPageDecorationsForHandles,
    });
    // 持久队列生命周期（心跳 / resume 双跑防御 / 孤儿降级）收敛到 queue-supervisor：
    // 状态机纯函数可单测，这里只注入存储适配与真实执行体。supervisor 与 runner
    // 互相引用（runQueue / runExecutor），经函数提升的端口解耦构造顺序。
    function runQueue(): void {
      void queueSupervisor.run();
    }
    const queueRunner = createBlockQueueRunner({ state, blockOne, fold, runQueue });
    const queueSupervisor = createQueueSupervisor({
      load: getPersistentBlockQueue,
      save: (session) => setPersistentBlockQueue(session as PersistentBlockQueueState),
      readHeartbeat: async () => {
        const result = await browser.storage.local.get(QUEUE_HEARTBEAT_KEY);
        return result[QUEUE_HEARTBEAT_KEY];
      },
      writeHeartbeat: (at) => {
        void browser.storage.local.set({ [QUEUE_HEARTBEAT_KEY]: at }).catch(() => {
          // 心跳写失败不打断队列
        });
      },
      runExecutor: () => queueRunner.executePersistentQueue(),
    });

    ensureStyles();
    // 扩展重载后旧页面上一代 content script 已被销毁，但黄框/徽章 DOM 还挂着：
    // 新一代脚本应清掉这些「死标记」再开始自己的扫描，否则残留装饰和
    // 弹窗会各说各话（用户看到的黄框查不到、弹窗显示 0）。
    // 正常首次加载的页面此刻不可能有任何 FeedSieve 装饰（扫描尚未开始），
    // 清理只会在 reload 残留场景生效。
    for (const cell of document.querySelectorAll(`[${MARK_ATTRIBUTE}]`)) {
      cell.removeAttribute(MARK_ATTRIBUTE);
    }
    for (const element of document.querySelectorAll('.fs-badge, .fs-manual-mark')) {
      element.remove();
    }
    sync.refreshAllowCache();
    sync.refreshFollowingCache();
    sync.refreshBlockedCache();
    sync.refreshSelfCache();
    void sync.refreshCommunity();
    void sync.refreshKeywordHeuristics();
    void getUiLanguage().then((language) => {
      state.uiLanguage = language;
    });
    subscribeUiLanguage((language) => {
      state.uiLanguage = language;
      sync.resetPageDecorations();
    });
    subscribeKeywordRules((settings) => {
      state.keywordHeuristics = createKeywordHeuristics(settings, state.keywordCatalog);
      sync.resetPageDecorations();
    });
    subscribeKeywordPackCatalog((catalog) => {
      state.keywordCatalog = catalog;
      void sync.refreshKeywordHeuristics().then(sync.resetPageDecorations);
    });
    xhrIngest.listenXhrBridge();
    // 请 background SW 同步社区快照（社区名单仍按自己的节流策略更新）。
    void browser.runtime.sendMessage({ type: 'feedsieve:community-sync' }).catch(() => {
      // SW 暂不可达（开发热重载等）：下次页面加载再试
    });
    const requestKeywordPackSync = (): void => {
      void browser.runtime.sendMessage({ type: 'feedsieve:keyword-packs-sync' }).catch(() => {
        // 词库远程同步失败时，继续用最后一次校验通过的版本或内置版本。
      });
    };
    requestKeywordPackSync();
    window.setInterval(requestKeywordPackSync, KEYWORD_PACK_SYNC_MAX_AGE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestKeywordPackSync();
    });
    void queueSupervisor.pauseOrphaned(true);
    registerContentMessageHandlers({
      state,
      queueSupervisor,
      followingSync,
      startPersistentQueue: queueRunner.startPersistentQueue,
      runManualSpamBlock: manual.runManualSpamBlock,
    });
    // 快照/设置变化（同步、换强度档）实时生效到下一次扫描；只订阅一次
    subscribeCommunity(() => {
      void sync
        .refreshCommunity()
        .then(sync.resetPageDecorations)
        .catch(() => {
          // 刷新失败保持旧索引
        });
    });

    // 页面变化监听 + 扫描调度：收敛在 PageScanController（有脏才调度，反馈环由
    // .fs-badge/.fs-manual-mark 过滤；无关 mutation 直接忽略）
    controller.observe(document.body);

    // SPA 路由变化：X 不触发页面加载，靠 History API 探测以刷新 context
    window.addEventListener('popstate', () => controller.fullRescan());
    window.addEventListener('hashchange', () => controller.fullRescan());

    controller.fullRescan();
  },
});
