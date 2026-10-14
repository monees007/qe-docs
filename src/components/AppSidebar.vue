<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './Icon.vue';
import { manifest, loadGuide } from '../lib/data';
import { navOpen, trapFocus } from '../lib/ui';
import type { DocSummary, Guide } from '../types/docs';

const route = useRoute();
const KEY = 'qe-reader-collapsed';
const collapsed = ref<Record<string, boolean>>({});
try {
  collapsed.value = JSON.parse(localStorage.getItem(KEY) || '{}');
} catch {
  /* ignore */
}
watch(
  collapsed,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
  { deep: true },
);

const groups = computed(() => {
  const m = manifest.value;
  if (!m) return [];
  const byId = new Map(m.docs.map((d) => [d.id, d]));
  return m.groups
    .map((g) => ({ ...g, docs: g.docIds.map((id) => byId.get(id)).filter(Boolean) as DocSummary[] }))
    .filter((g) => g.docs.length);
});

function linkFor(d: DocSummary) {
  if (d.kind === 'input') return `/input/${d.id}`;
  if (d.kind === 'guide') return `/guide/${d.id}`;
  if (d.kind === 'notes') return '/release-notes';
  return `/pdf/${d.id}`;
}
const activeDoc = computed(() => (route.params.id as string) || (route.name === 'notes' ? 'release-notes' : ''));

// chapters of the active guide
const guide = ref<Guide | null>(null);
watch(
  () => (route.name === 'guide' ? (route.params.id as string) : null),
  async (id) => {
    guide.value = id ? await loadGuide(id).catch(() => null) : null;
  },
  { immediate: true },
);

function toggle(id: string) {
  collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] };
}

const el = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;
watch(navOpen, (open) => {
  if (open && el.value && window.matchMedia('(max-width: 1023px)').matches) {
    release = trapFocus(el.value);
    requestAnimationFrame(() => el.value?.querySelector<HTMLElement>('a, button')?.focus());
  } else {
    release?.();
    release = null;
  }
});
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && navOpen.value) navOpen.value = false;
}
onMounted(() => window.addEventListener('keydown', onKey));
</script>

<template>
  <nav id="app-sidebar" ref="el" class="sidebar" :class="{ open: navOpen }" aria-label="Documentation">
    <div class="only-mobile" style="display: flex; justify-content: flex-end; margin: -6px 0 6px">
      <button class="icon-btn" type="button" aria-label="Close menu" @click="navOpen = false"><Icon name="close" /></button>
    </div>
    <ul class="nav-list nav-card">
      <li>
        <RouterLink class="nav-link" to="/" exact-active-class="router-link-active" active-class="none">
          <span><Icon name="home" :size="16" /> Overview</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink class="nav-link" to="/variables"><span><Icon name="list" :size="16" /> Variable index</span></RouterLink>
      </li>
      <li>
        <RouterLink class="nav-link" to="/graph"><span><Icon name="graph" :size="16" /> Cross-reference graph</span></RouterLink>
      </li>
    </ul>
    <div v-for="g in groups" :key="g.id" class="nav-group">
      <button
        class="nav-group-btn"
        type="button"
        :aria-expanded="!collapsed[g.id]"
        :aria-controls="`nav-${g.id}`"
        @click="toggle(g.id)"
      >
        {{ g.title }} <span class="chev-ring" aria-hidden="true"><Icon class="chev" name="chevron" :size="14" /></span>
      </button>
      <ul v-show="!collapsed[g.id]" :id="`nav-${g.id}`" class="nav-list">
        <li v-for="d in g.docs" :key="d.id">
          <RouterLink class="nav-link" :to="linkFor(d)" :aria-current="activeDoc === d.id ? 'page' : undefined">
            <span :class="{ mono: d.kind === 'input' }">{{ d.title }}</span>
            <span v-if="d.counts?.variables" class="count" :title="`${d.counts.variables} documented entries`">{{ d.counts.variables }}</span>
            <span v-else-if="d.counts?.pages" class="count">{{ d.counts.pages }} p.</span>
          </RouterLink>
          <ul v-if="d.kind === 'guide' && guide && guide.id === d.id" class="nav-sub" :aria-label="`${d.title} chapters`">
            <li v-for="c in guide.chapters" :key="c.id">
              <RouterLink :to="`/guide/${d.id}/${c.id}`" :aria-current="route.params.chapter === c.id ? 'page' : undefined">
                {{ c.number }} {{ c.title }}
              </RouterLink>
            </li>
          </ul>
        </li>
      </ul>
    </div>
    <ul class="nav-list nav-card">
      <li>
        <RouterLink class="nav-link" to="/about"><span><Icon name="info" :size="16" /> About &amp; licence</span></RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.mono {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.nav-link .icon {
  vertical-align: -3px;
  margin-right: 6px;
}
</style>
