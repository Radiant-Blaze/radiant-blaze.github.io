import { loadData, loadCtfs, escapeHtml, formatDate, markdownToHtml, socialHtml, initReadingProgress, typesetMath, updatePageMetadata, postPageUrl, writeupPageUrl } from "./content.js?v=20260926-1";
import {
  DEFAULT_PAGE_SIZE,
  pageSlice,
  paginationHtml,
  searchableText,
  syncSearchForm,
} from "./list-utils.js";

const DATA_BASE = "../content/";
const params = new URLSearchParams(location.search);
const requestedPage = Math.max(1, parseInt(params.get("pg"), 10) || 1);
const blogQuery = (params.get("q") || "").trim();

const postCard = (post) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art thumbnail for ${escapeHtml(post.title)}"></div><div><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="quest-meta"><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span>${formatDate(post.date)}</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="${postPageUrl(post.file)}">READ POST →</a></div></article>`;

const writeupCard = (ctf, challenge) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(challenge.title)}"></div><div><p class="quest-number">WRITEUP · ${escapeHtml((challenge.category || "CTF").toUpperCase())}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || `Writeup from ${ctf.title}.`)}</p><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${escapeHtml(ctf.title).toUpperCase()}</b></span></div><a class="pixel-button start-button" href="${writeupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></div></article>`;

const isSearchPage = Boolean(document.querySelector("[data-search]"));
const blogList = document.querySelector("[data-category-dynamic]");

// A post page renders exactly one body, so it asks for exactly one.
const article = document.querySelector("[data-markdown-post]");
const requestedPost =
  params.get("post") ||
  article?.dataset.markdownPost ||
  "";

const postMatches = (post, term) =>
  searchableText(
    post.title,
    post.description,
    post.category,
    post.tags || [],
    post.author,
    post.body,
  ).includes(term);

const setupBlogSearch = (currentCategory) => {
  syncSearchForm({
    query: blogQuery,
    inputSelector: "[data-blog-search-input]",
    hidden: [{ selector: "[data-blog-search-category]", value: currentCategory }],
  });
};

Promise.all([
  loadData(DATA_BASE, requestedPost ? [requestedPost] : undefined),
  isSearchPage ? loadCtfs(DATA_BASE) : Promise.resolve({ ctfs: [] }),
])
  .then(([{ site, posts }, { ctfs }]) => {
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
    setupBlogSearch(currentCategory);

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
      if (list === blogList) {
        const term = blogQuery.toLowerCase();
        if (term) visiblePosts = visiblePosts.filter((post) => postMatches(post, term));
        const { currentPage, totalPages, shown: shownPosts } = pageSlice(
          visiblePosts,
          requestedPage,
        );
        const countEl = document.querySelector("[data-blog-count]");
        if (countEl)
          countEl.textContent = `${visiblePosts.length} POST${visiblePosts.length === 1 ? "" : "S"} · PAGE ${currentPage} OF ${totalPages}`;
        list.innerHTML =
          shownPosts.map(postCard).join("") ||
          '<p class="quest-intro">NO POSTS FOUND.</p>';
        const pagination = document.querySelector("[data-blog-pagination]");
        if (pagination)
          pagination.innerHTML = paginationHtml(visiblePosts.length, currentPage, (page) => {
            const nextParams = new URLSearchParams();
            if (currentCategory) nextParams.set("category", currentCategory);
            if (blogQuery) nextParams.set("q", blogQuery);
            if (page > 1) nextParams.set("pg", page);
            const query = nextParams.toString();
            return query ? `blog.html?${query}` : "blog.html";
          });
        return;
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
                    `<li><a href="${postPageUrl(post.file)}">${escapeHtml(post.title).toUpperCase()}</a></li>`,
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
      let currentPage = 0;
      let activeFilter = "all";
      let activeTopic = (params.get("topic") || "all").toLowerCase();

      const topicSet = new Set(
        [...posts, ...writeups.map(({ challenge }) => challenge)]
          .flatMap((item) => {
            const categories = [];
            if (item.category) categories.push(item.category);
            if (item.tags?.length) categories.push(...item.tags);
            return categories;
          })
          .filter(Boolean),
      );
      const topicOptions = [...topicSet].sort((a, b) => a.localeCompare(b));

      const topicContainer = document.querySelector("[data-search-topics]");
      if (topicContainer) {
        topicContainer.innerHTML = [
          '<button type="button" class="filter-pill is-active" data-search-topic="all">ALL TOPICS</button>',
          ...topicOptions.map(
            (topic) =>
              `<button type="button" class="filter-pill" data-search-topic="${escapeHtml(topic.toLowerCase())}">${escapeHtml(topic.toUpperCase())}</button>`,
          ),
        ].join("");
      }

      const applyFilterClasses = () => {
        document.querySelectorAll("[data-search-filter]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.searchFilter === activeFilter);
        });
        document.querySelectorAll("[data-search-topic]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.searchTopic === activeTopic);
        });
      };

      const matchesTopic = (record, topic) => {
        if (topic === "all") return true;
        const item = record.item || {};
        const tagText = [(item.category || ""), ...(item.tags || []), (record.ctf?.title || "")]
          .join(" ")
          .toLowerCase();
        return tagText.includes(topic.toLowerCase());
      };

      const matchesType = (record, filter) => {
        if (filter === "all") return true;
        if (filter === "posts") return record.type === "post";
        if (filter === "writeups") return record.type === "writeup";
        return true;
      };

      search.value = query;
      search
        .closest("form")
        .addEventListener("submit", (event) => event.preventDefault());

      document.querySelectorAll("[data-search-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          activeFilter = button.dataset.searchFilter;
          applyFilterClasses();
          renderSearch(search.value, true);
        });
      });

      document.querySelectorAll("[data-search-topic]").forEach((button) => {
        button.addEventListener("click", () => {
          activeTopic = button.dataset.searchTopic;
          applyFilterClasses();
          renderSearch(search.value, true);
        });
      });

      const renderSearch = (value, resetPage = true) => {
        if (resetPage) currentPage = 0;
        const term = value.trim().toLowerCase();
        const found = records.filter((record) => {
          const { item, ctf } = record;
          const searchable = `${item.title} ${item.description || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${ctf?.title || ""}`.toLowerCase();
          const matchesQuery = !term || searchable.includes(term);
          const matchesYear = !selectedYear || new Date(`${record.date}T00:00:00`).getFullYear() === Number(selectedYear);
          const matchesTypeFilter = matchesType(record, activeFilter);
          const matchesTopicFilter = matchesTopic(record, activeTopic);
          return matchesQuery && matchesYear && matchesTypeFilter && matchesTopicFilter;
        });
        const { currentPage: shownPage, totalPages, start, shown } = pageSlice(
          found,
          currentPage + 1,
        );
        currentPage = shownPage - 1;
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
      applyFilterClasses();
      renderSearch(query);
    }

    if (article) {
      const post = posts.find((item) => item.file === requestedPost) || posts[0];
      const canonicalUrl = new URL(location.href);
      canonicalUrl.search = "";
      canonicalUrl.searchParams.set("post", post.file);
      canonicalUrl.hash = "";
      updatePageMetadata({
        title: `${post.title} · Radiant Blaze`,
        description: post.description,
        canonicalUrl: canonicalUrl.href,
      });
      article.innerHTML = markdownToHtml(post.body);
      const relatedLinks = [
        `<a href="blog.html?category=${encodeURIComponent(post.category)}">MORE ${escapeHtml(post.category).toUpperCase()} POSTS</a>`,
        ...(post.tags || []).slice(0, 2).map(
          (tag) => `<a href="search.html?topic=${encodeURIComponent(tag.toLowerCase())}">MORE ${escapeHtml(tag).toUpperCase()}</a>`,
        ),
      ];
      article.insertAdjacentHTML(
        "beforeend",
        `<nav class="article-related" aria-label="Related content">${relatedLinks.join("")}</nav>`,
      );
      document.querySelector("[data-post-header]").innerHTML =
        `<p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h1 class="quest-title">${escapeHtml(post.title).toUpperCase()}</h1><div class="article-info"><span>READ TIME: <b>${escapeHtml(post.estimatedPlayTime).toUpperCase()}</b></span><span>${formatDate(post.date)}</span><span>BY <b>${escapeHtml(post.author).toUpperCase()}</b></span></div>`;
      document.querySelector("[data-post-tags]").innerHTML = post.tags
        .map(
          (tag) =>
            `<a href="search.html?topic=${encodeURIComponent(tag.toLowerCase())}"># ${escapeHtml(tag).toUpperCase()}</a>`,
        )
        .join("");
      typesetMath();
    }
  })
  .catch(() => {
    document.querySelectorAll("[data-quest-list]").forEach((list) => {
      list.innerHTML = '<p class="quest-intro">POSTS COULD NOT LOAD.</p>';
    });
    // A post body that no longer exists leaves the header and article on their
    // "LOADING POST..." placeholder unless the failure is reported here.
    if (article) {
      const header = document.querySelector("[data-post-header]");
      if (header)
        header.innerHTML =
          '<p class="quest-number">POST NOT FOUND</p><h1 class="quest-title">404</h1>';
      article.innerHTML =
        '<p>That post isn\'t in the archive. <a href="blog.html">Return to the blog.</a></p>';
    }
  });

initReadingProgress();
