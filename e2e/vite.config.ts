import path from 'path';
import { defineConfig } from 'vite';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
  ],
  publicDir: 'public',
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    cssCodeSplit: true,
    rollupOptions: {
      external: ["node:module", "events", "crypto"],
      input: {
        main: path.resolve(__dirname, './index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src')
    }
  },
})
