// Unified theme system for every page. Loaded as a classic script in <head>
// so the saved theme is applied to <html> before first paint (no flash).
(() => {
  const KEY = "radiant-blaze-theme";
  const root = document.documentElement;

  const apply = (theme) => {
    const light = theme === "light";
    root.classList.toggle("light-theme", light);
    root.classList.toggle("dark-theme", !light);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const icon = button.querySelector(".theme-icon");
      if (icon) icon.textContent = light ? "\u263e" : "\u263c";
      button.setAttribute("aria-pressed", String(light));
      button.setAttribute(
        "aria-label",
        `Switch to ${light ? "dark" : "light"} theme`,
      );
    });
  };

  // Runs during head parse: swap the class immediately, buttons wired later.
  apply(localStorage.getItem(KEY) === "light" ? "light" : "dark");

  addEventListener("DOMContentLoaded", () => {
    apply(root.classList.contains("light-theme") ? "light" : "dark");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) =>
      button.addEventListener("click", () => {
        const next = root.classList.contains("light-theme") ? "dark" : "light";
        localStorage.setItem(KEY, next);
        apply(next);
      }),
    );
  });
})();
