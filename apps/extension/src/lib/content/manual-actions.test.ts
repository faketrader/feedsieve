// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { createManualActions } from './manual-actions';
import { createContentState } from './page-state';
vi.mock('../community/contribute', () => ({ syncLocalLabels: vi.fn(async () => ({})) }));
vi.mock('../community/allowlist', () => ({ removeAllowed: vi.fn(async () => {}) }));
vi.mock('../community/following-allowlist', () => ({
  removeFollowingAccount: vi.fn(async () => {}),
}));
it('manual button uses latest evidence after X recycles or revises an article', async () => {
  const blockOne = vi.fn(async () => ({ ok: true as const }));
  const fold = { shouldFoldBlockedTweets: () => false } as unknown as Parameters<
    typeof createManualActions
  >[0]['fold'];
  const actions = createManualActions({ state: createContentState(), blockOne, fold });
  const article = document.createElement('article');
  article.innerHTML = '<div role="group"><button data-testid="like">Like</button></div>';
  actions.attachManualAction(article, 'old_user', { tweetText: 'old text' });
  actions.attachManualAction(article, 'new_user', { tweetText: 'new text', evidencePostId: '123' });
  expect(article.querySelectorAll('[data-fs-manual-action]')).toHaveLength(1);
  article.querySelector<HTMLButtonElement>('[data-fs-manual-action]')!.click();
  await vi.waitFor(() =>
    expect(blockOne).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'new_user',
        evidence: expect.objectContaining({
          tweetText: 'new text',
          evidencePostId: '123',
          detectionSource: 'manual',
        }),
      }),
      expect.anything(),
    ),
  );
});
