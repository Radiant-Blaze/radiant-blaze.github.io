import { escapeHtml, markdownToHtml } from "./markdown-renderer.js";

// Re-exported so existing consumers keep importing both from the runtime.
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

const MATHJAX_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
let mathJaxReady;

export const typesetMath = (root = document.querySelector(".quest-article, [data-writeup], [data-markdown-post]")) => {
  if (!root || (!root.querySelector(".math-block") && !/\$[^\n$]+\$|\\\([^\n]+\\\)/.test(root.textContent || ""))) return Promise.resolve();
  if (!mathJaxReady) {
    window.MathJax = {
      tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["\\[", "\\]"]] },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
    };
    mathJaxReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MATHJAX_SRC;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  }
  return mathJaxReady
    .then(() => window.MathJax?.typesetPromise?.([root]))
    .catch(() => {});
};

const MERMAID_SRC = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
const DIAGRAM_BLOCK = 'code[data-language="mermaid"]';
// Fallback values mirror style.css; colors are read from the live theme first.
const DIAGRAM_TOKENS = {
  "--panel": { key: "panel", fallback: "#272044" },
  "--text": { key: "text", fallback: "#fff7de" },
  "--muted": { key: "muted", fallback: "#baaed6" },
  "--accent-pink": { key: "pink", fallback: "#ff5e9d" },
  "--accent-orange": { key: "orange", fallback: "#ffb347" },
  "--accent-cyan": { key: "cyan", fallback: "#65e7e3" },
};
let mermaidReady;
let mermaidApi = null;
let diagramSeq = 0;
const diagramFigures = new WeakMap();

const diagramTokens = () => {
  const styles = getComputedStyle(document.documentElement);
  const tokens = {};
  for (const [name, { key, fallback }] of Object.entries(DIAGRAM_TOKENS)) {
    tokens[key] = styles.getPropertyValue(name).trim() || fallback;
  }
  return tokens;
};

const applyDiagramTokens = (source) => {
  const tokens = diagramTokens();
  return source.replace(/var\((--[\w-]+)\)/g, (reference, name) => {
    const key = DIAGRAM_TOKENS[name]?.key;
    return key ? tokens[key] : reference;
  });
};

const diagramConfig = () => {
  const { panel, text, muted, pink, orange, cyan } = diagramTokens();
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    // Natural SVG sizes: the article container scrolls sideways instead of
    // shrinking a wide flowchart until its labels are unreadable.
    flowchart: { useMaxWidth: false },
    themeVariables: {
      darkMode: !document.documentElement.classList.contains("light-theme"),
      background: panel,
      mainBkg: panel,
      nodeBorder: pink,
      nodeTextColor: text,
      lineColor: muted,
      textColor: text,
      titleColor: text,
      primaryColor: panel,
      primaryTextColor: text,
      primaryBorderColor: pink,
      secondaryColor: panel,
      secondaryTextColor: text,
      secondaryBorderColor: cyan,
      tertiaryColor: panel,
      tertiaryTextColor: text,
      tertiaryBorderColor: orange,
      clusterBkg: panel,
      clusterBorder: muted,
      edgeLabelBackground: panel,
      errorBkgColor: panel,
      errorTextColor: text,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "13px",
    },
  };
};

const ensureMermaid = () => {
  if (!mermaidReady) {
    mermaidReady = import(MERMAID_SRC)
      .then((module) => {
        mermaidApi = module.default ?? module;
        mermaidApi.initialize(diagramConfig());
        return mermaidApi;
      })
      .catch(() => null);
  }
  return mermaidReady;
};

const pendingDiagramBlocks = (root) =>
  [...(root ?? document).querySelectorAll(DIAGRAM_BLOCK)].filter(
    (code) => !code.closest("pre")?.dataset.diagram,
  );

// Renders one block and swaps it in. The source `<pre>` is kept, and only
// hidden once an SVG exists, so a syntax error or a blocked CDN leaves the
// readable code block in place.
const drawDiagram = async (code) => {
  const pre = code.closest("pre");
  if (!pre || pre.dataset.diagram) return;
  const { svg, bindFunctions } = await mermaidApi.render(`mermaid-diagram-${++diagramSeq}`, applyDiagramTokens(code.textContent));
  const figure = document.createElement("div");
  figure.className = "diagram";
  figure.setAttribute("role", "img");
  figure.innerHTML = svg;
  pre.dataset.diagram = "rendered";
  diagramFigures.set(pre, figure);
  bindFunctions?.(figure);
  pre.after(figure);
  pre.hidden = true;
};

export const renderDiagrams = async (root) => {
  const blocks = pendingDiagramBlocks(root);
  if (!blocks.length) return;
  try {
    const mermaid = await ensureMermaid();
    if (!mermaid) return;
    await Promise.all(
      blocks.map((code) =>
        drawDiagram(code).catch((error) => {
          console.warn("[radiant-blaze] Diagram could not be rendered.", error);
        }),
      ),
    );
  } catch (error) {
    console.warn("[radiant-blaze] Diagram rendering is unavailable.", error);
  }
};

const redrawDiagrams = async () => {
  const codes = [...document.querySelectorAll(`pre[data-diagram="rendered"] > ${DIAGRAM_BLOCK}`)];
  if (!codes.length) return;
  try {
    const mermaid = await ensureMermaid();
    if (!mermaid) return;
    mermaid.initialize(diagramConfig());
    for (const code of codes) {
      const pre = code.closest("pre");
      const figure = diagramFigures.get(pre) ?? pre.nextElementSibling;
      if (!figure) continue;
      try {
        const { svg, bindFunctions } = await mermaid.render(`mermaid-diagram-${++diagramSeq}`, applyDiagramTokens(code.textContent));
        figure.innerHTML = svg;
        bindFunctions?.(figure);
      } catch (error) {
        console.warn("[radiant-blaze] Diagram could not be re-rendered.", error);
      }
    }
  } catch (error) {
    console.warn("[radiant-blaze] Diagram re-rendering is unavailable.", error);
  }
};

addEventListener("radiantblaze:contentchange", () => {
  void renderDiagrams(document);
});
addEventListener("radiantblaze:themechange", () => {
  void redrawDiagrams();
});

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
