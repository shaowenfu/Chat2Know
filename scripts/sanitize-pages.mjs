#!/usr/bin/env node
/**
 * Removes secrets and personal data from saved web pages before they are committed
 * as test fixtures, keeping the DOM structure that capture tests and site configs need.
 *
 *   node scripts/sanitize-pages.mjs <file.html>...          # rewrite files in place
 *   node scripts/sanitize-pages.mjs --check <file.html>...  # exit 1 if anything would change
 *
 * Extra personal strings (name, account id, ...) come from CHAT2KNOW_REDACT, separated by "|".
 *
 * What it does:
 * - drops every <script> element except MathJax `type="math/tex..."` (inline app state is
 *   where session tokens and API keys live; page structure does not need it)
 * - drops <meta> tags that carry tokens (csrf, nonce, verification)
 * - redacts Google API keys, JWTs, OpenAI-style keys, bearer tokens, account/user ids,
 *   profile photo URLs and email addresses
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RULES = [
  [/<script\b(?![^>]*type=["']?math\/tex)[^>]*>[\s\S]*?<\/script>/gi, ''],
  [/<meta\b[^>]*(?:csrf|token|nonce|verification)[^>]*>/gi, ''],
  [/AIza[0-9A-Za-z_-]{35}/g, 'REDACTED_GOOGLE_API_KEY'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'REDACTED_JWT'],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9]{20,}/g, 'REDACTED_SECRET_KEY'],
  [/\b[Bb]earer\s+[A-Za-z0-9._~+/-]{16,}=*/g, 'Bearer REDACTED'],
  [/\b((?:data-)?(?:account|user|org|organization|workspace)[-_]?id=["'])[^"']+/gi, '$1REDACTED'],
  [/\buser-[A-Za-z0-9]{20,}/g, 'user-REDACTED'],
  [/https?:\/\/lh3\.googleusercontent\.com\/a[^"' )]*/g, 'https://example.com/avatar.png'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, 'redacted@example.com'],
];

const extra = (process.env.CHAT2KNOW_REDACT ?? '')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => [new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'REDACTED']);

const check = process.argv.includes('--check');
const files = process.argv.slice(2).filter((a) => a !== '--check');
let dirty = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  const hits = [];
  for (const [re, replacement] of [...RULES, ...extra]) {
    const n = after.match(re)?.length ?? 0;
    if (n) hits.push(`${n}× ${re.source.slice(0, 40)}`);
    after = after.replace(re, replacement);
  }
  if (after === before) continue;
  dirty++;
  console.log(`${check ? 'needs sanitizing' : 'sanitized'}: ${file} (${before.length} → ${after.length} bytes)\n  ${hits.join('\n  ')}`);
  if (!check) writeFileSync(file, after);
}
if (check && dirty) process.exit(1);
