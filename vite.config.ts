import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: [
      {
        // The Astryx neutral theme's font stylesheet pulls Figtree from Google
        // Fonts. This app is local-only (bundled fonts, no CDN), so resolve that
        // one import to a local stub. Astryx's Figtree then falls back to the
        // app font stack declared in src/styles/theme.css.
        find: '@astryxdesign/theme-neutral/fonts.css',
        replacement: '/src/styles/astryx-fonts.css',
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'chrome105',
    // JS can stay at chrome105, but CSS needs light-dark() left intact: the
    // Astryx theme tokens and the app palette are [light, dark] tuples, and
    // lightningcss would otherwise downlevel them into a prefers-color-scheme
    // polyfill that ignores `<Theme mode>` and data-theme.
    cssTarget: 'chrome123',
    sourcemap: false,
  },
});
