// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseReleaseNotes } from '../../scripts/ingest/releaseNotes';
import { mentionRegex, isWordLike } from '../../scripts/ingest/xref';

describe('release notes parser (real file)', () => {
  const { notes } = parseReleaseNotes(readFileSync('source/qe-Doc/release-notes', 'utf8'));
  it('orders versions newest first and classifies sections', () => {
    expect(notes.versions[0].version).toBe('7.5');
    const kinds = notes.versions[0].sections.map((s) => s.kind);
    expect(kinds).toContain('new');
    expect(kinds).toContain('fixed');
    expect(kinds).toContain('incompatible');
  });
  it('keeps multi-line items together', () => {
    const first = notes.versions[0].sections[0].items[0];
    expect(first.split('\n').length).toBeGreaterThan(1);
  });
});

describe('mention detection', () => {
  it('matches identifiers as whole words', () => {
    expect(mentionRegex('ecutwfc').test('4 * ecutwfc')).toBe(true);
    expect(mentionRegex('nat').test('nat_todo atoms')).toBe(false);
  });
  it('only counts ordinary words when written as an assignment', () => {
    expect(isWordLike('calculation')).toBe(true);
    expect(mentionRegex('calculation').test('a self-consistent calculation is run')).toBe(false);
    expect(mentionRegex('calculation').test("used only if calculation = 'relax'")).toBe(true);
  });
});
