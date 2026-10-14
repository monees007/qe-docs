/**
 * Parser for the LaTeX2HTML user guides (user_guide/, pw_user_guide/, ...).
 *
 * Each guide is split by latex2html into one HTML file per (sub)section.
 * We regroup them into chapters (top-level sections), drop the generated
 * navigation panels / child-link lists / "Contents" and "About this
 * document" pages, inline footnotes, render the LaTeX math (kept by
 * latex2html in the image ALT text) with KaTeX, and rewrite links.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import katex from 'katex';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Guide, GuideChapter, GuideHeading } from '../../src/types/docs.ts';
import { load, squash, slugify, sanitize, decorateExternalLinks, escapeHtml, IdRegistry, blockText } from './util.ts';

export interface GuideBuild {
  guide: Guide;
  /** chapter id -> plain-text chunks per heading, for search */
  chunks: { chapterId: string; headingId?: string; title: string; text: string }[];
  /** code-formatted identifiers per chapter/heading, for cross-references */
  codeTerms: { chapterId: string; headingId?: string; term: string }[];
  /** cross-document links found (to INPUT_* files) */
  xdocLinks: { chapterId: string; headingId?: string; xdoc: string; xfrag?: string }[];
  images: string[];
  warnings: string[];
  skipped: string[];
  math: { rendered: number; fallback: number };
}

const NAV_ICONS = /^(next|up|prev|contents)(_g)?\.png$/;

interface NodePage {
  file: string;
  title: string;
  body: string;
}

function readNode(dir: string, file: string): NodePage {
  const html = readFileSync(join(dir, file), 'utf8');
  const title = squash((html.match(/<TITLE>([\s\S]*?)<\/TITLE>/i)?.[1] ?? '').replace(/<[^>]+>/g, ''));
  let body = html;
  const endNav = body.indexOf('<!--End of Navigation Panel-->');
  if (endNav >= 0) body = body.slice(endNav + '<!--End of Navigation Panel-->'.length);
  const bottomNav = body.indexOf('<!--Navigation Panel-->');
  if (bottomNav >= 0) body = body.slice(0, bottomNav);
  body = body.replace(/<!--Table of Child-Links-->[\s\S]*?<!--End of Table of Child-Links-->/gi, '');
  body = body.replace(/<\/?(BODY|HTML)[^>]*>/gi, '').replace(/<ADDRESS>[\s\S]*?<\/ADDRESS>/gi, '');
  return { file, title, body };
}

