import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Validates the built site in `dist/` for technical SEO regressions. It reads
// the generated HTML, sitemap, and robots.txt instead of trusting the build
// exit code. Run `npm run build` first, then `npm run check:seo`.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const ORIGIN = "https://radiant-blaze.github.io";

// Pages that intentionally carry `noindex` or redirect; they are exempt from
// title/description/canonical expectations but still checked for valid JSON-LD.
const NON_INDEXABLE = new Set(["404.html", "pages/post.html", "pages/writeup.html", "pages/archive.html"]);

const failures = [];
const warnings = [];
const recommendations = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);
const recommend = (file, message) => recommendations.push(`${file}: ${message}`);

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });

const toKey = (absolute) => path.relative(DIST, absolute).split(path.sep).join("/");
const read = (file) => fs.readFileSync(file, "utf8");
const encodePath = (value) =>
  value
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const htmlFiles = walk(DIST).filter((file) => file.endsWith(".html"));
if (htmlFiles.length === 0) {
  console.error("dist/ has no HTML output. Run `npm run build` first.");
  process.exit(1);
}

const attributes = (tag) => {
  const result = new Map();
  for (const match of tag.matchAll(/([a-zA-Z:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    result.set(match[1].toLowerCase(), match[3] ?? match[4] ?? match[5] ?? "");
  }
  return result;
};

const collectTypes = (value, types = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTypes(item, types));
  } else if (value && typeof value === "object") {
    const declared = value["@type"];
    for (const type of Array.isArray(declared) ? declared : declared ? [declared] : []) types.add(type);
    Object.values(value).forEach((item) => collectTypes(item, types));
  }
  return types;
};

const pages = new Map();
const canonicals = new Map();

for (const file of htmlFiles) {
  const key = toKey(file);
  const html = read(file);
  const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const descriptionTags = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((tag) => tag.get("name") === "description");
  const canonicalTags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((tag) => tag.get("rel") === "canonical");
  const noindex = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .some((tag) => tag.get("name") === "robots" && /noindex/i.test(tag.get("content") || ""));

  const jsonLd = [];
  for (const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(match[1]));
    } catch (error) {
      fail(key, `invalid JSON-LD: ${error.message}`);
    }
  }

  const links = [...html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)].map((match) => match[1]);
  const page = {
    key,
    html,
    title: titleMatch ? titleMatch[1].trim() : "",
    description: descriptionTags[0]?.get("content")?.trim() || "",
    canonical: canonicalTags[0]?.get("href")?.trim() || "",
    canonicalCount: canonicalTags.length,
    noindex,
    jsonLd,
    types: jsonLd.reduce((types, block) => collectTypes(block, types), new Set()),
    links,
  };
  pages.set(key, page);

  if (!page.title) fail(key, "missing <title>");
  else if (page.title.length > 65) warn(key, `title is ${page.title.length} characters (guideline: 65)`);
  else if (page.title.length < 20) warn(key, `title is only ${page.title.length} characters`);
  else if (/^(untitled|post|writeup|article)$/i.test(page.title)) recommend(key, `generic title: "${page.title}"`);
  if (page.canonicalCount > 1) fail(key, `has ${page.canonicalCount} canonical links`);
  if (page.canonical && !page.canonical.startsWith(`${ORIGIN}/`)) {
    fail(key, `canonical is not on ${ORIGIN}: ${page.canonical}`);
  }

  if (NON_INDEXABLE.has(key) || page.noindex) continue;

  if (!page.description) fail(key, "missing meta description");
  else if (page.description.length < 50) warn(key, `short meta description (${page.description.length} chars)`);
  else if (page.description.length > 200) warn(key, `long meta description (${page.description.length} chars)`);

  const expected = key.endsWith("index.html")
    ? `${ORIGIN}/${key === "index.html" ? "" : `${encodePath(path.posix.dirname(key))}/`}`
    : `${ORIGIN}/${encodePath(key)}`;
  if (!page.canonical) fail(key, "missing canonical link");
  else if (page.canonical !== expected) fail(key, `canonical does not match the page URL (expected ${expected})`);

  if (page.canonical) {
    if (canonicals.has(page.canonical)) fail(key, `duplicate canonical with ${canonicals.get(page.canonical)}: ${page.canonical}`);
    else canonicals.set(page.canonical, key);
  }
}

