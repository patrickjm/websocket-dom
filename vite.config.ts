import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  server: {
    port: 3000,
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: 'inline',
    minify: true,
    lib: {
      entry: 'src/client/index.tsx',
      name: 'client',
      formats: ['es'],
      fileName: () => 'client.js',
    }
  },
})
