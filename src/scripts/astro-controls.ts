const THEME_KEY = "radiant-blaze-theme";
const root = document.documentElement;

type Theme = "light" | "dark";

const currentTheme = (): Theme => (root.classList.contains("light-theme") ? "light" : "dark");

// The inline bootstrap has already chosen and painted the theme. Track it here
// so the first sync does not emit a redundant themechange event.
let appliedTheme: Theme = currentTheme();

const applyTheme = (theme: Theme): void => {
  const light = theme === "light";
  root.classList.toggle("light-theme", light);
  root.classList.toggle("dark-theme", !light);
  document.querySelectorAll<HTMLElement>("[data-theme-toggle]").forEach((button) => {
    if (button instanceof HTMLInputElement) button.checked = light;
    button.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
  });
  if (appliedTheme !== theme) {
    appliedTheme = theme;
    // Consumers that bake theme colours into the DOM re-render on this event
    // instead of waiting for a reload.
    dispatchEvent(new CustomEvent("radiantblaze:themechange", { detail: { theme } }));
  }
};

addEventListener("DOMContentLoaded", () => {
  applyTheme(currentTheme());

  addEventListener("radiantblaze:contentchange", () => {
    applyTheme(currentTheme());
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const themeToggle = target.closest<HTMLInputElement>("[data-theme-toggle]");
    if (themeToggle) {
      const next: Theme = themeToggle.checked ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        console.warn("[radiant-blaze] Theme preference could not be saved.", error);
      }
      applyTheme(next);
    }
  });

  // "/" is the conventional shortcut for archive search. Pages with a local
  // search field focus that field; every other page sends the visitor to the
  // full search page. Text fields keep their normal typing behaviour.
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.key !== "/"
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    if (document.querySelector("dialog[open]")) return;
    const search = document.querySelector(
      "[data-search], [data-blog-search-input], [data-ctf-search-input]",
    );
    event.preventDefault();
    if (search instanceof HTMLInputElement) {
      search.focus();
      search.select();
      return;
    }
    try {
      sessionStorage.setItem("radiant-blaze-focus-search", "1");
    } catch {
      // Private browsing can reject storage; navigation still works.
    }
    location.assign("/pages/search.html");
  });

  // A `/` shortcut from a page without a local search field navigates here
  // with a pending focus request, so the visitor can type immediately.
  try {
    if (sessionStorage.getItem("radiant-blaze-focus-search") === "1") {
      sessionStorage.removeItem("radiant-blaze-focus-search");
      const search = document.querySelector("[data-search]");
      if (search instanceof HTMLInputElement) {
        search.focus();
        search.select();
      }
    }
  } catch {
    // Storage failure only loses the convenience focus, never the page.
  }
});
