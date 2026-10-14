<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ContentHtml from '../components/ContentHtml.vue';
import DocToc, { type TocItem } from '../components/DocToc.vue';
import DocToolbar from '../components/DocToolbar.vue';
import Icon from '../components/Icon.vue';
import { loadGuide, manifest } from '../lib/data';
import { remember } from '../lib/recent';
import { isTypingTarget } from '../lib/ui';
import type { Guide } from '../types/docs';

const route = useRoute();
const router = useRouter();
const guide = shallowRef<Guide | null>(null);
const error = ref<string | null>(null);
const contentEl = ref<HTMLElement | null>(null);

const id = computed(() => route.params.id as string);
const summary = computed(() => manifest.value?.docs.find((d) => d.id === id.value));
const pdf = computed(() => manifest.value?.docs.find((d) => d.id === summary.value?.pdfId));

watch(
  id,
  async (v) => {
    guide.value = null;
    error.value = null;
    try {
      const g = await loadGuide(v);
      if (v === id.value) guide.value = g;
    } catch (e) {
      error.value = (e as Error).message;
    }
  },
  { immediate: true },
);

const chapterIndex = computed(() => {
  const g = guide.value;
  if (!g) return -1;
  const c = route.params.chapter as string | undefined;
  return c ? g.chapters.findIndex((x) => x.id === c) : -1;
});
const chapter = computed(() => (chapterIndex.value >= 0 ? guide.value!.chapters[chapterIndex.value] : null));
const prev = computed(() => (guide.value && chapterIndex.value > 0 ? guide.value.chapters[chapterIndex.value - 1] : null));
const next = computed(() => {
  const g = guide.value;
  if (!g) return null;
  if (chapterIndex.value < 0) return g.chapters[0] ?? null;
  return g.chapters[chapterIndex.value + 1] ?? null;
});

watch(
  [guide, chapter],
  () => {
    const g = guide.value;
    if (!g) return;
    const t = chapter.value ? `${chapter.value.number} ${chapter.value.title}` : g.title;
    document.title = `${t} · ${g.title} · QE Docs Reader`;
    remember({ url: route.path, title: chapter.value ? `${chapter.value.number} ${chapter.value.title}` : g.title, subtitle: g.title });
  },
  { immediate: true },
);

const toc = computed<TocItem[]>(() => {
  const c = chapter.value;
  if (!c) return [];
  const items: TocItem[] = [];
  const minLevel = Math.min(...c.headings.map((h) => h.level), 9);
  for (const h of c.headings) {
    if (h.level === minLevel || !items.length) items.push({ id: h.id, title: h.title, children: [] });
    else items[items.length - 1].children!.push({ id: h.id, title: h.title });
  }
  return items;
});

function onKey(e: KeyboardEvent) {
  if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.dialog-backdrop, .drawer')) return;
  if (e.key === '[' && prev.value) router.push(`/guide/${id.value}/${prev.value.id}`);
  if (e.key === ']' && next.value) router.push(`/guide/${id.value}/${next.value.id}`);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="page" :class="{ 'no-toc': !chapter || !toc.length }">
    <article class="reader" aria-labelledby="doc-title">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li><RouterLink :to="`/guide/${id}`">{{ guide?.title ?? summary?.title ?? id }}</RouterLink></li>
          <li v-if="chapter" aria-current="page">{{ chapter.number }} {{ chapter.title }}</li>
        </ol>
      </nav>
      <p v-if="error" role="alert">Could not load this guide: {{ error }}</p>
      <p v-else-if="!guide" class="muted" aria-busy="true">Loading…</p>

      <!-- guide landing page: table of contents -->
      <template v-else-if="!chapter">
        <header class="doc-head">
          <h1 id="doc-title" class="doc-title">{{ guide.title }}</h1>
          <p v-if="guide.subtitle" class="doc-sub">{{ guide.subtitle }}</p>
          <DocToolbar :official-url="summary?.officialUrl">
            <RouterLink v-if="pdf" class="btn" :to="`/pdf/${pdf.id}`"><Icon name="pdf" /> PDF version</RouterLink>
          </DocToolbar>
        </header>
        <p v-if="route.params.chapter" role="alert">That chapter does not exist in this guide.</p>
        <ol class="chapters">
          <li v-for="c in guide.chapters" :key="c.id">
            <RouterLink :to="`/guide/${id}/${c.id}`">
              <span class="num">{{ c.number }}</span>
              <span class="ttl">{{ c.title }}</span>
            </RouterLink>
            <ul v-if="c.headings.length" class="subs">
              <li v-for="h in c.headings.filter((x) => x.level <= 2)" :key="h.id">
                <RouterLink :to="`/guide/${id}/${c.id}#${h.id}`">{{ h.title }}</RouterLink>
              </li>
            </ul>
          </li>
        </ol>
      </template>

      <template v-else>
        <header class="doc-head">
          <p class="kicker">{{ guide.title }} · Chapter {{ chapter.number }}</p>
          <h1 id="doc-title" class="doc-title">{{ chapter.title }}</h1>
          <DocToolbar :content-el="contentEl" :official-url="summary?.officialUrl" :has-toc="toc.length > 0">
            <RouterLink v-if="pdf" class="btn btn-ghost" :to="`/pdf/${pdf.id}`"><Icon name="pdf" /> PDF</RouterLink>
          </DocToolbar>
        </header>
        <ContentHtml :html="chapter.html" @rendered="(el) => (contentEl = el)" />
      </template>

      <nav v-if="guide" class="pager" aria-label="Chapters">
        <RouterLink v-if="prev" class="prev" :to="`/guide/${id}/${prev.id}`">
          <small>← Previous <kbd>[</kbd></small>{{ prev.number }} {{ prev.title }}
        </RouterLink>
        <RouterLink v-if="next" class="next" :to="`/guide/${id}/${next.id}`">
          <small>{{ chapter ? 'Next' : 'Start reading' }} <kbd>]</kbd> →</small>{{ next.number }} {{ next.title }}
        </RouterLink>
      </nav>
      <footer class="footer">
        Source: <code>{{ summary?.sourceFile }}</code> (LaTeX2HTML) from the Quantum ESPRESSO documentation (GPL). Formulas are re-rendered
        from the LaTeX kept in the original images.
      </footer>
    </article>
    <DocToc v-if="chapter && toc.length" :items="toc" :content-el="contentEl" />
  </div>
</template>

<style scoped>
.kicker {
  margin: 0 0 6px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
}
.chapters {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: none;
}
.chapters > li {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.chapters > li > a {
  display: flex;
  gap: 14px;
  align-items: baseline;
  color: var(--text-strong);
  font-size: 1.15rem;
  font-weight: 600;
  text-decoration: none;
}
.chapters > li > a:hover .ttl {
  color: var(--accent);
  text-decoration: underline;
}
.num {
  min-width: 1.6em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.subs {
  margin: 6px 0 0 calc(1.6em + 14px);
  padding: 0;
  list-style: none;
  columns: 2 260px;
  font-size: 0.9rem;
}
.subs a {
  color: var(--text-muted);
  text-decoration: none;
}
.subs a:hover {
  color: var(--accent);
  text-decoration: underline;
}
</style>
