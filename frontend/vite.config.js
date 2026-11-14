import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 *
 * Tailwind v4 is wired in as a Vite plugin rather than through PostCSS — the
 * theme lives in `src/index.css` under `@theme`, not in a tailwind.config.js.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    // Expose on the LAN so the patient portal can be opened from a real phone
    // during development (the Geolocation API needs a real device to test).
    host: true,
  },

  preview: { port: 4173 },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Split the heavy, rarely-changing libraries into their own chunks.
         * Leaflet and Recharts together are larger than the whole app, and the
         * patient portal (which most users load on mobile data) needs neither
         * charts nor the dashboard routes.
         *
         * Vite 8 bundles with Rolldown, which requires the function form of
         * `manualChunks` — the object form is rejected at config time.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) {
            return 'vendor-map';
          }
          if (/[\\/]node_modules[\\/](recharts|d3-.*|victory-vendor|internmap)[\\/]/.test(id)) {
            return 'vendor-charts';
          }

          return undefined;
        },
      },
    },
  },
});
