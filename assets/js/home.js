import { loadData, loadCtfs, socialHtml, escapeHtml, formatDate, postPageUrl, writeupPageUrl } from "./content.js";

const yearEl = document.querySelector("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const ctaCard = (entry) => {
  const href = entry.href;
  const badge = entry.type === "POST" ? "LATEST POST" : entry.type === "WRITEUP" ? "LATEST WRITEUP" : "SEARCH ARCHIVE";
  return `
    <article class="home-feature-card">
      <p class="quest-number">${badge}</p>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.description)}</p>
      <div class="quest-meta">
        <span>${entry.date ? formatDate(entry.date) : "NOW"}</span>
        <span><b>${escapeHtml(entry.category || "ARCHIVE")}</b></span>
      </div>
      <a class="pixel-button start-button" href="${href}">OPEN →</a>
    </article>
  `;
};

Promise.all([loadData("content/"), loadCtfs("content/")])
  .then(([{ site, posts }, { ctfs }]) => {
    const social = document.querySelector("[data-social]");
    if (social) social.innerHTML = socialHtml(site.social);

    const latestPost = posts
      .map((post) => ({
        type: "POST",
        title: post.title,
        description: post.description,
        date: post.date,
        category: post.category,
        href: postPageUrl(post.file),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

    const latestWriteup = ctfs
      .flatMap((ctf) => ctf.challenges.map((challenge) => ({
        type: "WRITEUP",
        title: challenge.title,
        description: challenge.description || `Writeup from ${ctf.title}.`,
        date: ctf.date,
        category: challenge.category || ctf.title,
        href: writeupPageUrl(ctf.id, challenge.file),
      })))
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

    const featured = latestWriteup || latestPost;
    const panel = document.querySelector("[data-latest-post]");
    if (panel && featured) {
      panel.href = featured.href;
      panel.setAttribute("aria-label", `Read the latest ${featured.type.toLowerCase()}: ${featured.title}`);
      const title = panel.querySelector("[data-latest-title]");
      const copy = panel.querySelector("[data-latest-copy]");
      const type = panel.querySelector("[data-latest-type]");
      if (type) type.textContent = `LATEST ${featured.type}`;
      if (title) title.textContent = featured.title.toUpperCase();
      if (copy) copy.textContent = featured.description;
    }

    const grid = document.querySelector("[data-featured-grid]");
    if (grid && grid.children.length === 0) {
      const entries = [
        latestWriteup,
        latestPost,
        {
          type: "ARCHIVE",
          title: "Search the archive",
          description: "Jump into posts, writeups, and topic tags from one place.",
          date: new Date().toISOString().slice(0, 10),
          category: "DISCOVER",
          href: "pages/search.html",
        },
      ].filter(Boolean).slice(0, 3);

      grid.innerHTML = entries.map(ctaCard).join("");
    }
  })
  .catch(() => {
    const grid = document.querySelector("[data-featured-grid]");
    if (grid) {
      grid.innerHTML = `
        <article class="home-feature-card">
          <p class="quest-number">LATEST WRITEUP</p>
          <h3>Latest writeup</h3>
          <p>Explore the newest challenge notes and write-ups.</p>
          <div class="quest-meta"><span>NOW</span><span><b>ARCHIVE</b></span></div>
          <a class="pixel-button start-button" href="pages/search.html">OPEN →</a>
        </article>
        <article class="home-feature-card">
          <p class="quest-number">LATEST POST</p>
          <h3>Latest post</h3>
          <p>Read the newest notes from the dev blog.</p>
          <div class="quest-meta"><span>NOW</span><span><b>BLOG</b></span></div>
          <a class="pixel-button start-button" href="pages/blog.html">OPEN →</a>
        </article>
        <article class="home-feature-card">
          <p class="quest-number">SEARCH ARCHIVE</p>
          <h3>Search the archive</h3>
          <p>Browse every post, writeup, and tag in one place.</p>
          <div class="quest-meta"><span>NOW</span><span><b>DISCOVER</b></span></div>
          <a class="pixel-button start-button" href="pages/search.html">OPEN →</a>
        </article>
      `;
    }
  });
