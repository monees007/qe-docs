<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import XrefGraph from '../components/XrefGraph.vue';
import { loadXref, loadInput, manifest, docTitle, type XrefIndex } from '../lib/data';
import { egoGraph, programGraph, EDGE_LABEL } from '../lib/xref';
import type { XrefEdgeKind } from '../types/docs';

const route = useRoute();
const router = useRouter();
const x = shallowRef<XrefIndex | null>(null);
const sectionKind = shallowRef<Map<string, string>>(new Map());
const showAllRows = ref(false);

const docId = computed(() => (route.params.id as string) || 'pw');
const focus = computed(() => (route.query.focus as string) || '');
const depth = computed<1 | 2>(() => (route.query.depth === '2' ? 2 : 1));
const useLink = ref(true);
const useSee = ref(true);
const useMention = ref(route.query.mentions !== '0');
const isolated = ref(false);
const kinds = computed(() => {
  const s = new Set<XrefEdgeKind>();
  if (useLink.value) s.add('ref');
  if (useSee.value) s.add('see');
  if (useMention.value) s.add('mention');
  return s;
});

const programs = computed(() => (manifest.value?.docs ?? []).filter((d) => d.kind === 'input'));
const edgeCount = computed(() => {
  const m = new Map<string, number>();
  if (!x.value) return m;
  for (const e of x.value.raw.edges) {
    const d = e.source.split(':')[0];
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
});

onMounted(async () => {
  x.value = await loadXref();
});
watch(
  docId,
  async (id) => {
    document.title = `${docTitle(id)} cross-references · QE Docs Reader`;
    const d = await loadInput(id).catch(() => null);
    sectionKind.value = new Map((d?.sections ?? []).map((s) => [s.title, s.kind]));
  },
  { immediate: true },
);

const focusId = computed(() => (focus.value ? `${docId.value}:${focus.value}` : ''));
const focusNode = computed(() => (focusId.value && x.value ? x.value.nodes.get(focusId.value) : undefined));
const graph = computed(() => {
  if (!x.value) return null;
  if (focusNode.value) return egoGraph(x.value, focusNode.value.id, depth.value, kinds.value);
  return programGraph(x.value, docId.value, kinds.value, sectionKind.value, isolated.value);
});
const programVars = computed(() => (x.value ? x.value.raw.nodes.filter((n) => n.docId === docId.value) : []));
const focusInput = ref('');
watch(focusNode, (n) => (focusInput.value = n ? n.label : ''), { immediate: true });

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ name: 'graph', params: { id: docId.value }, query: { ...route.query, ...patch } });
}
function pickProgram(e: Event) {
  router.push({ name: 'graph', params: { id: (e.target as HTMLSelectElement).value } });
}
function applyFocus() {
  const v = focusInput.value.trim();
  if (!v) return setQuery({ focus: undefined });
  const n = programVars.value.find((p) => p.label === v || p.varId === v) ?? programVars.value.find((p) => p.label.toLowerCase().startsWith(v.toLowerCase()));
  if (n) setQuery({ focus: n.varId });
}
function onSelect(id: string) {
  const n = x.value?.nodes.get(id);
  if (!n) return;
  router.push({ name: 'graph', params: { id: n.docId }, query: { ...route.query, focus: n.varId } });
}

const labelOf = (id: string) => {
  const n = x.value?.nodes.get(id);
  return n ? (n.docId !== docId.value ? `${n.label} (${docTitle(n.docId)})` : n.label) : id;
};
const linkOf = (id: string) => {
  const n = x.value?.nodes.get(id);
  return n ? `/input/${n.docId}#${n.varId}` : '/';
};
const rows = computed(() => (graph.value?.edges ?? []).slice().sort((a, b) => labelOf(a.source).localeCompare(labelOf(b.source))));
const shownRows = computed(() => (showAllRows.value ? rows.value : rows.value.slice(0, 150)));
</script>

