import { defineConfig } from "astro/config";
import { sourceAssetsIntegration } from "./astro-tools/source-assets.mjs";

export default defineConfig({
  site: "https://radiant-blaze.github.io",
  srcDir: "./src",
  publicDir: "./public",
  outDir: "./dist",
  output: "static",
  build: { format: "file" },
  integrations: [sourceAssetsIntegration()],
});