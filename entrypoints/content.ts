import { defineContentScript } from 'wxt/utils/define-content-script';
import { onMessages, sendMessage } from '@/src/messaging';
import { captureSelection } from '@/src/capture/selection';
import { highlightQuote } from '@/src/capture/highlight';
import { SelectionToolbar } from '@/src/capture/toolbar';

declare global {
  interface Window {
    __chat2knowContentLoaded?: boolean;
  }
}

export default defineContentScript({
  // Injected on demand by the background via scripting.executeScript; never auto-registered.
  registration: 'runtime',
  matches: [],
  main() {
    if (window.__chat2knowContentLoaded) return;
    window.__chat2knowContentLoaded = true;

    const toolbar = new SelectionToolbar(document, async (type) => {
      const capture = captureSelection(document, location.href);
      if (!capture) throw new Error('No selection');
      await sendMessage('capture/save', { type, capture });
    });
    toolbar.mount();

    onMessages({
      'content/capture': () => captureSelection(document, location.href),
      'content/highlight': ({ quote }) => ({ found: highlightQuote(document, quote) }),
    });
  },
});
