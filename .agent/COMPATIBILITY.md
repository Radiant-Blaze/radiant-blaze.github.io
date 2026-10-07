# Compatibility architecture

```text
backup/
  historical archive; not consumed by the build

compat/
  intentionally maintained active compatibility source
```

The active fallback modules are:

- `compat/legacy-assets/js/blog.js`
- `compat/legacy-assets/js/ctf.js`
- `compat/legacy-assets/js/content.js`

`astro-tools/source-assets.mjs` serves/copies them as:

```text
/legacy/assets/js/blog.js
/legacy/assets/js/ctf.js
/legacy/assets/js/content.js
```

`assets/js/list-utils.js` is also copied to `/legacy/assets/js/list-utils.js`; it is active source under `assets/`, not under `backup/`.

`assets/js/astro-pages.js` dynamically requests fallback modules when required. Removing or casually renaming these files would break compatibility fallback behavior and public URLs. Preserve relative imports between the three compatibility modules.
