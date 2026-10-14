<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import XrefGraph from './XrefGraph.vue';
import { loadXref, docTitle, type XrefIndex } from '../lib/data';
import { xrefTarget, trapFocus } from '../lib/ui';
import { egoGraph, neighbours, EDGE_LABEL } from '../lib/xref';
import type { XrefEdgeKind, XrefNode } from '../types/docs';

const router = useRouter();
const x = shallowRef<XrefIndex | null>(null);
const panel = ref<HTMLElement | null>(null);
const showMentions = ref(true);
let release: (() => void) | null = null;

const kinds = computed(() => new Set<XrefEdgeKind>(showMentions.value ? ['ref', 'see', 'mention'] : ['ref', 'see']));
const node = computed<XrefNode | undefined>(() => (xrefTarget.value && x.value ? x.value.nodes.get(xrefTarget.value) : undefined));
const outs = computed(() => (x.value && node.value ? neighbours(x.value, node.value.id, 'out', kinds.value) : []));
const ins = computed(() => (x.value && node.value ? neighbours(x.value, node.value.id, 'in', kinds.value) : []));
const same = computed(() => {
  if (!x.value || !node.value) return [];
  const key = node.value.varId.replace(/-\d+$/, '').toLowerCase();
  return (x.value.byName.get(key) ?? []).filter((n) => n.id !== node.value!.id);
});
const guides = computed(() => (x.value && node.value ? (x.value.guideMentions[node.value.id] ?? []) : []));
const graph = computed(() => (x.value && node.value ? egoGraph(x.value, node.value.id, 1, kinds.value, 60) : null));

watch(xrefTarget, async (t) => {
  if (t) {
    x.value ??= await loadXref();
    await nextTick();
    if (panel.value) {
      release?.();
      release = trapFocus(panel.value);
      panel.value.querySelector<HTMLElement>('h2')?.focus();
    }
  } else {
    release?.();
    release = null;
  }
}, { immediate: true });

onBeforeUnmount(() => release?.());

function link(id: string) {
  const n = x.value?.nodes.get(id);
  return n ? `/input/${n.docId}#${n.varId}` : '/';
}
function go(id: string) {
  xrefTarget.value = null;
  router.push(link(id));
}
function close() {
  xrefTarget.value = null;
}
function kindText(ks: XrefEdgeKind[]) {
  return ks.map((k) => EDGE_LABEL[k]).join('; ');
}
</script>

<template>
  <template v-if="xrefTarget && node">
    <div class="scrim" aria-hidden="true" @click="close" />
    <aside ref="panel" class="drawer xref-drawer" role="dialog" aria-modal="true" aria-labelledby="xref-title" @keydown.esc="close">
      <div class="drawer-head">
        <h2 id="xref-title" tabindex="-1"><code>{{ node.label }}</code></h2>
        <button class="icon-btn" type="button" aria-label="Close related entries" @click="close"><Icon name="close" /></button>
      </div>
      <div class="drawer-body">
        <p class="muted where">{{ docTitle(node.docId) }} · {{ node.section }}</p>
        <div class="row">
          <label class="check"><input v-model="showMentions" type="checkbox" /> Include auto-detected mentions</label>
          <RouterLink class="btn btn-ghost" :to="{ name: 'graph', params: { id: node.docId }, query: { focus: node.varId } }" @click="close">
            <Icon name="expand" /> Full graph
          </RouterLink>
        </div>
        <XrefGraph
          v-if="graph && graph.nodes.length > 1"
          :nodes="graph.nodes"
          :edges="graph.edges"
          :height="260"
          labels="all"
          :graph-label="`Related entries of ${node.label}`"
          @select="(id) => id !== node!.id && go(id)"
        />
        <ul class="legend" aria-label="Legend">
          <li><span class="sw" data-g="focus" />This entry</li>
          <li><span class="sw" data-g="out" />It refers to</li>
          <li><span class="sw" data-g="in" />Refers to it</li>
          <li><span class="sw" data-g="both" />Both</li>
          <li><span class="ln" />link</li>
          <li><span class="ln dashed" />See</li>
          <li><span class="ln dotted" />mention</li>
        </ul>

        <section v-if="outs.length">
          <h3>Refers to <span class="n">{{ outs.length }}</span></h3>
          <ul class="rel">
            <li v-for="n in outs" :key="n.id">
              <RouterLink :to="link(n.id)" @click="close"><code>{{ n.label }}</code></RouterLink>
              <span class="muted"><template v-if="n.docId !== node.docId">{{ docTitle(n.docId) }} · </template>{{ n.section }}</span>
              <span class="kinds">{{ kindText(n.kinds) }}</span>
            </li>
          </ul>
        </section>
        <section v-if="ins.length">
          <h3>Referred to by <span class="n">{{ ins.length }}</span></h3>
          <ul class="rel">
            <li v-for="n in ins" :key="n.id">
              <RouterLink :to="link(n.id)" @click="close"><code>{{ n.label }}</code></RouterLink>
              <span class="muted"><template v-if="n.docId !== node.docId">{{ docTitle(n.docId) }} · </template>{{ n.section }}</span>
              <span class="kinds">{{ kindText(n.kinds) }}</span>
            </li>
          </ul>
        </section>
        <section v-if="same.length">
          <h3>Same name in other programs <span class="n">{{ same.length }}</span></h3>
          <p class="muted small">Same identifier, documented separately — meaning and defaults can differ between programs.</p>
          <ul class="rel">
            <li v-for="n in same" :key="n.id">
              <RouterLink :to="link(n.id)" @click="close"><code>{{ n.label }}</code></RouterLink>
              <span class="muted">{{ docTitle(n.docId) }} · {{ n.section }}</span>
            </li>
          </ul>
        </section>
        <section v-if="guides.length">
          <h3>Mentioned in the user guides <span class="n">{{ guides.length }}</span></h3>
          <ul class="rel">
            <li v-for="(g, i) in guides" :key="i">
              <RouterLink :to="`/guide/${g.guideId}/${g.chapterId}${g.headingId ? `#${g.headingId}` : ''}`" @click="close">{{ g.headingTitle ?? g.chapterTitle }}</RouterLink>
              <span class="muted">{{ docTitle(g.guideId) }}</span>
            </li>
          </ul>
        </section>
        <p v-if="!outs.length && !ins.length && !same.length && !guides.length" class="muted">No cross-references found for this entry.</p>
        <p class="muted small note">
          “Linked” and “See” come from the documentation itself. “Mentions” are detected automatically when an entry’s text names another
          variable of the same program, so a few may be coincidental.
        </p>
      </div>
    </aside>
  </template>
</template>

<style scoped>
.xref-drawer {
  width: min(520px, 100vw);
}
.drawer-head h2 code {
  font-size: 1.05rem;
}
.where {
  margin: 0 0 10px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
}
.check input {
  accent-color: var(--accent);
  width: 18px;
  height: 18px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 10px 0 4px;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
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
  background: var(--text-muted);
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
section h3 {
  margin: 20px 0 8px;
  font-size: 0.95rem;
}
.n {
  margin-left: 4px;
  padding: 0 0.5em;
  border-radius: 999px;
  background: var(--surface-3);
  font-size: 0.75rem;
}
.rel {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rel li {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.rel .muted {
  font-size: 0.82rem;
}
.kinds {
  flex-basis: 100%;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.small {
  font-size: 0.82rem;
}
.note {
  margin-top: 20px;
}
</style>
