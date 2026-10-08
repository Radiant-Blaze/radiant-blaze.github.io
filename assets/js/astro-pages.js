import {
  escapeHtml,
  formatDate,
  getReadModel,
  initReadingProgress,
  markdownToHtml,
  postPageUrl,
  socialHtml,
  typesetMath,
  updatePageMetadata,
  writeupPageUrl,
} from "./astro-runtime.js";
import {
  buildGlobalRecords,
  filterGlobalRecords,
  matchesBlogPost,
  searchCtfRecords,
} from "./astro-query-model.js";
import {
  DEFAULT_PAGE_SIZE,
  difficultyStars,
  normalizeTopic,
  pageMeta,
  pageSlice,
  paginationHtml,
  recordTopics,
  syncSearchForm,
} from "./list-utils.js";

const params = new URLSearchParams(location.search);
const requestedPage = Math.max(1, parseInt(params.get("pg"), 10) || 1);
const fallbackToLegacy = async (moduleName) => {
  const moduleUrl = new URL(`/legacy/assets/js/${moduleName}.js?fallback=${Date.now()}`, location.origin);
  await import(moduleUrl.href);
};

const listingTags = (tags = []) => tags.map((tag) => `<span class="listing-tag">#${escapeHtml(tag).toUpperCase()}</span>`).join("");
const postCard = (post) =>
  `<article class="quest-card listing-entry listing-entry--post"><div class="listing-entry__main"><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="listing-tags">${listingTags(post.tags)}</div><div class="quest-meta"><span>${formatDate(post.date)}</span><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div></div><a class="listing-entry__action pixel-button start-button" href="${postPageUrl(post.file)}">READ POST →</a></article>`;

const writeupCard = (ctf, challenge) =>
  `<article class="quest-card listing-entry listing-entry--writeup"><div class="listing-entry__main"><p class="quest-number">WRITEUP · ${escapeHtml((challenge.category || "CTF").toUpperCase())}</p><p class="listing-event">${escapeHtml(ctf.title).toUpperCase()}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || `Writeup from ${ctf.title}.`)}</p><div class="listing-tags">${listingTags(challenge.tags)}</div><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${escapeHtml(challenge.points || "—")}</b> PTS</span><span class="difficulty" title="Difficulty">${difficultyStars(challenge.difficulty)}</span></div></div><a class="listing-entry__action pixel-button start-button" href="${writeupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></article>`;

const ctfCard = (ctf) => {
  const challengeCount = ctf.challengeCount ?? ctf.challenges.length;
  const difficulty = Math.max(0, Math.min(5, parseInt(ctf.difficulty, 10) || 0));
  const stars = difficultyStars(difficulty);
  const year = new Date(`${ctf.date}T00:00:00`).getFullYear();
  return `<article class="quest-card listing-entry listing-entry--event"><div class="listing-entry__main"><p class="quest-number">CTF EVENT · ${year}</p><h2>${escapeHtml(ctf.title)}</h2><p>${escapeHtml(ctf.description || "")}</p><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${challengeCount}</b> ${challengeCount === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span class="difficulty" title="Difficulty">${stars}</span></div></div><a class="listing-entry__action pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT →</a></article>`;
};

