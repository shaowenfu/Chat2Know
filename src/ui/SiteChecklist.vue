<script setup lang="ts">
import { errorText } from '@/src/errors';
import { SITE_CHOICES, tickSite } from './sites';

/** One tick per AI site; ticking asks the browser for that site only. */
withDefaults(defineProps<{ columns?: number }>(), { columns: 2 });
const origins = defineModel<string[]>({ required: true });
const emit = defineEmits<{ error: [message: string] }>();

async function toggle(origin: string, on: boolean) {
  try {
    origins.value = await tickSite(origins.value, origin, on);
  } catch (err) {
    emit('error', errorText(err));
  }
}
</script>

<template>
  <div class="grid" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <label v-for="s in SITE_CHOICES" :key="s.id">
      <input
        type="checkbox"
        :checked="origins.includes(s.origin)"
        :data-testid="`site-${s.id}`"
        @change="toggle(s.origin, ($event.target as HTMLInputElement).checked)"
      >
      {{ s.name }}
    </label>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 10px;
  font-size: 14px;
}
label {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
