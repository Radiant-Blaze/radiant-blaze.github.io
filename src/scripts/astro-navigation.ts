// Astro's primary shell navigation. Kept behavior-compatible with the legacy router.
let navigating = false;
// Navigations that arrive while one is in flight are not dropped: the slot
// keeps only the latest one, and it runs as soon as the in-flight navigation
// settles without falling back to a full page load.
type SpaNavigationOptions = { push?: boolean; scrollY?: number };
let pendingNavigation: { url: URL; options: SpaNavigationOptions } | null = null;
// The document currently rendered into <main>. Fragment-only history entries
// (TOC links, "back to top") must not refetch a page that is already on screen.
let renderedPath = location.pathname + location.search;

// A fragment is only worth a new navigation when it names content that exists;
// dead fragments must not re-run the page that is already rendered.
const hasMeaningfulFragment = (url: URL): boolean => {
  if (!url.hash) return false;
  try {
    const id = decodeURIComponent(url.hash.slice(1));
    return id !== "" && document.getElementById(id) !== null;
  } catch {
    return false;
  }
};

// Classes the shell controls at runtime. Everything else on <body> belongs to
// the page currently rendered and must follow a main swap.
const RUNTIME_BODY_CLASSES: Record<string, true> = {
  "is-menu-open": true,
  "is-menu-closing": true,
  "is-navigating": true,
};

const isInternalPageLink = (anchor: HTMLAnchorElement | null, url: URL): boolean =>
  Boolean(
    anchor &&
      url.origin === location.origin &&
      !anchor.hasAttribute("download") &&
      !anchor.target &&
      !anchor.hasAttribute("data-no-spa") &&
      !(url.pathname === location.pathname && url.search === location.search),
  );

// Page modules are imported once and re-initialized on every navigation.
// Re-importing them with a cache-busting query kept a fresh module instance
// alive for every visited page, including references to the replaced DOM.
const pageModules = new Map<string, Promise<RadiantBlazePageModule>>();
const importPageModule = (url: string): Promise<RadiantBlazePageModule> => {
  let pending = pageModules.get(url);
  if (!pending) {
    pending = import(url);
    pageModules.set(url, pending);
    pending.catch(() => pageModules.delete(url));
  }
  return pending;
};

// One persistent live region announces every swapped page title, including
// repeat visits to a page with the same title. It is created on the first
// SPA navigation only, so the initial page load is never announced.
let titleAnnouncer: HTMLDivElement | null = null;
const announcePageTitle = (title: string): void => {
  if (!title) return;
  if (!titleAnnouncer) {
    titleAnnouncer = document.createElement("div");
    titleAnnouncer.className = "sr-only";
    titleAnnouncer.setAttribute("aria-live", "polite");
    titleAnnouncer.setAttribute("aria-atomic", "true");
    document.body.append(titleAnnouncer);
  }
  const announcer = titleAnnouncer;
  // Clearing and refilling across frames makes assistive tech re-announce
  // even when the new title matches the previous one.
  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer.textContent = title;
  });
};

