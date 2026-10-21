import { defineContentScript } from 'wxt/utils/define-content-script';
import { onMessages } from '@/src/messaging';
import { describePage } from '@/src/capture/page-info';

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

    onMessages({
      'content/describe': () => describePage(document, location.href),
    });
  },
});
