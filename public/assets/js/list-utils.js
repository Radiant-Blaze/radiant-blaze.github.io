export const DEFAULT_PAGE_SIZE = 5;

export const pageCount = (totalItems, pageSize = DEFAULT_PAGE_SIZE) =>
  Math.max(1, Math.ceil(totalItems / pageSize));

export const activePage = (requestedPage, totalItems, pageSize = DEFAULT_PAGE_SIZE) =>
  Math.min(Math.max(1, requestedPage), pageCount(totalItems, pageSize));

export const pageMeta = (totalItems, requestedPage, pageSize = DEFAULT_PAGE_SIZE) => {
  const currentPage = activePage(requestedPage, totalItems, pageSize);
  return {
    currentPage,
    totalPages: pageCount(totalItems, pageSize),
    start: (currentPage - 1) * pageSize,
  };
};

export const pageSlice = (items, requestedPage, pageSize = DEFAULT_PAGE_SIZE) => {
  const meta = pageMeta(items.length, requestedPage, pageSize);
  return {
    ...meta,
    shown: items.slice(meta.start, meta.start + pageSize),
  };
};

// Keep the pagination control bounded. Large archives still show the first
// and last page plus a window around the current one instead of one button per
// page (500 records would otherwise emit 100 buttons).
export const pageWindow = (currentPage, totalPages, radius = 2) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const windowPages = new Set([1, totalPages]);
  for (let page = currentPage - radius; page <= currentPage + radius; page += 1) {
    if (page > 0 && page <= totalPages) windowPages.add(page);
  }
  const ordered = [...windowPages].sort((left, right) => left - right);
  const result = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous && page - previous > 1) result.push("…");
    result.push(page);
    previous = page;
  }
  return result;
};

export const paginationHtml = (
  totalItems,
  currentPage,
  pageHref,
  { pageSize = DEFAULT_PAGE_SIZE, className = "pixel-button start-button" } = {},
) => {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return "";
  const previous = `<a class="${className}" href="${pageHref(Math.max(1, currentPage - 1))}" aria-label="Previous page"${currentPage === 1 ? ' aria-disabled="true" tabindex="-1"' : ""}>‹</a>`;
  const next = `<a class="${className}" href="${pageHref(Math.min(totalPages, currentPage + 1))}" aria-label="Next page"${currentPage === totalPages ? ' aria-disabled="true" tabindex="-1"' : ""}>›</a>`;
  const pages = pageWindow(currentPage, totalPages).map((page) => page === "…"
    ? '<span class="pagination-gap" aria-hidden="true">…</span>'
    : `<a class="${className}" href="${pageHref(page)}"${page === currentPage ? ' aria-current="page"' : ""}>${page}</a>`).join("");
  return previous + pages + next;
};

export const searchableText = (...values) =>
  values
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const normalizeTopic = (value) => String(value ?? "").trim().toLowerCase();

export const recordTopics = (item = {}, ctf) =>
  [item.category, ...(item.tags || []), ctf?.title]
    .filter(Boolean)
    .map(normalizeTopic);

const DIFFICULTY_TIERS = ["UNRATED", "EASY", "MEDIUM", "HARD", "INSANE", "EXTREME"];

export const difficultyMeter = (value) => {
  const level = Math.max(0, Math.min(5, Number.parseInt(String(value ?? "0"), 10) || 0));
  const tier = DIFFICULTY_TIERS[level];
  const bars = Array.from({ length: 5 }, (_, index) => `<i${index < level ? ' class="on"' : ""}></i>`).join("");
  const label = `Difficulty: ${tier}, ${level} of 5`;
  return `<span class="difficulty-meter" data-level="${level}" role="img" aria-label="${label}" title="${label}"><span class="difficulty-meter__bars" aria-hidden="true">${bars}</span><span class="difficulty-meter__label" aria-hidden="true">${tier}</span></span>`;
};

export const syncSearchForm = ({ query, inputSelector, hidden = [] }) => {
  const input = document.querySelector(inputSelector);
  if (input) input.value = query;
  hidden.forEach(({ selector, value }) => {
    const field = document.querySelector(selector);
    if (!field) return;
    field.value = value || "";
    field.disabled = !value;
  });
};
