<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ContentHtml from '../components/ContentHtml.vue';
import DocToc, { type TocItem } from '../components/DocToc.vue';
import DocToolbar from '../components/DocToolbar.vue';
import { loadInput, loadXref, manifest } from '../lib/data';
import { remember } from '../lib/recent';
import type { InputDoc } from '../types/docs';

const route = useRoute();
const router = useRouter();
const doc = shallowRef<InputDoc | null>(null);
const error = ref<string | null>(null);
const related = shallowRef<Map<string, number>>(new Map());
const contentEl = ref<HTMLElement | null>(null);

const id = computed(() => route.params.id as string);
const summary = computed(() => manifest.value?.docs.find((d) => d.id === id.value));
const group = computed(() => manifest.value?.groups.find((g) => g.docIds.includes(id.value)));

watch(
  id,
  async (v) => {
    doc.value = null;
    error.value = null;
    try {
      const d = await loadInput(v);
      if (v !== id.value) return;
      // legacy anchors from the official pages (#id270, renamed duplicates) -> canonical ids
      const h = decodeURIComponent(route.hash.replace(/^#/, ''));
      if (h && d.aliases[h] && d.aliases[h] !== h) router.replace({ ...route, hash: `#${d.aliases[h]}` });
      doc.value = d;
      document.title = `${d.program} input reference · QE Docs Reader`;
      remember({ url: `/input/${v}`, title: d.program, subtitle: 'Input reference' });
      const x = await loadXref();
      const m = new Map<string, number>();
      for (const vv of d.variables) {
        const key = `${v}:${vv.id}`;
        const set = new Set<string>();
        x.out.get(key)?.forEach((e) => set.add(e.target));
        x.in.get(key)?.forEach((e) => set.add(e.source));
        const sameName = vv.names.flatMap((n) => x.byName.get(n.toLowerCase()) ?? []).filter((n) => n.docId !== v);
        sameName.forEach((n) => set.add(n.id));
        (x.guideMentions[key] ?? []).forEach((g) => set.add(`guide:${g.guideId}:${g.chapterId}:${g.headingId}`));
        if (set.size) m.set(vv.id, set.size);
      }
      related.value = m;
    } catch (e) {
      error.value = (e as Error).message;
    }
  },
  { immediate: true },
);

const toc = computed<TocItem[]>(() => {
  const d = doc.value;
  if (!d) return [];
  const varName = new Map(d.variables.map((v) => [v.id, v.display]));
  const top = d.sections.filter((s) => s.level === 0);
  const childrenOf = (sid: string): TocItem[] => {
    const s = d.sections.find((x) => x.id === sid)!;
    const nested = d.sections.filter((x) => x.parent === sid);
    return [
      ...s.varIds.map((v) => ({ id: v, title: varName.get(v) ?? v, mono: true })),
      ...nested.flatMap((n) => [{ id: n.id, title: `▸ ${n.title}`, mono: n.kind !== 'text' }, ...childrenOf(n.id)]),
    ];
  };
  return top.map((s) => ({ id: s.id, title: s.title, mono: s.kind === 'namelist' || s.kind === 'card', children: childrenOf(s.id) }));
});

const counts = computed(() => {
  const d = doc.value;
  if (!d) return null;
  return {
    vars: d.variables.length,
    namelists: d.sections.filter((s) => s.kind === 'namelist').length,
    cards: d.sections.filter((s) => s.kind === 'card').length,
  };
});
const jumps = computed(() => (doc.value?.sections ?? []).filter((s) => s.kind === 'namelist' || s.kind === 'card'));
</script>

<template>
  <div class="page">
    <article class="reader" aria-labelledby="doc-title">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li v-if="group">{{ group.title }}</li>
          <li aria-current="page">{{ summary?.title ?? id }}</li>
        </ol>
      </nav>
      <header class="doc-head">
        <h1 id="doc-title" class="doc-title">{{ doc?.program ?? summary?.title ?? id }}</h1>
        <p class="doc-sub">
          Input reference<template v-if="doc?.package"> · {{ doc.package }}</template><template v-if="doc?.version">
            · Quantum ESPRESSO v{{ doc.version }}</template
          >
        </p>
        <div v-if="counts" class="doc-meta">
          <span class="badge">{{ counts.vars }} entries</span>
          <span v-if="counts.namelists" class="badge">{{ counts.namelists }} namelist{{ counts.namelists > 1 ? 's' : '' }}</span>
          <span v-if="counts.cards" class="badge">{{ counts.cards }} card{{ counts.cards > 1 ? 's' : '' }}</span>
          <RouterLink class="badge link-badge" :to="{ name: 'graph', params: { id } }">Cross-reference graph →</RouterLink>
        </div>
        <nav v-if="jumps.length > 1" class="jumps" aria-label="Namelists and cards">
          <a v-for="s in jumps" :key="s.id" class="chip mono" :href="`#${s.id}`" :data-kind="s.kind">{{ s.title }}</a>
        </nav>
        <DocToolbar :content-el="contentEl" :official-url="summary?.officialUrl" :has-toc="true" />
      </header>

      <p v-if="error" role="alert">Could not load this document: {{ error }}</p>
      <p v-else-if="!doc" class="muted" aria-busy="true">Loading…</p>
      <ContentHtml v-else :html="doc.html" :doc-id="id" :related="related" @rendered="(el) => (contentEl = el)" />

      <footer class="footer">
        Source: <code>{{ summary?.sourceFile }}</code> from the Quantum ESPRESSO documentation (GPL).
        Rendered by this unofficial reader; check the <a v-if="summary" :href="summary.officialUrl" target="_blank" rel="noopener noreferrer">original page<span class="sr-only"> (opens in a new tab)</span></a> when in doubt.
      </footer>
    </article>
    <DocToc v-if="doc" :items="toc" filterable :content-el="contentEl" />
  </div>
</template>

<style scoped>
.jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.jumps .chip {
  font-size: 0.8rem;
  min-height: 30px;
}
.jumps .chip[data-kind='namelist'] {
  color: var(--nl);
}
.jumps .chip[data-kind='card'] {
  color: var(--card);
}
.mono {
  font-family: var(--font-mono);
}
.link-badge {
  text-decoration: none;
  color: var(--accent);
  border-color: var(--accent-line);
}
</style>
