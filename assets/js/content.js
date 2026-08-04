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

export const markdownToHtml = (markdown) => {
  const code = [];
  let html = escapeHtml(markdown).replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, language, source) => {
      code.push(
        `<pre class="terminal"><code data-language="${language || "text"}">${source}</code></pre>`,
      );
      return `@@CODE${code.length - 1}@@`;
    },
  );
  html = html.replace(
    /^## (.+)$/gm,
    (_, title) =>
      `<h2 id="${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${title}</h2>`,
  );
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html
    .split(/\n{2,}/)
    .map((part) =>
      part.startsWith("<") || part.startsWith("@@CODE")
        ? part
        : `<p>${part.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return html.replace(/@@CODE(\d+)@@/g, (_, index) => code[index]);
};

// `base` is the relative path to the content/ directory for the calling page
// (e.g. "content/" from the site root, "../content/" from pages/).
export const loadData = async (base) => {
  const [site, index] = await Promise.all([
    fetch(`${base}site.json`).then((response) => response.json()),
    fetch(`${base}posts/index.json`).then((response) => response.json()),
  ]);
  const posts = await Promise.all(
    index.posts.map(async (file) =>
      parsePost(
        await fetch(`${base}posts/${file}`).then((response) => response.text()),
        file,
      ),
    ),
  );
  return { site, posts };
};
