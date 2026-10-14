import { ref } from 'vue';

export interface RecentItem {
  url: string;
  title: string;
  subtitle: string;
  at: number;
}

const KEY = 'qe-reader-recent';
const MAX = 8;

function read(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export const recent = ref<RecentItem[]>(read());

export function remember(item: Omit<RecentItem, 'at'>) {
  const list = recent.value.filter((r) => r.url.split('#')[0] !== item.url.split('#')[0]);
  list.unshift({ ...item, at: Date.now() });
  recent.value = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(recent.value));
  } catch {
    /* ignore */
  }
}

export function clearRecent() {
  recent.value = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