const emptyMessage = (value) => `<p class="quest-intro">${value}</p>`;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "S"}`;
const challengeTotal = (ctf) => ctf.challengeCount ?? ctf.challenges.length;

const renderBlog = async (model) => {
  const blogQuery = (params.get("q") || "").trim();
  const article = document.querySelector("[data-markdown-post]");
  const requestedPost = params.get("post") || article?.dataset.markdownPost || "";
  const postsByFile = new Map(model.posts.map((post) => [post.file, post]));
  if (requestedPost && !postsByFile.has(requestedPost)) {
    await fallbackToLegacy("blog");
    return;
  }
  const posts = requestedPost ? [postsByFile.get(requestedPost)] : model.posts;
  const currentCategory = params.get("category");
  const currentYear = params.get("year");
  const blurbs = model.site.categoryBlurbs || {};
  const isSearchPage = Boolean(document.querySelector("[data-search]"));
  const blogList = document.querySelector("[data-category-dynamic]");

  document.querySelectorAll("[data-category-list]").forEach((element) => {
    const names = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort();
    element.innerHTML = names
      .map((name) => `<a href="blog.html?category=${encodeURIComponent(name)}">${escapeHtml(name).toUpperCase()}</a>`)
      .join("");
  });
  document.querySelectorAll("[data-social]").forEach((element) => {
    element.innerHTML = socialHtml(model.site.social);
  });
  syncSearchForm({
    query: blogQuery,
    inputSelector: "[data-blog-search-input]",
    hidden: [{ selector: "[data-blog-search-category]", value: currentCategory }],
  });

  document.querySelectorAll("[data-save-list]").forEach((element) => {
    const byYear = posts.reduce((counts, post) => {
      const year = new Date(post.date).getFullYear();
      counts[year] = (counts[year] || 0) + 1;
      return counts;
    }, {});
    element.innerHTML = Object.entries(byYear)
      .sort(([left], [right]) => right - left)
      .map(([year, count]) => `<li><a href="search.html?year=${year}">${year} <small>${count}</small></a></li>`)
      .join("");
  });

  const categoryTitle = document.querySelector("[data-category-title]");
  if (categoryTitle && currentCategory) {
    categoryTitle.textContent = `CATEGORY: ${currentCategory.toUpperCase()}`;
    document.title = `${currentCategory} · Radiant Blaze`;
    const intro = document.querySelector("[data-category-intro]");
    if (intro) intro.textContent = blurbs[currentCategory] || `Posts filed under ${currentCategory}.`;
  }

  document.querySelectorAll("[data-quest-list]").forEach((list) => {
    let visiblePosts = posts;
    if (list.hasAttribute("data-category-dynamic") && currentCategory) {
      visiblePosts = posts.filter((post) => post.category === currentCategory);
    } else if (list.dataset.category) {
      visiblePosts = posts.filter((post) => post.category === list.dataset.category);
    }

    if (list === blogList) {
      const term = blogQuery.toLowerCase();
      if (term) {
        visiblePosts = visiblePosts.filter((post) => matchesBlogPost(post, term));
      }
      const { currentPage, totalPages, shown } = pageSlice(visiblePosts, requestedPage);
      const count = document.querySelector("[data-blog-count]");
      if (count) count.textContent = `${visiblePosts.length} POST${visiblePosts.length === 1 ? "" : "S"} · PAGE ${currentPage} OF ${totalPages}`;
      list.innerHTML = shown.map(postCard).join("") || emptyMessage("NO POSTS FOUND.");
      const pagination = document.querySelector("[data-blog-pagination]");
      if (pagination) {
        pagination.innerHTML = paginationHtml(visiblePosts.length, currentPage, (page) => {
          const nextParams = new URLSearchParams();
          if (currentCategory) nextParams.set("category", currentCategory);
          if (blogQuery) nextParams.set("q", blogQuery);
          if (page > 1) nextParams.set("pg", page);
          const query = nextParams.toString();
          return query ? `blog.html?${query}` : "blog.html";
        });
      }
      return;
    }
    list.innerHTML = visiblePosts.map(postCard).join("") || emptyMessage("NO POSTS FOUND.");
  });

  document.querySelectorAll("[data-archive-list]").forEach((archive) => {
    const scoped = currentYear
      ? posts.filter((post) => new Date(post.date).getFullYear() === parseInt(currentYear, 10))
      : posts;
    const groups = scoped.reduce((result, post) => {
      const month = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
        .format(new Date(`${post.date}T00:00:00`))
        .toUpperCase();
      result[month] = [...(result[month] || []), post];
      return result;
    }, {});
    archive.innerHTML = Object.entries(groups)
      .map(([month, entries]) => `<section class="pixel-panel"><h2>${month}</h2><ul class="region-list">${entries.map((post) => `<li><a href="${postPageUrl(post.file)}">${escapeHtml(post.title).toUpperCase()}</a></li>`).join("")}</ul></section>`)
      .join("") || emptyMessage("NO POSTS FOUND.");
    if (currentYear) {
      const title = document.querySelector("[data-archive-title]");
      const intro = document.querySelector("[data-archive-intro]");
      if (title) title.textContent = `ARCHIVE: ${currentYear}`;
      if (intro) intro.textContent = `Every expedition logged in ${currentYear}.`;
      document.title = `Archive ${currentYear} · Radiant Blaze`;
    }
  });

  if (isSearchPage) renderGlobalSearch(posts, model.ctfs);
  if (article) renderPostArticle(article, posts[0]);
};

const renderGlobalSearch = (posts, ctfs) => {
  const input = document.querySelector("[data-search]");
  if (!input) return;
  const writeups = ctfs.flatMap((ctf) => ctf.challenges.map((challenge) => ({ ctf, challenge })));
  const records = buildGlobalRecords(posts, ctfs);
  const query = params.get("q") || "";
  const selectedYear = params.get("year") || "";
  let currentPage = 0;
  let activeFilter = "all";
  const activeTopics = new Set((params.get("topic") || "all").toLowerCase().split(",").filter((topic) => topic && topic !== "all"));
  const topicSet = new Set(
    [...posts, ...writeups.map(({ challenge }) => challenge)]
      .flatMap((item) => [item.category, ...(item.tags || [])])
      .filter(Boolean),
  );
  const topicOptions = [...new Set([...topicSet].map(normalizeTopic))].sort((left, right) => left.localeCompare(right));
  const topicCounts = new Map(topicOptions.map((topic) => [topic.toLowerCase(), 0]));
  [...posts, ...writeups.map(({ challenge }) => challenge)].forEach((item) => {
    [item.category, ...(item.tags || [])].filter(Boolean).forEach((topic) => topicCounts.set(normalizeTopic(topic), (topicCounts.get(normalizeTopic(topic)) || 0) + 1));
  });
  const topTags = document.querySelector("[data-top-tags]");
  if (topTags) {
    topTags.innerHTML = [...topicCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([topic, count]) => `<button type="button" class="filter-pill" data-search-topic="${escapeHtml(topic)}">${escapeHtml(topic.toUpperCase())} <small>${count}</small></button>`)
      .join("");
  }
  const topicContainer = document.querySelector("[data-search-topics]");
  if (topicContainer) {
    topicContainer.innerHTML = [
      '<button type="button" class="filter-pill is-active" data-search-topic="all">ALL TOPICS</button>',
      ...topicOptions.map((topic) => `<button type="button" class="filter-pill" data-search-topic="${escapeHtml(topic.toLowerCase())}">${escapeHtml(topic.toUpperCase())} <small>${topicCounts.get(topic.toLowerCase()) || 0}</small></button>`),
    ].join("");
    const tagFilter = document.querySelector("[data-tag-filter]");
    tagFilter?.addEventListener("input", () => {
      const term = tagFilter.value.trim().toLowerCase();
      topicContainer.querySelectorAll("[data-search-topic]").forEach((button) => {
        button.hidden = term && button.dataset.searchTopic !== "all" && !button.textContent.toLowerCase().includes(term);
      });
    });
  }

  const applyFilterClasses = () => {
    document.querySelectorAll("[data-search-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.searchFilter === activeFilter);
    });
    document.querySelectorAll("[data-search-topic]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.searchTopic === "all" ? activeTopics.size === 0 : activeTopics.has(button.dataset.searchTopic));
    });
  };
  input.value = query;
  input.closest("form")?.addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll("[data-search-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.searchFilter;
      applyFilterClasses();
      renderSearch(input.value, true);
    });
  });
  document.querySelectorAll("[data-search-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.searchTopic === "all") activeTopics.clear();
      else if (activeTopics.has(button.dataset.searchTopic)) activeTopics.delete(button.dataset.searchTopic);
      else activeTopics.add(button.dataset.searchTopic);
      const url = new URL(location.href);
      activeTopics.size ? url.searchParams.set("topic", [...activeTopics].join(",")) : url.searchParams.delete("topic");
      history.replaceState(null, "", url);
      applyFilterClasses();
      renderSearch(input.value, true);
    });
  });

  const renderSearch = (value, resetPage = true) => {
    if (resetPage) currentPage = 0;
    const found = filterGlobalRecords(records, {
      query: value,
      type: activeFilter,
      topic: "all",
      year: selectedYear,
    });
    const selected = activeTopics.size ? found.filter((record) => {
      const topics = recordTopics(record.item, record.ctf);
      return [...activeTopics].every((topic) => topics.some((value) => value.includes(normalizeTopic(topic))));
    }) : found;
    const { currentPage: shownPage, totalPages, start, shown } = pageSlice(selected, currentPage + 1);
    currentPage = shownPage - 1;
    const range = selected.length ? ` · SHOWING ${start + 1}–${start + shown.length}` : "";
    const count = document.querySelector("[data-record-count]");
    if (count) count.textContent = `FOUND ${selected.length} RECORD${selected.length === 1 ? "" : "S"}${range}`;
    const list = document.querySelector("[data-quest-list]");
    if (list) {
      list.innerHTML = shown.map((record) => record.type === "post" ? postCard(record.item) : writeupCard(record.ctf, record.item)).join("") || '<div class="archive-empty archive-empty--404"><strong>404</strong><span>NO RECORDS FOUND</span><small>TRY ANOTHER TAG OR SEARCH TERM.</small></div>';
    }
    const pagination = document.querySelector("[data-search-pagination]");
    if (pagination) {
      pagination.innerHTML = totalPages > 1
        ? `<button class="pixel-button start-button" type="button" data-search-page="previous" aria-label="Previous page" ${currentPage === 0 ? "disabled" : ""}>‹</button>${Array.from({ length: totalPages }, (_, index) => `<button class="pixel-button start-button" type="button" data-search-page="${index}"${index === currentPage ? ' aria-current="page"' : ""}>${index + 1}</button>`).join("")}<button class="pixel-button start-button" type="button" data-search-page="next" aria-label="Next page" ${currentPage === totalPages - 1 ? "disabled" : ""}>›</button>`
        : "";
      pagination.querySelectorAll("[data-search-page]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.searchPage === "next") currentPage += 1;
          else if (button.dataset.searchPage === "previous") currentPage -= 1;
          else currentPage = Number(button.dataset.searchPage);
          renderSearch(input.value, false);
        });
      });
    }
  };
  input.addEventListener("input", (event) => {
    renderSearch(event.target.value);
    const url = new URL(location.href);
    event.target.value ? url.searchParams.set("q", event.target.value) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
  });
  applyFilterClasses();
  renderSearch(query);
};

const renderPostArticle = (article, post) => {
  if (!post) return;
  const canonicalUrl = new URL(location.href);
  canonicalUrl.search = "";
  canonicalUrl.searchParams.set("post", post.file);
  canonicalUrl.hash = "";
  updatePageMetadata({ title: `${post.title} · Radiant Blaze`, description: post.description, canonicalUrl: canonicalUrl.href });
  article.innerHTML = markdownToHtml(post.body);
  const related = [
    `<a href="blog.html?category=${encodeURIComponent(post.category)}">MORE ${escapeHtml(post.category).toUpperCase()} POSTS</a>`,
    ...(post.tags || []).slice(0, 2).map((tag) => `<a href="search.html?topic=${encodeURIComponent(tag.toLowerCase())}">MORE ${escapeHtml(tag).toUpperCase()}</a>`),
  ];
  article.insertAdjacentHTML("beforeend", `<nav class="article-related" aria-label="Related content">${related.join("")}</nav>`);
  const header = document.querySelector("[data-post-header]");
  if (header) header.innerHTML = `<p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h1 class="quest-title">${escapeHtml(post.title).toUpperCase()}</h1><div class="article-info"><span>READ TIME: <b>${escapeHtml(post.estimatedPlayTime).toUpperCase()}</b></span><span>${formatDate(post.date)}</span><span>BY <b>${escapeHtml(post.author).toUpperCase()}</b></span></div>`;
  const tags = document.querySelector("[data-post-tags]");
  if (tags) tags.innerHTML = (post.tags || []).map((tag) => `<a href="search.html?topic=${encodeURIComponent(tag.toLowerCase())}"># ${escapeHtml(tag).toUpperCase()}</a>`).join("");
  typesetMath(article);
};

