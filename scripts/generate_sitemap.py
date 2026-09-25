import html
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlencode


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://radiant-blaze.github.io"
NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NAMESPACE)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def natural_key(value):
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def ordered_discovered(existing, discovered):
    available = set(discovered)
    ordered = list(dict.fromkeys(item for item in existing if item in available))
    known = set(ordered)
    ordered.extend(sorted(available - known, key=natural_key))
    return ordered


def parse_frontmatter(source):
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$", source)
    if not match:
        return {}, source
    metadata = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if separator:
            metadata[key.strip()] = value.strip().strip("[]")
    if "tags" in metadata:
        metadata["tags"] = [tag.strip() for tag in metadata["tags"].split(",") if tag.strip()]
    return metadata, match.group(2)


def encoded_path(path):
    return "/".join(quote(part, safe="") for part in path.split("/"))


def post_route(post_file):
    html_path = Path(post_file).with_suffix(".html").as_posix()
    return f"/generated/posts/{encoded_path(html_path)}"


def writeup_route(ctf_id, challenge_file):
    html_path = Path(challenge_file).with_suffix(".html").name
    return f"/generated/writeups/{encoded_path(ctf_id)}/{encoded_path(html_path)}"


def article_output(route):
    return ROOT.joinpath(*(unquote(part) for part in route.lstrip("/").split("/")))


def page_url(page, **params):
    url = f"{ORIGIN}/pages/{page}"
    return f"{url}?{urlencode(params)}" if params else url


def internal_page_url(page, **params):
    url = f"/pages/{page}"
    return f"{url}?{urlencode(params)}" if params else url


def escape(value):
    return html.escape(str(value or ""), quote=True)


