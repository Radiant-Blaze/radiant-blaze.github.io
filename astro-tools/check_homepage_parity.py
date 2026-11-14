"""Verify the built homepage against the authored content that drives it.

The Astro homepage is a projection of `content/`: `posts/index.json` together
with each event's `ctf.json` choose the feature tiles, `site.json` supplies the
social links, and the footer year is stamped at build time. This check reads the
rendered page back over HTTP and asserts that projection, plus the head and
shell-independence contracts the page promises.

This replaces a migration-era "legacy vs Astro" comparison. The pre-Astro
homepage still exists under `backup/`, but it is a frozen archive with a
pre-revamp DOM (`h3` tile titles, and a `data-social` nav that `home.js` filled
in at runtime), and `.agents/DECISIONS.md` keeps `backup/` out of the build and
validation graph. Comparing the two can no longer pass by design, so only the
contracts that describe the current page are asserted here.

Needs a running preview of the build:

    npm run preview
    python astro-tools/check_homepage_parity.py
    npm run check:homepage-parity
"""
import argparse
import json
import os
import re
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from compare_output import Node, find_all, find_first, parse_document, text_content


ROOT = Path(__file__).resolve().parents[1]
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")
# `encodeURIComponent` leaves these unescaped, while `quote` would escape `!'()*`.
URI_SAFE = "!'()*-._~"
# The static third tile, and the literal fallback `index.astro` renders when no
# content is published (it carries a preformatted date label, not a Date).
SEARCH_TILE = {
    "href": "pages/search.html",
    "aria_label": "Search the archive",
    "type": "SEARCH ARCHIVE",
    "title": "Search the archive",
}
FALLBACK_FEATURE = {
    "type": "WRITEUP",
    "title": "Hackel",
    "description": "Recover the flag by identifying a leaked one-bit classification rule from the training samples and decoding the resulting 496-bit stream as ASCII.",
    "href": "/generated/writeups/ASIS-CTF-2026/Hackel.html",
    "category": "CRYPTO",
}
FALLBACK_DATE_LABEL = "AUG 29, 2026"


def encode_segment(value):
    return quote(value, safe=URI_SAFE)


def encode_path(value):
    return "/".join(encode_segment(segment) for segment in value.split("/"))


def children(node):
    return [child for child in node.children if isinstance(child, Node)]


def matches_contract(rendered, expected):
    """Compare the fields a tile contract defines, ignoring any extras.

    The static search tile only promises href/aria-label/type/title, while the
    content tiles are pinned field-for-field.
    """
    return all(rendered.get(key) == value for key, value in expected.items())


def parse_frontmatter(relative_path):
    source = (ROOT / "content" / relative_path).read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n?", source)
    if not match:
        return {}
    fields = {}
    for line in match.group(1).split("\n"):
        parts = line.split(":")
        fields[parts[0].strip()] = ":".join(parts[1:]).strip().replace("[", "", 1).removesuffix("]")
    return fields


def format_date(value):
    parsed = date.fromisoformat(value)
    return f"{MONTHS[parsed.month - 1]} {parsed.day}, {parsed.year}"


def page_url(prefix, value):
    return f"/{prefix}/{encode_path(re.sub(r'\.md$', '', value, flags=re.IGNORECASE) + '.html')}"


def newest(items):
    # `home-selection.ts` sorts newest-first with a stable sort, so the authored
    # index order still breaks ties; `sorted` is stable in the same way.
    return sorted(items, key=lambda item: item["date"], reverse=True)[0] if items else None


