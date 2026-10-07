# Architectural decisions and guardrails

1. The retired Python content compiler is not a required build step.
2. Old generated HTML and `.generated/` artifacts are retired; Astro owns the implementation behind `/generated/...` public URLs.
3. The checked-in root sitemap source was retired; Astro owns `/sitemap.xml`.
4. `backup/` is historical archive material and must stay outside the build dependency graph.
5. `compat/legacy-assets/` is active compatibility source and exists to preserve fallback behavior.
6. Public `/generated/...` URLs must remain stable.
7. Public `/legacy/assets/js/...` URLs must remain stable.
8. Do not redesign theme or music controls without explicit approval.
9. Preserve MathJax pipes such as `$|x|$`, `$P(A \mid B)$`, and `$\{x \mid x > 0\}$`.
10. Keep the Markdown converter general-purpose, not tied to Radiant Blaze page markup.
11. Content ordering must be deterministic.
12. Preserve authored metadata during synchronization.
13. Do not clean up `backup/` or compatibility files merely because they look old.
14. Understand compatibility contracts before simplifying architecture.
15. Astro source/configuration and actual scripts override these notes if they diverge.