def render_markdown(markdown):
    tokens = []

    def stash(value):
        tokens.append(value)
        return f"@@TOKEN{len(tokens) - 1}@@"

    source = html.escape(markdown.replace("\r\n", "\n").replace("\r", "\n"), quote=True)

    def fenced(match):
        language = (match.group(2) or "").lower()
        code = match.group(3)
        if language == "math":
            return stash(f"<div class=\"math-block\">\\[{code}\\]</div>")
        return stash(
            f'<pre class="terminal"><code data-language="{language or "text"}">{code}</code></pre>'
        )

    source = re.sub(
        r"^(`{3,})(\w+)?[ \t]*\n([\s\S]*?)^\1`*[ \t]*$",
        fenced,
        source,
        flags=re.MULTILINE,
    )
    source = re.sub(
        r"^\\\[((?:.|\n)*?)\\\]$",
        lambda match: stash(f"<div class=\"math-block\">\\[{match.group(1)}\\]</div>"),
        source,
        flags=re.MULTILINE,
    )
    source = re.sub(r"`([^`\n]+)`", lambda match: stash(f"<code>{match.group(1)}</code>"), source)

    def inline(text):
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', text)

    lines = source.split("\n")
    output = []
    paragraph = []

    def flush_paragraph():
        if paragraph:
            output.append(f"<p>{'<br>'.join(inline(line) for line in paragraph)}</p>")
            paragraph.clear()

    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            flush_paragraph()
            index += 1
            continue
        if re.fullmatch(r"@@TOKEN\d+@@", line):
            flush_paragraph()
            output.append(line)
            index += 1
            continue
        heading = re.match(r"^(#{1,6}) (.+)$", line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            tag = f"h{2 if level <= 2 else min(6, level)}"
            slug = re.sub(r"[^a-z0-9]+", "-", heading.group(2).lower())
            output.append(f'<{tag} id="{slug}">{inline(heading.group(2))}</{tag}>')
            index += 1
            continue
        if line.startswith("&gt; "):
            flush_paragraph()
            quote_lines = []
            while index < len(lines) and lines[index].startswith("&gt; "):
                quote_lines.append(inline(lines[index][5:]))
                index += 1
            output.append(f"<blockquote>{'<br>'.join(quote_lines)}</blockquote>")
            continue
        bullet = bool(re.match(r"^[-*] ", line))
        list_pattern = r"^[-*] " if bullet else r"^\d+\. "
        if bullet or re.match(list_pattern, line):
            flush_paragraph()
            items = []
            while index < len(lines) and re.match(list_pattern, lines[index]):
                items.append(f"<li>{inline(re.sub(list_pattern, '', lines[index]))}</li>")
                index += 1
            tag = "ul" if bullet else "ol"
            output.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        paragraph.append(line)
        index += 1

    flush_paragraph()
    rendered = "".join(output)
    return re.sub(r"@@TOKEN(\d+)@@", lambda match: tokens[int(match.group(1))], rendered)


def format_date(value):
    return datetime.strptime(value, "%Y-%m-%d").strftime("%b %d, %Y").upper()


def page_head(title, description, canonical):
    return f'''<!doctype html>
<html lang="en" class="dark-theme">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{escape(title)}</title>
    <meta name="description" content="{escape(description)}" />
    <link rel="canonical" href="{escape(canonical)}" />
    <meta name="theme-color" content="#171329" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Radiant Blaze" />
    <meta property="og:title" content="{escape(title)}" />
    <meta property="og:description" content="{escape(description)}" />
    <meta property="og:url" content="{escape(canonical)}" />
    <meta property="og:image" content="{ORIGIN}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{escape(title)}" />
    <meta name="twitter:description" content="{escape(description)}" />
    <meta name="twitter:image" content="{ORIGIN}/og-image.png" />
    <link rel="preload" href="/assets/fonts/press-start-2p-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/assets/css/style.css?v=20260926-4" />
    <script src="/assets/js/theme.js"></script>
    <script defer src="/assets/js/audio.js"></script>
    <script type="module" src="/assets/js/static-article.js?v=20260926-1"></script>
  </head>
  <body>
    <main class="quest-screen">
      <header class="quest-top quest-wrap">
        <a class="quest-brand" href="/"><span class="pixel-logo">RB</span>RADIANT BLAZE</a>
        <nav class="quest-nav" aria-label="Blog navigation">
          <a href="/pages/blog.html">BLOG</a><a href="/pages/ctf.html">CTFS</a><a href="/pages/search.html">SEARCH</a>
          <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Switch to light theme"><span class="theme-icon" aria-hidden="true">☼</span></button>
          <button class="theme-toggle audio-toggle" type="button" data-audio-toggle aria-pressed="false" aria-label="Play music"><span class="audio-icon" aria-hidden="true">♫</span></button>
        </nav>
      </header>'''


def render_social(site):
    links = []
    for item in site.get("social", []):
        label = escape(item.get("label"))
        icon = f'<span aria-hidden="true">{escape(item.get("icon"))}</span>'
        url = item.get("url", "")
        if not re.match(r"^(https?:|mailto:)", url, flags=re.IGNORECASE):
            links.append(
                f'<span class="social-link is-pending" title="{label} · coming soon" aria-label="{label} · coming soon">{icon}</span>'
            )
        else:
            target = ' target="_blank" rel="noopener"' if not url.startswith("mailto:") else ""
            links.append(f'<a class="social-link" href="{escape(url)}"{target} aria-label="{label}">{icon}</a>')
    return "".join(links)


def page_end():
    return "\n    </main>\n  </body>\n</html>\n"


def render_post(post, site):
    title = post.get("title", "Untitled Post")
    description = post.get("description", "Read this post on Radiant Blaze.")
    category = post.get("category", "POST")
    tags = post.get("tags", [])
    related = [
        f'<a href="/pages/blog.html?category={quote(category)}">MORE {escape(category).upper()} POSTS</a>'
    ]
    related.extend(
        f'<a href="/pages/search.html?topic={quote(tag.lower())}">MORE {escape(tag).upper()}</a>'
        for tag in tags[:2]
    )
    tags_html = "".join(
        f'<a href="/pages/search.html?topic={quote(tag.lower())}"># {escape(tag).upper()}</a>'
        for tag in tags
    )
    body = render_markdown(post["body"])
    read_time = escape(post.get("estimatedPlayTime", ""))
    author = escape(post.get("author", "Radiant Blaze"))
    route = post_route(post["file"])
    return f'''{page_head(f"{title} · Radiant Blaze", description, ORIGIN + route)}
      <header class="article-header quest-wrap">
        <p class="quest-number">POST · {escape(category).upper()}</p>
        <h1 class="quest-title">{escape(title).upper()}</h1>
        <div class="article-info"><span>READ TIME: <b>{read_time.upper()}</b></span><span>{format_date(post["date"])}</span><span>BY <b>{author.upper()}</b></span></div>
      </header>
      <div class="page-grid article-layout quest-wrap">
        <article class="quest-article">{body}<nav class="article-related" aria-label="Related content">{"".join(related)}</nav></article>
        <aside class="sidebar">
          <section class="pixel-panel"><div class="hp-label"><span>READING PROGRESS</span><span>ARTICLE</span></div><div class="hp-track"><span class="hp-fill" data-hp></span></div></section>
          <section class="pixel-panel"><h2>TAGS</h2><nav class="region-list">{tags_html}</nav></section>
        </aside>
      </div>
      <footer class="site-footer"><div class="quest-wrap"><p class="section-heading">BLOG STATUS</p><div class="footer-stats"><span><b>21</b>POSTS</span><span><b>28,750</b>WORDS</span><span><b>01,284</b>READERS</span><span><b>v1.0.0</b>CURRENT BUILD</span></div><nav class="social-links" aria-label="Social links">{render_social(site)}</nav></div></footer>''' + page_end()


def render_writeup(ctf, challenge, challenge_files, site):
    title = challenge.get("title", Path(challenge["file"]).stem)
    description = challenge.get("description", f"CTF writeup for {title} from {ctf['title']}.")
    category = challenge.get("category", "MISC").upper()
    route = writeup_route(ctf["id"], challenge["file"])
    index = challenge_files.index(challenge["file"])
    previous = challenge_files[index - 1] if index else None
    following = challenge_files[index + 1] if index + 1 < len(challenge_files) else None

    def challenge_link(file, label):
        return f'<a href="{writeup_route(ctf["id"], file)}">{label}</a>' if file else f"<span>{label}</span>"

    related = (
        challenge_link(previous, "← PREVIOUS CHALLENGE")
        + f"<span>CHALLENGE {index + 1} / {len(challenge_files)}</span>"
        + challenge_link(following, "NEXT CHALLENGE →")
    )
    tags_html = "".join(
        f'<a href="{internal_page_url("ctf.html", ctf=ctf["id"])}"># {escape(tag).upper()}</a>'
        for tag in challenge.get("tags", [])
    )
    points = escape(challenge.get("points", "—"))
    difficulty = max(0, min(5, int(challenge.get("difficulty", 0) or 0)))
    stars = "★" * difficulty + "☆" * (5 - difficulty)
    solves = f'<li>SOLVES <strong>{escape(challenge["solves"])}</strong></li>' if challenge.get("solves") else ""
    flag = f'<h2>FLAG CAPTURED</h2><p class="ctf-flag">{escape(challenge["flag"])}</p>' if challenge.get("flag") else ""
    body = render_markdown(challenge["body"])
    has_math = bool(
        re.search(r"```math\b|\\\[|\\\(|\$\$", challenge["body"], flags=re.IGNORECASE)
    )
    layout_class = "article-layout article-layout--full-width" if has_math else "article-layout"
    layout_open = f'      <div class="page-grid {layout_class} quest-wrap">'
    sidebar = "" if has_math else f'''
        <aside class="sidebar">
          <section class="pixel-panel"><div class="hp-label"><span>READING PROGRESS</span><span>WRITEUP</span></div><div class="hp-track"><span class="hp-fill" data-hp></span></div></section>
          <section class="pixel-panel"><h2>CHALLENGE DATA</h2><ul class="stat-list"><li>EVENT <strong>{escape(ctf.get("event", ctf["title"]))}</strong></li><li>CATEGORY <strong>{escape(category)}</strong></li><li>POINTS <strong>{points}</strong></li><li>DIFFICULTY <strong class="difficulty">{stars}</strong></li>{solves}</ul>{flag}</section>
          <section class="pixel-panel"><h2>TAGS</h2><nav class="region-list">{tags_html}</nav></section>
        </aside>'''
    title_text = f"{title} · {ctf['title']} · Radiant Blaze"
    return f'''{page_head(title_text, description, ORIGIN + route)}
    <p class="ctf-back quest-wrap"><a href="{internal_page_url("ctf.html", ctf=ctf["id"])}">← {escape(ctf["title"]).upper()}</a></p>
      <header class="article-header quest-wrap">
        <p class="quest-number">{escape(ctf["title"]).upper()} · {escape(category)}</p>
        <h1 class="quest-title">{escape(title).upper()}</h1>
        <div class="article-info"><span>POINTS: <b>{points}</b></span><span>DIFFICULTY: <b class="difficulty">{stars}</b></span>{f'<span>SOLVES: <b>{escape(challenge["solves"])}</b></span>' if challenge.get("solves") else ""}<span>BY <b>{escape(challenge.get("author", "Radiant Blaze")).upper()}</b></span></div>
      </header>
{layout_open}
        <article class="quest-article">{body}<nav class="article-related" aria-label="Related writeups">{related}</nav></article>{sidebar}
      </div>
      <footer class="site-footer"><div class="quest-wrap"><p class="section-heading">CONNECT</p><nav class="social-links" aria-label="Social links">{render_social(site)}</nav></div></footer>''' + page_end()


posts_directory = ROOT / "content/posts"
posts_index_path = posts_directory / "index.json"
posts_index = read_json(posts_index_path)
posts = ordered_discovered(
    posts_index.get("posts", []),
    [path.relative_to(posts_directory).as_posix() for path in posts_directory.rglob("*.md")],
)
if posts != posts_index.get("posts", []):
    posts_index["posts"] = posts
    write_json(posts_index_path, posts_index)

ctfs_directory = ROOT / "content/ctfs"
ctf_index_path = ctfs_directory / "index.json"
ctf_index = read_json(ctf_index_path)
ctf_ids = ordered_discovered(
    ctf_index.get("ctfs", []),
    [path.name for path in ctfs_directory.iterdir() if path.is_dir() and (path / "ctf.json").is_file()],
)
if ctf_ids != ctf_index.get("ctfs", []):
    ctf_index["ctfs"] = ctf_ids
    write_json(ctf_index_path, ctf_index)

challenge_count = 0
ctfs = []
for ctf_id in ctf_ids:
    ctf_directory = ctfs_directory / ctf_id
    ctf_path = ctf_directory / "ctf.json"
    ctf = read_json(ctf_path)
    challenge_files = ordered_discovered(
        ctf.get("challenges", []), [path.name for path in ctf_directory.glob("*.md")]
    )
    if challenge_files != ctf.get("challenges", []):
        ctf["challenges"] = challenge_files
        write_json(ctf_path, ctf)
    challenge_count += len(challenge_files)
    challenges = []
    for challenge_file in challenge_files:
        metadata, body = parse_frontmatter(
            (ctf_directory / challenge_file).read_text(encoding="utf-8")
        )
        challenge = {**metadata, "body": body, "file": challenge_file}
        challenges.append(challenge)
    ctf["id"] = ctf_id
    ctf["challengeFiles"] = challenge_files
    ctf["challenges"] = challenges
    ctfs.append(ctf)

site = read_json(ROOT / "content/site.json")
manifest_path = ROOT / "generated/.article-pages.json"
previous_pages = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
generated_pages = []
post_data = []

for post_file in posts:
    metadata, body = parse_frontmatter(
        (posts_directory / post_file).read_text(encoding="utf-8")
    )
    post = {**metadata, "body": body, "file": post_file}
    post_data.append(post)
    output_path = article_output(post_route(post_file))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_post(post, site), encoding="utf-8")
    generated_pages.append(output_path.relative_to(ROOT).as_posix())

