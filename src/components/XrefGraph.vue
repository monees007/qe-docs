<script setup lang="ts">
/**
 * Force-directed cross-reference graph (d3-force + SVG).
 * Colour = relation to the focused entry (or section kind in program view);
 * edge style = how the link was established (solid: link written by the authors,
 * dashed: "See:" field, dotted: auto-detected mention). Identity never relies on
 * colour alone: the legend names every style and each node has a text label/tooltip.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { drag as d3drag } from 'd3-drag';
import type { XrefEdgeKind } from '../types/docs';
import { prefersReducedMotion } from '../lib/settings';

export interface GNode {
  id: string;
  label: string;
  group: 'focus' | 'out' | 'in' | 'both' | 'namelist' | 'card' | 'other' | 'external';
  sub?: string;
}
export interface GEdge {
  source: string;
  target: string;
  kind: XrefEdgeKind;
}

const props = defineProps<{ nodes: GNode[]; edges: GEdge[]; height?: number; labels?: 'all' | 'auto'; graphLabel: string }>();
const emit = defineEmits<{ select: [id: string] }>();

type SN = GNode & SimulationNodeDatum;
type SL = SimulationLinkDatum<SN> & { kind: XrefEdgeKind };

const svgEl = ref<SVGSVGElement | null>(null);
const wrap = ref<HTMLElement | null>(null);
const width = ref(600);
const h = computed(() => props.height ?? 420);
const hover = ref<SN | null>(null);
const tick = ref(0);
let sim: ReturnType<typeof forceSimulation<SN>> | null = null;
let zb: ZoomBehavior<SVGSVGElement, unknown> | null = null;
const transform = ref({ x: 0, y: 0, k: 1 });

const simNodes = ref<SN[]>([]);
const simLinks = ref<SL[]>([]);

const degree = computed(() => {
  const d = new Map<string, number>();
  for (const e of props.edges) {
    d.set(e.source, (d.get(e.source) ?? 0) + 1);
    d.set(e.target, (d.get(e.target) ?? 0) + 1);
  }
  return d;
});
const radius = (n: GNode) => (n.group === 'focus' ? 11 : Math.min(9, 5 + Math.sqrt(degree.value.get(n.id) ?? 0)));
const showLabel = (n: SN) => props.labels === 'all' || n.group === 'focus' || props.nodes.length <= 40 || (degree.value.get(n.id) ?? 0) >= 6 || hover.value?.id === n.id;

function build() {
  sim?.stop();
  userZoomed = false;
  const old = new Map(simNodes.value.map((n) => [n.id, n]));
  const nodes: SN[] = props.nodes.map((n) => {
    const o = old.get(n.id);
    return { ...n, x: o?.x, y: o?.y };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const links: SL[] = props.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
  const W = width.value;
  const H = h.value;
  sim = forceSimulation<SN>(nodes)
    .force('link', forceLink<SN, SL>(links).id((d) => d.id).distance((l) => (l.kind === 'mention' ? 1.25 : 1) * (nodes.length < 25 ? 120 : 75)).strength(0.5))
    .force('charge', forceManyBody().strength(nodes.length > 150 ? -60 : -220))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.05))
    .force('y', forceY(H / 2).strength(0.07))
    .force('collide', forceCollide<SN>().radius((d) => radius(d) + 6));
  const focus = nodes.find((n) => n.group === 'focus');
  if (focus) {
    focus.fx = W / 2;
    focus.fy = H / 2;
  }
  simNodes.value = nodes;
  simLinks.value = links;
  if (prefersReducedMotion()) {
    sim.stop();
    for (let i = 0; i < 300; i++) sim.tick();
    tick.value++;
    fitToContent();
  } else {
    // settle quickly off-screen, then animate the remaining motion
    for (let i = 0; i < 60; i++) sim.tick();
    fitToContent();
    sim.alpha(0.3).on('tick', () => tick.value++).on('end', fitToContent);
  }
  setupDrag();
}

/** Zoom/pan so the whole graph is visible (does not fight a user who already zoomed). */
let userZoomed = false;
function fitToContent() {
  if (!svgEl.value || !zb || userZoomed || !simNodes.value.length) return;
  const xs = simNodes.value.map((n) => n.x ?? 0);
  const ys = simNodes.value.map((n) => n.y ?? 0);
  const pad = 46;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const k = Math.max(0.3, Math.min(1.6, Math.min(width.value / (x1 - x0), h.value / (y1 - y0))));
  const t = zoomIdentity.translate(width.value / 2 - (k * (x0 + x1)) / 2, h.value / 2 - (k * (y0 + y1)) / 2).scale(k);
  programmatic = true;
  select(svgEl.value).call(zb.transform, t);
  programmatic = false;
}
let programmatic = false;

