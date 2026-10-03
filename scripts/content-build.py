import argparse
import hashlib
import html
import json
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlencode


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
POSTS_DIR = CONTENT / "posts"
CTFS_DIR = CONTENT / "ctfs"
POSTS_INDEX = POSTS_DIR / "index.json"
CTFS_INDEX = CTFS_DIR / "index.json"
SITE_JSON = CONTENT / "site.json"
GENERATED = ROOT / "generated"
LEGACY_ROUTE_MANIFEST = GENERATED / ".article-pages.json"
COMPILER_DIR = ROOT / ".generated"
COMPILER_MANIFEST = COMPILER_DIR / "content-manifest.json"
SITEMAP = ROOT / "sitemap.xml"
ORIGIN = "https://radiant-blaze.github.io"
SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
COMPILER_NAME = "radiant-blaze-content-build"
COMPILER_VERSION = "1.0.11"
MANIFEST_VERSION = 1
ET.register_namespace("", SITEMAP_NAMESPACE)
MOBILE_MENU_BUTTON = """<button class="mobile-menu-toggle" data-mobile-menu-toggle type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="primary-site-nav"><span class="menu-wrapper" aria-hidden="true"><span class="menu-row menu-row-top"><span class="menu-dot"></span><span class="menu-dot"></span></span><span class="menu-row menu-row-bottom"><span class="menu-dot"></span><span class="menu-dot"></span></span><span class="menu-row menu-row-horizontal"><span class="menu-dot"></span><span class="menu-dot menu-dot-horizontal"></span><span class="menu-dot"></span></span><span class="menu-row menu-row-vertical"><span class="menu-dot"></span><span class="menu-dot menu-dot-vertical"></span><span class="menu-dot"></span></span></span></button>"""


class BuildError(Exception):
	pass


def natural_key(value):
	return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def ordered_discovered(existing, discovered):
	available = set(discovered)
	ordered = list(dict.fromkeys(item for item in existing if item in available))
	known = set(ordered)
	ordered.extend(sorted(available - known, key=natural_key))
	return ordered


def decode_json(path, errors):
	try:
		value = json.loads(path.read_text(encoding="utf-8"))
	except (OSError, UnicodeError, json.JSONDecodeError) as error:
		errors.append(f"{relative(path)}: invalid JSON ({error})")
		return None
	return value


def relative(path):
	return path.relative_to(ROOT).as_posix()


def parse_frontmatter(path, errors):
	try:
		source_bytes = path.read_bytes()
		source = source_bytes.decode("utf-8")
	except (OSError, UnicodeError) as error:
		errors.append(f"{relative(path)}: cannot read UTF-8 source ({error})")
		return None

	match = re.match(r"^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$", source)
	if not match:
		errors.append(f"{relative(path)}: malformed or missing YAML-style front matter delimiters")
		return None

	metadata = {}
	for line_number, line in enumerate(match.group(1).splitlines(), 2):
		if not line.strip():
			continue
		key, separator, value = line.partition(":")
		key = key.strip()
		if not separator or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", key):
			errors.append(f"{relative(path)}:{line_number}: malformed front matter field")
			continue
		if key in metadata:
			errors.append(f"{relative(path)}:{line_number}: duplicate front matter field '{key}'")
			continue
		metadata[key] = value.strip().strip("[]")

	if "tags" in metadata:
		metadata["tags"] = [tag.strip() for tag in metadata["tags"].split(",") if tag.strip()]

	record = {
		**metadata,
		"body": match.group(2),
		"file": path.name if path.parent.parent == CTFS_DIR else path.relative_to(POSTS_DIR).as_posix(),
		"source_path": relative(path),
		"source_bytes": source_bytes,
		"sha256": hashlib.sha256(source_bytes).hexdigest(),
	}
	return record


def validate_date(value, path, field, errors):
	if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
		errors.append(f"{path}: required field '{field}' must use YYYY-MM-DD")
		return
	try:
		date.fromisoformat(value)
	except ValueError:
		errors.append(f"{path}: field '{field}' is not a valid calendar date: {value}")


def validate_numeric_field(record, field, source_path, errors, minimum=None, maximum=None):
	value = record.get(field)
	if value in (None, ""):
		return
	try:
		number = int(value)
	except (TypeError, ValueError):
		errors.append(f"{source_path}: field '{field}' must be an integer")
		return
	if minimum is not None and number < minimum or maximum is not None and number > maximum:
		errors.append(f"{source_path}: field '{field}' must be between {minimum} and {maximum}")


