/**
 * Completeness & integrity checks for the generated data (npm run verify:data).
 *
 *  1. Word-level comparison of every source document against the rendered
 *     output: every word of the source must still be present (multiset),
 *     apart from navigation chrome the pipeline removes on purpose.
 *  2. For programs published in both HTML and XML, every name declared in the
 *     XML must exist as a variable/anchor in the rendered document.
 *  3. Every internal link in the output resolves to an existing page + id.
 *  4. Release notes: every non-blank source line is present in the output.
 * Exits with code 1 on failure.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest, InputDoc, Guide, ReleaseNotes } from '../../src/types/docs.ts';
import { load, squash, blockText } from './util.ts';
import { xmlInventory } from './helpdocXml.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const SRC = resolve(args.includes('--source') ? args[args.indexOf('--source') + 1] : join(ROOT, 'source/qe-Doc'));
const DATA = join(ROOT, 'public/data');
const json = <T>(p: string): T => JSON.parse(readFileSync(join(DATA, p), 'utf8')) as T;

let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log('  ✗', m);
};
const ok = (m: string) => console.log('  ✓', m);

function words(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/``|''/g, '"')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)) {
    if (!w) continue;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}
function missing(src: Map<string, number>, out: Map<string, number>, allowed: Set<string>): [string, number][] {
  const miss: [string, number][] = [];
  for (const [w, n] of src) {
    const have = out.get(w) ?? 0;
    if (have < n && !allowed.has(w)) miss.push([w, n - have]);
  }
  return miss;
}

const manifest = json<Manifest>('manifest.json');
const ids = new Set(manifest.docs.map((d) => d.id));

/* ---------------------------------------------------------- 1. inputs */
console.log('\n1. Input references: source words preserved');
const CHROME = new Set(['back', 'to', 'top', 'table', 'of', 'contents', 'input', 'file', 'description', 'program', 'version', 'default', 'status', 'see', 'syntax', 'items', 'namelist', 'card', 's', 'options', 'line', 'type']);
for (const d of manifest.docs.filter((x) => x.kind === 'input')) {
  const doc = json<InputDoc>(`input/${d.id}.json`);
  const srcPath = join(SRC, d.sourceFile);
  let srcText: string;
  if (d.sourceFormat === 'helpdoc-html') {
    const $ = load(readFileSync(srcPath, 'utf8'));
    const main = $('body > table').first().find('> tbody > tr').eq(1).children('td').first();
    main.children('blockquote').first().remove(); // TOC
    srcText = blockText(main.html() || '');
  } else {
    const $ = load(readFileSync(srcPath, 'latin1'), true);
    $('toc').remove();
    $('opt').each((_, o) => {
      $(o).prepend(`${$(o).attr('val')} `);
    });
    $('var, namelist').each((_, v) => {
      $(v).prepend(`${$(v).attr('name')} ${$(v).attr('type') ?? ''} `);
    });
    srcText = blockText($('input_description').html() || '');
  }
  const outText = blockText(doc.html);
  const miss = missing(words(srcText), words(outText), CHROME);
  if (miss.length) fail(`${d.id}: ${miss.length} word(s) missing: ${miss.slice(0, 12).map(([w, n]) => `${w}×${n}`).join(', ')}`);
  else ok(`${d.id}: all ${[...words(srcText).values()].reduce((a, b) => a + b, 0)} source words present`);
}

