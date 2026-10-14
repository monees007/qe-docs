# QE Docs Reader

An **unofficial**, offline-capable reader for the Quantum ESPRESSO documentation
(<https://www.quantum-espresso.org/Doc/>). It covers every input reference, the five user guides, the
release notes and the PDFs, with instant search, cross-references between variables, and reading and
accessibility settings.

Not affiliated with or endorsed by the Quantum ESPRESSO Foundation. The documentation text belongs to the
QE authors (GNU GPL); see *About* in the app.

## What's inside

| Content | Source files | In the app |
|---|---|---|
| 36 input references (1,247 entries) | `INPUT_*.html` (helpdoc), `INPUT_ALL_CURRENTS.xml` | `/input/<program>` |
| 5 user guides, 27 chapters, 76 formulas | `*user_guide/` (LaTeX2HTML) | `/guide/<guide>/<chapter>` |
| Release notes, 63 versions | `release-notes` | `/release-notes` |
| 11 PDFs | `user_guide_PDF/` | `/pdf/<id>` (pdf.js viewer) |

**Features**

- **Search everything, offline.** Search runs in the browser (MiniSearch in a Web Worker). It handles
  prefixes and typos, ranks exact variable names first (`ecutwfc`, `&SYSTEM`), and filters by kind or
  program. Open it with `/` or `Ctrl/⌘ K`. A full results page lives at `/search?q=…`.
- **Reader view.** Clean typography and an adjustable line length. Each variable is a card showing its
  type, status, default and options. Every page has an "On this page" list with a variable filter, a
  focus mode, print styles, prev/next chapter links and a reading-progress bar.
- **Cross-reference graph.**
  - Links written by the authors and `See:` fields are marked as such.
  - Mentions of another variable in the text are detected automatically and labelled as auto-detected.
  - Each variable card has a **Related** drawer with a small graph.
  - `/graph` shows the network for a whole program, or the neighbourhood of one variable.
  - Every graph also has a table view, for keyboard and screen-reader users.
- **Accessibility settings** (Aa button), saved per browser:
  - Six themes: system, light, sepia, dark, high contrast and high-contrast dark. All are AA-checked.
  - Text size from 85 to 175 %.
  - Fonts: Lato, system, serif, Atkinson Hyperlegible or OpenDyslexic.
  - Line height, letter spacing and word spacing.
  - Reading ruler, always-underlined links, extra-visible focus and reduced motion.
  - Read-aloud using the browser's speech engine.
  - "Show original line breaks", which displays the exact source layout.
- **Keyboard first.** Skip link, focus-trapped dialogs and shortcuts: `/` search, `[` / `]` previous/next,
  `F` focus mode, `T` theme, `,` settings, `G` graph, `?` help.
- **Installable PWA.** It works offline after the first visit. PDFs are cached when first opened, or all
  at once from Settings › Offline.
- **Deep links stay compatible.** `/input/pw#ecutwfc` uses the same anchors as the official pages, and old
  `#id123` anchors are redirected.
- **Variable index** (`/variables`): all entries A–Z, filterable by program and type.

## Quick start

Requires Node.js ≥ 20.19.

```bash
npm ci
npm run dev        # http://localhost:5173 — uses the data already in public/data
npm run build      # ingest + verify data + type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173
```

`dist/` is a static site: copy it to any web server.

## Updating the documentation

```bash
npm run fetch-docs   # mirrors https://www.quantum-espresso.org/Doc/ into source/qe-Doc (like wget -r -np)
npm run build        # re-generates public/data, verifies it, rebuilds the app
```

You can also drop a manually downloaded copy into `source/qe-Doc/`, or point at any folder:
`npm run ingest -- --source /path/to/Doc`.

## Deploying

- **Any static host** (nginx, Apache, Netlify, GitHub Pages, S3…). Serve `dist/` and send unknown paths to
  `index.html`. For nginx: `try_files $uri $uri/ /index.html;`. `dist/404.html` is a copy of `index.html`
  for GitHub Pages.
- **Sub-path** (e.g. `https://example.org/qe-docs/`): build with `VITE_BASE=/qe-docs/ npm run build`.
- PWA install and offline mode need HTTPS (or `localhost`).

## How it works

```
source/qe-Doc/ (official files)
   │  scripts/ingest/        build-time Node pipeline (cheerio, KaTeX, pdf.js)
   │   ├─ helpdocHtml.ts     INPUT_*.html → semantic HTML + sections/variables/links
   │   ├─ helpdocXml.ts      INPUT_*.xml → same format; also cross-checks the HTML parser
   │   ├─ guides.ts          LaTeX2HTML pages → chapters; formulas → KaTeX (MathML + HTML)
   │   ├─ releaseNotes.ts    text → versions/sections/items
   │   ├─ pdfs.ts            page text for search
   │   ├─ xref.ts            auto-detected mentions
   │   └─ verify.ts          completeness checks (below)
   ▼
public/data/*.json  ──►  Vue 3 + Vite SPA (src/)  ──►  dist/ (PWA, Workbox)
```

- There is no backend. All data is static JSON, sanitised at build time with an allow-list.
- `src/lib/searchEngine.ts` holds the search logic. It is shared by the worker and the unit tests.
- Theme tokens live in `src/styles/tokens.css`. The colours are taken from the QE website stylesheet
  (`#9d2529`, `#404040`, …) and from the helpdoc pages (namelist/card/flag colours). Lato is a visual
  match to the website typography.

### Text fidelity

Descriptions in the QE files are pre-wrapped plain text.

- **Reflowing.** Prose paragraphs re-flow to your screen width. Aligned, listed or code-like blocks stay
  preformatted.
- **Words are never changed.** Only whitespace is presented differently. The setting "Show original line
  breaks" restores the source layout exactly.

## Verification

```bash
npm run verify:data   # content checks (also part of npm run build)
npm test              # unit tests (Vitest)
npm run test:e2e      # browser tests + axe accessibility audit (Playwright)
```

`verify:data` checks the following:

1. Every word of every source document is present in the output.
2. Every formula of the guides is present (compared through its LaTeX).
3. Every non-blank release-notes line is present.
4. For the 27 programs published in both HTML and XML, every name declared in the XML exists in the
   rendered page.
5. All 2,803 internal links resolve.

The e2e suite runs axe (WCAG 2.1 A/AA, serious and critical issues) on every page type and in the dark,
high-contrast and sepia themes. It also tests keyboard search, settings persistence, the graph drawer,
the PDF viewer and the mobile navigation.

## Issues found in the official files

`build-report.json` lists all warnings. The notable ones:

- **`INPUT_PH.xml` and `INPUT_PH.txt` are empty placeholders.** ph.x is read from `INPUT_PH.html`.
- **`INPUT_PH.html` lists `lmultipole` a second time, outside `&INPUTPH`.** It is kept, under
  "Additional items".
- **Some links point to anchors that do not exist.**
  - The anchors: `#nosym` in band_interpolation.x; `#domag`, `#trust_radius`, `#ignore_wolfe`,
    `#fpc_tempw` and `#nq1x/2x/3x` in pw.x; `#fileplot` in pprism.x.
  - In the reader these become a search for that name, shown with a dashed underline.
- **The PWscf guide links to `ipi-code.org` without `https://`.** That link is rewritten.
- **Duplicate anchors in the official pages** (e.g. `X` in two pw.x cards) get a `-2` suffix here.

## Licence

GPL-2.0-or-later, like Quantum ESPRESSO. Bundled fonts (Lato, Atkinson Hyperlegible, OpenDyslexic) are under
the SIL Open Font License. Libraries: Vue, Vite, MiniSearch, KaTeX, d3 (MIT/ISC), pdf.js (Apache-2.0).
