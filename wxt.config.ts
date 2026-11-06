import { defineConfig } from 'wxt';
import type { Plugin } from 'vite';

/**
 * Chrome refuses to load a content script whose text holds a Unicode noncharacter
 * ("isn't UTF-8 encoded"), and the minifier writes KaTeX's `\uffff` as the
 * character itself. Written back as escapes: they appear only in string, template
 * and regex literals, where the escape means the same character.
 */
const NONCHARACTER = /[\uFDD0-\uFDEF\uFFFE\uFFFF]/g;
const escapeNoncharacters = (): Plugin => ({
  name: 'chat2know:escape-noncharacters',
  // After minification, on the code as it is written.
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk') chunk.code = chunk.code.replace(NONCHARACTER, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
    }
  },
});

// E2E builds get broad host access so Playwright can inject the content
// script without a user gesture. Release builds rely on activeTab only.
const isE2E = process.env.CHAT2KNOW_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  vite: () => ({ plugins: [escapeNoncharacters()] }),
  outDirTemplate: isE2E ? '{{browser}}-mv{{manifestVersion}}-e2e' : undefined,
  webExt: {
    // Development happens in a headless cloud container; never auto-launch a browser.
    disabled: true,
  },
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    homepage_url: 'https://github.com/shaowenfu/Chat2Know',
    default_locale: 'en',
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'contextMenus', 'alarms'],
    // The model endpoint is requested at runtime when the user saves settings.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    ...(isE2E ? { host_permissions: ['<all_urls>'] } : {}),
    commands: {
      'record-selection': {
        suggested_key: { default: 'Alt+S' },
        description: '__MSG_command_record__',
      },
    },
    action: {
      default_title: '__MSG_actionTitle__',
    },
  },
});
