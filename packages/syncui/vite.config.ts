import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [],
  server: {
    port: 3000,
  },
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: "inline",
    minify: true,
    rollupOptions: {
      external: ["events"],
    },
    lib: {
      entry: {
        client: "src/client/index.tsx",
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
  },
});
