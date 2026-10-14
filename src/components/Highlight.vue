<script setup lang="ts">
import { computed } from 'vue';

/** Renders text with matched terms wrapped in <mark>, without using v-html. */
const props = defineProps<{ text: string; terms: string[] }>();

const parts = computed(() => {
  const terms = [...new Set(props.terms.filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ t: props.text, m: false }];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return props.text
    .split(re)
    .filter((s) => s !== '')
    .map((s) => ({ t: s, m: terms.some((t) => t.toLowerCase() === s.toLowerCase()) }));
});
</script>

<template>
  <template v-for="(p, i) in parts" :key="i"><mark v-if="p.m">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template>
</template>