<template>
  <div class="page no-toc page-wide">
    <div class="reader reader-wide gv">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><RouterLink to="/">Docs</RouterLink></li>
          <li aria-current="page">Cross-reference graph</li>
        </ol>
      </nav>
      <header class="doc-head">
        <h1 class="doc-title">Cross-reference graph</h1>
        <p class="doc-sub">
          How input variables point to each other. Pick a program, or focus on one variable to see its neighbourhood. Every node opens its
          documentation.
        </p>
      </header>

      <form class="controls" @submit.prevent="applyFocus">
        <label>
          <span>Program</span>
          <select class="field" :value="docId" @change="pickProgram">
            <option v-for="p in programs" :key="p.id" :value="p.id">{{ p.title }} ({{ edgeCount.get(p.id) ?? 0 }} links)</option>
          </select>
        </label>
        <label>
          <span>Focus on variable</span>
          <span class="inline">
            <input v-model="focusInput" class="field mono" list="gv-vars" placeholder="e.g. ecutwfc" autocomplete="off" spellcheck="false" />
            <button class="btn" type="submit">Show</button>
            <button v-if="focus" class="btn btn-ghost" type="button" @click="setQuery({ focus: undefined })">Whole program</button>
          </span>
          <datalist id="gv-vars">
            <option v-for="v in programVars" :key="v.id" :value="v.label" />
          </datalist>
        </label>
        <fieldset v-if="focus" class="seg-wrap">
          <legend>Depth</legend>
          <label class="chip" :class="{ active: depth === 1 }"><input type="radio" class="sr-only" :checked="depth === 1" @change="setQuery({ depth: undefined })" />1 step</label>
          <label class="chip" :class="{ active: depth === 2 }"><input type="radio" class="sr-only" :checked="depth === 2" @change="setQuery({ depth: '2' })" />2 steps</label>
        </fieldset>
        <fieldset class="seg-wrap">
          <legend>Links to show</legend>
          <label class="check"><input v-model="useLink" type="checkbox" /> <span class="ln" /> Linked</label>
          <label class="check"><input v-model="useSee" type="checkbox" /> <span class="ln dashed" /> See</label>
          <label class="check"><input v-model="useMention" type="checkbox" /> <span class="ln dotted" /> Mentions (auto)</label>
          <label v-if="!focus" class="check"><input v-model="isolated" type="checkbox" /> Unconnected entries</label>
        </fieldset>
      </form>

      <ul class="legend" aria-label="Node colours">
        <template v-if="focus">
          <li><span class="sw" data-g="focus" />Focused entry</li>
          <li><span class="sw" data-g="out" />It refers to</li>
          <li><span class="sw" data-g="in" />Refers to it</li>
          <li><span class="sw" data-g="both" />Both directions</li>
          <li><span class="sw" data-g="external" />Two steps away</li>
        </template>
        <template v-else>
          <li><span class="sw" data-g="out" />In a namelist</li>
          <li><span class="sw" data-g="in" />In a card</li>
          <li><span class="sw" data-g="both" />Other section</li>
        </template>
      </ul>

      <p v-if="!x" class="muted">Loading cross-references…</p>
      <template v-else-if="graph">
        <p v-if="graph.nodes.length <= 1" class="muted">No connections with the selected link types.</p>
        <XrefGraph
          v-else
          :nodes="graph.nodes"
          :edges="graph.edges"
          :height="Math.min(760, 380 + graph.nodes.length * 2)"
          :graph-label="focusNode ? `Neighbourhood of ${focusNode.label}` : `Cross-references in ${docTitle(docId)}`"
          @select="onSelect"
        />
        <p class="muted stats">{{ graph.nodes.length }} entries · {{ graph.edges.length }} connections</p>

        <section aria-labelledby="gv-table">
          <h2 id="gv-table">Connections as a list</h2>
          <div class="tbl-wrap" tabindex="0" role="region" aria-label="Connections table">
            <table class="tbl">
              <thead>
                <tr><th scope="col">From</th><th scope="col">To</th><th scope="col">How</th></tr>
              </thead>
              <tbody>
                <tr v-for="(e, i) in shownRows" :key="i">
                  <td><RouterLink :to="linkOf(e.source)"><code>{{ labelOf(e.source) }}</code></RouterLink></td>
                  <td><RouterLink :to="linkOf(e.target)"><code>{{ labelOf(e.target) }}</code></RouterLink></td>
                  <td>{{ EDGE_LABEL[e.kind] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button v-if="rows.length > shownRows.length" class="btn" type="button" @click="showAllRows = true">Show all {{ rows.length }} rows</button>
        </section>
      </template>
      <p class="footer">
        “Linked” and “See” connections are written by the documentation authors. “Mentions” are detected automatically when an entry’s text names
        another variable of the same program; treat them as hints.
      </p>
    </div>
  </div>
</template>

<style scoped>
.gv {
  max-width: 1240px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.controls > label {
  display: grid;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}
.controls select {
  min-width: 240px;
}
.inline {
  display: flex;
  gap: 6px;
}
.inline .field {
  width: 220px;
}
.mono {
  font-family: var(--font-mono);
}
.seg-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  border: 0;
}
.seg-wrap legend {
  width: 100%;
  margin-bottom: 4px;
  padding: 0;
  font-size: 0.85rem;
  font-weight: 600;
}
.chip:focus-within {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
}
.check input {
  accent-color: var(--accent);
  width: 18px;
  height: 18px;
}
.ln {
  width: 22px;
  border-top: 2px solid var(--viz-edge);
}
.ln.dashed {
  border-top-style: dashed;
}
.ln.dotted {
  border-top-style: dotted;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.sw[data-g='focus'] {
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--text-strong);
}
.sw[data-g='out'] {
  background: var(--viz-1);
}
.sw[data-g='in'] {
  background: var(--viz-2);
}
.sw[data-g='both'] {
  background: var(--viz-3);
}
.sw[data-g='external'] {
  border: 1.5px dashed var(--text-muted);
}
.stats {
  font-size: 0.82rem;
  margin: 8px 0 0;
}
.tbl-wrap {
  max-height: 480px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.tbl th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  text-align: left;
}
.tbl th,
.tbl td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
}
section h2 {
  margin: 32px 0 10px;
  font-size: 1.15rem;
}
</style>
