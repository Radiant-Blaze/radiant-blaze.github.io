/* Content validation for Radiant Blaze blog posts and CTF writeups.
 *
 * This is intentionally a focused script rather than a framework. It reuses the
 * frontmatter reader and Markdown renderer already used by the site, never
 * rewrites content, and never prints flag values.
 *
 * Run: npm run content:validate
 * Warnings are advisory; errors set a non-zero exit code.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFrontmatter, root, contentRoot, compareNatural } from "./content-sync/discover-content.mjs";
import { renderContentView } from "../src/lib/content-view.ts";

const POST_FIELDS = new Set([
  "title", "description", "date", "tags", "category", "difficulty", "xp",
  "thumbnail", "estimatedPlayTime", "author", "path",
]);
const WRITEUP_FIELDS = new Set([
  "title", "description", "category", "points", "difficulty", "flag", "solves", "tags", "author",
]);
const EVENT_FIELDS = new Set([
  "title", "event", "date", "difficulty", "url", "description", "challenges",
]);
const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FENCE_LANGUAGE = /^[^\s{]+$/;
const HIGHLIGHT_SPEC = /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;

export const STATIC_ROUTES = new Set([
  "/",
  "/404.html",
  "/pages/archive.html",
  "/pages/blog.html",
  "/pages/ctf.html",
  "/pages/post.html",
  "/pages/search.html",
  "/pages/writeup.html",
  "/portfolio/",
  "/topics.html",
  "/rss.xml",
  "/feed.json",
  "/sitemap.xml",
  "/astro-article-order.json",
  "/content/runtime-read-model.json",
]);

const issue = (severity, file, field, message, line) => ({ severity, file, field, message, line });
const error = (file, field, message, line) => issue("error", file, field, message, line);
const warning = (file, field, message, line) => issue("warning", file, field, message, line);

const isDateValue = (value) => {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
};

const checkString = (data, field, { required = false, allowEmpty = true } = {}) => {
  const value = data[field];
  if (value === undefined || value === null) {
    return required ? { error: "is required and must be a string" } : null;
  }
  if (typeof value !== "string") return { error: "must be a string" };
  if (!allowEmpty && !value.trim()) return { error: "must not be empty" };
  return null;
};

const checkNumberish = (data, field) => {
  const value = data[field];
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return null;
  if (typeof value === "string" && value.trim()) return null;
  return { warning: "should be a number or a non-empty string" };
};

const tagChecks = (data, file) => {
  const tags = data.tags;
  if (tags === undefined) return [];
  if (!Array.isArray(tags)) return [error(file, "tags", "must be an array of strings")];
  const found = [];
  const seen = new Map();
  for (const [index, tag] of tags.entries()) {
    if (typeof tag !== "string" || !tag.trim()) {
      found.push(error(file, `tags[${index}]`, "must be a non-empty string"));
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      found.push(warning(file, `tags[${index}]`, `duplicates "${seen.get(key)}" (tags are case-insensitive)`));
    } else {
      seen.set(key, tag);
    }
    if (tag !== tag.trim()) found.push(warning(file, `tags[${index}]`, "has leading/trailing whitespace"));
    if (!TAG_PATTERN.test(tag)) {
      found.push(warning(file, `tags[${index}]`, "should use lowercase kebab-case (letters, digits, hyphens)"));
    }
  }
  return found;
};

export function inspectFrontmatter(kind, data, file) {
  const issues = [];
  const allowed = kind === "post" ? POST_FIELDS : kind === "writeup" ? WRITEUP_FIELDS : EVENT_FIELDS;
  for (const field of Object.keys(data)) {
    if (!allowed.has(field)) issues.push(warning(file, field, `unexpected frontmatter field for ${kind}`));
  }

  if (kind === "post") {
    const title = checkString(data, "title", { required: true, allowEmpty: false });
    if (title) issues.push(error(file, "title", title.error));
    if (data.date === undefined || data.date === null) issues.push(error(file, "date", "is required"));
    else if (!isDateValue(data.date)) issues.push(error(file, "date", "must be a valid YYYY-MM-DD date"));
    for (const field of ["description", "category", "author", "estimatedPlayTime", "path"]) {
      const problem = checkString(data, field);
      if (problem) issues.push(error(file, field, problem.error));
    }
    for (const field of ["difficulty", "xp"]) {
      const problem = checkNumberish(data, field);
      if (problem) issues.push(warning(file, field, problem.warning));
    }
    const category = checkString(data, "category", { allowEmpty: false });
    if (category?.error) issues.push(error(file, "category", category.error));
    issues.push(...tagChecks(data, file));
  }

  if (kind === "writeup") {
    for (const field of ["title", "description", "category", "author"]) {
      const problem = checkString(data, field);
      if (problem) issues.push(error(file, field, problem.error));
    }
    const category = checkString(data, "category", { allowEmpty: false });
    if (category?.error) issues.push(error(file, "category", category.error));
    for (const field of ["points", "difficulty", "solves"]) {
      const problem = checkNumberish(data, field);
      if (problem) issues.push(warning(file, field, problem.warning));
    }
    if (data.flag !== undefined && data.flag !== null && typeof data.flag !== "string") {
      issues.push(error(file, "flag", "must be a YAML string (or empty/null); quote numeric, boolean, or structured values"));
    } else if (data.flag === "") {
      issues.push(warning(file, "flag", "is an empty string; omit the field or leave it null when no flag is captured"));
    }
    issues.push(...tagChecks(data, file));
  }

  if (kind === "event") {
    const title = checkString(data, "title", { required: true, allowEmpty: false });
    if (title) issues.push(error(file, "title", title.error));
    if (data.date === undefined || data.date === null) issues.push(error(file, "date", "is required"));
    else if (!isDateValue(data.date)) issues.push(error(file, "date", "must be a valid YYYY-MM-DD date"));
    if (data.challenges === undefined) issues.push(error(file, "challenges", "is required"));
    else if (!Array.isArray(data.challenges)) issues.push(error(file, "challenges", "must be an array of Markdown filenames"));
    for (const field of ["event", "description"]) {
      const problem = checkString(data, field);
      if (problem) issues.push(error(file, field, problem.error));
    }
    if (data.url !== undefined) {
      try {
        const url = new URL(data.url);
        if (!["http:", "https:"].includes(url.protocol)) issues.push(error(file, "url", "must use http or https"));
      } catch {
        issues.push(error(file, "url", "must be an absolute http(s) URL"));
      }
    }
    const problem = checkNumberish(data, "difficulty");
    if (problem) issues.push(warning(file, "difficulty", problem.warning));
  }

  return issues;
}

export function parseFenceInfo(info) {
  const result = { language: "", title: "", highlight: "", problems: [] };
  const trimmed = info.trim();
  if (!trimmed) return result;
  const [language, ...rest] = trimmed.split(/\s+/);
  result.language = language;
  if (!FENCE_LANGUAGE.test(language)) result.problems.push("language identifier must not contain whitespace or braces");
  let remaining = rest.join(" ");
  const titlePattern = /title=("([^"]*)"|'([^']*)')/;
  const titleMatch = titlePattern.exec(remaining);
  if (titleMatch) {
    result.title = titleMatch[2] ?? titleMatch[3] ?? "";
    remaining = remaining.replace(titlePattern, " ").trim();
    if (!result.title) result.problems.push("title must not be empty");
  }
  const highlight = /^\{\s*([\d,\s-]+)\s*\}/.exec(remaining)?.[1]?.replace(/\s+/g, "") ?? "";
  if (highlight) {
    result.highlight = highlight;
    remaining = remaining.slice(remaining.indexOf("}") + 1).trim();
    if (!HIGHLIGHT_SPEC.test(highlight)) result.problems.push("highlight selection must be line numbers or ranges like {2,5-7}");
    else {
      for (const part of highlight.split(",")) {
        const [start, end = start] = part.split("-").map(Number);
        if (end < start) result.problems.push(`highlight range ${part} is reversed`);
      }
    }
  }
  if (remaining) result.problems.push(`unrecognized code-fence metadata: ${remaining}`);
  return result;
}

const slugify = (text) =>
  text
    .replace(/[<>]/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";

export function inspectMarkdown(body, file) {
  const issues = [];
  const lines = body.split(/\r?\n/);
  let fence = null;
  let previousHeading = 0;
  const headingSlugs = new Map();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      if (new RegExp(`^\\s*${fence.marker}{${fence.size},}\\s*$`).test(line)) {
        if (fence.language.toLowerCase() === "mermaid" && fence.content === 0) {
          issues.push(warning(file, "mermaid", "block is empty and cannot render", fence.start));
        } else if (fence.content === 0) {
          issues.push(warning(file, "code fence", "is empty", fence.start));
        }
        fence = null;
      } else if (line.trim()) {
        fence.content++;
      }
      continue;
    }

    const opening = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening) {
      const info = opening[2].trim();
      const parsed = parseFenceInfo(info);
      for (const problem of parsed.problems) issues.push(warning(file, "code fence", problem, index + 1));
      fence = {
        marker: opening[1][0],
        size: opening[1].length,
        language: parsed.language,
        content: 0,
        start: index + 1,
      };
      continue;
    }

    if (/^#{1,6}\s*$/.test(line)) {
      issues.push(warning(file, "heading", "heading marker has no text", index + 1));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!heading) continue;
    const level = heading[1].length;
    // The content viewer demotes authored H1s to H2. Compare effective levels
    // so a document that uses H1 for major sections does not look broken.
    const effectiveLevel = level === 1 ? 2 : level;
    const label = heading[2].trim();
    if (previousHeading && effectiveLevel > previousHeading + 1) {
      issues.push(warning(file, "heading", `jumps from H${previousHeading} to H${effectiveLevel}; add the missing level`, index + 1));
    }
    previousHeading = effectiveLevel;
    const slug = slugify(label);
    if (headingSlugs.has(slug)) {
      issues.push(warning(file, "heading", `duplicates the slug "${slug}"; the renderer will suffix later IDs`, index + 1));
    } else {
      headingSlugs.set(slug, index + 1);
    }
  }

  if (fence) issues.push(error(file, "code fence", "is not closed", fence.start));
  return issues;
}

const decodeHtml = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function inspectLinks({ html, route, routes, assetExists, headingsForRoute }) {
  const issues = [];
  const safeDecode = (value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const targets = [];
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)) targets.push({ kind: "link", value: decodeHtml(match[1]) });
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = /\bsrc="([^"]*)"/i.exec(tag)?.[1];
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1];
    if (src) targets.push({ kind: "image", value: decodeHtml(src) });
    if (!alt || !decodeHtml(alt).trim()) issues.push(warning(null, "image", "has no alt text"));
  }

  for (const target of targets) {
    const href = target.value.trim();
    if (!href) {
      issues.push(error(null, target.kind, "has an empty destination"));
      continue;
    }
    if (/^(?:mailto:|tel:)/i.test(href)) continue;
    if (href.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (!/^https?:/i.test(href)) {
        issues.push(warning(null, target.kind, `uses an unusual external scheme: ${href.slice(0, 40)}`));
        continue;
      }
      try { new URL(href); } catch { issues.push(error(null, target.kind, "is not a valid external URL")); }
      continue;
    }

    let url;
    try {
      url = new URL(href, `https://site.invalid${route}`);
    } catch {
      issues.push(error(null, target.kind, "is not a valid internal URL"));
      continue;
    }
    const pathname = safeDecode(url.pathname);
    const hash = safeDecode(url.hash.replace(/^#/, ""));

    if (target.kind === "image") {
      const assetPath = pathname.replace(/^\/+/, "");
      if (!assetExists(pathname)) issues.push(error(null, "image", `local asset does not exist: ${pathname}`));
      else if (assetPath.startsWith("generated/")) issues.push(warning(null, "image", "relative images resolve under the generated route; prefer /images/ or /assets/"));
      continue;
    }

    if (STATIC_ROUTES.has(pathname)) {
      continue;
    }

    // Route keys are stored percent-encoded (`routeForWriteup`), while the
    // link pathname was decoded above, so normalize before the lookup
    // (e.g. "Introduction to CryptoHack" -> "Introduction%20to%20CryptoHack").
    const routeKey = pathname.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    const targetRoute = routes.get(routeKey) ?? routes.get(pathname);
    if (targetRoute) {
      if (hash) {
        const targetHeadings = headingsForRoute(routeKey);
        if (!targetHeadings || !targetHeadings.has(hash)) {
          issues.push(error(null, "link", `missing anchor #${hash} on ${pathname}`));
        }
      }
      continue;
    }

    if (pathname.startsWith("/content/")) {
      if (/^\/content\/(?:posts|ctfs)\/index\.json$/.test(pathname) || pathname === "/content/runtime-read-model.json") continue;
      if (!assetExists(pathname)) issues.push(error(null, "link", `content endpoint/file does not exist: ${pathname}`));
      continue;
    }

    if (pathname.startsWith("/topics/") || pathname.startsWith("/og/")) {
      // Generated from the content model; check:seo verifies the built routes.
      continue;
    }

    if (pathname.startsWith("/generated/") || pathname.startsWith("/pages/") || pathname.startsWith("/portfolio/")) {
      issues.push(error(null, "link", `internal route does not exist: ${pathname}`));
      continue;
    }

    if (pathname.startsWith("/assets/") || pathname.startsWith("/images/") || /\.[a-z0-9]{2,5}$/i.test(pathname)) {
      if (!assetExists(pathname)) issues.push(error(null, "link", `local asset does not exist: ${pathname}`));
      continue;
    }

    issues.push(warning(null, "link", `internal route not recognized by the validator: ${pathname}`));
  }
  return issues;
}

export function inspectEvent(event, file, files) {
  const issues = [];
  if (!Array.isArray(event.challenges)) return issues;
  const seen = new Set();
  for (const [index, challenge] of event.challenges.entries()) {
    if (typeof challenge !== "string" || !challenge.trim()) {
      issues.push(error(file, `challenges[${index}]`, "must be a non-empty Markdown filename"));
      continue;
    }
    if (!challenge.endsWith(".md")) issues.push(warning(file, `challenges[${index}]`, "does not end in .md"));
    if (seen.has(challenge)) issues.push(error(file, `challenges[${index}]`, `duplicate challenge reference: ${challenge}`));
    seen.add(challenge);
    if (!files.has(challenge)) issues.push(error(file, `challenges[${index}]`, `referenced writeup does not exist: ${challenge}`));
  }
  for (const name of files) {
    if (!seen.has(name)) issues.push(error(file, "challenges", `writeup is not listed and will not be reachable through navigation: ${name}`));
  }
  const prefixed = [...files].filter((name) => /^chall\d+-/i.test(name)).length;
  if (prefixed > 0 && prefixed < files.size) {
    issues.push(warning(file, "challenges", "mixed challenge filename conventions (some files use a challN- prefix, others do not)"));
  }
  return issues;
}

export function inspectCollections({ posts, writeups, events }) {
  const issues = [];
  const categoryVariants = new Map();
  const tagVariants = new Map();
  for (const item of [...posts, ...writeups]) {
    if (!item.data.category) continue;
    const key = String(item.data.category).toLowerCase();
    const set = categoryVariants.get(key) ?? new Set();
    set.add(item.data.category);
    categoryVariants.set(key, set);
    for (const tag of Array.isArray(item.data.tags) ? item.data.tags : []) {
      if (typeof tag !== "string") continue;
      const tagSet = tagVariants.get(tag.toLowerCase()) ?? new Set();
      tagSet.add(tag);
      tagVariants.set(tag.toLowerCase(), tagSet);
    }
  }
  for (const [key, variants] of categoryVariants) {
    if (variants.size > 1) issues.push(warning("content", "category", `inconsistent capitalization for "${key}": ${[...variants].join(", ")}`));
  }
  for (const [key, variants] of tagVariants) {
    if (variants.size > 1) issues.push(warning("content", "tags", `inconsistent capitalization for "${key}": ${[...variants].join(", ")}`));
  }
  const titles = new Map();
  for (const item of writeups) {
    const title = typeof item.data.title === "string" ? item.data.title.trim().toLowerCase() : "";
    if (!title) continue;
    const bucket = titles.get(item.eventId) ?? new Map();
    if (bucket.has(title)) issues.push(warning(item.file, "title", `duplicate challenge title within this event: ${item.data.title}`));
    else bucket.set(title, item.file);
    titles.set(item.eventId, bucket);
  }
  return issues;
}

const walkMarkdown = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => compareNatural(a.name, b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
};

const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const routeForPost = (file) =>
  `/generated/posts/${path.relative(path.join(contentRoot, "posts"), file).replace(/\\/g, "/").replace(/\.md$/i, ".html").split("/").map(encodeURIComponent).join("/")}`;
const routeForWriteup = (eventId, file) =>
  `/generated/writeups/${encodeURIComponent(eventId)}/${encodeURIComponent(path.basename(file, ".md") + ".html")}`;

const walkFiles = async (directory, prefix = "") => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walkFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
};

const main = async () => {
  const issues = [];
  const push = (items) => issues.push(...items);
  const postFiles = await walkMarkdown(path.join(contentRoot, "posts"));
  const posts = [];
  for (const file of postFiles) {
    try {
      const { data, body } = await readFrontmatter(file);
      posts.push({ file: relative(file), data, body });
      push(inspectFrontmatter("post", data, relative(file)));
      push(inspectMarkdown(body, relative(file)));
    } catch (caught) {
      push([error(relative(file), "frontmatter", caught.message)]);
    }
  }

  const eventDirs = (await readdir(path.join(contentRoot, "ctfs"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => compareNatural(a.name, b.name));
  const events = [];
  const writeups = [];
  for (const eventDir of eventDirs) {
    const eventRoot = path.join(contentRoot, "ctfs", eventDir.name);
    const metadataFile = path.join(eventRoot, "ctf.json");
    let metadata;
    try {
      metadata = JSON.parse(await readFile(metadataFile, "utf8"));
      push(inspectFrontmatter("event", metadata, relative(metadataFile)));
    } catch (caught) {
      push([error(relative(metadataFile), "metadata", caught.code === "ENOENT" ? "missing ctf.json" : caught.message)]);
      continue;
    }
    const files = (await readdir(eventRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort(compareNatural);
    push(inspectEvent(metadata, relative(metadataFile), new Set(files)));
    events.push({ id: eventDir.name, file: relative(metadataFile), data: metadata });
    for (const name of files) {
      const file = path.join(eventRoot, name);
      try {
        const { data, body } = await readFrontmatter(file);
        writeups.push({ file: relative(file), data, body, eventId: eventDir.name });
        push(inspectFrontmatter("writeup", data, relative(file)));
        push(inspectMarkdown(body, relative(file)));
      } catch (caught) {
        push([error(relative(file), "frontmatter", caught.message)]);
      }
    }
  }

  // Index/event references.
  const postIndexFile = path.join(contentRoot, "posts/index.json");
  const ctfIndexFile = path.join(contentRoot, "ctfs/index.json");
  try {
    const postIndex = JSON.parse(await readFile(postIndexFile, "utf8"));
    if (!Array.isArray(postIndex.posts) || postIndex.posts.some((item) => typeof item !== "string")) {
      push([error(relative(postIndexFile), "posts", "must be an array of strings")]);
    } else if (new Set(postIndex.posts).size !== postIndex.posts.length) {
      push([error(relative(postIndexFile), "posts", "contains duplicate entries")]);
    } else {
      const listed = new Set(postIndex.posts);
      for (const file of postFiles) {
        const key = path.relative(path.join(contentRoot, "posts"), file).replace(/\\/g, "/");
        if (!listed.has(key)) push([error(relative(file), "index", "is not listed in content/posts/index.json; run npm run content:sync")]);
      }
      for (const key of listed) {
        if (!postFiles.some((file) => path.relative(path.join(contentRoot, "posts"), file).replace(/\\/g, "/") === key)) {
          push([error(relative(postIndexFile), "posts", `references missing post: ${key}`)]);
        }
      }
    }
  } catch (caught) {
    push([error(relative(postIndexFile), "posts", caught.message)]);
  }
  try {
    const ctfIndex = JSON.parse(await readFile(ctfIndexFile, "utf8"));
    if (!Array.isArray(ctfIndex.ctfs) || ctfIndex.ctfs.some((item) => typeof item !== "string")) {
      push([error(relative(ctfIndexFile), "ctfs", "must be an array of strings")]);
    } else if (new Set(ctfIndex.ctfs).size !== ctfIndex.ctfs.length) {
      push([error(relative(ctfIndexFile), "ctfs", "contains duplicate entries")]);
    } else {
      const dirs = new Set(eventDirs.map((entry) => entry.name));
      for (const id of ctfIndex.ctfs) if (!dirs.has(id)) push([error(relative(ctfIndexFile), "ctfs", `references missing event directory: ${id}`)]);
      for (const id of dirs) if (!ctfIndex.ctfs.includes(id)) push([error(relative(ctfIndexFile), "ctfs", `event is not listed in content/ctfs/index.json: ${id}`)]);
    }
  } catch (caught) {
    push([error(relative(ctfIndexFile), "ctfs", caught.message)]);
  }

  push(inspectCollections({ posts, writeups, events }));

  // Render each document once for heading IDs and link extraction.
  const rendered = new Map();
  const routes = new Map();
  for (const post of posts) {
    try {
      const view = await renderContentView(post.body, { highlightCode: false });
      rendered.set(post.file, view);
      routes.set(routeForPost(path.join(root, post.file)), { file: post.file, headings: view.headings });
    } catch (caught) {
      push([error(post.file, "markdown", caught.message)]);
    }
  }
  for (const writeup of writeups) {
    try {
      const view = await renderContentView(writeup.body, { highlightCode: false });
      rendered.set(writeup.file, view);
      routes.set(routeForWriteup(writeup.eventId, path.basename(writeup.file)), { file: writeup.file, headings: view.headings });
    } catch (caught) {
      push([error(writeup.file, "markdown", caught.message)]);
    }
  }
  const flatten = (nodes) => nodes.flatMap((node) => [node.id, ...flatten(node.children)]);
  const headingsForRoute = (route) => {
    const target = routes.get(route);
    if (!target) return null;
    const view = rendered.get(target.file);
    return view ? new Set(flatten(view.headings)) : null;
  };
  const publicFiles = new Set(await walkFiles(path.join(root, "public")));
  const contentFiles = new Set(await walkFiles(contentRoot));
  const compatFiles = new Set(await walkFiles(path.join(root, "compat")));
  const assetExists = (pathname) => {
    const clean = pathname.replace(/^\/+/, "");
    if (!clean || clean.includes("..")) return false;
    if (clean.startsWith("content/")) return contentFiles.has(clean.slice("content/".length));
    if (clean.startsWith("legacy/")) return compatFiles.has(clean.replace(/^legacy\/assets\/js\//, "legacy-assets/js/"));
    return publicFiles.has(clean);
  };
  for (const [file, view] of rendered) {
    const route = posts.some((post) => post.file === file) ? routeForPost(path.join(root, file)) : null;
    const writeup = writeups.find((item) => item.file === file);
    const actualRoute = route ?? routeForWriteup(writeup.eventId, path.basename(writeup.file));
    const found = inspectLinks({
      html: view.html,
      route: actualRoute,
      routes,
      assetExists,
      headingsForRoute,
    });
    for (const item of found) {
      item.file = file;
      issues.push(item);
    }
  }

  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  const sortKey = (item) => `${item.file ?? ""}\u0000${item.line ?? 0}\u0000${item.field ?? ""}\u0000${item.message}`;
  const ordered = [...errors.sort((a, b) => sortKey(a).localeCompare(sortKey(b))), ...warnings.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))];

  for (const item of ordered) {
    const location = [item.file ?? "content", item.line ? ` (body line ${item.line})` : "", item.field ? ` [${item.field}]` : ""].join("");
    console.error(`${item.severity.toUpperCase()} ${location}: ${item.message}`);
  }
  console.log(`Content validation: ${errors.length} error(s), ${warnings.length} warning(s).`);
  if (errors.length) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
