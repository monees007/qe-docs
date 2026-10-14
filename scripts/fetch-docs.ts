/**
 * Download (mirror) the Quantum ESPRESSO documentation folder, like `wget -r -np`.
 *
 *   npm run fetch-docs                                   # https://www.quantum-espresso.org/Doc/ -> source/qe-Doc
 *   npm run fetch-docs -- --url <base url> --out <dir>
 *
 * Follows links (href/src) that stay inside the base folder, skips the web
 * server's sort links (?C=...), and saves every file with its relative path.
 * Then run `npm run ingest` (or `npm run build`) to regenerate the app data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = new URL(opt('--url', 'https://www.quantum-espresso.org/Doc/'));
if (!BASE.pathname.endsWith('/')) BASE.pathname += '/';
const OUT = resolve(opt('--out', 'source/qe-Doc'));
const CONCURRENCY = Number(opt('--concurrency', '4'));

const seen = new Set<string>();
const queue: string[] = [];
let saved = 0;
let bytes = 0;
const failed: string[] = [];
const missing: string[] = [];

function enqueue(u: URL) {
  u.hash = '';
  if (u.search) return; // directory-listing sort links etc.
  if (!u.href.startsWith(BASE.href)) return; // stay inside the folder (no parent)
  if (seen.has(u.href)) return;
  seen.add(u.href);
  queue.push(u.href);
}

function localPath(href: string): string {
  let rel = decodeURIComponent(href.slice(BASE.href.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (rel.split('/').some((p) => p === '..')) throw new Error(`unsafe path ${rel}`);
  return join(OUT, rel);
}

async function get(href: string, tries = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(href, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'qe-docs-reader fetch-docs' } });
      if (r.status === 404) throw Object.assign(new Error('HTTP 404'), { final: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries || (e as { final?: boolean }).final) throw e;
      await new Promise((res) => setTimeout(res, 800 * i));
    }
  }
}

async function worker() {
  while (queue.length) {
    const href = queue.shift()!;
    try {
      const res = await get(href);
      const buf = Buffer.from(await res.arrayBuffer());
      const path = localPath(href);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buf);
      saved++;
      bytes += buf.length;
      const type = res.headers.get('content-type') || '';
      if (type.includes('html')) {
        const html = buf.toString('utf8');
        for (const m of html.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/gi)) {
          try {
            enqueue(new URL(m[1].trim(), href));
          } catch {
            /* malformed URL in the page */
          }
        }
      }
      if (saved % 25 === 0) console.log(`  ${saved} files…`);
    } catch (e) {
      const msg = (e as Error).message;
      // a 404 is a broken link inside the documentation itself, not a download failure
      (msg === 'HTTP 404' ? missing : failed).push(`${href} (${msg})`);
    }
  }
}

console.log(`Mirroring ${BASE.href}\n     into ${OUT}`);
enqueue(new URL(BASE.href));
// the queue grows while pages are parsed: keep starting workers until it is drained
while (queue.length) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Saved ${saved} files (${(bytes / 1048576).toFixed(1)} MB).`);
if (missing.length) console.log(`${missing.length} link(s) in the documentation point to pages that do not exist:\n  ${missing.join('\n  ')}`);
if (failed.length) {
  console.log(`${failed.length} failed:\n  ${failed.join('\n  ')}`);
  process.exitCode = 1;
}
