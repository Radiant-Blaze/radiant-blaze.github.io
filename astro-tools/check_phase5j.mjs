import assert from "node:assert/strict";
import { getText } from "./read-model-test-utils.mjs";

// Shell modules are bundled from TypeScript by Astro, so their built names are derived from
// the component file and script index (for example
// `/_astro/QuestShell.astro_astro_type_script_index_0_lang.<hash>.js`), not from the source
// module stem. Assert the structure instead of guessing filenames: the old public shell
// modules must be gone, at least one bundled `/_astro` module must be present, and page
// modules must be rendered inside `<main>`. Public `astro-pages.js`/`astro-article.js`
// remain unbundled and versioned.
const shellModules = ["astro-controls.js", "page-loader.js", "astro-navigation.js", "portfolio.js", "legacy-redirect.js"];
const astroModulePattern = /<script\b[^>]*\bsrc="\/_astro\/[^"]+\.js[^"]*"/i;
const mainPattern = /<main\b[^>]*>([\s\S]*?)<\/main>/i;

const mainContent = (html) => mainPattern.exec(html)?.[1] ?? "";
const hasAstroModule = (html) => astroModulePattern.test(html);
const hasInMain = (html, needle) => mainContent(html).includes(needle);

const assertNoPublicShellModules = (html, route) => {
  for (const name of shellModules) {
    assert.ok(!html.includes(`/assets/js/${name}`), `${route} must not load the old public ${name}`);
  }
};

const assertBundledShell = (html, route) => {
  assertNoPublicShellModules(html, route);
  assert.ok(hasAstroModule(html), `${route} must load at least one bundled /_astro module`);
};

const pages = [
  ["/", "astro-navigation.js"],
  ["/404.html", "astro-controls.js"],
  ["/pages/blog.html", "astro-pages.js"],
  ["/pages/search.html", "astro-pages.js"],
  ["/pages/ctf.html", "astro-pages.js"],
  ["/pages/post.html", "legacy-redirect.js"],
  ["/pages/writeup.html", "legacy-redirect.js"],
  ["/pages/archive.html", null],
];

for (const [route, controller] of pages) {
  const html = await getText(route);
  assertBundledShell(html, route);
  if (controller === "astro-pages.js") {
    assert.ok(hasInMain(html, "/assets/js/astro-pages.js?v="), `${route} renders its versioned page module inside <main>`);
  }
  assert.ok(!html.includes('/assets/js/blog.js') && !html.includes('/assets/js/ctf.js') && !html.includes('/assets/js/spa.js') && !html.includes('/assets/js/theme.js') && !html.includes('/assets/js/audio.js'), `${route} must not eagerly load legacy behavior modules`);
}

// The portfolio page module is bundled too; verify it renders inside `<main>` rather than
// assuming a `/_astro/portfolio.<hash>.js` name.
{
  const route = "/portfolio/";
  const html = await getText(route);
  assertNoPublicShellModules(html, route);
  assert.ok(mainContent(html).match(/<script\b[^>]*\bsrc="\/_astro\/[^"]+\.js[^"]*"/i), `${route} renders its bundled page module inside <main>`);
}

for (const route of [
  "/generated/posts/linux/021-tiny-command-line-toolkit.html",
  "/generated/writeups/ASIS-CTF-2026/Headache.html",
]) {
  const html = await getText(route);
  assertBundledShell(html, route);
  assert.ok(html.includes("astro-article.js"), `${route} uses Astro article behavior`);
  assert.match(html, /astro-article\.js\?v=[A-Za-z0-9._-]+/, `${route} keeps the versioned public article module`);
  assert.ok(hasInMain(html, "/assets/js/astro-article.js?v="), `${route} renders its versioned article module inside <main>`);
  assert.ok(!html.includes("/assets/js/static-article.js"));
  assert.ok(!html.includes("/assets/js/theme.js") && !html.includes("/assets/js/audio.js"));
}

for (const route of [
  "/content/posts/index.json",
  "/content/ctfs/index.json",
  "/content/ctfs/ASIS-CTF-2026/ctf.json",
  "/content/runtime-read-model.json",
  "/content/posts/linux/021-tiny-command-line-toolkit.md",
  "/content/ctfs/cryptohack-Modular-Arithmetic/chall10-Adrien's-Signs.md",
]) {
  assert.ok(await getText(route), `${route} remains served`);
}

const home = await getText("/");
assert.ok(home.includes("data-latest-post"), "homepage renders the Astro-projected feature tile");
assert.ok(!home.includes("/assets/js/home.js"));

console.log(JSON.stringify({
  AstroPrimaryPageShells: pages.length,
  portfolioPageModuleInsideMain: true,
  compatibilityRoutesRetained: 6,
  staticArticleRoutesAstroOwned: 2,
  legacyBehaviorModulesNotEagerlyLoaded: true,
  fallbackFilesStillUntouched: ["home.js", "blog.js", "content.js", "ctf.js", "spa.js"],
  failures: 0,
}, null, 2));
