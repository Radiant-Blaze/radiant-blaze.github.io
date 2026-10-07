# Development workflows

```text
npm ci                 # install locked dependencies
npm run dev            # Astro development server
npm run content:sync   # update content indexes
npm run content:check  # validate index synchronization without writing
npm run build          # static production build
npm run preview        # serve dist for browser testing
```

Focused checks:

```text
npm run test:converter
npm run test:renderer
npm run test:real-content
npm run test:content-sync
npm run test:astro-route-parity
npm run test:compatibility-assets
python astro-tools/compare_output.py
```

Recommended order: make the change, run the focused test, run `content:check` for content changes, run route parity for route/data changes, run the relevant projection/compatibility checks, run the full focused suite, build, then test `npm run preview` in a browser. Stop/restart the dev server when configuration or integration changes require a clean process. A successful build does not replace browser testing.
