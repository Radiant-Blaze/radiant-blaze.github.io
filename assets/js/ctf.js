import {
  loadCtfs,
  escapeHtml,
  formatDate,
  markdownToHtml,
  socialHtml,
  initReadingProgress,
  typesetMath,
  updatePageMetadata,
  writeupPageUrl,
} from "./content.js";
import {
  DEFAULT_PAGE_SIZE,
  pageMeta,
  pageSlice,
  paginationHtml,
  searchableText,
  syncSearchForm,
} from "./list-utils.js";

const DATA_BASE = "../content/";

// Writeup bodies are the heavy payload, so list views ask for only what they
// render: one page of an event, one writeup, or metadata-only arena cards.
const writeupArticle = document.querySelector("[data-writeup]");
const params = new URLSearchParams(location.search);
const requestedId = params.get("ctf");
const challengeFile = params.get("challenge");
const searchQuery = (params.get("q") || "").trim();
const requestedPage = Math.max(1, parseInt(params.get("pg"), 10) || 1);
const scope = requestedId
  ? {
      events: [requestedId],
      challenges:
        writeupArticle && challengeFile && !searchQuery ? [challengeFile] : undefined,
      challengePage:
        (writeupArticle && challengeFile) || searchQuery
          ? undefined
          : {
              start: (requestedPage - 1) * DEFAULT_PAGE_SIZE,
              end: requestedPage * DEFAULT_PAGE_SIZE,
            },
    }
  : { loadChallengeBodies: Boolean(searchQuery) };

const year = (date) => new Date(`${date}T00:00:00`).getFullYear();
const clampDifficulty = (value) => Math.max(0, Math.min(5, parseInt(value, 10) || 0));
const stars = (value) => {
  const filled = clampDifficulty(value);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
};
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "S"}`;
const emptyMsg = (text) => `<p class="quest-intro">${text}</p>`;
const challengeTotal = (ctf) => ctf.challengeCount ?? ctf.challenges.length;

const ctfCard = (ctf) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(ctf.title)}"></div><div><p class="quest-number">CTF · ${year(ctf.date)}</p><h2>${escapeHtml(ctf.title)}</h2><p>${escapeHtml(ctf.description || "")}</p><div class="quest-meta"><span><b>${challengeTotal(ctf)}</b> ${challengeTotal(ctf) === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span>${formatDate(ctf.date)}</span><span class="difficulty" title="Difficulty">${stars(ctf.difficulty)}</span></div><a class="pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT →</a></div></article>`;

const challengeCard = (ctf, challenge) => {
  const category = (challenge.category || "MISC").toUpperCase();
  return `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(challenge.title)}"></div><div><p class="quest-number">CHALLENGE · ${escapeHtml(category)}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || "")}</p><div class="quest-meta"><span><b>${escapeHtml(challenge.points || "—")}</b> PTS</span><span class="difficulty" title="Difficulty">${stars(challenge.difficulty)}</span><span><b>${escapeHtml(category)}</b></span></div><a class="pixel-button start-button" href="${writeupPageUrl(ctf.id, challenge.file)}">READ WRITEUP →</a></div></article>`;
};

const categoryCounts = (challenges) => {
  const counts = {};
  challenges.forEach((challenge) => {
    if (challenge.category) {
      counts[challenge.category] = (counts[challenge.category] || 0) + 1;
    }
  });
  return counts;
};

