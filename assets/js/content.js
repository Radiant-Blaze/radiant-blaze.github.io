// Shared content helpers: markdown parsing, data loading, formatting.
// Imported by both blog.js (post pages) and home.js (landing page).

export const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(new Date(`${date}T00:00:00`))
    .toUpperCase();

export const socialHtml = (social = []) =>
  social
    .map((item) => {
      const external = !item.url.startsWith("mailto:");
      return `<a class="social-link" href="${item.url}"${external ? ' target="_blank" rel="noopener"' : ""} aria-label="${item.label}"><span aria-hidden="true">${item.icon}</span></a>`;
    })
    .join("");

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

// Content is authored in a deliberately small Markdown subset: ATX headings,
// fenced and inline code, blockquotes, ordered/unordered lists, bold and links.
// Anything outside that subset is escaped and rendered as literal text.
const TOKEN_LINE = /^@@TOKEN\d+@@$/;

// Headings inside an article start at h2 — the page supplies the document h1 —
// so levels 1 and 2 both map to h2 and deeper levels keep their relative depth.
const headingTag = (level) => `h${level <= 2 ? 2 : Math.min(6, level)}`;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const markdownToHtml = (markdown) => {
  const tokens = [];
  const stash = (html) => `@@TOKEN${tokens.push(html) - 1}@@`;

  // Code and math are lifted out first so no inline rule can rewrite them.
  const source = escapeHtml(markdown.replace(/\r\n?/g, "\n"))
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, language, code) =>
      (language || "").toLowerCase() === "math"
        ? stash(`<div class="math-block">\\[${code}\\]</div>`)
        : stash(
            `<pre class="terminal"><code data-language="${language || "text"}">${code}</code></pre>`,
          ),
    )
    .replace(
      /^\\\[((?:.|\n)*?)\\\]$/gm,
      (_, math) => stash(`<div class="math-block">\\[${math}\\]</div>`),
    )
    .replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`));

  const inline = (text) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

  const lines = source.split("\n");
  const html = [];
  const paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph.length = 0;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      flush();
      index++;
      continue;
    }

    if (TOKEN_LINE.test(line)) {
      flush();
      html.push(line);
      index++;
      continue;
    }

    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      flush();
      const tag = headingTag(heading[1].length);
      html.push(
        `<${tag} id="${slug(heading[2])}">${inline(heading[2])}</${tag}>`,
      );
      index++;
      continue;
    }

    if (line.startsWith("&gt; ")) {
      flush();
      const quote = [];
      while (index < lines.length && lines[index].startsWith("&gt; ")) {
        quote.push(lines[index].slice(5));
        index++;
      }
      html.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
      continue;
    }

    const bullet = /^[-*] /.test(line);
    const pattern = bullet ? /^[-*] / : /^\d+\. /;
    if (bullet || pattern.test(line)) {
      flush();
      const items = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(pattern, ""))}</li>`);
        index++;
      }
      const tag = bullet ? "ul" : "ol";
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    paragraph.push(line);
    index++;
  }
  flush();

  return html.join("").replace(/@@TOKEN(\d+)@@/g, (_, i) => tokens[Number(i)]);
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

// `base` is the relative path to the content/ directory for the calling page
// (e.g. "content/" from the site root, "../content/" from pages/).
//
// `files` narrows the load to specific post bodies. Post bodies dwarf the rest
// of the payload, so a page that renders one post should always pass it.
export const loadData = async (base, files) => {
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

// Loads the CTF archive: site metadata plus events and their parsed challenge
// writeups. Mirrors loadData's shape ({ site, ... }).
//
// `events` narrows the load to specific event ids, and `challenges` to specific
// challenge files within them; both default to the whole archive. The full
// archive is every writeup body on the site, so pages that render one writeup
// or one event must narrow. A missing event or challenge file is dropped rather
// than fatal — callers render their own not-found state from the gap.
export const loadCtfs = async (base, { events, challenges } = {}) => {
  const [site, index] = await Promise.all([
    fetchJson(`${base}site.json`),
    events ? null : fetchJson(`${base}ctfs/index.json`),
  ]);
  const settled = await Promise.allSettled(
    (events || index?.ctfs || []).map(async (id) => {
      const meta = await fetchJson(`${base}ctfs/${id}/ctf.json`);
      const loaded = await Promise.allSettled(
        (challenges || meta.challenges || []).map(async (file) =>
          parsePost(await fetchText(`${base}ctfs/${id}/${file}`), file),
        ),
      );
      return {
        ...meta,
        id,
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
