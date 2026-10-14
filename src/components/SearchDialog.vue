<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import Highlight from './Highlight.vue';
import { search, searchOpen, searchPrefill, searchReady, searchError, type SearchHit } from '../lib/search';
import { trapFocus } from '../lib/ui';
import { recent } from '../lib/recent';
import { docTitle } from '../lib/data';
import type { SearchKind } from '../types/docs';

const route = useRoute();
const router = useRouter();
const q = ref('');
const hits = ref<SearchHit[]>([]);
const active = ref(0);
const kind = ref<'all' | SearchKind>('all');
const scopeDoc = ref(false);
const busy = ref(false);
const input = ref<HTMLInputElement | null>(null);
const box = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;

const KINDS: { id: 'all' | SearchKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'variable', label: 'Variables' },
  { id: 'section', label: 'Namelists & cards' },
  { id: 'guide', label: 'Guides' },
  { id: 'release', label: 'Release notes' },
  { id: 'pdf', label: 'PDFs' },
];
const KIND_LABEL: Record<SearchKind, string> = {
  variable: 'Variable',
  section: 'Section',
  program: 'Program',
  guide: 'Guide',
  release: 'Release notes',
  pdf: 'PDF',
};

const currentDoc = computed(() => (route.name === 'input' ? (route.params.id as string) : null));

watch(searchOpen, async (open) => {
  if (open) {
    q.value = searchPrefill.value || q.value;
    await nextTick();
    input.value?.focus();
    input.value?.select();
    if (box.value) release = trapFocus(box.value);
    run();
  } else {
    release?.();
    release = null;
  }
});

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
async function run() {
  const my = ++seq;
  if (!q.value.trim()) {
    hits.value = [];
    return;
  }
  busy.value = true;
  const res = await search({
    q: q.value,
    kinds: kind.value === 'all' ? undefined : kind.value === 'section' ? ['section', 'program'] : [kind.value],
    docIds: scopeDoc.value && currentDoc.value ? [currentDoc.value] : undefined,
    limit: 40,
  });
  if (my !== seq) return;
  hits.value = res;
  active.value = 0;
  busy.value = false;
}
watch([q, kind, scopeDoc], () => {
  clearTimeout(timer);
  timer = setTimeout(run, 70);
});

function close() {
  searchOpen.value = false;
}
function go(h: { url: string }) {
  close();
  router.push(h.url);
}
function onKey(e: KeyboardEvent) {
  const n = hits.value.length;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (n) active.value = (active.value + 1) % n;
    scrollActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (n) active.value = (active.value - 1 + n) % n;
    scrollActive();
  } else if (e.key === 'Enter' && e.target === input.value) {
    e.preventDefault();
    const h = hits.value[active.value];
    if (h) go(h);
    else if (q.value.trim()) {
      close();
      router.push({ name: 'search', query: { q: q.value } });
    }
  }
}
function scrollActive() {
  nextTick(() => document.getElementById(`sr-${active.value}`)?.scrollIntoView({ block: 'nearest' }));
}
const status = computed(() => {
  if (searchError.value) return `Search unavailable: ${searchError.value}`;
  if (!searchReady.value) return 'Preparing search index…';
  if (!q.value.trim()) return '';
  return hits.value.length ? `${hits.value.length} results` : 'No results';
});
</script>

