import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initSettings } from './lib/settings';
import { loadManifest } from './lib/data';
import { warmSearch } from './lib/search';

import '@fontsource/lato/300.css';
import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/content.css';

initSettings();
loadManifest().catch(() => {
  /* surfaced by App.vue */
});

createApp(App).use(router).mount('#app');

const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1200));
idle(() => warmSearch());
