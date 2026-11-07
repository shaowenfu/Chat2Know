<script setup lang="ts">
import { i18n } from '@/src/i18n';
</script>

<!--
  Direction A (artboard 10): a formula selected in an answer flies into the map and
  lands under its topic. A 4-second loop; with reduced motion, only the last frame.
-->
<template>
  <div class="stage" role="img" :aria-label="i18n.t('onboard.animationLabel')">
    <div class="chat">
      <span class="line" />
      <span class="formula">(AB)ᵀ = BᵀAᵀ</span>
      <span class="line short" />
    </div>
    <span class="flyer" aria-hidden="true">(AB)ᵀ = BᵀAᵀ</span>
    <div class="map" aria-hidden="true">
      <span class="root">{{ i18n.t('onboard.demoMap') }}</span>
      <span class="node">{{ i18n.t('onboard.demoChapter') }}</span>
      <span class="node topic">{{ i18n.t('onboard.demoTopic') }}</span>
      <span class="landed">(AB)ᵀ = BᵀAᵀ</span>
      <span class="node grey">{{ i18n.t('onboard.demoOther') }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  height: 148px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  font-size: 11.5px;
}
.chat {
  position: absolute;
  left: 12px;
  top: 16px;
  width: 128px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.line {
  height: 6px;
  border-radius: 3px;
  background: var(--banner);
}
.line.short {
  width: 70%;
}
.formula {
  padding: 4px 6px;
  border-radius: 4px;
  font-family: var(--mono);
  animation: select 4s infinite;
}
.flyer {
  position: absolute;
  left: 18px;
  top: 38px;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--accent-soft);
  border: 1.5px solid var(--accent);
  font-family: var(--mono);
  opacity: 0;
  animation: fly 4s infinite;
}
.map {
  position: absolute;
  right: 12px;
  top: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-left: 10px;
  border-left: 1.5px solid var(--branch);
}
.root {
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--ink);
  color: #ffffff;
  font-weight: 700;
}
.node {
  padding: 1px 6px;
  border-radius: 5px;
  border: 1.5px solid var(--ink);
}
.node.topic {
  margin-left: 12px;
}
.node.grey {
  border: 1.5px dashed #b9b6ac;
  color: var(--grey);
}
.landed {
  margin-left: 24px;
  padding: 1px 6px;
  border-radius: 5px;
  border: 1.5px solid var(--accent);
  background: var(--accent-soft);
  font-family: var(--mono);
  animation: land 4s infinite;
}
@keyframes select {
  0%, 12% { background: transparent; }
  20%, 100% { background: #cfe0ff; }
}
@keyframes fly {
  0%, 22% { opacity: 0; transform: translate(0, 0) scale(1); }
  28% { opacity: 1; transform: translate(0, 0) scale(1); }
  58% { opacity: 1; transform: translate(150px, 50px) scale(0.9); }
  62%, 100% { opacity: 0; transform: translate(150px, 50px) scale(0.9); }
}
@keyframes land {
  0%, 58% { opacity: 0; }
  64%, 100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .formula, .flyer, .landed {
    animation: none;
  }
  .formula {
    background: #cfe0ff;
  }
}
</style>
