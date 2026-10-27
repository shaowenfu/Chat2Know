<script setup lang="ts">
import { ref, watch } from 'vue';
import { i18n } from '#i18n';

/** Three AI-proposed question titles plus a custom one; the user picks or writes. */
const props = defineProps<{ candidates: string[] }>();
const title = defineModel<string>({ required: true });

const custom = ref(props.candidates.includes(title.value) ? '' : title.value);
watch(custom, (v) => {
  if (v.trim()) title.value = v;
});
</script>

<template>
  <fieldset class="picker" data-testid="title-picker">
    <legend>{{ i18n.t('keep.pickTitle') }}</legend>
    <label v-for="c in candidates" :key="c" class="choice">
      <input v-model="title" type="radio" :value="c" @change="custom = ''">
      <span>{{ c }}</span>
    </label>
    <input v-model="custom" class="custom" type="text" :placeholder="i18n.t('keep.customTitle')" :aria-label="i18n.t('keep.customTitle')">
  </fieldset>
</template>