const runPageModules = async (main: HTMLElement, pageUrl: string): Promise<void> => {
  const modules = [...main.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')];
  for (const module of modules) {
    const src = module.getAttribute("src");
    if (!src) continue;
    const source = new URL(src, pageUrl);
    if (source.origin !== location.origin) {
      console.warn("[radiant-blaze] Ignoring a cross-origin page module.", source.href);
      continue;
    }
    if (!source.pathname.startsWith("/_astro/") && !source.pathname.startsWith("/assets/js/")) {
      console.warn("[radiant-blaze] Ignoring a page module outside the client asset roots.", source.href);
      continue;
    }
    const sourceUrl = source.href;
    let loaded: RadiantBlazePageModule;
    try {
      // Modules imported during SPA navigation must not self-initialize before
      // the router can hand them the new <main>; side-effect-only entries
      // (portfolio, Mermaid) also listen for contentchange.
      globalThis.__radiantBlazeSpaImport = true;
      loaded = await importPageModule(sourceUrl);
    } catch (error) {
      console.warn("[radiant-blaze] A page module could not be loaded.", sourceUrl, error);
      continue;
    } finally {
      globalThis.__radiantBlazeSpaImport = false;
    }
    try {
      await loaded.initPage?.({ fromSpa: true });
    } catch (error) {
      console.error("[radiant-blaze] A page module failed to initialize.", sourceUrl, error);
    }
  }
};

const syncHeadMetadata = (nextDocument: Document): void => {
  const head = document.head;
  const nextHead = nextDocument.head;
  if (!head || !nextHead) return;

  const copyElement = (target: Element, source: Element): void => {
    for (const attribute of [...target.attributes]) {
      if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
    }
    for (const attribute of [...source.attributes]) {
      target.setAttribute(attribute.name, attribute.value);
    }
  };

  const canonical = nextHead.querySelector('link[rel="canonical"]');
  const currentCanonicals = [...head.querySelectorAll('link[rel="canonical"]')];
  if (canonical) {
    let target = currentCanonicals.shift();
    if (!target) {
      target = document.createElement("link");
      head.append(target);
    }
    copyElement(target, canonical);
    for (const duplicate of currentCanonicals) duplicate.remove();
  } else {
    for (const stale of currentCanonicals) stale.remove();
  }

  // Structured data describes the page it was rendered for, so stale blocks
  // from the previous page must be swapped out with the rest of the head.
  const currentJsonLd = [...head.querySelectorAll('script[type="application/ld+json"]')];
  const nextJsonLd = [...nextHead.querySelectorAll('script[type="application/ld+json"]')];
  for (const node of currentJsonLd) node.remove();
  for (const node of nextJsonLd) head.append(node.cloneNode(true));

  const isManagedMeta = (element: Element): boolean => {
    if (element.tagName !== "META") return false;
    const name = element.getAttribute("name");
    const property = element.getAttribute("property");
    return (
      name === "description" ||
      Boolean(property?.startsWith("og:")) ||
      Boolean(name?.startsWith("twitter:"))
    );
  };
  const keyFor = (element: Element): string =>
    element.hasAttribute("property")
      ? `property:${element.getAttribute("property")}`
      : `name:${element.getAttribute("name")}`;

  const nextMetas = new Map<string, Element>();
  for (const element of nextHead.querySelectorAll("meta")) {
    if (isManagedMeta(element)) nextMetas.set(keyFor(element), element);
  }
  const currentMetas = new Map<string, Element[]>();
  for (const element of head.querySelectorAll("meta")) {
    if (!isManagedMeta(element)) continue;
    const key = keyFor(element);
    if (!currentMetas.has(key)) currentMetas.set(key, []);
    currentMetas.get(key)?.push(element);
  }

  for (const [key, source] of nextMetas) {
    const targets = currentMetas.get(key) ?? [];
    let target = targets.shift();
    if (!target) {
      target = document.createElement("meta");
      head.append(target);
    }
    copyElement(target, source);
    currentMetas.set(key, targets);
  }
  for (const targets of currentMetas.values()) {
    for (const stale of targets) stale.remove();
  }
};

// History state is written by this router and by the browser, so only trust a
// numeric scrollY instead of assuming the arbitrary state shape.
const scrollYFromState = (state: unknown): number => {
  if (state && typeof state === "object" && "scrollY" in state) {
    const value = state.scrollY;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
};

type MathJaxGlobal = {
  typesetClear?: (elements?: Element[]) => void;
};

const navigate = async (
  url: URL,
  { push = true, scrollY = 0 }: SpaNavigationOptions = {},
): Promise<void> => {
  if (navigating) {
    pendingNavigation = { url, options: { push, scrollY } };
    return;
  }
  navigating = true;
  const pageLoaderDisabled = document.body.classList.contains("disable-page-loader");
  if (!pageLoaderDisabled) window.RadiantBlazePageLoader?.show();
  document.documentElement.classList.add("is-navigating");
  let fullNavigation = false;
  const controller = new AbortController();
  const navigationTimeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url.href, {
      headers: { "X-Requested-With": "spa" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Could not load ${url.pathname}`);
    if (new URL(response.url).origin !== location.origin) {
      throw new Error(`Cross-origin navigation response for ${url.pathname}`);
    }
    const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
    // The shell keeps its <body> across swaps, so every server-owned class must
    // follow the page. Runtime-only shell classes are preserved.
    const nextBodyClasses = new Set([...nextDocument.body.classList].filter((name) => !RUNTIME_BODY_CLASSES[name]));
    for (const name of [...document.body.classList]) {
      if (!nextBodyClasses.has(name) && !RUNTIME_BODY_CLASSES[name]) document.body.classList.remove(name);
    }
    for (const name of nextBodyClasses) document.body.classList.add(name);
    const nextMain = nextDocument.querySelector("main");
    const currentMain = document.querySelector("main");
    if (!nextMain || !currentMain) throw new Error("Page content is missing");

    const currentArticle = currentMain.querySelector(".quest-article");
    if (currentArticle) {
      // MathJax is loaded only by article pages and has no DOM lib typings.
      const mathJaxWindow = window as Window & { MathJax?: MathJaxGlobal };
      mathJaxWindow.MathJax?.typesetClear?.([currentArticle]);
    }

    if (push) {
      history.replaceState({ scrollY: window.scrollY }, "", location.href);
    } else if (
      url.pathname !== location.pathname ||
      url.search !== location.search ||
      url.hash !== location.hash
    ) {
      // A queued Back/Forward navigation may resume after an overlapping
      // navigation overwrote the entry with its own URL.
      history.replaceState({ scrollY }, "", url.href);
    }
    dispatchEvent(new Event("radiantblaze:pagedisposing"));
    currentMain.replaceWith(nextMain);
    // Start keyboard and screen-reader users inside the new page without
    // disturbing the scroll position restored below. Shells already ship
    // tabindex="-1"; the fallback keeps unusual <main> markup focusable.
    if (!nextMain.hasAttribute("tabindex")) nextMain.tabIndex = -1;
    nextMain.focus({ preventScroll: true });
    document.title = nextDocument.title;
    announcePageTitle(nextDocument.title);
    syncHeadMetadata(nextDocument);
    if (push) history.pushState({ scrollY: 0 }, "", url.href);
    renderedPath = url.pathname + url.search;
    const searchFilters = ["q", "type", "topic", "year"].some((key) => url.searchParams.has(key));
    document.documentElement.classList.toggle(
      "search-has-filters",
      url.pathname.endsWith("/pages/search.html") && searchFilters,
    );
    dispatchEvent(new Event("radiantblaze:contentchange"));

    await runPageModules(nextMain, url.href);
    window.scrollTo(0, scrollY);
    if (url.hash && !scrollY) {
      try {
        document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
      } catch {
        // A malformed fragment should never turn a completed swap into a reload.
      }
    }
  } catch {
    fullNavigation = true;
    pendingNavigation = null;
    location.href = url.href;
  } finally {
    window.clearTimeout(navigationTimeout);
    navigating = false;
    document.documentElement.classList.remove("is-navigating");
    if (!fullNavigation) {
      const pending = pendingNavigation;
      pendingNavigation = null;
      if (
        !pending ||
        (pending.url.pathname + pending.url.search === renderedPath &&
          !hasMeaningfulFragment(pending.url))
      ) {
        // Nothing left to do, or the in-flight navigation already landed on
        // the pending page, so keep the loader down until the next request.
        window.RadiantBlazePageLoader?.hide();
      } else {
        // The in-flight navigation's history writes may have replaced the
        // address the browser moved to before this Back/Forward was queued.
        if (
          pending.options.push === false &&
          (pending.url.pathname !== location.pathname ||
            pending.url.search !== location.search ||
            pending.url.hash !== location.hash)
        ) {
          history.replaceState({ scrollY: pending.options.scrollY ?? 0 }, "", pending.url.href);
        }
        // Keep the loader visible across the hand-off; navigate re-shows it.
        void navigate(pending.url, pending.options);
      }
    }
  }
};

addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]") ?? null;
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const url = anchor ? new URL(anchor.href, location.href) : null;
  if (!url || !isInternalPageLink(anchor, url)) return;
  event.preventDefault();
  void navigate(url);
});

addEventListener("popstate", (event) => {
  const url = new URL(location.href);
  // Same document, different fragment: the browser already scrolled there.
  // While a navigation is in flight the address bar can still be overwritten
  // by that navigation, so queue this target instead of dropping it.
  if (!navigating && url.pathname + url.search === renderedPath) return;
  void navigate(url, { push: false, scrollY: scrollYFromState(event.state) });
});