const categoryCounts = (challenges) => {
  const counts = {};
  challenges.forEach((challenge) => {
    if (challenge.category) counts[challenge.category] = (counts[challenge.category] || 0) + 1;
  });
  return counts;
};
const countRows = (counts) => Object.entries(counts).sort((left, right) => right[1] - left[1]).map(([name, count]) => `<li>${escapeHtml(name).toUpperCase()} <strong>${count}</strong></li>`).join("") || "<li>NONE YET <strong>0</strong></li>";
const searchResults = (ctfs, term) => searchCtfRecords(ctfs, term);
const searchResultCard = (result) => result.type === "ctf" ? ctfCard(result.ctf) : writeupCard(result.ctf, result.challenge);

const arenaSidebar = (ctfs) => {
  const writeups = ctfs.reduce((total, ctf) => total + challengeTotal(ctf), 0);
  const hasLoadedChallenges = ctfs.some((ctf) => ctf.challenges.length);
  const points = ctfs.reduce((total, ctf) => total + ctf.challenges.reduce((sum, challenge) => sum + (parseInt(challenge.points, 10) || 0), 0), 0);
  const pointsRow = hasLoadedChallenges ? `<li>POINTS BANKED <strong>${points.toLocaleString()}</strong></li>` : "";
  const categories = hasLoadedChallenges ? `<section class="pixel-panel"><h2>BY CATEGORY</h2><ul class="stat-list">${countRows(categoryCounts(ctfs.flatMap((ctf) => ctf.challenges)))}</ul></section>` : "";
  return `<section class="pixel-panel"><h2>ARENA STATS</h2><ul class="stat-list"><li>EVENTS <strong>${ctfs.length}</strong></li><li>WRITEUPS <strong>${writeups}</strong></li>${pointsRow}</ul></section>${categories}`;
};

