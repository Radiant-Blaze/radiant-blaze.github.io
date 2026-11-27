# Search Console & Bing setup runbook

Status as of 2026-11-26: **not started** — no verified property exists, no sitemap
has been submitted, and no verification file or meta tag is present in the
repository or on the live site. This document records the exact steps and the
points where a human with account access must act.

## Prerequisites

The live site still serves the pre-Milestone-1 build (verified by
`npm run check:live`). Complete the release first; otherwise Google will crawl
titles, descriptions and structured data that are about to change.

1. Merge Milestones 1–2 and let the Pages workflow finish.
2. Confirm the deployment:
   ```text
   npm run check:live          # must pass; currently fails on 32 JSON-LD checks
   ```
3. Verify the live homepage title reads
   `Radiant Blaze — CTF Writeups & Linux Field Notes`.

## Google Search Console

Property type: **URL-prefix** — `https://radiant-blaze.github.io/`.

Do not add a Domain property: that requires DNS control for `github.io`, which
the site owner does not have.

### Verification methods

| Method | Use for this site | Implementation |
|---|---|---|
| HTML file | Supported | Google issues `google<token>.html`; place it in `public/` (Astro copies `public/` to `dist/` verbatim), commit, deploy, then click Verify. |
| HTML tag | Supported | Google issues `<meta name="google-site-verification" content="…">`; render it from `src/components/seo/Verification.astro` (or a `verification` string in `src/lib/seo.ts`) to avoid editing every layout. |
| Google Analytics / Tag Manager | Not available | The site has no GA or GTM tag. |
| DNS | Not available | The hostname belongs to GitHub. |

Never commit a guessed or placeholder token. The token must come from the
Search Console property that will be verified.

### Sitemap

- URL: `https://radiant-blaze.github.io/sitemap.xml`
- Already referenced from `robots.txt`.
- After verification: **Sitemaps → Add a new sitemap → `sitemap.xml`**.
- A successful submission only queues the URLs for crawling. It does not index
  them. Record the reported status (`Success`, `Couldn't fetch`, `Has errors`)
  verbatim in the tracking sheet.

### URL inspection

Inspect these 31 URLs plus the homepage, and record the *actual* verdicts:

1. `https://radiant-blaze.github.io/`
2. `/pages/blog.html`
3. `/pages/ctf.html`
4. `/portfolio/`
5. 27 writeups + 1 post (canonical list: `npm run check:live` prints the route set).

Priority for "Request Indexing" once deployed: homepage, CTF listing, portfolio,
then the writeups that match the mapped keywords in `astro-tools/seo-keywords.json`.

Do **not** use the Indexing API. It is restricted to JobPosting and
BroadcastEvent content; blog posts, writeups and portfolio pages are out of scope.

## Bing Webmaster Tools

Preferred path: **Import from Google Search Console** after the Google property
is verified. That creates the site and transfers verification without a second
meta tag.

Fallbacks:

| Method | Implementation |
|---|---|
| `msvalidate.01` meta tag | Add to the same verification component as the Google tag. |
| `BingSiteAuth.xml` | Place in `public/`, deploy, verify. |
| Import from GSC | No repository change. |

Then submit `https://radiant-blaze.github.io/sitemap.xml` and review the
Index Explorer for crawl errors.

## Monitoring

```text
npm run build          # local output
npm run check:seo      # local SEO audit (dist/)
npm run check:live     # deployed-site audit; SITE_URL overrides the origin
```

`check:live` fetches robots.txt, the sitemap, and every important page, then
asserts HTTP 200, canonical equality, no `noindex`, title/description presence,
and the expected JSON-LD type. It uses no credentials and no third-party API, so
it can run manually or from CI once that is authorized.

## Baseline tracking template

Fill only with numbers exported from Search Console / Bing. Until a property is
verified, every cell is **unavailable** — do not estimate.

| Group | Query | Impressions | Clicks | CTR | Avg position | Landing page |
|---|---|---|---|---|---|---|
| CryptoHack | (from `seo-keywords.json`) | — | — | — | — | — |
| ASIS CTF | — | — | — | — | — | — |
| Digital Pakistan | — | — | — | — | — | — |
| Linux notes | — | — | — | — | — | — |
| Software dev | — | — | — | — | — | — |
| Brand | radiant blaze | — | — | — | — | — |
