<script setup lang="ts">
import { computed } from 'vue';
import { manifest } from '../lib/data';

const m = computed(() => manifest.value);
const generated = computed(() => (m.value ? new Date(m.value.generatedAt).toLocaleString() : ''));
</script>

<template>
  <div class="page no-toc">
    <article class="reader prose about">
      <h1>About this reader</h1>
      <p>
        <strong>QE Docs Reader</strong> is an independent, <strong>unofficial</strong> front-end for the documentation published at
        <a href="https://www.quantum-espresso.org/Doc/" class="ext" target="_blank" rel="noopener noreferrer">quantum-espresso.org/Doc</a>. It is not
        affiliated with or endorsed by the Quantum ESPRESSO Foundation. When something matters, check the original page — every document links to
        it.
      </p>

      <h2>Content and licence</h2>
      <p>
        All documentation text belongs to the Quantum ESPRESSO authors. The user guide states that Quantum ESPRESSO is free software released under
        the GNU General Public License (see <RouterLink to="/guide/user-guide/1-introduction">User’s Guide, Introduction</RouterLink>). The reader
        itself is released under GPL-2.0-or-later as well.
      </p>
      <p>
        If you use Quantum ESPRESSO in scientific work, the authors ask you to cite the references listed in the guide’s “Terms of use” section
        (J. Phys.: Condens. Matter 21, 395502 (2009) and 29, 465901 (2017), plus the GPU paper for the GPU version).
      </p>

      <h2>How the documents were processed</h2>
      <ul>
        <li>Input references are converted from the helpdoc HTML files (and <code>INPUT_ALL_CURRENTS.xml</code>, which has no HTML version).</li>
        <li>
          Plain-text descriptions keep their exact wording. Paragraphs re-flow to your screen width; anything that looks aligned, listed or
          code-like stays preformatted. Turn on <em>Show original line breaks</em> in the settings to see the source layout.
        </li>
        <li>User-guide formulas are re-rendered with KaTeX from the LaTeX that LaTeX2HTML stored in the original images.</li>
        <li>Links in the source that point to anchors which do not exist are turned into a search for that name (dashed underline).</li>
        <li>
          A build-time check confirms that every word of every source document, every formula, and every release-note line is present in the
          output, and that all internal links resolve.
        </li>
        <li>Cross-reference “mentions” are detected automatically and are labelled as such everywhere.</li>
      </ul>

      <template v-if="m">
        <h2>This build</h2>
        <ul>
          <li>Documentation version: Quantum ESPRESSO {{ m.qeVersion }}</li>
          <li>Generated: {{ generated }}</li>
          <li>
            {{ m.stats.programs }} programs, {{ m.stats.variables }} input entries, {{ m.stats.guideChapters }} guide chapters, {{ m.stats.releaseVersions }}
            release versions, {{ m.stats.pdfs }} PDFs, {{ m.stats.xrefEdges }} cross-references
          </li>
        </ul>
        <details>
          <summary>Source files not shown as pages ({{ m.excluded.length }})</summary>
          <ul>
            <li v-for="e in m.excluded" :key="e.file"><code>{{ e.file }}</code> — {{ e.reason }}</li>
          </ul>
        </details>
      </template>

      <h2>Design and software</h2>
      <ul>
        <li>Colours follow the Quantum ESPRESSO website stylesheet (QETheme by NEWEB, GPL-2.0-or-later) and the colours used in the helpdoc pages.</li>
        <li>Fonts: system fonts by default; Atkinson Hyperlegible and OpenDyslexic (SIL Open Font License) are bundled for the accessibility settings.</li>
        <li>Built with Vue, Vite, MiniSearch, pdf.js, KaTeX and d3 (MIT / Apache-2.0 / ISC licences).</li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.about details {
  margin: 1em 0;
}
.about summary {
  cursor: pointer;
  font-weight: 600;
}
.about details li {
  font-size: 0.9em;
}
</style>
