import { richHtml } from './rich-html';

/** A model-written report as safe HTML (src/ui/rich-html.ts): formatting and http(s) links only, no images. */
export const reportHtml = (markdown: string): string => richHtml(markdown);
