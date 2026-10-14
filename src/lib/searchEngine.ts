/**
 * Client-side full-text search (MiniSearch). Shared by the Web Worker and the unit tests.
 * Tokens keep underscores so Fortran identifiers such as "starting_magnetization"
 * match exactly; their parts ("starting", "magnetization") are indexed too.
 */
import MiniSearch, { type SearchResult } from 'minisearch';
import type { SearchDoc, SearchKind } from '../types/docs';

export interface SearchQuery {
  q: string;
  kinds?: SearchKind[];
  docIds?: string[];
  limit?: number;
}

export interface SearchHit {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  url: string;
  docId: string;
  type?: string;
  score: number;
  terms: string[];
  snippet: string;
}

const SPLIT = /[^\p{L}\p{N}_]+/u;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(SPLIT)) {
    if (!t) continue;
    out.push(t);
    if (t.includes('_')) for (const p of t.split('_')) if (p) out.push(p);
  }
  return out;
}

export function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  return t.length ? t : null;
}

export function createIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const ms = new MiniSearch<SearchDoc>({
    idField: 'id',
    fields: ['title', 'names', 'subtitle', 'text'],
    storeFields: ['kind', 'title', 'subtitle', 'url', 'docId', 'type'],
    tokenize,
    processTerm,
    searchOptions: {
      boost: { names: 6, title: 4, subtitle: 1.2, text: 1 },
      prefix: (term) => term.length >= 2,
      fuzzy: (term) => (term.length >= 5 ? 0.18 : false),
      combineWith: 'AND',
      tokenize,
      processTerm,
    },
  });
  ms.addAll(docs);
  return ms;
}

const KIND_WEIGHT: Record<SearchKind, number> = {
  variable: 1.15,
  program: 1.3,
  section: 1.1,
  guide: 1,
  release: 0.75,
  pdf: 0.7,
};

export function makeSnippet(text: string, terms: string[], radius = 90): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

export function runSearch(ms: MiniSearch<SearchDoc>, texts: Map<string, string>, query: SearchQuery): SearchHit[] {
  const q = query.q.trim();
  if (!q) return [];
  const filter = (r: SearchResult) =>
    (!query.kinds?.length || query.kinds.includes(r.kind as SearchKind)) && (!query.docIds?.length || query.docIds.includes(r.docId as string));
  let results = ms.search(q, { filter });
  if (!results.length) results = ms.search(q, { filter, combineWith: 'OR' });
  const ql = q.toLowerCase().replace(/^&/, '');
  const hits = results.map((r) => {
    const title = String(r.title);
    const tl = title.toLowerCase();
    let score = r.score * (KIND_WEIGHT[r.kind as SearchKind] ?? 1);
    // exact identifier match first: "ecutwfc", "&system", "pw.x"
    const bare = tl.replace(/^&/, '').replace(/\(.*$/, '');
    if (bare === ql || tl === ql || tl === `${ql}.x`) score *= 6;
    else if (bare.startsWith(ql)) score *= 1.6;
    return {
      id: r.id as string,
      kind: r.kind as SearchKind,
      title,
      subtitle: String(r.subtitle),
      url: String(r.url),
      docId: String(r.docId),
      type: r.type as string | undefined,
      score,
      terms: r.terms,
      snippet: '',
    } satisfies SearchHit;
  });
  hits.sort((a, b) => b.score - a.score);
  const limited = hits.slice(0, query.limit ?? 50);
  for (const h of limited) h.snippet = makeSnippet(texts.get(h.id) ?? '', h.terms);
  return limited;
}
