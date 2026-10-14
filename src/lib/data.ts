import { shallowRef } from 'vue';
import type { Guide, InputDoc, Manifest, PdfInfo, ReleaseNotes, Xref, XrefEdge, XrefNode, GuideMention } from '../types/docs';

const BASE = import.meta.env.BASE_URL;

/** Absolute app URL for a path like "/input/pw" (respects the deploy base). */
export function appUrl(path: string): string {
  return BASE.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

const cache = new Map<string, Promise<unknown>>();

export function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(appUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const manifest = shallowRef<Manifest | null>(null);
export const manifestError = shallowRef<string | null>(null);

export async function loadManifest(): Promise<Manifest> {
  try {
    const m = await getJson<Manifest>('/data/manifest.json');
    manifest.value = m;
    return m;
  } catch (e) {
    manifestError.value = (e as Error).message;
    throw e;
  }
}

export const loadInput = (id: string) => getJson<InputDoc>(`/data/input/${id}.json`);
export const loadGuide = (id: string) => getJson<Guide>(`/data/guide/${id}.json`);
export const loadNotes = () => getJson<ReleaseNotes>('/data/release-notes.json');
export const loadPdfs = () => getJson<PdfInfo[]>('/data/pdfs.json');

/* ------------------------------------------------------------- xref */

export interface XrefIndex {
  nodes: Map<string, XrefNode>;
  out: Map<string, XrefEdge[]>;
  in: Map<string, XrefEdge[]>;
  byName: Map<string, XrefNode[]>;
  guideMentions: Record<string, GuideMention[]>;
  raw: Xref;
}

let xrefIndex: Promise<XrefIndex> | null = null;

export function loadXref(): Promise<XrefIndex> {
  if (!xrefIndex) {
    xrefIndex = getJson<Xref>('/data/xref.json').then((x) => {
      const nodes = new Map(x.nodes.map((n) => [n.id, n]));
      const out = new Map<string, XrefEdge[]>();
      const inn = new Map<string, XrefEdge[]>();
      for (const e of x.edges) {
        (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
        (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
      }
      const byName = new Map<string, XrefNode[]>();
      for (const n of x.nodes) {
        const key = n.varId.replace(/-\d+$/, '').toLowerCase();
        (byName.get(key) ?? byName.set(key, []).get(key)!).push(n);
      }
      return { nodes, out, in: inn, byName, guideMentions: x.guideMentions, raw: x };
    });
    xrefIndex.catch(() => (xrefIndex = null));
  }
  return xrefIndex;
}

export function docTitle(id: string): string {
  return manifest.value?.docs.find((d) => d.id === id)?.title ?? id;
}
