<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { settings, resetSettings, type Theme, type ReadFont } from '../lib/settings';
import { settingsOpen, trapFocus, announce } from '../lib/ui';
import { appUrl, loadPdfs } from '../lib/data';

const panel = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;
watch(settingsOpen, async (open) => {
  if (open) {
    await nextTick();
    if (panel.value) {
      release = trapFocus(panel.value);
      panel.value.querySelector<HTMLElement>('button, input')?.focus();
    }
  } else {
    release?.();
    release = null;
  }
});

const THEMES: { id: Theme; label: string; bg: string; fg: string; ac: string }[] = [
  { id: 'system', label: 'Match system', bg: 'linear-gradient(135deg,#fff 50%,#141517 50%)', fg: '#404040', ac: '#9d2529' },
  { id: 'light', label: 'Light', bg: '#ffffff', fg: '#404040', ac: '#9d2529' },
  { id: 'sepia', label: 'Sepia', bg: '#f7f1e5', fg: '#3d3428', ac: '#93221f' },
  { id: 'dark', label: 'Dark', bg: '#141517', fg: '#e2e2e2', ac: '#f08a8d' },
  { id: 'contrast', label: 'High contrast', bg: '#ffffff', fg: '#000000', ac: '#8a0000' },
  { id: 'contrast-dark', label: 'High contrast dark', bg: '#000000', fg: '#ffffff', ac: '#ffb3b6' },
];
const FONTS: { id: ReadFont; label: string; family: string; note?: string }[] = [
  { id: 'lato', label: 'Lato', family: "'Lato'", note: 'the Quantum ESPRESSO website font' },
  { id: 'system', label: 'System sans-serif', family: 'var(--font-sys)' },
  { id: 'serif', label: 'Serif', family: "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif" },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible'", note: 'designed for low-vision readers' },
  { id: 'opendyslexic', label: 'OpenDyslexic', family: "'OpenDyslexic'", note: 'weighted letterforms some dyslexic readers prefer' },
];
const WIDTHS = [
  { v: 60, label: 'Narrow' },
  { v: 76, label: 'Comfortable' },
  { v: 96, label: 'Wide' },
  { v: 0, label: 'Full' },
];

const pct = computed(() => Math.round(settings.fontScale * 100));
function bump(d: number) {
  settings.fontScale = Math.min(1.75, Math.max(0.85, Math.round((settings.fontScale + d) * 100) / 100));
}

/* offline: cache all PDFs (documents and data are precached by the service worker) */
const swActive = ref(typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller);
const pdfProgress = ref<string>('');
async function cachePdfs() {
  if (!('caches' in window)) {
    pdfProgress.value = 'This browser does not support offline storage.';
    return;
  }
  const pdfs = await loadPdfs();
  const cache = await caches.open('qe-pdfs');
  let done = 0;
  for (const p of pdfs) {
    pdfProgress.value = `Downloading ${done + 1} of ${pdfs.length}…`;
    try {
      const url = new URL(appUrl(`/docs/pdf/${p.file}`), location.href).href;
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      /* keep going */
    }
    done++;
  }
  pdfProgress.value = `${done} PDFs available offline.`;
  announce(pdfProgress.value);
}
function close() {
  settingsOpen.value = false;
}
</script>

