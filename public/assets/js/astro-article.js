import { initReadingProgress, typesetMath } from "./astro-runtime.js?v=20261120-3";

// Every navigation replaces <main>. Keeping the article, its headings, and the
// observers in module scope used to retain the previous page's DOM for the rest
// of the session; initialization now registers its own teardown instead.
let disposePage = null;

const setGroupExpanded = (group, expanded) => {
  if (!group) return;
  group.dataset.clamped = expanded ? "false" : "true";
  const control = group.querySelector(":scope > .content-toc__more");
  if (!control) return;
  const name = group.querySelector(":scope > .content-toc__row > .content-toc__link")?.textContent.trim() || "section";
  const hidden = Number(control.dataset.hidden) || 0;
  const label = expanded
    ? `Collapse the steps in ${name}`
    : `Show ${hidden} more ${hidden === 1 ? "step" : "steps"} in ${name}`;
  control.setAttribute("aria-expanded", String(expanded));
  control.setAttribute("aria-label", label);
  control.title = label;
};

export const initPage = ({ fromSpa = false } = {}) => {
  disposePage?.();
  disposePage = null;

  // Browsers restore the previous scroll offset on reload, which drops readers
  // back near the flag. A writeup opens at the top instead; an explicit
  // #fragment from a shared link still wins. Blog posts keep normal restoration.
  if (!fromSpa && document.body.classList.contains("writeup-document")) {
    history.scrollRestoration = "manual";
    if (!location.hash) window.scrollTo(0, 0);
  }

  initReadingProgress();
  const article = document.querySelector(".quest-article");
  const toc = document.querySelector(".content-toc");
  if (article) {
    void typesetMath(article).finally(() => {
      if (article.isConnected) window.RadiantBlazePageLoader?.hide();
    });
  } else {
    window.RadiantBlazePageLoader?.hide();
  }

  const disposers = [];
  if (article && toc) {
    const headings = [...article.querySelectorAll("h2[id], h3[id], h4[id], h5[id], h6[id]")];
    const links = [...toc.querySelectorAll("a[href^='#']")];
    for (const control of toc.querySelectorAll(".content-toc__more")) {
      control.addEventListener("click", () => {
        const group = control.closest("[data-toc-group]");
        setGroupExpanded(group, group.dataset.clamped === "true");
      });
    }
    const setActiveHeading = (id) => {
      let current = null;
      for (const link of links) {
        if (link.hash === `#${encodeURIComponent(id)}` || decodeURIComponent(link.hash.slice(1)) === id) {
          link.setAttribute("aria-current", "location");
          current = link;
        } else {
          link.removeAttribute("aria-current");
        }
      }
      // Reaching a section unfolds the sub-steps it was keeping collapsed.
      let group = current?.closest("[data-toc-group]");
      while (group) {
        setGroupExpanded(group, true);
        group = group.parentElement.closest("[data-toc-group]");
      }
      // The desktop sidebar is its own scroll container on long writeups. Keep
      // the current section visible without touching the page scroll position.
      const scroller = current?.closest(".writeup-sidebar");
      if (current && scroller && getComputedStyle(scroller).overflowY === "auto") {
        const linkRect = current.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        const padding = 10;
        if (linkRect.top < box.top + padding) {
          scroller.scrollTop -= box.top + padding - linkRect.top;
        } else if (linkRect.bottom > box.bottom - padding) {
          scroller.scrollTop += linkRect.bottom - (box.bottom - padding);
        }
      }
    };
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveHeading(visible[0].target.id);
      }, { rootMargin: "-12% 0px -76% 0px", threshold: 0 });
      headings.forEach((heading) => observer.observe(heading));
      disposers.push(() => observer.disconnect());
    }
    // Mirrors the CSS breakpoint where the sidebar stacks above the article.
    const sideBySide = matchMedia("(min-width: 1101px)");
    toc.addEventListener("click", (event) => {
      if (event.target.closest("a") && !sideBySide.matches) toc.open = false;
    });
    toc.open = sideBySide.matches;
    const updateTocForViewport = () => { toc.open = sideBySide.matches; };
    window.addEventListener("resize", updateTocForViewport, { passive: true });
    disposers.push(() => window.removeEventListener("resize", updateTocForViewport));
  }
  if (article) {
    const describeCode = (code) =>
      code.dataset.filename
        ? `${code.dataset.filename} (${code.dataset.language || "code"})`
        : `${code.dataset.language || "code"} code`;
    for (const pre of article.querySelectorAll("pre")) {
      const code = pre.querySelector("code");
      if (!code) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "content-copy";
      button.textContent = "COPY";
      button.setAttribute("aria-label", `Copy ${describeCode(code)}`);
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || "");
          button.textContent = "COPIED";
          button.setAttribute("aria-label", "Code copied to clipboard");
        } catch {
          button.textContent = "COPY FAILED";
          button.setAttribute("aria-label", "Copy failed; select the code and copy it manually");
        }
        window.setTimeout(() => {
          button.textContent = "COPY";
          button.setAttribute("aria-label", `Copy ${describeCode(code)}`);
        }, 1800);
      });
      pre.append(button);
    }

    const flag = article.querySelector(".writeup-flag .ctf-flag");
    if (flag && !article.querySelector(".flag-copy")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flag-copy";
      button.textContent = "COPY FLAG";
      button.setAttribute("aria-label", "Copy the captured flag");
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(flag.textContent?.trim() || "");
          button.textContent = "FLAG COPIED";
          button.setAttribute("aria-label", "Flag copied to clipboard");
        } catch {
          button.textContent = "COPY FAILED";
          button.setAttribute("aria-label", "Copy failed; select the flag and copy it manually");
        }
        window.setTimeout(() => {
          button.textContent = "COPY FLAG";
          button.setAttribute("aria-label", "Copy the captured flag");
        }, 1800);
      });
      flag.after(button);
    }
  }

  disposePage = () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
    window.__radiantBlazeReadingProgressCleanup?.();
  };
};

addEventListener("radiantblaze:pagedisposing", () => {
  disposePage?.();
  disposePage = null;
});

if (!globalThis.__radiantBlazeSpaImport) initPage();
