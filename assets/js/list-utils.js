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

export const paginationHtml = (
  totalItems,
  currentPage,
  pageHref,
  { pageSize = DEFAULT_PAGE_SIZE, className = "pixel-button start-button" } = {},
) => {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return "";
  return Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    return `<a class="${className}" href="${pageHref(page)}"${page === currentPage ? ' aria-current="page"' : ""}>${page}</a>`;
  }).join("");
};

export const searchableText = (...values) =>
  values
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

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
