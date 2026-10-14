<script setup lang="ts">
/**
 * Renders documentation HTML produced (and sanitised) by the build-time pipeline,
 * then adds behaviour: SPA navigation for internal links, per-variable tools,
 * keyboard-scrollable preformatted blocks and scrolling to the URL fragment.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { appUrl } from '../lib/data';
import { copyText, announce, xrefTarget } from '../lib/ui';

const props = defineProps<{
  html: string;
  docId?: string;
  /** varId -> number of related variables (input references only) */
  related?: Map<string, number>;
}>();
const emit = defineEmits<{ rendered: [el: HTMLElement] }>();

const root = ref<HTMLElement | null>(null);
const route = useRoute();
const router = useRouter();
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

const ICON_LINK =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>';
const ICON_GRAPH =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6a2 2 0 1 0 0 .01M18 8a2 2 0 1 0 0 .01M8 18a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01M8 7l8 1M7 8l1 8M10 18h6M17 10l1 6"/></svg>';

function enhance() {
  const el = root.value;
  if (!el) return;
  // base-aware hrefs for internal links
  if (base) {
    el.querySelectorAll<HTMLAnchorElement>('a[data-internal]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (h.startsWith('/') && !h.startsWith(base + '/')) a.setAttribute('href', base + h);
    });
  }
  // external links: tell screen-reader users they open a new tab
  el.querySelectorAll<HTMLAnchorElement>('a.ext').forEach((a) => {
    if (!a.querySelector('.sr-only')) a.insertAdjacentHTML('beforeend', '<span class="sr-only"> (opens in a new tab)</span>');
  });
  // variable tools
  if (props.docId) {
    el.querySelectorAll<HTMLElement>('.qe-var-tools').forEach((slot) => {
      const id = slot.dataset.var!;
      const want = String(props.related?.get(id) ?? 0);
      if (slot.childElementCount && slot.dataset.n === want) return;
      slot.dataset.n = want;
      const name = slot.closest('article')?.querySelector('.qe-var-name')?.textContent?.trim() ?? id;
      const n = props.related?.get(id) ?? 0;
      slot.innerHTML =
        `<button type="button" class="var-tool" data-act="copy" data-id="${id}" aria-label="Copy link to ${escapeAttr(name)}">${ICON_LINK}<span>Link</span></button>` +
        (n
          ? `<button type="button" class="var-tool" data-act="xref" data-id="${id}" aria-label="${n} related entries for ${escapeAttr(name)}" aria-haspopup="dialog">${ICON_GRAPH}<span>Related</span><span class="n">${n}</span></button>`
          : '');
    });
  }
  // preformatted blocks that scroll horizontally must be reachable by keyboard
  el.querySelectorAll<HTMLElement>('pre, .qe-syntax, .qe-table').forEach((p) => {
    if (p.scrollWidth > p.clientWidth + 2) {
      p.tabIndex = 0;
      p.setAttribute('role', 'region');
      p.setAttribute('aria-label', p.classList.contains('qe-syntax') ? 'Input syntax (scrollable)' : 'Scrollable block');
    } else if (p.getAttribute('role') === 'region') {
      p.removeAttribute('tabindex');
      p.removeAttribute('role');
      p.removeAttribute('aria-label');
    }
  });
  emit('rendered', el);
}

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export interface ScrollOpts {
  flash?: boolean;
}
function scrollToHash(hash: string, opts: ScrollOpts = { flash: true }) {
  const el = root.value;
  if (!el || !hash) return;
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const target = document.getElementById(id);
  if (!target || !el.contains(target)) return;
  target.scrollIntoView({ block: 'start' });
  if (opts.flash) {
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
  }
  const focusable = target.matches('article, section, h1, h2, h3, h4, h5') ? target : null;
  if (focusable) {
    focusable.tabIndex = -1;
    focusable.focus({ preventScroll: true });
  }
}

function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const tool = t.closest<HTMLButtonElement>('button.var-tool');
  if (tool) {
    const id = tool.dataset.id!;
    if (tool.dataset.act === 'copy') {
      const url = `${location.origin}${base}${route.path}#${id}`;
      copyText(url).then((ok) => {
        const label = tool.querySelector('span');
        if (label) {
          label.textContent = ok ? 'Copied' : 'Copy failed';
          setTimeout(() => (label.textContent = 'Link'), 1600);
        }
        announce(ok ? 'Link copied' : 'Could not copy the link');
      });
    } else if (tool.dataset.act === 'xref' && props.docId) {
      xrefTarget.value = `${props.docId}:${id}`;
    }
    return;
  }
  const a = t.closest<HTMLAnchorElement>('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank') return;
  let href = a.getAttribute('href') || '';
  if (href.startsWith('#')) {
    e.preventDefault();
    router.push({ path: route.path, query: route.query, hash: href });
    return;
  }
  if (base && href.startsWith(base + '/')) href = href.slice(base.length);
  if (href.startsWith('/')) {
    e.preventDefault();
    router.push(href);
  }
}

watch(
  () => props.html,
  async () => {
    await nextTick();
    enhance();
    if (route.hash) scrollToHash(route.hash, { flash: true });
  },
);
watch(
  () => props.related,
  () => nextTick(enhance),
);
watch(
  () => route.hash,
  (h) => {
    if (h) nextTick(() => scrollToHash(h));
  },
);
let ro: ResizeObserver | null = null;
onMounted(async () => {
  await nextTick();
  enhance();
  if (route.hash) requestAnimationFrame(() => scrollToHash(route.hash, { flash: true }));
  if (root.value && 'ResizeObserver' in window) {
    let t: ReturnType<typeof setTimeout>;
    ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(enhance, 200);
    });
    ro.observe(root.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());

defineExpose({ scrollToHash, root });
void appUrl;
</script>

<template>
  <!-- Content is generated and sanitised at build time (scripts/ingest). -->
  <div ref="root" class="prose" @click="onClick" v-html="html" />
</template>