def homepage_projection():
    """Mirror `src/lib/home-data.ts` + `src/lib/home-selection.ts`."""
    posts_index = json.loads((ROOT / "content/posts/index.json").read_text(encoding="utf-8"))
    ctfs_index = json.loads((ROOT / "content/ctfs/index.json").read_text(encoding="utf-8"))

    posts = []
    for file in posts_index["posts"]:
        fields = parse_frontmatter(Path("posts") / file)
        posts.append(
            {
                "type": "POST",
                "title": fields.get("title", ""),
                "description": fields.get("description", ""),
                "href": page_url("generated/posts", file),
                "date": fields.get("date", ""),
                "category": fields.get("category") or "ARCHIVE",
            }
        )

    writeups = []
    for ctf_id in ctfs_index["ctfs"]:
        event = json.loads((ROOT / "content/ctfs" / ctf_id / "ctf.json").read_text(encoding="utf-8"))
        for file in event["challenges"]:
            fields = parse_frontmatter(Path("ctfs") / ctf_id / file)
            writeups.append(
                {
                    "type": "WRITEUP",
                    "title": fields.get("title") or Path(file).stem,
                    "description": fields.get("description") or f"Writeup from {event['title']}.",
                    "href": f"/generated/writeups/{encode_segment(ctf_id)}"
                    f"/{encode_path(re.sub(r'\.md$', '', file, flags=re.IGNORECASE) + '.html')}",
                    "date": event.get("date", ""),
                    "category": fields.get("category") or event["title"],
                }
            )

    latest_post = newest(posts)
    latest_writeup = newest(writeups)
    return {"latest_post": latest_post, "latest_writeup": latest_writeup, "featured": latest_writeup or latest_post}


def expected_tile(feature, date_label=None):
    return {
        "href": feature["href"],
        "aria_label": f"Read the latest {feature['type'].lower()}: {feature['title']}",
        "type": f"LATEST {feature['type']}",
        "title": feature["title"],
        "description": feature["description"],
        "date": date_label or format_date(feature["date"]),
        "category": feature["category"].upper(),
    }


def tile_fields(node):
    number = find_first(
        node, lambda item: item.tag == "p" and "quest-number" in item.attrs.get("class", "").split()
    )
    heading = find_first(node, lambda item: item.tag in ("h2", "h3"))
    meta = find_first(
        node, lambda item: item.tag == "div" and "quest-meta" in item.attrs.get("class", "").split()
    )
    spans = [item for item in children(meta) if item.tag == "span"] if meta else []
    body = [
        item
        for item in children(node)
        if item.tag == "p" and "quest-number" not in item.attrs.get("class", "").split()
    ]
    return {
        "href": node.attrs.get("href", ""),
        "aria_label": node.attrs.get("aria-label", ""),
        "type": text_content(number).strip() if number else "",
        "title": text_content(heading).strip() if heading else "",
        "description": text_content(body[0]).strip() if body else "",
        "date": text_content(spans[0]).strip() if spans else "",
        "category": text_content(spans[1]).strip() if len(spans) > 1 else "",
    }


def expected_social(site):
    """Mirror `socialLinksHtml()`: valid URLs become links, others go on standby."""
    expected = []
    for item in site.get("social", []):
        url = item.get("url", "")
        valid = re.match(r"^(https?:|mailto:)", url, re.IGNORECASE) is not None
        external = valid and not url.startswith("mailto:")
        expected.append(
            {
                "tag": "a" if valid else "span",
                "class": "social-link" if valid else "social-link is-pending",
                "href": url if valid else None,
                "label": item["label"],
                "kind": "STANDBY" if not valid else ("OPEN LINK" if external else "SEND NOTE"),
                "pending_note": None if valid else f"{item['label']} · coming soon",
                "external": external,
                "has_icon": True,
            }
        )
    return expected


def actual_social(root):
    nav = find_first(root, lambda item: item.tag == "nav" and "data-social" in item.attrs)
    rendered = []
    for item in children(nav) if nav else []:
        label = find_first(
            item, lambda child: child.tag == "span" and "social-label" in child.attrs.get("class", "").split()
        )
        kind = find_first(
            item, lambda child: child.tag == "span" and "social-kind" in child.attrs.get("class", "").split()
        )
        icon = find_first(
            item, lambda child: child.tag == "span" and "social-icon" in child.attrs.get("class", "").split()
        )
        rendered.append(
            {
                "tag": item.tag,
                "class": " ".join(item.attrs.get("class", "").split()),
                "href": item.attrs.get("href"),
                "label": text_content(label).strip() if label else "",
                "kind": text_content(kind).strip() if kind else "",
                "pending_note": item.attrs.get("aria-label"),
                "external": item.attrs.get("target") == "_blank" and item.attrs.get("rel") == "noopener",
                "has_icon": icon is not None and find_first(icon, lambda child: child.tag == "svg") is not None,
            }
        )
    return rendered


