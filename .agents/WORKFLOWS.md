# Development workflows

```text
npm ci                 # install locked dependencies
npm run dev            # Astro development server
npm run content:sync   # update content indexes
npm run content:check  # validate index synchronization without writing
npm run content:validate # validate frontmatter, flags, Markdown, links, CTF refs
npm run build          # static production build
npm run preview        # serve dist for browser testing
```

Focused checks:

```text
npm run test:converter
npm run test:renderer
npm run test:real-content
npm run test:content-sync
npm run test:content-validation
npm run test:astro-route-parity
npm run test:compatibility-assets
npm run check:homepage-parity
npm run check:mermaid
npm run check:seo          # validates dist/ SEO: metadata, canonicals, JSON-LD, sitemap, internal links
npm run check:live         # same contract against the deployed site (SITE_URL to override)
# Keyword-to-page targets live in astro-tools/seo-keywords.json; check:seo also
# reports unmapped articles, overlapping intent and missing keyword coverage.
python astro-tools/compare_output.py
```

Recommended order: make the change, run the focused test, run `content:check` and `content:validate` for content changes, run route parity for route/data changes, run `npm run build` and start `npm run preview` before the projection and compatibility checks (they probe the built site), run the full focused suite, then test `npm run preview` in a browser. Stop/restart the dev server when configuration or integration changes require a clean process. A successful build does not replace browser testing.
