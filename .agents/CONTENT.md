# Content system

Posts live in `content/posts/`. CTF writeups live in `content/ctfs/<event>/`. Posts and writeups use YAML frontmatter; events use `ctf.json`. `content/posts/index.json` orders posts, `content/ctfs/index.json` orders events, and each event's `challenges` array orders writeups.

Run `npm run content:sync` to discover files and update those indexes, or `npm run content:check` to fail if synchronization would change them. Existing valid entries retain order; new files are appended in deterministic natural filename order. Metadata is preserved rather than regenerated from filenames.

Astro glob loaders in `src/content.config.ts` load Markdown and event JSON. `src/lib/article-data.ts` joins collections to the authored order files for routes, navigation, projections, and sitemap generation.

## Converter

`src/lib/markdown-converter/` is independent of site directories and schemas:

- `frontmatter.ts` uses `js-yaml` and preserves YAML types and nested metadata.
- `html.ts` provides HTML escaping and protects math tokens.
- `index.ts` converts headings, paragraphs, nested lists, blockquotes, tables, fenced code, inline code, links, images, and math into Astro-insertable HTML.

Math is protected before table detection. These must remain valid and preserve their pipes:

```text
$|x|$
$P(A \mid B)$
$\{x \mid x > 0\}$
```

Block math is emitted as its own block, never inside a paragraph. Markdown table parsing must never consume pipes belonging to inline or block math.
