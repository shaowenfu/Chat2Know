import { defineContentScript } from 'wxt/utils/define-content-script';
import { onMessages, sendMessage } from '@/src/messaging';
import { captureSelection } from '@/src/capture/selection';
import { prepareAskDraft } from '@/src/capture/ask';
import { highlightQuote, underlineRange, underlineTerms } from '@/src/capture/highlight';
import { htmlToMarkdown } from '@/src/capture/markdown';
import { SelectionToolbar } from '@/src/capture/toolbar';
import { UserError } from '@/src/errors';

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

    const toolbar = new SelectionToolbar(document, {
      async save(type) {
        const capture = captureSelection(document, location.href);
        if (!capture) throw new UserError('error.noSelection');
        await sendMessage('capture/save', { type, capture });
      },
      prepareAsk: () => prepareAskDraft(document, location.href),
      async askLater(draft, question) {
        // Ask-later never calls a model: it only stores the question locally.
        const res = await sendMessage('ask/save', { term: draft.term, question, capture: draft.capture });
        underlineRange(document, draft.termRange);
        return res.askCount;
      },
      async askNow(draft, question) {
        // The answer goes to the side panel; the host page is left untouched.
        await sendMessage('ask/now', { term: draft.term, question, capture: draft.capture });
      },
    });
    toolbar.mount();

    onMessages({
      'content/capture': () => captureSelection(document, location.href),
      'content/highlight': ({ quote }) => ({ found: highlightQuote(document, quote) }),
      'content/pageMarkdown': () => ({ markdown: htmlToMarkdown(document.body), url: location.href, pageTitle: document.title }),
      'content/askLater': () => {
        if (!toolbar.openAskPrompt('later')) throw new UserError('error.noSelection');
        return null;
      },
    });

    // Re-underline terms already queued for this page.
    sendMessage('ask/forUrl', { url: location.href })
      .then((items) => underlineTerms(document, items))
      .catch(() => {});
  },
});
