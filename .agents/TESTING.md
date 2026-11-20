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
- `npm run test:portfolio-routes` — project slug/route derivation, published filtering, and empty-portfolio fixtures.
- `npm run test:home-project` — built homepage project projection, project detail link, and hero action contract.
- `npm run test:related` — deterministic related-writeup ranking, sparse-metadata fallback, and the built related-challenge block.
- `python astro-tools/compare_output.py` — compares the current Astro output route set and page facts using Astro route metadata.
- `npm run check:homepage-parity` — verifies the rendered homepage against the content that drives it: the featured and latest-post tiles, the search tile, the `site.json` social links, the footer year, canonical/OG metadata, and that no legacy `home.js` loads.
- `npm run check:mermaid` — drives a local Chrome over CDP against `npm run preview`: all five diagrams, default ELK layout plus an explicit dagre directive, local bundle (no external Mermaid CDN), source fallback, missing module, copy, expanded/zoom controls, valid SVG export in both themes, theme switching, SPA navigation, fonts, lazy-loading/performance samples, and 390/768/1440/1920 layouts.
- `npm run check:search-scale` — serves a deterministic 500-record read model (100 posts + 100 events × 4 challenges) and checks bounded pagination, tag/year filters, query filtering, numeric points, console cleanliness, and typing latency. Run against `npm run preview` like the other browser checks.
- `npm run check:spa` — drives a local Chrome over CDP against `npm run preview`: homepage critical-font preloads and layout stability, SPA canonical/description/Open Graph metadata across forward and back navigation, conditional Mermaid loading (no viewer on diagram-free articles), diagram duplication on theme switches, DOM/listener/heap stability across four SPA cycles, one music root/audio element, Escape closes the player, reduced-motion static posters, single poster-observer initialization/cleanup, and offscreen poster pausing.
- `npm run build` — produces static `dist/` output.

## Browser smoke test

Check home, blog, CTF, search, archive, post, writeup, `/generated/posts/...`, `/generated/writeups/...`, `/legacy/assets/js/...`, 404, sitemap, theme, music, internal navigation, browser back/forward, search filters/pagination, MathJax, console errors, and missing assets in `npm run preview`.
