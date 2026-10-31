#!/usr/bin/env node
/**
 * Renders scripts/icon.svg to the PNG sizes the browser needs (public/icon/<size>.png,
 * which WXT puts in the manifest). Run after changing the SVG: node scripts/render-icons.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Same browser choice as the E2E tests: the pre-installed Chromium when present (cloud container).
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
}
await browser.close();
