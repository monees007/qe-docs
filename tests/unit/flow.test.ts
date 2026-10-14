// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { flowPre, isProse, joinProse, firstSentence, tidyHeading } from '../../scripts/ingest/util';

describe('isProse', () => {
  it('accepts ordinary wrapped sentences', () => {
    expect(isProse(['directory containing the input data, i.e. the same as in pw.x'])).toBe(true);
    expect(isProse(['Specified atomic positions will be IGNORED and those from the', 'previous scf calculation will be used instead !!!'])).toBe(true);
  });
  it('keeps aligned, listed and code-like blocks preformatted', () => {
    expect(isProse(['nspin = 1 :  non-polarized calculation (default)'])).toBe(false);
    expect(isProse(['   =  0  Simple Gaussian (default)'])).toBe(false);
    expect(isProse(['first line', '    indented continuation'])).toBe(false);
    expect(isProse(['&DOS', '  ...', '/'])).toBe(false);
    expect(isProse(['Structure of the input data:', '============================'])).toBe(false);
  });
});

describe('flowPre', () => {
  it('never changes words, only wraps them', () => {
    const src = '\nprefix of input file produced by pw.x\n(wavefunctions are not needed)\n\n   =  0  Simple Gaussian (default)\n   =  1  Methfessel-Paxton\n';
    const out = flowPre(src);
    const words = (s: string) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
    expect(words(out)).toEqual(words(src));
    expect(out).toContain('<p class="qe-flow">');
    expect(out).toContain('<pre class="qe-pre">');
  });
  it('falls back to a single <pre> when markup spans a blank line', () => {
    const out = flowPre('<b>bold\n\nstill bold</b>');
    expect(out.startsWith('<pre class="qe-pre">')).toBe(true);
  });
});

describe('joinProse', () => {
  it('keeps a break between statements but re-flows wrapped lines', () => {
    expect(joinProse(['charge density and potential', 'For norm-conserving pseudopotential'])).toBe('charge density and potential<br>For norm-conserving pseudopotential');
    expect(joinProse(['the same as in', 'pw.x for details'])).toBe('the same as in\npw.x for details');
  });
});

describe('text helpers', () => {
  it('firstSentence ignores abbreviations', () => {
    expect(firstSentence('directory containing the input data, i.e. the same as in pw.x. More text.')).toBe('directory containing the input data, i.e. the same as in pw.x.');
  });
  it('tidyHeading title-cases capitals but not identifiers', () => {
    expect(tidyHeading('ADDITIONAL EXAMPLES FOR TARGET_OCCUPATION_NUMBERS')).toBe('Additional Examples for TARGET_OCCUPATION_NUMBERS');
  });
});
