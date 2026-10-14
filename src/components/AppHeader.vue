<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import BrandMark from './BrandMark.vue';
import { manifest } from '../lib/data';
import { openSearch } from '../lib/search';
import { settings } from '../lib/settings';
import { navOpen, settingsOpen } from '../lib/ui';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const version = computed(() => manifest.value?.qeVersion);

/* Small maths glyphs above each item echo the QE website navigation (decorative). */
const items = [
  { to: '/variables', glyph: 'Σ', label: 'index', title: 'Variable index (A–Z)' },
  { to: '/graph', glyph: '∇', label: 'graph', title: 'Cross-reference graph (G)' },
  { to: '/release-notes', glyph: 'ω', label: 'notes', title: 'Release notes' },
];
</script>

<template>
  <header class="app-header">
    <div class="pill">
      <button
        class="icon-btn only-mobile pill-menu"
        type="button"
        :aria-expanded="navOpen"
        aria-controls="app-sidebar"
        aria-label="Documentation menu"
        @click="navOpen = !navOpen"
      >
        <Icon name="menu" />
      </button>
      <RouterLink to="/" class="brand" aria-label="QE Docs Reader, home">
        <BrandMark />
        <span class="brand-text">
          <span class="brand-name">QE&nbsp;Docs</span>
          <span class="brand-sub">reader<template v-if="version"> · v{{ version }}</template></span>
        </span>
      </RouterLink>
      <div class="header-search">
        <button class="search-trigger" type="button" aria-haspopup="dialog" aria-keyshortcuts="Control+K /" @click="openSearch()">
          <Icon name="search" />
          <span class="grow">Search variables, guides, notes…</span>
          <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd>
        </button>
      </div>
      <nav class="pill-nav" aria-label="Tools">
        <RouterLink v-for="it in items" :key="it.to" class="pill-item" :to="it.to" :title="it.title">
          <span class="glyph" aria-hidden="true">{{ it.glyph }}</span>
          <span class="lbl">{{ it.label }}</span>
        </RouterLink>
      </nav>
      <div class="pill-cta">
        <button
          class="pill-item cta-item hide-md"
          type="button"
          :aria-pressed="settings.focusMode"
          title="Focus mode — hide side panels (F)"
          @click="settings.focusMode = !settings.focusMode"
        >
          <span class="glyph" aria-hidden="true">∂</span>
          <span class="lbl">focus</span>
        </button>
        <button
          class="pill-item cta-item"
          type="button"
          :aria-expanded="settingsOpen"
          aria-controls="settings-panel"
          title="Reading & accessibility settings (,)"
          @click="settingsOpen = true"
        >
          <span class="glyph" aria-hidden="true">Aa</span>
          <span class="lbl">reading<span class="sr-only"> and accessibility settings</span></span>
        </button>
      </div>
    </div>
  </header>
</template>