<template>
  <template v-if="settingsOpen">
    <div class="scrim" aria-hidden="true" @click="close" />
    <aside
      id="settings-panel"
      ref="panel"
      class="drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      @keydown.esc="close"
    >
      <div class="drawer-head">
        <h2 id="settings-title">Reading &amp; accessibility</h2>
        <button class="icon-btn" type="button" aria-label="Close settings" @click="close"><Icon name="close" /></button>
      </div>
      <div class="drawer-body settings">
        <fieldset>
          <legend>Theme</legend>
          <div class="theme-grid">
            <label v-for="t in THEMES" :key="t.id" class="theme-opt" :class="{ on: settings.theme === t.id }">
              <input v-model="settings.theme" type="radio" name="theme" :value="t.id" />
              <span class="swatch" :style="{ background: t.bg, color: t.fg }" aria-hidden="true">
                <span :style="{ background: t.ac }" class="sw-accent" />Aa
              </span>
              <span>{{ t.label }}</span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Text size <span class="val">{{ pct }}%</span></legend>
          <div class="row">
            <button class="btn" type="button" aria-label="Smaller text" @click="bump(-0.05)">A−</button>
            <input
              v-model.number="settings.fontScale"
              type="range"
              min="0.85"
              max="1.75"
              step="0.05"
              aria-label="Text size"
              :aria-valuetext="`${pct} percent`"
            />
            <button class="btn" type="button" aria-label="Larger text" @click="bump(0.05)">A+</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Font</legend>
          <label v-for="f in FONTS" :key="f.id" class="radio-row">
            <input v-model="settings.font" type="radio" name="font" :value="f.id" />
            <span :style="{ fontFamily: f.family }">{{ f.label }}</span>
            <small v-if="f.note" class="muted">— {{ f.note }}</small>
          </label>
          <label class="check-row"><input v-model="settings.uiUsesReaderFont" type="checkbox" /> Use this font for menus and buttons too</label>
        </fieldset>

        <fieldset>
          <legend>Spacing</legend>
          <label class="slider">
            <span>Line height <span class="val">{{ settings.lineHeight.toFixed(2) }}</span></span>
            <input v-model.number="settings.lineHeight" type="range" min="1.4" max="2.2" step="0.05" />
          </label>
          <label class="slider">
            <span>Letter spacing <span class="val">{{ settings.letterSpacing.toFixed(2) }} em</span></span>
            <input v-model.number="settings.letterSpacing" type="range" min="0" max="0.12" step="0.01" />
          </label>
          <label class="slider">
            <span>Word spacing <span class="val">{{ settings.wordSpacing.toFixed(2) }} em</span></span>
            <input v-model.number="settings.wordSpacing" type="range" min="0" max="0.3" step="0.02" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Line length</legend>
          <div class="seg" role="radiogroup" aria-label="Line length">
            <label v-for="w in WIDTHS" :key="w.v" :class="{ on: settings.measure === w.v }">
              <input v-model.number="settings.measure" type="radio" name="measure" :value="w.v" />{{ w.label }}
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Reading aids</legend>
          <label class="check-row"><input v-model="settings.focusMode" type="checkbox" /> Focus mode — hide side panels <kbd>F</kbd></label>
          <label class="check-row"><input v-model="settings.readingRuler" type="checkbox" /> Reading ruler that follows the pointer</label>
          <label class="check-row"><input v-model="settings.progressBar" type="checkbox" /> Reading progress bar</label>
          <label class="check-row"><input v-model="settings.justify" type="checkbox" /> Justify paragraphs</label>
          <label class="check-row"><input v-model="settings.underlineLinks" type="checkbox" /> Always underline links</label>
          <label class="check-row"><input v-model="settings.strongFocus" type="checkbox" /> Extra-visible keyboard focus</label>
        </fieldset>

        <fieldset>
          <legend>Documentation text</legend>
          <label class="check-row">
            <input v-model="settings.originalFormatting" type="checkbox" />
            <span>Show original line breaks <small class="muted">(as in the source files; otherwise prose paragraphs re-flow to your width)</small></span>
          </label>
          <label class="check-row"><input v-model="settings.wrapCode" type="checkbox" /> Wrap long preformatted lines instead of scrolling</label>
          <label class="check-row"><input v-model="settings.pdfDark" type="checkbox" /> Darken PDF pages in dark theme</label>
        </fieldset>

        <fieldset>
          <legend>Motion</legend>
          <div class="seg" role="radiogroup" aria-label="Motion">
            <label :class="{ on: settings.motion === 'system' }"><input v-model="settings.motion" type="radio" value="system" />System</label>
            <label :class="{ on: settings.motion === 'reduce' }"><input v-model="settings.motion" type="radio" value="reduce" />Reduce</label>
            <label :class="{ on: settings.motion === 'full' }"><input v-model="settings.motion" type="radio" value="full" />Allow</label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Read aloud</legend>
          <label class="slider">
            <span>Speech rate <span class="val">{{ settings.speechRate.toFixed(1) }}×</span></span>
            <input v-model.number="settings.speechRate" type="range" min="0.6" max="1.8" step="0.1" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Offline</legend>
          <p class="muted small">
            {{ swActive ? 'The app and all documentation pages are stored for offline use.' : 'Offline storage activates after the first visit (in a production build).' }}
            PDFs are saved when first opened, or all at once:
          </p>
          <button class="btn" type="button" @click="cachePdfs"><Icon name="download" /> Save all PDFs offline</button>
          <p v-if="pdfProgress" class="small" role="status">{{ pdfProgress }}</p>
        </fieldset>

        <button class="btn" type="button" @click="resetSettings">Reset all settings</button>
      </div>
    </aside>
  </template>
</template>

<style scoped>
.settings fieldset {
  margin: 0 0 20px;
  padding: 0 0 18px;
  border: 0;
  border-bottom: 1px solid var(--border);
}
.settings legend {
  display: flex;
  width: 100%;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0;
  font-weight: 700;
  color: var(--text-strong);
}
.val {
  font-weight: 500;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.row input[type='range'] {
  flex: 1;
}
input[type='range'] {
  accent-color: var(--accent);
  min-height: 32px;
}
input[type='checkbox'],
input[type='radio'] {
  accent-color: var(--accent);
  width: 18px;
  height: 18px;
  flex: none;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.theme-opt {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  font-size: 0.78rem;
  text-align: center;
  cursor: pointer;
}
.theme-opt input {
  position: absolute;
  opacity: 0;
}
.theme-opt:focus-within {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.theme-opt.on {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.swatch {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 42px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-weight: 700;
  font-size: 1rem;
}
.sw-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 6px 6px 0 0;
}
.radio-row,
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
  line-height: 1.4;
}
.radio-row small {
  font-size: 0.78rem;
}
.slider {
  display: grid;
  gap: 2px;
  margin-bottom: 6px;
}
.slider span {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}
.seg {
  display: flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.seg label {
  flex: 1;
  min-height: 38px;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  cursor: pointer;
}
.seg label + label {
  border-left: 1px solid var(--border-strong);
}
.seg input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.seg label.on {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
.seg label:focus-within {
  outline: 3px solid var(--focus);
  outline-offset: -3px;
}
.small {
  font-size: 0.85rem;
}
</style>
