(() => {
  const THEME_KEY = "radiant-blaze-theme";
  const root = document.documentElement;

  const applyTheme = (theme) => {
    const light = theme === "light";
    root.classList.toggle("light-theme", light);
    root.classList.toggle("dark-theme", !light);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.checked = light;
      button.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
    });
  };

  let initialTheme = "dark";
  try {
    initialTheme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch (error) {
    console.warn("[radiant-blaze] Theme preference could not be read.", error);
  }
  applyTheme(initialTheme);

  addEventListener("DOMContentLoaded", () => {
    applyTheme(root.classList.contains("light-theme") ? "light" : "dark");

    addEventListener("radiantblaze:contentchange", () => {
      applyTheme(root.classList.contains("light-theme") ? "light" : "dark");
    });

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const themeToggle = target.closest("[data-theme-toggle]");
      if (themeToggle) {
        const next = themeToggle.checked ? "light" : "dark";
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch (error) {
          console.warn("[radiant-blaze] Theme preference could not be saved.", error);
        }
        applyTheme(next);
      }
    });
  });
})();