import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: {
        index: 'src/index.tsx',
        worker: 'src/worker.tsx'
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["node:module", "events", "crypto", "path"],
    }
  },
})
