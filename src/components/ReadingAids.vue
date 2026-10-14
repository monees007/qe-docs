<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { settings } from '../lib/settings';

const route = useRoute();
const progress = ref(0);
const rulerY = ref(-200);

let raf = 0;
function onScroll() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progress.value = max > 0 ? Math.min(1, h.scrollTop / max) : 0;
  });
}
function onPointer(e: PointerEvent) {
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') rulerY.value = e.clientY;
}
function onFocus(e: FocusEvent) {
  const r = (e.target as HTMLElement).getBoundingClientRect?.();
  if (r && r.height < 200) rulerY.value = r.top + r.height / 2;
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('focusin', onFocus);
  onScroll();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('pointermove', onPointer);
  window.removeEventListener('focusin', onFocus);
});
</script>

<template>
  <div
    v-if="settings.progressBar && route.name !== 'home'"
    class="reading-progress"
    aria-hidden="true"
    :style="{ width: '100%', transform: `scaleX(${progress})` }"
  />
  <div v-if="settings.readingRuler" class="reading-ruler" aria-hidden="true" :style="{ top: `calc(${rulerY}px - 1.2em * var(--line-height))` }" />
</template>
