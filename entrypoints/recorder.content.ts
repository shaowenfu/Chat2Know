import { defineContentScript } from 'wxt/utils/define-content-script';
import { sendMessage } from '@/src/messaging';
import { startRecorder } from '@/src/capture/recorder';
import { siteFor } from '@/src/capture/sites';

declare global {
  interface Window {
    __chat2knowRecorderLoaded?: boolean;
  }
}

/**
 * Records the questions the user sends. Registered by the background only for the
 * sites the user ticked; whether a question is stored is decided there.
 */
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  main() {
    if (window.__chat2knowRecorderLoaded) return;
    window.__chat2knowRecorderLoaded = true;
    startRecorder(document, siteFor(location.hostname), (text) => void sendMessage('asks/record', { text }));
  },
});
