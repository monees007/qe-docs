/**
 * Ingestion pipeline: QE documentation files  ->  public/data/*.json
 *
 *   npm run ingest                     # reads source/qe-Doc
 *   npm run ingest -- --source <dir>   # any folder mirroring https://www.quantum-espresso.org/Doc/
 *
 * Output is deterministic for a given input (apart from generatedAt).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DocGroup, DocSummary, Guide, InputDoc, Manifest, PdfInfo, SearchDoc, Xref, XrefEdge, XrefNode, GuideMention, TocEntry,
} from '../../src/types/docs.ts';
import { parseHelpdocHtml, type ParsedInput } from './helpdocHtml.ts';
import { convertHelpdocXml } from './helpdocXml.ts';
import { parseGuide, type GuideBuild } from './guides.ts';
import { parseReleaseNotes } from './releaseNotes.ts';
import { extractPdf } from './pdfs.ts';
import { OFFICIAL_BASE, squash, slugify, load } from './util.ts';
import { buildMentionEdges } from './xref.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const SRC = resolve(args.includes('--source') ? args[args.indexOf('--source') + 1] : join(ROOT, 'source/qe-Doc'));
const OUT = join(ROOT, 'public/data');
const OUT_DOCS = join(ROOT, 'public/docs');
const XDOC_RE = /(?:^|\/Doc\/|^\.\/|\.\.\/)(INPUT_[A-Za-z0-9_]+)\.(?:html|txt|xml|def)(?:#(.*))?$/;

const log = (...a: unknown[]) => console.log('[ingest]', ...a);
const warnings: string[] = [];
const excluded: Manifest['excluded'] = [];

if (!existsSync(SRC)) {
  console.error(`Source folder not found: ${SRC}`);
  process.exit(1);
}
log('source:', SRC);
rmSync(OUT, { recursive: true, force: true });
rmSync(OUT_DOCS, { recursive: true, force: true });
mkdirSync(join(OUT, 'input'), { recursive: true });
mkdirSync(join(OUT, 'guide'), { recursive: true });
mkdirSync(join(OUT_DOCS, 'pdf'), { recursive: true });

const write = (rel: string, data: unknown) => writeFileSync(join(OUT, rel), JSON.stringify(data));

/* ===================================================== navigation groups */
// Editorial grouping for navigation only. Each program keeps the package name stated in its own file.
const GROUPS: { id: string; title: string; description: string; files: string[] }[] = [
  { id: 'pwscf', title: 'Self-consistent calculations', description: 'pw.x — the main PWscf program', files: ['INPUT_PW'] },
  { id: 'postproc', title: 'Post-processing', description: 'Charge densities, DOS, projections, band structures and analysis', files: ['INPUT_PP', 'INPUT_PROJWFC', 'INPUT_DOS', 'INPUT_BANDS', 'INPUT_molecularpdos', 'INPUT_PPACF', 'INPUT_PPRISM', 'INPUT_BAND_INTERPOLATION', 'INPUT_D3HESS'] },
  { id: 'phonon', title: 'Phonons (PHonon)', description: 'Density-functional perturbation theory and lattice dynamics', files: ['INPUT_PH', 'INPUT_Q2R', 'INPUT_MATDYN', 'INPUT_DYNMAT', 'INPUT_POSTAHC'] },
  { id: 'cp', title: 'Car–Parrinello (CP)', description: 'Car–Parrinello molecular dynamics', files: ['INPUT_CP', 'INPUT_CPPP'] },
  { id: 'neb', title: 'Reaction paths (NEB)', description: 'Nudged elastic band', files: ['INPUT_NEB'] },
  { id: 'tddfpt', title: 'Linear response (turbo codes)', description: 'turboTDDFPT, turboEELS and turboMAGNON', files: ['INPUT_Davidson', 'INPUT_Lanczos', 'INPUT_Spectrum', 'INPUT_EELS', 'INPUT_Magnon'] },
  { id: 'hubbard', title: 'Hubbard & constrained DFT', description: 'hp.x and OS-CDFT', files: ['INPUT_HP', 'INPUT_OSCDFT', 'INPUT_OSCDFT_PP', 'INPUT_OSCDFT_ET'] },
  { id: 'kcw', title: 'KCW', description: 'kcw.x', files: ['INPUT_kcw'] },
  { id: 'interfaces', title: 'Interfaces', description: 'Converters to and from Wannier90, BerkeleyGW and GW codes', files: ['INPUT_pw2wannier90', 'INPUT_wannier2pw', 'INPUT_pw2bgw', 'INPUT_bgw2pw', 'INPUT_pw2gw'] },
  { id: 'other', title: 'Other codes', description: 'Transport, atomic calculations and heat currents', files: ['INPUT_PWCOND', 'INPUT_LD1', 'INPUT_ALL_CURRENTS'] },
];
const fileGroup = new Map<string, string>();
GROUPS.forEach((g) => g.files.forEach((f) => fileGroup.set(f, g.id)));

