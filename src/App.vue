<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import AppSidebar from './components/AppSidebar.vue';
import SearchDialog from './components/SearchDialog.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import ShortcutsDialog from './components/ShortcutsDialog.vue';
import { defineAsyncComponent } from 'vue';
const XrefPanel = defineAsyncComponent(() => import('./components/XrefPanel.vue'));
import UpdateToast from './components/UpdateToast.vue';
import ReadingAids from './components/ReadingAids.vue';
import { manifestError } from './lib/data';
import { openSearch } from './lib/search';
import { settings } from './lib/settings';
import { navOpen, tocOpen, shortcutsOpen, settingsOpen, liveMessage, announce, isTypingTarget, xrefTarget } from './lib/ui';

const route = useRoute();
const router = useRouter();

let firstNav = true;
router.afterEach((to, from) => {
  navOpen.value = false;
  tocOpen.value = false;
  if (firstNav) {
    firstNav = false;
    return;
  }
  if (to.path !== from.path) {
    nextTick(() => {
      const main = document.getElementById('app-main');
      if (!to.hash) main?.focus({ preventScroll: true });
      announce(`${document.title.replace(/ · QE Docs Reader$/, '')} page`);
    });
  }
});

function onKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }
  if (isTypingTarget(e.target) || mod || e.altKey) return;
  if (document.querySelector('.dialog-backdrop, .drawer')) return;
  switch (e.key) {
    case '/':
      e.preventDefault();
      openSearch();
      break;
    case '?':
      e.preventDefault();
      shortcutsOpen.value = true;
      break;
    case 'f':
      settings.focusMode = !settings.focusMode;
      announce(settings.focusMode ? 'Focus mode on' : 'Focus mode off');
      break;
    case 't': {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      settings.theme = dark ? 'light' : 'dark';
      announce(`${settings.theme} theme`);
      break;
    }
    case ',':
      settingsOpen.value = true;
      break;
    case 'g':
      router.push({ name: 'graph' });
      break;
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

watch(
  () => route.fullPath,
  () => (xrefTarget.value = null),
);

function skipToContent() {
  const el = document.getElementById('app-main');
  el?.focus();
  el?.scrollIntoView();
}
</script>

<template>
  <a class="skip-link" href="#app-main" @click.prevent="skipToContent">Skip to content</a>
  <AppHeader />
  <div class="app-body">
    <AppSidebar />
    <div v-if="navOpen" class="scrim only-mobile" aria-hidden="true" @click="navOpen = false" />
    <main id="app-main" class="main" tabindex="-1">
      <div v-if="manifestError" class="page no-toc">
        <div class="reader">
          <h1>Documentation data could not be loaded</h1>
          <p>{{ manifestError }}</p>
          <p>If you are running from source, run <code>npm run ingest</code> first to generate <code>public/data</code>.</p>
        </div>
      </div>
      <RouterView v-else />
    </main>
  </div>
  <SearchDialog />
  <SettingsPanel />
  <ShortcutsDialog />
  <XrefPanel v-if="xrefTarget" />
  <ReadingAids />
  <UpdateToast />
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveMessage }}</div>
</template>
