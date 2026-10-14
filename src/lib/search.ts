import { ref } from 'vue';
import type { SearchHit, SearchQuery } from './searchEngine';
import { appUrl } from './data';

export const searchReady = ref(false);
export const searchError = ref<string | null>(null);
export const searchOpen = ref(false);
export const searchPrefill = ref('');

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (h: SearchHit[]) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.type === 'ready') {
      searchReady.value = true;
      searchError.value = null;
    } else if (m.type === 'error') {
      searchError.value = m.message;
    } else if (m.type === 'results') {
      pending.get(m.id)?.(m.hits);
      pending.delete(m.id);
    }
  };
  worker.postMessage({ type: 'init', url: new URL(appUrl('/data/search.json'), location.href).href });
  return worker;
}

/** Start loading the index in the background (called once the app is idle). */
export function warmSearch() {
  ensureWorker();
}

export function search(query: SearchQuery): Promise<SearchHit[]> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ type: 'search', id, query: JSON.parse(JSON.stringify(query)) });
  });
}

export function openSearch(prefill = '') {
  searchPrefill.value = prefill;
  searchOpen.value = true;
}

export type { SearchHit, SearchQuery };
