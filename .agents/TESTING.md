# Testing and validation

- `npm run test:converter` — synthetic Markdown converter cases, including YAML, tables, nested lists, code, links/images, block/inline math, and math pipes.
- `npm run test:renderer` — renderer integration behavior and metadata fixtures.
- `npm run test:real-content` — converts all current repository Markdown files.
- `npm run content:check` — verifies indexes are synchronized without writing.
- `npm run content:validate` — validates frontmatter, flags, dates, Markdown structure, links/assets, CTF references, and index cross-references.
- `npm run test:content-validation` — fixtures for flags, frontmatter, Markdown, event references, and link validation.
- `npm run test:content-sync` — ordering, idempotence-related behavior, and drift detection fixtures.
- `npm run test:astro-route-parity` — verifies all 23 current article/writeup routes and ordering entries.
- `npm run test:compatibility-assets` — verifies compatibility source paths and public mapping.
- `python astro-tools/compare_output.py` — compares the current Astro output route set and page facts using Astro route metadata.
- `npm run check:homepage-parity` — verifies the rendered homepage against the content that drives it: the featured and latest-post tiles, the search tile, the `site.json` social links, the footer year, canonical/OG metadata, and that no legacy `home.js` loads.
- `npm run check:mermaid` — drives a local Chrome over CDP against `npm run preview`: all five diagrams, local bundle (no external Mermaid CDN), source fallback, missing module, copy, expanded/zoom controls, valid SVG export in both themes, theme switching, SPA navigation, fonts, lazy-loading/performance samples, and 390/768/1440/1920 layouts.
- `npm run build` — produces static `dist/` output.

## Browser smoke test

Check home, blog, CTF, search, archive, post, writeup, `/generated/posts/...`, `/generated/writeups/...`, `/legacy/assets/js/...`, 404, sitemap, theme, music, internal navigation, browser back/forward, search filters/pagination, MathJax, console errors, and missing assets in `npm run preview`.
