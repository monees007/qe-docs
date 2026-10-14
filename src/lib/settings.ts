import { reactive, watch } from 'vue';

export type Theme = 'system' | 'light' | 'sepia' | 'dark' | 'contrast' | 'contrast-dark';
export type ReadFont = 'lato' | 'system' | 'serif' | 'atkinson' | 'opendyslexic';

export interface Settings {
  theme: Theme;
  fontScale: number; // 0.85 .. 1.75
  lineHeight: number; // 1.4 .. 2.1
  letterSpacing: number; // em
  wordSpacing: number; // em
  measure: number; // ch, 0 = full width
  font: ReadFont;
  uiUsesReaderFont: boolean;
  justify: boolean;
  underlineLinks: boolean;
  strongFocus: boolean;
  motion: 'system' | 'reduce' | 'full';
  originalFormatting: boolean;
  wrapCode: boolean;
  readingRuler: boolean;
  progressBar: boolean;
  pdfDark: boolean;
  focusMode: boolean;
  speechRate: number;
}

export const DEFAULTS: Settings = {
  theme: 'system',
  fontScale: 1,
  lineHeight: 1.65,
  letterSpacing: 0,
  wordSpacing: 0,
  measure: 76,
  font: 'lato',
  uiUsesReaderFont: false,
  justify: false,
  underlineLinks: false,
  strongFocus: false,
  motion: 'system',
  originalFormatting: false,
  wrapCode: false,
  readingRuler: false,
  progressBar: true,
  pdfDark: false,
  focusMode: false,
  speechRate: 1,
};

const KEY = 'qe-reader-settings';

function read(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>;
  } catch {
    return {};
  }
}

export const settings = reactive<Settings>({ ...DEFAULTS, ...read() });

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
}

export function applySettings(s: Settings = settings) {
  const r = document.documentElement;
  const set = (k: string, v: string | null) => (v === null ? r.removeAttribute(k) : r.setAttribute(k, v));
  set('data-theme', s.theme);
  set('data-font', s.font === 'lato' ? null : s.font);
  set('data-ui-font', s.uiUsesReaderFont ? 'reader' : null);
  set('data-align', s.justify ? 'justify' : null);
  set('data-links', s.underlineLinks ? 'underline' : null);
  set('data-focus', s.strongFocus ? 'strong' : null);
  set('data-motion', s.motion === 'system' ? null : s.motion);
  set('data-original', s.originalFormatting ? 'true' : null);
  set('data-wrap-pre', s.wrapCode ? 'true' : null);
  set('data-pdf-dark', s.pdfDark ? 'true' : null);
  set('data-layout', s.focusMode ? 'focus' : null);
  r.style.setProperty('--font-scale', String(s.fontScale));
  r.style.setProperty('--line-height', String(s.lineHeight));
  r.style.setProperty('--letter-spacing', `${s.letterSpacing}em`);
  r.style.setProperty('--word-spacing', `${s.wordSpacing}em`);
  r.style.setProperty('--measure', s.measure ? `${s.measure}ch` : '100%');
  const meta = document.querySelector('meta[name="theme-color"]');
  const dark = s.theme === 'dark' || s.theme === 'contrast-dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  meta?.setAttribute('content', dark ? '#141517' : s.theme === 'sepia' ? '#f7f1e5' : '#9d2529');
}

export function initSettings() {
  applySettings();
  watch(
    settings,
    (s) => {
      applySettings(s);
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* storage unavailable (private mode): settings still apply for this session */
      }
    },
    { deep: true },
  );
}

export function prefersReducedMotion(): boolean {
  if (settings.motion === 'reduce') return true;
  if (settings.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
