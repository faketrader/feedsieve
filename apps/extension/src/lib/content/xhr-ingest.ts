/**
 * MAIN world XHR 桥（xhr-bridge.content.ts）数据的消费端：
 * GraphQL 权威数据经 CustomEvent 进 ISOLATED world —— rest_id 入库、bio 进内存
 * 缓存、following 增量入保护名单、selfHandle 同步、Following 分页转交同步器。
 */

import { saveUserIds } from '../community/user-ids';
import { setSelfHandle, upsertFollowingAccounts } from '../community/following-allowlist';
import { sanitizeBridgePayload } from '../platform/xhr-bridge-guard';
import type { FollowingSync } from '../community/following-sync';
import type { PageScanController } from '../detection/page-scan-controller';
import type { ContentState } from './page-state';
import type { StateSync } from './state-sync';

export function createXhrIngest(deps: {
  state: ContentState;
  controller: PageScanController;
  followingSync: FollowingSync;
  resetPageDecorationsForHandles: StateSync['resetPageDecorationsForHandles'];
}) {
  const { state, controller, followingSync, resetPageDecorationsForHandles } = deps;

  /** 消费 MAIN world XHR 桥的数据：rest_id 入库（LRU 上限内），bio 进内存缓存。 */
  function listenXhrBridge(): void {
    // 注意：桥 dispatch 在共享的 document 上；window 是各 world 独立的，监听 window 收不到
    document.addEventListener('feedsieve:xhr-items', (event) => {
      try {
        // 事件通道可被页面内任意脚本伪造（review F1）：先过严格形态消毒，
        // 非法条目整条丢弃，只消费校验过的基本类型字段（见 xhr-bridge-guard.ts）。
        const sanitized = sanitizeBridgePayload(
          JSON.parse((event as CustomEvent<string>).detail),
        );
        if (!sanitized) {
          return;
        }
        for (const { handle, bio } of sanitized.bios) {
          if (state.recordBio(handle, bio)) {
            state.dirtyHandles.add(handle);
          }
        }
        if (sanitized.selfHandle) {
          // 同步本地缓存（先于存储落盘，让后续扫描立即豁免自己的帖子）；
          // 切换账号时清理旧账号帖子的标注装饰。
          if (state.selfHandle !== sanitized.selfHandle) {
            state.selfHandle = sanitized.selfHandle;
            resetPageDecorationsForHandles(new Set([sanitized.selfHandle]));
          }
          void setSelfHandle(sanitized.selfHandle);
        }
        // Timeline 里明确带 following=true 的作者可即时加入保护；完整 Following
        // 分页必须只写 draft，直到所有 cursor 结束才原子替换，避免失败留下半截名单。
        if (sanitized.followedEntries.length > 0 && !sanitized.isFollowingPage) {
          void upsertFollowingAccounts(sanitized.followedEntries).catch(() => {
            // 本地关注保护写入失败不影响 X 页面
          });
        }
        if (sanitized.isFollowingPage) {
          void followingSync.onPage({
            tweets: [],
            promoted: [],
            listMembers: [],
            following: sanitized.following,
            ...(sanitized.followingCursor ? { followingCursor: sanitized.followingCursor } : {}),
            ...(sanitized.sourceUrl ? { sourceUrl: sanitized.sourceUrl } : {}),
            matchedEndpoints: ['Following'],
          });
        }
        if (sanitized.idEntries.length > 0) {
          void saveUserIds(sanitized.idEntries).catch(() => {
            // 存储失败不阻塞浏览；下次同账号出现会重试
          });
        }
        // bio is authoritative data that often arrives after the first DOM
        // pass. Only invalidate cards for the handles whose bio changed.
        if (state.dirtyHandles.size > 0) {
          for (const handle of state.dirtyHandles) {
            controller.markDirtyForBio(handle);
          }
          state.dirtyHandles.clear();
        }
        controller.schedule();
      } catch {
        // detail 非法 JSON：静默
      }
    });
  }

  return { listenXhrBridge };
}
