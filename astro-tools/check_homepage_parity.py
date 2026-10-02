import json
import re
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from compare_output import Node, find_all, find_first, parse_document, start_server, text_content


ROOT = Path(__file__).resolve().parents[1]


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def fetch(url):
    try:
        with urlopen(url) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError:
        return 0, b""


def children(node):
    return [child for child in node.children if isinstance(child, Node)]


def by_class(node, class_name, tag=None):
    return find_first(
        node,
        lambda item: item.tag == (tag or item.tag)
        and class_name in item.attrs.get("class", "").split(),
    )


def descendants(node, predicate):
    return find_all(node, predicate)


def direct_text(node, tag, class_name=None):
    item = next(
        (
            child
            for child in children(node)
            if child.tag == tag
            and (class_name is None or class_name in child.attrs.get("class", "").split())
        ),
        None,
    )
    return text_content(item).strip() if item else ""


def feature_fields(node):
    quest_meta = by_class(node, "quest-meta", "div")
    meta_children = children(quest_meta) if quest_meta else []
    spans = [item for item in meta_children if item.tag == "span"]
    title = next((item for item in children(node) if item.tag == "h3"), None)
    paragraphs = [item for item in children(node) if item.tag == "p"]
    return {
        "href": node.attrs.get("href", ""),
        "aria_label": node.attrs.get("aria-label", ""),
        "type": text_content(paragraphs[0]).strip() if paragraphs else "",
        "title": text_content(title).strip() if title else "",
        "description": text_content(paragraphs[1]).strip() if len(paragraphs) > 1 else "",
        "date": text_content(spans[0]).strip() if spans else "",
        "category": text_content(spans[1]).strip() if len(spans) > 1 else "",
    }


def shape(node):
    nested = [] if "data-social" in node.attrs else [shape(child) for child in children(node)]
    return (
        node.tag,
        tuple(node.attrs.get("class", "").split()),
        tuple(nested),
    )


def parse_frontmatter(relative_path):
    source = (ROOT / "content" / relative_path).read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n?", source)
    if not match:
        return {}
    fields = {}
    for line in match.group(1).split("\n"):
        parts = line.split(":")
        key = parts[0].strip()
        fields[key] = ":".join(parts[1:]).strip().replace("[", "", 1).removesuffix("]")
    return fields


def encode_component(value):
    return quote(value, safe="~!*'()-._")


def post_url(file):
    html_file = re.sub(r"\.md$", ".html", file, flags=re.IGNORECASE)
    return "/generated/posts/" + "/".join(encode_component(part) for part in html_file.split("/"))


def writeup_url(ctf_id, file):
    html_file = re.sub(r"\.md$", ".html", file, flags=re.IGNORECASE)
    return f"/generated/writeups/{encode_component(ctf_id)}/{encode_component(html_file)}"


def select_latest():
    post_index = json.loads((ROOT / "content/posts/index.json").read_text(encoding="utf-8"))
    ctf_index = json.loads((ROOT / "content/ctfs/index.json").read_text(encoding="utf-8"))
    posts = []
    for file in post_index["posts"]:
        fields = parse_frontmatter(Path("posts") / file)
        posts.append(
            {
                "identity": f"posts/{file}",
                "type": "POST",
                "title": fields.get("title", ""),
                "description": fields.get("description", ""),
                "href": post_url(file),
                "date": fields.get("date", ""),
                "category": fields.get("category") or "ARCHIVE",
            }
        )

    writeups = []
    for ctf_id in ctf_index["ctfs"]:
        event = json.loads(
            (ROOT / "content/ctfs" / ctf_id / "ctf.json").read_text(encoding="utf-8")
        )
        for file in event.get("challenges", []):
            fields = parse_frontmatter(Path("ctfs") / ctf_id / file)
            writeups.append(
                {
                    "identity": f"ctfs/{ctf_id}/{file}",
                    "type": "WRITEUP",
                    "title": fields.get("title") or Path(file).stem,
                    "description": fields.get("description") or f"Writeup from {event['title']}.",
                    "href": writeup_url(ctf_id, file),
                    "date": event.get("date", ""),
                    "category": fields.get("category") or event["title"],
                }
            )

    posts.sort(key=lambda item: date.fromisoformat(item["date"]), reverse=True)
    writeups.sort(key=lambda item: date.fromisoformat(item["date"]), reverse=True)
    return {
        "latest_post": posts[0] if posts else None,
        "latest_writeup": writeups[0] if writeups else None,
        "featured": (writeups[0] if writeups else None) or (posts[0] if posts else None),
    }


