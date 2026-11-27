import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { sourceAssetsIntegration } from "./astro-tools/source-assets.mjs";

const viteCompat = {
  yaml: fileURLToPath(new URL("./astro-tools/vite-compat/yaml.mjs", import.meta.url)),
  picomatch: fileURLToPath(new URL("./astro-tools/vite-compat/picomatch.mjs", import.meta.url)),
};


export default defineConfig({
  site: "https://radiant-blaze.github.io",
  srcDir: "./src",
  publicDir: "./public",
  outDir: "./dist",
  output: "static",
  build: { format: "file" },
  // The floating toolbar sits over page content during local previews.
  devToolbar: { enabled: false },
  vite: {
    resolve: { alias: viteCompat },
    build: {
      // Defensive: keep any small JS chunk external so the SPA router always
      // has a `src` to discover after a <main> swap. Current entries already
      // emit externally; this prevents a future small chunk from inlining.
      assetsInlineLimit: (filePath) => (filePath.endsWith(".js") ? false : undefined),
    },
  },
  integrations: [sourceAssetsIntegration()],
});
