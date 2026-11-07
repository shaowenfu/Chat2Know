<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { currentLang, i18n, type UiLang } from '@/src/i18n';
import { sendMessage } from '@/src/messaging';

/**
 * The extension's language. `compact` (the first screen, artboard 9): 中文 / EN; else a
 * choice that also offers following the browser. Pages reload in the new language.
 */
defineProps<{ compact?: boolean }>();
const lang = ref<UiLang>('auto');
onMounted(async () => (lang.value = await sendMessage('ui/getLang', {})));
const pick = (next: UiLang) => sendMessage('ui/setLang', { lang: next });
</script>

<template>
  <div v-if="compact" class="pill" role="group" :aria-label="i18n.t('settings.language')">
    <button type="button" :class="{ on: currentLang() === 'zh_CN' }" @click="pick('zh_CN')">中文</button>
    <button type="button" :class="{ on: currentLang() === 'en' }" @click="pick('en')">EN</button>
  </div>
  <label v-else class="select">
    {{ i18n.t('settings.language') }}
    <select :value="lang" data-testid="ui-lang" @change="pick(($event.target as HTMLSelectElement).value as UiLang)">
      <option value="auto">{{ i18n.t('settings.languageAuto') }}</option>
      <option value="zh_CN">中文</option>
      <option value="en">English</option>
    </select>
  </label>
</template>

<style scoped>
.pill {
  display: flex;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  overflow: hidden;
  font-size: 12px;
}
.pill button {
  height: 26px;
  padding: 0 10px;
  border: 0;
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
}
.pill button.on {
  background: var(--ink);
  color: #ffffff;
}
.select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-2);
}
.select select {
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
}
</style>
