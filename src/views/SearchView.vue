<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Highlight from '../components/Highlight.vue';
import { search, searchReady, type SearchHit } from '../lib/search';
import { manifest, docTitle } from '../lib/data';
import type { SearchKind } from '../types/docs';

const route = useRoute();
const router = useRouter();
const q = ref((route.query.q as string) ?? '');
const kind = ref<SearchKind | ''>((route.query.kind as SearchKind) ?? '');
const prog = ref((route.query.doc as string) ?? '');
const hits = ref<SearchHit[]>([]);
const busy = ref(false);

const programs = computed(() => (manifest.value?.docs ?? []).filter((d) => d.kind !== 'pdf'));
const KIND_LABEL: Record<SearchKind, string> = { variable: 'Variables', section: 'Namelists & cards', program: 'Programs', guide: 'User guides', release: 'Release notes', pdf: 'PDFs' };

let seq = 0;
async function run() {
  const my = ++seq;
  router.replace({ query: { q: q.value || undefined, kind: kind.value || undefined, doc: prog.value || undefined } });
  if (!q.value.trim()) {
    hits.value = [];
    return;
  }
  busy.value = true;
  const res = await search({ q: q.value, kinds: kind.value ? [kind.value] : undefined, docIds: prog.value ? [prog.value] : undefined, limit: 200 });
  if (my === seq) {
    hits.value = res;
    busy.value = false;
  }
}
let t: ReturnType<typeof setTimeout>;
watch([q, kind, prog], () => {
  clearTimeout(t);
  t = setTimeout(run, 120);
}, { immediate: true });
watch(() => route.query.q, (v) => {
  if (typeof v === 'string' && v !== q.value) q.value = v;
});

const grouped = computed(() => {
  const m = new Map<SearchKind, SearchHit[]>();
  for (const h of hits.value) (m.get(h.kind) ?? m.set(h.kind, []).get(h.kind)!).push(h);
  return [...m.entries()];
});
</script>

<template>
  <div class="page no-toc">
    <div class="reader">
      <header class="doc-head">
        <h1 class="doc-title">Search</h1>
        <form class="sform" role="search" @submit.prevent="run">
          <label class="sr-only" for="sv-q">Search the documentation</label>
          <input id="sv-q" v-model="q" class="field big" type="search" placeholder="Search…" autofocus />
          <label class="sr-only" for="sv-k">Type of result</label>
          <select id="sv-k" v-model="kind" class="field">
            <option value="">Everything</option>
            <option v-for="(l, k) in KIND_LABEL" :key="k" :value="k">{{ l }}</option>
          </select>
          <label class="sr-only" for="sv-d">Document</label>
          <select id="sv-d" v-model="prog" class="field">
            <option value="">All documents</option>
            <option v-for="p in programs" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
        </form>
        <p class="muted" role="status" aria-live="polite">
          <template v-if="!searchReady">Preparing the search index…</template>
          <template v-else-if="q.trim()">{{ hits.length }}{{ hits.length === 200 ? '+' : '' }} results</template>
        </p>
      </header>
      <section v-for="[k, list] in grouped" :key="k" class="grp" :aria-labelledby="`sg-${k}`">
        <h2 :id="`sg-${k}`">{{ KIND_LABEL[k] }} <span class="badge">{{ list.length }}</span></h2>
        <ol class="res">
          <li v-for="h in list" :key="h.id">
            <RouterLink :to="h.url" class="rt" :class="{ mono: k === 'variable' || k === 'section' }"><Highlight :text="h.title" :terms="h.terms" /></RouterLink>
            <span v-if="h.type" class="qe-type">{{ h.type }}</span>
            <div class="rs">{{ h.subtitle }}<template v-if="k === 'variable' && prog === ''"> · {{ docTitle(h.docId) }}</template></div>
            <p v-if="h.snippet" class="rn"><Highlight :text="h.snippet" :terms="h.terms" /></p>
          </li>
        </ol>
      </section>
      <p v-if="q.trim() && searchReady && !busy && !hits.length" class="muted">
        Nothing found. Try fewer words, another spelling, or remove the filters.
      </p>
    </div>
  </div>
</template>

<style scoped>
.sform {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 640px) {
  .sform {
    grid-template-columns: 1fr;
  }
}
.big {
  font-size: 1.1rem;
  min-height: 48px;
}
.grp h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 28px 0 8px;
  font-size: 1.1rem;
}
.res {
  list-style: none;
  margin: 0;
  padding: 0;
}
.res li {
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}
.rt {
  font-weight: 700;
  font-size: 1.02rem;
}
.rt.mono {
  font-family: var(--font-mono);
}
.rs {
  margin-top: 2px;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.rn {
  margin: 6px 0 0;
  font-size: 0.92rem;
  line-height: 1.55;
}
</style>
