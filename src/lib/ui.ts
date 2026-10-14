import { ref } from 'vue';

export const navOpen = ref(false);
export const tocOpen = ref(false);
export const settingsOpen = ref(false);
export const shortcutsOpen = ref(false);
/** xref drawer target: "<docId>:<varId>" */
export const xrefTarget = ref<string | null>(null);
export const liveMessage = ref('');

/** Announce a short message to screen readers (polite). */
export function announce(msg: string) {
  liveMessage.value = '';
  requestAnimationFrame(() => (liveMessage.value = msg));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Trap Tab focus inside `el` while a modal is open; returns a cleanup function. */
export function trapFocus(el: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...el.querySelectorAll<HTMLElement>(sel)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('keydown', onKey);
    if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
  };
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
