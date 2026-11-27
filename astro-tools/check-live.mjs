import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Recurring SEO monitor for the deployed site. Retries the checks from
// `check-seo.mjs` against the live origin instead of `dist/`: availability,
// canonical consistency, sitemap coverage, robots.txt and JSON-LD.
//
//   npm run check:live
//   SITE_URL=http://127.0.0.1:4321 npm run check:live
//
// No credentials and no external API; intentionally not wired into CI because
// publishing and monitoring schedule changes need explicit authorization.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = (process.env.SITE_URL || "https://radiant-blaze.github.io").replace(/\/$/, "");
const siteMatch = /site:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "astro.config.mjs"), "utf8"));
if (!siteMatch) {
  console.error("astro.config.mjs does not declare a `site`.");
  process.exit(1);
}
// Requests go to ORIGIN (live site or a local preview), but canonical URLs and
// sitemap entries must always describe the production host.
const CANONICAL_ORIGIN = siteMatch[1].replace(/\/$/, "");
const CONCURRENCY = 4;
const TIMEOUT_MS = 30000;

const DIST = path.join(ROOT, "dist");
if (!fs.existsSync(path.join(DIST, "astro-article-order.json"))) {
  console.error("dist/ is missing. Run `npm run build` first to get the expected route list.");
  process.exit(1);
}

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const articleOrder = JSON.parse(fs.readFileSync(path.join(DIST, "astro-article-order.json"), "utf8"));
const LISTINGS = ["pages/blog.html", "pages/ctf.html", "portfolio/index.html"];
const expectedRoutes = ["index.html", ...LISTINGS, ...articleOrder];

const failures = [];
const warnings = [];
const fail = (route, message) => failures.push(`${route}: ${message}`);
const warn = (route, message) => warnings.push(`${route}: ${message}`);

const routeUrl = (route) => {
  const clean = route === "index.html" ? "" : route;
  return `${ORIGIN}/${clean.split("/").map(encodeURIComponent).join("/")}`.replace(/index\.html$/, "");
};

const fetchText = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "radiant-blaze-seo-monitor/1.0" },
      redirect: "follow",
    });
    const body = await response.text();
    return { status: response.status, url: response.url, body, ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 0, url, body: "", ms: Math.round(performance.now() - started), error: String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const attribute = (tag, name) => {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return match ? match[1] : "";
};

const checkPage = async (route) => {
  const expectedUrl = routeUrl(route);
  const result = await fetchText(expectedUrl);
  const absolute = route === "index.html" ? `${CANONICAL_ORIGIN}/` : expectedUrl.replace(ORIGIN, CANONICAL_ORIGIN);
  if (result.status !== 200) {
    fail(route, `HTTP ${result.status}${result.error ? ` (${result.error})` : ""}`);
    return;
  }
  if (result.ms > 2000) warn(route, `slow response: ${result.ms} ms`);
  const html = result.body;
  const canonical = /<link\b[^>]*rel="canonical"[^>]*>/i.exec(html);
  if (!canonical) fail(route, "missing canonical link");
  else {
    const href = attribute(canonical[0], "href");
    if (decode(href) !== decode(absolute)) fail(route, `canonical ${href} does not match ${absolute}`);
  }
  const robots = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => attribute(match[0], "content"))
    .some((content) => /noindex/i.test(content));
  if (robots) fail(route, "page is marked noindex");
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(route, "missing title");
  const description = /<meta\b[^>]*name="description"[^>]*>/i.exec(html);
  if (!description) fail(route, "missing meta description");

  const blocks = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) fail(route, "no JSON-LD on the live page");
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const serialized = JSON.stringify(parsed);
      if (route.startsWith("generated/writeups/") && !serialized.includes("TechArticle")) {
        fail(route, "JSON-LD is missing TechArticle");
      }
      if (route.startsWith("generated/posts/") && !serialized.includes("BlogPosting")) {
        fail(route, "JSON-LD is missing BlogPosting");
      }
    } catch (error) {
      fail(route, `invalid JSON-LD: ${error.message}`);
    }
  }
};

const robots = await fetchText(`${ORIGIN}/robots.txt`);
if (robots.status !== 200) fail("robots.txt", `HTTP ${robots.status}`);
else if (!robots.body.includes(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`)) {
  fail("robots.txt", "does not advertise the sitemap");
}

const sitemap = await fetchText(`${ORIGIN}/sitemap.xml`);
const sitemapLocs = sitemap.status === 200
  ? [...sitemap.body.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => match[1].trim())
  : [];
if (sitemap.status !== 200) fail("sitemap.xml", `HTTP ${sitemap.status}`);
else if (sitemapLocs.length === 0) fail("sitemap.xml", "contains no URLs");
else {
  if (new Set(sitemapLocs).size !== sitemapLocs.length) fail("sitemap.xml", "contains duplicate URLs");
  for (const loc of sitemapLocs) {
    if (!loc.startsWith(`${CANONICAL_ORIGIN}/`)) fail("sitemap.xml", `foreign hostname: ${loc}`);
  }
  for (const route of expectedRoutes) {
    const absolute = route === "index.html" ? `${CANONICAL_ORIGIN}/` : routeUrl(route).replace(ORIGIN, CANONICAL_ORIGIN);
    if (!sitemapLocs.some((loc) => decode(loc) === decode(absolute))) {
      fail("sitemap.xml", `missing expected route: ${absolute}`);
    }
  }
}

const queue = [...expectedRoutes];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const route = queue.shift();
    await checkPage(route);
  }
});
await Promise.all(workers);

const report = (label, items) => {
  if (items.length === 0) return;
  console.error(`\n${label} (${items.length}):`);
  for (const item of items) console.error(`  - ${item}`);
};

console.log(`Live SEO audit: ${ORIGIN} — ${expectedRoutes.length} pages, ${sitemapLocs.length} sitemap URLs.`);
report("ERRORS", failures);
report("WARNINGS", warnings);
if (failures.length > 0) {
  console.error(`\nLive SEO audit failed with ${failures.length} error(s).`);
  process.exit(1);
}
console.log("Live SEO audit passed.");
