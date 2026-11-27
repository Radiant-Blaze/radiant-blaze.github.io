let loader: HTMLDivElement | null = null;

const createLoader = (): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = "page-loader";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");

  const card = document.createElement("div");
  card.className = "page-loader-card";
  const text = document.createElement("span");
  text.className = "page-loader-text";
  text.textContent = "Loading";
  const bar = document.createElement("span");
  bar.className = "page-loader-bar";
  bar.setAttribute("aria-hidden", "true");
  card.append(text, bar);
  element.append(card);
  document.body.append(element);
  return element;
};

const show = (): void => {
  if (!loader || !loader.isConnected) loader = createLoader();
  loader.classList.add("is-visible");
};

const hide = (): void => {
  loader?.remove();
  loader = null;
};

window.RadiantBlazePageLoader = Object.freeze({ show, hide });

if (!document.body.classList.contains("disable-page-loader")) show();
const setMenuOpen = (button: HTMLButtonElement, open: boolean): void => {
  const header = button.closest<HTMLElement>(".site-header");
  const controls = button.getAttribute("aria-controls");
  const menu = controls ? document.getElementById(controls) : null;
  if (!header || !menu) return;
  header.classList.remove("is-menu-closing");
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  header.classList.toggle("is-menu-open", open);
  if (!open) {
    header.classList.add("is-menu-closing");
    window.setTimeout(() => header.classList.remove("is-menu-closing"), 200);
  }
};

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>("[data-mobile-menu-toggle]");
  if (button) {
    setMenuOpen(button, button.getAttribute("aria-expanded") !== "true");
    return;
  }

  const openButton = document.querySelector<HTMLButtonElement>(
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
  const openButton = document.querySelector<HTMLButtonElement>(
    '.mobile-menu-toggle[aria-expanded="true"]',
  );
  if (!openButton) return;
  setMenuOpen(openButton, false);
  openButton.focus();
});

matchMedia("(min-width: 591px)").addEventListener("change", (event) => {
  if (!event.matches) return;
  document
    .querySelectorAll<HTMLButtonElement>('.mobile-menu-toggle[aria-expanded="true"]')
    .forEach((button) => setMenuOpen(button, false));
});

addEventListener("click", (event) => {
  const anchor =
    event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (
    event.defaultPrevented ||
    document.body.classList.contains("disable-page-loader") ||
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
  // Leaving the site, or jumping inside the current document (TOC links,
  // footnotes), loads nothing the shell could dismiss the overlay for.
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search) return;

  show();
});

addEventListener("pageshow", () => {
  // Article initialization owns the reveal because it may need to await
  // MathJax. All other pages are ready once the browser has restored them.
  if (document.querySelector('script[src*="/assets/js/astro-article.js"]')) return;
  hide();
});
