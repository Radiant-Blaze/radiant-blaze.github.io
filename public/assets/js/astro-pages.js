import {
  escapeHtml,
  formatDate,
  getReadModel,
  postPageUrl,
  socialHtml,
  updatePageMetadata,
  writeupPageUrl,
} from "./astro-runtime.js?v=20261119-4";
import {
  buildYearIndex,
  buildGlobalRecords,
  filterGlobalRecords,
  matchesBlogPost,
  searchCtfRecords,
} from "./astro-query-model.js?v=20261117-2";
import {
  DEFAULT_PAGE_SIZE,
  difficultyMeter,
  normalizeTopic,
  pageMeta,
  pageSlice,
  paginationHtml,
  recordTopics,
  syncSearchForm,
} from "./list-utils.js?v=20261117-2";

const params = new URLSearchParams(location.search);
const requestedPage = Math.max(1, parseInt(params.get("pg"), 10) || 1);

const listingTags = (tags = []) => tags.map((tag) => `<span class="listing-tag">#${escapeHtml(tag).toUpperCase()}</span>`).join("");
const postCard = (post) =>
  `<article class="quest-card listing-entry listing-entry--post"><div class="listing-entry__main"><p class="quest-number">POST · ${escapeHtml(post.category).toUpperCase()}</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><div class="listing-tags">${listingTags(post.tags)}</div><div class="quest-meta"><span>${formatDate(post.date)}</span><span>${escapeHtml(post.estimatedPlayTime).toUpperCase()} READ</span><span><b>${escapeHtml(post.category).toUpperCase()}</b></span></div></div><a class="listing-entry__action pixel-button start-button" href="${postPageUrl(post.file)}">READ POST →</a></article>`;

const writeupCard = (ctf, challenge) =>
  `<article class="quest-card listing-entry listing-entry--writeup"><div class="listing-entry__main"><p class="quest-number">WRITEUP · ${escapeHtml((challenge.category || "CTF").toUpperCase())}</p><p class="listing-event">${escapeHtml(ctf.title).toUpperCase()}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || `Writeup from ${ctf.title}.`)}</p><div class="listing-tags">${listingTags(challenge.tags)}</div><div class="quest-meta"><span>${formatDate(ctf.date)}</span><span><b>${escapeHtml(challenge.points || "—")}</b> PTS</span><span>${difficultyMeter(challenge.difficulty)}</span></div></div><a class="listing-entry__action pixel-button start-button" href="${writeupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></article>`;

const ctfViewportVariant = (_ctf, index = 0) => {
  const variants = ["rain", "pulse", "stars", "crt-tv", "glitch"];
  return variants[index % variants.length];
};

const ctfCard = (ctf, index = 0) => {
  const challengeCount = ctf.challengeCount ?? ctf.challenges.length;
  const difficulty = Math.max(0, Math.min(5, parseInt(ctf.difficulty, 10) || 0));
  const stars = difficultyMeter(difficulty);
  const viewportVariant = ctfViewportVariant(ctf, index);
  return `<article class="quest-card listing-entry listing-entry--event"><div class="event-viewport event-viewport--${viewportVariant}" aria-hidden="true"><img class="event-viewport__screen" src="/assets/ctf-animations/${viewportVariant}.svg" alt="" /></div><div class="listing-entry__main"><div class="event-kicker"><span class="quest-number">CTF EVENT</span></div><h2>${escapeHtml(ctf.title)}</h2><p class="listing-event">${escapeHtml(ctf.event || "INDEPENDENT EVENT")}</p><p>${escapeHtml(ctf.description || "")}</p><div class="event-stats"><span>${formatDate(ctf.date)}</span><span><b>${challengeCount}</b> ${challengeCount === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span class="event-difficulty">${stars} DIFFICULTY</span></div></div><a class="listing-entry__action pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT <span aria-hidden="true">→</span></a></article>`;
};

