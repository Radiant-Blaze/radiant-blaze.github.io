# Astro Migration Workspace

The Astro build is isolated from the checked-in fallback site. Existing assets and `content/` are read from their source directories during development and copied byte-for-byte into `dist/` during a production build.

Run `npm install`, then `npm run build`. Use `npm run preview` to inspect the built site with its production `.html` routes. Astro/Vite development routing does not directly serve every legacy `.html` URL, so `npm run dev` is not the route-parity source of truth. No deployment settings are changed by these commands.

Run `npm run check:phase3a`, `npm run parity`, and `npm run test:renderer` to verify routes/assets/metadata, generated article output, and Markdown/metadata fixtures. Phase 5E–5G read-model suites are `npm run check:blog-projection`, `npm run check:search-projection`, and `npm run check:ctf-projection`. Phase 5H–5J parity suites are `npm run check:phase5h`, `npm run check:phase5i`, and `npm run check:phase5j`; they target the production preview at `http://127.0.0.1:4322` by default.