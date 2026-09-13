export interface SidePanelApi {
  open?: (options: { windowId: number }) => Promise<void>;
  close?: (options: { windowId: number }) => Promise<void>;
  setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
  setOptions?: (options: { enabled?: boolean; path?: string; windowId?: number }) => Promise<void>;
}

interface FirefoxSidebarActionApi {
  open?: () => Promise<void>;
  close?: () => Promise<void>;
  setPanel?: (options: { panel: string }) => Promise<void>;
}

/** Chromium sidePanel 与 Firefox sidebarAction 的统一最小适配层。 */
export function getSidePanel(): SidePanelApi | undefined {
  if (typeof globalThis !== 'undefined') {
    const glob = globalThis as unknown as {
      chrome?: {
        sidePanel?: SidePanelApi;
      };
      browser?: {
        sidebarAction?: FirefoxSidebarActionApi;
      };
    };
    if (glob.chrome?.sidePanel) return glob.chrome.sidePanel;

    const firefox = glob.browser?.sidebarAction;
    if (firefox?.open) {
      const open = firefox.open;
      const close = firefox.close;
      const setPanel = firefox.setPanel;
      return {
        open: async () => open(),
        ...(close ? { close: async () => close() } : {}),
        ...(setPanel
          ? {
              setOptions: async ({ path }: { path?: string }) => {
                if (path) await setPanel({ panel: path });
              },
            }
          : {}),
      };
    }
  }
  return undefined;
}
