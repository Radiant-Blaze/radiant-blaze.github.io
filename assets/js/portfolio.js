const root = document.querySelector("[data-portfolio-projects]");

if (root) {
  const cards = [...root.querySelectorAll("[data-portfolio-project]")];
  const category = root.querySelector("[data-project-category]");
  const technology = root.querySelector("[data-project-technology]");
  const count = root.querySelector("[data-project-count]");
  const empty = root.querySelector("[data-project-empty]");
  const params = new URLSearchParams(location.search);

  const setValidFilter = (control, value) => {
    if (control && [...control.options].some((option) => option.value === value)) control.value = value;
  };
  setValidFilter(category, params.get("projectCategory") || "");
  setValidFilter(technology, params.get("projectTechnology") || "");

  const update = (syncUrl = true) => {
    let visible = 0;
    for (const card of cards) {
      const matchesCategory = !category?.value || card.dataset.category === category.value;
      const technologies = (card.dataset.technologies || "").split("|");
      const matchesTechnology = !technology?.value || technologies.includes(technology.value);
      const matches = matchesCategory && matchesTechnology;
      card.hidden = !matches;
      if (matches) visible++;
    }

    if (count) count.textContent = `${visible} / ${cards.length} PROJECTS`;
    if (empty) empty.hidden = visible > 0;

    if (syncUrl) {
      const url = new URL(location.href);
      category?.value ? url.searchParams.set("projectCategory", category.value) : url.searchParams.delete("projectCategory");
      technology?.value ? url.searchParams.set("projectTechnology", technology.value) : url.searchParams.delete("projectTechnology");
      history.replaceState(history.state, "", url);
    }
  };

  category?.addEventListener("change", () => update());
  technology?.addEventListener("change", () => update());
  addEventListener("popstate", () => {
    const current = new URLSearchParams(location.search);
    setValidFilter(category, current.get("projectCategory") || "");
    setValidFilter(technology, current.get("projectTechnology") || "");
    update(true);
  });
  update(true);
}
