import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { i18n, initI18n } from '@/src/i18n';
import { onMessages, sendMessage, type Req } from '@/src/messaging';
import { errorText } from '@/src/errors';
import { startRecorder } from '@/src/capture/recorder';
import { siteFor } from '@/src/capture/sites';
import { captureSelection, type CapturedSelection } from '@/src/capture/selection';
import { UI_ATTR, buildTextIndex, quoteFromRange } from '@/src/capture/text-quote';
import { PageUi } from '@/src/capture/page-ui';
import { buildPicker } from '@/src/capture/picker';
import { buildAskWindow, type AskTurn } from '@/src/capture/ask-window';
import { answerStatement } from '@/src/capture/answer-html';
import { UserError } from '@/src/errors';
import { ASK_PORT, type AskEvent, type AskStart } from '@/src/messaging';
import type { FormulaBlock } from '@/src/capture/formulas';
import { SITES_KEY, loadSites, shouldRecord } from '@/src/sites/settings';

declare global {
  interface Window {
    __chat2knowSiteLoaded?: boolean;
  }
}

type RecordReq = Req<'map/record'>;

const PATH_SEPARATOR = ' › ';
const ONE_FORMULA = /^\$\$\n([\s\S]+?)\n\$\$$/;
const MIN_SELECTED = 2; // characters; a stray click-drag selects one
// Where a selection is the user typing, not reading: the chat's input box and our own UI.
const NOT_READING = `input, textarea, select, [${UI_ATTR}]`;