function setupDrag() {
  if (!svgEl.value || !sim) return;
  const s = sim;
  requestAnimationFrame(() => {
    const sel = select(svgEl.value!).selectAll<SVGGElement, SN>('g.node');
    sel.each(function () {
      const id = this.getAttribute('data-id');
      const n = simNodes.value.find((x) => x.id === id);
      if (n) select<SVGGElement, SN>(this).datum(n);
    });
    sel.call(
        d3drag<SVGGElement, SN>()
          .on('start', (ev, d) => {
            if (!ev.active) s.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
            tick.value++;
          })
          .on('end', (ev, d) => {
            if (!ev.active) s.alphaTarget(0);
            if (d.group !== 'focus') {
              d.fx = null;
              d.fy = null;
            }
          }),
      );
  });
}

function setupZoom() {
  if (!svgEl.value) return;
  zb = d3zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.25, 4])
    .filter((ev: Event) => (ev.type === 'wheel' ? (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey : !(ev as MouseEvent).button))
    .on('zoom', (ev) => {
      transform.value = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k };
      if (!programmatic && ev.sourceEvent) userZoomed = true;
    });
  select(svgEl.value).call(zb);
}
function zoomBy(f: number) {
  if (svgEl.value && zb) select(svgEl.value).call(zb.scaleBy, f);
}
function resetZoom() {
  userZoomed = false;
  fitToContent();
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  width.value = wrap.value?.clientWidth || 600;
  setupZoom();
  build();
  if (wrap.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(() => {
      const w = wrap.value?.clientWidth || 600;
      if (Math.abs(w - width.value) > 30) {
        width.value = w;
        build();
      }
    });
    ro.observe(wrap.value);
  }
});
onBeforeUnmount(() => {
  sim?.stop();
  ro?.disconnect();
});
watch(() => [props.nodes, props.edges], build);

const pos = (n: string | number | SN) => (typeof n === 'object' ? n : simNodes.value.find((x) => x.id === n));
function edgePath(l: SL) {
  void tick.value;
  const s = pos(l.source as SN);
  const t = pos(l.target as SN);
  if (!s || !t || s.x == null || t.x == null) return '';
  // shorten to the node rim so arrowheads stay visible
  const dx = t.x - s.x!;
  const dy = t.y! - s.y!;
  const len = Math.hypot(dx, dy) || 1;
  const rt = radius(t) + 3;
  return `M${s.x},${s.y}L${t.x - (dx / len) * rt},${t.y! - (dy / len) * rt}`;
}
const DASH: Record<XrefEdgeKind, string | undefined> = { ref: undefined, see: '7 4', mention: '2 4' };

function onNodeKey(e: KeyboardEvent, n: SN) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('select', n.id);
  }
}
defineExpose({ zoomBy, resetZoom });
</script>

