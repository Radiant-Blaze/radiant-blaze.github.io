# Legacy JSON and Content Contracts

This inventory describes the checked-in data and response shapes used by the unchanged browser JavaScript and the legacy Python generator. Astro reads the same authored files for static output and copies them unchanged to `dist/content/`; it does not replace these runtime contracts.

## Index Files

| File/schema | Producers and consumers | Ordering and runtime use | Astro status |
|---|---|---|---|
| `content/posts/index.json`: `{ "posts": string[] }`; entries are paths relative to `content/posts/`. | `generate_sitemap.py` discovers Markdown files and updates the array. `content.js:loadData()` reads `posts`; `home.js`, `blog.js`, and global search consume the returned posts. `article-data.ts` reads it for static route order. | Array order is observable in listings, latest-post tie behavior, search, and generated route manifests. It is fetched in the browser at runtime. | Astro serves the exact source bytes at the same URL. The index remains both the runtime contract and ordering input; Python still maintains its membership/order. |
| `content/ctfs/index.json`: `{ "ctfs": string[] }`; entries are event directory IDs relative to `content/ctfs/`. | `generate_sitemap.py` discovers event directories and updates the array. `content.js:loadCtfs()` and `ctf.js` use it for the event list. `article-data.ts` uses it for Astro route order. | Array order determines event ordering, global search record order for equal dates, and sitemap event order. It is fetched in the browser for the unscoped arena. | Astro serves the exact source bytes at the same URL. The index remains both the runtime contract and ordering input; Python still maintains its membership/order. |
| `content/ctfs/<event>/ctf.json`: `{ title: string, event?: string, date: YYYY-MM-DD, difficulty?: number, url?: string, description?: string, challenges: string[] }`. | Authored event metadata; Python reconciles `challenges` with Markdown filenames. `content.js:loadCtfs()` fetches it; `ctf.js` renders event cards, organizer/date/source/difficulty, searches event fields, paginates challenges, and uses challenge order for previous/next. Astro’s events collection reads the same metadata. | `challenges` is the authoritative per-event challenge order; `ctfs/index.json` orders events. The browser fetches this JSON at runtime. | Astro serves each event’s exact source bytes at the same URL. Keep the JSON as authored event metadata and challenge-order source. |

## Shared Site Data

`content/site.json` has `social: { label, icon, url }[]` and `categoryBlurbs: Record<string, string>`. The Python article renderer reads `social`. `content.js` returns it from both `loadData()` and `loadCtfs()`; `home.js`, `blog.js`, and `ctf.js` render social links, while `blog.js` reads category blurbs for category pages. It is a runtime fetch and an authored metadata source; Astro also imports it for static article footers. Keep it.

## Markdown Front Matter

The browser's `parsePost()` keeps scalar front matter values as strings, converts inline comma-separated `tags` into `string[]`, and adds `body` and `file`. The Python parser uses the same small scalar format and comma-separated tag behavior. Astro’s schema types some values (`date`, numeric JSON metadata) more strictly for build-time use; it does not change the raw Markdown response copied for the browser.

| Content type | Fields in the current collection schema | Browser/Python fields actually used |
|---|---|---|
| Post Markdown | `title`, `description`, `date`, `tags`, `category`, `difficulty`, `xp`, `thumbnail`, `estimatedPlayTime`, `author`, `path` | `title`, `description`, `date`, `tags`, `category`, `author`, `estimatedPlayTime`, `body`, and `file` feed cards, article output, search, categories, year filters, archive, and URLs. Python article rendering uses title, description, date, category, tags, estimatedPlayTime, author, and body. `difficulty`, `xp`, `thumbnail`, and `path` are not currently consumed by these readers. |
| CTF challenge Markdown | `title`, `description`, `category`, `points`, `difficulty`, `flag`, `solves`, `tags`, `author` | `title`, `description`, `category`, `points`, `difficulty`, `flag`, `solves`, `tags`, `author`, `body`, and `file` feed cards, writeup rendering, challenge metadata, search, and previous/next links. Python also uses those presentation fields when rendering standalone writeups. |

Empty values matter: all current `solves:` entries parse as empty strings and are omitted from solve-count UI; optional `flag`, `description`, `category`, `author`, and other fields use existing defaults/fallbacks. Do not normalize empty strings to absent values without parity tests.

## Search, Filters, and Pagination