const hasType = (page, type) => page?.types.has(type);
const articleOrder = JSON.parse(read(path.join(DIST, "astro-article-order.json")));
const postRoutes = articleOrder.filter((route) => route.startsWith("generated/posts/"));
const writeupRoutes = articleOrder.filter((route) => route.startsWith("generated/writeups/"));

// Listing pages: crawlable links to every published item.
const linkTargets = (page) => page.links.map((href) => decode(href.split(/[?#]/)[0]));
const blog = pages.get("pages/blog.html");
const ctf = pages.get("pages/ctf.html");
const portfolio = pages.get("portfolio/index.html");

if (!blog) fail("pages/blog.html", "listing page is missing");
else {
  const targets = new Set(linkTargets(blog));
  for (const route of postRoutes) {
    if (!targets.has(`/${route}`)) fail("pages/blog.html", `missing crawlable link to /${route}`);
  }
  if (!hasType(blog, "CollectionPage")) fail("pages/blog.html", "missing CollectionPage JSON-LD");
  if (!hasType(blog, "ItemList")) fail("pages/blog.html", "missing ItemList JSON-LD");
  if (!hasType(blog, "BreadcrumbList")) fail("pages/blog.html", "missing BreadcrumbList JSON-LD");
}

if (!ctf) fail("pages/ctf.html", "listing page is missing");
else {
  const targets = new Set(linkTargets(ctf));
  for (const route of writeupRoutes) {
    if (!targets.has(`/${route}`)) fail("pages/ctf.html", `missing crawlable link to /${route}`);
  }
  if (!hasType(ctf, "CollectionPage")) fail("pages/ctf.html", "missing CollectionPage JSON-LD");
  if (!hasType(ctf, "ItemList")) fail("pages/ctf.html", "missing ItemList JSON-LD");
  if (!hasType(ctf, "BreadcrumbList")) fail("pages/ctf.html", "missing BreadcrumbList JSON-LD");
}

if (!portfolio) fail("portfolio/index.html", "listing page is missing");
else {
  const targets = new Set(linkTargets(portfolio));
  const projectRoutes = [...pages.keys()].filter((key) => key.startsWith("portfolio/projects/"));
  for (const route of projectRoutes) {
    if (!targets.has(`/${route}`)) fail("portfolio/index.html", `missing crawlable link to /${route}`);
  }
  if (!hasType(portfolio, "ProfilePage")) fail("portfolio/index.html", "missing ProfilePage JSON-LD");
  if (!hasType(portfolio, "ItemList")) fail("portfolio/index.html", "missing ItemList JSON-LD");
}

// Homepage and article schemas.
const home = pages.get("index.html");
if (!home) fail("index.html", "homepage is missing");
else {
  if (!hasType(home, "WebSite")) fail("index.html", "missing WebSite JSON-LD");
  if (!hasType(home, "Person")) fail("index.html", "missing Person JSON-LD");
}

for (const [key, page] of pages) {
  if (key.startsWith("generated/posts/")) {
    if (!hasType(page, "BlogPosting")) fail(key, "missing BlogPosting JSON-LD");
    if (!hasType(page, "Person")) fail(key, "missing Person author JSON-LD");
    if (!hasType(page, "BreadcrumbList")) fail(key, "missing BreadcrumbList JSON-LD");
  }
  if (key.startsWith("generated/writeups/")) {
    if (!hasType(page, "TechArticle")) fail(key, "missing TechArticle JSON-LD");
    if (!hasType(page, "Person")) fail(key, "missing Person author JSON-LD");
    if (!hasType(page, "BreadcrumbList")) fail(key, "missing BreadcrumbList JSON-LD");
  }
  if (key.startsWith("portfolio/projects/")) {
    if (!hasType(page, "CreativeWork")) fail(key, "missing CreativeWork JSON-LD");
    if (!hasType(page, "BreadcrumbList")) fail(key, "missing BreadcrumbList JSON-LD");
  }
}

// Sitemap: every entry resolves to generated HTML; every article is listed.
const sitemapPath = path.join(DIST, "sitemap.xml");
if (!fs.existsSync(sitemapPath)) fail("sitemap.xml", "sitemap is missing");
else {
  const sitemap = read(sitemapPath);
  const locs = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => match[1].trim());
  if (locs.length === 0) fail("sitemap.xml", "contains no <loc> entries");
  if (new Set(locs).size !== locs.length) fail("sitemap.xml", "contains duplicate URLs");

  const resolve = (url) => {
    if (!url.startsWith(`${ORIGIN}/`)) return null;
    const route = decode(url.slice(ORIGIN.length + 1));
    if (route === "" || route.endsWith("/")) return `${route}index.html`;
    return route;
  };
  const listed = new Set();
  for (const loc of locs) {
    const key = resolve(loc);
    if (key === null) {
      fail("sitemap.xml", `URL is not on ${ORIGIN}: ${loc}`);
      continue;
    }
    listed.add(key);
    if (!fs.existsSync(path.join(DIST, key))) fail("sitemap.xml", `URL has no generated page: ${loc}`);
  }
  for (const route of articleOrder) {
    if (!listed.has(route)) fail("sitemap.xml", `published article is missing from the sitemap: /${route}`);
  }
}

// robots.txt must point crawlers at the same sitemap.
const robotsPath = path.join(DIST, "robots.txt");
if (!fs.existsSync(robotsPath)) fail("robots.txt", "robots.txt is missing");
else if (!read(robotsPath).includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) {
  fail("robots.txt", `does not advertise Sitemap: ${ORIGIN}/sitemap.xml`);
}

// Internal links must resolve to generated files or public assets.
const resolveInternal = (href) => {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const raw = decode(href.split(/[?#]/)[0]);
  if (!raw || raw === "/") return "index.html";
  const relative = raw.replace(/^\//, "");
  const candidates = [relative];
  if (raw.endsWith("/")) candidates.push(`${relative}index.html`);
  else {
    if (!path.extname(relative)) candidates.push(`${relative}.html`, `${relative}/index.html`);
    candidates.push(`${relative}index.html`);
  }
  const found = candidates.find((candidate) => fs.existsSync(path.join(DIST, candidate)) && fs.statSync(path.join(DIST, candidate)).isFile());
  return found ?? null;
};

for (const [key, page] of pages) {
  for (const href of page.links) {
    if (href.startsWith("/") && !href.startsWith("//") && resolveInternal(href) === null) {
      fail(key, `internal link does not resolve: ${href}`);
    }
  }
}

// --- Article structure ------------------------------------------------------
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const articleBody = (page) => {
  const match = /<article\b[^>]*class="[^"]*quest-article[^"]*"[^>]*>([\s\S]*?)<\/article>/i.exec(page.html);
  return match ? match[1] : "";
};

for (const [key, page] of pages) {
  if (NON_INDEXABLE.has(key) || page.noindex) continue;
  const headings = [...page.html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const levelOne = headings.filter((match) => match[1] === "1");
  if (levelOne.length === 0) fail(key, "missing H1 heading");
  if (levelOne.length > 1) fail(key, `has ${levelOne.length} H1 headings`);
  for (const heading of headings) {
    if (!textOf(heading[2])) warn(key, `empty H${heading[1]} heading`);
    else if (/^(section|content|details|more|read more|untitled)$/i.test(textOf(heading[2]))) {
      recommend(key, `generic H${heading[1]} heading: "${textOf(heading[2])}"`);
    }
  }
}

for (const [key, page] of pages) {
  if (!key.startsWith("generated/")) continue;
  const body = articleBody(page);
  if (!body) {
    fail(key, "article body is missing");
    continue;
  }
  const firstParagraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(body);
  const intro = firstParagraph ? textOf(firstParagraph[1]) : "";
  if (intro.length < 40) warn(key, `article introduction is shorter than 40 characters (${intro.length})`);
  const internalLinks = [...body.replace(/<nav\b[\s\S]*?<\/nav>/gi, "").matchAll(/<a\b[^>]*href="\/(?!\/)[^"]*"/gi)].length;
  if (internalLinks === 0) recommend(key, "no contextual internal links in the article body");
}

// --- Duplicate metadata -----------------------------------------------------
const byTitle = new Map();
const byDescription = new Map();
for (const [key, page] of pages) {
  if (NON_INDEXABLE.has(key) || page.noindex) continue;
  if (page.title) byTitle.set(page.title, [...(byTitle.get(page.title) ?? []), key]);
  if (page.description) byDescription.set(page.description, [...(byDescription.get(page.description) ?? []), key]);
}
for (const [title, keys] of byTitle) {
  if (keys.length > 1) warn(keys.join(", "), `duplicate title: "${title}"`);
}
for (const [description, keys] of byDescription) {
  if (keys.length > 1) warn(keys.join(", "), `duplicate description shared by ${keys.length} pages`);
}

// --- Keyword mapping --------------------------------------------------------
const keywordMapPath = path.join(ROOT, "astro-tools", "seo-keywords.json");
if (!fs.existsSync(keywordMapPath)) {
  warn("seo-keywords.json", "keyword mapping file is missing");
} else {
  const mapping = JSON.parse(fs.readFileSync(keywordMapPath, "utf8"));
  const entries = Array.isArray(mapping.pages) ? mapping.pages : [];
  const byPrimary = new Map();
  for (const entry of entries) {
    if (!entry.route || !entry.primary) {
      fail("seo-keywords.json", "entry is missing `route` or `primary`");
      continue;
    }
    const page = pages.get(entry.route.replace(/^\//, ""));
    if (!page) fail("seo-keywords.json", `mapped route has no generated page: ${entry.route}`);
    const primary = entry.primary.toLowerCase().replace(/\s+/g, " ").trim();
    byPrimary.set(primary, [...(byPrimary.get(primary) ?? []), entry.route]);
    if (!page) continue;
    const h1Text = [...page.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => textOf(match[1])).join(" ");
    const visible = `${page.title} ${page.description} ${h1Text} ${textOf(articleBody(page))}`.toLowerCase();
    const tokens = primary.split(" ").filter((token) => token.length > 3);
    const matched = tokens.filter((token) => visible.includes(token)).length;
    if (tokens.length > 0 && matched / tokens.length < 0.5) {
      recommend(entry.route, `primary keyword "${entry.primary}" is not reflected in the page metadata or body`);
    }
  }
  for (const [primary, routes] of byPrimary) {
    if (routes.length > 1) fail(routes.join(", "), `overlapping search intent: "${primary}" is claimed by ${routes.length} pages`);
  }
  for (const route of articleOrder) {
    if (!entries.some((entry) => entry.route === route)) {
      warn(route, "no keyword mapping entry");
    }
  }
}

const report = (label, items) => {
  if (items.length === 0) return;
  console.error(`\n${label} (${items.length}):`);
  for (const item of items) console.error(`  - ${item}`);
};

console.log(
  `SEO audit: ${pages.size} HTML pages, ${articleOrder.length} articles, ${canonicals.size} canonical URLs.`,
);
report("ERRORS", failures);
report("WARNINGS", warnings);
report("RECOMMENDATIONS", recommendations);

if (failures.length > 0) {
  console.error(`\nSEO validation failed with ${failures.length} failure(s).`);
  process.exit(1);
}
console.log("SEO validation passed.");
