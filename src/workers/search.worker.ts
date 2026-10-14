/// <reference lib="webworker" />
import type MiniSearch from 'minisearch';
import type { SearchDoc } from '../types/docs';
import { createIndex, runSearch, type SearchQuery } from '../lib/searchEngine';

type In = { type: 'init'; url: string } | { type: 'search'; id: number; query: SearchQuery };

let index: MiniSearch<SearchDoc> | null = null;
let texts = new Map<string, string>();
let ready: Promise<void> | null = null;

async function init(url: string) {
  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search data: ${res.status}`);
  const docs = (await res.json()) as SearchDoc[];
  texts = new Map(docs.map((d) => [d.id, d.text]));
  index = createIndex(docs);
  postMessage({ type: 'ready', count: docs.length, ms: Math.round(performance.now() - t0) });
}

self.onmessage = async (ev: MessageEvent<In>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    ready ??= init(msg.url).catch((e: Error) => {
      ready = null;
      postMessage({ type: 'error', message: e.message });
    });
    return;
  }
  if (msg.type === 'search') {
    try {
      await ready;
      if (!index) throw new Error('index not ready');
      postMessage({ type: 'results', id: msg.id, hits: runSearch(index, texts, msg.query) });
    } catch (e) {
      postMessage({ type: 'results', id: msg.id, hits: [], error: (e as Error).message });
    }
  }
};