/**
 * The one script on the AI sites the user ticked (registered by the background), and
 * on any other tab only after Alt+S or the context menu there. It draws the ＋ beside
 * display formulas, the bar over a selection the user makes, and the toast; records
 * the selection when asked (as a note or as a protected quote), and listens for sent
 * questions only while "also record my questions" is on for this site.
 */
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  async main() {
    if (window.__chat2knowSiteLoaded) return;
    window.__chat2knowSiteLoaded = true;
    await initI18n();

    const ui = new PageUi(document, { add: i18n.t('site.add'), added: i18n.t('site.added') }, (block) => void recordFormula(block));

    // The toast's wording for each just-recorded item, kept for when its placement arrives.
    const recordedKey = new Map<string, 'toast.recorded' | 'toast.recordedQuote'>();

    async function record(req: RecordReq, onRecorded: (recorded: boolean) => void): Promise<void> {
      const recordedText = req.itemType === 'quote' ? ('toast.recordedQuote' as const) : ('toast.recorded' as const);
      try {
        const result = await sendMessage('map/record', req);
        if (result.status === 'noMap') {
          // Nothing was stored: the user opens a map in the side panel, or creates one for this note here.
          ui.toast(i18n.t('toast.noMap'), '', [{ label: i18n.t('toast.createMapAndRecord'), run: () => record({ ...req, createMap: true }, onRecorded) }]);
          return;
        }
        const path = result.path.join(PATH_SEPARATOR);
        if (result.status === 'duplicate') {
          ui.toast(i18n.t('toast.duplicate', ['\uE000']), path, [{ label: i18n.t('toast.addAnyway'), run: () => record({ ...req, force: true }, onRecorded) }]);
          return;
        }
        onRecorded(true);
        recordedKey.set(result.itemId, recordedText);
        ui.toast(i18n.t(recordedText, ['\uE000']), path, [
          { label: i18n.t('toast.relocate'), run: () => relocate(result.itemId) },
          {
            label: i18n.t('toast.undo'),
            run: async () => {
              await sendMessage('map/undo', { group: result.group });
              onRecorded(false);
            },
          },
        ], result.itemId);
      } catch (err) {
        ui.toast(errorText(err), '', []);
      }
    }

    /** The "改位置" picker for a just-recorded item; a move says where it went, with its own undo. */
    async function relocate(itemId: string): Promise<void> {
      const { now, places } = await sendMessage('map/placeOptions', { itemId });
      const close = () => ui.popover(null);
      ui.popover(
        buildPicker(document, {
          text: {
            title: i18n.t('picker.title'),
            now: i18n.t('picker.now', [now.slice(1).join(PATH_SEPARATOR) || now.join(PATH_SEPARATOR)]),
            search: i18n.t('picker.search'),
            searchPlaceholder: i18n.t('picker.searchPlaceholder'),
            noMatch: i18n.t('picker.noMatch'),
            newTopic: i18n.t('picker.newTopic'),
            newTopicPlaceholder: i18n.t('picker.newTopicPlaceholder'),
            newTopicUnder: (path) => i18n.t('picker.newTopicUnder', [path]),
            cancel: i18n.t('picker.cancel'),
            move: i18n.t('picker.move'),
          },
          places,
          search: (query) => sendMessage('map/searchPlaces', { query }),
          close,
          move: async (to) => {
            try {
              const moved = await sendMessage('map/moveItem', { itemId, ...to });
              close();
              ui.toast(i18n.t('toast.moved', ['\uE000']), moved.path.join(PATH_SEPARATOR), [
                { label: i18n.t('toast.undo'), run: async () => void (await sendMessage('map/undo', { group: moved.group })) },
              ]);
            } catch (err) {
              close();
              ui.toast(errorText(err), '', []);
            }
          },
        }),
      );
    }

    function recordFormula(block: FormulaBlock): Promise<void> {
      const range = document.createRange();
      range.selectNode(block.el);
      // A formula drawn as an image has no text to quote; its source then opens the conversation without a highlight.
      const quote = quoteFromRange(range, document.body, buildTextIndex(document.body)) ?? { exact: '', prefix: '', suffix: '' };
      return record({ itemType: 'formula', title: '', latex: block.latex, quote, pageTitle: document.title }, (recorded) => ui.markRecorded(block, recorded));
    }

    /**
     * 记下: one display formula selected is a formula item, anything else a statement
     * (placement compresses a long one). 保护原文: the selection word for word, a quote.
     */
    function recordSelection(as?: 'quote'): void {
      const captured = captureSelection(document, location.href);
      if (!captured) {
        ui.toast(i18n.t('toast.noSelection'), '', []);
        return;
      }
      recordCaptured(captured, as);
    }

    /**
     * The captured selection, kept as Markdown so a table, a list or a displayed
     * formula keeps its shape. A quote is it word for word. A note with a request is
     * a statement the model writes as asked; without one, one display formula is a
     * formula and anything else a statement placement compresses to one sentence.
     */
    function recordCaptured(captured: CapturedSelection, as?: 'quote', request = ''): void {
      const { quote, pageTitle } = captured;
      const markdown = captured.markdown.trim();
      const formula = request ? null : ONE_FORMULA.exec(markdown);
      const req: RecordReq =
        as === 'quote'
          ? { itemType: 'quote', title: markdown, quote, pageTitle }
          : formula
            ? { itemType: 'formula', title: '', latex: formula[1]!.trim(), quote, pageTitle }
            : { itemType: 'statement', title: markdown, quote, pageTitle, ...(request ? { request } : {}) };
      void record(req, () => {});
    }

    /** 记下 on the bar: the selection is taken now, then the bar asks how to note it (Enter alone: as usual). */
    function noteWithRequest(): void {
      const captured = captureSelection(document, location.href);
      if (!captured) return;
      ui.promptBar({ label: i18n.t('site.noteRequestLabel'), placeholder: i18n.t('site.noteRequestPlaceholder'), submit: i18n.t('site.barNote') }, (request) =>
        recordCaptured(captured, undefined, request),
      );
    }

    /** The question being answered: closing its port stops the answer. */
    let asking: Browser.runtime.Port | undefined;
    let askWin: ReturnType<typeof buildAskWindow> | undefined;

    function closeAsk(): void {
      asking?.disconnect();
      asking = undefined;
      askWin?.stop();
      askWin = undefined;
      ui.askWindow(null);
    }

    /** One answer over its own port; rejects with the error to show in the window. */
    function streamAnswer(start: AskStart, onDelta: (delta: string) => void): Promise<void> {
      return new Promise((resolve, reject) => {
        const port = browser.runtime.connect({ name: ASK_PORT });
        asking = port;
        let settled = false;
        port.onMessage.addListener((event: AskEvent) => {
          if ('delta' in event) return onDelta(event.delta);
          settled = true;
          port.disconnect();
          if ('done' in event) resolve();
          else reject(new Error(event.key ? errorText(new UserError(event.key, event.subs)) : event.error));
        });
        port.onDisconnect.addListener(() => {
          if (!settled) reject(new Error(i18n.t('ask.interrupted')));
        });
        port.postMessage(start);
      });
    }

    /** 提问: a window beside the selection for a short question about it; nothing of it is kept but the questions. */
    function openAsk(range: Range): void {
      const captured = captureSelection(document, location.href);
      if (!captured) return;
      closeAsk();
      const { quote, pageTitle } = captured;
      const recordAnswer = (itemType: 'statement' | 'quote') => (answer: string, onRecorded: (recorded: boolean) => void) =>
        void record({ itemType, title: itemType === 'quote' ? answer.trim() : answerStatement(answer), quote, pageTitle }, onRecorded);
      const win = buildAskWindow(document, {
        text: {
          title: i18n.t('ask.title'),
          close: i18n.t('ask.close'),
          firstPlaceholder: i18n.t('ask.firstPlaceholder'),
          nextPlaceholder: i18n.t('ask.nextPlaceholder'),
          send: i18n.t('ask.send'),
          record: i18n.t('ask.record'),
          recorded: i18n.t('ask.recorded'),
          protect: i18n.t('ask.protect'),
          protected: i18n.t('ask.protected'),
          copy: i18n.t('ask.copy'),
          copied: i18n.t('ask.copied'),
          note: i18n.t('ask.note'),
        },
        selection: captured.words,
        ask: (question: string, turns: AskTurn[], onDelta) =>
          streamAnswer({ selection: captured.markdown, before: quote.prefix, after: quote.suffix, pageTitle, turns, question }, onDelta),
        record: recordAnswer('statement'),
        protect: recordAnswer('quote'),
        close: closeAsk,
      });
      askWin = win;
      ui.askWindow(win.el, range.getBoundingClientRect());
    }

    /** The selection the bar is for: a few characters of the conversation, not of an input box or our own UI. */
    function readingSelection(): Range | null {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || sel.toString().trim().length < MIN_SELECTED) return null;
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      // Text selected inside a text box is reported on the box's parent; the focus tells it apart.
      const typing = document.activeElement?.matches(NOT_READING) || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (!el || typing || el.closest(NOT_READING) || (el instanceof HTMLElement && el.isContentEditable)) return null;
      return range;
    }

    /** The bar appears only once the user has finished selecting (mouse up, or a Shift+arrow key up). */
    function offerBar(): void {
      const range = readingSelection();
      if (!range) {
        ui.hideBar();
        return;
      }
      ui.showBar(range, i18n.t('site.barLabel'), [
        { id: 'note', label: i18n.t('site.barNote'), run: noteWithRequest, keepBar: true },
        { id: 'quote', label: i18n.t('site.barQuote'), run: () => recordSelection('quote') },
        { id: 'ask', label: i18n.t('site.barAsk'), run: () => openAsk(range) },
      ]);
    }

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || ui.owns(e)) return;
      setTimeout(offerBar); // a click inside the selection collapses it only after mouseup
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') ui.hideBar();
      else if (e.shiftKey && !ui.owns(e)) offerBar();
    });
    document.addEventListener('selectionchange', () => {
      if (ui.barShown && !ui.barPrompting && !readingSelection()) ui.hideBar();
    });

    onMessages({
      'site/recordSelection': ({ as }) => {
        ui.hideBar();
        recordSelection(as);
        return null;
      },
      // Automatic placement moved the item: the toast says where it went now.
      'site/placed': ({ itemId, path, error }) => {
        if (path) ui.updateToast(itemId, i18n.t(recordedKey.get(itemId) ?? 'toast.recorded', ['\uE000']), path.join(PATH_SEPARATOR));
        else ui.updateToast(itemId, i18n.t('toast.notPlaced', [error ?? '']), '');
        return null;
      },
    });

    // Questions are listened for only while recording is on here; the background still gates every one.
    let stopRecorder: (() => void) | undefined;
    const syncRecorder = async () => {
      const on = shouldRecord(await loadSites(), location.href);
      if (on && !stopRecorder) stopRecorder = startRecorder(document, siteFor(location.hostname), (text) => void sendMessage('asks/record', { text }));
      if (!on && stopRecorder) {
        stopRecorder();
        stopRecorder = undefined;
      }
    };
    void syncRecorder();
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && SITES_KEY in changes) void syncRecorder();
    });
  },
});