<template>
  <div ref="wrap" class="xg">
    <div class="xg-tools no-print">
      <button class="icon-btn" type="button" aria-label="Zoom in" @click="zoomBy(1.3)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
      <button class="icon-btn" type="button" aria-label="Zoom out" @click="zoomBy(1 / 1.3)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
      <button class="icon-btn" type="button" aria-label="Reset view" @click="resetZoom"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg></button>
    </div>
    <svg ref="svgEl" class="xg-svg" :width="width" :height="h" :viewBox="`0 0 ${width} ${h}`" role="group" :aria-label="graphLabel">
      <defs>
        <marker id="xg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="var(--viz-edge)" />
        </marker>
      </defs>
      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <g class="edges">
          <path
            v-for="(l, i) in simLinks"
            :key="i"
            :d="edgePath(l)"
            :stroke-dasharray="DASH[l.kind]"
            :class="{ dim: hover && (l.source as SN).id !== hover.id && (l.target as SN).id !== hover.id }"
            marker-end="url(#xg-arrow)"
          />
        </g>
        <g class="nodes">
          <g
            v-for="n in simNodes"
            :key="n.id + tick * 0"
            class="node"
            :data-id="n.id"
            :data-group="n.group"
            :transform="`translate(${n.x ?? 0},${n.y ?? 0})`"
            tabindex="0"
            role="button"
            :aria-label="`${n.label}${n.sub ? `, ${n.sub}` : ''}`"
            @click="emit('select', n.id)"
            @keydown="onNodeKey($event, n)"
            @mouseenter="hover = n"
            @mouseleave="hover = null"
            @focus="hover = n"
            @blur="hover = null"
          >
            <circle class="hit" :r="radius(n) + 8" />
            <circle class="dot" :r="radius(n)" />
            <text v-if="showLabel(n)" :y="-radius(n) - 6" text-anchor="middle">{{ n.label }}</text>
          </g>
        </g>
      </g>
    </svg>
    <div v-if="hover" class="xg-tip" role="presentation" :style="{ left: `${(hover.x ?? 0) * transform.k + transform.x}px`, top: `${(hover.y ?? 0) * transform.k + transform.y}px` }">
      <strong>{{ hover.label }}</strong><span v-if="hover.sub">{{ hover.sub }}</span>
    </div>
    <p class="xg-hint muted">Drag nodes · drag background to pan · Ctrl/⌘ + scroll to zoom · Tab to a node and press Enter</p>
  </div>
</template>

<style scoped>
.xg {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface);
  overflow: hidden;
}
.xg-svg {
  display: block;
  max-width: none;
  touch-action: none;
  cursor: grab;
}
.xg-tools {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--surface);
}
.edges path {
  fill: none;
  stroke: var(--viz-edge);
  stroke-width: 1.4;
  opacity: 0.8;
}
.edges path.dim {
  opacity: 0.12;
}
.node {
  cursor: pointer;
  outline: none;
}
.node .hit {
  fill: transparent;
}
.node .dot {
  stroke: var(--surface);
  stroke-width: 2;
  fill: var(--text-muted);
}
.node[data-group='focus'] .dot {
  fill: var(--accent);
  stroke: var(--text-strong);
  stroke-width: 2.5;
}
.node[data-group='out'] .dot,
.node[data-group='namelist'] .dot {
  fill: var(--viz-1);
}
.node[data-group='in'] .dot,
.node[data-group='card'] .dot {
  fill: var(--viz-2);
}
.node[data-group='both'] .dot,
.node[data-group='other'] .dot {
  fill: var(--viz-3);
}
.node[data-group='external'] .dot {
  fill: var(--surface);
  stroke: var(--text-muted);
  stroke-dasharray: 2 2;
}
.node:focus-visible .dot {
  stroke: var(--focus);
  stroke-width: 4;
}
.node text {
  fill: var(--text-strong);
  font-family: var(--font-mono);
  font-size: 11px;
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 4px;
  stroke-linejoin: round;
  pointer-events: none;
}
.node[data-group='focus'] text {
  font-weight: 700;
  font-size: 13px;
}
.xg-tip {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, calc(-100% - 18px));
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  pointer-events: none;
  white-space: nowrap;
}
.xg-tip strong {
  font-family: var(--font-mono);
}
.xg-tip span {
  color: var(--text-muted);
}
.xg-hint {
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
}
</style>
