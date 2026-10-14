<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// legacy build: same API, with polyfills so it also runs on browsers that are a few versions old
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import Icon from '../components/Icon.vue';
import { appUrl, manifest, loadPdfs } from '../lib/data';
import { remember } from '../lib/recent';
import { isTypingTarget, announce } from '../lib/ui';
import type { PdfInfo } from '../types/docs';

GlobalWorkerOptions.workerSrc = workerUrl;

const route = useRoute();
const router = useRouter();
const info = shallowRef<PdfInfo | null>(null);
const pdf = shallowRef<PDFDocumentProxy | null>(null);
const error = ref<string | null>(null);
const pages = ref<{ n: number; w: number; h: number }[]>([]);
const scale = ref(1);
const fitWidth = ref(true);
const current = ref(1);
const pageInput = ref('1');
const container = ref<HTMLElement | null>(null);
let task: PDFDocumentLoadingTask | null = null;
let io: IntersectionObserver | null = null;
let spy: IntersectionObserver | null = null;
const rendered = new Map<number, number>(); // page -> scale it was rendered at

const id = computed(() => route.params.id as string);
const summary = computed(() => manifest.value?.docs.find((d) => d.id === id.value));
const fileUrl = computed(() => (info.value ? appUrl(`/docs/pdf/${info.value.file}`) : ''));
const htmlGuide = computed(() => summary.value?.htmlId);

async function open() {
  cleanup();
  error.value = null;
  pages.value = [];
  try {
    const list = await loadPdfs();
    info.value = list.find((p) => p.id === id.value) ?? null;
    if (!info.value) throw new Error('Unknown PDF');
    document.title = `${info.value.title} · QE Docs Reader`;
    remember({ url: `/pdf/${id.value}`, title: info.value.title, subtitle: 'PDF' });
    task = getDocument({ url: fileUrl.value });
    pdf.value = await task.promise;
    const sizes: { n: number; w: number; h: number }[] = [];
    for (let i = 1; i <= pdf.value.numPages; i++) {
      const p = await pdf.value.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      sizes.push({ n: i, w: vp.width, h: vp.height });
    }
    pages.value = sizes;
    computeFit();
    await nextTick();
    observe();
    const start = Number(route.query.page) || 1;
    if (start > 1) goTo(start, false);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function computeFit() {
  if (!fitWidth.value || !container.value || !pages.value.length) return;
  const avail = container.value.clientWidth - 2;
  const maxW = Math.max(...pages.value.map((p) => p.w));
  scale.value = Math.max(0.5, Math.min(2.5, avail / maxW));
}

async function renderPage(n: number) {
  const doc = pdf.value;
  const holder = document.getElementById(`pdf-p-${n}`);
  if (!doc || !holder) return;
  if (rendered.get(n) === scale.value) return;
  rendered.set(n, scale.value);
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: scale.value });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width * dpr);
  canvas.height = Math.floor(vp.height * dpr);
  canvas.style.width = `${vp.width}px`;
  canvas.style.height = `${vp.height}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const textDiv = document.createElement('div');
  textDiv.className = 'textLayer';
  holder.style.setProperty('--scale-factor', String(scale.value));
  await page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
  if (rendered.get(n) !== scale.value) return; // zoom changed meanwhile
  holder.replaceChildren(canvas, textDiv);
  try {
    await new TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport: vp }).render();
  } catch {
    /* text layer is an enhancement */
  }
}

function observe() {
  io?.disconnect();
  spy?.disconnect();
  io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && renderPage(Number((e.target as HTMLElement).dataset.n))),
    { rootMargin: '600px 0px' },
  );
  spy = new IntersectionObserver(
    (entries) => {
      const vis = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.n));
      if (vis.length) {
        current.value = Math.min(...vis);
        pageInput.value = String(current.value);
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  document.querySelectorAll<HTMLElement>('.pdf-page').forEach((el) => {
    io!.observe(el);
    spy!.observe(el);
  });
}

function goTo(n: number, smooth = true) {
  const p = Math.min(Math.max(1, n), pages.value.length);
  document.getElementById(`pdf-page-${p}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  current.value = p;
  pageInput.value = String(p);
  router.replace({ query: { ...route.query, page: p > 1 ? String(p) : undefined } });
  announce(`Page ${p} of ${pages.value.length}`);
}
function zoom(d: number) {
  fitWidth.value = false;
  scale.value = Math.max(0.5, Math.min(3, Math.round((scale.value + d) * 10) / 10));
}
function fit() {
  fitWidth.value = true;
  computeFit();
}
watch(scale, () => {
  rendered.clear();
  nextTick(() => {
    observe();
  });
});

