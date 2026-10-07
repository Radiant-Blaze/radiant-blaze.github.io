# Radiant Blaze project

Radiant Blaze is a static Astro site for blog posts, CTF writeups, search, and related project content. Astro builds HTML and compatibility assets into `dist/`; deployment is static hosting.

## Main structure

- `src/`: Astro pages, layouts, content configuration, data projections, and the Markdown converter.
- `content/`: authored Markdown, JSON indexes, event metadata, and site metadata.
- `assets/`: active browser JavaScript and other site assets copied or served by the Astro integration.
- `compat/`: intentionally active compatibility sources. `compat/legacy-assets/js/` contains fallback modules served at preserved `/legacy/assets/js/...` URLs.
- `backup/`: historical archive. It is not an application source directory and should not be added to the build dependency graph.
- `astro-tools/`: content synchronization, source-asset integration, route/parity checks, and tests.
- `scripts/`: currently contains no normal Astro publishing compiler; do not reintroduce the retired Python compiler as a required step.
- `public/`: configured as Astro's public directory; it is currently absent/empty in the repository.
- `dist/`: generated static build output; never hand-edit it.
- `.astro/`: Astro-generated development/type state; never hand-edit it.
- `node_modules/`: installed dependencies; never document or edit individual generated package files.

Important root files include `astro.config.mjs`, `package.json`, `package-lock.json`, `robots.txt`, `favicon.svg`, `og-image.png`, and `.nojekyll`.

## Build flow

```text
Markdown + JSON metadata
        ↓
npm run content:sync / content:check
        ↓
content indexes + Astro content collections
        ↓
frontmatter + Markdown converter
        ↓
Astro pages/layouts/routes
        ↓
static dist/
        ↓
GitHub Pages deployment
```

`backup/` is historical material. `compat/` is active build input. `src/` is the Astro application source. Do not confuse these boundaries.
