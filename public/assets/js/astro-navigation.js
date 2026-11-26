// Astro's primary shell navigation. Kept behavior-compatible with the legacy router.
(() => {
  let navigating = false;
  // The document currently rendered into <main>. Fragment-only history entries
  // (TOC links, "back to top") must not refetch a page that is already on screen.
  let renderedPath = location.pathname + location.search;

  const isInternalPageLink = (anchor, url) =>
    anchor &&
    url.origin === location.origin &&
    !anchor.hasAttribute("download") &&
    !anchor.target &&
    !anchor.hasAttribute("data-no-spa") &&
    !(url.pathname === location.pathname && url.search === location.search);

  // Page modules are imported once and re-initialized on every navigation.
  // Re-importing them with a cache-busting query kept a fresh module instance
  // alive for every visited page, including references to the replaced DOM.
  const pageModules = new Map();
  const importPageModule = (url) => {
    let pending = pageModules.get(url);
    if (!pending) {
      pending = import(url);
      pageModules.set(url, pending);
      pending.catch(() => pageModules.delete(url));
    }
    return pending;
  };

  const runPageModules = async (documentToRead, pageUrl) => {
    const modules = [...documentToRead.querySelectorAll('script[type="module"][src]')];
    for (const module of modules) {
      const source = new URL(module.getAttribute("src"), pageUrl).href;
      let loaded;
      try {
        // A module that is evaluated for the first time because of an SPA
        // navigation must not auto-initialize: the router calls initPage()
        // after the import settles so initialization runs exactly once.
        globalThis.__radiantBlazeSpaImport = true;
        loaded = await importPageModule(source);
      } catch (error) {
        console.warn("[radiant-blaze] A page module could not be loaded.", source, error);
        continue;
      } finally {
        globalThis.__radiantBlazeSpaImport = false;
      }
      try {
        await loaded.initPage?.({ fromSpa: true });
      } catch (error) {
        console.error("[radiant-blaze] A page module failed to initialize.", source, error);
      }
    }
  };

  const syncHeadMetadata = (nextDocument) => {
    const head = document.head;
    const nextHead = nextDocument.head;
    if (!head || !nextHead) return;

    const copyElement = (target, source) => {
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

    const isManagedMeta = (element) => {
      if (element.tagName !== "META") return false;
      const name = element.getAttribute("name");
      const property = element.getAttribute("property");
      return name === "description"
        || property?.startsWith("og:")
        || name?.startsWith("twitter:");
    };
    const keyFor = (element) => element.hasAttribute("property")
      ? `property:${element.getAttribute("property")}`
      : `name:${element.getAttribute("name")}`;

    const nextMetas = new Map();
    for (const element of nextHead.querySelectorAll("meta")) {
      if (isManagedMeta(element)) nextMetas.set(keyFor(element), element);
    }
    const currentMetas = new Map();
    for (const element of head.querySelectorAll("meta")) {
      if (!isManagedMeta(element)) continue;
      const key = keyFor(element);
      if (!currentMetas.has(key)) currentMetas.set(key, []);
      currentMetas.get(key).push(element);
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

  const navigate = async (url, { push = true, scrollY = 0 } = {}) => {
    if (navigating) return;
    navigating = true;
    const pageLoaderDisabled = document.body.classList.contains("disable-page-loader");
    if (!pageLoaderDisabled) window.RadiantBlazePageLoader?.show();
    document.documentElement.classList.add("is-navigating");
    let fullNavigation = false;

    try {
      const response = await fetch(url.href, { headers: { "X-Requested-With": "spa" } });
      if (!response.ok) throw new Error(`Could not load ${url.pathname}`);
      const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      // The shell keeps its <body> across swaps, so document-level classes the
      // server sets must be copied over or writeup-only styles leak both ways.
      for (const name of ["disable-page-loader", "writeup-document", "content-document"]) {
        document.body.classList.toggle(name, nextDocument.body.classList.contains(name));
      }
      const nextMain = nextDocument.querySelector("main");
      const currentMain = document.querySelector("main");
      if (!nextMain || !currentMain) throw new Error("Page content is missing");

      const currentArticle = currentMain.querySelector(".quest-article");
      if (currentArticle) window.MathJax?.typesetClear?.([currentArticle]);

      if (push) history.replaceState({ scrollY: window.scrollY }, "", location.href);
      dispatchEvent(new Event("radiantblaze:pagedisposing"));
      currentMain.replaceWith(nextMain);
      document.title = nextDocument.title;
      syncHeadMetadata(nextDocument);
      if (push) history.pushState({ scrollY: 0 }, "", url.href);
      renderedPath = url.pathname + url.search;
      dispatchEvent(new Event("radiantblaze:contentchange"));

      await runPageModules(nextDocument, url.href);
      window.scrollTo(0, scrollY);
      if (url.hash && !scrollY) document.querySelector(url.hash)?.scrollIntoView();
    } catch {
      fullNavigation = true;
      location.href = url.href;
    } finally {
      navigating = false;
      document.documentElement.classList.remove("is-navigating");
      if (!fullNavigation) window.RadiantBlazePageLoader?.hide();
    }
  };

  addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
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
    navigate(url);
  });

  addEventListener("popstate", (event) => {
    const url = new URL(location.href);
    // Same document, different fragment: the browser already scrolled there.
    if (url.pathname + url.search === renderedPath) return;
    navigate(url, { push: false, scrollY: event.state?.scrollY || 0 });
  });
})();
