<script setup lang="ts">
import { computed, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { manifest } from '../lib/data';
import { openSearch } from '../lib/search';
import { recent, clearRecent } from '../lib/recent';
import type { DocSummary } from '../types/docs';

onMounted(() => (document.title = 'QE Docs Reader — Quantum ESPRESSO documentation'));

const m = computed(() => manifest.value);
const byId = computed(() => new Map((m.value?.docs ?? []).map((d) => [d.id, d])));
const programGroups = computed(() =>
  (m.value?.groups ?? [])
    .filter((g) => !['guides', 'notes', 'pdf'].includes(g.id))
    .map((g) => ({ ...g, docs: g.docIds.map((id) => byId.value.get(id)).filter(Boolean) as DocSummary[] })),
);
const guides = computed(() => (m.value?.docs ?? []).filter((d) => d.kind === 'guide'));
const pdfs = computed(() => (m.value?.docs ?? []).filter((d) => d.kind === 'pdf'));
const popular = ['pw', 'ph', 'pp', 'projwfc', 'dos', 'cp', 'neb', 'matdyn'];
const fmt = (n: number) => n.toLocaleString('en');
</script>

<template>
  <div class="page no-toc page-wide">
    <div class="reader reader-wide home">
      <section class="hero" aria-labelledby="hero-title">
        <p class="eyebrow">Unofficial reader · Quantum ESPRESSO<template v-if="m"> v{{ m.qeVersion }}</template></p>
        <h1 id="hero-title">Quantum ESPRESSO documentation,<br /><em>easy to search and read.</em></h1>
        <p class="lede">
          Every input reference, user guide, release note and PDF from
          <a href="https://www.quantum-espresso.org/Doc/" target="_blank" rel="noopener noreferrer">quantum-espresso.org/Doc<span class="sr-only"> (opens in a new tab)</span></a>
          — searchable offline, cross-linked, and adjustable to how you read.
        </p>
        <button class="hero-search" type="button" aria-haspopup="dialog" @click="openSearch()">
          <Icon name="search" :size="22" />
          <span>Search <code>ecutwfc</code>, <code>&amp;SYSTEM</code>, “phonon dispersion”…</span>
          <kbd>/</kbd>
        </button>
        <div class="quick" aria-label="Frequently used programs">
          <template v-for="p in popular" :key="p">
            <RouterLink v-if="byId.get(p)" class="chip mono" :to="`/input/${p}`">{{ byId.get(p)!.title }}</RouterLink>
          </template>
        </div>
        <dl v-if="m" class="stats">
          <div><dt>Programs</dt><dd>{{ m.stats.programs }}</dd></div>
          <div><dt>Input entries</dt><dd>{{ fmt(m.stats.variables) }}</dd></div>
          <div><dt>Guide chapters</dt><dd>{{ m.stats.guideChapters }}</dd></div>
          <div><dt>Release versions</dt><dd>{{ m.stats.releaseVersions }}</dd></div>
          <div><dt>Cross-references</dt><dd>{{ fmt(m.stats.xrefEdges) }}</dd></div>
        </dl>
      </section>

      <section v-if="recent.length" class="block" aria-labelledby="recent-title">
        <div class="block-head">
          <h2 id="recent-title"><Icon name="history" /> Continue reading</h2>
          <button class="btn btn-ghost" type="button" @click="clearRecent">Clear</button>
        </div>
        <ul class="recent">
          <li v-for="r in recent.slice(0, 6)" :key="r.url">
            <RouterLink :to="r.url"><strong>{{ r.title }}</strong><span>{{ r.subtitle }}</span></RouterLink>
          </li>
        </ul>
      </section>

      <section class="block" aria-labelledby="guides-title">
        <div class="block-head"><h2 id="guides-title"><Icon name="book" /> User’s guides</h2></div>
        <ul class="cards">
          <li v-for="g in guides" :key="g.id">
            <RouterLink :to="`/guide/${g.id}`" class="card">
              <span class="card-title">{{ g.title }}</span>
              <span class="card-sub">{{ g.subtitle }}</span>
              <span class="card-meta">{{ g.counts?.chapters }} chapters</span>
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/release-notes" class="card">
              <span class="card-title">Release notes</span>
              <span class="card-sub">What changed in each version</span>
              <span class="card-meta">{{ m?.stats.releaseVersions }} versions</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="block" aria-labelledby="inputs-title">
        <div class="block-head">
          <h2 id="inputs-title"><Icon name="file" /> Input references</h2>
          <RouterLink class="btn btn-ghost" to="/variables">All variables A–Z →</RouterLink>
        </div>
        <div class="groups">
          <section v-for="g in programGroups" :key="g.id" class="group" :aria-labelledby="`g-${g.id}`">
            <h3 :id="`g-${g.id}`">{{ g.title }}</h3>
            <p v-if="g.description" class="muted gdesc">{{ g.description }}</p>
            <ul>
              <li v-for="d in g.docs" :key="d.id">
                <RouterLink :to="`/input/${d.id}`">
                  <code>{{ d.title }}</code>
                  <span class="muted">{{ d.counts?.variables }} entries</span>
                </RouterLink>
                <p v-if="d.summary" class="muted dsum">{{ d.summary }}</p>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section class="block" aria-labelledby="pdf-title">
        <div class="block-head"><h2 id="pdf-title"><Icon name="pdf" /> PDF documents</h2></div>
        <ul class="pdfs">
          <li v-for="p in pdfs" :key="p.id">
            <RouterLink :to="`/pdf/${p.id}`">{{ p.title }}</RouterLink>
            <span class="muted"> · {{ p.counts?.pages }} pages<template v-if="p.htmlId"> · also as HTML guide</template></span>
          </li>
        </ul>
      </section>

      <p class="footer">
        This is an independent, unofficial reader. All documentation content comes from the Quantum ESPRESSO distribution (GNU GPL) and belongs
        to its authors. <RouterLink to="/about">About, licence &amp; citation</RouterLink>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 1200px;
}
.hero {
  padding: clamp(16px, 4vw, 40px) 0 28px;
  border-bottom: 1px solid var(--border);
}
.eyebrow {
  margin: 0 0 10px;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.hero h1 {
  margin: 0;
  font-size: clamp(2rem, 1.2rem + 3vw, 3.2rem);
  font-weight: 300;
  letter-spacing: -0.01em;
  line-height: 1.12;
}
.hero h1 em {
  font-style: normal;
  color: var(--accent);
}
.lede {
  max-width: 64ch;
  margin: 16px 0 24px;
  font-size: 1.1rem;
  color: var(--text);
}
.hero-search {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(680px, 100%);
  min-height: 56px;
  padding: 0 16px;
  border: 2px solid var(--accent-line);
  border-radius: var(--radius-l);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 1.02rem;
  text-align: left;
  box-shadow: var(--shadow);
}
.hero-search:hover {
  border-color: var(--accent);
}
.hero-search span {
  flex: 1;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.mono {
  font-family: var(--font-mono);
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 32px;
  margin: 28px 0 0;
}
.stats div {
  display: flex;
  flex-direction: column-reverse;
}
.stats dt {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.stats dd {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}
.block {
  margin-top: 40px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.block-head h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--accent);
  font-size: 1.6rem;
  font-weight: 300;
}
.block-head h2 .icon {
  color: var(--accent);
}
.cards,
.recent {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.card,
.recent a {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 18px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  color: var(--text);
  text-decoration: none;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.card:hover,
.recent a:hover {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}
.card-title,
.recent strong {
  font-weight: 700;
  color: var(--text-strong);
}
.card-sub,
.recent span {
  font-size: 0.86rem;
  color: var(--text-muted);
}
.card-meta {
  margin-top: auto;
  padding-top: 8px;
  font-size: 0.78rem;
  color: var(--accent);
  font-weight: 600;
}
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.group {
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
}
.group h3 {
  margin: 0;
  color: var(--accent);
  font-size: 1.2rem;
  font-weight: 300;
}
.gdesc {
  margin: 4px 0 10px;
  font-size: 0.85rem;
}
.group ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.group li a {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
  color: var(--text-strong);
  text-decoration: none;
}
.group li a:hover code {
  color: var(--accent);
  text-decoration: underline;
}
.group li a .muted {
  font-size: 0.78rem;
}
.dsum {
  margin: 2px 0 4px;
  font-size: 0.8rem;
}
.pdfs {
  columns: 2 320px;
  margin: 0;
  padding-left: 1.2em;
}
.pdfs li {
  padding: 4px 0;
}
</style>