/* ------------------------------------------------- 2. XML inventories */
console.log('\n2. XML name inventory vs rendered HTML (programs published in both formats)');
for (const d of manifest.docs.filter((x) => x.kind === 'input' && x.sourceFormat === 'helpdoc-html')) {
  const xmlPath = join(SRC, d.sourceFile.replace(/\.html$/, '.xml'));
  if (!existsSync(xmlPath) || statSync(xmlPath).size < 500) continue;
  const inv = xmlInventory(readFileSync(xmlPath, 'latin1'));
  if (!inv) continue;
  const doc = json<InputDoc>(`input/${d.id}.json`);
  const known = new Set<string>([...Object.keys(doc.aliases), ...doc.variables.flatMap((v) => [v.id, ...v.names])]);
  const lower = new Set([...known].map((k) => k.toLowerCase()));
  // XML column names carry indices, e.g. "u_val(1)", "label(1)-manifold(1)", "v_val(N,M)"
  const parts = (n: string) => n.replace(/\([^)]*\)/g, '').split('-').map((x) => x.trim()).filter(Boolean);
  const absent = [...inv.names].filter((n) => !known.has(n) && !lower.has(n.toLowerCase()) && !parts(n).every((p) => known.has(p) || lower.has(p.toLowerCase())));
  const nlMissing = inv.namelists.filter((n) => !doc.sections.some((s) => s.name === n));
  const cardMissing = inv.cards.filter((n) => !doc.sections.some((s) => s.name === n) && !known.has(n));
  const flatOut = blockText(doc.html).replace(/\s+/g, '');
  const synAbsent = [...inv.syntaxOnly].filter((n) => !flatOut.includes(n.replace(/\s+/g, '')) && !known.has(n));
  absent.push(...synAbsent.map((n) => `${n} (syntax)`));
  if (absent.length || nlMissing.length || cardMissing.length)
    fail(`${d.id}: XML names not found: ${[...absent, ...nlMissing.map((n) => `&${n}`), ...cardMissing.map((c) => `card ${c}`)].join(', ')}`);
  else ok(`${d.id}: ${inv.names.size} names, ${inv.namelists.length} namelists, ${inv.cards.length} cards matched`);
}

/* --------------------------------------------------------- 3. guides */
console.log('\n3. User guides: source words preserved');
const GUIDE_CHROME = new Set(['next', 'up', 'previous', 'contents', 'about', 'this', 'document']);
for (const d of manifest.docs.filter((x) => x.kind === 'guide')) {
  const g = json<Guide>(`guide/${d.id}.json`);
  const dir = join(SRC, d.sourceFile);
  const skippedFiles = new Set(manifest.excluded.filter((e) => e.file.startsWith(d.sourceFile)).map((e) => e.file.split(' ')[0].replace(d.sourceFile, '')));
  let srcText = '';
  for (const f of readdirSync(dir).filter((f) => /^node\d+\.html$/.test(f))) {
    if (skippedFiles.has(f)) continue;
    let h = readFileSync(join(dir, f), 'utf8');
    const a = h.indexOf('<!--End of Navigation Panel-->');
    if (a >= 0) h = h.slice(a);
    const b = h.indexOf('<!--Navigation Panel-->');
    if (b >= 0) h = h.slice(0, b);
    h = h.replace(/<!--Table of Child-Links-->[\s\S]*?<!--End of Table of Child-Links-->/gi, '');
    const $ = load(h);
    $('img').remove(); // math is re-rendered (compared separately)
    $('a[href^="footnode.html"]').remove(); // footnote markers are renumbered
    srcText += ' ' + blockText($.html());
  }
  const outHtml = g.chapters.map((c) => `<h1>${c.number} ${c.title}</h1>${c.html}`).join('\n');
  const $o = load(outHtml);
  $o('.qe-math').remove();
  $o('.fnref, .qe-footnotes').remove();
  let fnText = '';
  if (existsSync(join(dir, 'footnode.html'))) {
    const f = load(readFileSync(join(dir, 'footnode.html'), 'utf8'));
    fnText = f('dd').text();
  }
  const outWords = words(blockText($o.html()) + ' ' + fnText);
  const miss = missing(words(srcText), outWords, GUIDE_CHROME);
  if (miss.length) fail(`${d.id}: ${miss.length} word(s) missing: ${miss.slice(0, 12).map(([w, n]) => `${w}×${n}`).join(', ')}`);
  else ok(`${d.id}: ${g.chapters.length} chapters, all source words present`);
  // math count
  // every formula of the source (TeX kept by latex2html in ALT) must be present as KaTeX annotation or image alt
  const norm = (t: string) => t.replace(/^\$+|\$+$/g, '').replace(/\s+/g, '');
  const srcTex: string[] = [];
  for (const f of readdirSync(dir).filter((f) => /^node\d+\.html$/.test(f) && !skippedFiles.has(f))) {
    let h = readFileSync(join(dir, f), 'utf8');
    const a = h.indexOf('<!--End of Navigation Panel-->');
    if (a >= 0) h = h.slice(a);
    const b = h.indexOf('<!--Navigation Panel-->');
    if (b >= 0) h = h.slice(0, b);
    h = h.replace(/<!--Table of Child-Links-->[\s\S]*?<!--End of Table of Child-Links-->/gi, '');
    const $s = load(h);
    $s('img').each((_, i) => {
      const alt = $s(i).attr('alt') || '';
      if (alt.startsWith('$')) srcTex.push(norm(alt));
    });
  }
  const $m = load(outHtml);
  const outTex = [
    ...$m('annotation[encoding="application/x-tex"]').toArray().map((e) => norm($m(e).text())),
    ...$m('img').toArray().map((e) => norm($m(e).attr('alt') || '')),
  ];
  const pool = new Map<string, number>();
  outTex.forEach((t) => pool.set(t, (pool.get(t) ?? 0) + 1));
  const lostTex = srcTex.filter((t) => {
    const n = pool.get(t) ?? 0;
    if (n > 0) {
      pool.set(t, n - 1);
      return false;
    }
    return true;
  });
  if (lostTex.length) fail(`${d.id}: ${lostTex.length} of ${srcTex.length} formulas missing: ${lostTex.slice(0, 3).join(' | ')}`);
  else if (srcTex.length) ok(`${d.id}: all ${srcTex.length} formulas present`);
}

