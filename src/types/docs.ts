/**
 * Data contracts shared by the build-time ingestion pipeline (scripts/ingest)
 * and the Vue application. Everything under public/data is produced from the
 * official Quantum ESPRESSO documentation files and nothing else.
 */

export type DocKind = 'input' | 'guide' | 'notes' | 'pdf';

export type SourceFormat = 'helpdoc-html' | 'helpdoc-xml' | 'latex2html' | 'text' | 'pdf';

export interface TocEntry {
  id: string;
  title: string;
  kind?: string;
  level: number;
  children?: TocEntry[];
}

export interface DocSummary {
  id: string;
  kind: DocKind;
  title: string;
  subtitle?: string;
  /** Program package as stated by the source (e.g. "PWscf"). */
  package?: string;
  version?: string;
  sourceFile: string;
  sourceFormat: SourceFormat;
  officialUrl: string;
  /** Group used for navigation. */
  group: string;
  /** Purpose sentence quoted from the program's own introduction, if it has one. */
  summary?: string;
  counts?: { variables?: number; sections?: number; pages?: number; chapters?: number; versions?: number };
  /** For guides: id of the PDF version of the same document, if any. */
  pdfId?: string;
  /** For PDFs: id of the HTML version of the same document, if any. */
  htmlId?: string;
}

export interface DocGroup {
  id: string;
  title: string;
  description?: string;
  docIds: string[];
}

export interface Manifest {
  generatedAt: string;
  qeVersion: string;
  docs: DocSummary[];
  groups: DocGroup[];
  stats: {
    programs: number;
    variables: number;
    guideChapters: number;
    pdfs: number;
    releaseVersions: number;
    xrefEdges: number;
  };
  /** Files present in the source but deliberately not rendered, with the reason. */
  excluded: { file: string; reason: string }[];
}

/* ------------------------------------------------------------------ input */

export type InputSectionKind = 'intro' | 'namelist' | 'card' | 'line' | 'group' | 'text';

export interface InputSection {
  id: string;
  title: string;
  kind: InputSectionKind;
  /** Namelist or card name without decoration, e.g. "SYSTEM". */
  name?: string;
  /** Nesting depth (0 = top level) and enclosing section, e.g. &PATH inside BEGIN_PATH_INPUT. */
  level: number;
  parent?: string;
  /** Variables whose closest enclosing section is this one. */
  varIds: string[];
}

export interface Variable {
  id: string;
  /** All names documented by this entry (vargroups list several). */
  names: string[];
  /** Heading exactly as written in the source, e.g. "celldm(i), i=1,6". */
  display: string;
  type?: string;
  default?: string;
  status?: string;
  sectionId: string;
  sectionTitle: string;
  /** Allowed values listed in the source (empty if none). */
  options: string[];
  /** First sentence of the description, plain text. */
  summary: string;
}

export interface InputDoc {
  id: string;
  title: string;
  program: string;
  package?: string;
  version?: string;
  html: string;
  sections: InputSection[];
  variables: Variable[];
  /** Original anchor names (helpdoc "idN" and names) -> canonical element id. */
  aliases: Record<string, string>;
}

/* ------------------------------------------------------------------ guide */

export interface GuideHeading {
  id: string;
  title: string;
  level: number;
}

export interface GuideChapter {
  id: string;
  number: string;
  title: string;
  html: string;
  headings: GuideHeading[];
}

export interface Guide {
  id: string;
  title: string;
  subtitle?: string;
  chapters: GuideChapter[];
}

/* ---------------------------------------------------------- release notes */

export type ReleaseSectionKind = 'new' | 'fixed' | 'incompatible' | 'known' | 'other';

export interface ReleaseSection {
  id: string;
  heading: string;
  kind: ReleaseSectionKind;
  /** Free text preceding the first bullet, if any. */
  intro?: string;
  items: string[];
}

export interface ReleaseVersion {
  id: string;
  version: string;
  sections: ReleaseSection[];
}

export interface ReleaseNotes {
  versions: ReleaseVersion[];
}

/* -------------------------------------------------------------------- pdf */

export interface PdfInfo {
  id: string;
  title: string;
  file: string;
  pages: number;
}

/** Row of public/data/variables.json (compact keys keep the file small). */
export interface VarIndexRow {
  d: string; // doc id
  v: string; // variable id
  l: string; // display label
  t: string; // type
  s: string; // section title
  m: string; // summary
  df: string; // default
}

/* ----------------------------------------------------------------- search */

export type SearchKind = 'variable' | 'section' | 'program' | 'guide' | 'release' | 'pdf';

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  /** Extra exact-match field (variable names). */
  names?: string;
  subtitle: string;
  text: string;
  url: string;
  docId: string;
  type?: string;
}

/* ------------------------------------------------------------------- xref */

export type XrefEdgeKind = 'ref' | 'see' | 'mention';

export interface XrefNode {
  /** "<docId>:<varId>" */
  id: string;
  label: string;
  docId: string;
  varId: string;
  section: string;
}

export interface XrefEdge {
  source: string;
  target: string;
  kind: XrefEdgeKind;
}

export interface GuideMention {
  guideId: string;
  chapterId: string;
  chapterTitle: string;
  headingId?: string;
  headingTitle?: string;
}

export interface Xref {
  nodes: XrefNode[];
  edges: XrefEdge[];
  /** node id -> places in the user guides that link to or mention it. */
  guideMentions: Record<string, GuideMention[]>;
}