const docIdFor = (base: string) => slugify(base.replace(/^INPUT_/, '').replace(/_/g, '-'));

/* ========================================================== input docs */
const files = readdirSync(SRC);
const bases = [...new Set(files.filter((f) => /^INPUT_.+\.(html|xml|txt)$/.test(f)).map((f) => f.replace(/\.(html|xml|txt)$/, '')))].sort();
const inputs: { base: string; id: string; parsed: ParsedInput; format: 'helpdoc-html' | 'helpdoc-xml'; file: string }[] = [];

for (const base of bases) {
  const id = docIdFor(base);
  const html = join(SRC, `${base}.html`);
  const xml = join(SRC, `${base}.xml`);
  const txt = join(SRC, `${base}.txt`);
  let parsed: ParsedInput | null = null;
  let format: 'helpdoc-html' | 'helpdoc-xml' = 'helpdoc-html';
  let file = `${base}.html`;
  if (existsSync(html) && statSync(html).size > 500) {
    parsed = parseHelpdocHtml(readFileSync(html, 'utf8'), file, id);
  } else if (existsSync(xml) && statSync(xml).size > 500) {
    file = `${base}.xml`;
    format = 'helpdoc-xml';
    parsed = convertHelpdocXml(readFileSync(xml, 'latin1'), file, id);
    if (!parsed.doc.version && existsSync(txt)) {
      parsed.doc.version = readFileSync(txt, 'utf8').match(/\(version:\s*([^)]+)\)/)?.[1]?.trim();
    }
  }
  for (const ext of ['html', 'xml', 'txt']) {
    const p = join(SRC, `${base}.${ext}`);
    if (existsSync(p) && statSync(p).size <= 500) excluded.push({ file: `${base}.${ext}`, reason: `empty placeholder in the source (${statSync(p).size} bytes)` });
  }
  if (!parsed) {
    warnings.push(`${base}: no usable HTML or XML`);
    continue;
  }
  if (!fileGroup.has(base)) warnings.push(`${base}: not assigned to a navigation group (placed in "Other codes")`);
  warnings.push(...parsed.warnings);
  inputs.push({ base, id, parsed, format, file });
}
log(`input docs: ${inputs.length}`);

