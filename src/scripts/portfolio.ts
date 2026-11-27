// Portfolio filters. The page is an Astro route; this module self-initializes
// on direct load and on every SPA contentchange, so listeners and DOM
// references stay scoped to one page instead of living for the whole session.
let disposePage: (() => void) | null = null;

export const initPage = (): void => {
  disposePage?.();
  disposePage = null;
  const root = document.querySelector<HTMLElement>("[data-portfolio-projects]");
  if (!root) return;
  root.dataset.portfolioReady = "true";

  const cards = [...root.querySelectorAll<HTMLElement>("[data-portfolio-project]")];
  const category = root.querySelector<HTMLSelectElement>("[data-project-category]");
  const technology = root.querySelector<HTMLSelectElement>("[data-project-technology]");
  const count = root.querySelector<HTMLElement>("[data-project-count]");
  const empty = root.querySelector<HTMLElement>("[data-project-empty]");
  const params = new URLSearchParams(location.search);

  const setValidFilter = (control: HTMLSelectElement | null, value: string): void => {
    if (control && [...control.options].some((option) => option.value === value)) {
      control.value = value;
    }
  };
  setValidFilter(category, params.get("projectCategory") || "");
  setValidFilter(technology, params.get("projectTechnology") || "");

  const update = (syncUrl = true): void => {
    let visible = 0;
    for (const card of cards) {
      const matchesCategory = !category?.value || card.dataset.category === category.value;
      const technologies = (card.dataset.technologies || "").split("|");
      const matchesTechnology =
        !technology?.value || technologies.includes(technology.value);
      const matches = matchesCategory && matchesTechnology;
      card.hidden = !matches;
      if (matches) visible++;
    }

    if (count) count.textContent = `${visible} / ${cards.length} PROJECTS`;
    if (empty) empty.hidden = visible > 0;

    if (syncUrl) {
      const url = new URL(location.href);
      if (category?.value) url.searchParams.set("projectCategory", category.value);
      else url.searchParams.delete("projectCategory");
      if (technology?.value) url.searchParams.set("projectTechnology", technology.value);
      else url.searchParams.delete("projectTechnology");
      history.replaceState(history.state, "", url);
    }
  };

  category?.addEventListener("change", () => update());
  technology?.addEventListener("change", () => update());
  const onPopState = (): void => {
    const current = new URLSearchParams(location.search);
    setValidFilter(category, current.get("projectCategory") || "");
    setValidFilter(technology, current.get("projectTechnology") || "");
    update(true);
  };
  addEventListener("popstate", onPopState);
  update(true);

  disposePage = () => {
    removeEventListener("popstate", onPopState);
  };
};

addEventListener("radiantblaze:pagedisposing", () => {
  disposePage?.();
  disposePage = null;
});

// Bundlers may tree-shake the named export from a side-effect entry chunk, so
// the module cannot rely on the router calling initPage. Initialize on first
// evaluation (direct load or first SPA import) and re-run after every SPA swap;
// initPage is idempotent and disposes the previous page's listeners.
addEventListener("radiantblaze:contentchange", () => initPage());
initPage();
