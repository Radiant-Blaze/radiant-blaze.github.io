# Compatibility architecture

```text
compat/
  intentionally maintained active compatibility source
```

The pre-Astro `backup/` archive was removed; its contents remain available in
Git history and were never consumed by the build.

The compatibility modules are:

- `compat/legacy-assets/js/blog.js`
- `compat/legacy-assets/js/ctf.js`
- `compat/legacy-assets/js/content.js`

They remain served at `/legacy/assets/js/...` for URL compatibility, but no active page dynamically loads them. Content rendering is owned by the generated Astro routes and the shared content viewer.

`astro-tools/source-assets.mjs` serves/copies them as:

```text
/legacy/assets/js/blog.js
/legacy/assets/js/ctf.js
/legacy/assets/js/content.js
```

`public/assets/js/list-utils.js` and `public/assets/js/markdown-renderer.js` are also copied to `/legacy/assets/js/` as same-directory siblings of the retired fallback renderers. They are frozen compatibility artifacts: `astro-tools/test-compatibility-assets.mjs` pins their SHA-256 digests
(`ae995eb5…2242` and `8ebdd3a1…0f47`), verifies the `dist/legacy/assets/js/` copies when a build exists, and `.prettierignore` stops formatters from rewriting them. Do not edit, bundle, convert, or format them.

`public/assets/js/astro-pages.js` no longer loads fallback renderers; it renders listing/search surfaces only. Preserve the compatibility module imports because those files are still served as public compatibility assets.

## Retirement prerequisites

`compat/legacy-assets/js/blog.js`, `ctf.js`, `content.js`, and the `/legacy/assets/js/` URLs may only be retired after all of the following hold:

1. No external or archived page requests `/legacy/assets/js/*`; confirm from server/GitHub Pages access logs or a documented ownership decision.
2. `astro-tools/test-compatibility-assets.mjs` is updated in the same change (its mapping assertions currently require the `compat/` sources and the `legacyJsPrefix` mapping).
3. `astro-tools/source-assets.mjs` no longer lists the files in `legacyFallbackFiles`/`sharedLegacyFiles`, and its dev middleware and `astro:build:done` copy step are adjusted together.
4. `.agents/ROUTES.md` and `.agents/DECISIONS.md` record the retirement, and the public URL contract is explicitly ended.
5. The frozen pair is not retired by accident: `list-utils.js` and `markdown-renderer.js` remain active sources under `public/assets/js/` for as long as anything loads them from either path.

Until then, treat every `/legacy/` path as a live public contract.
