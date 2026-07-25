const themeStorageKey = "radiant-blaze-theme";
const body = document.body;
const savedTheme = localStorage.getItem(themeStorageKey);

if (savedTheme === "light") {
  body.classList.replace("dark-theme", "light-theme");
}

const themeNav = document.querySelector(".quest-nav");
if (themeNav) {
  const themeToggle = document.createElement("button");
  const isLight = body.classList.contains("light-theme");
  themeToggle.className = "theme-toggle";
  themeToggle.type = "button";
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isLight ? "dark" : "light"} theme`,
  );
  themeToggle.innerHTML = `<span aria-hidden="true">${isLight ? "☾" : "☼"}</span>`;
  themeNav.append(themeToggle);

  themeToggle.addEventListener("click", () => {
    const nextIsLight = body.classList.toggle("light-theme");
    body.classList.toggle("dark-theme", !nextIsLight);
    localStorage.setItem(themeStorageKey, nextIsLight ? "light" : "dark");
    themeToggle.setAttribute(
      "aria-label",
      `Switch to ${nextIsLight ? "dark" : "light"} theme`,
    );
    themeToggle.innerHTML = `<span aria-hidden="true">${nextIsLight ? "☾" : "☼"}</span>`;
  });
}

const contentRoot = "../content/posts/";
const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ],
  );
const parsePost = (source, file) => {
  const [, frontmatter = "", body = ""] = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/) || [];
  const data = Object.fromEntries(
    frontmatter.split("\n").map((line) => {
      const [key, ...value] = line.split(":");
      return [key?.trim(), value.join(":").trim().replace(/^\[|\]$/g, "")];
    }),
  );
  return { ...data, tags: data.tags?.split(",").map((tag) => tag.trim()) || [], body, file };
};
const formatDate = (date) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${date}T00:00:00`))
    .toUpperCase();
const postCard = (post) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art thumbnail for ${escapeHtml(post.title)}"></div><div><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="quest-meta"><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span>${formatDate(post.date)}</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="quest.html?post=${encodeURIComponent(post.file)}">READ POST →</a></div></article>`;
const markdownToHtml = (markdown) => {
  const code = [];
  let html = escapeHtml(markdown).replace(/```(\w+)?\n([\s\S]*?)```/g, (_, language, source) => {
    code.push(`<pre class="terminal"><code data-language="${language || "text"}">${source}</code></pre>`);
    return `@@CODE${code.length - 1}@@`;
  });
  html = html.replace(/^## (.+)$/gm, (_, title) => `<h2 id="${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${title}</h2>`);
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.split(/\n{2,}/).map((part) => part.startsWith("<") || part.startsWith("@@CODE") ? part : `<p>${part.replace(/\n/g, "<br>")}</p>`).join("");
  return html.replace(/@@CODE(\d+)@@/g, (_, index) => code[index]);
};
const loadPosts = async () => {
  const index = await fetch(`${contentRoot}index.json`).then((response) => response.json());
  return Promise.all(index.posts.map(async (file) => parsePost(await fetch(`${contentRoot}${file}`).then((response) => response.text()), file)));
};
loadPosts().then((posts) => {
  const recordCount = document.querySelector("[data-record-count]");
  if (recordCount) recordCount.textContent = `FOUND ${posts.length} POST${posts.length === 1 ? "" : "S"}`;
  const lists = document.querySelectorAll("[data-quest-list]");
  lists.forEach((list) => {
    const category = list.dataset.category;
    const visiblePosts = category ? posts.filter((post) => post.category === category) : posts;
    list.innerHTML = visiblePosts.map(postCard).join("") || '<p class="quest-intro">NO POSTS FOUND.</p>';
  });
  document.querySelectorAll("[data-archive-list]").forEach((archive) => {
    const grouped = posts.reduce((groups, post) => {
      const month = formatDate(post.date).replace(/ \d{4}$/, "");
      groups[month] = [...(groups[month] || []), post];
      return groups;
    }, {});
    archive.innerHTML = Object.entries(grouped).map(([month, items]) => `<section class="pixel-panel"><h2>${month}</h2><ul class="region-list">${items.map((post) => `<li><a href="quest.html?post=${encodeURIComponent(post.file)}">${escapeHtml(post.title).toUpperCase()}</a></li>`).join("")}</ul></section>`).join("");
  });
  const search = document.querySelector("[data-search]");
  if (search) {
    search.closest("form").addEventListener("submit", (event) => event.preventDefault());
    search.addEventListener("input", (event) => {
      const found = posts.filter((post) => `${post.title} ${post.description} ${post.category}`.toLowerCase().includes(event.target.value.toLowerCase()));
      document.querySelector("[data-record-count]").textContent = `FOUND ${found.length} POST${found.length === 1 ? "" : "S"}`;
      document.querySelector("[data-quest-list]").innerHTML = found.map(postCard).join("") || '<p class="quest-intro">NO POSTS FOUND. TRY ANOTHER SEARCH.</p>';
    });
  }
  const article = document.querySelector("[data-markdown-post]");
  if (article) {
    const requested = new URLSearchParams(location.search).get("post") || article.dataset.markdownPost;
    const post = posts.find((item) => item.file === requested) || posts[0];
    document.title = `${post.title} · Radiant Blaze`;
    article.innerHTML = markdownToHtml(post.body);
    document.querySelector("[data-post-header]").innerHTML = `<p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h1 class="quest-title">${escapeHtml(post.title).toUpperCase()}</h1><div class="article-info"><span>READ TIME: <b>${escapeHtml(post.estimatedPlayTime).toUpperCase()}</b></span><span>${formatDate(post.date)}</span><span>BY <b>${escapeHtml(post.author).toUpperCase()}</b></span></div>`;
    document.querySelector("[data-post-tags]").innerHTML = post.tags.map((tag) => `<a href="search.html"># ${escapeHtml(tag).toUpperCase()}</a>`).join("");
  }
}).catch(() => document.querySelectorAll("[data-quest-list]").forEach((list) => { list.innerHTML = '<p class="quest-intro">POSTS COULD NOT LOAD.</p>'; }));
const hp = document.querySelector("[data-hp]");
if (hp) {
  const updateHp = () => {
    const article = document.querySelector(".quest-article");
    const total = article.offsetHeight - innerHeight;
    hp.style.width = `${Math.min(100, Math.max(0, (scrollY / total) * 100))}%`;
  };
  addEventListener("scroll", updateHp, { passive: true });
  updateHp();
}
