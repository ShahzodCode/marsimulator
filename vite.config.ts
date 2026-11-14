import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js alone is ~700 kB minified; the game code chunk stays well under this.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Libraries in their own chunks, so a game update doesn't make players re-download them.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
});
