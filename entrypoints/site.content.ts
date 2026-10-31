import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { i18n } from '#i18n';
import { onMessages, sendMessage, type Req } from '@/src/messaging';
import { errorText } from '@/src/errors';
import { startRecorder } from '@/src/capture/recorder';
import { siteFor } from '@/src/capture/sites';
import { captureSelection } from '@/src/capture/selection';
import { buildTextIndex, quoteFromRange } from '@/src/capture/text-quote';
import { PageUi } from '@/src/capture/page-ui';
import { buildPicker } from '@/src/capture/picker';
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

/**
 * The one script on the AI sites the user ticked (registered by the background), and
 * on any other tab only after Alt+S or the context menu there. It draws the ＋ beside
 * display formulas and the toast, records the selection when asked, and listens for
 * sent questions only while "also record my questions" is on for this site.
 */
export default defineContentScript({
  registration: 'runtime',
  matches: [],
  main() {
    if (window.__chat2knowSiteLoaded) return;
    window.__chat2knowSiteLoaded = true;

    const ui = new PageUi(document, { add: i18n.t('site.add'), added: i18n.t('site.added') }, (block) => void recordFormula(block));

    async function record(req: RecordReq, onRecorded: (recorded: boolean) => void): Promise<void> {
      try {
        const result = await sendMessage('map/record', req);
        const path = result.path.join(PATH_SEPARATOR);
        if (result.status === 'duplicate') {
          ui.toast(i18n.t('toast.duplicate', ['\uE000']), path, [{ label: i18n.t('toast.addAnyway'), run: () => record({ ...req, force: true }, onRecorded) }]);
          return;
        }
        onRecorded(true);
        ui.toast(i18n.t('toast.recorded', ['\uE000']), path, [
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
      const quote = quoteFromRange(range, document.body, buildTextIndex(document.body)) ?? { exact: block.latex, prefix: '', suffix: '' };
      return record({ itemType: 'formula', title: '', latex: block.latex, quote, pageTitle: document.title }, (recorded) => ui.markRecorded(block, recorded));
    }

    /** One display formula selected is a formula item; anything else is a statement (R3 compresses long ones). */
    function recordSelection(): void {
      const captured = captureSelection(document, location.href);
      if (!captured) {
        ui.toast(i18n.t('toast.noSelection'), '', []);
        return;
      }
      const formula = ONE_FORMULA.exec(captured.markdown);
      const req: RecordReq = formula
        ? { itemType: 'formula', title: '', latex: formula[1]!.trim(), quote: captured.quote, pageTitle: captured.pageTitle }
        : { itemType: 'statement', title: captured.markdown.replace(/\s+/g, ' ').trim(), quote: captured.quote, pageTitle: captured.pageTitle };
      void record(req, () => {});
    }

    onMessages({
      'site/recordSelection': () => {
        recordSelection();
        return null;
      },
      // Automatic placement moved the item: the toast says where it went now.
      'site/placed': ({ itemId, path, error }) => {
        if (path) ui.updateToast(itemId, i18n.t('toast.recorded', ['\uE000']), path.join(PATH_SEPARATOR));
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
