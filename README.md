[radiant-blaze.github.io](https://radiant-blaze.github.io/)

Add posts as Markdown files under `content/posts/`. Add challenges as Markdown files in an existing CTF folder; for a new event, create its folder and `ctf.json` metadata first. Then run `python scripts/generate_sitemap.py`. It discovers the Markdown files, syncs the JSON indexes, prerenders standalone pages under `generated/`, and rebuilds `sitemap.xml` using only Python's standard library.