const countRows = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<li>${escapeHtml(name).toUpperCase()} <strong>${n}</strong></li>`)
    .join("") || "<li>NONE YET <strong>0</strong></li>";

const ctfMatches = (ctf, term) =>
  searchableText(ctf.title, ctf.event, ctf.description, ctf.date).includes(term);

const challengeMatches = (ctf, challenge, term) =>
  searchableText(
    challenge.title,
    challenge.description,
    challenge.category,
    challenge.tags || [],
    challenge.points,
    challenge.body,
    ctf.title,
    ctf.event,
  ).includes(term);

const searchResults = (ctfs, term) =>
  ctfs.flatMap((ctf) => {
    const results = ctfMatches(ctf, term) ? [{ type: "ctf", ctf }] : [];
    ctf.challenges
      .filter((challenge) => challengeMatches(ctf, challenge, term))
      .forEach((challenge) => results.push({ type: "challenge", ctf, challenge }));
    return results;
  });

const searchResultCard = (result) =>
  result.type === "ctf" ? ctfCard(result.ctf) : challengeCard(result.ctf, result.challenge);

const setupSearchForm = () => {
  syncSearchForm({
    query: searchQuery,
    inputSelector: "[data-ctf-search-input]",
    hidden: [{ selector: "[data-ctf-search-scope]", value: requestedId }],
  });
};

const arenaSidebar = (ctfs) => {
  const writeups = ctfs.reduce((sum, ctf) => sum + challengeTotal(ctf), 0);
  const hasLoadedChallenges = ctfs.some((ctf) => ctf.challenges.length);
  const points = ctfs.reduce(
    (sum, ctf) =>
      sum + ctf.challenges.reduce((s, ch) => s + (parseInt(ch.points, 10) || 0), 0),
    0,
  );
  const counts = categoryCounts(ctfs.flatMap((ctf) => ctf.challenges));
  const pointsRow = hasLoadedChallenges
    ? `<li>POINTS BANKED <strong>${points.toLocaleString()}</strong></li>`
    : "";
  const categoryPanel = hasLoadedChallenges
    ? `<section class="pixel-panel"><h2>BY CATEGORY</h2><ul class="stat-list">${countRows(counts)}</ul></section>`
    : "";
  return `<section class="pixel-panel"><h2>ARENA STATS</h2><ul class="stat-list"><li>EVENTS <strong>${ctfs.length}</strong></li><li>WRITEUPS <strong>${writeups}</strong></li>${pointsRow}</ul></section>${categoryPanel}`;
};

const eventSidebar = (ctf) => {
  const points = ctf.challenges.reduce((s, ch) => s + (parseInt(ch.points, 10) || 0), 0);
  const isFullEvent = ctf.challenges.length === challengeTotal(ctf);
  const pointsLabel = isFullEvent ? "TOTAL POINTS" : "PAGE POINTS";
  const categoryLabel = isFullEvent ? "BY CATEGORY" : "BY PAGE CATEGORY";
  const source = ctf.url
    ? `<section class="pixel-panel"><h2>SOURCE</h2><nav class="region-list"><a href="${escapeHtml(ctf.url)}" target="_blank" rel="noopener">VISIT EVENT SITE →</a></nav></section>`
    : "";
  return `<section class="pixel-panel"><h2>EVENT DATA</h2><ul class="stat-list"><li>ORGANIZER <strong>${escapeHtml(ctf.event || "—")}</strong></li><li>DATE <strong>${formatDate(ctf.date)}</strong></li><li>CHALLENGES <strong>${challengeTotal(ctf)}</strong></li><li>${pointsLabel} <strong>${points.toLocaleString()}</strong></li><li>DIFFICULTY <strong class="difficulty">${stars(ctf.difficulty)}</strong></li></ul></section><section class="pixel-panel"><h2>${categoryLabel}</h2><ul class="stat-list">${countRows(categoryCounts(ctf.challenges))}</ul></section>${source}`;
};

const challengeMeta = (ctf, challenge) => {
  const solves = challenge.solves
    ? `<li>SOLVES <strong>${escapeHtml(challenge.solves)}</strong></li>`
    : "";
  const flag = challenge.flag
    ? `<h2>FLAG CAPTURED</h2><p class="ctf-flag">${escapeHtml(challenge.flag)}</p>`
    : "";
  return `<h2>CHALLENGE DATA</h2><ul class="stat-list"><li>EVENT <strong>${escapeHtml(ctf.event || ctf.title)}</strong></li><li>CATEGORY <strong>${escapeHtml((challenge.category || "MISC").toUpperCase())}</strong></li><li>POINTS <strong>${escapeHtml(challenge.points || "—")}</strong></li><li>DIFFICULTY <strong class="difficulty">${stars(challenge.difficulty)}</strong></li>${solves}</ul>${flag}`;
};

// ctf.html — events grid, or one event's challenge list when ?ctf= is present.
const renderArena = (ctfs, ctf, requestedId) => {
  const list = document.querySelector("[data-ctf-list]");
  if (!list) return;
  const titleEl = document.querySelector("[data-ctf-title]");
  const introEl = document.querySelector("[data-ctf-intro]");
  const countEl = document.querySelector("[data-ctf-count]");
  const backEl = document.querySelector("[data-ctf-back]");
  const asideEl = document.querySelector("[data-ctf-aside]");
  const paginationEl = document.querySelector("[data-ctf-pagination]");
  const term = searchQuery.toLowerCase();

  if (ctf) {
    if (term) {
      const results = searchResults([ctf], term);
      const { currentPage, totalPages, shown: shownResults } = pageSlice(
        results,
        requestedPage,
      );
      document.title = `Search ${ctf.title} · Radiant Blaze`;
      if (titleEl) titleEl.textContent = ctf.title.toUpperCase();
      if (introEl) introEl.textContent = `Search results for "${searchQuery}".`;
      if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
      if (countEl)
        countEl.textContent = `${plural(results.length, "RESULT")} · PAGE ${currentPage} OF ${totalPages}`;
      list.innerHTML =
        shownResults.map(searchResultCard).join("") || emptyMsg("NO MATCHING CTF RESULTS.");
      if (paginationEl)
        paginationEl.innerHTML = paginationHtml(
          results.length,
          currentPage,
          (page) =>
            `ctf.html?ctf=${encodeURIComponent(ctf.id)}&q=${encodeURIComponent(searchQuery)}&pg=${page}`,
        );
      if (asideEl) asideEl.innerHTML = eventSidebar(ctf);
      return;
    }

    const totalChallenges = challengeTotal(ctf);
    const { currentPage, totalPages } = pageMeta(totalChallenges, requestedPage);
    document.title = `${ctf.title} · Radiant Blaze`;
    if (titleEl) titleEl.textContent = ctf.title.toUpperCase();
    if (introEl) introEl.textContent = ctf.description || "";
    if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (countEl)
      countEl.textContent = `${plural(totalChallenges, "CHALLENGE")} LOGGED · PAGE ${currentPage} OF ${totalPages}`;
    list.innerHTML =
      ctf.challenges.map((challenge) => challengeCard(ctf, challenge)).join("") ||
      emptyMsg("NO CHALLENGES LOGGED YET.");
    if (paginationEl)
      paginationEl.innerHTML = paginationHtml(
        totalChallenges,
        currentPage,
        (page) => `ctf.html?ctf=${encodeURIComponent(ctf.id)}&pg=${page}`,
      );
    if (asideEl) asideEl.innerHTML = eventSidebar(ctf);
    return;
  }

  if (requestedId) {
    if (titleEl) titleEl.textContent = "EVENT NOT FOUND";
    if (introEl) introEl.textContent = `No CTF event matches "${requestedId}".`;
    if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (countEl) countEl.textContent = "";
    list.innerHTML = emptyMsg("THAT EVENT ISN'T IN THE ARCHIVE.");
    if (paginationEl) paginationEl.innerHTML = "";
    if (asideEl) asideEl.innerHTML = "";
    return;
  }

  if (term) {
    const results = searchResults(ctfs, term);
    const {
      currentPage: currentSearchPage,
      totalPages: searchPages,
      shown: shownResults,
    } = pageSlice(results, requestedPage);
    if (backEl) backEl.innerHTML = "";
    if (titleEl) titleEl.textContent = "CTF SEARCH";
    if (introEl) introEl.textContent = `Search results for "${searchQuery}".`;
    if (countEl)
      countEl.textContent = `${plural(results.length, "RESULT")} · PAGE ${currentSearchPage} OF ${searchPages}`;
    list.innerHTML =
      shownResults.map(searchResultCard).join("") || emptyMsg("NO MATCHING CTF RESULTS.");
    if (paginationEl)
      paginationEl.innerHTML = paginationHtml(results.length, currentSearchPage, (page) =>
        page === 1
          ? `ctf.html?q=${encodeURIComponent(searchQuery)}`
          : `ctf.html?q=${encodeURIComponent(searchQuery)}&pg=${page}`,
      );
    if (asideEl) asideEl.innerHTML = arenaSidebar(ctfs);
    return;
  }

  const { currentPage, totalPages, shown: shownCtfs } = pageSlice(ctfs, requestedPage);
  const writeups = ctfs.reduce((sum, item) => sum + challengeTotal(item), 0);
  if (backEl) backEl.innerHTML = "";
  if (countEl)
    countEl.textContent = `${plural(ctfs.length, "EVENT")} · ${plural(writeups, "WRITEUP")} · PAGE ${currentPage} OF ${totalPages}`;
  list.innerHTML = shownCtfs.map(ctfCard).join("") || emptyMsg("NO CTF EVENTS YET.");
  if (paginationEl)
    paginationEl.innerHTML = paginationHtml(ctfs.length, currentPage, (page) =>
      page === 1 ? "ctf.html" : `ctf.html?pg=${page}`,
    );
  if (asideEl) asideEl.innerHTML = arenaSidebar(ctfs);
};

// writeup.html — a single challenge writeup for ?ctf=&challenge=.
const renderWriteup = (ctf, challengeFile) => {
  const article = document.querySelector("[data-writeup]");
  if (!article) return;
  const headerEl = document.querySelector("[data-writeup-header]");
  const metaEl = document.querySelector("[data-writeup-meta]");
  const tagsEl = document.querySelector("[data-writeup-tags]");
  const backEl = document.querySelector("[data-writeup-back]");

  const challenge =
    ctf && challengeFile ? ctf.challenges.find((item) => item.file === challengeFile) : null;

  if (!challenge) {
    if (headerEl)
      headerEl.innerHTML =
        '<p class="quest-number">WRITEUP NOT FOUND</p><h1 class="quest-title">404</h1>';
    if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    article.innerHTML =
      '<p>That challenge writeup isn\'t in the archive. <a href="ctf.html">Return to the CTF arena.</a></p>';
    if (metaEl) metaEl.innerHTML = "";
    if (tagsEl) tagsEl.innerHTML = "";
    return;
  }

  const category = (challenge.category || "MISC").toUpperCase();
  const canonicalUrl = new URL(location.href);
  canonicalUrl.search = "";
  canonicalUrl.searchParams.set("ctf", ctf.id);
  canonicalUrl.searchParams.set("challenge", challenge.file);
  canonicalUrl.hash = "";
  updatePageMetadata({
    title: `${challenge.title} · ${ctf.title} · Radiant Blaze`,
    description: challenge.description || `CTF writeup for ${challenge.title} from ${ctf.title}.`,
    canonicalUrl: canonicalUrl.href,
  });
  if (backEl)
    backEl.innerHTML = `<a href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">← ${escapeHtml(ctf.title.toUpperCase())}</a>`;
  if (headerEl)
    headerEl.innerHTML = `<p class="quest-number">${escapeHtml(ctf.title.toUpperCase())} · ${escapeHtml(category)}</p><h1 class="quest-title">${escapeHtml(challenge.title.toUpperCase())}</h1><div class="article-info"><span>POINTS: <b>${escapeHtml(challenge.points || "—")}</b></span><span>DIFFICULTY: <b class="difficulty">${stars(challenge.difficulty)}</b></span>${challenge.solves ? `<span>SOLVES: <b>${escapeHtml(challenge.solves)}</b></span>` : ""}<span>BY <b>${escapeHtml((challenge.author || "Radiant Blaze").toUpperCase())}</b></span></div>`;
  article.innerHTML = markdownToHtml(challenge.body);
  const challengeIndex = ctf.challengeFiles.indexOf(challenge.file);
  const previous = ctf.challengeFiles[challengeIndex - 1];
  const next = ctf.challengeFiles[challengeIndex + 1];
  const writeupLink = (file, label) =>
    file
      ? `<a href="${writeupPageUrl(ctf.id, file)}">${label}</a>`
      : `<span>${label}</span>`;
  article.insertAdjacentHTML(
    "beforeend",
    `<nav class="article-related" aria-label="Related writeups">${writeupLink(previous, "← PREVIOUS CHALLENGE")}<span>CHALLENGE ${challengeIndex + 1} / ${ctf.challengeFiles.length}</span>${writeupLink(next, "NEXT CHALLENGE →")}</nav>`,
  );
  if (metaEl) metaEl.innerHTML = challengeMeta(ctf, challenge);
  if (tagsEl)
    tagsEl.innerHTML = challenge.tags
      .map(
        (tag) =>
          `<a href="ctf.html?ctf=${encodeURIComponent(ctf.id)}"># ${escapeHtml(tag).toUpperCase()}</a>`,
      )
      .join("");
  typesetMath();
};

loadCtfs(DATA_BASE, scope)
  .then(({ site, ctfs }) => {
    document
      .querySelectorAll("[data-social]")
      .forEach((el) => (el.innerHTML = socialHtml(site.social)));
    setupSearchForm();

    const ctf = requestedId ? ctfs.find((item) => item.id === requestedId) : null;

    renderArena(ctfs, ctf, requestedId);
    renderWriteup(ctf, challengeFile);
  })
  .catch(() => {
    document
      .querySelectorAll("[data-ctf-list]")
      .forEach((el) => (el.innerHTML = emptyMsg("CTF DATA COULD NOT LOAD.")));
    const writeup = document.querySelector("[data-writeup]");
    if (writeup) writeup.innerHTML = "<p>Writeup could not load.</p>";
  });

initReadingProgress();
