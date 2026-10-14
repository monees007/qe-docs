import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// Deploy under a sub-path with: VITE_BASE=/qe-docs/ npm run build
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'QE Docs Reader',
        short_name: 'QE Docs',
        description: 'Unofficial offline reader for the Quantum ESPRESSO documentation',
        theme_color: '#9d2529',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell + all documentation data are available offline after the first visit
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,json}'],
        globIgnores: ['**/docs/pdf/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/docs\//, /\/data\//],
        runtimeCaching: [
          {
            // PDFs are cached the first time they are opened (or via Settings › Offline)
            urlPattern: ({ url }) => url.pathname.includes('/docs/pdf/'),
            handler: 'CacheFirst',
            options: { cacheName: 'qe-pdfs', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
