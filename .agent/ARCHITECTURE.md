# Architecture

Astro is configured for static output in `astro.config.mjs`, with `src/` as the source directory and `dist/` as the output directory. `astro-tools/source-assets.mjs` copies active assets, compatibility modules, content compatibility files, and root static files during `astro:build:done`.

## Content and routes

`src/content.config.ts` defines `posts`, `writeups`, and `events` collections using Astro glob loaders. `src/lib/article-data.ts` combines collection entries with authored ordering indexes to generate deterministic article and writeup routes.

```text
content/*.md + JSON
        ↓
content-sync indexes and validation
        ↓
Astro collections + ordered article data
        ↓
src/pages/generated/* routes
        ↓
ArticleShell / QuestShell + static HTML
```

The content API endpoints under `src/pages/content/` preserve compatibility URLs for raw Markdown and JSON metadata. `src/pages/astro-article-order.json.ts` exposes Astro's ordered route metadata. `src/pages/sitemap.xml.ts` generates `/sitemap.xml` from the same ordered collections.

## Markdown

`src/lib/markdown-converter/` extracts YAML frontmatter with `js-yaml`, protects math before Markdown block detection, converts supported Markdown structures, and restores math tokens. `src/lib/markdown.ts` provides the compatibility API used by article pages and delegates to `convertMarkdown()`.

Math runs in the browser through the existing MathJax/typesetting behavior. Pipes inside math are protected from table parsing and remain unchanged.

## Browser behavior

Astro renders shells and article pages at build time. Browser JavaScript in `assets/js/` handles navigation, read-model projections, search/filtering, pagination, theme state, music state, and fallback navigation. Query parameters drive blog, CTF, archive/search, event, topic, category, and page views. `astro-pages.js` and `astro-navigation.js` are the current navigation controllers; `astro-controls.js` handles controls.

Compatibility fallback modules are requested dynamically from `/legacy/assets/js/` only when the fallback behavior is needed. Their source is in `compat/legacy-assets/js/`, not `backup/`.

The 404 page is `src/pages/404.astro`. Public `/generated/...` paths are Astro routes, not generated filesystem HTML.
