import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [{
    name: 'copy-worker-types',
    closeBundle() {
      copyFileSync('src/dom/worker.d.ts', 'dist/worker.d.ts')
    }
  }],
  server: {
    port: 3000,
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: 'inline',
    minify: true,
    rollupOptions: {
      external: ['events', 'jsdom'],
    },
    lib: {
      entry: {
        client: 'src/client/index.tsx',
        worker: 'src/dom/worker.ts'
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    }
  },
})
