<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { getJson, manifest, docTitle } from '../lib/data';
import type { VarIndexRow } from '../types/docs';

const rows = shallowRef<VarIndexRow[]>([]);
const q = ref('');
const prog = ref('');
const type = ref('');
const error = ref<string | null>(null);
const limit = ref(400);

onMounted(async () => {
  try {
    rows.value = (await getJson<VarIndexRow[]>('/data/variables.json')).slice().sort((a, b) => a.l.localeCompare(b.l, 'en', { sensitivity: 'base' }));
  } catch (e) {
    error.value = (e as Error).message;
  }
});

const programs = computed(() => (manifest.value?.docs ?? []).filter((d) => d.kind === 'input'));
const types = computed(() => [...new Set(rows.value.map((r) => r.t).filter(Boolean))].sort());
const filtered = computed(() => {
  const t = q.value.trim().toLowerCase();
  return rows.value.filter(
    (r) =>
      (!prog.value || r.d === prog.value) &&
      (!type.value || r.t === type.value) &&
      (!t || r.l.toLowerCase().includes(t) || r.m.toLowerCase().includes(t)),
  );
});
const letters = computed(() => {
  const m = new Map<string, VarIndexRow[]>();
  for (const r of filtered.value.slice(0, limit.value)) {
    const L = /[a-z]/i.test(r.l[0]) ? r.l[0].toUpperCase() : '#';
    (m.get(L) ?? m.set(L, []).get(L)!).push(r);
  }
  return [...m.entries()];
});
</script>

<template>
  <div class="page no-toc page-wide">
    <div class="reader reader-wide idx">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li aria-current="page">Variable index</li>
        </ol>
      </nav>
      <header class="doc-head">
        <h1 class="doc-title">Variable index</h1>
        <p class="doc-sub">Every documented input entry of every program, A–Z. Filter by name, words in the description, program or type.</p>
        <div class="filters" role="search">
          <label>
            <span class="sr-only">Filter by name or description</span>
            <input v-model="q" class="field" type="search" placeholder="Filter… e.g. smear, cutoff, nspin" @input="limit = 400" />
          </label>
          <label>
            <span class="sr-only">Program</span>
            <select v-model="prog" class="field" @change="limit = 400">
              <option value="">All programs</option>
              <option v-for="p in programs" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </label>
          <label>
            <span class="sr-only">Type</span>
            <select v-model="type" class="field" @change="limit = 400">
              <option value="">All types</option>
              <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
        </div>
        <p class="muted" role="status">{{ filtered.length }} entries</p>
        <nav v-if="letters.length > 3" class="az" aria-label="Jump to letter">
          <a v-for="[L] in letters" :key="L" :href="`#idx-${L}`">{{ L }}</a>
        </nav>
      </header>
      <p v-if="error" role="alert">{{ error }}</p>
      <section v-for="[L, list] in letters" :id="`idx-${L}`" :key="L" class="letter" :aria-label="`Letter ${L}`">
        <h2>{{ L }}</h2>
        <ul>
          <li v-for="r in list" :key="r.d + r.v">
            <div class="top">
              <RouterLink :to="`/input/${r.d}#${r.v}`" class="name"><code>{{ r.l }}</code></RouterLink>
              <span class="prog">{{ docTitle(r.d) }}</span>
              <span class="muted sec">{{ r.s }}</span>
              <span v-if="r.t" class="qe-type">{{ r.t }}</span>
            </div>
            <p v-if="r.m" class="sum">{{ r.m }}</p>
          </li>
        </ul>
      </section>
      <button v-if="filtered.length > limit" class="btn" type="button" @click="limit += 600">Show more ({{ filtered.length - limit }} remaining)</button>
    </div>
  </div>
</template>

<style scoped>
.idx {
  max-width: 1000px;
}
.filters {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 640px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
.az {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
}
.az a {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-strong);
  font-weight: 600;
  text-decoration: none;
}
.az a:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.letter {
  scroll-margin-top: calc(var(--header-h) + 12px);
}
.letter h2 {
  margin: 28px 0 6px;
  padding-bottom: 4px;
  border-bottom: 2px solid var(--accent-line);
  color: var(--accent);
}
.letter ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.letter li {
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}
.name code {
  font-weight: 700;
  font-size: 0.98rem;
}
.prog {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--nl);
}
.sec {
  font-size: 0.82rem;
}
.sum {
  margin: 3px 0 0;
  font-size: 0.9rem;
  color: var(--text);
}
</style>
