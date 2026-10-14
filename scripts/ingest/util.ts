import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

export const OFFICIAL_BASE = 'https://www.quantum-espresso.org/Doc/';

/* ------------------------------------------------------------ text utils */

const ENTITY_MAP: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITY_MAP[e.toLowerCase()] ?? m;
  });
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''));
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' ')
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** First sentence (or first `max` chars) of a plain-text description. */
const ABBREV = /(?:\b(?:i\.e|e\.g|etc|vs|cf|Ref|Refs|Eq|Eqs|Fig|Sec|No|approx|resp|et al|Phys|Rev|Lett|Chem|Comput|Mater|Condens|Matter|J)|\b[A-Z])\.$/;
export function firstSentence(text: string, max = 220): string {
  const t = squash(text);
  if (!t) return '';
  let end = -1;
  const re = /[.!?](?=\s+[A-Z(]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const upto = t.slice(0, m.index + 1);
    if (upto.length < 20) continue;
    if (ABBREV.test(upto)) continue;
    end = m.index + 1;
    break;
  }
  let s = end > 0 ? t.slice(0, end) : t;
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return s;
}

/** Title-case ALL-CAPS headings without touching identifiers (words with _ or digits). */
export function tidyHeading(s: string): string {
  const t = squash(s);
  if (t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return t;
  return t
    .split(' ')
    .map((w, i) => {
      if (/[_\d&]/.test(w) || w.length <= 1) return w;
      const lower = w.toLowerCase();
      if (i > 0 && ['of', 'for', 'and', 'the', 'in', 'on', 'to', 'a', 'an', 'with'].includes(lower)) return lower;
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export class IdRegistry {
  private used = new Set<string>();
  constructor(reserved: string[] = []) {
    reserved.forEach((r) => this.used.add(r));
  }
  /** Returns `wanted` if free, else wanted-2, wanted-3 ... */
  claim(wanted: string): string {
    let id = wanted.replace(/\s+/g, '_') || 'x';
    if (!this.used.has(id)) {
      this.used.add(id);
      return id;
    }
    let i = 2;
    while (this.used.has(`${id}-${i}`)) i++;
    id = `${id}-${i}`;
    this.used.add(id);
    return id;
  }
  has(id: string) {
    return this.used.has(id);
  }
}

/* ----------------------------------------------------- preformatted flow */

const INLINE_TAGS = ['a', 'b', 'i', 'tt', 'em', 'strong', 'code', 'span', 'sub', 'sup', 'font', 'small', 'big', 'u'];

function balanced(html: string): boolean {
  for (const t of INLINE_TAGS) {
    const open = (html.match(new RegExp(`<${t}(\\s[^>]*)?>`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${t}\\s*>`, 'gi')) || []).length;
    if (open !== close) return false;
  }
  return true;
}

const LISTISH =
  /^([-*•+=>|#!&/~]|\d+\s*[.):]\s|\d+\s*[-=]|\(?[a-z0-9]{1,3}\)\s|'[^']*'\s*[:=]|[A-Za-z_][\w()%,]*\s*=[^=])/;

/**
 * Decide whether a block of lines (no blank lines inside) can be shown as a
 * reflowing paragraph. Conservative: anything that looks aligned, indented,
 * list-like or code-like stays preformatted.
 */
export function isProse(textLines: string[]): boolean {
  const indents = textLines.map((l) => l.match(/^ */)![0].length);
  const minIndent = Math.min(...indents);
  if (indents.some((i) => i !== minIndent)) return false;
  for (const raw of textLines) {
    const l = raw.trim();
    if (!l) continue;
    if (LISTISH.test(l)) return false;
    if (/\S {3,}\S/.test(l)) return false;
    if (/\t/.test(raw)) return false;
    if (/(={4,}|-{4,}|_{4,}|\*{4,})/.test(l)) return false;
    if (/[{}]\s*$/.test(l) && textLines.length > 1) return false;
  }
  if (textLines.length > 1) {
    const avg = textLines.reduce((a, l) => a + l.trim().length, 0) / textLines.length;
    if (avg < 22) return false;
  }
  return true;
}

function dedent(lines: string[]): string[] {
  const ind = lines.filter((l) => l.trim()).map((l) => stripTags(l).match(/^ */)![0].length);
  const min = ind.length ? Math.min(...ind) : 0;
  if (!min) return lines;
  return lines.map((l) => {
    // remove `min` leading spaces from the raw html line (tags never start lines with spaces before them)
    let n = 0;
    let i = 0;
    while (i < l.length && n < min && l[i] === ' ') {
      i++;
      n++;
    }
    return l.slice(i);
  });
}

/**
 * Join the lines of a prose block. Line breaks become "\n" (re-flowed by CSS),
 * except where a line has no closing punctuation and the next one starts with a
 * capital letter: such breaks usually separate statements ("...and potential /
 * For norm-conserving ..."), so they are kept as <br>.
 */
export function joinProse(lines: string[]): string {
  const clean = lines.map((l) => l.replace(/^ +/, ''));
  let out = clean[0] ?? '';
  for (let i = 1; i < clean.length; i++) {
    const prev = stripTags(clean[i - 1]).trimEnd();
    const next = stripTags(clean[i]).trimStart();
    const hardBreak = /[A-Za-z0-9]$/.test(prev) && /^[A-Z]/.test(next) && !/^[A-Z]\.?$/.test(next.split(/\s/)[0]);
    out += (hardBreak ? '<br>' : '\n') + clean[i];
  }
  return out;
}

/**
 * Convert the inner HTML of a helpdoc/latex2html <pre> into blocks:
 * prose paragraphs keep their original line breaks as "\n" characters
 * (CSS decides whether they reflow), other blocks stay <pre>.
 * The text itself is never modified apart from removing common indentation
 * of preformatted blocks.
 */
export function flowPre(innerHtml: string): string {
  const src = innerHtml.replace(/\r\n?/g, '\n').replace(/\t/g, '        ');
  const lines = src.split('\n');
  while (lines.length && !stripTags(lines[0]).trim()) lines.shift();
  while (lines.length && !stripTags(lines[lines.length - 1]).trim()) lines.pop();
  if (!lines.length) return '';
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (!stripTags(l).trim()) {
      if (cur.length) blocks.push(cur), (cur = []);
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);

  const out: string[] = [];
  for (const b of blocks) {
    const html = b.join('\n');
    if (!balanced(html)) {
      // a tag spans a blank line: keep the whole thing verbatim
      return `<pre class="qe-pre">${dedent(lines).join('\n')}</pre>`;
    }
    const text = b.map((l) => stripTags(l));
    if (isProse(text)) out.push(`<p class="qe-flow">${joinProse(b)}</p>`);
    else out.push(`<pre class="qe-pre">${dedent(b).join('\n')}</pre>`);
  }
  // merge consecutive pre blocks separated by a blank line into one pre to keep tables intact
  const merged: string[] = [];
  for (const o of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.startsWith('<pre') && o.startsWith('<pre')) {
      merged[merged.length - 1] = prev.replace(/<\/pre>$/, '') + '\n\n' + o.replace(/^<pre class="qe-pre">/, '');
    } else merged.push(o);
  }
  return merged.join('\n');
}

/* --------------------------------------------------------------- sanitize */

const ALLOWED_TAGS = new Set([
  'section', 'article', 'header', 'footer', 'aside', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'pre', 'code', 'kbd', 'samp', 'var',
  'a', 'b', 'strong', 'i', 'em', 'u', 'small', 'sub', 'sup', 'br', 'hr', 'blockquote', 'cite', 'q',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'colgroup', 'col', 'img', 'figure', 'figcaption', 'button', 'abbr',
]);
const RENAME: Record<string, string> = { tt: 'code', font: 'span', big: 'span', center: 'div', strike: 'span' };
const ALLOWED_ATTR = new Set(['href', 'target', 'rel', 'id', 'class', 'colspan', 'rowspan', 'alt', 'src', 'title', 'role', 'type', 'scope', 'width', 'height', 'loading', 'tabindex', 'lang']);

/**
 * Allow-list sanitiser for generated content. Unknown elements are unwrapped
 * (their text is kept), dangerous ones are removed.
 */
export function sanitize($: CheerioAPI, root: Cheerio<AnyNode>): void {
  root.find('script, style, iframe, object, embed, form, input, link, meta, noscript, textarea, select').remove();
  root.find('*').each((_, node) => {
    const el = node as Element;
    let tag = el.tagName.toLowerCase();
    if (RENAME[tag]) {
      el.tagName = RENAME[tag];
      tag = el.tagName;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      $(el).replaceWith($(el).contents());
      return;
    }
    for (const name of Object.keys(el.attribs)) {
      const lower = name.toLowerCase();
      const ok = ALLOWED_ATTR.has(lower) || lower.startsWith('data-') || lower.startsWith('aria-');
      if (!ok) {
        delete el.attribs[name];
        continue;
      }
      if ((lower === 'href' || lower === 'src') && /^\s*(javascript|vbscript|data):/i.test(el.attribs[name])) {
        delete el.attribs[name];
      }
    }
  });
}

const BLOCK_CLOSE = /<\/(p|div|dt|dd|li|h[1-6]|pre|tr|td|th|section|article|header|dl|ul|ol|table|blockquote|caption|figcaption)>/gi;

/** Plain text of an HTML fragment with whitespace between block elements (so words never glue). */
export function blockText(html: string): string {
  const $ = cheerio.load(html.replace(BLOCK_CLOSE, '$& ').replace(/<br\s*\/?>/gi, ' $& ').replace(/<\/(code|span|a|b|i|em|strong)>(?=<(span|code|a|b|i)\b)/gi, '$& '));
  $('.katex-html').remove(); // keep MathML/TeX annotation only once
  return squash($.root().text());
}

export function load(html: string, xml = false): CheerioAPI {
  return xml ? cheerio.load(html, { xml: { xmlMode: true, decodeEntities: false } }) : cheerio.load(html);
}

/** Mark external links so the UI can show an icon and announce new tabs. */
export function decorateExternalLinks($: CheerioAPI, root: Cheerio<AnyNode>): void {
  root.find('a[href]').each((_, a) => {
    const href = $(a).attr('href')!;
    if (/^(https?:|mailto:|ftp:)/i.test(href)) {
      $(a).attr('class', [$(a).attr('class'), 'ext'].filter(Boolean).join(' '));
      $(a).attr('target', '_blank');
      $(a).attr('rel', 'noopener noreferrer');
    }
  });
}