const eventSidebar = (ctf) => {
  const points = ctf.challenges.reduce((sum, challenge) => sum + (parseInt(challenge.points, 10) || 0), 0);
  const isFullEvent = ctf.challenges.length === challengeTotal(ctf);
  const pointsLabel = isFullEvent ? "TOTAL POINTS" : "PAGE POINTS";
  const categoryLabel = isFullEvent ? "BY CATEGORY" : "BY PAGE CATEGORY";
  const source = ctf.url ? `<section class="pixel-panel"><h2>SOURCE</h2><nav class="region-list"><a href="${escapeHtml(ctf.url)}" target="_blank" rel="noopener">VISIT EVENT SITE →</a></nav></section>` : "";
  return `<section class="pixel-panel"><h2>EVENT DATA</h2><ul class="stat-list"><li>ORGANIZER <strong>${escapeHtml(ctf.event || "—")}</strong></li><li>DATE <strong>${formatDate(ctf.date)}</strong></li><li>CHALLENGES <strong>${challengeTotal(ctf)}</strong></li><li>${pointsLabel} <strong>${points.toLocaleString()}</strong></li><li>DIFFICULTY <strong class="difficulty">${difficultyStars(ctf.difficulty)}</strong></li></ul></section><section class="pixel-panel"><h2>${categoryLabel}</h2><ul class="stat-list">${countRows(categoryCounts(ctf.challenges))}</ul></section>${source}`;
};

