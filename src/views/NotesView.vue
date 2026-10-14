<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import DocToc, { type TocItem } from '../components/DocToc.vue';
import DocToolbar from '../components/DocToolbar.vue';
import Highlight from '../components/Highlight.vue';
import { loadNotes, manifest } from '../lib/data';
import { remember } from '../lib/recent';
import type { ReleaseNotes, ReleaseSectionKind } from '../types/docs';

const route = useRoute();
const notes = shallowRef<ReleaseNotes | null>(null);
const error = ref<string | null>(null);
const contentEl = ref<HTMLElement | null>(null);
const q = ref('');
const kinds = ref<Set<ReleaseSectionKind>>(new Set());
const summary = computed(() => manifest.value?.docs.find((d) => d.id === 'release-notes'));

const KIND: { id: ReleaseSectionKind; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'incompatible', label: 'Incompatible changes' },
  { id: 'known', label: 'Known problems' },
];

onMounted(async () => {
  try {
    notes.value = await loadNotes();
    remember({ url: '/release-notes', title: 'Release notes', subtitle: 'Quantum ESPRESSO' });
    await nextTick();
    if (route.hash) document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
watch(
  () => route.hash,
  (h) => h && nextTick(() => document.getElementById(decodeURIComponent(h.slice(1)))?.scrollIntoView()),
);

function toggleKind(k: ReleaseSectionKind) {
  const s = new Set(kinds.value);
  if (s.has(k)) s.delete(k);
  else s.add(k);
  kinds.value = s;
}

const terms = computed(() => q.value.trim().split(/\s+/).filter((t) => t.length >= 2));
const filtered = computed(() => {
  const n = notes.value;
  if (!n) return [];
  const t = terms.value.map((x) => x.toLowerCase());
  return n.versions
    .map((v) => ({
      ...v,
      sections: v.sections
        .filter((s) => !kinds.value.size || kinds.value.has(s.kind))
        .map((s) => ({ ...s, items: t.length ? s.items.filter((i) => t.every((w) => i.toLowerCase().includes(w))) : s.items }))
        .filter((s) => s.items.length || (!t.length && s.intro)),
    }))
    .filter((v) => v.sections.length);
});
const total = computed(() => filtered.value.reduce((a, v) => a + v.sections.reduce((b, s) => b + s.items.length, 0), 0));
const toc = computed<TocItem[]>(() => filtered.value.map((v) => ({ id: v.id, title: `v${v.version}` })));
</script>

<template>
  <div class="page">
    <article class="reader" aria-labelledby="doc-title">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li aria-current="page">Release notes</li>
        </ol>
      </nav>
      <header class="doc-head">
        <h1 id="doc-title" class="doc-title">Release notes</h1>
        <p class="doc-sub">Changes, fixes and incompatibilities in each Quantum ESPRESSO version, newest first.</p>
        <div class="filters" role="group" aria-label="Filter release notes">
          <label class="sr-only" for="notes-q">Filter items</label>
          <input id="notes-q" v-model="q" class="field" type="search" placeholder="Filter items, e.g. Hubbard, GPU, phonon…" />
          <div class="chips">
            <button v-for="k in KIND" :key="k.id" type="button" class="chip" :aria-pressed="kinds.has(k.id)" @click="toggleKind(k.id)">{{ k.label }}</button>
          </div>
        </div>
        <p class="muted count" role="status">{{ total }} items in {{ filtered.length }} versions</p>
        <DocToolbar :content-el="contentEl" :official-url="summary?.officialUrl" :has-toc="true" />
      </header>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!notes" class="muted">Loading…</p>
      <div v-else ref="contentEl" class="prose notes">
        <section v-for="v in filtered" :id="v.id" :key="v.id" class="ver" :aria-labelledby="`h-${v.id}`">
          <h2 :id="`h-${v.id}`">Version {{ v.version }}</h2>
          <section v-for="s in v.sections" :id="s.id" :key="s.id" class="sec" :data-kind="s.kind">
            <h3><span class="kind-tag">{{ KIND.find((k) => k.id === s.kind)?.label ?? 'Notes' }}</span> {{ s.heading }}</h3>
            <p v-if="s.intro" class="qe-flow">{{ s.intro }}</p>
            <ul>
              <li v-for="(it, i) in s.items" :key="i" class="qe-flow"><Highlight :text="it.replace(/^[*+-]\s*/, '')" :terms="terms" /></li>
            </ul>
          </section>
        </section>
        <p v-if="!filtered.length" class="muted">Nothing matches these filters.</p>
      </div>
      <footer class="footer">Source: <code>release-notes</code> from the Quantum ESPRESSO documentation (GPL). Item text is shown unchanged.</footer>
    </article>
    <DocToc v-if="notes" :items="toc" title="Versions" :content-el="contentEl" />
  </div>
</template>

<style scoped>
.filters {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.count {
  margin: 10px 0 0;
  font-size: 0.85rem;
}
.ver {
  scroll-margin-top: calc(var(--header-h) + 12px);
}
.ver > h2 {
  margin-top: 1.6em;
  padding-bottom: 0.3em;
  border-bottom: 2px solid var(--accent-line);
}
.sec h3 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 1em;
  color: var(--text-muted);
  font-weight: 600;
}
.kind-tag {
  padding: 0.1em 0.6em;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-strong);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sec[data-kind='new'] .kind-tag {
  border-color: var(--flag);
  color: var(--flag);
}
.sec[data-kind='incompatible'] .kind-tag {
  border-color: var(--accent);
  color: var(--accent);
}
.sec[data-kind='known'] .kind-tag {
  border-color: var(--card);
  color: var(--card);
}
.notes li {
  margin-bottom: 0.45em;
}
</style>
