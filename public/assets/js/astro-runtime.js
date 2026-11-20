import { escapeHtml, markdownToHtml } from "./markdown-renderer.js";

// Re-exported so existing consumers keep importing both from the runtime.
export { escapeHtml, markdownToHtml };

export const formatDate = (date) => {
  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      .formatToParts(new Date(`${date}T00:00:00`))
      .map((item) => [item.type, item.value]),
  );
  return `${parts.get("day")}-${parts.get("month")}-${parts.get("year")}`;
};

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export const postPageUrl = (file) =>
  `/generated/posts/${encodePath(file.replace(/\.md$/i, ".html"))}`;

export const writeupPageUrl = (ctfId, file) =>
  `/generated/writeups/${encodeURIComponent(ctfId)}/${encodeURIComponent(file.replace(/\.md$/i, ".html"))}`;

export const getReadModel = async () => {
  const response = await fetch("/content/runtime-read-model.json");
  if (!response.ok) throw new Error(`Read model responded ${response.status}`);
  return response.json();
};

export const socialHtml = (social = []) =>
  social
    .map((item) => {
      const icon = item.label === "LinkedIn" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 22H4v-2h16v2ZM4 20H2V4h2v16Zm18 0h-2V4h2v16ZM9 17H7v-6h2v6Zm6-6v2h-2v4h-2v-6h4Zm2 6h-2v-4h2v4ZM9 9H7V7h2v2Zm11-5H4V2h16v2Z" /></svg>' : item.label === "GitHub" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h4v2H7v2H5V2Zm0 10H3V6h2v6Zm2 2H5v-2h2v2Zm2 2v-2H7v2H3v-2H1v2h2v2h4v4h2v-4h2v-2H9Zm0 0v2H7v-2h2Zm6-12v2H9V4h6Zm4 2h-2V4h-2V2h4v4Zm0 6V6h2v6h-2Zm-2 2v-2h2v2h-2Zm-2 2v-2h2v2h-2Zm0 2h-2v-2h2v2Zm0 0h2v4h-2v-4Z" /></svg>' : item.label === "X" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20H4v-2h2v2Zm14-2h2v2h-6v-2h2v-2h2v2ZM8 18H6v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2h-2v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H6V8h2v2Zm4 0h-2V8h2v2Zm4 0h-2V8h2v2ZM8 6H6v2H4V6H2V4h6v2Zm2 2H8V6h2v2Zm8 0h-2V6h2v2Zm2-2h-2V4h2v2Z" /></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4v-2h16v2ZM4 18H2V6h2v12Zm18 0h-2V6h2v12Zm-8-4h-4v-2h4v2Zm-4-2H8v-2h2v2Zm6 0h-2v-2h2v2Zm-8-2H6V8h2v2Zm10 0h-2V8h2v2Zm2-4H4V4h16v2Z" /></svg>';
      if (!/^(https?:|mailto:)/i.test(item.url || ""))
        return `<span class="social-link is-pending" title="${item.label} · coming soon" aria-label="${item.label} · coming soon"><span class="social-label">${item.label}</span><span class="social-kind">STANDBY</span><span class="social-icon">${icon}</span></span>`;
      const external = !item.url.startsWith("mailto:");
      return `<a class="social-link" href="${item.url}"${external ? ' target="_blank" rel="noopener"' : ""}><span class="social-label">${item.label}</span><span class="social-kind">${external ? "OPEN LINK" : "SEND NOTE"}</span><span class="social-icon">${icon}</span></a>`;
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
    element.setAttribute("content", value || "");
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

// Pinned so an upstream major/minor release cannot change the typesetter
// under the site; the SRI hash covers the exact bytes we tested.
const MATHJAX_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
const MATHJAX_INTEGRITY = "sha384-Wuix6BuhrWbjDBs24bXrjf4ZQ5aFeFWBuKkFekO2t8xFU0iNaLQfp2K6/1Nxveei";
let mathJaxReady;

export const typesetMath = (root = document.querySelector(".quest-article")) => {
  if (!root || (!root.querySelector(".math-block") && !/\$[^\n$]+\$|\\\([^\n]+\\\)/.test(root.textContent || ""))) return Promise.resolve();
  if (!mathJaxReady) {
    window.MathJax = {
      tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["\\[", "\\]"]] },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
    };
    mathJaxReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MATHJAX_SRC;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.integrity = MATHJAX_INTEGRITY;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  }
  return mathJaxReady
    .then(() => window.MathJax?.typesetPromise?.([root]))
    .catch(() => {});
};

export const initReadingProgress = () => {
  window.__radiantBlazeReadingProgressCleanup?.();
  const hp = document.querySelector("[data-hp]");
  if (!hp) return;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - innerHeight;
    const pct = scrollable > 0 ? (scrollY / scrollable) * 100 : 0;
    // A transform keeps the progress bar off the layout path as the reader
    // scrolls; writing width recomputed layout on every scroll event.
    hp.style.transform = `scaleX(${Math.min(1, Math.max(0, pct / 100))})`;
  };
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update, { passive: true });
  window.__radiantBlazeReadingProgressCleanup = () => {
    removeEventListener("scroll", update);
    removeEventListener("resize", update);
    // Drop the closure so the detached progress element it captured can be
    // collected even when the next page has no reading progress bar.
    window.__radiantBlazeReadingProgressCleanup = null;
  };
  update();
};
