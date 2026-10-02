import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import urlopen

from compare_output import article_facts, start_server


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ARTICLE_MANIFEST = ROOT / "generated/.article-pages.json"
COPIED_ROOT_FILES = ["favicon.svg", "og-image.png", "robots.txt", "sitemap.xml", ".nojekyll"]
SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"
SHELL_ROUTES = [
    "/",
    "/404.html",
    "/pages/blog.html",
    "/pages/ctf.html",
    "/pages/search.html",
    "/pages/archive.html",
    "/pages/post.html",
    "/pages/writeup.html",
]


def request(base_url, route):
    path, separator, query = route.partition("?")
    url = f"{base_url}/{quote(path.lstrip('/'), safe='/')}"
    if separator:
        url += f"?{query}"
    try:
        with urlopen(url) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError:
        return 0, b""


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def normalize_line_endings(value):
    return value.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def main():
    articles = json.loads(ARTICLE_MANIFEST.read_text(encoding="utf-8"))
    ctf_ids = json.loads((ROOT / "content/ctfs/index.json").read_text(encoding="utf-8"))["ctfs"]
    event_routes = [
        f"/pages/ctf.html?{urlencode({'ctf': ctf_id})}" for ctf_id in ctf_ids
    ]
    query_routes = [
        "/pages/post.html?" + urlencode({"post": "linux/021-tiny-command-line-toolkit.md"}),
        "/pages/writeup.html?" + urlencode({"ctf": ctf_ids[0], "challenge": "chall1-Great-Snakes.md"}),
    ]
    expected_routes = [*SHELL_ROUTES, *articles, *event_routes, *query_routes]
    old_server, old_url = start_server(ROOT)
    astro_server, astro_url = start_server(DIST)
    failures = []
    checked = 0
    status_counts = {"baseline": {}, "astro": {}}

    try:
        for route in expected_routes:
            old_status, old_body = request(old_url, route)
            astro_status, astro_body = request(astro_url, route)
            checked += 1
            for label, status in (("baseline", old_status), ("astro", astro_status)):
                key = str(status)
                status_counts[label][key] = status_counts[label].get(key, 0) + 1
            if old_status != 200 or astro_status != 200:
                failures.append({"category": "route_status", "path": route, "baseline": old_status, "astro": astro_status})
                continue

            if route in SHELL_ROUTES or route in articles:
                old_facts = article_facts(old_body.decode("utf-8"))
                astro_facts = article_facts(astro_body.decode("utf-8"))
                for field in ("title", "canonical", "metadata"):
                    if old_facts[field] != astro_facts[field]:
                        failures.append(
                            {
                                "category": field,
                                "path": route,
                                "baseline": old_facts[field],
                                "astro": astro_facts[field],
                            }
                        )

        source_files = [
            file.relative_to(ROOT).as_posix()
            for directory in (ROOT / "assets", ROOT / "content")
            for file in directory.rglob("*")
            if file.is_file()
        ]
        source_files.extend(COPIED_ROOT_FILES)
        asset_checks = 0
        for relative in source_files:
            old_status, old_body = request(old_url, f"/{relative}")
            astro_status, astro_body = request(astro_url, f"/{relative}")
            asset_checks += 1
            if old_status != 200 or astro_status != 200:
                failures.append({"category": "asset_status", "path": relative, "baseline": old_status, "astro": astro_status})
            elif relative != "sitemap.xml" and sha256(old_body) != sha256(astro_body):
                failures.append({"category": "asset_bytes", "path": relative})
    finally:
        old_server.shutdown()
        astro_server.shutdown()
        old_server.server_close()
        astro_server.server_close()

    old_sitemap = (ROOT / "sitemap.xml").read_bytes()
    astro_sitemap = (DIST / "sitemap.xml").read_bytes()
    old_sitemap_root = ET.fromstring(old_sitemap)
    astro_sitemap_root = ET.fromstring(astro_sitemap)
    sitemap_path = f"{{{SITEMAP_NAMESPACE}}}url/{{{SITEMAP_NAMESPACE}}}loc"
    old_urls = [node.text for node in old_sitemap_root.findall(sitemap_path)]
    astro_urls = [node.text for node in astro_sitemap_root.findall(sitemap_path)]
    sitemap_url_set_match = set(old_urls) == set(astro_urls)
    sitemap_order_match = old_urls == astro_urls
    sitemap_match = normalize_line_endings(old_sitemap) == normalize_line_endings(astro_sitemap)
    old_robots = (ROOT / "robots.txt").read_bytes()
    astro_robots = (DIST / "robots.txt").read_bytes()
    if not sitemap_match:
        failures.append({"category": "sitemap"})
    if not sitemap_url_set_match:
        failures.append({"category": "sitemap_url_set"})
    if not sitemap_order_match:
        failures.append({"category": "sitemap_order"})
    if old_robots != astro_robots:
        failures.append({"category": "robots"})

    report = {
        "route_count": checked,
        "article_count": len(articles),
        "asset_and_content_files": asset_checks,
        "http_status_counts": status_counts,
        "sitemap_match": sitemap_match,
        "sitemap_line_endings_identical": old_sitemap == astro_sitemap,
        "sitemap_url_count": len(astro_urls),
        "sitemap_url_set_match": sitemap_url_set_match,
        "sitemap_order_match": sitemap_order_match,
        "robots_match": old_robots == astro_robots,
        "failure_count": len(failures),
        "failures": failures,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()