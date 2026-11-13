// Browser-side Markdown renderer shared by the Astro runtime and the
// compatibility fallback. It is deliberately separate from the build-time
// converter in src/lib/markdown-converter/: that one parses frontmatter with
// js-yaml and emits richer HTML (tables, nested lists, images) for the static
// article routes, while this renders the small authoring subset used by the
// client-rendered query shells.
//
// source-assets.mjs also maps this file to /legacy/assets/js/, so
// compat/legacy-assets/js/content.js can import it as a sibling module exactly
// like list-utils.js does.

export const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

// Content is authored in a deliberately small Markdown subset: ATX headings,
// fenced and inline code, blockquotes, ordered/unordered lists, bold and links.
// Anything outside that subset is escaped and rendered as literal text.
const TOKEN_LINE = /^@@TOKEN\d+@@$/;

// Headings inside an article start at h2 — the page supplies the document h1 —
// so levels 1 and 2 both map to h2 and deeper levels keep their relative depth.
const headingTag = (level) => `h${level <= 2 ? 2 : Math.min(6, level)}`;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Mirrors src/lib/markdown-converter/html.ts: the source is HTML-escaped before
// inline parsing, so a real scheme cannot hide behind an entity. Relative
// references stay allowed; `javascript:`, `data:` and friends do not.
const SAFE_URL_SCHEMES = { http: true, https: true, mailto: true, tel: true };
const isSafeUrl = (value) => {
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(value.trim());
  return scheme ? SAFE_URL_SCHEMES[scheme[1].toLowerCase()] === true : true;
};

export const markdownToHtml = (markdown) => {
  const tokens = [];
  const stash = (html) => `@@TOKEN${tokens.push(html) - 1}@@`;
  const source = escapeHtml(markdown.replace(/\r\n?/g, "\n"))
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, language, code) =>
      (language || "").toLowerCase() === "math"
        ? stash(`<div class="math-block">\\[${code}\\]</div>`)
        : stash(
            `<pre class="terminal" tabindex="0"><code data-language="${language || "text"}">${code}</code></pre>`,
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
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
        isSafeUrl(href) ? `<a href="${href}">${label}</a>` : label);

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
      html.push(`<${tag} id="${slug(heading[2])}">${inline(heading[2])}</${tag}>`);
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
  return html
    .join("")
    .replace(/@@TOKEN(\d+)@@/g, (_, token) => tokens[Number(token)]);
};
