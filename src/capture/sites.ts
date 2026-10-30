/**
 * Per-site selectors for recording the user's own questions (learning diagnosis).
 * This is the one place per-site knowledge is allowed (principle 6); everything
 * else falls back to the generic rule: an editable element plus Enter or a nearby button.
 *
 * Selectors use stable hooks (data-testid, contenteditable, semantic class names),
 * never hashed class names or localized aria-labels. A selector marked unverified
 * has no sample in tests/fixtures/sites yet and may be wrong.
 */
export interface SiteConfig {
  id: string;
  name: string;
  /** Hostnames this config applies to, exact match. */
  hosts: string[];
  /** The editable element the user types the question into. */
  input: string;
  /** The send button. */
  send: string;
  /** One sent user message, used to confirm a send happened and to read its text. */
  userMessage: string;
  /** Inside userMessage, the element holding only the question text (when the bubble has extra labels). */
  userMessageText?: string;
  /** Fields not yet checked against a real sample. */
  unverified: ('input' | 'send' | 'userMessage')[];
}

export const SITES: SiteConfig[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    input: '#prompt-textarea, div.ProseMirror[contenteditable="true"]',
    send: '#composer-submit-button, button[data-testid="send-button"]',
    userMessage: '[data-user-message-bubble="true"]',
    unverified: ['send'],
  },
  {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    input: '[data-testid="chat-input"]',
    send: 'button[aria-label="Send message"], button[aria-label="Send Message"]',
    userMessage: '[data-testid="user-message"]',
    unverified: ['send'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    input: '.ql-editor[contenteditable="true"]',
    send: 'button:has(mat-icon[fonticon="arrow_upward"])',
    userMessage: '.user-query-bubble-with-background',
    // The bubble also holds a visually hidden "You said" label for screen readers.
    userMessageText: '.query-text-line',
    unverified: [],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    input: 'textarea',
    send: 'div[role="button"].ds-button--primary',
    // Answers are .ds-message too, but render their body in .ds-markdown.
    userMessage: '.ds-message:not(:has(.ds-markdown))',
    unverified: [],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    hosts: ['www.kimi.com', 'kimi.com', 'kimi.moonshot.cn'],
    input: '.chat-input-editor[contenteditable="true"]',
    send: '.send-button-container',
    userMessage: '.user-content',
    userMessageText: '.user-content__text',
    unverified: [],
  },
  {
    id: 'doubao',
    name: '豆包',
    hosts: ['www.doubao.com', 'doubao.com'],
    input: 'div.ProseMirror[contenteditable="true"]',
    send: '[data-testid="chat_input_send_button"]',
    // The sample only had hashed class names; this hook is a guess until a larger sample arrives.
    userMessage: '[data-testid="send_message"]',
    unverified: ['userMessage'],
  },
];

export function siteFor(hostname: string): SiteConfig | undefined {
  return SITES.find((s) => s.hosts.includes(hostname));
}

/** The text the user typed: a textarea's value, or an editor's rendered text. */
export function inputText(el: Element): string {
  const text = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el as HTMLElement).innerText ?? el.textContent;
  return (text ?? '').trim();
}

/** The question text of a sent user message. */
export function messageText(site: SiteConfig, message: Element): string {
  const el = site.userMessageText ? message.querySelector(site.userMessageText) : message;
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