def social_projection(site):
    result = []
    for item in site.get("social", []):
        valid = re.match(r"^(https?:|mailto:)", item.get("url", ""), re.IGNORECASE) is not None
        external = valid and not item["url"].startswith("mailto:")
        result.append(
            {
                "tag": "a" if valid else "span",
                "class": "social-link" if valid else "social-link is-pending",
                "href": item["url"] if valid else None,
                "aria_label": item["label"] if valid else f"{item['label']} · coming soon",
                "title": None if valid else f"{item['label']} · coming soon",
                "icon": item["icon"],
                "external": external,
            }
        )
    return result


def actual_social(root):
    nav = find_first(root, lambda node: node.tag == "nav" and "data-social" in node.attrs)
    result = []
    for item in children(nav) if nav else []:
        icon = find_first(item, lambda node: node.tag == "span" and node.attrs.get("aria-hidden") == "true")
        result.append(
            {
                "tag": item.tag,
                "class": item.attrs.get("class", ""),
                "href": item.attrs.get("href"),
                "aria_label": item.attrs.get("aria-label"),
                "title": item.attrs.get("title"),
                "icon": text_content(icon).strip() if icon else "",
                "external": item.attrs.get("target") == "_blank"
                and item.attrs.get("rel") == "noopener",
            }
        )
    return result


