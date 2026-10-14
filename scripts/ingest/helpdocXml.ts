/**
 * helpdoc XML support.
 *  - convertHelpdocXml(): renders an INPUT_*.xml (namelist-only documents such
 *    as INPUT_ALL_CURRENTS.xml, which has no HTML on the site) into the same
 *    semantic HTML produced by the HTML parser.
 *  - xmlInventory(): lists every documented name in any helpdoc XML; used by
 *    verify.ts to cross-check the HTML parser against the XML for programs
 *    published in both formats.
 */
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { load, squash, escapeHtml, IdRegistry } from './util.ts';
import { buildVarArticle, finalizeInputDoc, type ParsedInput } from './helpdocHtml.ts';

/** Inline helpdoc markup -> HTML (ref/link/b/i/tt/a are the tags used inside text). */
function inline($: CheerioAPI, el: Cheerio<AnyNode>): string {
  let out = '';
  el.contents().each((_, n) => {
    if (n.type === 'text') {
      out += escapeHtml((n as unknown as { data: string }).data);
      return;
    }
    if (n.type !== 'tag') return;
    const e = n as Element;
    const c = $(e);
    switch (e.tagName) {
      case 'ref': {
        const t = squash(c.text());
        out += `<a href="#${escapeHtml(t)}">${escapeHtml(t)}</a>`;
        break;
      }
      case 'link': {
        const t = squash(c.text());
        out += `<a href="${escapeHtml(t)}">${escapeHtml(t)}</a>`;
        break;
      }
      case 'a':
        out += `<a href="${escapeHtml(c.attr('href') || '')}">${inline($, c)}</a>`;
        break;
      case 'b':
      case 'i':
      case 'tt':
      case 'em':
      case 'sub':
      case 'sup':
        out += `<${e.tagName}>${inline($, c)}</${e.tagName}>`;
        break;
      case 'br':
        out += '\n';
        break;
      default:
        out += inline($, c);
    }
  });
  return out;
}

function varArticle($: CheerioAPI, v: Cheerio<Element>, ids: IdRegistry, aliases: Record<string, string>, groupType?: string): string {
  const name = v.attr('name')!;
  const type = v.attr('type') || groupType;
  const id = ids.claim(name);
  aliases[name] = id;
  const meta: { label: string; html: string }[] = [];
  const def = v.children('default');
  if (def.length) meta.push({ label: 'Default', html: inline($, def).trim() });
  const see = v.children('see');
  if (see.length) meta.push({ label: 'See', html: see.toArray().map((s) => squash($(s).text())).flatMap((s) => s.split(/\s*,\s*/)).map((s) => `<a href="#${escapeHtml(s)}">${escapeHtml(s)}</a>`).join(', ') });
  const status = squash(v.children('status').text()) || undefined;
  let desc = '';
  const info = v.children('info');
  if (info.length) desc += `<pre>${inline($, info)}</pre>`;
  const opts = v.children('options');
  if (opts.length) {
    const oi = opts.children('info');
    if (oi.length) desc += `<pre>${inline($, oi)}</pre>`;
    const items = opts
      .children('opt')
      .toArray()
      .map((o) => `<div class="qe-opt"><dt><code>${escapeHtml($(o).attr('val') || '')}</code></dt><dd><pre>${inline($, $(o))}</pre></dd></div>`);
    if (items.length) desc += `<dl class="qe-options">${items.join('')}</dl>`;
  }
  return buildVarArticle({ id, display: name, type, status, meta, descHtml: desc });
}

export function convertHelpdocXml(xml: string, file: string, docId: string): ParsedInput {
  const warnings: string[] = [];
  const $ = load(xml, true);
  const root = $('input_description').first();
  if (!root.length) throw new Error(`${file}: not a helpdoc XML file`);
  const program = root.attr('program') || docId;
  const pkg = root.attr('package');
  const ids = new IdRegistry(['top', 'content', 'main']);
  const aliases: Record<string, string> = {};
  let html = '';

  const intro = root.children('intro');
  if (intro.length) {
    ids.claim('intro');
    html += `<section class="qe-section qe-sec-intro" id="intro" data-kind="intro" data-title="Introduction"><h2 class="qe-section-title">Introduction</h2><pre>${inline($, intro)}</pre></section>`;
  }
  root.children().each((_, n) => {
    const el = $(n as Element);
    const tag = (n as Element).tagName;
    if (tag === 'namelist') {
      const name = el.attr('name')!;
      const id = ids.claim(name);
      aliases[name] = id;
      let body = '';
      el.children().each((_, c) => {
        const ce = $(c as Element);
        const ct = (c as Element).tagName;
        if (ct === 'var') body += varArticle($, ce, ids, aliases);
        else if (ct === 'vargroup' || ct === 'dimension') {
          warnings.push(`${file}: <${ct}> rendered as individual variables`);
          ce.children('var').each((_, vv) => {
            body += varArticle($, $(vv as Element), ids, aliases, ce.attr('type'));
          });
        } else warnings.push(`${file}: unsupported <${ct}> inside namelist ${name}`);
      });
      html += `<section class="qe-section qe-sec-namelist" id="${id}" data-kind="namelist" data-title="&amp;${escapeHtml(name)}" data-name="${escapeHtml(name)}"><h2 class="qe-section-title"><span class="qe-kind">Namelist</span> <span class="qe-nl">&amp;${escapeHtml(name)}</span></h2>${body}</section>`;
    } else if (!['intro', 'toc'].includes(tag)) {
      warnings.push(`${file}: top-level <${tag}> not supported by the XML converter`);
    }
  });

  const $h = load(`<div id="__root">${html}</div>`);
  const main = $h('#__root') as Cheerio<Element>;
  return finalizeInputDoc($h, main, { ids, aliases, file, docId, program, pkg, version: undefined, warnings });
}

export interface XmlInventory {
  program: string;
  /** Every name documented by var / dimension / col / list / flag-free elements. */
  names: Set<string>;
  /** Names that only appear as placeholders in syntax tables. */
  syntaxOnly: Set<string>;
  namelists: string[];
  cards: string[];
}

/** All variable-like names in a helpdoc XML file (for cross-checking). */
export function xmlInventory(xml: string): XmlInventory | null {
  const $ = load(xml, true);
  const root = $('input_description').first();
  if (!root.length) return null;
  const names = new Set<string>();
  const syntaxOnly = new Set<string>();
  root.find('var, dimension, col, list, multidimension').each((_, n) => {
    const nm = $(n).attr('name');
    if (!nm) return;
    // placeholders inside <syntax> without their own description only appear in the syntax table
    if ($(n).closest('syntax').length && !$(n).children('info').length) syntaxOnly.add(nm);
    else names.add(nm);
  });
  return {
    program: root.attr('program') || '',
    names,
    syntaxOnly,
    namelists: root.find('namelist').toArray().map((n) => $(n).attr('name')!),
    cards: root.find('card').toArray().map((n) => $(n).attr('name')!),
  };
}
