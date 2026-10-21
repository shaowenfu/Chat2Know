import type { PageInfo } from '@/src/messaging/protocol';

export function describePage(doc: Document, url: string): PageInfo {
  return {
    url,
    title: doc.title,
    textLength: (doc.body?.innerText ?? doc.body?.textContent ?? '').trim().length,
  };
}
