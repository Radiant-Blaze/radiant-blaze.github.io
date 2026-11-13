// Shared content helpers: markdown parsing, data loading, formatting.
// Imported by both blog.js (post pages) and home.js (landing page).

import { escapeHtml, markdownToHtml } from "./markdown-renderer.js";

// Re-exported so existing consumers keep importing both from this module.
export { escapeHtml, markdownToHtml };

export const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(new Date(`${date}T00:00:00`))
    .toUpperCase();

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export const postPageUrl = (file) =>
  `/generated/posts/${encodePath(file.replace(/\.md$/i, ".html"))}`;

export const writeupPageUrl = (ctfId, file) =>
  `/generated/writeups/${encodeURIComponent(ctfId)}/${encodeURIComponent(file.replace(/\.md$/i, ".html"))}`;

export const socialHtml = (social = []) =>
  social
    .map((item) => {
      const icon = `<span aria-hidden="true">${item.icon}</span>`;
      // A placeholder entry ("coming soon") is not a destination yet, and
      // rendering it as an anchor sends visitors to a 404.
      if (!/^(https?:|mailto:)/i.test(item.url || ""))
        return `<span class="social-link is-pending" title="${item.label} · coming soon" aria-label="${item.label} · coming soon">${icon}</span>`;
      const external = !item.url.startsWith("mailto:");
      return `<a class="social-link" href="${item.url}"${external ? ' target="_blank" rel="noopener"' : ""} aria-label="${item.label}">${icon}</a>`;
    })
    .join("");

export const updatePageMetadata = ({ title, description, canonicalUrl }) => {
  const setMeta = (attribute, key, value) => {
    const selector = `meta[${attribute}="${key}"]`;
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.setAttribute("content", value);
  };

  document.title = title;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;
  setMeta("name", "description", description);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", canonicalUrl);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:url", canonicalUrl);
};

export const parsePost = (source, file) => {
  const [, frontmatter = "", body = ""] =
    source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/) || [];
  const data = Object.fromEntries(
    frontmatter.split("\n").map((line) => {
      const [key, ...value] = line.split(":");
      return [key?.trim(), value.join(":").trim().replace(/^\[|\]$/g, "")];
    }),
  );
  return {
    ...data,
    tags:
      data.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean) || [],
    body,
    file,
  };
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
};

const runtimeReadModels = new Map();
const fetchRuntimeReadModel = (base) => {
  const url = new URL(`${base}runtime-read-model.json`, location.href).href;
  if (!runtimeReadModels.has(url)) {
    runtimeReadModels.set(
      url,
      fetchJson(url).catch(() => null),
    );
  }
  return runtimeReadModels.get(url);
};

// `base` is the relative path to the content/ directory for the calling page
// (e.g. "content/" from the site root, "../content/" from pages/).
//
// `files` narrows the load to specific post bodies. Post bodies dwarf the rest
// of the payload, so a page that renders one post should always pass it.
const loadDataFromSources = async (base, files) => {
  const [site, index] = await Promise.all([
    fetchJson(`${base}site.json`),
    fetchJson(`${base}posts/index.json`),
  ]);
  const posts = await Promise.all(
    (files || index.posts || []).map(async (file) =>
      parsePost(await fetchText(`${base}posts/${file}`), file),
    ),
  );
  return { site, posts };
};

export const loadData = async (base, files) => {
  const model = await fetchRuntimeReadModel(base);
  if (!model || !Array.isArray(model.posts) || !model.site) {
    return loadDataFromSources(base, files);
  }

  const byFile = new Map(model.posts.map((post) => [post.file, post]));
  const requestedFiles = files || model.posts.map((post) => post.file);
  const posts = await Promise.all(
    requestedFiles.map(async (file) => {
      const post = byFile.get(file);
      return post || parsePost(await fetchText(`${base}posts/${file}`), file);
    }),
  );
  return { site: model.site, posts };
};

