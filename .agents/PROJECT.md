# Radiant Blaze project

Radiant Blaze is a static Astro site for blog posts, CTF writeups, search, and related project content. Astro builds HTML and compatibility assets into `dist/`; deployment is static hosting.

## Main structure

- `src/`: Astro pages, layouts, content configuration, data projections, and the Markdown converter.
- `content/`: authored Markdown, JSON indexes, event metadata, and site metadata.
- `assets/`: active browser JavaScript and other site assets copied or served by the Astro integration.
- `compat/`: intentionally active compatibility sources. `compat/legacy-assets/js/` contains fallback modules served at preserved `/legacy/assets/js/...` URLs.
- `backup/`: historical archive. It is not an application source directory and should not be added to the build dependency graph.
- `docs/`: contributor documentation: `docs/commands/` development command references, `docs/CREDITS.md`, and `docs/THIRD_PARTY_LICENSES.md`.
- `.github/`: workflows, Dependabot configuration, issue templates, and the repository community health files (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`).
- `.agents/`: persistent context for coding-agent sessions.
- `astro-tools/`: content synchronization, source-asset integration, route/parity checks, and tests.
- There is no `scripts/` directory. Do not reintroduce the retired Python compiler as a required build step.
- `public/`: Astro's public directory. It holds the static assets served during development and copied verbatim into `dist/`: `public/assets/` (CSS, browser JavaScript, fonts, music, CTF SVG animations), `public/images/`, `public/favicon.svg`, `public/og-image.png`, and `public/robots.txt`.
- `dist/`: generated static build output; never hand-edit it.
- `.astro/`: Astro-generated development/type state; never hand-edit it.
- `.venv/`: local Python virtual environment for the `astro-tools/*.py` helpers; gitignored.
- `node_modules/`: installed dependencies; never document or edit individual generated package files.

Important root files include `astro.config.mjs`, `package.json`, `package-lock.json`, `.prettierrc.json`, `.gitignore`, `README.md`, `LICENSE`, and `.nojekyll`.

`.nojekyll` must stay at the repository root: `astro-tools/source-assets.mjs` copies it into `dist/` during `astro:build:done` rather than relying on Astro's public-directory copy, and GitHub Pages needs it to skip Jekyll processing.

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
