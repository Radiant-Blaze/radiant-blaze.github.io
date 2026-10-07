(() => {
  let loader;

  const show = () => {
    if (!loader?.isConnected) {
      loader = document.createElement("div");
      loader.className = "page-loader";
      loader.setAttribute("role", "status");
      loader.setAttribute("aria-live", "polite");

      const card = document.createElement("div");
      card.className = "page-loader-card";
      const text = document.createElement("span");
      text.className = "page-loader-text";
      text.textContent = "Loading";
      const bar = document.createElement("span");
      bar.className = "page-loader-bar";
      bar.setAttribute("aria-hidden", "true");
      card.append(text, bar);
      loader.append(card);
      document.body.append(loader);
    }
    loader.classList.add("is-visible");
  };

  const hide = () => {
    loader?.remove();
    loader = null;
  };

  window.RadiantBlazePageLoader = Object.freeze({ show, hide });

  // Keep the initial document behind the same loader used for navigation.
  // Article pages remove it only after their page module has finished setup.
  show();

  const setMenuOpen = (button, open) => {
    const header = button.closest(".site-header");
    const menu = document.getElementById(button.getAttribute("aria-controls"));
    if (!header || !menu) return;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    header.classList.toggle("is-menu-open", open);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-mobile-menu-toggle]");
    if (button) {
      setMenuOpen(button, button.getAttribute("aria-expanded") !== "true");
      return;
    }

    const openButton = document.querySelector(
      '.mobile-menu-toggle[aria-expanded="true"]',
    );
    if (!openButton) return;
    if (!target?.closest(".site-header")) {
      setMenuOpen(openButton, false);
      return;
    }
    if (target?.closest(".home-nav a, .quest-nav a")) setMenuOpen(openButton, false);
  });

  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openButton = document.querySelector(
      '.mobile-menu-toggle[aria-expanded="true"]',
    );
    if (!openButton) return;
    setMenuOpen(openButton, false);
    openButton.focus();
  });

  matchMedia("(min-width: 591px)").addEventListener("change", (event) => {
    if (!event.matches) return;
    document
      .querySelectorAll('.mobile-menu-toggle[aria-expanded="true"]')
      .forEach((button) => setMenuOpen(button, false));
  });

  addEventListener("click", (event) => {
    const anchor =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !anchor ||
      anchor.hasAttribute("download") ||
      anchor.target ||
      anchor.hasAttribute("data-no-loader")
    )
      return;

    const url = new URL(anchor.href, location.href);
    if (
      url.origin !== location.origin ||
      (url.pathname === location.pathname &&
        url.search === location.search &&
        url.hash === location.hash)
    )
      return;

    show();
  });

  addEventListener("pageshow", () => {
    // Article initialization owns the reveal because it may need to await
    // MathJax. All other pages are ready once the browser has restored them.
    if (document.querySelector('script[src*="/assets/js/astro-article.js"]')) return;
    hide();
  });
})();
