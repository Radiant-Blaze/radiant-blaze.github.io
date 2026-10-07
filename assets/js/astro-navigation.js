// Astro's primary shell navigation. Kept behavior-compatible with the legacy router.
(() => {
  let navigating = false;

  const isInternalPageLink = (anchor, url) =>
    anchor &&
    url.origin === location.origin &&
    !anchor.hasAttribute("download") &&
    !anchor.target &&
    !anchor.hasAttribute("data-no-spa") &&
    !(url.pathname === location.pathname && url.search === location.search);

  const runPageModules = async (documentToRead, pageUrl) => {
    const modules = [...documentToRead.querySelectorAll('script[type="module"][src]')];
    for (const module of modules) {
      const source = new URL(module.getAttribute("src"), pageUrl);
      source.searchParams.set("spa", Date.now().toString());
      await import(source.href);
    }
  };

  const navigate = async (url, { push = true, scrollY = 0 } = {}) => {
    if (navigating) return;
    navigating = true;
    window.RadiantBlazePageLoader?.show();
    document.documentElement.classList.add("is-navigating");
    let fullNavigation = false;

    try {
      const response = await fetch(url.href, { headers: { "X-Requested-With": "spa" } });
      if (!response.ok) throw new Error(`Could not load ${url.pathname}`);
      const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
      const nextMain = nextDocument.querySelector("main");
      const currentMain = document.querySelector("main");
      if (!nextMain || !currentMain) throw new Error("Page content is missing");

      const currentArticle = currentMain.querySelector(".quest-article, [data-writeup], [data-markdown-post]");
      if (currentArticle) window.MathJax?.typesetClear?.([currentArticle]);

      if (push) history.replaceState({ scrollY: window.scrollY }, "", location.href);
      currentMain.replaceWith(nextMain);
      document.title = nextDocument.title;
      if (push) history.pushState({ scrollY: 0 }, "", url.href);
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
    navigate(new URL(location.href), { push: false, scrollY: event.state?.scrollY || 0 });
  });
})();
