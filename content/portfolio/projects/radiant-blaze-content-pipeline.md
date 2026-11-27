---
type: project
title: Radiant Blaze Content Pipeline
description: A static-first Astro pipeline that turns Markdown, JSON indexes, and content collections into searchable pages, RSS and JSON feeds, topic hubs, and per-article Open Graph cards.
category: Web Development
technologies: [Astro, TypeScript, Node.js, sharp, RSS, JSON Feed]
tags: [astro, content, seo, automation]
links:
  - label: SOURCE CODE
    url: https://github.com/radiant-blaze/radiant-blaze.github.io
order: 2
date: 2026-11-27
published: true
---
The pipeline starts with Markdown and ordered JSON indexes, validates them at build time, and projects the same data into server-rendered pages, a browser search model, feeds, and sitemap entries.

The 2026 architecture pass added a main-scoped SPA module loader, a no-flash inline theme bootstrap, content-hashed shell bundles, and hash-pinned legacy compatibility assets. Article routes also generate 1200×630 social cards during the build, and topic hubs are derived directly from categories and tags.

Read the build notes in [Making a Static Astro Site Feel Like an App](/generated/posts/web-development/022-static-site-app-feel.html) and [Building a Searchable Topic Layer for a Static Archive](/generated/posts/web-development/023-searchable-topic-layer.html).