/* resolve cross-document links (INPUT_X.html#frag) */
const baseToDoc = new Map(inputs.map((i) => [i.base, i]));
function resolveX(xdoc: string, xfrag?: string): { docId: string; target?: string } | null {
  const d = baseToDoc.get(xdoc);
  if (!d) return null;
  if (!xfrag) return { docId: d.id };
  const t = d.parsed.doc.aliases[xfrag] ?? (d.parsed.doc.variables.some((v) => v.id === xfrag) ? xfrag : undefined);
  return { docId: d.id, target: t };
}
function rewriteXLinks(html: string, ctx: string): string {
  if (!html.includes('data-xdoc')) return html;
  const $ = load(`<div id="__r">${html}</div>`);
  $('a[data-xdoc]').each((_, a) => {
    const el = $(a);
    const r = resolveX(el.attr('data-xdoc')!, el.attr('data-xfrag'));
    if (!r) {
      warnings.push(`${ctx}: link to ${el.attr('data-xdoc')} which is not in the source`);
      el.attr('href', `${OFFICIAL_BASE}${el.attr('data-xdoc')}.html`).addClass('ext').attr('target', '_blank').attr('rel', 'noopener noreferrer');
    } else {
      if (el.attr('data-xfrag') && !r.target) warnings.push(`${ctx}: anchor #${el.attr('data-xfrag')} not found in ${el.attr('data-xdoc')}`);
      el.attr('href', `/input/${r.docId}${r.target ? `#${r.target}` : ''}`).attr('data-internal', '1');
    }
    el.removeAttr('data-xdoc').removeAttr('data-xfrag');
  });
  return $('#__r').html() || '';
}
for (const i of inputs) i.parsed.doc.html = rewriteXLinks(i.parsed.doc.html, i.file);

/* ============================================================== guides */
const GUIDES: { dir: string; id: string; pdf?: string }[] = [
  { dir: 'user_guide', id: 'user-guide', pdf: 'user_guide.pdf' },
  { dir: 'pw_user_guide', id: 'pw-user-guide', pdf: 'pw_user_guide.pdf' },
  { dir: 'ph_user_guide', id: 'ph-user-guide', pdf: 'ph_user_guide.pdf' },
  { dir: 'pp_user_guide', id: 'pp-user-guide', pdf: 'pp_user_guide.pdf' },
  { dir: 'neb_user_guide', id: 'neb-user-guide', pdf: 'neb_user_guide.pdf' },
];
const guides: { cfg: (typeof GUIDES)[number]; build: GuideBuild }[] = [];
for (const cfg of GUIDES) {
  if (!existsSync(join(SRC, cfg.dir, 'index.html'))) {
    warnings.push(`guide ${cfg.dir} missing`);
    continue;
  }
  const build = parseGuide(SRC, cfg.dir, cfg.id, XDOC_RE);
  warnings.push(...build.warnings);
  build.skipped.forEach((s) => excluded.push({ file: s, reason: 'LaTeX2HTML navigation page (contents / about this document)' }));
  for (const ch of build.guide.chapters) ch.html = rewriteXLinks(ch.html, `${cfg.dir}/${ch.id}`);
  for (const img of build.images) {
    mkdirSync(join(OUT_DOCS, dirname(img)), { recursive: true });
    copyFileSync(join(SRC, img), join(OUT_DOCS, img));
  }
  guides.push({ cfg, build });
  log(`guide ${cfg.id}: ${build.guide.chapters.length} chapters, math rendered ${build.math.rendered}, image fallback ${build.math.fallback}`);
}
// unknown guide-like folders
for (const f of files) {
  const p = join(SRC, f);
  if (statSync(p).isDirectory() && !GUIDES.some((g) => g.dir === f) && f !== 'user_guide_PDF') {
    warnings.push(`folder ${f} is not handled by the pipeline`);
    excluded.push({ file: `${f}/`, reason: 'unrecognised folder' });
  }
}

/* ======================================================= release notes */
let releaseVersions = 0;
let notesSummary: DocSummary | null = null;
const notesSearch: SearchDoc[] = [];
if (existsSync(join(SRC, 'release-notes'))) {
  const { notes, warnings: w } = parseReleaseNotes(readFileSync(join(SRC, 'release-notes'), 'utf8'));
  warnings.push(...w);
  write('release-notes.json', notes);
  releaseVersions = notes.versions.length;
  notesSummary = {
    id: 'release-notes',
    kind: 'notes',
    title: 'Release notes',
    subtitle: `${notes.versions[0]?.version ?? ''} back to ${notes.versions[notes.versions.length - 1]?.version ?? ''}`,
    sourceFile: 'release-notes',
    sourceFormat: 'text',
    officialUrl: `${OFFICIAL_BASE}release-notes`,
    group: 'notes',
    counts: { versions: notes.versions.length },
  };
  for (const v of notes.versions)
    for (const s of v.sections)
      notesSearch.push({
        id: `r:${s.id}`,
        kind: 'release',
        title: s.heading,
        subtitle: `Release notes · ${v.version}`,
        text: squash([s.intro ?? '', ...s.items].join(' ')),
        url: `/release-notes#${s.id}`,
        docId: 'release-notes',
      });
  log(`release notes: ${notes.versions.length} versions`);
}

/* ================================================================ PDFs */
const pdfs: (PdfInfo & { htmlId?: string })[] = [];
const pdfSearch: SearchDoc[] = [];
const pdfDir = join(SRC, 'user_guide_PDF');
if (existsSync(pdfDir)) {
  for (const f of readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
    const id = `pdf-${slugify(f.replace(/\.pdf$/i, '')).replace(/_/g, '-')}`;
    copyFileSync(join(pdfDir, f), join(OUT_DOCS, 'pdf', f));
    let ex;
    try {
      ex = await extractPdf(join(pdfDir, f));
    } catch (e) {
      warnings.push(`${f}: text extraction failed (${(e as Error).message})`);
      ex = { title: undefined, pages: [] };
    }
    const guide = GUIDES.find((g) => g.pdf === f);
    const title = prettyPdfTitle(f, ex.title);
    pdfs.push({ id, title, file: f, pages: ex.pages.length, htmlId: guide?.id });
    // PDFs that duplicate an HTML guide are not indexed twice
    if (!guide)
      ex.pages.forEach((t, i) => {
        if (t.trim())
          pdfSearch.push({ id: `p:${id}:${i + 1}`, kind: 'pdf', title: `${title} — page ${i + 1}`, subtitle: 'PDF', text: squash(t), url: `/pdf/${id}?page=${i + 1}`, docId: id });
      });
  }
  log(`pdfs: ${pdfs.length}`);
}

function prettyPdfTitle(file: string, metaTitle?: string): string {
  const generic = !metaTitle || /^(untitled|microsoft word|document|\s*)$/i.test(metaTitle) || /\.(dvi|tex|pdf)$/i.test(metaTitle);
  if (!generic) return metaTitle!;
  const known: Record<string, string> = {
    'user_guide.pdf': "User's Guide (PDF)",
    'pw_user_guide.pdf': "PWscf User's Guide (PDF)",
    'ph_user_guide.pdf': "PHonon User's Guide (PDF)",
    'pp_user_guide.pdf': "PostProc User's Guide (PDF)",
    'neb_user_guide.pdf': "PWneb User's Guide (PDF)",
  };
  if (known[file]) return known[file];
  return file
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bqe\b/gi, 'QE')
    .replace(/\bhowto\b/gi, 'HOWTO')
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** "Purpose of dos.x: calculates the Density of States ..." -> first sentence, as written in the source. */
function purposeOf(program: string, intro: string): string | undefined {
  const m = intro.match(/Purpose of [^:]{1,60}:\s*(.+)/i) ?? intro.match(/^Introduction\s+(This (?:program|code)\b.+)/i);
  if (!m) return undefined;
  const t = m[1].replace(/\s+/g, ' ').trim().replace(/^[-*]\s+/, '');
  const end = t.search(/(?<!\b(?:i\.e|e\.g|etc|vs|cf))[.;](\s|$)|\s(?:Structure of the input|Input data format)\b/i);
  let s = (end > 0 ? t.slice(0, end) : t).trim();
  if (s.length > 160) s = s.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  void program;
  return s ? s[0].toUpperCase() + s.slice(1) : undefined;
}

/* =============================================================== xref */
const nodes: XrefNode[] = [];
const edges: XrefEdge[] = [];
const edgeKey = new Set<string>();
const addEdge = (e: XrefEdge) => {
  if (e.source === e.target) return;
  const k = `${e.source}|${e.target}|${e.kind}`;
  const kAny = `${e.source}|${e.target}`;
  if (edgeKey.has(k)) return;
  // a "mention" never duplicates an explicit link
  if (e.kind === 'mention' && (edgeKey.has(`${kAny}|ref`) || edgeKey.has(`${kAny}|see`))) return;
  edgeKey.add(k);
  edges.push(e);
};
const nodeIds = new Set<string>();
for (const i of inputs) {
  for (const v of i.parsed.doc.variables) {
    const id = `${i.id}:${v.id}`;
    nodeIds.add(id);
    nodes.push({ id, label: v.display, docId: i.id, varId: v.id, section: v.sectionTitle });
  }
}
for (const i of inputs) {
  for (const l of i.parsed.links) {
    if (!l.fromVar) continue;
    const source = `${i.id}:${l.fromVar}`;
    let target: string | undefined;
    if (l.localTarget) target = `${i.id}:${l.localTarget}`;
    else if (l.xdoc) {
      const r = resolveX(l.xdoc, l.xfrag);
      if (r?.target) target = `${r.docId}:${r.target}`;
    }
    if (target && nodeIds.has(target)) addEdge({ source, target, kind: l.kind });
  }
}
// remove explicit-duplicate mentions are handled in addEdge; now plain-text mentions
for (const i of inputs) {
  for (const e of buildMentionEdges(i.id, i.parsed.doc.variables, i.parsed.varText)) addEdge(e);
}
// guide mentions: identifiers written in code font that match a variable of a related program
const GUIDE_PROGRAMS: Record<string, string[]> = {
  'pw-user-guide': ['pw'],
  'ph-user-guide': ['ph', 'q2r', 'matdyn', 'dynmat', 'postahc'],
  'pp-user-guide': ['pp', 'projwfc', 'dos', 'bands', 'molecularpdos', 'ppacf', 'band-interpolation'],
  'neb-user-guide': ['neb'],
  'user-guide': [],
};
const guideMentions: Record<string, GuideMention[]> = {};
for (const { cfg, build } of guides) {
  const progs = GUIDE_PROGRAMS[cfg.id] ?? [];
  const nameIndex = new Map<string, string[]>();
  for (const pid of progs) {
    const d = inputs.find((x) => x.id === pid);
    if (!d) continue;
    for (const v of d.parsed.doc.variables) for (const n of v.names) {
      const arr = nameIndex.get(n) ?? [];
      arr.push(`${pid}:${v.id}`);
      nameIndex.set(n, arr);
    }
  }
  const seen = new Set<string>();
  const add = (node: string, chapterId: string, headingId?: string) => {
    const key = `${node}|${chapterId}|${headingId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const ch = build.guide.chapters.find((c) => c.id === chapterId)!;
    const h = ch.headings.find((x) => x.id === headingId);
    (guideMentions[node] ??= []).push({ guideId: cfg.id, chapterId, chapterTitle: `${ch.number} ${ch.title}`, headingId, headingTitle: h?.title });
  };
  for (const t of build.codeTerms) {
    const m = t.term.match(/^([A-Za-z_][A-Za-z0-9_]*)(\s*\(.*\))?(\s*=.*)?$/);
    if (!m) continue;
    const hits = nameIndex.get(m[1]);
    if (hits && hits.length === 1) add(hits[0], t.chapterId, t.headingId);
  }
  for (const l of build.xdocLinks) {
    const r = resolveX(l.xdoc, l.xfrag);
    if (r?.target) add(`${r.docId}:${r.target}`, l.chapterId, l.headingId);
  }
}
const xref: Xref = { nodes, edges, guideMentions };
write('xref.json', xref);
log(`xref: ${nodes.length} nodes, ${edges.length} edges (${edges.filter((e) => e.kind === 'ref').length} ref, ${edges.filter((e) => e.kind === 'see').length} see, ${edges.filter((e) => e.kind === 'mention').length} mention), guide mentions for ${Object.keys(guideMentions).length} variables`);

/* ========================================================== write docs */
const docs: DocSummary[] = [];
const search: SearchDoc[] = [];
for (const i of inputs) {
  const d = i.parsed.doc;
  write(`input/${i.id}.json`, d satisfies InputDoc);
  const toc: TocEntry[] = d.sections.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    level: 1,
    children: s.varIds.map((vid) => ({ id: vid, title: d.variables.find((v) => v.id === vid)!.display, level: 2 })),
  }));
  void toc;
  docs.push({
    id: i.id,
    kind: 'input',
    title: d.program,
    subtitle: 'Input reference',
    package: d.package,
    version: d.version,
    sourceFile: i.file,
    sourceFormat: i.format,
    officialUrl: `${OFFICIAL_BASE}${i.base}.${i.format === 'helpdoc-xml' ? 'xml' : 'html'}`,
    group: fileGroup.get(i.base) ?? 'other',
    counts: { variables: d.variables.length, sections: d.sections.length },
    summary: purposeOf(d.program, i.parsed.introText),
  });
  search.push({
    id: `d:${i.id}`,
    kind: 'program',
    title: d.program,
    names: d.program.replace(/\.x\b.*/, ''),
    subtitle: `Input reference${d.package ? ` · ${d.package}` : ''}`,
    text: i.parsed.introText.slice(0, 4000),
    url: `/input/${i.id}`,
    docId: i.id,
  });
  for (const s of d.sections) {
    if (s.kind === 'intro') continue;
    search.push({
      id: `s:${i.id}:${s.id}`,
      kind: 'section',
      title: s.title,
      names: s.name,
      subtitle: `${d.program} · ${s.kind === 'namelist' ? 'Namelist' : s.kind === 'card' ? 'Card' : 'Section'}`,
      text: (i.parsed.sectionText[s.id] ?? '').slice(0, 6000),
      url: `/input/${i.id}#${s.id}`,
      docId: i.id,
    });
  }
  for (const v of d.variables) {
    search.push({
      id: `v:${i.id}:${v.id}`,
      kind: 'variable',
      title: v.display,
      names: v.names.join(' '),
      subtitle: `${d.program} · ${v.sectionTitle}`,
      text: [i.parsed.varText[v.id] ?? '', v.options.join(' ')].join(' ').slice(0, 8000),
      url: `/input/${i.id}#${v.id}`,
      docId: i.id,
      type: v.type,
    });
  }
}
for (const { cfg, build } of guides) {
  const g: Guide = build.guide;
  write(`guide/${cfg.id}.json`, g);
  const pdf = cfg.pdf ? pdfs.find((p) => p.file === cfg.pdf) : undefined;
  docs.push({
    id: cfg.id,
    kind: 'guide',
    title: g.title,
    subtitle: g.subtitle,
    sourceFile: `${cfg.dir}/`,
    sourceFormat: 'latex2html',
    officialUrl: `${OFFICIAL_BASE}${cfg.dir}/`,
    group: 'guides',
    counts: { chapters: g.chapters.length },
    pdfId: pdf?.id,
  });
  for (const c of build.chunks) {
    const ch = g.chapters.find((x) => x.id === c.chapterId)!;
    search.push({
      id: `g:${cfg.id}:${c.chapterId}:${c.headingId ?? ''}`,
      kind: 'guide',
      title: c.title,
      subtitle: `${g.title} · ${ch.number} ${ch.title}`,
      text: c.text.slice(0, 12000),
      url: `/guide/${cfg.id}/${c.chapterId}${c.headingId ? `#${c.headingId}` : ''}`,
      docId: cfg.id,
    });
  }
}
if (notesSummary) docs.push(notesSummary);
search.push(...notesSearch);
for (const p of pdfs) {
  docs.push({
    id: p.id,
    kind: 'pdf',
    title: p.title,
    sourceFile: `user_guide_PDF/${p.file}`,
    sourceFormat: 'pdf',
    officialUrl: `${OFFICIAL_BASE}user_guide_PDF/${p.file}`,
    group: 'pdf',
    counts: { pages: p.pages },
    htmlId: p.htmlId,
  });
}
search.push(...pdfSearch);
write('pdfs.json', pdfs);
write('search.json', search);
// compact A–Z index of every documented entry
write(
  'variables.json',
  inputs.flatMap((i) =>
    i.parsed.doc.variables
      .filter((v) => !/^Card options/.test(v.display))
      .map((v) => ({ d: i.id, v: v.id, l: v.display, t: v.type ?? '', s: v.sectionTitle, m: v.summary, df: v.default ?? '' })),
  ),
);

