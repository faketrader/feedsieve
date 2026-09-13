import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSidePanel } from './sidepanel';

const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, 'browser');

afterEach(() => {
  if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
  else Reflect.deleteProperty(globalThis, 'chrome');
  if (originalBrowser) Object.defineProperty(globalThis, 'browser', originalBrowser);
  else Reflect.deleteProperty(globalThis, 'browser');
});

describe('getSidePanel', () => {
  it('优先返回 Chromium sidePanel', () => {
    const chromeApi = { open: vi.fn() };
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: { sidePanel: chromeApi },
    });
    Object.defineProperty(globalThis, 'browser', {
      configurable: true,
      value: { sidebarAction: { open: vi.fn() } },
    });
    expect(getSidePanel()).toBe(chromeApi);
  });

  it('将 Firefox sidebarAction 映射到统一接口', async () => {
    const open = vi.fn(async () => undefined);
    const setPanel = vi.fn(async () => undefined);
    Reflect.deleteProperty(globalThis, 'chrome');
    Object.defineProperty(globalThis, 'browser', {
      configurable: true,
      value: { sidebarAction: { open, setPanel } },
    });

    const api = getSidePanel();
    await api?.setOptions?.({ enabled: true, path: 'popup.html' });
    await api?.open?.({ windowId: 1 });

    expect(setPanel).toHaveBeenCalledWith({ panel: 'popup.html' });
    expect(open).toHaveBeenCalledOnce();
  });
});