for ctf in ctfs:
    for challenge in ctf["challenges"]:
        output_path = article_output(writeup_route(ctf["id"], challenge["file"]))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            render_writeup(ctf, challenge, ctf["challengeFiles"], site), encoding="utf-8"
        )
        generated_pages.append(output_path.relative_to(ROOT).as_posix())

for old_page in previous_pages:
    if old_page not in generated_pages:
        old_path = (ROOT / old_page).resolve()
        try:
            old_path.relative_to((ROOT / "generated").resolve())
        except ValueError:
            continue
        if old_path.is_file():
            old_path.unlink()

manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.write_text(json.dumps(generated_pages, indent=2) + "\n", encoding="utf-8")

urls = [
    f"{ORIGIN}/",
    page_url("blog.html"),
    page_url("search.html"),
    page_url("ctf.html"),
]
urls.extend(f"{ORIGIN}{post_route(post['file'])}" for post in post_data)
for ctf in ctfs:
    urls.append(page_url("ctf.html", ctf=ctf["id"]))
    urls.extend(
        f"{ORIGIN}{writeup_route(ctf['id'], challenge['file'])}"
        for challenge in ctf["challenges"]
    )

urlset = ET.Element(f"{{{NAMESPACE}}}urlset")
for url in urls:
    entry = ET.SubElement(urlset, f"{{{NAMESPACE}}}url")
    ET.SubElement(entry, f"{{{NAMESPACE}}}loc").text = url

ET.indent(urlset, space="  ")
ET.ElementTree(urlset).write(ROOT / "sitemap.xml", encoding="utf-8", xml_declaration=True)
with (ROOT / "sitemap.xml").open("a", encoding="utf-8") as sitemap_file:
    sitemap_file.write("\n")

print(
    f"Discovered {len(posts)} posts, {len(ctfs)} CTF events, and "
    f"{challenge_count} writeups; generated {len(generated_pages)} pages "
    f"and wrote {len(urls)} URLs to sitemap.xml"
)