const challengeMeta = (ctf, challenge) => {
  const solves = challenge.solves ? `<li>SOLVES <strong>${escapeHtml(challenge.solves)}</strong></li>` : "";
  const flag = challenge.flag ? `<h2>FLAG CAPTURED</h2><p class="ctf-flag">${escapeHtml(challenge.flag)}</p>` : "";
  return `<h2>CHALLENGE DATA</h2><ul class="stat-list"><li>EVENT <strong>${escapeHtml(ctf.event || ctf.title)}</strong></li><li>CATEGORY <strong>${escapeHtml((challenge.category || "MISC").toUpperCase())}</strong></li><li>POINTS <strong>${escapeHtml(challenge.points || "—")}</strong></li><li>DIFFICULTY <strong class="difficulty">${difficultyStars(challenge.difficulty)}</strong></li>${solves}</ul>${flag}`;
};

const renderArena = (ctfs, ctf, requestedId, searchQuery, requestedPage) => {
  const list = document.querySelector("[data-ctf-list]");
  if (!list) return;
  const title = document.querySelector("[data-ctf-title]");
  const intro = document.querySelector("[data-ctf-intro]");
  const count = document.querySelector("[data-ctf-count]");
  const back = document.querySelector("[data-ctf-back]");
  const aside = document.querySelector("[data-ctf-aside]");
  const pagination = document.querySelector("[data-ctf-pagination]");
  const term = searchQuery.toLowerCase();

  if (ctf && term) {
    const results = searchResults([ctf], term);
    const { currentPage, totalPages, shown } = pageSlice(results, requestedPage);
    document.title = `Search ${ctf.title} · Radiant Blaze`;
    if (title) title.textContent = ctf.title.toUpperCase();
    if (intro) intro.textContent = `Search results for "${searchQuery}".`;
    if (back) back.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (count) count.textContent = `${plural(results.length, "RESULT")} · PAGE ${currentPage} OF ${totalPages}`;
    list.innerHTML = shown.map(searchResultCard).join("") || emptyMessage("NO MATCHING CTF RESULTS.");
    if (pagination) pagination.innerHTML = paginationHtml(results.length, currentPage, (page) => `ctf.html?ctf=${encodeURIComponent(ctf.id)}&q=${encodeURIComponent(searchQuery)}&pg=${page}`);
    if (aside) aside.innerHTML = eventSidebar(ctf);
    return;
  }

  if (ctf) {
    const total = challengeTotal(ctf);
    const { currentPage, totalPages } = pageMeta(total, requestedPage);
    const visible = ctf.challenges;
    const canonicalUrl = new URL("https://radiant-blaze.github.io/pages/ctf.html");
    canonicalUrl.searchParams.set("ctf", ctf.id);
    updatePageMetadata({
      title: `${ctf.title} · Radiant Blaze`,
      description: ctf.description || `Challenges from ${ctf.title}.`,
      canonicalUrl: canonicalUrl.href,
    });
    if (title) title.textContent = ctf.title.toUpperCase();
    if (intro) intro.textContent = ctf.description || "";
    if (back) back.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (count) count.textContent = `${plural(total, "CHALLENGE")} LOGGED · PAGE ${currentPage} OF ${totalPages}`;
    list.innerHTML = visible.map((challenge) => writeupCard(ctf, challenge)).join("") || emptyMessage("NO CHALLENGES LOGGED YET.");
    if (pagination) pagination.innerHTML = paginationHtml(total, currentPage, (page) => `ctf.html?ctf=${encodeURIComponent(ctf.id)}&pg=${page}`);
    if (aside) aside.innerHTML = eventSidebar({ ...ctf, challenges: visible });
    return;
  }

  if (requestedId) {
    if (title) title.textContent = "EVENT NOT FOUND";
    if (intro) intro.textContent = `No CTF event matches "${requestedId}".`;
    if (back) back.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (count) count.textContent = "";
    list.innerHTML = emptyMessage("THAT EVENT ISN'T IN THE ARCHIVE.");
    if (pagination) pagination.innerHTML = "";
    if (aside) aside.innerHTML = "";
    return;
  }

  if (term) {
    const results = searchResults(ctfs, term);
    const { currentPage, totalPages, shown } = pageSlice(results, requestedPage);
    if (back) back.innerHTML = "";
    if (title) title.textContent = "CTF SEARCH";
    if (intro) intro.textContent = `Search results for "${searchQuery}".`;
    if (count) count.textContent = `${plural(results.length, "RESULT")} · PAGE ${currentPage} OF ${totalPages}`;
    list.innerHTML = shown.map(searchResultCard).join("") || emptyMessage("NO MATCHING CTF RESULTS.");
    if (pagination) pagination.innerHTML = paginationHtml(results.length, currentPage, (page) => page === 1 ? "ctf.html?q=" + encodeURIComponent(searchQuery) : `ctf.html?q=${encodeURIComponent(searchQuery)}&pg=${page}`);
    if (aside) aside.innerHTML = arenaSidebar(ctfs);
    return;
  }

  const { currentPage, totalPages, shown } = pageSlice(ctfs, requestedPage);
  const writeups = ctfs.reduce((total, item) => total + challengeTotal(item), 0);
  if (back) back.innerHTML = "";
  if (count) count.textContent = `${plural(ctfs.length, "EVENT")} · ${plural(writeups, "WRITEUP")} · PAGE ${currentPage} OF ${totalPages}`;
  list.innerHTML = shown.map(ctfCard).join("") || emptyMessage("NO CTF EVENTS YET.");
  if (pagination) pagination.innerHTML = paginationHtml(ctfs.length, currentPage, (page) => page === 1 ? "ctf.html" : `ctf.html?pg=${page}`);
  if (aside) aside.innerHTML = arenaSidebar(ctfs);
};

