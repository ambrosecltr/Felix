import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const webRoot = resolve(__dirname, "../web");

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@felix/core",
          "@felix/contracts",
          "@felix/shared",
          "@felix/mini-app-template",
        ],
      }),
    ],
    build: {
      outDir: "dist/main",
      lib: { entry: resolve(__dirname, "src/main/main.ts") },
      rollupOptions: {
        external: ["@earendil-works/pi-coding-agent"],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__dirname, "src/preload/preload.ts"),
        formats: ["cjs"],
        fileName: () => "preload.js",
      },
      rollupOptions: {
        // Bundle everything (incl. @felix/contracts) so the sandboxed preload
        // has no runtime require() of workspace packages.
        external: ["electron"],
      },
    },
  },
  renderer: {
    root: webRoot,
    // Relative asset paths so they resolve under file:// in the packaged app
    // (an absolute "/felix-icon.png" would point at the OS filesystem root).
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(webRoot, "src"),
      },
    },
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      rollupOptions: {
        input: resolve(webRoot, "index.html"),
      },
    },
  },
});
