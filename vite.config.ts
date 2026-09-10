import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

// SINGLEFILE=1 npm run build  -> emits one self-contained dist/index.html
const singleFile = process.env.SINGLEFILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    watch: {
      // The API proxy writes state.json and uploaded files INSIDE the project,
      // so Vite's watcher sees them and triggers a full reload — which makes
      // the app save again, reload again, forever. Excluding them breaks that
      // loop. Nothing in these folders is imported by the frontend.
      // Match only runtime folders, never src/data (the live floorplan/catalog).
      ignored: ['data', 'workspace'].map((folder) => fileURLToPath(new URL(`./${folder}/**`, import.meta.url)).replaceAll('\\', '/')),
    },
    // The browser only ever talks to Vite; Vite forwards /api to the local
    // proxy that holds the keys. Nothing secret is ever served to the client.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
})