<template>
  <div v-if="searchOpen" class="dialog-backdrop" @mousedown.self="close">
    <div
      ref="box"
      class="dialog search-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-title"
      @keydown="onKey"
    >
      <h2 id="search-title" class="sr-only">Search the documentation</h2>
      <div class="search-row">
        <Icon name="search" />
        <input
          ref="input"
          v-model="q"
          class="search-input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="search-results"
          :aria-expanded="hits.length > 0"
          :aria-activedescendant="hits.length ? `sr-${active}` : undefined"
          placeholder="ecutwfc, &SYSTEM, smearing, phonon dispersion…"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="icon-btn" type="button" aria-label="Close search" @click="close"><Icon name="close" /></button>
      </div>
      <div class="search-filters" role="group" aria-label="Filter results">
        <button
          v-for="k in KINDS"
          :key="k.id"
          type="button"
          class="chip"
          :aria-pressed="kind === k.id"
          @click="kind = k.id"
        >
          {{ k.label }}
        </button>
        <label v-if="currentDoc" class="chip scope">
          <input v-model="scopeDoc" type="checkbox" /> Only {{ docTitle(currentDoc) }}
        </label>
      </div>
      <p class="search-status" role="status" aria-live="polite">{{ status }}</p>
      <ul v-if="hits.length" id="search-results" class="search-results" role="listbox" aria-label="Results">
        <li
          v-for="(h, i) in hits"
          :id="`sr-${i}`"
          :key="h.id"
          role="option"
          :aria-selected="i === active"
          :class="{ active: i === active }"
          @mousemove="active = i"
          @click="go(h)"
        >
          <div class="r-top">
            <span class="r-kind" :data-kind="h.kind">{{ KIND_LABEL[h.kind] }}</span>
            <span class="r-title" :class="{ mono: h.kind === 'variable' || h.kind === 'section' }"><Highlight :text="h.title" :terms="h.terms" /></span>
            <span v-if="h.type" class="qe-type">{{ h.type }}</span>
          </div>
          <div class="r-sub">{{ h.subtitle }}</div>
          <div v-if="h.snippet" class="r-snip"><Highlight :text="h.snippet" :terms="h.terms" /></div>
        </li>
      </ul>
      <div v-else-if="!q.trim()" class="search-empty">
        <template v-if="recent.length">
          <h3>Recently viewed</h3>
          <ul class="search-results">
            <li v-for="r in recent" :key="r.url">
              <RouterLink :to="r.url" class="r-link" @click.prevent="go(r)">
                <span class="r-title">{{ r.title }}</span>
                <span class="r-sub">{{ r.subtitle }}</span>
              </RouterLink>
            </li>
          </ul>
        </template>
        <p class="muted tips">
          Tips: type a variable name (<code>degauss</code>), a namelist (<code>&amp;ELECTRONS</code>) or words
          (<code>van der Waals</code>). <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close.
        </p>
      </div>
      <div class="search-foot">
        <RouterLink v-if="q.trim()" :to="{ name: 'search', query: { q } }" @click="close">See all results with filters →</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-dialog {
  max-height: min(78vh, 760px);
}
.search-row,
.search-filters,
.search-status,
.search-foot {
  flex: none;
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 18px;
  border-bottom: 1px solid var(--border);
}
.search-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-strong);
  font-size: 1.1rem;
}
.search-input:focus-visible {
  outline: none;
}
.search-row:focus-within {
  box-shadow: inset 0 -2px 0 var(--focus);
}
.search-filters {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
}
.scope input {
  margin: 0;
}
.search-status {
  margin: 0;
  padding: 6px 18px 0;
  min-height: 1.4em;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.search-results {
  list-style: none;
  margin: 0;
  padding: 6px 8px 8px;
  overflow-y: auto;
}
.search-results li {
  padding: 9px 12px;
  border-radius: var(--radius-s);
  cursor: pointer;
}
.search-results li.active,
.search-results li:hover {
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}
.r-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.r-kind {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  min-width: 5.5em;
}
.r-title {
  font-weight: 600;
  color: var(--text-strong);
}
.r-title.mono {
  font-family: var(--font-mono);
}
.r-sub {
  margin-top: 2px;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.r-snip {
  margin-top: 4px;
  font-size: 0.86rem;
  color: var(--text);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.r-link {
  display: block;
  text-decoration: none;
}
.r-link .r-sub {
  display: block;
}
.search-empty {
  padding: 4px 8px 8px;
  overflow-y: auto;
}
.search-empty h3 {
  margin: 8px 12px 2px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tips {
  padding: 8px 12px;
  font-size: 0.86rem;
  line-height: 1.7;
}
.search-foot {
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  font-size: 0.85rem;
  min-height: 42px;
}
</style>