def escape(value):
	return html.escape(str(value or ""), quote=True)


def parse_tags(record, source_path, errors):
	tags = record.get("tags", [])
	if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
		errors.append(f"{source_path}: field 'tags' must be an inline comma-separated list of strings")
		return []
	return tags


def validate_post(record, errors):
	path = record["source_path"]
	if not record.get("title", "").strip():
		errors.append(f"{path}: required field 'title' is missing or empty")
	validate_date(record.get("date"), path, "date", errors)
	parse_tags(record, path, errors)


def validate_challenge(record, ctf_id, known_ctfs, errors):
	path = record["source_path"]
	title = record.get("title")
	if title is not None and not title.strip():
		errors.append(f"{path}: field 'title' cannot be empty")
	for field in ("points", "difficulty"):
		validate_numeric_field(record, field, path, errors, 0, 999999 if field == "points" else 5)
	parse_tags(record, path, errors)
	for reference_field in ("ctf", "ctf_id"):
		reference = record.get(reference_field)
		if reference and (reference not in known_ctfs or reference != ctf_id):
			errors.append(f"{path}: invalid CTF reference '{reference}' in field '{reference_field}' (file is under '{ctf_id}')")


def encoded_path(value):
	return "/".join(quote(part, safe="") for part in value.split("/"))


def post_route(post_file):
	html_path = PurePosixPath(post_file).with_suffix(".html").as_posix()
	return f"/generated/posts/{encoded_path(html_path)}"


def writeup_route(ctf_id, challenge_file):
	html_name = PurePosixPath(challenge_file).with_suffix(".html").name
	return f"/generated/writeups/{encoded_path(ctf_id)}/{encoded_path(html_name)}"


