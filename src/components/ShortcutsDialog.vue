<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { shortcutsOpen, trapFocus } from '../lib/ui';

const box = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;
watch(shortcutsOpen, async (o) => {
  if (o) {
    await nextTick();
    if (box.value) {
      release = trapFocus(box.value);
      box.value.querySelector<HTMLElement>('button')?.focus();
    }
  } else {
    release?.();
    release = null;
  }
});
const rows: [string[], string][] = [
  [['/'], 'Search'],
  [['Ctrl', 'K'], 'Search (also ⌘K)'],
  [['↑', '↓', 'Enter'], 'Move through and open search results'],
  [['['], 'Previous chapter (guides) or previous page (PDF)'],
  [[']'], 'Next chapter (guides) or next page (PDF)'],
  [['F'], 'Toggle focus mode'],
  [['T'], 'Toggle light / dark theme'],
  [[','], 'Reading & accessibility settings'],
  [['G'], 'Open the cross-reference graph'],
  [['?'], 'This list'],
  [['Esc'], 'Close dialogs and panels'],
];
</script>

<template>
  <div v-if="shortcutsOpen" class="dialog-backdrop" @mousedown.self="shortcutsOpen = false">
    <div ref="box" class="dialog" role="dialog" aria-modal="true" aria-labelledby="kbd-title" style="width: min(520px, 100%)" @keydown.esc="shortcutsOpen = false">
      <div class="dialog-head">
        <h2 id="kbd-title">Keyboard shortcuts</h2>
        <button class="icon-btn" type="button" aria-label="Close" @click="shortcutsOpen = false"><Icon name="close" /></button>
      </div>
      <div class="dialog-body">
        <table class="kbd-table">
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <th scope="row">
                <template v-for="(k, j) in r[0]" :key="j"><kbd>{{ k }}</kbd><span v-if="j < r[0].length - 1"> </span></template>
              </th>
              <td>{{ r[1] }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted" style="font-size: 0.85rem">Single-key shortcuts are ignored while typing in a text field.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kbd-table {
  width: 100%;
  border-collapse: collapse;
}
.kbd-table th,
.kbd-table td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-weight: 400;
}
.kbd-table th {
  white-space: nowrap;
  width: 40%;
}
</style>
