<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { tocOpen } from '../lib/ui';

export interface TocItem {
  id: string;
  title: string;
  mono?: boolean;
  children?: TocItem[];
}

const props = defineProps<{ items: TocItem[]; filterable?: boolean; title?: string; contentEl?: HTMLElement | null }>();

const filter = ref('');
const activeId = ref('');
const expanded = ref<Set<string>>(new Set());

const shown = computed(() => {
  const f = filter.value.trim().toLowerCase();
  if (!f) return props.items;
  return props.items
    .map((s) => {
      const hitSelf = s.title.toLowerCase().includes(f);
      const kids = (s.children ?? []).filter((c) => c.title.toLowerCase().includes(f));
      if (!hitSelf && !kids.length) return null;
      return { ...s, children: hitSelf && !kids.length ? s.children : kids };
    })
    .filter(Boolean) as TocItem[];
});

function isOpen(s: TocItem) {
  return !!filter.value.trim() || expanded.value.has(s.id) || activeParent.value === s.id;
}
function toggle(id: string) {
  const n = new Set(expanded.value);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  expanded.value = n;
}
const parentOf = computed(() => {
  const m = new Map<string, string>();
  for (const s of props.items) for (const c of s.children ?? []) m.set(c.id, s.id);
  return m;
});
const activeParent = computed(() => parentOf.value.get(activeId.value) ?? activeId.value);

/* scroll spy */
let io: IntersectionObserver | null = null;
function observe() {
  io?.disconnect();
  if (!props.contentEl) return;
  const ids = props.items.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]);
  const visible = new Map<string, number>();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
        else visible.delete(e.target.id);
      }
      if (visible.size) {
        const best = [...visible.entries()].sort((a, b) => ids.indexOf(a[0]) - ids.indexOf(b[0]))[0];
        activeId.value = best[0];
      }
    },
    { rootMargin: '-70px 0px -65% 0px' },
  );
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}
watch(
  () => [props.contentEl, props.items],
  () => nextTick(observe),
  { immediate: true },
);
onBeforeUnmount(() => io?.disconnect());

watch(activeId, async (id) => {
  if (!id) return;
  await nextTick();
  const link = document.querySelector<HTMLElement>(`.toc a[data-toc="${CSS.escape(id)}"]`);
  const box = link?.closest('.toc');
  if (link && box) {
    const r = link.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + 40 || r.bottom > b.bottom - 20) box.scrollTop += r.top - b.top - b.height / 3;
  }
});
</script>

<template>
  <aside class="toc" :class="{ 'toc-open': tocOpen }" :aria-label="title ?? 'On this page'">
    <div style="display: flex; align-items: center; justify-content: space-between">
      <p class="toc-title">{{ title ?? 'On this page' }}</p>
      <button v-if="tocOpen" class="icon-btn" type="button" aria-label="Close contents" @click="tocOpen = false"><Icon name="close" /></button>
    </div>
    <div v-if="filterable" style="margin-bottom: 10px">
      <label class="sr-only" for="toc-filter">Filter this page</label>
      <input id="toc-filter" v-model="filter" class="field" type="search" placeholder="Filter variables…" autocomplete="off" spellcheck="false" />
    </div>
    <ul>
      <li v-for="s in shown" :key="s.id">
        <div class="toc-row">
          <a :href="`#${s.id}`" :data-toc="s.id" :class="{ active: activeParent === s.id, mono: s.mono }" @click="tocOpen = false">{{ s.title }}</a>
          <button
            v-if="s.children?.length && !filter"
            class="toc-tog"
            type="button"
            :aria-expanded="isOpen(s)"
            :aria-label="`${isOpen(s) ? 'Collapse' : 'Expand'} ${s.title}`"
            @click="toggle(s.id)"
          >
            <span class="n">{{ s.children.length }}</span><Icon name="chevron" :size="14" />
          </button>
        </div>
        <ul v-if="s.children?.length && isOpen(s)">
          <li v-for="c in s.children" :key="c.id">
            <a :href="`#${c.id}`" :data-toc="c.id" :class="{ active: activeId === c.id, mono: c.mono }" @click="tocOpen = false">{{ c.title }}</a>
          </li>
        </ul>
      </li>
    </ul>
    <p v-if="filter && !shown.length" class="muted">No match on this page.</p>
  </aside>
</template>

<style scoped>
.toc-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toc-row a {
  flex: 1;
}
.toc-tog {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.7rem;
}
.toc-tog:hover {
  background: var(--surface-2);
}
.toc-tog[aria-expanded='false'] .icon {
  transform: rotate(-90deg);
}
.mono {
  font-family: var(--font-mono);
  font-size: 0.92em;
}
</style>
