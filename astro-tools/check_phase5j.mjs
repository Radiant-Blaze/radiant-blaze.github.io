import assert from "node:assert/strict";
import { getText } from "./read-model-test-utils.mjs";

const pages = [
  ["/", "astro-navigation.js"],
  ["/404.html", "astro-controls.js"],
  ["/pages/blog.html", "astro-pages.js"],
  ["/pages/search.html", "astro-pages.js"],
  ["/pages/ctf.html", "astro-pages.js"],
  ["/pages/post.html", "astro-pages.js"],
  ["/pages/writeup.html", "astro-pages.js"],
  ["/pages/archive.html", null],
];

for (const [route, controller] of pages) {
  const html = await getText(route);
  if (controller === "astro-pages.js") {
    assert.ok(html.includes(controller), `${route} must use Astro primary page behavior`);
    assert.ok(html.includes("astro-navigation.js"), `${route} must use Astro primary navigation`);
    assert.ok(html.includes("astro-controls.js"), `${route} must use Astro primary controls`);
  } else if (controller) {
    assert.ok(html.includes(controller), `${route} must use Astro primary behavior`);
  }
  assert.ok(!html.includes('/assets/js/blog.js') && !html.includes('/assets/js/ctf.js') && !html.includes('/assets/js/spa.js') && !html.includes('/assets/js/theme.js') && !html.includes('/assets/js/audio.js'), `${route} must not eagerly load legacy behavior modules`);
}

for (const route of [
  "/generated/posts/linux/021-tiny-command-line-toolkit.html",
  "/generated/writeups/ASIS-CTF-2026/Headache.html",
]) {
  const html = await getText(route);
  assert.ok(html.includes("astro-controls.js"), `${route} uses Astro controls`);
  assert.ok(html.includes("astro-article.js"), `${route} uses Astro article behavior`);
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
assert.ok(home.includes("astro feature") || home.includes("Hackel"));
assert.ok(!home.includes("/assets/js/home.js"));

console.log(JSON.stringify({
  AstroPrimaryPageShells: pages.length,
  compatibilityRoutesRetained: 6,
  staticArticleRoutesAstroOwned: 2,
  legacyBehaviorModulesNotEagerlyLoaded: true,
  fallbackFilesStillUntouched: ["home.js", "blog.js", "content.js", "ctf.js", "spa.js"],
  failures: 0,
}, null, 2));