import { browser } from 'wxt/browser';
import {
  isEnvelope,
  unwrap,
  type Envelope,
  type MessageType,
  type Req,
  type Res,
  type Result,
} from './protocol';

export * from './protocol';

/** Send a message to the background (from content script or side panel). */
export async function sendMessage<K extends MessageType>(type: K, payload: Req<K>): Promise<Res<K>> {
  const envelope: Envelope<K> = { type, payload };
  return unwrap((await browser.runtime.sendMessage(envelope)) as Result<Res<K>> | undefined);
}

/** Send a message to the content script in a specific tab. */
export async function sendTabMessage<K extends MessageType>(
  tabId: number,
  type: K,
  payload: Req<K>,
): Promise<Res<K>> {
  const envelope: Envelope<K> = { type, payload };
  return unwrap((await browser.tabs.sendMessage(tabId, envelope)) as Result<Res<K>> | undefined);
}

export type Handlers = {
  [K in MessageType]?: (payload: Req<K>, sender: Browser.runtime.MessageSender) => Res<K> | Promise<Res<K>>;
};

/** Register handlers for a subset of message types. Unknown types are ignored. */
export function onMessages(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isEnvelope(message)) return;
    const handler = handlers[message.type] as
      | ((payload: unknown, sender: Browser.runtime.MessageSender) => unknown)
      | undefined;
    if (!handler) return;
    Promise.resolve()
      .then(() => handler(message.payload, sender))
      .then(
        (data) => sendResponse({ ok: true, data } satisfies Result<unknown>),
        (err: unknown) =>
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Result<unknown>),
      );
    return true; // keep the channel open for the async response
  });
}
