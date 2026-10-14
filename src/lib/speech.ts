import { ref } from 'vue';
import { settings } from './settings';

export const speaking = ref(false);
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Read text aloud with the browser's speech engine. Reads the current text
 * selection if there is one, otherwise the given element from the first
 * block that is visible on screen.
 */
export function speakFrom(el: HTMLElement | null) {
  if (!speechSupported || !el) return;
  stopSpeaking();
  const sel = window.getSelection()?.toString().trim();
  let text = sel ?? '';
  if (!text) {
    const blocks = [...el.querySelectorAll<HTMLElement>('h2, h3, h4, p, li, dd, .qe-var-name, .qe-meta, pre')];
    const start = blocks.findIndex((b) => b.getBoundingClientRect().bottom > 80);
    text = blocks
      .slice(Math.max(0, start))
      .filter((b) => !b.closest('.katex-html'))
      .map((b) => b.innerText.trim())
      .filter(Boolean)
      .join('.\n');
  }
  if (!text) return;
  // speak in chunks: some engines stop after ~200 words per utterance
  const chunks = text.match(/[\s\S]{1,1500}(?=\s|$)/g) ?? [text];
  speaking.value = true;
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    u.rate = settings.speechRate;
    u.lang = 'en';
    if (i === chunks.length - 1) u.onend = u.onerror = () => (speaking.value = false);
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (!speechSupported) return;
  speechSynthesis.cancel();
  speaking.value = false;
}