def page_metadata(root):
    def find(tag, attribute, value):
        return find_first(root, lambda item: item.tag == tag and item.attrs.get(attribute) == value)

    heading = find_first(root, lambda item: item.tag == "title")
    canonical = find("link", "rel", "canonical")
    description = find("meta", "name", "description")
    og_title = find("meta", "property", "og:title")
    return {
        "title": text_content(heading).strip() if heading else "",
        "canonical": canonical.attrs.get("href", "") if canonical else "",
        "description": description.attrs.get("content", "") if description else "",
        "og_title": og_title.attrs.get("content", "") if og_title else "",
    }


def read_site_url():
    match = re.search(r'site:\s*"([^"]+)"', (ROOT / "astro.config.mjs").read_text(encoding="utf-8"))
    if not match:
        raise SystemExit("astro.config.mjs does not declare a `site`.")
    return f"{match.group(1).rstrip('/')}/"


def fetch(url):
    try:
        with urlopen(url) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError:
        return 0, b""


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--astro-url",
        default=os.environ.get("ASTRO_PREVIEW_URL", "http://127.0.0.1:4321"),
        help="Base URL of the running preview (default $ASTRO_PREVIEW_URL or http://127.0.0.1:4321).",
    )
    args = parser.parse_args()

    status, body = fetch(f"{args.astro_url.rstrip('/')}/")
    root = parse_document(body.decode("utf-8", errors="replace"))
    projection = homepage_projection()
    site = json.loads((ROOT / "content/site.json").read_text(encoding="utf-8"))

    tiles = [
        tile_fields(node)
        for node in find_all(
            root, lambda item: item.tag == "a" and "feature-tile" in item.attrs.get("class", "").split()
        )
    ]
    expected_tiles = [
        expected_tile(
            projection["featured"] or FALLBACK_FEATURE,
            None if projection["featured"] else FALLBACK_DATE_LABEL,
        )
    ]
    if projection["latest_post"]:
        expected_tiles.append(expected_tile(projection["latest_post"]))
    expected_tiles.append(SEARCH_TILE)

    year_node = find_first(root, lambda item: item.tag == "span" and item.attrs.get("id") == "year")
    rendered_year = text_content(year_node).strip() if year_node else ""
    metadata = page_metadata(root)
    expected_social_links = expected_social(site)
    rendered_social = actual_social(root)
    loads_home_js = any(
        "home.js" in item.attrs.get("src", "")
        for item in find_all(root, lambda item: item.tag == "script")
    )

    checks = {
        "http_200": status == 200,
        "tile_count": len(tiles) == len(expected_tiles),
        **{
            f"tile:{expected['type'].lower().replace(' ', '_')}": matches_contract(rendered, expected)
            for rendered, expected in zip(tiles, expected_tiles)
        },
        "social_links": rendered_social == expected_social_links,
        "year": rendered_year == str(date.today().year),
        "canonical": metadata["canonical"] == read_site_url(),
        "metadata_present": bool(metadata["title"] and metadata["description"] and metadata["og_title"]),
        "home_independent_of_legacy_js": not loads_home_js,
    }

    report = {
        "astro_url": args.astro_url,
        "status": status,
        "featured_identity": (projection["featured"] or FALLBACK_FEATURE)["title"],
        "featured_source": "content" if projection["featured"] else "index.astro fallback",
        "expected_tiles": expected_tiles,
        "rendered_tiles": tiles,
        "expected_social": expected_social_links,
        "rendered_social": rendered_social,
        "year": {"expected": str(date.today().year), "rendered": rendered_year},
        "metadata": metadata,
        "checks": checks,
        "failure_count": sum(not passed for passed in checks.values()),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if report["failure_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