/** Order of node files as listed in the guide's table of contents. */
function nodeOrder(dir: string): string[] {
  const idx = readFileSync(join(dir, 'index.html'), 'utf8');
  const seen: string[] = [];
  for (const m of idx.matchAll(/HREF="(node\d+\.html)(#[^"]*)?"/gi)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

function guideTitle(dir: string): string {
  const idx = readFileSync(join(dir, 'index.html'), 'utf8');
  const h1 = idx.match(/<H1[^>]*>([\s\S]*?)<\/H1>/i)?.[1] ?? '';
  const t = h1
    .replace(/<IMG[^>]*>/gi, '')
    .replace(/<BR>/gi, ' — ')
    .replace(/Q<SMALL>UANTUM\s*<\/SMALL>\s*ESPRESSO/gi, 'Quantum ESPRESSO')
    .replace(/<[^>]+>/g, '');
  return squash(t).replace(/^—\s*|\s*—$/g, '').replace(/\s*—\s*—\s*/g, ' — ');
}

function renderMath(alt: string): string | null {
  let tex = alt.trim();
  if (/^\\includegraphics/.test(tex)) return null;
  const m = tex.match(/^\$+([\s\S]*?)\$+$/);
  if (!m) return null;
  tex = m[1];
  try {
    return katex.renderToString(tex, { throwOnError: true, output: 'htmlAndMathml', strict: 'ignore', macros: { '\\mbox': '\\text{#1}' } });
  } catch {
    return null;
  }
}

/** Convert LaTeX ``quotes'' left verbatim by latex2html (outside code). */
function fixQuotes($: CheerioAPI, root: Cheerio<AnyNode>) {
  root.find('*').addBack().contents().each((_, n) => {
    if (n.type !== 'text') return;
    if ($(n).closest('pre, code, tt, kbd').length) return;
    const t = n as unknown as { data: string };
    if (t.data.includes('``')) t.data = t.data.replace(/``([\s\S]*?)''/g, '“$1”');
  });
}

export function parseGuide(sourceDir: string, guideDir: string, guideId: string, xdocRe: RegExp): GuideBuild {
  const dir = join(sourceDir, guideDir);
  const warnings: string[] = [];
  const skipped: string[] = [];
  const images = new Set<string>();
  const math = { rendered: 0, fallback: 0 };
  const order = nodeOrder(dir);
  const pages = order.map((f) => readNode(dir, f));

  // footnotes
  const footnotes = new Map<string, string>();
  if (existsSync(join(dir, 'footnode.html'))) {
    const fh = load(readFileSync(join(dir, 'footnode.html'), 'utf8'));
    fh('dt').each((_, dt) => {
      const id = fh(dt).find('a[id]').attr('id') || fh(dt).find('a[name]').attr('name');
      const dd = fh(dt).next('dd');
      if (id) footnotes.set(id, (dd.html() || '').replace(/<a[^>]*href="[^"]*#tex2html[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '').trim());
    });
  }

  // group nodes into chapters
  type Ch = { number: string; title: string; pages: NodePage[] };
  const chapters: Ch[] = [];
  for (const p of pages) {
    if (/^(Contents|About this document\b.*)$/i.test(p.title)) {
      skipped.push(`${guideDir}/${p.file} ("${p.title}")`);
      continue;
    }
    // "3 Using PWscf", "A. Appendix: ..." start a chapter; "3.1 ...", "A.1 ..." continue it
    const top = p.title.match(/^(\d+|[A-Z])\.?\s+(.*)$/);
    const sub = /^(\d+|[A-Z])\.\d+/.test(p.title);
    if (top && !sub) chapters.push({ number: top[1], title: top[2], pages: [p] });
    else if (sub && chapters.length) chapters[chapters.length - 1].pages.push(p);
    else {
      // unnumbered page: keep it as its own chapter rather than dropping content
      warnings.push(`${guideDir}/${p.file}: unnumbered page "${p.title}" kept as a chapter`);
      chapters.push({ number: '', title: p.title, pages: [p] });
    }
  }

  // first pass: assign chapter ids and map node file / anchors -> (chapter, id)
  const chapterIds = new IdRegistry();
  const nodeToChapter = new Map<string, string>();
  const anchorMap = new Map<string, { chapter: string; id: string }>();
  const chapterMeta = chapters.map((c) => {
    const id = chapterIds.claim(c.number ? `${c.number.toLowerCase()}-${slugify(c.title)}` : slugify(c.title));
    c.pages.forEach((p) => nodeToChapter.set(p.file, id));
    return { ...c, id };
  });

  const built: GuideChapter[] = [];
  const chunks: GuideBuild['chunks'] = [];
  const codeTerms: GuideBuild['codeTerms'] = [];
  const xdocLinks: GuideBuild['xdocLinks'] = [];

  // pass 1: parse every chapter, collect heading ids
  const chapterHead = new Map<string, string>();
  const parsed = chapterMeta.map((c) => {
    const $ = load(`<div id="__ch">${c.pages.map((p) => `<div data-node="${p.file}">${p.body}</div>`).join('\n')}</div>`);
    const root = $('#__ch');
    const ids = new IdRegistry();
    const headings: GuideHeading[] = [];
    root.find('h1, h2, h3, h4, h5').each((_, h) => {
      const el = $(h);
      const anchors = el.find('a[id], a[name]').toArray().map((a) => $(a).attr('id') || $(a).attr('name')!).filter((x) => x && !/^tex2html\d+$/.test(x));
      const text = squash(el.text());
      const level = Number(h.tagName[1]);
      const id = ids.claim(slugify(text.replace(/^(\d+(\.\d+)*)\s+/, 's$1-').replace(/\./g, '-')));
      el.attr('id', id);
      el.find('a[id], a[name]').each((_, a) => {
        if (!$(a).attr('href')) $(a).replaceWith($(a).contents());
      });
      for (const an of anchors) anchorMap.set(an, { chapter: c.id, id });
      headings.push({ id, title: text, level });
    });
    // other anchors (\label targets)
    root.find('a[id], a[name]').each((_, a) => {
      const el = $(a);
      const an = el.attr('id') || el.attr('name')!;
      if (el.attr('href')) return;
      if (/^tex2html\d+$/.test(an)) {
        el.replaceWith(el.contents());
        return;
      }
      const id = ids.claim(an.replace(/[^A-Za-z0-9_:-]/g, '-'));
      anchorMap.set(an, { chapter: c.id, id });
      el.replaceWith(`<span id="${escapeHtml(id)}">${el.html() || ''}</span>`);
    });
    chapterHead.set(c.id, root.find('h1, h2').first().attr('id') ?? '');
    return { c, $, root, headings };
  });

  // pass 2: links, math, cleanup
  for (const { c, $, root, headings } of parsed) {
    const usedFootnotes: string[] = [];
    const mathOut: string[] = [];
    root.find('a[href]').each((_, a) => {
      const el = $(a);
      let href = el.attr('href')!.trim();
      el.removeAttr('id').removeAttr('name');
      const fm = href.match(/^footnode\.html#(.+)$/);
      if (fm) {
        const fid = fm[1];
        if (!usedFootnotes.includes(fid)) usedFootnotes.push(fid);
        const n = usedFootnotes.indexOf(fid) + 1;
        el.replaceWith(`<sup class="fnref"><a href="#fn-${escapeHtml(fid)}" id="fnref-${escapeHtml(fid)}" aria-label="Footnote ${n}">${n}</a></sup>`);
        return;
      }
      const nm = href.match(/^(node\d+\.html)?(?:#(.+))?$/);
      if (nm && (nm[1] || nm[2])) {
        const node = nm[1];
        const frag = nm[2];
        let target: { chapter: string; id?: string } | undefined;
        if (frag && anchorMap.has(frag)) target = anchorMap.get(frag);
        else if (node && nodeToChapter.has(node)) {
          const ch = nodeToChapter.get(node)!;
          // first heading of that node
          const nodeHead = load(readNode(dir, node).body)('h1 a[id], h2 a[id], h3 a[id], h4 a[id]').first().attr('id');
          target = nodeHead && anchorMap.get(nodeHead) ? anchorMap.get(nodeHead) : { chapter: ch };
        }
        if (target) {
          // the chapter's own heading becomes the page title, so link to the page itself
          const frag = target.id && target.id !== chapterHead.get(target.chapter) ? `#${target.id}` : '';
          const url = `/guide/${guideId}/${target.chapter}${frag}`;
          el.attr('href', url).attr('data-internal', '1');
          return;
        }
        if (node) {
          skipped.push(`link to skipped page ${node} in ${c.id}`);
          el.replaceWith(el.contents());
          return;
        }
        warnings.push(`${guideDir}: unresolved anchor #${frag}`);
        return;
      }
      if (/^user_guide\.html$/i.test(href)) {
        el.attr('href', `/guide/${guideId}`).attr('data-internal', '1');
        return;
      }
      const xm = href.match(xdocRe);
      if (xm) {
        el.attr('data-xdoc', xm[1]);
        if (xm[2]) el.attr('data-xfrag', xm[2]);
        xdocLinks.push({ chapterId: c.id, xdoc: xm[1], xfrag: xm[2] });
        return;
      }
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(href)) {
        warnings.push(`${guideDir}: scheme-less link "${href}" rewritten to https://${href}`);
        href = `https://${href}`;
        el.attr('href', href);
      }
    });

    root.find('img').each((_, img) => {
      const el = $(img);
      const src = el.attr('src') || '';
      const file = src.replace(/^\.\//, '');
      if (NAV_ICONS.test(file)) {
        el.remove();
        return;
      }
      const alt = el.attr('alt') || '';
      const rendered = renderMath(alt);
      if (rendered) {
        math.rendered++;
        // KaTeX markup (MathML + inline styles) is inserted after sanitising
        mathOut.push(rendered);
        el.replaceWith(`<span class="qe-math" data-math="${mathOut.length - 1}"></span>`);
        return;
      }
      if (/includegraphics.*quantum_espresso|^Image quantum_espresso/i.test(alt) || file === 'quantum_espresso.png') {
        el.remove(); // decorative logo on title pages
        return;
      }
      math.fallback++;
      images.add(`${guideDir}/${file}`);
      el.attr('src', `/docs/${guideDir}/${file}`);
      el.attr('loading', 'lazy');
      if (alt) el.attr('alt', alt);
      warnings.push(`${guideDir}: image ${file} kept as image (alt: ${alt.slice(0, 60)})`);
    });

    // tables: latex2html uses TABLE for real tabular data
    root.find('table').each((_, t) => {
      $(t).attr('class', 'qe-table');
    });
    root.find('pre').each((_, p) => {
      $(p).attr('class', 'qe-pre');
    });
    fixQuotes($, root);

    // code identifiers mentioned per heading (for cross references)
    let currentHeading: string | undefined;
    root.find('h1, h2, h3, h4, h5, code, tt').each((_, e) => {
      const tag = (e as Element).tagName.toLowerCase();
      if (/^h\d$/.test(tag)) {
        currentHeading = $(e).attr('id');
        return;
      }
      const term = squash($(e).text());
      if (term && term.length <= 80) codeTerms.push({ chapterId: c.id, headingId: currentHeading, term });
    });

    // footnotes at the end of the chapter
    let fnHtml = '';
    if (usedFootnotes.length) {
      fnHtml =
        `<section class="qe-footnotes" aria-label="Footnotes"><h2 id="footnotes">Footnotes</h2><ol>` +
        usedFootnotes
          .map((f) => `<li id="fn-${escapeHtml(f)}">${footnotes.get(f) ?? ''} <a href="#fnref-${escapeHtml(f)}" class="fnback" aria-label="Back to text">↩</a></li>`)
          .join('') +
        `</ol></section>`;
      usedFootnotes.forEach((f) => {
        if (!footnotes.has(f)) warnings.push(`${guideDir}: footnote ${f} not found`);
      });
    }
    if (fnHtml) root.append(fnHtml);

    // unwrap node wrappers, drop the chapter's own top heading (shown as page title)
    root.find('div[data-node]').each((_, d) => {
      $(d).replaceWith($(d).contents());
    });
    const firstH = root.find('h1, h2').first();
    const chapterHeadingId = firstH.attr('id');
    firstH.remove();
    sanitize($, root);
    decorateExternalLinks($, root);
    root.find('span.qe-math[data-math]').each((_, m) => {
      const i = Number($(m).attr('data-math'));
      $(m).removeAttr('data-math').html(mathOut[i]);
    });
    // empty paragraphs latex2html leaves behind
    root.find('p').each((_, p) => {
      if (!$(p).text().trim() && !$(p).find('img, .qe-math, br').length) $(p).remove();
    });
    // collapse runs of <br> (latex2html spacing artefacts)
    root.find('br').each((_, br) => {
      let prev = br.prev;
      while (prev && prev.type === 'text' && !(prev as unknown as { data: string }).data.trim()) prev = prev.prev;
      if (prev && prev.type === 'tag' && (prev as Element).tagName === 'br') $(br).remove();
    });

    // search chunks: split by headings
    const chunkList: { headingId?: string; title: string; parts: string[] }[] = [{ headingId: undefined, title: `${c.number} ${c.title}`, parts: [] }];
    root.contents().each((_, n) => {
      const e = $(n);
      if (n.type === 'tag' && /^h[2-5]$/i.test((n as Element).tagName)) {
        chunkList.push({ headingId: e.attr('id'), title: squash(e.text()), parts: [] });
      } else chunkList[chunkList.length - 1].parts.push(n.type === 'tag' ? blockText($.html(e)) : e.text());
    });
    for (const ch of chunkList) {
      const text = squash(ch.parts.join(' '));
      if (text || ch.headingId) chunks.push({ chapterId: c.id, headingId: ch.headingId, title: ch.title, text });
    }

    built.push({
      id: c.id,
      number: c.number,
      title: c.title,
      html: (root.html() || '').replace(/\n{3,}/g, '\n\n').trim(),
      headings: headings.filter((h) => h.id !== chapterHeadingId),
    });
  }

  const full = guideTitle(dir);
  const [title, ...rest] = full.split(' — ');
  return {
    guide: { id: guideId, title: title.trim(), subtitle: rest.join(' — ').trim() || undefined, chapters: built },
    chunks,
    codeTerms,
    xdocLinks,
    images: [...images],
    warnings,
    skipped,
    math,
  };
}