def metadata(root):
    title = find_first(root, lambda node: node.tag == "title")
    canonical = find_first(root, lambda node: node.tag == "link" and node.attrs.get("rel") == "canonical")
    description = find_first(root, lambda node: node.tag == "meta" and node.attrs.get("name") == "description")
    og = find_first(root, lambda node: node.tag == "meta" and node.attrs.get("property") == "og:title")
    return {
        "title": text_content(title).strip() if title else "",
        "canonical": canonical.attrs.get("href", "") if canonical else "",
        "description": description.attrs.get("content", "") if description else "",
        "og_title": og.attrs.get("content", "") if og else "",
    }


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--astro-url", default="http://127.0.0.1:4322")
    args = parser.parse_args()

    legacy_server, legacy_url = start_server(ROOT)
    try:
        legacy_status, legacy_body = fetch(f"{legacy_url}/index.html")
        astro_status, astro_body = fetch(f"{args.astro_url.rstrip('/')}/")
    finally:
        legacy_server.shutdown()
        legacy_server.server_close()

    legacy_root = parse_document(legacy_body.decode("utf-8"))
    astro_root = parse_document(astro_body.decode("utf-8"))
    legacy_main = find_first(legacy_root, lambda node: node.tag == "main")
    astro_main = find_first(astro_root, lambda node: node.tag == "main")
    legacy_primary = find_first(
        legacy_root,
        lambda node: node.tag == "a" and "feature-tile--primary" in node.attrs.get("class", "").split(),
    )
    astro_primary = find_first(
        astro_root,
        lambda node: node.tag == "a" and "feature-tile--primary" in node.attrs.get("class", "").split(),
    )
    legacy_cards = descendants(
        legacy_root,
        lambda node: node.tag == "a" and "feature-tile" in node.attrs.get("class", "").split(),
    )
    astro_cards = descendants(
        astro_root,
        lambda node: node.tag == "a" and "feature-tile" in node.attrs.get("class", "").split(),
    )

    projection = select_latest()
    selected = projection["featured"]
    legacy_feature = feature_fields(legacy_primary) if legacy_primary else {}
    astro_feature = feature_fields(astro_primary) if astro_primary else {}
    expected_feature = None
    if selected:
        expected_feature = {
            "href": selected["href"],
            "aria_label": f"Read the latest {selected['type'].lower()}: {selected['title']}",
            "type": f"LATEST {selected['type']}",
            "title": selected["title"],
            "description": selected["description"],
            "date": selected["date"],
            "category": selected["category"].upper(),
        }
        parsed_date = date.fromisoformat(selected["date"])
        expected_feature["date"] = f"{parsed_date.strftime('%b').upper()} {parsed_date.day}, {parsed_date.year}"
    elif legacy_feature:
        expected_feature = legacy_feature.copy()

    legacy_expected = legacy_feature.copy()
    if selected and legacy_expected:
        legacy_expected["href"] = selected["href"]
        legacy_expected["aria_label"] = f"Read the latest {selected['type'].lower()}: {selected['title']}"

    site = json.loads((ROOT / "content/site.json").read_text(encoding="utf-8"))
    expected_social = social_projection(site)
    current_year = str(datetime.now().year)
    legacy_year = find_first(legacy_root, lambda node: node.tag == "span" and node.attrs.get("id") == "year")
    astro_year = find_first(astro_root, lambda node: node.tag == "span" and node.attrs.get("id") == "year")
    legacy_grid = by_class(legacy_root, "status-panel-grid", "div")
    astro_grid = by_class(astro_root, "status-panel-grid", "div")

    legacy_secondary = [feature_fields(item) for item in legacy_cards[1:]]
    astro_secondary = [feature_fields(item) for item in astro_cards[1:]]
    legacy_meta = metadata(legacy_root)
    astro_meta = metadata(astro_root)
    home_js = any(
        node.tag == "script" and "home.js" in node.attrs.get("src", "")
        for node in descendants(astro_root, lambda item: item.tag == "script")
    )
    legacy_home_js = any(
        node.tag == "script" and "home.js" in node.attrs.get("src", "")
        for node in descendants(legacy_root, lambda item: item.tag == "script")
    )

    checks = {
        "http_200": legacy_status == 200 and astro_status == 200,
        "featured_projection": bool(astro_primary and astro_feature == expected_feature),
        "legacy_feature_parity": bool(legacy_primary and astro_feature == legacy_expected),
        "dom_structure": bool(legacy_main and astro_main and shape(legacy_main) == shape(astro_main)),
        "secondary_tiles": len(legacy_secondary) == len(astro_secondary) and legacy_secondary == astro_secondary,
        "social_links": actual_social(astro_root) == expected_social,
        "year": bool(astro_year and text_content(astro_year).strip() == current_year),
        "metadata": legacy_meta == astro_meta,
        "legacy_keeps_home_js": legacy_home_js,
        "astro_home_independent": not home_js,
    }
    report = {
        "legacy_status": legacy_status,
        "astro_status": astro_status,
        "astro_url": args.astro_url,
        "latest_post": projection["latest_post"]["identity"] if projection["latest_post"] else None,
        "latest_writeup": projection["latest_writeup"]["identity"] if projection["latest_writeup"] else None,
        "featured_identity": selected["identity"] if selected else "legacy static fallback",
        "featured_legacy": legacy_feature,
        "featured_astro": astro_feature,
        "expected_social": expected_social,
        "astro_social": actual_social(astro_root),
        "year": {"legacy_runtime_expected": current_year, "astro": text_content(astro_year).strip() if astro_year else ""},
        "feature_count": {"legacy": len(legacy_cards), "astro": len(astro_cards)},
        "status_panel_grid_dom_match": bool(legacy_grid and astro_grid and shape(legacy_grid) == shape(astro_grid)),
        "empty_fallback_testable_with_current_data": selected is None,
        "checks": checks,
        "failure_count": sum(not passed for passed in checks.values()),
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if report["failure_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()