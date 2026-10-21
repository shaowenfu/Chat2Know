import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { onMessages, sendTabMessage } from '@/src/messaging';

const CONTENT_SCRIPT = '/content-scripts/content.js';

async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId !== undefined) return tabId;
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab');
  return tab.id;
}

export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  onMessages({
    ping: ({ from }) => ({ from: 'background', echo: from, at: Date.now() }),
    'page/probe': async ({ tabId }) => {
      const id = await resolveTabId(tabId);
      // Inject on demand; the content script guards against double registration.
      await browser.scripting.executeScript({ target: { tabId: id }, files: [CONTENT_SCRIPT] });
      return sendTabMessage(id, 'content/describe', {});
    },
  });
});
