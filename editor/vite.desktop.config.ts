import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "/",
  plugins: [react(), wasm(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "studiocut-artcraft-runtime": path.resolve(import.meta.dirname, "src/vendor/artcraft-runtime-entry.ts"),
      "@assets": path.resolve(import.meta.dirname, "../../attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/desktop"),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(import.meta.dirname, "desktop.html") },
  },
});
