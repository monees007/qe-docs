/**
 * Auto-detected cross references between variables of the same program.
 *
 * helpdoc descriptions often name other variables in plain text without a
 * link. We detect those mentions conservatively:
 *  - identifiers that cannot be English words (contain "_" or a digit, or are
 *    not in the stop-list below) are matched as whole words, case-sensitive;
 *  - names that ARE ordinary words ("calculation", "smearing", "title", ...)
 *    only count when written as an assignment/condition ("calculation = 'relax'").
 * These edges are labelled "mention" in the UI and kept separate from the
 * explicit links ("ref" / "see") written by the documentation authors.
 */
import type { Variable, XrefEdge } from '../../src/types/docs.ts';

export const ENGLISH_NAMES = new Set(
  `density molecule adapt adiabatic applied approximation atom author axis beta block broadening calculation calculator
closure config dos end file finish gate grease increment interpolation label lambda memory method output press radius
recover reference rel report restart smearing spin start step target title trans units weight what hubbard extrapolation
diagonalization occupations eigenstate magnons precondition orthogonalization kpoint prefix verbosity lebedev london huang
dft vdw eels scissor upscale latt ener omeg emass ace dek nogg trism lsign iflag ityp tolp writev xmin rmax emin emax
zed lloc lsmall pvar nls nld ocs wfsd ndos`
    .split(/\s+/)
    .filter(Boolean),
);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isWordLike(name: string): boolean {
  return ENGLISH_NAMES.has(name.toLowerCase());
}

export function mentionRegex(name: string): RegExp {
  const core = `(?<![A-Za-z0-9_%&'.])${escapeRe(name)}(?![A-Za-z0-9_])`;
  return isWordLike(name) ? new RegExp(`${core}(?=\\s*(?:\\(\\s*\\w+\\s*\\)\\s*)?=)`) : new RegExp(core);
}

export function buildMentionEdges(docId: string, vars: Variable[], varText: Record<string, string>): XrefEdge[] {
  const out: XrefEdge[] = [];
  const candidates: { re: RegExp; target: string }[] = [];
  for (const v of vars) {
    for (const n of v.names) {
      if (n.length < 3) continue; // x, y, z, nk1? -> too ambiguous when 1-2 chars
      candidates.push({ re: mentionRegex(n), target: v.id });
    }
  }
  for (const v of vars) {
    const text = varText[v.id] ?? '';
    if (!text) continue;
    const found = new Set<string>();
    for (const c of candidates) {
      if (c.target === v.id || found.has(c.target)) continue;
      if (c.re.test(text)) found.add(c.target);
    }
    for (const t of found) out.push({ source: `${docId}:${v.id}`, target: `${docId}:${t}`, kind: 'mention' });
  }
  return out;
}
