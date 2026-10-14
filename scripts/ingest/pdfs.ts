/**
 * Extract metadata and per-page text from the PDF documents with pdf.js
 * (pure JavaScript, so the pipeline runs the same on Windows/macOS/Linux).
 * The text is used only for search; the PDFs themselves are served as-is.
 */
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfExtract {
  title?: string;
  pages: string[];
}

export async function extractPdf(path: string): Promise<PdfExtract> {
  const data = new Uint8Array(readFileSync(path));
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const pdf = await task.promise;
  const meta = await pdf.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as Record<string, unknown>;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let out = '';
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      out += it.str;
      out += it.hasEOL ? '\n' : ' ';
    }
    pages.push(out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());
    page.cleanup();
  }
  await task.destroy();
  const title = typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined;
  return { title, pages };
}
