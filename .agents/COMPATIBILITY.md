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

`public/assets/js/list-utils.js` is also copied to `/legacy/assets/js/list-utils.js`; it is active source under `public/assets/`, not under `backup/`.

`public/assets/js/astro-pages.js` no longer loads fallback renderers; it renders listing/search surfaces only. Preserve the compatibility module imports because those files are still served as public compatibility assets.
