# Architectural decisions and guardrails

1. The retired Python content compiler is not a required build step.
2. Old generated HTML and `.generated/` artifacts are retired; Astro owns the implementation behind `/generated/...` public URLs.
3. The checked-in root sitemap source was retired; Astro owns `/sitemap.xml`.
4. The pre-Astro `backup/` archive was removed during cleanup; its legacy sources remain reachable through Git history and are not part of the build dependency graph.
5. `compat/legacy-assets/` is preserved for public asset compatibility; the current viewer does not load it.
6. Public `/generated/...` URLs must remain stable.
7. Public `/legacy/assets/js/...` URLs must remain stable.
8. Do not redesign theme or music controls without explicit approval.
9. Preserve MathJax pipes such as `$|x|$`, `$P(A \mid B)$`, and `$\{x \mid x > 0\}$`.
10. Keep the Markdown converter general-purpose, not tied to Radiant Blaze page markup.
11. Content ordering must be deterministic.
12. Preserve authored metadata during synchronization.
13. Do not clean up `compat/` compatibility files merely because they look old; the retired `backup/` archive is already gone.
14. Understand compatibility contracts before simplifying architecture.
15. Astro source/configuration and actual scripts override these notes if they diverge.
16. Static assets live in `public/`; Astro serves them in development and copies them into `dist/`, so the integration no longer copies an `assets/` directory itself. `.nojekyll` is the only file copied from the repository root.
17. The repository root holds only tool-mandated files. Contributor documentation lives in `docs/`, GitHub community health files live in `.github/`, and static assets live in `public/`.
18. Browser JavaScript has two pipelines. Shell and standalone page modules (`astro-controls`, `page-loader`, `astro-navigation`, `portfolio`, `legacy-redirect`) are authored as TypeScript in `src/scripts/`, bundled by Vite, emitted content-hashed, and referenced without `?v=`. Modules that must stay fetchable as stable public URLs (`astro-article.js`, `astro-pages.js`, `astro-runtime.js`, `astro-query-model.js`, `music-controller.js`) remain unbundled in `public/assets/js/` and use `ASSET_VERSION`. Migrating a module between pipelines requires an explicit decision; do not mix them.
19. Page modules render inside `<main>` and the bootstrap queries only the newly inserted `<main>`, so SPA swaps cannot reuse the previous page's module scope. Do not reintroduce the `pageScripts` slot or module-scope DOM queries.
20. `public/assets/js/list-utils.js` and `public/assets/js/markdown-renderer.js` are frozen byte-identical compatibility artifacts. Their SHA-256 digests are pinned in `astro-tools/test-compatibility-assets.mjs`, including the `dist/legacy/assets/js/` copies when a build exists, and `.prettierignore` prevents formatter rewrites. Any byte change is a public contract change.
21. Node tests import TypeScript library modules through `node --experimental-strip-types`, matching the existing `test:*` scripts. No new dependency is added for TypeScript execution, and orphaned tests are wired into `package.json` and CI rather than deleted.
