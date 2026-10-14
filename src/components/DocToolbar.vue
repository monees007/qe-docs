<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';
import { speaking, speechSupported, speakFrom, stopSpeaking } from '../lib/speech';
import { settings } from '../lib/settings';
import { tocOpen } from '../lib/ui';

const props = defineProps<{ contentEl?: HTMLElement | null; officialUrl?: string; hasToc?: boolean }>();

function toggleSpeech() {
  if (speaking.value) stopSpeaking();
  else speakFrom(props.contentEl ?? null);
}
onBeforeUnmount(stopSpeaking);
function doPrint() {
  window.print();
}
</script>

<template>
  <div class="toolbar no-print" role="toolbar" aria-label="Page tools">
    <slot />
    <span class="spacer" />
    <button v-if="hasToc" class="btn btn-ghost toc-btn" type="button" :aria-expanded="tocOpen" @click="tocOpen = !tocOpen">
      <Icon name="list" /> Contents
    </button>
    <button v-if="speechSupported" class="btn btn-ghost" type="button" :aria-pressed="speaking" @click="toggleSpeech">
      <Icon :name="speaking ? 'stop' : 'speak'" /> {{ speaking ? 'Stop' : 'Listen' }}
    </button>
    <button class="btn btn-ghost hide-sm" type="button" :aria-pressed="settings.focusMode" @click="settings.focusMode = !settings.focusMode">
      <Icon name="focus" /> Focus
    </button>
    <button class="btn btn-ghost hide-sm" type="button" @click="doPrint"><Icon name="print" /> Print</button>
    <a v-if="officialUrl" class="btn btn-ghost" :href="officialUrl" target="_blank" rel="noopener noreferrer" title="Open the original page on quantum-espresso.org">
      <Icon name="external" /> Original<span class="sr-only"> (opens in a new tab)</span>
    </a>
  </div>
</template>

<style scoped>
@media (min-width: 1280px) {
  .toc-btn {
    display: none;
  }
}
</style>