const emptyMessage = (value) => `<div class="rb-404-search-empty" role="status"><p class="rb-404-status">SYSTEM ERROR // 404</p><div class="rb-404-tv-wrap" role="img" aria-label="Retro television displaying a lost signal"><div class="rb-404-tv"><div class="rb-404-antenna" aria-hidden="true"><span class="rb-404-antenna-shadow"></span><span class="rb-404-antenna-left"></span><span class="rb-404-antenna-right"></span><i class="rb-404-tip-left"></i><i class="rb-404-tip-right"></i></div><div class="rb-404-display"><div class="rb-404-screen"><span>NO SIGNAL</span><b>404</b></div><div class="rb-404-screen-pattern" aria-hidden="true"></div></div><div class="rb-404-controls" aria-hidden="true"><span class="rb-404-button rb-404-button-one"></span><span class="rb-404-button rb-404-button-two"></span><div class="rb-404-speakers"><i></i><i></i><i></i><i></i><i></i></div></div><div class="rb-404-base" aria-hidden="true"><span></span><span></span></div></div></div><strong class="rb-404-search-title">${value}</strong><small>TRY ANOTHER TAG OR SEARCH TERM.</small></div>`;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "S"}`;
const challengeTotal = (ctf) => ctf.challengeCount ?? ctf.challenges.length;

// Filter pills are toggle buttons: the visual `is-active` class alone leaves the
// pressed state invisible to assistive tech.
const setPillState = (button, active) => {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
};

const renderBlog = (model) => {
  const blogQuery = (params.get("q") || "").trim();
  const posts = model.posts;
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
    const template = element.parentElement?.querySelector("[data-save-template]");
    const templateItem = template?.content.querySelector("li");
    if (!templateItem) {
      throw new Error("Save file entry template is missing.");
    }
    const hrefPrefix = element.dataset.saveHrefPrefix;
    if (!hrefPrefix) {
      throw new Error("Save file link prefix is missing.");
    }
    element.replaceChildren(...Object.entries(byYear)
      .sort(([left], [right]) => right - left)
      .map(([year, count]) => {
        const item = templateItem.cloneNode(true);
        const link = item.querySelector("a");
        const yearLabel = item.querySelector(".save-year");
        const countLabel = item.querySelector("small");
        if (!link || !yearLabel || !countLabel) {
          throw new Error("Save file entry template is incomplete.");
        }
        link.href = `${hrefPrefix}${year}`;
        yearLabel.textContent = year;
        countLabel.textContent = count;
        return item;
      }));
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
        .format(new Date(`${post.date}T00:00:00`));
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
};

const renderGlobalSearch = (posts, ctfs) => {
  const input = document.querySelector("[data-search]");
  if (!input) return;
  const writeups = ctfs.flatMap((ctf) => ctf.challenges.map((challenge) => ({ ctf, challenge })));
  const records = buildGlobalRecords(posts, ctfs);
  const query = params.get("q") || "";
  let selectedYear = params.get("year") || "";
  let currentPage = 0;
  let activeFilter = "all";
  const activeTopics = new Set((params.get("topic") || "all").toLowerCase().split(",").filter((topic) => topic && topic !== "all"));
  const topicSet = new Set(
    [...posts, ...writeups.map(({ challenge }) => challenge)]
      .flatMap((item) => [item.category, ...(item.tags || [])])
      .filter(Boolean),
  );
  const topicOptions = [...new Set([...topicSet].map(normalizeTopic))].sort((left, right) => left.localeCompare(right));
  const yearOptions = buildYearIndex(records);
  const topicCounts = new Map(topicOptions.map((topic) => [topic.toLowerCase(), 0]));
  [...posts, ...writeups.map(({ challenge }) => challenge)].forEach((item) => {
    [item.category, ...(item.tags || [])].filter(Boolean).forEach((topic) => topicCounts.set(normalizeTopic(topic), (topicCounts.get(normalizeTopic(topic)) || 0) + 1));
  });
  const topTags = document.querySelector("[data-top-tags]");
  if (topTags) {
    topTags.innerHTML = '<button type="button" class="filter-pill is-active" data-search-topic="all">ALL TOPICS</button>' + [...topicCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([topic, count]) => `<button type="button" class="filter-pill" data-search-topic="${escapeHtml(topic)}">${escapeHtml(topic.toUpperCase())} <small>${count}</small></button>`)
      .join("");
  }
  const topicContainer = document.querySelector("[data-search-topics]");
  if (topicContainer) {
    topicContainer.innerHTML = [
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

  const yearContainer = document.querySelector("[data-search-years]");
  const yearFilter = document.querySelector("[data-year-filter]");
  const yearEmpty = document.querySelector("[data-year-empty]");
  if (yearContainer) {
    yearContainer.innerHTML = [
      '<button type="button" class="filter-pill" data-search-year="all">ALL YEARS</button>',
      ...yearOptions.map(({ year, count }) => `<button type="button" class="filter-pill" data-search-year="${year}">${year} <small>${count}</small></button>`),
    ].join("");
    if (yearEmpty) {
      yearEmpty.textContent = yearOptions.length ? "NO MATCHING YEARS" : "NO YEARS AVAILABLE";
      yearEmpty.hidden = yearOptions.length > 0;
    }
    yearFilter?.addEventListener("input", () => {
      const term = yearFilter.value.trim();
      let matchingYears = 0;
      yearContainer.querySelectorAll("[data-search-year]").forEach((button) => {
        const isAllYears = button.dataset.searchYear === "all";
        const matches = isAllYears || !term || button.dataset.searchYear.includes(term);
        button.hidden = !matches;
        if (!isAllYears && matches) matchingYears += 1;
      });
      if (yearEmpty) {
        yearEmpty.textContent = yearOptions.length ? "NO MATCHING YEARS" : "NO YEARS AVAILABLE";
        yearEmpty.hidden = yearOptions.length > 0 && matchingYears > 0;
      }
    });
  }

  const applyFilterClasses = () => {
    document.querySelectorAll("[data-search-filter]").forEach((button) => {
      setPillState(button, button.dataset.searchFilter === activeFilter);
    });
    document.querySelectorAll("[data-search-topic]").forEach((button) => {
      setPillState(button, button.dataset.searchTopic === "all" ? activeTopics.size === 0 : activeTopics.has(button.dataset.searchTopic));
    });
    document.querySelectorAll("[data-search-year]").forEach((button) => {
      setPillState(button, button.dataset.searchYear === "all" ? !selectedYear : button.dataset.searchYear === selectedYear);
    });
  };
  input.value = query;
  const syncQueryParam = () => {
    const url = new URL(location.href);
    input.value ? url.searchParams.set("q", input.value) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
  };
  // The SCAN button submits the form; it re-runs the scan from page 1 and
  // normalizes the URL exactly the way typing does.
  input.closest("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderSearch(input.value, true);
    syncQueryParam();
  });
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
  document.querySelectorAll("[data-search-year]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedYear = button.dataset.searchYear === "all" ? "" : button.dataset.searchYear;
      const url = new URL(location.href);
      selectedYear ? url.searchParams.set("year", selectedYear) : url.searchParams.delete("year");
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
      list.innerHTML = shown.map((record) => record.type === "post" ? postCard(record.item) : writeupCard(record.ctf, record.item)).join("") || emptyMessage("NO RECORDS FOUND");
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
  input.addEventListener("input", () => {
    renderSearch(input.value);
    syncQueryParam();
  });
  applyFilterClasses();
  renderSearch(query);
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

const eventSidebar = (ctf) => {
  const points = ctf.challenges.reduce((sum, challenge) => sum + (parseInt(challenge.points, 10) || 0), 0);
  const isFullEvent = ctf.challenges.length === challengeTotal(ctf);
  const pointsLabel = isFullEvent ? "TOTAL POINTS" : "PAGE POINTS";
  const categoryLabel = isFullEvent ? "BY CATEGORY" : "BY PAGE CATEGORY";
  const source = ctf.url ? `<section class="pixel-panel"><h2>SOURCE</h2><nav class="region-list"><a href="${escapeHtml(ctf.url)}" target="_blank" rel="noopener">VISIT EVENT SITE</a></nav></section>` : "";
  return `<section class="pixel-panel"><h2>EVENT DATA</h2><ul class="stat-list"><li>ORGANIZER <strong>${escapeHtml(ctf.event || "—")}</strong></li><li>DATE <strong>${formatDate(ctf.date)}</strong></li><li>CHALLENGES <strong>${challengeTotal(ctf)}</strong></li><li>${pointsLabel} <strong>${points.toLocaleString()}</strong></li><li>DIFFICULTY ${difficultyMeter(ctf.difficulty)}</li></ul></section><section class="pixel-panel"><h2>${categoryLabel}</h2><ul class="stat-list">${countRows(categoryCounts(ctf.challenges))}</ul></section>${source}`;
};

const arenaAside = document.querySelector("[data-ctf-aside]");
const arenaAsideDefault = arenaAside?.innerHTML ?? "";

const renderArena = (ctfs, ctf, requestedId, searchQuery, requestedPage, fullCtf) => {
  const list = document.querySelector("[data-ctf-list]");
  if (!list) return;
  // Inside one event the aside shows that event's record instead of the
  // site-wide player card, using the unsliced event so totals stay CTF-wide.
  if (arenaAside) arenaAside.innerHTML = ctf ? eventSidebar(fullCtf || ctf) : arenaAsideDefault;
  const title = document.querySelector("[data-ctf-title]");
  const intro = document.querySelector("[data-ctf-intro]");
  const count = document.querySelector("[data-ctf-count]");
  const back = document.querySelector("[data-ctf-back]");
  const pagination = document.querySelector("[data-ctf-pagination]");
  const toolbar = document.querySelector("[data-ctf-toolbar]");
  if (toolbar) toolbar.hidden = true;
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
    return;
  }

  if (requestedId) {
    if (title) title.textContent = "EVENT NOT FOUND";
    if (intro) intro.textContent = `No CTF event matches "${requestedId}".`;
    if (back) back.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (count) count.textContent = "";
    list.innerHTML = emptyMessage("THAT EVENT ISN'T IN THE ARCHIVE.");
    if (pagination) pagination.innerHTML = "";
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
    return;
  }

  const { currentPage, totalPages, shown } = pageSlice(ctfs, requestedPage);
  const writeups = ctfs.reduce((total, item) => total + challengeTotal(item), 0);
  if (back) back.innerHTML = "";
  if (count) count.textContent = `${plural(ctfs.length, "EVENT")} · ${plural(writeups, "WRITEUP")} · PAGE ${currentPage} OF ${totalPages}`;
  if (toolbar) toolbar.hidden = false;
  const sort = document.querySelector("[data-ctf-sort]");
  const category = document.querySelector("[data-ctf-category]");
  let eventPage = requestedPage;
  const matchesCategory = (ctf, value) => value === "all" || ctf.challenges.some((challenge) => challenge.category === value);
  const selectedYear = params.get("year") || "";
  const renderEvents = () => {
    let filtered = ctfs.filter((item) => matchesCategory(item, category?.value || "all"));
    const mode = sort?.value || "recent";
    filtered = [...filtered].sort((left, right) => mode === "name"
      ? left.title.localeCompare(right.title)
      : mode === "difficulty"
        ? (parseInt(right.difficulty, 10) || 0) - (parseInt(left.difficulty, 10) || 0)
        : mode === "size"
          ? challengeTotal(right) - challengeTotal(left)
          : String(right.date).localeCompare(String(left.date)));
    const slice = pageSlice(filtered, eventPage);
    eventPage = slice.currentPage;
    if (count) count.textContent = `${plural(filtered.length, "EVENT")} · ${plural(filtered.reduce((total, item) => total + challengeTotal(item), 0), "WRITEUP")} · PAGE ${slice.currentPage} OF ${slice.totalPages}`;
    list.innerHTML = slice.shown.map(ctfCard).join("") || emptyMessage("NO CTF EVENTS MATCH THAT FILTER.");
    if (pagination) pagination.innerHTML = paginationHtml(filtered.length, slice.currentPage, (page) => {
      const next = new URLSearchParams();
      if (page > 1) next.set("pg", page);
      if (sort?.value && sort.value !== "recent") next.set("sort", sort.value);
      if (category?.value && category.value !== "all") next.set("category", category.value);
      if (selectedYear) next.set("year", selectedYear);
      return `ctf.html${next.toString() ? `?${next}` : ""}`;
    });
  };
  const updateEventFilters = () => {
    eventPage = 1;
    const url = new URL(location.href);
    sort?.value && sort.value !== "recent" ? url.searchParams.set("sort", sort.value) : url.searchParams.delete("sort");
    category?.value && category.value !== "all" ? url.searchParams.set("category", category.value) : url.searchParams.delete("category");
    url.searchParams.delete("pg");
    history.replaceState(null, "", url);
    renderEvents();
  };
  if (sort) { sort.value = params.get("sort") || "recent"; sort.addEventListener("change", updateEventFilters); }
  if (category) { category.value = params.get("category") || "all"; category.addEventListener("change", updateEventFilters); }
  renderEvents();
};

const renderCtf = (model) => {
  const query = (params.get("q") || "").trim();
  const requestedId = params.get("ctf");
  const selectedYear = params.get("year") || "";
  let requestedCtf = requestedId ? model.ctfs.find((ctf) => ctf.id === requestedId) : null;
  // Kept unsliced for the sidebar: pagination replaces requestedCtf below.
  const fullCtf = requestedCtf;
  const validYear = /^\d{4}$/.test(selectedYear) ? Number(selectedYear) : null;
  let visibleCtfs = selectedYear
    ? model.ctfs.filter((ctf) => {
      const date = new Date(`${ctf.date}T00:00:00`);
      return validYear !== null && !Number.isNaN(date.getTime()) && date.getFullYear() === validYear;
    })
    : model.ctfs;
  if (!requestedId && !query) {
    visibleCtfs = selectedYear ? visibleCtfs : model.ctfs;
  } else if (requestedId && requestedCtf && !query) {
    const { start } = pageMeta(challengeTotal(requestedCtf), requestedPage);
    const challengeByFile = new Map(requestedCtf.challenges.map((challenge) => [challenge.file, challenge]));
    const files = requestedCtf.challengeFiles.slice(start, start + DEFAULT_PAGE_SIZE);
    requestedCtf = { ...requestedCtf, challenges: files.map((file) => challengeByFile.get(file)).filter(Boolean) };
    visibleCtfs = [requestedCtf];
  } else if (requestedId && requestedCtf) {
    visibleCtfs = [requestedCtf];
  }
  document.querySelectorAll("[data-social]").forEach((element) => {
    element.innerHTML = socialHtml(model.site.social);
  });
  syncSearchForm({
    query,
    inputSelector: "[data-ctf-search-input]",
    hidden: [
      { selector: "[data-ctf-search-scope]", value: requestedId },
      { selector: "[data-ctf-search-year]", value: selectedYear },
    ],
  });
  renderArena(visibleCtfs, requestedCtf, requestedId, query, requestedPage, fullCtf);
  if (selectedYear && !requestedId && !query) {
    const title = document.querySelector("[data-ctf-title]");
    const intro = document.querySelector("[data-ctf-intro]");
    if (title) title.textContent = `YEAR: ${selectedYear}`;
    if (intro) intro.textContent = `CTF events from ${selectedYear}.`;
  }
};

const renderReadModelError = () => {
  const list = document.querySelector("[data-quest-list], [data-ctf-list]");
  if (list) list.innerHTML = emptyMessage("THE ARCHIVE COULD NOT BE LOADED.");
  document.querySelectorAll("[data-blog-count], [data-ctf-count], [data-record-count]")
    .forEach((element) => { element.textContent = "ARCHIVE UNAVAILABLE"; });
};

let model;
try {
  model = await getReadModel();
} catch (error) {
  console.error("[radiant-blaze:pages] Read model could not be loaded.", error);
  renderReadModelError();
}

if (model) {
  if (document.querySelector("[data-ctf-list]")) renderCtf(model);
  else renderBlog(model);
}
