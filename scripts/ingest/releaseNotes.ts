/**
 * Parser for Doc/release-notes (plain text).
 * Headings start at column 0 and look like "New in 7.5 version:",
 * "Fixed in version 4.2.1:", "Problems fixed in 6.5 branch :" ...
 * Bullets start with "*" (or "+"/"-") and continue on indented lines.
 * Item text is kept verbatim (line breaks preserved as "\n").
 */
import type { ReleaseNotes, ReleaseSection, ReleaseSectionKind, ReleaseVersion } from '../../src/types/docs.ts';
import { slugify } from './util.ts';

const HEADING = /^(\S.*?)\s+in\s+(?:version\s+|v\.\s*)?(\d+(?:\.\d+)*)(.*?)\s*:?\s*$/i;

function kindOf(label: string): ReleaseSectionKind {
  const l = label.toLowerCase();
  if (l.startsWith('new')) return 'new';
  if (l.includes('incompatible')) return 'incompatible';
  if (l.includes('known')) return 'known';
  if (l.includes('fixed')) return 'fixed';
  return 'other';
}

export function parseReleaseNotes(text: string): { notes: ReleaseNotes; warnings: string[] } {
  const warnings: string[] = [];
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '        ').split('\n');
  const versions: ReleaseVersion[] = [];
  const byVersion = new Map<string, ReleaseVersion>();
  let section: ReleaseSection | null = null;
  let item: string[] | null = null;
  let preamble: string[] = [];

  const flushItem = () => {
    if (section && item) section.items.push(item.join('\n').replace(/\s+$/, ''));
    item = null;
  };

  for (const raw of lines) {
    const isHeadingLine = /^\S/.test(raw) && HEADING.test(raw) && !/^[*+-]\s/.test(raw);
    if (isHeadingLine) {
      flushItem();
      const m = raw.match(HEADING)!;
      const version = m[2];
      let v = byVersion.get(version);
      if (!v) {
        v = { id: `v${version}`, version, sections: [] };
        byVersion.set(version, v);
        versions.push(v);
      }
      section = { id: `v${version}-${slugify(m[1])}-${v.sections.length + 1}`, heading: raw.trim().replace(/\s*:\s*$/, ''), kind: kindOf(m[1]), items: [] };
      v.sections.push(section);
      if (preamble.some((l) => l.trim())) warnings.push(`release-notes: text before first heading: ${preamble.join(' ').slice(0, 80)}`);
      preamble = [];
      continue;
    }
    if (!section) {
      preamble.push(raw);
      continue;
    }
    if (/^\s{0,6}[*+-]\s+\S/.test(raw) || /^\s{0,6}[*+-]$/.test(raw)) {
      flushItem();
      item = [raw.replace(/^\s*/, '')];
      continue;
    }
    if (!raw.trim()) {
      if (item) item.push('');
      continue;
    }
    if (item) item.push(raw.trim());
    else {
      // text in a section before any bullet
      section.intro = section.intro ? `${section.intro}\n${raw.trim()}` : raw.trim();
    }
  }
  flushItem();
  // trim trailing blank lines inside items
  for (const v of versions) for (const s of v.sections) s.items = s.items.map((i) => i.replace(/\n+$/g, ''));
  return { notes: { versions }, warnings };
}