/* -------------------------------------------------- 4. release notes */
console.log('\n4. Release notes');
{
  const notes = json<ReleaseNotes>('release-notes.json');
  const src = readFileSync(join(SRC, 'release-notes'), 'utf8').split('\n').map((l) => squash(l)).filter(Boolean);
  const out = new Set<string>();
  for (const v of notes.versions)
    for (const s of v.sections) {
      out.add(squash(s.heading));
      (s.intro ?? '').split('\n').forEach((l) => out.add(squash(l)));
      s.items.forEach((i) => i.split('\n').forEach((l) => out.add(squash(l))));
    }
  const lost = src.filter((l) => !out.has(l) && !out.has(l.replace(/\s*:\s*$/, '')));
  if (lost.length) fail(`${lost.length} line(s) not found, e.g. ${lost.slice(0, 3).join(' | ')}`);
  else ok(`${src.length} non-blank lines, ${notes.versions.length} versions, all present`);
}

/* ------------------------------------------------------------ 5. links */
console.log('\n5. Internal links resolve');
{
  const pageIds = new Map<string, Set<string>>();
  for (const d of manifest.docs.filter((x) => x.kind === 'input')) {
    const doc = json<InputDoc>(`input/${d.id}.json`);
    const $ = load(doc.html);
    pageIds.set(`/input/${d.id}`, new Set($('[id]').toArray().map((e) => $(e).attr('id')!)));
  }
  const guides = manifest.docs.filter((x) => x.kind === 'guide').map((d) => json<Guide>(`guide/${d.id}.json`));
  for (const g of guides)
    for (const c of g.chapters) {
      const $ = load(c.html);
      pageIds.set(`/guide/${g.id}/${c.id}`, new Set($('[id]').toArray().map((e) => $(e).attr('id')!)));
    }
  let checked = 0;
  const bad: string[] = [];
  const check = (from: string, html: string) => {
    const $ = load(html);
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href')!;
      if (/^(https?:|mailto:)/.test(href) || href.startsWith('/search?')) return;
      checked++;
      let [path, frag] = href.split('#');
      if (!path) path = from;
      if (path === `/guide/${path.split('/')[2]}` && ids.has(path.split('/')[2])) return;
      const set = pageIds.get(path);
      if (!set) return void bad.push(`${from}: ${href} (unknown page)`);
      if (frag && !set.has(decodeURIComponent(frag))) bad.push(`${from}: ${href} (missing id)`);
    });
  };
  for (const d of manifest.docs.filter((x) => x.kind === 'input')) check(`/input/${d.id}`, json<InputDoc>(`input/${d.id}.json`).html);
  for (const g of guides) for (const c of g.chapters) check(`/guide/${g.id}/${c.id}`, c.html);
  if (bad.length) fail(`${bad.length} broken of ${checked}: ${bad.slice(0, 8).join('; ')}`);
  else ok(`${checked} internal links resolve`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
