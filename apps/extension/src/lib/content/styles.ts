/**
 * content script 的注入样式（ISOLATED world 无法共享样式文件，只能在这里注入）。
 * 调整主题时需要与 popup.css 同步检查基础色。
 */

import { HIDDEN_TWEET_CELL_ATTRIBUTE } from '../platform/remove-tweets';
import { MARK_ATTRIBUTE } from './page-state';

const STYLE_ELEMENT_ID = 'feedsieve-mark-styles';

export function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  // 基础黄色与 popup.css 复用；content 的外框另以透明度收敛。
  // isolated world 无法共享样式文件，调整主题时两处需要同步检查。
  style.textContent = `
    /* 统一细黄环标注：所有命中保持同一种视觉语言。outline 不占布局空间（区别于
       border），不会挤压格子内容；降低线宽和不透明度，避免时间线变成警戒围栏。 */
    [${MARK_ATTRIBUTE}] {
      outline: 2px solid rgba(245, 158, 11, 0.68) !important;
      outline-offset: -2px;
      border-radius: 16px;
    }
    /* 嵌套命中（引用帖/媒体也自成 cellInnerDiv）只保留最外层一圈黄框：
       框中框既冗余又像渲染 bug（2026-09-12 真机反馈）。 */
    [${MARK_ATTRIBUTE}] [${MARK_ATTRIBUTE}] {
      outline: none !important;
    }
    /* X 的 cell 仍由其 React/虚拟列表持有；只折叠显示，绝不从 DOM 物理删除。 */
    [${HIDDEN_TWEET_CELL_ATTRIBUTE}] {
      display: none !important;
    }
    .fs-badge {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 3.5px 11px;
      /* 底边距贴本体 cell 的下边：徽章必须紧挨自己的黄框，
         不给视觉上「挂在下一格」的空间（2026-09-12 真机反馈）。 */
      margin: 3px 12px 2px;
      width: fit-content;
      max-width: calc(100% - 24px);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 999px;
      background: #fffbeb;
      color: #92400e;
      font-size: 12px;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(245, 158, 11, 0.08);
    }
    .fs-reason { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* 主操作组：保持短标签，避免挤压 X 自带操作。 */
    .fs-actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    /* 次操作组：抢救 / 误标？（低频治理，弱化） */
    .fs-actions-soft { gap: 4px; }
    .fs-block-now {
      min-width: 34px;
      padding: 2.5px 8px;
      border: 1px solid #d97706;
      border-radius: 999px;
      background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(217, 119, 6, 0.2);
      transition: all 120ms ease;
    }
    .fs-block-now:hover:not(:disabled) { background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%); transform: translateY(-0.5px); }
    .fs-block-now:disabled { opacity: 0.6; cursor: wait; }
    .fs-allow {
      padding: 2.5px 8px;
      border: 1px solid #d4d4d8;
      border-radius: 999px;
      background: #fff;
      color: #71717a;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 120ms ease;
    }
    .fs-allow:hover { border-color: #a1a1aa; color: #3f3f46; }
    .fs-manual-mark {
      margin-left: auto;
      min-width: 32px;
      padding: 0 7px;
      min-height: 26px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: rgb(113, 118, 123);
      font: inherit;
      font-size: 11.5px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 120ms ease;
    }
    .fs-manual-mark:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.12);
      color: #b45309;
    }
    .fs-manual-mark:disabled { opacity: 0.65; cursor: wait; }
  `;
  document.documentElement.appendChild(style);
}