const renderWriteup = (ctf, challengeFile) => {
  const article = document.querySelector("[data-writeup]");
  if (!article) return;
  const header = document.querySelector("[data-writeup-header]");
  const back = document.querySelector("[data-writeup-back]");
  const challenge = ctf?.challenges.find((item) => item.file === challengeFile);
  if (!challenge) {
    if (header) header.innerHTML = '<p class="quest-number">WRITEUP NOT FOUND</p><h1 class="quest-title">404</h1>';
    if (back) back.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    article.innerHTML = '<p>That challenge writeup isn\'t in the archive. <a href="ctf.html">Return to the CTF arena.</a></p>';
    return;
  }

  const category = (challenge.category || "MISC").toUpperCase();
  const canonical = new URL(location.href);
  canonical.search = "";
  canonical.searchParams.set("ctf", ctf.id);
  canonical.searchParams.set("challenge", challenge.file);
  canonical.hash = "";
  updatePageMetadata({ title: `${challenge.title} · ${ctf.title} · Radiant Blaze`, description: challenge.description || `CTF writeup for ${challenge.title} from ${ctf.title}.`, canonicalUrl: canonical.href });
  if (back) back.innerHTML = `<a href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">← ${escapeHtml(ctf.title.toUpperCase())}</a>`;
  if (header) header.innerHTML = `<p class="quest-number">${escapeHtml(ctf.title.toUpperCase())} · ${escapeHtml(category)}</p><h1 class="quest-title">${escapeHtml(challenge.title.toUpperCase())}</h1><div class="article-info"><span>POINTS: <b>${escapeHtml(challenge.points || "—")}</b></span><span>DIFFICULTY: <b class="difficulty">${difficultyStars(challenge.difficulty)}</b></span>${challenge.solves ? `<span>SOLVES: <b>${escapeHtml(challenge.solves)}</b></span>` : ""}<span>BY <b>${escapeHtml((challenge.author || "Radiant Blaze").toUpperCase())}</b></span></div>`;
  article.innerHTML = markdownToHtml(challenge.body);
  const layout = article.closest(".article-layout");
  const hasMath = /```math\b|\\\[|\\\(|\$\$/i.test(challenge.body);
  layout?.querySelector(":scope > .sidebar")?.remove();
  layout?.classList.toggle("article-layout--full-width", hasMath);
  const challengeIndex = ctf.challengeFiles.indexOf(challenge.file);
  const previous = ctf.challengeFiles[challengeIndex - 1];
  const next = ctf.challengeFiles[challengeIndex + 1];
  const link = (file, label) => file ? `<a href="${writeupPageUrl(ctf.id, file)}">${label}</a>` : `<span>${label}</span>`;
  article.insertAdjacentHTML("beforeend", `<nav class="article-related" aria-label="Related writeups">${link(previous, "← PREVIOUS CHALLENGE")}<span>CHALLENGE ${challengeIndex + 1} / ${ctf.challengeFiles.length}</span>${link(next, "NEXT CHALLENGE →")}</nav>`);
  if (layout && !hasMath) {
    const tags = challenge.tags.map((tag) => `<a href="ctf.html?ctf=${encodeURIComponent(ctf.id)}"># ${escapeHtml(tag).toUpperCase()}</a>`).join("");
    layout.insertAdjacentHTML("beforeend", `<aside class="sidebar"><section class="pixel-panel"><div class="hp-label"><span>READING PROGRESS</span><span>WRITEUP</span></div><div class="hp-track"><span class="hp-fill" data-hp></span></div></section><section class="pixel-panel">${challengeMeta(ctf, challenge)}</section><section class="pixel-panel"><h2>TAGS</h2><nav class="region-list">${tags}</nav></section></aside>`);
    initReadingProgress();
  }
  typesetMath(article);
};