- Blog search matches post `title`, `description`, `category`, `tags`, `author`, and `body`. Blog category filtering uses exact `category`; the `year` query filters by `date`. Blog pagination uses `pg`, clamps invalid values, and shows five posts per page.
- Global search records contain posts and writeups. Its text search uses `title`, `description`, `category`, `tags`, and event `title` (not body text); topic filtering checks categories/tags/event title, type filtering selects posts/writeups, and year filtering uses post date or event date. It displays five records per page; its search input updates `q` in history, while type/topic/page selection is client-local.
- CTF event search matches event `title`, `event`, `description`, and `date`. Challenge search matches challenge `title`, `description`, `category`, `tags`, `points`, and `body`, plus event title/event. `ctf` scopes to an event, `q` searches, `pg` paginates, and `challenge` selects a writeup. Event challenge lists show five per page and load only the needed challenge bodies outside full-text search.
- `home.js` sorts posts by post `date` and writeups by event `date` when it calculates the featured item.

These semantics remain owned by the existing JavaScript. Astro-generated page HTML does not replace them.

## Generated Artifacts

| Artifact | Producer | Consumer | Current status |
|---|---|---|---|
| `generated/.article-pages.json`: retired legacy route manifest. | None in the Astro workflow. | Historical artifact only; Astro uses `dist/astro-article-order.json`. | Retired with the Python compiler. |
| `sitemap.xml`: XML `<urlset>` of homepage, archive shells, article URLs, and event-query URLs. | `src/pages/sitemap.xml.ts`. | `robots.txt` and search crawlers consume the deployed `/sitemap.xml`. | Astro owns the generated sitemap; no checked-in source copy is required. |
| `dist/astro-article-order.json`: ordered route `string[]`. | Astro endpoint from the collections and content indexes. | Route parity tooling and future deployment checks. | Current authoritative article/writeup order metadata. |

## Runtime Contract and Replacement Boundary

The unchanged JavaScript fetches `/content/site.json`, both index files, per-event `ctf.json`, and individual Markdown bodies. Astro now generates static compatibility routes for the two indexes and per-event metadata. Those three endpoint families read the existing JSON sources as raw bytes to preserve exact serialization. The source-assets integration excludes only those route files from its general `content/` copy; `site.json` and raw Markdown are still copied unchanged.

The compatibility routes preserve runtime URLs but do not replace the Python producer: `generate_sitemap.py` still discovers files and synchronizes index membership/order and event challenge lists. Do not remove either index, event JSON source, or raw Markdown endpoints until all runtime consumers have moved and the replacement generation process is proven equivalent for search, ordering, filtering, pagination, missing data, and query routes.

### Phase 5A Update

Astro now serves `/content/posts/index.json`, `/content/ctfs/index.json`, and `/content/ctfs/<event>/ctf.json` as static endpoints. These responses are the original source JSON bytes; event endpoint paths are generated from the existing CTF index. Thus, the earlier “Astro status” cells in the index table describe the pre-Phase-5 state and are superseded. Astro owns these response routes, while the checked-in JSON and Python discovery/synchronization remain their source/producer.

### Phase 5E–5G Update

Astro also generates `/content/runtime-read-model.json` from the ordered Astro collections and the authoritative source indexes/event metadata. It contains legacy-parser-compatible post/writeup records, including body text, plus site metadata. Post order follows `posts/index.json`; event order follows `ctfs/index.json`; challenge order and previous/next identity follow each event's `ctf.json` `challenges` array. It is a build-time projection, not a replacement source of truth.

The existing browser loaders prefer this read model and retain their original JSON/Markdown fetch path when it is unavailable or an out-of-index file is requested. Blog and CTF index shells are also server-rendered from the same model. Query-driven blog/global/CTF search, category/topic/year filters, pagination, event scopes, and SPA navigation remain in the unchanged interaction logic; the archive URL remains a redirect to Search. Search modes intentionally keep their distinct field sets, including body search for blog and CTF but not global search.

### Phase 5H–5J Update

Astro shells now use `astro-pages.js` and `astro-navigation.js` as their primary runtime controllers. The Astro controller handles blog/category/archive-alias/search/CTF/event/query-shell interactions and consumes the shared read model; the Astro router preserves internal-link exclusions, main swapping, history/scroll restoration, module re-execution, and normal-navigation fallback. Generated article/writeup routes are statically rendered by Astro. The legacy `home.js`, `blog.js`, `ctf.js`, `spa.js`, generated HTML, and Python generator remain available and are not removed; legacy blog behavior is dynamically loaded only when an explicit post path is absent from the model or the model cannot load. The JSON and raw Markdown compatibility routes remain in place.