// misc files in the source
for (const f of files) {
  const p = join(SRC, f);
  if (statSync(p).isDirectory()) continue;
  if (/^INPUT_/.test(f) || f === 'release-notes') continue;
  if (f === 'index.html') excluded.push({ file: f, reason: 'web-server directory listing' });
  else if (f === 'quantum_espresso.png') excluded.push({ file: f, reason: 'logo image (not documentation content)' });
  else excluded.push({ file: f, reason: 'not documentation content' });
}
if (existsSync(join(pdfDir, 'index.html'))) excluded.push({ file: 'user_guide_PDF/index.html', reason: 'web-server directory listing' });
for (const i of inputs) {
  for (const ext of ['txt', 'xml']) {
    const f = `${i.base}.${ext}`;
    if (existsSync(join(SRC, f)) && f !== i.file && statSync(join(SRC, f)).size > 500)
      excluded.push({ file: f, reason: `same content as ${i.file} in another format (XML used for cross-checking)` });
  }
}

const groups: DocGroup[] = [
  { id: 'guides', title: "User's guides", docIds: docs.filter((d) => d.kind === 'guide').map((d) => d.id) },
  ...GROUPS.map((g) => ({ id: g.id, title: g.title, description: g.description, docIds: g.files.map((f) => docIdFor(f)).filter((id) => docs.some((d) => d.id === id)) })),
  { id: 'notes', title: 'Release notes', docIds: notesSummary ? ['release-notes'] : [] },
  { id: 'pdf', title: 'PDF documents', docIds: docs.filter((d) => d.kind === 'pdf').map((d) => d.id) },
];
const versions = inputs.map((i) => i.parsed.doc.version).filter(Boolean) as string[];
const qeVersion = [...versions].sort((a, b) => versions.filter((v) => v === b).length - versions.filter((v) => v === a).length)[0] ?? '';

const manifest: Manifest = {
  generatedAt: new Date().toISOString(),
  qeVersion,
  docs,
  groups,
  stats: {
    programs: inputs.length,
    variables: inputs.reduce((a, i) => a + i.parsed.doc.variables.length, 0),
    guideChapters: guides.reduce((a, g) => a + g.build.guide.chapters.length, 0),
    pdfs: pdfs.length,
    releaseVersions,
    xrefEdges: edges.length,
  },
  excluded,
};
write('manifest.json', manifest);
writeFileSync(join(ROOT, 'build-report.json'), JSON.stringify({ source: SRC, stats: manifest.stats, warnings, excluded }, null, 2));
log('stats', manifest.stats);
log(`warnings: ${warnings.length} (see build-report.json)`);
