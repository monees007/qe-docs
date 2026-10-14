// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHelpdocHtml, deriveNames } from '../../scripts/ingest/helpdocHtml';
import { convertHelpdocXml, xmlInventory } from '../../scripts/ingest/helpdocXml';

const SRC = 'source/qe-Doc/';

describe('helpdoc HTML parser (real INPUT_DOS.html)', () => {
  const r = parseHelpdocHtml(readFileSync(SRC + 'INPUT_DOS.html', 'utf8'), 'INPUT_DOS.html', 'dos');
  it('reads the header', () => {
    expect(r.doc.program).toBe('dos.x');
    expect(r.doc.package).toBe('PWscf');
    expect(r.doc.version).toBe('7.5');
  });
  it('finds the namelist and every variable of the XML', () => {
    const inv = xmlInventory(readFileSync(SRC + 'INPUT_DOS.xml', 'latin1'))!;
    expect(r.doc.sections.map((s) => s.name).filter(Boolean)).toEqual(inv.namelists);
    const names = new Set(r.doc.variables.flatMap((v) => v.names));
    for (const n of inv.names) expect(names.has(n)).toBe(true);
  });
  it('keeps allowed values and defaults', () => {
    const bz = r.doc.variables.find((v) => v.id === 'bz_sum')!;
    expect(bz.type).toBe('CHARACTER');
    expect(bz.options).toEqual(["'smearing'", "'tetrahedra'", "'tetrahedra_lin'", "'tetrahedra_opt'"]);
    expect(r.doc.variables.find((v) => v.id === 'ngauss')!.default).toBe('0');
  });
  it('produces no dangerous markup', () => {
    expect(r.doc.html).not.toMatch(/<script|onerror=|onclick=|javascript:/i);
  });
});

describe('helpdoc XML converter (INPUT_ALL_CURRENTS.xml has no HTML)', () => {
  const r = convertHelpdocXml(readFileSync(SRC + 'INPUT_ALL_CURRENTS.xml', 'latin1'), 'INPUT_ALL_CURRENTS.xml', 'all-currents');
  it('converts every variable of the namelist', () => {
    expect(r.doc.program).toBe('all_currents.x');
    expect(r.doc.sections.find((s) => s.kind === 'namelist')?.name).toBe('ENERGY_CURRENT');
    expect(r.doc.variables.length).toBe(xmlInventory(readFileSync(SRC + 'INPUT_ALL_CURRENTS.xml', 'latin1'))!.names.size);
  });
  it('turns <ref> into working in-page links', () => {
    expect(r.links.filter((l) => l.localTarget).length).toBeGreaterThan(10);
  });
});

describe('deriveNames', () => {
  it('extracts identifiers from helpdoc headings', () => {
    expect(deriveNames('celldm(i), i=1,6', ['celldm'], false)).toEqual(['celldm']);
    expect(deriveNames('starting_magnetization(i), i=1,ntyp', ['starting_magnetization'], false)).toEqual(['starting_magnetization']);
    expect(deriveNames('x, y, z', ['x', 'y', 'z'], false)).toEqual(['x', 'y', 'z']);
    expect(deriveNames('Card options: alat | bohr', ['atompos_unit'], true)).toEqual([]);
  });
});
