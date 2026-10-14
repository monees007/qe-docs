<script setup lang="ts">
/** Minimal stroke icon set (original drawings, 24x24 grid). Decorative unless a label is given. */
const props = defineProps<{ name: string; label?: string; size?: number }>();

const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  type: 'M4 7V5h16v2M12 5v14M9 19h6',
  graph: 'M6 6a2 2 0 1 0 0 .01M18 8a2 2 0 1 0 0 .01M8 18a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01M8 7l8 1M7 8l1 8M10 18h6M17 10l1 6',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  chevron: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  focus: 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9l-5-5M15 9l5-5M9 15l-5 5M15 15l5 5',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  speak: 'M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  stop: 'M7 7h10v10H7z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  check: 'M5 12l5 5 9-10',
  book: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  pdf: 'M7 3h7l5 5v13H7zM14 3v5h5M9.5 17v-4h1.3a1.2 1.2 0 0 1 0 2.4H9.5',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  home: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2M8 11h6M11 8v6',
  zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2M8 11h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  keyboard: 'M3 7h18v10H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  offline: 'M4 18a8 8 0 0 1 13.3-9M20 18a8 8 0 0 0-1-4M3 3l18 18',
};

const d = PATHS[props.name] ?? PATHS.info;
</script>

<template>
  <svg
    class="icon"
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path :d="d" />
  </svg>
</template>