def output_path_for(route):
	decoded = [unquote(part) for part in route.removeprefix("/").split("/")]
	if any(not part or part in (".", "..") or "\\" in part for part in decoded):
		raise BuildError(f"unsafe route path: {route}")
	target = ROOT.joinpath(*decoded).resolve()
	generated_root = GENERATED.resolve()
	try:
		target.relative_to(generated_root)
	except ValueError:
		raise BuildError(f"conflicting output path outside generated/: {route}")
	return target


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
			return stash(f'<div class="math-block">\\[{code}\\]</div>')
		return stash(f'<pre class="terminal"><code data-language="{language or "text"}">{code}</code></pre>')

	source = re.sub(r"^(`{3,})(\w+)?[ \t]*\n([\s\S]*?)^\1`*[ \t]*$", fenced, source, flags=re.MULTILINE)
	source = re.sub(
		r"^\\\[((?:.|\n)*?)\\\]$",
		lambda match: stash(f'<div class="math-block">\\[{match.group(1)}\\]</div>'),
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
			heading_id = re.sub(r"[^a-z0-9]+", "-", heading.group(2).lower())
			output.append(f'<{tag} id="{heading_id}">{inline(heading.group(2))}</{tag}>')
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
			output.append(f"<{('ul' if bullet else 'ol')}>{''.join(items)}</{('ul' if bullet else 'ol')}>")
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
	<link rel="stylesheet" href="/assets/css/style.css?v=20261002-15" />
	<script src="/assets/js/page-loader.js" defer></script>
	<script src="/assets/js/theme.js"></script>
	<script defer src="/assets/js/audio.js"></script>
	<script type="module" src="/assets/js/static-article.js?v=20260926-1"></script>
  </head>
  <body>
	<main class="quest-screen">
	  <header class="quest-top quest-wrap site-header">
		<a class="quest-brand" href="/"><span class="pixel-logo">RB</span><span class="brand-copy"><span class="brand-title">RADIANT BLAZE</span><span class="brand-caption">QUEST LOG / FIELD HQ</span></span></a>
		<div class="quest-nav-group">
		<nav class="quest-nav" id="primary-site-nav" aria-label="Blog navigation">
		  <a href="/pages/blog.html" data-nav-index="01">BLOG</a><a href="/pages/ctf.html" data-nav-index="02">CTFS</a><a href="/pages/search.html" data-nav-index="03">SEARCH</a>
		</nav>
		<div class="top-controls quest-nav-tools">
		  <input class="theme-checkbox" id="theme-toggle-checkbox" type="checkbox" data-theme-toggle aria-label="Switch to light theme" />
		  <label class="theme-switch" for="theme-toggle-checkbox" aria-hidden="true"><span class="theme-switch-thumb"><svg class="sun-icon" viewBox="0 0 16 16"><path d="M7 0h2v3H7zM7 13h2v3H7zM0 7h3v2H0zM13 7h3v2h-3zM2 2h2v2H2zM12 2h2v2h-2zM2 12h2v2H2zM12 12h2v2h-2zM5 5h6v6H5z" /></svg><svg class="moon-icon" viewBox="0 0 24 24"><path d="M19.8 15.1A9.4 9.4 0 0 1 8.9 4.2 9.6 9.6 0 1 0 19.8 15.1Z" /><path d="M17 3v4M15 5h4M6 2v3M4.5 3.5h3M20 9v3M18.5 10.5h3" /></svg></span></label>
		  <input class="audio-checkbox" id="audio-toggle-checkbox" type="checkbox" data-audio-toggle aria-label="Play music" />
		  <label class="toggleSwitch" for="audio-toggle-checkbox" aria-hidden="true"><span class="speaker"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z" /><path d="M16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" /></svg></span><span class="mute-speaker"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z" /><path d="m16 9 5 6m0-6-5 6" /></svg></span></label>
		  {MOBILE_MENU_BUTTON}
		</div>
		</div>
	  </header>'''


def render_social(site):
	links = []
	for item in site.get("social", []):
		label = escape(item.get("label"))
		icon = f'<span aria-hidden="true">{escape(item.get("icon"))}</span>'
		url = item.get("url", "")
		if not re.match(r"^(https?:|mailto:)", url, flags=re.IGNORECASE):
			links.append(f'<span class="social-link is-pending" title="{label} · coming soon" aria-label="{label} · coming soon">{icon}</span>')
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
	related = [f'<a href="/pages/blog.html?category={quote(category)}">MORE {escape(category).upper()} POSTS</a>']
	related.extend(f'<a href="/pages/search.html?topic={quote(tag.lower())}">MORE {escape(tag).upper()}</a>' for tag in tags[:2])
	tags_html = "".join(f'<a href="/pages/search.html?topic={quote(tag.lower())}"># {escape(tag).upper()}</a>' for tag in tags)
	body = render_markdown(post["body"])
	read_time = escape(post.get("estimatedPlayTime", ""))
	author = escape(post.get("author", "Radiant Blaze"))
	route = post["route"]
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
	route = challenge["route"]
	index = challenge_files.index(challenge["file"])
	previous = challenge_files[index - 1] if index else None
	following = challenge_files[index + 1] if index + 1 < len(challenge_files) else None

	def challenge_link(file, label):
		if not file:
			return f"<span>{label}</span>"
		return f'<a href="{writeup_route(ctf["id"], file)}">{label}</a>'

	related = challenge_link(previous, "← PREVIOUS CHALLENGE") + f"<span>CHALLENGE {index + 1} / {len(challenge_files)}</span>" + challenge_link(following, "NEXT CHALLENGE →")
	tags_html = "".join(f'<a href="/pages/ctf.html?{urlencode({"ctf": ctf["id"]})}"># {escape(tag).upper()}</a>' for tag in challenge.get("tags", []))
	points = escape(challenge.get("points", "—"))
	difficulty = max(0, min(5, int(challenge.get("difficulty", 0) or 0)))
	stars = "★" * difficulty + "☆" * (5 - difficulty)
	solves = f'<li>SOLVES <strong>{escape(challenge["solves"])}</strong></li>' if challenge.get("solves") else ""
	flag = f'<h2>FLAG CAPTURED</h2><p class="ctf-flag">{escape(challenge["flag"])}</p>' if challenge.get("flag") else ""
	body = render_markdown(challenge["body"])
	has_math = bool(re.search(r"```math\b|\\\[|\\\(|\$\$", challenge["body"], flags=re.IGNORECASE))
	layout_class = "article-layout article-layout--full-width" if has_math else "article-layout"
	sidebar = "" if has_math else f'''
		<aside class="sidebar">
		  <section class="pixel-panel"><div class="hp-label"><span>READING PROGRESS</span><span>WRITEUP</span></div><div class="hp-track"><span class="hp-fill" data-hp></span></div></section>
		  <section class="pixel-panel"><h2>CHALLENGE DATA</h2><ul class="stat-list"><li>EVENT <strong>{escape(ctf.get("event", ctf["title"]))}</strong></li><li>CATEGORY <strong>{escape(category)}</strong></li><li>POINTS <strong>{points}</strong></li><li>DIFFICULTY <strong class="difficulty">{stars}</strong></li>{solves}</ul>{flag}</section>
		  <section class="pixel-panel"><h2>TAGS</h2><nav class="region-list">{tags_html}</nav></section>
		</aside>'''
	title_text = f"{title} · {ctf['title']} · Radiant Blaze"
	event_link = f'<a href="/pages/ctf.html?{urlencode({"ctf": ctf["id"]})}">← {escape(ctf["title"]).upper()}</a>'
	solves_header = f'<span>SOLVES: <b>{escape(challenge["solves"])}</b></span>' if challenge.get("solves") else ""
	return f'''{page_head(title_text, description, ORIGIN + route)}
	<p class="ctf-back quest-wrap">{event_link}</p>
	  <header class="article-header quest-wrap">
		<p class="quest-number">{escape(ctf["title"]).upper()} · {escape(category)}</p>
		<h1 class="quest-title">{escape(title).upper()}</h1>
		<div class="article-info"><span>POINTS: <b>{points}</b></span><span>DIFFICULTY: <b class="difficulty">{stars}</b></span>{solves_header}<span>BY <b>{escape(challenge.get("author", "Radiant Blaze")).upper()}</b></span></div>
	  </header>
	  <div class="page-grid {layout_class} quest-wrap">
		<article class="quest-article">{body}<nav class="article-related" aria-label="Related writeups">{related}</nav></article>{sidebar}
	  </div>
	  <footer class="site-footer"><div class="quest-wrap"><p class="section-heading">CONNECT</p><nav class="social-links" aria-label="Social links">{render_social(site)}</nav></div></footer>''' + page_end()


def load_index(path, key, errors):
	data = decode_json(path, errors)
	if data is None:
		return {}
	if not isinstance(data, dict) or not isinstance(data.get(key), list):
		errors.append(f"{relative(path)}: expected an object with an array field '{key}'")
		return {}
	entries = data[key]
	if not all(isinstance(item, str) and item for item in entries):
		errors.append(f"{relative(path)}: every '{key}' entry must be a non-empty string")
		data[key] = []
	elif len(entries) != len(set(entries)):
		errors.append(f"{relative(path)}: duplicate '{key}' entries")
	return data


def safe_relative_name(value):
	pure = PurePosixPath(value)
	return bool(value) and not pure.is_absolute() and all(part not in ("", ".", "..") for part in pure.parts)


def slugify(value):
	return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def manifest_owned_outputs(path, errors):
	if not path.exists():
		return {}
	manifest = decode_json(path, errors)
	if manifest is None:
		return {}
	entries = manifest.get("sources") if isinstance(manifest, dict) else None
	if not isinstance(entries, list):
		errors.append(f"{relative(path)}: expected a 'sources' array")
		return {}
	owned = {}
	for entry in entries:
		if not isinstance(entry, dict) or not isinstance(entry.get("source_path"), str) or not isinstance(entry.get("generated_output"), str):
			errors.append(f"{relative(path)}: malformed source ownership entry")
			continue
		output = entry["generated_output"]
		if not output.startswith("generated/") or not safe_relative_name(output):
			errors.append(f"{relative(path)}: unsafe owned generated output '{output}'")
			continue
		owned[entry["source_path"]] = entry
	return owned


def discover_and_validate(errors):
	posts_index = load_index(POSTS_INDEX, "posts", errors)
	ctf_index = load_index(CTFS_INDEX, "ctfs", errors)
	site = decode_json(SITE_JSON, errors)
	if not isinstance(site, dict):
		errors.append(f"{relative(SITE_JSON)}: expected an object")
		site = {}
	if "social" in site:
		if not isinstance(site["social"], list):
			errors.append(f"{relative(SITE_JSON)}: field 'social' must be an array of objects")
		else:
			for index, item in enumerate(site["social"]):
				if not isinstance(item, dict) or not all(isinstance(item.get(field), str) for field in ("label", "icon", "url")):
					errors.append(f"{relative(SITE_JSON)}: social entry {index} must have string 'label', 'icon', and 'url' fields")
	if "categoryBlurbs" in site and (
		not isinstance(site["categoryBlurbs"], dict)
		or not all(isinstance(key, str) and isinstance(value, str) for key, value in site["categoryBlurbs"].items())
	):
		errors.append(f"{relative(SITE_JSON)}: field 'categoryBlurbs' must be an object of string values")

	post_paths = sorted(POSTS_DIR.rglob("*.md"), key=lambda path: natural_key(path.relative_to(POSTS_DIR).as_posix()))
	discovered_posts = [path.relative_to(POSTS_DIR).as_posix() for path in post_paths]
	ordered_posts = ordered_discovered(posts_index.get("posts", []), discovered_posts)
	post_records = []
	for post_file in ordered_posts:
		path = POSTS_DIR / PurePosixPath(post_file)
		record = parse_frontmatter(path, errors)
		if record is None:
			continue
		validate_post(record, errors)
		record["kind"] = "post"
		record["route"] = post_route(post_file)
		record["output"] = relative(output_path_for(record["route"]))
		post_records.append(record)

	event_dirs = sorted(
		[path for path in CTFS_DIR.iterdir() if path.is_dir() and (path / "ctf.json").is_file()],
		key=lambda path: natural_key(path.name),
	)
	for event_dir in CTFS_DIR.iterdir():
		if event_dir.is_dir() and list(event_dir.glob("*.md")) and not (event_dir / "ctf.json").is_file():
			errors.append(f"{relative(event_dir)}: challenge Markdown directory has no ctf.json metadata")
	discovered_ctfs = [path.name for path in event_dirs]
	for old_id in ctf_index.get("ctfs", []):
		old_dir = CTFS_DIR / old_id
		if old_dir.exists() and not (old_dir / "ctf.json").is_file():
			errors.append(f"{relative(old_dir)}: CTF index references an event without ctf.json")
	ordered_ctfs = ordered_discovered(ctf_index.get("ctfs", []), discovered_ctfs)
	ctf_records = []
	challenge_records = []
	for ctf_id in ordered_ctfs:
		event_dir = CTFS_DIR / ctf_id
		if not safe_relative_name(ctf_id) or "/" in ctf_id or "\\" in ctf_id:
			errors.append(f"{relative(event_dir)}: unsafe CTF event id '{ctf_id}'")
			continue
		metadata_path = event_dir / "ctf.json"
		metadata = decode_json(metadata_path, errors)
		if not isinstance(metadata, dict):
			errors.append(f"{relative(metadata_path)}: expected an object")
			metadata = {}
		if not isinstance(metadata.get("title"), str) or not metadata.get("title", "").strip():
			errors.append(f"{relative(metadata_path)}: required field 'title' is missing or empty")
		validate_date(metadata.get("date"), relative(metadata_path), "date", errors)
		if "difficulty" in metadata:
			difficulty_value = metadata["difficulty"]
			valid_difficulty_type = (
				not isinstance(difficulty_value, bool)
				and isinstance(difficulty_value, (int, str))
				and (not isinstance(difficulty_value, str) or re.fullmatch(r"[+-]?\d+", difficulty_value.strip()))
			)
			try:
				if not valid_difficulty_type or not 0 <= int(difficulty_value) <= 5:
					raise ValueError
			except (TypeError, ValueError):
				errors.append(f"{relative(metadata_path)}: field 'difficulty' must be an integer from 0 to 5")
		declared_challenges = metadata.get("challenges")
		if not isinstance(declared_challenges, list) or not all(isinstance(item, str) and item for item in declared_challenges):
			errors.append(f"{relative(metadata_path)}: required field 'challenges' must be an array of filenames")
			declared_challenges = []
		if len(declared_challenges) != len(set(declared_challenges)):
			errors.append(f"{relative(metadata_path)}: duplicate challenge references")
		for reference in declared_challenges:
			if not safe_relative_name(reference) or PurePosixPath(reference).name != reference or not reference.lower().endswith(".md"):
				errors.append(f"{relative(metadata_path)}: invalid challenge reference '{reference}'")

		challenge_paths = sorted(event_dir.glob("*.md"), key=lambda path: natural_key(path.name))
		discovered_challenges = [path.name for path in challenge_paths]
		ordered_challenges = ordered_discovered(declared_challenges, discovered_challenges)
		event = {**metadata, "id": ctf_id, "challengeFiles": ordered_challenges, "challenges": []}
		event["source_path"] = relative(metadata_path)
		event["challengeCount"] = len(ordered_challenges)
		for challenge_file in ordered_challenges:
			source_path = event_dir / challenge_file
			record = parse_frontmatter(source_path, errors)
			if record is None:
				continue
			validate_challenge(record, ctf_id, discovered_ctfs, errors)
			record["kind"] = "writeup"
			record["ctf_id"] = ctf_id
			record["route"] = writeup_route(ctf_id, challenge_file)
			record["output"] = relative(output_path_for(record["route"]))
			event["challenges"].append(record)
			challenge_records.append(record)
		ctf_records.append(event)

	route_owners = {}
	slug_owners = {}
	for record in [*post_records, *challenge_records]:
		route_key = record["route"].casefold()
		if route_key in route_owners:
			errors.append(f"{record['source_path']}: duplicate route '{record['route']}' also produced by {route_owners[route_key]}")
		else:
			route_owners[route_key] = record["source_path"]
		slug = slugify(PurePosixPath(record["output"]).with_suffix("").as_posix())
		if slug in slug_owners:
			errors.append(f"{record['source_path']}: duplicate route slug '{slug}' also produced by {slug_owners[slug]}")
		else:
			slug_owners[slug] = record["source_path"]

	new_posts_index = {**posts_index, "posts": ordered_posts}
	new_ctfs_index = {**ctf_index, "ctfs": ordered_ctfs}
	new_event_json = {}
	for event in ctf_records:
		path = CTFS_DIR / event["id"] / "ctf.json"
		original = decode_json(path, errors)
		if isinstance(original, dict):
			new_event_json[path] = {**original, "challenges": event["challengeFiles"]}
	return {
		"site": site,
		"posts": post_records,
		"ctfs": ctf_records,
		"challenges": challenge_records,
		"posts_index": new_posts_index,
		"ctfs_index": new_ctfs_index,
		"event_json": new_event_json,
	}


def sitemap_bytes(posts, ctfs):
	urls = [f"{ORIGIN}/", f"{ORIGIN}/pages/blog.html", f"{ORIGIN}/pages/search.html", f"{ORIGIN}/pages/ctf.html"]
	urls.extend(f"{ORIGIN}{post['route']}" for post in posts)
	for ctf in ctfs:
		urls.append(f"{ORIGIN}/pages/ctf.html?{urlencode({'ctf': ctf['id']})}")
		urls.extend(f"{ORIGIN}{challenge['route']}" for challenge in ctf["challenges"])
	urlset = ET.Element(f"{{{SITEMAP_NAMESPACE}}}urlset")
	for url in urls:
		entry = ET.SubElement(urlset, f"{{{SITEMAP_NAMESPACE}}}url")
		ET.SubElement(entry, f"{{{SITEMAP_NAMESPACE}}}loc").text = url
	ET.indent(urlset, space="  ")
	from io import BytesIO
	stream = BytesIO()
	ET.ElementTree(urlset).write(stream, encoding="utf-8", xml_declaration=True)
	return stream.getvalue() + b"\n"


def json_bytes(value):
	return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def json_file_equals(path, expected):
	if not path.is_file():
		return False
	try:
		return json.loads(path.read_text(encoding="utf-8")) == expected
	except (OSError, UnicodeError, json.JSONDecodeError):
		return False


def sitemap_file_equals(path, expected):
	if not path.is_file():
		return False
	try:
		return path.read_bytes() == expected
	except OSError:
		return False


def build_manifest(records):
	sources = []
	for record in records:
		sources.append({
			"source_path": record["source_path"],
			"sha256": record["sha256"],
			"generated_output": record["output"],
			"compiler_version": COMPILER_VERSION,
			"kind": record["kind"],
		})
	return {"manifest_version": MANIFEST_VERSION, "compiler": COMPILER_NAME, "sources": sources}


def expected_output_for_source(source, kind):
	parts = PurePosixPath(source)
	if kind == "post" and parts.parts[:2] == ("content", "posts") and len(parts.parts) > 2:
		return (PurePosixPath("generated/posts") / parts.relative_to("content/posts").with_suffix(".html")).as_posix()
	if kind == "writeup" and parts.parts[:2] == ("content", "ctfs") and len(parts.parts) == 4:
		return (PurePosixPath("generated/writeups") / parts.parts[2] / PurePosixPath(parts.name).with_suffix(".html")).as_posix()
	return None


def load_old_manifest(errors):
	if not COMPILER_MANIFEST.exists():
		return {"sources": []}
	data = decode_json(COMPILER_MANIFEST, errors)
	if not isinstance(data, dict) or not isinstance(data.get("sources"), list):
		errors.append(f"{relative(COMPILER_MANIFEST)}: malformed compiler manifest")
		return {"sources": []}
	if data.get("compiler") != COMPILER_NAME or data.get("manifest_version") != MANIFEST_VERSION:
		errors.append(f"{relative(COMPILER_MANIFEST)}: unknown compiler or unsupported manifest version")
		return {"sources": []}
	seen_sources = set()
	seen_outputs = set()
	for entry in data["sources"]:
		if not isinstance(entry, dict):
			errors.append(f"{relative(COMPILER_MANIFEST)}: malformed source ownership entry")
			continue
		source = entry.get("source_path")
		output = entry.get("generated_output")
		digest = entry.get("sha256")
		if not isinstance(source, str) or not source.startswith("content/") or not source.lower().endswith(".md") or not safe_relative_name(source):
			errors.append(f"{relative(COMPILER_MANIFEST)}: invalid owned source path '{source}'")
		if not isinstance(output, str) or not output.startswith("generated/") or not safe_relative_name(output):
			errors.append(f"{relative(COMPILER_MANIFEST)}: invalid owned generated output '{output}'")
		if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
			errors.append(f"{relative(COMPILER_MANIFEST)}: invalid SHA-256 for source '{source}'")
		if entry.get("kind") not in ("post", "writeup"):
			errors.append(f"{relative(COMPILER_MANIFEST)}: invalid content kind for source '{source}'")
		expected_output = expected_output_for_source(source, entry.get("kind")) if isinstance(source, str) else None
		if expected_output is None:
			errors.append(f"{relative(COMPILER_MANIFEST)}: source path does not match content kind for '{source}'")
		elif output != expected_output:
			errors.append(f"{relative(COMPILER_MANIFEST)}: generated output does not match source '{source}'")
		if source in seen_sources:
			errors.append(f"{relative(COMPILER_MANIFEST)}: duplicate source ownership '{source}'")
		if output in seen_outputs:
			errors.append(f"{relative(COMPILER_MANIFEST)}: duplicate output ownership '{output}'")
		seen_sources.add(source)
		seen_outputs.add(output)
	return data


def render_record(record, site, ctf_by_id):
	if record["kind"] == "post":
		return render_post(record, site).encode("utf-8")
	ctf = ctf_by_id[record["ctf_id"]]
	return render_writeup(ctf, record, ctf["challengeFiles"], site).encode("utf-8")


def stage_file(target, data, staged):
	target.parent.mkdir(parents=True, exist_ok=True)
	descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
	temporary = Path(temporary_name)
	try:
		with os.fdopen(descriptor, "wb") as handle:
			handle.write(data)
			handle.flush()
			os.fsync(handle.fileno())
	except Exception:
		temporary.unlink(missing_ok=True)
		raise
	staged.append((temporary, target))


def report(stats, check_mode, clean_mode, pending):
	print("## CONTENT BUILD")
	print("Posts:")
	for key in ("new", "changed", "unchanged", "deleted"):
		print(f"{key}: {stats['posts'][key]}")
	print("CTF:")
	for key in ("new", "changed", "unchanged", "deleted"):
		print(f"{key}: {stats['ctf'][key]}")
	print("HTML:")
	print(f"generated: {stats['html_generated']}")
	print(f"skipped: {stats['html_skipped']}")
	print(f"removed: {stats['html_removed']}")
	print(f"Indexes: {'updated' if stats['indexes_updated'] else 'unchanged'}")
	print(f"Sitemap: {'updated' if stats['sitemap_updated'] else 'unchanged'}")
	print(f"Validation: {'PASS' if stats['validation_passed'] else 'FAIL'}")
	if clean_mode:
		print("Cache: invalidated; compiler-owned outputs regenerated")
	if check_mode:
		print(f"Dry-run: no files modified ({len(pending)} planned writes/removals)")


def main(argv=None):
	parser = argparse.ArgumentParser(description="Incremental Markdown content compiler")
	mode = parser.add_mutually_exclusive_group()
	mode.add_argument("--check", action="store_true", help="validate and show planned changes without writing")
	mode.add_argument("--clean", action="store_true", help="invalidate compile cache and regenerate compiler-owned HTML")
	args = parser.parse_args(argv)

	errors = []
	model = discover_and_validate(errors)
	old_manifest = load_old_manifest(errors)
	if errors:
		for error in errors:
			print(f"ERROR: {error}", file=sys.stderr)
		print("Validation: FAIL", file=sys.stderr)
		return 2

	records = [*model["posts"], *model["challenges"]]
	old_entries = {entry["source_path"]: entry for entry in old_manifest.get("sources", []) if isinstance(entry, dict) and isinstance(entry.get("source_path"), str)}
	current_sources = {record["source_path"] for record in records}
	deleted_entries = [entry for source, entry in old_entries.items() if source not in current_sources]
	ctf_by_id = {ctf["id"]: ctf for ctf in model["ctfs"]}
	new_manifest = build_manifest(records)

	stats = {
		"posts": {"new": 0, "changed": 0, "unchanged": 0, "deleted": 0},
		"ctf": {"new": 0, "changed": 0, "unchanged": 0, "deleted": 0},
		"html_generated": 0,
		"html_skipped": 0,
		"html_removed": len(deleted_entries),
		"indexes_updated": False,
		"sitemap_updated": False,
		"validation_passed": True,
	}
	for entry in deleted_entries:
		if entry.get("kind") == "post":
			stats["posts"]["deleted"] += 1
		elif entry.get("kind") == "writeup":
			stats["ctf"]["deleted"] += 1
	staged_data = {}
	output_paths = set()
	for record in records:
		output_path = ROOT / record["output"]
		if output_path in output_paths:
			errors.append(f"{record['source_path']}: conflicting output path {record['output']}")
		output_paths.add(output_path)
		old = old_entries.get(record["source_path"])
		if old is None:
			stats["posts" if record["kind"] == "post" else "ctf"]["new"] += 1
		elif old.get("sha256") != record["sha256"] or old.get("compiler_version") != COMPILER_VERSION or old.get("generated_output") != record["output"]:
			stats["posts" if record["kind"] == "post" else "ctf"]["changed"] += 1
		else:
			stats["posts" if record["kind"] == "post" else "ctf"]["unchanged"] += 1
		needs_compile = args.clean or old is None or old.get("sha256") != record["sha256"] or old.get("compiler_version") != COMPILER_VERSION or old.get("generated_output") != record["output"] or not output_path.is_file()
		if needs_compile:
			output = render_record(record, model["site"], ctf_by_id)
			stats["html_generated"] += 1
			if not output_path.is_file() or output_path.read_bytes() != output:
				staged_data[output_path] = output
		else:
			stats["html_skipped"] += 1

	for entry in deleted_entries:
		output = entry.get("generated_output")
		if not isinstance(output, str) or not output.startswith("generated/") or not safe_relative_name(output):
			errors.append(f"{relative(COMPILER_MANIFEST)}: refusing unsafe stale output '{output}'")
			continue
		stale_path = (ROOT / output).resolve()
		try:
			stale_path.relative_to(GENERATED.resolve())
		except ValueError:
			errors.append(f"{relative(COMPILER_MANIFEST)}: refusing stale output outside generated/: '{output}'")
			continue
		if stale_path not in output_paths and stale_path.is_file():
			pass

	index_models = {
		POSTS_INDEX: model["posts_index"],
		CTFS_INDEX: model["ctfs_index"],
		**model["event_json"],
	}
	index_targets = {
		path: json_bytes(value)
		for path, value in index_models.items()
		if not json_file_equals(path, value)
	}
	article_routes = [record["output"] for record in records]
	articles_manifest = json_bytes(article_routes)
	sitemap_data = sitemap_bytes(model["posts"], model["ctfs"])
	try:
		ET.fromstring(sitemap_data)
	except ET.ParseError as error:
		errors.append(f"sitemap.xml: generated XML is invalid ({error})")
	legacy_routes_updated = not json_file_equals(LEGACY_ROUTE_MANIFEST, article_routes)
	stats["indexes_updated"] = bool(index_targets) or legacy_routes_updated
	stats["sitemap_updated"] = not sitemap_file_equals(SITEMAP, sitemap_data)

	manifest_data = json_bytes(new_manifest)
	planned_writes = dict(staged_data)
	planned_writes.update(index_targets)
	if legacy_routes_updated:
		planned_writes[LEGACY_ROUTE_MANIFEST] = articles_manifest
	if stats["sitemap_updated"]:
		planned_writes[SITEMAP] = sitemap_data
	if not COMPILER_MANIFEST.exists() or COMPILER_MANIFEST.read_bytes() != manifest_data:
		planned_writes[COMPILER_MANIFEST] = manifest_data
	planned_removals = []
	for entry in deleted_entries:
		output = entry.get("generated_output")
		if isinstance(output, str):
			stale = (ROOT / output).resolve()
			if stale not in output_paths and stale.is_file():
				planned_removals.append(stale)

	if errors:
		for error in errors:
			print(f"ERROR: {error}", file=sys.stderr)
		print("Validation: FAIL", file=sys.stderr)
		return 2

	pending = [*planned_writes, *planned_removals]
	if not args.check:
		staged = []
		try:
			for target, data in planned_writes.items():
				stage_file(target, data, staged)
			for temporary, target in staged:
				os.replace(temporary, target)
			for target in planned_removals:
				target.unlink(missing_ok=True)
		except Exception as error:
			for temporary, _ in staged:
				temporary.unlink(missing_ok=True)
			print(f"ERROR: atomic output update failed: {error}", file=sys.stderr)
			return 3

	report(stats, args.check, args.clean, pending)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
