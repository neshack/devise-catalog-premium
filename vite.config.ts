import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // La versión que muestra la ventana sale del mismo package.json del que
  // sale el instalador (tauri.conf.json apunta a él): una sola fuente, sin
  // que lo instalado y lo que corre puedan discrepar.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Tauri expects a fixed port, fail if it is unavailable.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
  test: {
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
