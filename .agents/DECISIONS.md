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
