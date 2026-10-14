import type { XrefIndex } from './data';
import type { GEdge, GNode } from '../components/XrefGraph.vue';
import type { XrefEdgeKind } from '../types/docs';

export const EDGE_LABEL: Record<XrefEdgeKind, string> = {
  ref: 'Linked in the description',
  see: 'Listed under “See”',
  mention: 'Named in the text (auto-detected)',
};

export interface Neighbour {
  id: string;
  label: string;
  docId: string;
  varId: string;
  section: string;
  kinds: XrefEdgeKind[];
}

export function neighbours(x: XrefIndex, id: string, dir: 'out' | 'in', kinds: Set<XrefEdgeKind>): Neighbour[] {
  const edges = (dir === 'out' ? x.out.get(id) : x.in.get(id)) ?? [];
  const map = new Map<string, Neighbour>();
  for (const e of edges) {
    if (!kinds.has(e.kind)) continue;
    const other = dir === 'out' ? e.target : e.source;
    const n = x.nodes.get(other);
    if (!n) continue;
    const cur = map.get(other) ?? { id: other, label: n.label, docId: n.docId, varId: n.varId, section: n.section, kinds: [] };
    if (!cur.kinds.includes(e.kind)) cur.kinds.push(e.kind);
    map.set(other, cur);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Ego network around `id` up to `depth` hops (both directions). */
export function egoGraph(x: XrefIndex, id: string, depth: 1 | 2, kinds: Set<XrefEdgeKind>, max = 140): { nodes: GNode[]; edges: GEdge[] } {
  const keep = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const e of [...(x.out.get(f) ?? []), ...(x.in.get(f) ?? [])]) {
        if (!kinds.has(e.kind)) continue;
        const o = e.source === f ? e.target : e.source;
        if (!keep.has(o) && keep.size < max) {
          keep.add(o);
          next.push(o);
        }
      }
    }
    frontier = next;
  }
  const outs = new Set((x.out.get(id) ?? []).filter((e) => kinds.has(e.kind)).map((e) => e.target));
  const ins = new Set((x.in.get(id) ?? []).filter((e) => kinds.has(e.kind)).map((e) => e.source));
  const focusDoc = x.nodes.get(id)?.docId;
  const nodes: GNode[] = [...keep].map((k) => {
    const n = x.nodes.get(k)!;
    let group: GNode['group'] = 'external';
    if (k === id) group = 'focus';
    else if (outs.has(k) && ins.has(k)) group = 'both';
    else if (outs.has(k)) group = 'out';
    else if (ins.has(k)) group = 'in';
    const label = n.docId !== focusDoc ? `${n.label} (${n.docId})` : n.label;
    return { id: k, label, group, sub: `${n.section}${n.docId !== focusDoc ? ` · ${n.docId}` : ''}` };
  });
  const edges: GEdge[] = x.raw.edges.filter((e) => kinds.has(e.kind) && keep.has(e.source) && keep.has(e.target));
  return { nodes, edges };
}

/** Whole-program graph: nodes coloured by the kind of section that holds them. */
export function programGraph(
  x: XrefIndex,
  docId: string,
  kinds: Set<XrefEdgeKind>,
  sectionKind: Map<string, string>,
  includeIsolated: boolean,
): { nodes: GNode[]; edges: GEdge[] } {
  const ids = x.raw.nodes.filter((n) => n.docId === docId).map((n) => n.id);
  const set = new Set(ids);
  const edges: GEdge[] = x.raw.edges.filter((e) => kinds.has(e.kind) && set.has(e.source) && set.has(e.target));
  const touched = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes: GNode[] = ids
    .filter((id) => includeIsolated || touched.has(id))
    .map((id) => {
      const n = x.nodes.get(id)!;
      const k = sectionKind.get(n.section);
      const group: GNode['group'] = k === 'namelist' ? 'namelist' : k === 'card' ? 'card' : 'other';
      return { id, label: n.label, group, sub: n.section };
    });
  return { nodes, edges };
}
