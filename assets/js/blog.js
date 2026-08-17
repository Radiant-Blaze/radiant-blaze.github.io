import { loadData, loadCtfs, escapeHtml, formatDate, markdownToHtml, socialHtml, initReadingProgress } from "./content.js";

const DATA_BASE = "../content/";

const postCard = (post) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art thumbnail for ${escapeHtml(post.title)}"></div><div><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="quest-meta"><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span>${formatDate(post.date)}</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="post.html?post=${encodeURIComponent(post.file)}">READ POST →</a></div></article>`;

const writeupCard = (ctf, challenge) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(challenge.title)}"></div><div><p class="quest-number">WRITEUP · ${escapeHtml((challenge.category || "CTF").toUpperCase())}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || `Writeup from ${ctf.title}.`)}</p><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${escapeHtml(ctf.title).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="writeup.html?ctf=${encodeURIComponent(ctf.id)}&challenge=${encodeURIComponent(challenge.file)}">READ WRITEUP →</a></div></article>`;

const isSearchPage = Boolean(document.querySelector("[data-search]"));

Promise.all([loadData(DATA_BASE), isSearchPage ? loadCtfs(DATA_BASE) : Promise.resolve({ ctfs: [] })])
  .then(([{ site, posts }, { ctfs }]) => {
    const params = new URLSearchParams(location.search);
    const currentCategory = params.get("category");
    const currentYear = params.get("year");
    const blurbs = site.categoryBlurbs || {};
    const categoryNames = [
      ...new Set(posts.map((post) => post.category).filter(Boolean)),
    ].sort();
    document.querySelectorAll("[data-category-list]").forEach((el) => {
      el.innerHTML = categoryNames
        .map(
          (name) =>
            `<a href="blog.html?category=${encodeURIComponent(name)}">${escapeHtml(name).toUpperCase()}</a>`,
        )
        .join("");
    });

    const socialEl = document.querySelector("[data-social]");
    if (socialEl) socialEl.innerHTML = socialHtml(site.social);

    document.querySelectorAll("[data-save-list]").forEach((el) => {
      const byYear = posts.reduce((acc, post) => {
        const year = new Date(post.date).getFullYear();
        acc[year] = (acc[year] || 0) + 1;
        return acc;
      }, {});
      el.innerHTML = Object.entries(byYear)
        .sort(([a], [b]) => b - a)
        .map(
          ([year, count]) =>
            `<li><a href="search.html?year=${year}">${year} <small>${count}</small></a></li>`,
        )
        .join("");
    });

    const categoryTitle = document.querySelector("[data-category-title]");
    if (categoryTitle && currentCategory) {
      categoryTitle.textContent = `CATEGORY: ${currentCategory.toUpperCase()}`;
      document.title = `${currentCategory} · Radiant Blaze`;
      const categoryIntro = document.querySelector("[data-category-intro]");
      if (categoryIntro)
        categoryIntro.textContent =
          blurbs[currentCategory] || `Posts filed under ${currentCategory}.`;
    }

    const recordCount = document.querySelector("[data-record-count]");
    if (recordCount)
      recordCount.textContent = `FOUND ${posts.length} POST${posts.length === 1 ? "" : "S"}`;

    document.querySelectorAll("[data-quest-list]").forEach((list) => {
      let visiblePosts = posts;
      if (list.hasAttribute("data-category-dynamic") && currentCategory) {
        visiblePosts = posts.filter((post) => post.category === currentCategory);
      } else if (list.dataset.category) {
        visiblePosts = posts.filter((post) => post.category === list.dataset.category);
      }
      list.innerHTML =
        visiblePosts.map(postCard).join("") ||
        '<p class="quest-intro">NO POSTS FOUND.</p>';
    });

    document.querySelectorAll("[data-archive-list]").forEach((archive) => {
      const scoped = currentYear
        ? posts.filter(
            (post) => new Date(post.date).getFullYear() === parseInt(currentYear, 10),
          )
        : posts;
      const grouped = scoped.reduce((groups, post) => {
        const month = new Intl.DateTimeFormat("en", {
          month: "long",
          year: "numeric",
        })
          .format(new Date(`${post.date}T00:00:00`))
          .toUpperCase();
        groups[month] = [...(groups[month] || []), post];
        return groups;
      }, {});
      archive.innerHTML =
        Object.entries(grouped)
          .map(
            ([month, items]) =>
              `<section class="pixel-panel"><h2>${month}</h2><ul class="region-list">${items
                .map(
                  (post) =>
                    `<li><a href="post.html?post=${encodeURIComponent(post.file)}">${escapeHtml(post.title).toUpperCase()}</a></li>`,
                )
                .join("")}</ul></section>`,
          )
          .join("") || '<p class="quest-intro">NO POSTS FOUND.</p>';
      const archiveTitle = document.querySelector("[data-archive-title]");
      const archiveIntro = document.querySelector("[data-archive-intro]");
      if (currentYear) {
        if (archiveTitle) archiveTitle.textContent = `ARCHIVE: ${currentYear}`;
        if (archiveIntro)
          archiveIntro.textContent = `Every expedition logged in ${currentYear}.`;
        document.title = `Archive ${currentYear} · Radiant Blaze`;
      }
    });

    const search = document.querySelector("[data-search]");
    if (search) {
      const writeups = ctfs.flatMap((ctf) =>
        ctf.challenges.map((challenge) => ({ ctf, challenge })),
      );
      const records = [
        ...posts.map((post) => ({ type: "post", item: post, date: post.date })),
        ...writeups.map(({ ctf, challenge }) => ({
          type: "writeup",
          item: challenge,
          ctf,
          date: ctf.date,
        })),
      ].sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));
      const query = params.get("q") || "";
      const selectedYear = params.get("year") || "";
      const pageSize = 5;
      let currentPage = 0;
      search.value = query;
      search
        .closest("form")
        .addEventListener("submit", (event) => event.preventDefault());
      const renderSearch = (value, resetPage = true) => {
        if (resetPage) currentPage = 0;
        const term = value.trim().toLowerCase();
        const found = records.filter((record) => {
          const { item, ctf } = record;
          const searchable = `${item.title} ${item.description || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${ctf?.title || ""}`.toLowerCase();
          return (!term || searchable.includes(term)) &&
            (!selectedYear || new Date(`${record.date}T00:00:00`).getFullYear() === Number(selectedYear));
        });
        const totalPages = Math.ceil(found.length / pageSize);
        currentPage = Math.min(currentPage, Math.max(0, totalPages - 1));
        const start = currentPage * pageSize;
        const shown = found.slice(start, start + pageSize);
        const visibleRange = found.length ? ` · SHOWING ${start + 1}–${start + shown.length}` : "";
        document.querySelector("[data-record-count]").textContent =
          `FOUND ${found.length} RECORD${found.length === 1 ? "" : "S"}${visibleRange}`;
        document.querySelector("[data-quest-list]").innerHTML =
          shown
            .map((record) =>
              record.type === "post" ? postCard(record.item) : writeupCard(record.ctf, record.item),
            )
            .join("") || '<p class="quest-intro">NO RECORDS FOUND. TRY ANOTHER SEARCH.</p>';
        const pagination = document.querySelector("[data-search-pagination]");
        if (pagination) {
          pagination.innerHTML = totalPages > 1
            ? `<button class="pixel-button start-button" type="button" data-search-page="previous" ${currentPage === 0 ? "disabled" : ""}>← PREVIOUS</button><button class="pixel-button start-button" type="button" data-search-page="next" ${currentPage === totalPages - 1 ? "disabled" : ""}>NEXT →</button>`
            : "";
          pagination.querySelectorAll("[data-search-page]").forEach((button) => {
            button.addEventListener("click", () => {
              currentPage += button.dataset.searchPage === "next" ? 1 : -1;
              renderSearch(search.value, false);
            });
          });
        }
      };
      search.addEventListener("input", (event) => {
        renderSearch(event.target.value);
        const url = new URL(location.href);
        event.target.value ? url.searchParams.set("q", event.target.value) : url.searchParams.delete("q");
        history.replaceState(null, "", url);
      });
      renderSearch(query);
    }

    const article = document.querySelector("[data-markdown-post]");
    if (article) {
      const requested =
        new URLSearchParams(location.search).get("post") ||
        article.dataset.markdownPost;
      const post = posts.find((item) => item.file === requested) || posts[0];
      document.title = `${post.title} · Radiant Blaze`;
      article.innerHTML = markdownToHtml(post.body);
      document.querySelector("[data-post-header]").innerHTML =
        `<p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h1 class="quest-title">${escapeHtml(post.title).toUpperCase()}</h1><div class="article-info"><span>READ TIME: <b>${escapeHtml(post.estimatedPlayTime).toUpperCase()}</b></span><span>${formatDate(post.date)}</span><span>BY <b>${escapeHtml(post.author).toUpperCase()}</b></span></div>`;
      document.querySelector("[data-post-tags]").innerHTML = post.tags
        .map(
          (tag) =>
            `<a href="search.html"># ${escapeHtml(tag).toUpperCase()}</a>`,
        )
        .join("");
    }
  })
  .catch(() =>
    document.querySelectorAll("[data-quest-list]").forEach((list) => {
      list.innerHTML = '<p class="quest-intro">POSTS COULD NOT LOAD.</p>';
    }),
  );

initReadingProgress();