// Loads the CTF archive: site metadata plus events and their parsed challenge
// writeups. Mirrors loadData's shape ({ site, ... }).
//
// `events` narrows the load to specific event ids, and `challenges` to specific
// challenge files within them; both default to the whole archive. The full
// archive is every writeup body on the site, so pages that render one writeup
// or one event must narrow. A missing event or challenge file is dropped rather
// than fatal — callers render their own not-found state from the gap.
const loadCtfsFromSources = async (
  base,
  { events, challenges, challengePage, loadChallengeBodies = true } = {},
) => {
  const [site, index] = await Promise.all([
    fetchJson(`${base}site.json`),
    events ? null : fetchJson(`${base}ctfs/index.json`),
  ]);
  const settled = await Promise.allSettled(
    (events || index?.ctfs || []).map(async (id) => {
      const meta = await fetchJson(`${base}ctfs/${id}/ctf.json`);
      const allChallenges = meta.challenges || [];
      const selectedChallenges = challenges || allChallenges;
      const pageSize =
        challengePage && Math.max(1, challengePage.end - challengePage.start);
      const pageStart =
        challengePage && selectedChallenges.length
          ? Math.min(
              challengePage.start,
              Math.floor((selectedChallenges.length - 1) / pageSize) * pageSize,
            )
          : challengePage?.start;
      const pagedChallenges = challengePage
        ? selectedChallenges.slice(pageStart, pageStart + pageSize)
        : selectedChallenges;
      const loaded = await Promise.allSettled(
        loadChallengeBodies
          ? pagedChallenges.map(async (file) =>
              parsePost(await fetchText(`${base}ctfs/${id}/${file}`), file),
            )
          : [],
      );
      return {
        ...meta,
        id,
        challengeCount: allChallenges.length,
        challengeFiles: allChallenges,
        challenges: loaded
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value),
      };
    }),
  );
  const ctfs = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  return { site, ctfs };
};

export const loadCtfs = async (
  base,
  { events, challenges, challengePage, loadChallengeBodies = true } = {},
) => {
  const model = await fetchRuntimeReadModel(base);
  if (!model || !Array.isArray(model.ctfs) || !model.site) {
    return loadCtfsFromSources(base, { events, challenges, challengePage, loadChallengeBodies });
  }

  const byId = new Map(model.ctfs.map((ctf) => [ctf.id, ctf]));
  const ids = events || model.ctfs.map((ctf) => ctf.id);
  const requestedEvents = ids.map((id) => byId.get(id)).filter(Boolean);
  if (
    challenges &&
    requestedEvents.some((ctf) => challenges.some((file) => !ctf.challengeFiles.includes(file)))
  ) {
    return loadCtfsFromSources(base, { events, challenges, challengePage, loadChallengeBodies });
  }

  const ctfs = requestedEvents.map((ctf) => {
    const selectedChallenges = challenges || ctf.challengeFiles;
    const pageSize =
      challengePage && Math.max(1, challengePage.end - challengePage.start);
    const pageStart =
      challengePage && selectedChallenges.length
        ? Math.min(
            challengePage.start,
            Math.floor((selectedChallenges.length - 1) / pageSize) * pageSize,
          )
        : challengePage?.start;
    const pagedChallenges = challengePage
      ? selectedChallenges.slice(pageStart, pageStart + pageSize)
      : selectedChallenges;
    const challengeByFile = new Map(ctf.challenges.map((challenge) => [challenge.file, challenge]));

    return {
      ...ctf,
      challenges: loadChallengeBodies
        ? pagedChallenges.map((file) => challengeByFile.get(file)).filter(Boolean)
        : [],
    };
  });

  return { site: model.site, ctfs };
};

const MATHJAX_SRC =
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
let mathJaxReady;

// True when the rendered page has math for MathJax to typeset: a fenced ```math
// block (rendered as .math-block) or one of the inline delimiters configured
// below. Pages without math never pay for the parser.
const hasMath = () =>
  Boolean(document.querySelector(".math-block")) ||
  /\$[^\n$]+\$|\\\([^\n]+\\\)/.test(document.body.textContent);

// MathJax is a large parser, so it is fetched on demand. The config is applied
// here rather than in each page's <head> so a writeup opened through the SPA
// router gets identical delimiters to one loaded directly. skipHtmlTags keeps
// code blocks literal.
export const typesetMath = () => {
  if (!hasMath()) return;
  if (!mathJaxReady) {
    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]],
      },
      options: {
        skipHtmlTags: [
          "script",
          "noscript",
          "style",
          "textarea",
          "pre",
          "code",
        ],
      },
    };
    mathJaxReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MATHJAX_SRC;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  }
  mathJaxReady
    .then(() => window.MathJax?.typesetPromise?.([document.body]))
    .catch(() => {});
};

// Wires the scroll-driven "reading progress" bar to overall page scroll, so it
// tracks correctly whether the article is shorter or taller than the viewport.
// No-op unless the page has a [data-hp] fill. Shared by post and writeup pages.
export const initReadingProgress = () => {
  window.__radiantBlazeReadingProgressCleanup?.();
  const hp = document.querySelector("[data-hp]");
  if (!hp) return;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - innerHeight;
    const pct = scrollable > 0 ? (scrollY / scrollable) * 100 : 0;
    hp.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  };
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update, { passive: true });
  window.__radiantBlazeReadingProgressCleanup = () => {
    removeEventListener("scroll", update);
    removeEventListener("resize", update);
  };
  update();
};
