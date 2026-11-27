---
title: Building a Searchable Topic Layer
description: "Turning categories and tags into crawlable topic hubs, full-content feeds, and stable Open Graph cards without adding a search service or database."
date: 2026-11-20
tags: [astro, seo, search, content]
category: Web Development
difficulty: 3
xp: 520
estimatedPlayTime: 8 min
author: Radiant Blaze
---
## Search Without a Server

The archive is small enough to search in the browser but structured enough to link externally. The site already ships a read model containing every post and writeup, plus the tags, categories, dates, and body text needed for filtered search.

The read model is generated at build time from the same Markdown and JSON indexes that produce the pages. That keeps search and rendering from drifting apart: a post that exists in the archive exists in the model, and a tag shown on a card is a tag the hub can resolve.

## One Topic Per Label

Categories and tags overlap. A challenge may have `category: Pwn` and `tags: [pwn, heap]`. Rendering two separate hubs for `Pwn` and `pwn` would split the archive and create duplicate URLs.

The topic collector merges labels case-insensitively, slugifies them deterministically, and reserves the index route. Each hub owns a count, its posts, its writeups, and the newest date used for the sitemap.

A generated hub is only useful if it has something to say. Hubs with a single entry are marked `noindex, follow` and left out of the sitemap, while still remaining reachable for readers. Hubs with more than one entry get an intro and links to related topics, so the index does not become a wall of near-empty pages.

## Feeds Are Content, Not Just Links

A summary-only feed is enough to announce a post, but not enough to read one in a feed reader. The RSS and JSON feeds now carry rendered article HTML, with root-relative links and images rewritten to absolute URLs.

Two details matter:

- RSS needs `content:encoded` inside a CDATA block; a literal `]]>` must be split.
- JSON Feed 1.1 accepts `content_html`; `summary` stays for clients that only show excerpts.

The feed still uses the same ordering as the site: every published post and writeup, newest first, with a deterministic last-build date.

## Social Cards as Build Artifacts

Every article gets a 1200×630 PNG card generated during the build. The endpoint receives the article route, renders a deterministic SVG, and rasterizes it with `sharp`. The page head points at the matching hashed file; non-article pages keep the default banner.

This is better than a hand-maintained image per post because it cannot drift from the title. The remaining trade-off is typography: the rasterizer uses a generic sans-serif unless the font is installed in the build environment. A future iteration can pin the display font or render text as paths for exact brand consistency.

## Keeping the Layer Honest

The topic, feed, and social-card layers all derive from the same authored content. That is the useful property: there is no second content database to update, no manual image to forget, and no search index that can lag behind a deploy.

The next improvement is performance, not more surface area: avoid blocking the first SPA listing render on the full search model when the server already rendered the cards.

## Further Reading

- [Making a Static Astro Site Feel Like an App](/generated/posts/web-development/022-static-site-app-feel.html)
- [RSS feed](/rss.xml)
- [JSON feed](/feed.json)
- [Topic hub index](/topics.html)