function onKey(e: KeyboardEvent) {
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.dialog-backdrop, .drawer')) return;
  if (e.key === '[') goTo(current.value - 1);
  if (e.key === ']') goTo(current.value + 1);
}
let resizeT: ReturnType<typeof setTimeout>;
function onResize() {
  clearTimeout(resizeT);
  resizeT = setTimeout(computeFit, 200);
}
function cleanup() {
  io?.disconnect();
  spy?.disconnect();
  rendered.clear();
  task?.destroy();
  task = null;
  pdf.value = null;
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  open();
});
watch(id, open);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  cleanup();
});
</script>

<template>
  <div class="page no-toc page-wide">
    <div class="reader reader-wide pdf-wrap">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li>PDF documents</li>
          <li aria-current="page">{{ info?.title ?? id }}</li>
        </ol>
      </nav>
      <header class="doc-head">
        <h1 class="doc-title">{{ info?.title ?? 'PDF' }}</h1>
        <p class="doc-sub">
          <code>{{ info?.file }}</code><template v-if="info"> · {{ info.pages }} pages</template>
          <template v-if="htmlGuide"> · <RouterLink :to="`/guide/${htmlGuide}`">read the HTML version</RouterLink> (better for screen readers and small screens)</template>
        </p>
      </header>
      <div class="pdf-bar no-print" role="toolbar" aria-label="PDF controls">
        <button class="icon-btn" type="button" aria-label="Previous page" :disabled="current <= 1" @click="goTo(current - 1)"><Icon name="left" /></button>
        <label class="pg">
          <span class="sr-only">Page number</span>
          <input v-model="pageInput" class="field" inputmode="numeric" @keydown.enter="goTo(Number(pageInput))" @blur="pageInput = String(current)" />
          <span class="muted">/ {{ pages.length || '…' }}</span>
        </label>
        <button class="icon-btn" type="button" aria-label="Next page" :disabled="current >= pages.length" @click="goTo(current + 1)"><Icon name="right" /></button>
        <span class="sep" />
        <button class="icon-btn" type="button" aria-label="Zoom out" @click="zoom(-0.1)"><Icon name="zoomout" /></button>
        <span class="muted zoomv" aria-live="polite">{{ Math.round(scale * 100) }}%</span>
        <button class="icon-btn" type="button" aria-label="Zoom in" @click="zoom(0.1)"><Icon name="zoomin" /></button>
        <button class="btn btn-ghost" type="button" :aria-pressed="fitWidth" @click="fit"><Icon name="expand" /> Fit width</button>
        <span class="grow" />
        <a v-if="fileUrl" class="btn btn-ghost" :href="fileUrl" :download="info?.file"><Icon name="download" /> Download</a>
        <a v-if="summary" class="btn btn-ghost hide-sm" :href="summary.officialUrl" target="_blank" rel="noopener noreferrer"><Icon name="external" /> Original<span class="sr-only"> (opens in a new tab)</span></a>
      </div>
      <p v-if="error" role="alert">Could not open this PDF: {{ error }}</p>
      <div ref="container" class="pdf-pages" :aria-busy="!pages.length">
        <p v-if="!pages.length && !error" class="muted">Loading PDF…</p>
        <section
          v-for="p in pages"
          :id="`pdf-page-${p.n}`"
          :key="p.n"
          class="pdf-page"
          :data-n="p.n"
          :aria-label="`Page ${p.n}`"
        >
          <div :id="`pdf-p-${p.n}`" class="pdf-canvas" :style="{ width: `${p.w * scale}px`, height: `${p.h * scale}px` }" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-wrap {
  max-width: 1100px;
}
.pdf-bar {
  position: sticky;
  top: var(--header-h);
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 0 0 16px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface);
}
.pg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pg .field {
  width: 4.2em;
  min-height: 36px;
  text-align: center;
}
.sep {
  width: 1px;
  height: 24px;
  margin: 0 6px;
  background: var(--border);
}
.zoomv {
  min-width: 3.4em;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.grow {
  flex: 1;
}
.pdf-pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  overflow-x: auto;
}
.pdf-page {
  scroll-margin-top: calc(var(--header-h) + 64px);
}
.pdf-canvas {
  position: relative;
  background: #fff;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  filter: var(--pdf-filter);
  --total-scale-factor: var(--scale-factor);
  --scale-round-x: 1px;
  --scale-round-y: 1px;
}
.pdf-canvas :deep(canvas) {
  display: block;
}
/* text layer (selection & screen readers), adapted from pdf.js (Apache-2.0) */
.pdf-canvas :deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: clip;
  line-height: 1;
  text-align: initial;
  transform-origin: 0 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
  forced-color-adjust: none;
}
.pdf-canvas :deep(.textLayer :is(span, br)) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}
.pdf-canvas :deep(.textLayer > :not(.markedContent)),
.pdf-canvas :deep(.textLayer .markedContent span:not(.markedContent)) {
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pdf-canvas :deep(.textLayer .markedContent) {
  display: contents;
}
.pdf-canvas :deep(.textLayer ::selection) {
  background: rgba(39, 94, 254, 0.3);
}
</style>
