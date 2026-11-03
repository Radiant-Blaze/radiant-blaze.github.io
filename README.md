[radiant-blaze.github.io](https://radiant-blaze.github.io/)

Add posts as Markdown files under `content/posts/`. Add challenges as Markdown files in an existing CTF folder; for a new event, create its folder and `ctf.json` metadata first. Then run `npm run content:sync` to synchronize indexes, or `npm run content:check` to validate them. Astro builds the article/writeup routes and sitemap.

## Portfolio content

The portfolio is published at `/portfolio/`. Add Markdown entries under `content/portfolio/`; their `type` frontmatter selects the presentation. Frontmatter is validated during `npm run build`. Entries default to published and can be removed from the public page with `published: false`.

- `profile.md`: `type: profile` and `title`; its Markdown body supplies the introduction.
- `skills/*.md`: `type: skill`, `title`, `category`, and a `skills` list; use the body for a short note.
- `projects/*.md`: `type: project`, `title`, `description`, and `category`; optional `technologies`, `tags`, `image` (`src` and `alt`), `featured`, `date`, `order`, and `links`.
- `achievements/*.md`: `type: achievement`, `title`, and `description`; optionally add `category`, `date`, and `links`.
- `research/*.md`: `type: research`, `title`, and `description`; optionally add `publication`, `date`, and `links`.
- `certifications/*.md`: `type: certification`, `title`, and `issuer`; optionally add `credentialId`, `date`, and `links`.
- `custom/*.md`: `type: custom`, `sectionId`, and `title`; add the matching `custom` section to the config to render its Markdown body, optional description, date, and links.

All entries support `published`, `featured`, integer `order`, optional `date`, and optional `links` (absolute HTTP(S) or `mailto:` URLs). The centralized `content/portfolio/config.json` controls the hero name and focus line, page copy, and section IDs, types, titles, descriptions, visibility, navigation, ordering, sorting, empty-state visibility, and CTF limits (`itemLimit` for events and `challengeLimit` for writeups per event). The hero summary counts are derived from published portfolio entries and CTF content. Sections with no published content are hidden unless `showEmpty` is enabled. Multiple `custom` sections can be added through configuration and Markdown without changing the route component. Project category and technology filters are derived from published project metadata, shown when there is more than one project to filter, and synchronized to URL parameters. CTF notes reuse the existing event and writeup content rather than duplicating it.
