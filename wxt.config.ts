import { defineConfig } from 'wxt';

// E2E builds get broad host access so Playwright can inject the content
// script without a user gesture. Release builds rely on activeTab only.
const isE2E = process.env.CHAT2KNOW_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
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
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting'],
    // The model endpoint is requested at runtime when the user saves settings.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    ...(isE2E ? { host_permissions: ['<all_urls>'] } : {}),
    action: {
      default_title: '__MSG_actionTitle__',
    },
  },
});
