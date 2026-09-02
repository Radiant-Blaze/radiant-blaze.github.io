import {
  loadCtfs,
  escapeHtml,
  formatDate,
  markdownToHtml,
  socialHtml,
  initReadingProgress,
} from "./content.js";

const DATA_BASE = "../content/";

const year = (date) => new Date(`${date}T00:00:00`).getFullYear();
const clampDifficulty = (value) => Math.max(0, Math.min(5, parseInt(value, 10) || 0));
const stars = (value) => {
  const filled = clampDifficulty(value);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
};
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "S"}`;
const emptyMsg = (text) => `<p class="quest-intro">${text}</p>`;
const typesetMath = () => window.MathJax?.typesetPromise?.([document.body])?.catch?.(() => {});

const ctfCard = (ctf) =>
  `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(ctf.title)}"></div><div><p class="quest-number">CTF · ${year(ctf.date)}</p><h2>${escapeHtml(ctf.title)}</h2><p>${escapeHtml(ctf.description || "")}</p><div class="quest-meta"><span><b>${ctf.challenges.length}</b> ${ctf.challenges.length === 1 ? "CHALLENGE" : "CHALLENGES"}</span><span>${formatDate(ctf.date)}</span><span class="difficulty" title="Difficulty">${stars(ctf.difficulty)}</span></div><a class="pixel-button start-button" href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">ENTER EVENT →</a></div></article>`;

const challengeCard = (ctf, challenge) => {
  const category = (challenge.category || "MISC").toUpperCase();
  return `<article class="quest-card"><div class="quest-thumb" role="img" aria-label="Pixel art badge for ${escapeHtml(challenge.title)}"></div><div><p class="quest-number">CHALLENGE · ${escapeHtml(category)}</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.description || "")}</p><div class="quest-meta"><span><b>${escapeHtml(challenge.points || "—")}</b> PTS</span><span class="difficulty" title="Difficulty">${stars(challenge.difficulty)}</span><span><b>${escapeHtml(category)}</b></span></div><a class="pixel-button start-button" href="writeup.html?ctf=${encodeURIComponent(ctf.id)}&challenge=${encodeURIComponent(challenge.file)}">READ WRITEUP →</a></div></article>`;
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

const arenaSidebar = (ctfs) => {
  const writeups = ctfs.reduce((sum, ctf) => sum + ctf.challenges.length, 0);
  const points = ctfs.reduce(
    (sum, ctf) =>
      sum + ctf.challenges.reduce((s, ch) => s + (parseInt(ch.points, 10) || 0), 0),
    0,
  );
  const counts = categoryCounts(ctfs.flatMap((ctf) => ctf.challenges));
  return `<section class="pixel-panel"><h2>ARENA STATS</h2><ul class="stat-list"><li>EVENTS <strong>${ctfs.length}</strong></li><li>WRITEUPS <strong>${writeups}</strong></li><li>POINTS BANKED <strong>${points.toLocaleString()}</strong></li></ul></section><section class="pixel-panel"><h2>BY CATEGORY</h2><ul class="stat-list">${countRows(counts)}</ul></section>`;
};

const eventSidebar = (ctf) => {
  const points = ctf.challenges.reduce((s, ch) => s + (parseInt(ch.points, 10) || 0), 0);
  const source = ctf.url
    ? `<section class="pixel-panel"><h2>SOURCE</h2><nav class="region-list"><a href="${escapeHtml(ctf.url)}" target="_blank" rel="noopener">VISIT EVENT SITE →</a></nav></section>`
    : "";
  return `<section class="pixel-panel"><h2>EVENT DATA</h2><ul class="stat-list"><li>ORGANIZER <strong>${escapeHtml(ctf.event || "—")}</strong></li><li>DATE <strong>${formatDate(ctf.date)}</strong></li><li>CHALLENGES <strong>${ctf.challenges.length}</strong></li><li>TOTAL POINTS <strong>${points.toLocaleString()}</strong></li><li>DIFFICULTY <strong class="difficulty">${stars(ctf.difficulty)}</strong></li></ul></section><section class="pixel-panel"><h2>BY CATEGORY</h2><ul class="stat-list">${countRows(categoryCounts(ctf.challenges))}</ul></section>${source}`;
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

  if (ctf) {
    document.title = `${ctf.title} · Radiant Blaze`;
    if (titleEl) titleEl.textContent = ctf.title.toUpperCase();
    if (introEl) introEl.textContent = ctf.description || "";
    if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (countEl) countEl.textContent = `${plural(ctf.challenges.length, "CHALLENGE")} LOGGED`;
    list.innerHTML =
      ctf.challenges.map((challenge) => challengeCard(ctf, challenge)).join("") ||
      emptyMsg("NO CHALLENGES LOGGED YET.");
    if (asideEl) asideEl.innerHTML = eventSidebar(ctf);
    return;
  }

  if (requestedId) {
    if (titleEl) titleEl.textContent = "EVENT NOT FOUND";
    if (introEl) introEl.textContent = `No CTF event matches "${requestedId}".`;
    if (backEl) backEl.innerHTML = '<a href="ctf.html">← ALL CTF EVENTS</a>';
    if (countEl) countEl.textContent = "";
    list.innerHTML = emptyMsg("THAT EVENT ISN'T IN THE ARCHIVE.");
    if (asideEl) asideEl.innerHTML = "";
    return;
  }

  const writeups = ctfs.reduce((sum, item) => sum + item.challenges.length, 0);
  if (backEl) backEl.innerHTML = "";
  if (countEl)
    countEl.textContent = `${plural(ctfs.length, "EVENT")} · ${plural(writeups, "WRITEUP")}`;
  list.innerHTML = ctfs.map(ctfCard).join("") || emptyMsg("NO CTF EVENTS YET.");
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
  document.title = `${challenge.title} · ${ctf.title} · Radiant Blaze`;
  if (backEl)
    backEl.innerHTML = `<a href="ctf.html?ctf=${encodeURIComponent(ctf.id)}">← ${escapeHtml(ctf.title.toUpperCase())}</a>`;
  if (headerEl)
    headerEl.innerHTML = `<p class="quest-number">${escapeHtml(ctf.title.toUpperCase())} · ${escapeHtml(category)}</p><h1 class="quest-title">${escapeHtml(challenge.title.toUpperCase())}</h1><div class="article-info"><span>POINTS: <b>${escapeHtml(challenge.points || "—")}</b></span><span>DIFFICULTY: <b class="difficulty">${stars(challenge.difficulty)}</b></span>${challenge.solves ? `<span>SOLVES: <b>${escapeHtml(challenge.solves)}</b></span>` : ""}<span>BY <b>${escapeHtml((challenge.author || "Radiant Blaze").toUpperCase())}</b></span></div>`;
  article.innerHTML = markdownToHtml(challenge.body);
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

loadCtfs(DATA_BASE)
  .then(({ site, ctfs }) => {
    document
      .querySelectorAll("[data-social]")
      .forEach((el) => (el.innerHTML = socialHtml(site.social)));

    const params = new URLSearchParams(location.search);
    const requestedId = params.get("ctf");
    const challengeFile = params.get("challenge");
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
