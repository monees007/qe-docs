// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createIndex, runSearch, tokenize } from '../../src/lib/searchEngine';
import type { SearchDoc } from '../../src/types/docs';

const docs = JSON.parse(readFileSync('public/data/search.json', 'utf8')) as SearchDoc[];
const ms = createIndex(docs);
const texts = new Map(docs.map((d) => [d.id, d.text]));
const q = (s: string, extra = {}) => runSearch(ms, texts, { q: s, limit: 20, ...extra });

describe('search', () => {
  it('tokenizes Fortran identifiers and their parts', () => {
    expect(tokenize('starting_magnetization(i)')).toEqual(['starting_magnetization', 'starting', 'magnetization', 'i']);
  });
  it('puts exact variable names first', () => {
    const hits = q('ecutwfc');
    expect(hits[0].kind).toBe('variable');
    expect(hits[0].title).toBe('ecutwfc');
  });
  it('finds namelists by their & name', () => {
    expect(q('&SYSTEM').some((h) => h.kind === 'section' && h.title === '&SYSTEM')).toBe(true);
  });
  it('tolerates a typo', () => {
    expect(q('degaus').some((h) => h.title === 'degauss')).toBe(true);
  });
  it('filters by kind and document', () => {
    const hits = q('smearing', { kinds: ['variable'], docIds: ['pw'] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kind === 'variable' && h.docId === 'pw')).toBe(true);
  });
  it('searches the guides and the PDF-only documents', () => {
    expect(q('phonon dispersion', { kinds: ['guide'] }).length).toBeGreaterThan(0);
    expect(q('Brillouin zone', { kinds: ['pdf'] }).length).toBeGreaterThan(0);
  });
});