const renderCtf = (model) => {
  const query = (params.get("q") || "").trim();
  const requestedId = params.get("ctf");
  const challengeFile = params.get("challenge");
  const article = document.querySelector("[data-writeup]");
  let requestedCtf = requestedId ? model.ctfs.find((ctf) => ctf.id === requestedId) : null;
  let visibleCtfs = model.ctfs;
  if (!requestedId && !query) {
    visibleCtfs = model.ctfs.map((ctf) => ({ ...ctf, challenges: [] }));
  } else if (requestedId && requestedCtf && !query && !article) {
    const { start } = pageMeta(challengeTotal(requestedCtf), requestedPage);
    const challengeByFile = new Map(requestedCtf.challenges.map((challenge) => [challenge.file, challenge]));
    const files = requestedCtf.challengeFiles.slice(start, start + DEFAULT_PAGE_SIZE);
    requestedCtf = { ...requestedCtf, challenges: files.map((file) => challengeByFile.get(file)).filter(Boolean) };
    visibleCtfs = [requestedCtf];
  } else if (requestedId && requestedCtf && article && challengeFile && !query) {
    const challenge = requestedCtf.challenges.find((item) => item.file === challengeFile);
    if (challenge) {
      requestedCtf = { ...requestedCtf, challenges: [challenge] };
      visibleCtfs = [requestedCtf];
    }
  } else if (requestedId && requestedCtf) {
    visibleCtfs = [requestedCtf];
  }
  document.querySelectorAll("[data-social]").forEach((element) => {
    element.innerHTML = socialHtml(model.site.social);
  });
  syncSearchForm({ query, inputSelector: "[data-ctf-search-input]", hidden: [{ selector: "[data-ctf-search-scope]", value: requestedId }] });
  renderArena(visibleCtfs, requestedCtf, requestedId, query, requestedPage);
  if (article) renderWriteup(requestedCtf, challengeFile);
};

const fallbackModule = async () => {
  const hasCtf = Boolean(document.querySelector("[data-ctf-list], [data-writeup]"));
  await fallbackToLegacy(hasCtf ? "ctf" : "blog");
};

let model;
try {
  model = await getReadModel();
} catch {
  await fallbackModule();
}

if (model) {
  if (document.querySelector("[data-ctf-list], [data-writeup]")) renderCtf(model);
  else await renderBlog(model);
  initReadingProgress();
}
