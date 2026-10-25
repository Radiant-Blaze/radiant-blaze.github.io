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
  vite: {
    resolve: { alias: viteCompat },
  },
  integrations: [sourceAssetsIntegration()],
});
