---
title: Making a Static Astro Site Feel Like an App
description: "How this site keeps a static, GitHub Pages build while adding instant SPA navigation, a no-flash theme bootstrap, and strictly scoped page modules."
date: 2026-11-27
tags: [astro, typescript, spa, performance]
category: Web Development
difficulty: 4
xp: 650
estimatedPlayTime: 9 min
author: Radiant Blaze
---
## The Constraint

This site is a static build deployed to GitHub Pages. There is no application server to route requests, hydrate sessions, or stream responses. That constraint is useful: every page is HTML, every asset is cacheable, and the archive survives a bad deploy without a database.

The complication is that a static site can still feel slow when every click reloads the document. The goal was not to turn the site into a single-page framework. It was to keep the static shell while making navigation between [the blog](/pages/blog.html), [the CTF archive](/pages/ctf.html), and the [topic hubs](/topics.html) feel continuous.

## Keep the Theme Before the First Paint

The most visible regression in a themed static site is a flash of the wrong theme. Deferring theme setup into a bundled module creates exactly that flash: the browser can paint the default dark background before the module executes.

The fix is a tiny inline bootstrap in `<head>` that reads the saved preference and applies the theme class immediately:

```html
<script>
  (() => {
    const saved = localStorage.getItem("radiant-blaze-theme");
    const light = saved === "light";
    document.documentElement.classList.toggle("light-theme", light);
    document.documentElement.classList.toggle("dark-theme", !light);
  })();
</script>
```

The rest of the theme controller is deferred. It syncs the toggle state, listens for changes, and dispatches a theme event for diagrams and other canvas-like UI. The inline snippet is the only code allowed to choose the initial theme; everything else reads the class that was already painted.

## Scope the Page Modules

The SPA router swaps `<main>` and then imports the page-specific scripts inside it. Shell modules live in `<head>` and must never be imported again during navigation. A document-wide query is tempting and wrong: it re-imports the shell, duplicates listeners, and retains DOM references from the previous page.

The safe shape is:

```ts
const modules = [
  ...nextMain.querySelectorAll('script[type="module"][src]'),
];
```

That only works if page modules are actually rendered inside `<main>`. The listing, article, portfolio, and diagram scripts were moved out of `<head>` and out of the `pageScripts` slot. Bundled entries keep content-hashed URLs; public entries keep a version query because they are not processed by the bundler.

## Why Mixed Bundling Is Deliberate

Not every module can move into the bundler at once. The article and listing runtimes still depend on two frozen compatibility modules that are also served byte-for-byte at `/legacy/assets/js/`. Bundling those would either duplicate the protected code or break the legacy paths.

The compromise is explicit:

- Shell controls, the page loader, the router, the portfolio filters, and the legacy redirect are bundled TypeScript with hashed URLs.
- Article and listing runtimes remain public, versioned modules.
- The two compatibility modules stay frozen and hash-pinned.

That split is documented so a future change does not quietly move a dependency-bound module into the bundle.

## What This Buys

- No theme flash.
- No shell re-imports during navigation.
- Page modules that initialize exactly where their content lands.
- Static HTML that still works without JavaScript.
- A production build that can be audited: hashed script references, no stale public shell URLs, and byte-identical legacy assets.

The next step is reducing the first navigation’s dependency on the archive model. A static site should not make the browser wait for a JSON file when the server already rendered the cards.

## Further Reading

- [Building a Searchable Topic Layer for a Static Archive](/generated/posts/web-development/023-searchable-topic-layer.html)
- [Browse the topic hubs](/topics.html)
- [Explore the CTF archive](/pages/ctf.html)
